import math
import os
import time
import uuid
from functools import lru_cache

import requests
from bson import ObjectId
from fastapi import APIRouter, Depends, File, HTTPException, Request, UploadFile
from pydantic import BaseModel, Field
from pymongo import DESCENDING

from auth import optional_user, require_admin
from db import mdb

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
UPLOAD_DIR = os.path.join(ROOT, "backend", "uploads")
os.makedirs(UPLOAD_DIR, exist_ok=True)

router = APIRouter()
_last_post = {}

KINDS = {"waterlogging", "drain_blocked", "traffic", "all_clear", "other"}
STATUSES = ["new", "forwarded", "in_progress", "resolved"]


def clean(d):
    d["id"] = str(d.pop("_id"))
    return d


def check_rate(request: Request, seconds: int = 10):
    ip = request.client.host if request.client else "x"
    now = time.time()
    if now - _last_post.get(ip, 0) < seconds:
        raise HTTPException(429, "Please wait a few seconds before sending again.")
    _last_post[ip] = now


def need_user(user: dict | None) -> dict:
    if not user:
        raise HTTPException(401, "Please log in first.")
    return user


class ReportIn(BaseModel):
    cell_id: int
    place_name: str | None = Field(default=None, max_length=120)
    kind: str
    text: str = Field(min_length=3, max_length=500)
    author: str | None = Field(default=None, max_length=40)
    photo: str | None = Field(default=None, max_length=100)


class FeedbackIn(BaseModel):
    rating: int = Field(ge=1, le=5)
    message: str | None = Field(default=None, max_length=1000)


class StatusIn(BaseModel):
    status: str | None = None
    hidden: bool | None = None
    verified: bool | None = None
    note: str | None = Field(default=None, max_length=300)


@router.post("/api/v1/reports")
def add_report(r: ReportIn, request: Request, user: dict | None = Depends(optional_user)):
    if r.kind not in KINDS:
        raise HTTPException(400, "Invalid report type.")
    check_rate(request)
    photo = None
    if r.photo:
        name = r.photo.replace("/uploads/", "")
        if not user or not mdb().uploads.find_one({"name": name, "user_id": str(user["_id"])}):
            raise HTTPException(400, "Invalid photo. Please upload it again.")
        photo = r.photo
    doc = {
        "cell_id": r.cell_id,
        "place_name": r.place_name,
        "kind": r.kind,
        "text": r.text.strip(),
        "author": (user["name"] if user else (r.author or "Anonymous")).strip() or "Anonymous",
        "user_id": str(user["_id"]) if user else None,
        "user_email": user["email"] if user else None,
        "photo": photo,
        "status": "new",
        "hidden": False,
        "note": None,
        "created_at": int(time.time()),
    }
    res = mdb().reports.insert_one(doc)
    doc["_id"] = res.inserted_id
    doc.pop("user_email", None)
    return clean(doc)


@router.get("/api/v1/reports")
def list_reports(cell_id: int, limit: int = 20):
    rows = (
        mdb().reports.find({"cell_id": cell_id, "hidden": {"$ne": True}})
        .sort("created_at", DESCENDING)
        .limit(min(limit, 50))
    )
    items = [clean(r) for r in rows]
    for it in items:
        it.pop("user_email", None)
        it.pop("user_id", None)
        it.pop("help_info", None)
        it["has_photo"] = bool(it.pop("photo", None))
    return {
        "unverified": True,
        "note": "These are community comments and are not verified.",
        "reports": items,
    }


@router.post("/api/v1/feedback")
def add_feedback(f: FeedbackIn, request: Request, user: dict | None = Depends(optional_user)):
    check_rate(request, 5)
    mdb().feedback.insert_one({
        "rating": f.rating,
        "message": (f.message or "").strip(),
        "name": user["name"] if user else "Anonymous",
        "created_at": int(time.time()),
    })
    return {"ok": True, "thanks": "Thank you for your feedback!"}


@router.get("/api/v1/feedback")
def list_feedback(limit: int = 30):
    db = mdb()
    rows = db.feedback.find().sort("created_at", DESCENDING).limit(min(limit, 100))
    items = [{"id": str(r["_id"]), "name": r.get("name", "Anonymous"), "rating": r["rating"],
              "message": r.get("message", ""), "created_at": r["created_at"]} for r in rows]
    agg = list(db.feedback.aggregate([{"$group": {"_id": None, "n": {"$sum": 1}, "a": {"$avg": "$rating"}}}]))
    return {"count": agg[0]["n"] if agg else 0,
            "avg": round(agg[0]["a"], 2) if agg else None, "items": items}


# ---------------- Admin ----------------
@router.get("/api/v1/admin/reports")
def admin_reports(status: str | None = None, kind: str | None = None,
                  limit: int = 100, admin: dict = Depends(require_admin)):
    q = {}
    if status:
        q["status"] = status
    if kind:
        q["kind"] = kind
    rows = mdb().reports.find(q).sort("created_at", DESCENDING).limit(min(limit, 300))
    return {"statuses": STATUSES, "reports": [clean(r) for r in rows]}


@router.patch("/api/v1/admin/reports/{rid}")
def admin_update(rid: str, body: StatusIn, admin: dict = Depends(require_admin)):
    upd = {}
    if body.status is not None:
        if body.status not in STATUSES:
            raise HTTPException(400, "Invalid status.")
        upd["status"] = body.status
    if body.hidden is not None:
        upd["hidden"] = body.hidden
    if body.note is not None:
        upd["note"] = body.note
    if body.verified is not None:
        upd["verified"] = body.verified
    if not upd:
        raise HTTPException(400, "Nothing to update.")
    res = mdb().reports.update_one({"_id": ObjectId(rid)}, {"$set": upd})
    if res.matched_count == 0:
        raise HTTPException(404, "Report not found.")
    return {"ok": True}


@router.get("/api/v1/admin/hotspots")
def admin_hotspots(admin: dict = Depends(require_admin)):
    pipe = [
        {"$match": {"hidden": {"$ne": True}, "kind": {"$ne": "all_clear"}}},
        {"$group": {"_id": {"cell": "$cell_id", "place": "$place_name"},
                    "n": {"$sum": 1}, "users": {"$addToSet": "$user_email"}}},
        {"$sort": {"n": -1}},
        {"$limit": 15},
    ]
    return [{"cell_id": x["_id"]["cell"], "place_name": x["_id"]["place"],
             "reports": x["n"], "reporters": len([u for u in x["users"] if u])}
            for x in mdb().reports.aggregate(pipe)]


@router.get("/api/v1/admin/summary")
def admin_summary(admin: dict = Depends(require_admin)):
    db = mdb()
    by_status = {x["_id"]: x["n"] for x in db.reports.aggregate(
        [{"$group": {"_id": "$status", "n": {"$sum": 1}}}])}
    by_kind = {x["_id"]: x["n"] for x in db.reports.aggregate(
        [{"$group": {"_id": "$kind", "n": {"$sum": 1}}}])}
    fb = list(db.feedback.aggregate([{"$group": {"_id": None, "n": {"$sum": 1}, "a": {"$avg": "$rating"}}}]))
    return {
        "total_reports": db.reports.count_documents({}),
        "total_users": db.users.count_documents({"role": "user"}),
        "by_status": by_status,
        "by_kind": by_kind,
        "feedback_count": fb[0]["n"] if fb else 0,
        "feedback_avg": round(fb[0]["a"], 2) if fb else None,
    }


@router.post("/api/v1/admin/export-incidents")
def export_incidents(admin: dict = Depends(require_admin)):
    """Build a real-incidents CSV from verified waterlogging reports."""
    import datetime as dt
    import pandas as pd

    static = pd.read_csv(os.path.join(ROOT, "ml", "data", "processed", "cell_static_features.csv"))
    pos = static.set_index("cell_id")[["lat", "lon"]]
    rows = []
    seen = set()
    for r in mdb().reports.find({"verified": True, "kind": "waterlogging"}):
        d = dt.datetime.fromtimestamp(r["created_at"]).date().isoformat()
        key = (r["cell_id"], d)
        if key in seen or r["cell_id"] not in pos.index:
            continue
        seen.add(key)
        rows.append({"date": d, "cell_id": r["cell_id"],
                     "lat": float(pos.loc[r["cell_id"], "lat"]),
                     "lon": float(pos.loc[r["cell_id"], "lon"]),
                     "severity": "reported", "source": "verified_report"})
    out = os.path.join(ROOT, "ml", "data", "raw", "incidents_real.csv")
    pd.DataFrame(rows, columns=["date", "cell_id", "lat", "lon", "severity", "source"]).to_csv(out, index=False)
    return {"saved": len(rows), "path": "ml/data/raw/incidents_real.csv"}


@router.get("/api/v1/my-reports")
def my_reports(user: dict | None = Depends(optional_user), limit: int = 50):
    user = need_user(user)
    rows = (
        mdb().reports.find({"user_id": str(user["_id"])})
        .sort("created_at", DESCENDING)
        .limit(min(limit, 100))
    )
    items = []
    for r in rows:
        r = clean(r)
        r.pop("user_email", None)
        r.pop("user_id", None)
        items.append(r)
    return {"reports": items}


@router.get("/api/v1/public-stats")
def public_stats():
    db = mdb()
    fb = list(db.feedback.aggregate([{"$group": {"_id": None, "n": {"$sum": 1}, "a": {"$avg": "$rating"}}}]))
    return {
        "users": db.users.count_documents({}),
        "reports": db.reports.count_documents({"hidden": {"$ne": True}}),
        "resolved": db.reports.count_documents({"status": "resolved", "hidden": {"$ne": True}}),
        "verified": db.reports.count_documents({"verified": True, "hidden": {"$ne": True}}),
        "feedback_count": fb[0]["n"] if fb else 0,
        "feedback_avg": round(fb[0]["a"], 2) if fb else None,
    }


# ---------------- Reminders ----------------
class ReminderIn(BaseModel):
    label: str = Field(max_length=40)
    place_name: str = Field(max_length=120)
    cell_id: int
    time: str = Field(pattern=r"^\d{2}:\d{2}$")


@router.post("/api/v1/reminders")
def add_reminder(r: ReminderIn, user: dict | None = Depends(optional_user)):
    user = need_user(user)
    n = mdb().reminders.count_documents({"user_id": str(user["_id"])})
    if n >= 5:
        raise HTTPException(400, "Maximum 5 reminders.")
    doc = {"user_id": str(user["_id"]), **r.model_dump(), "created_at": int(time.time())}
    res = mdb().reminders.insert_one(doc)
    doc["_id"] = res.inserted_id
    d = clean(doc)
    d.pop("user_id", None)
    return d


@router.get("/api/v1/reminders")
def list_reminders(user: dict | None = Depends(optional_user)):
    user = need_user(user)
    out = []
    for r in mdb().reminders.find({"user_id": str(user["_id"])}):
        r = clean(r)
        r.pop("user_id", None)
        out.append(r)
    return out


@router.delete("/api/v1/reminders/{rid}")
def del_reminder(rid: str, user: dict | None = Depends(optional_user)):
    user = need_user(user)
    mdb().reminders.delete_one({"_id": ObjectId(rid), "user_id": str(user["_id"])})
    return {"ok": True}


# ---------------- Admin analytics ----------------
@router.get("/api/v1/admin/trend")
def admin_trend(days: int = 14, admin: dict = Depends(require_admin)):
    import datetime as dt
    since = int(time.time()) - days * 86400
    out = {}
    for r in mdb().reports.find({"created_at": {"$gte": since}}, {"created_at": 1}):
        d = dt.datetime.fromtimestamp(r["created_at"]).date().isoformat()
        out[d] = out.get(d, 0) + 1
    series = []
    for i in range(days - 1, -1, -1):
        d = (dt.date.today() - dt.timedelta(days=i)).isoformat()
        series.append({"date": d, "reports": out.get(d, 0)})
    return series


@router.get("/api/v1/admin/users")
def admin_users(admin: dict = Depends(require_admin)):
    db = mdb()
    counts = {x["_id"]: x["n"] for x in db.reports.aggregate(
        [{"$group": {"_id": "$user_id", "n": {"$sum": 1}}}])}
    out = []
    for u in db.users.find().sort("created_at", DESCENDING).limit(200):
        uid = str(u["_id"])
        out.append({"id": uid, "name": u["name"], "email": u["email"], "role": u["role"],
                    "provider": u.get("provider", "email"), "reports": counts.get(uid, 0),
                    "created_at": u.get("created_at", 0)})
    return out


class BulkIn(BaseModel):
    ids: list[str]
    status: str | None = None
    verified: bool | None = None
    hidden: bool | None = None


@router.post("/api/v1/admin/bulk")
def admin_bulk(b: BulkIn, admin: dict = Depends(require_admin)):
    upd = {}
    if b.status is not None:
        if b.status not in STATUSES:
            raise HTTPException(400, "Invalid status.")
        upd["status"] = b.status
    if b.verified is not None:
        upd["verified"] = b.verified
    if b.hidden is not None:
        upd["hidden"] = b.hidden
    if not upd or not b.ids:
        raise HTTPException(400, "Nothing to update.")
    res = mdb().reports.update_many({"_id": {"$in": [ObjectId(i) for i in b.ids]}}, {"$set": upd})
    return {"updated": res.modified_count}


# ---------------- Photo upload ----------------
@router.post("/api/v1/uploads")
async def upload_photo(file: UploadFile = File(...), user: dict | None = Depends(optional_user)):
    user = need_user(user)
    db = mdb()
    recent = db.uploads.count_documents({"user_id": str(user["_id"]), "created_at": {"$gte": int(time.time()) - 3600}})
    if recent >= 10:
        raise HTTPException(429, "You can upload at most 10 photos per hour.")
    data = await file.read()
    if len(data) > 3 * 1024 * 1024:
        raise HTTPException(413, "The photo must be smaller than 3 MB.")
    if data[:3] == b"\xff\xd8\xff":
        ext = "jpg"
    elif data[:8] == b"\x89PNG\r\n\x1a\n":
        ext = "png"
    elif data[:4] == b"RIFF" and data[8:12] == b"WEBP":
        ext = "webp"
    else:
        raise HTTPException(400, "Only JPG, PNG or WEBP photos are allowed.")
    name = f"{uuid.uuid4().hex}.{ext}"
    with open(os.path.join(UPLOAD_DIR, name), "wb") as f:
        f.write(data)
    db.uploads.insert_one({"name": name, "user_id": str(user["_id"]), "created_at": int(time.time())})
    return {"url": f"/uploads/{name}"}


# ---------------- Nearby help centers ----------------
@lru_cache(maxsize=1)
def _cells():
    import pandas as pd
    df = pd.read_csv(os.path.join(ROOT, "ml", "data", "processed", "cell_static_features.csv"))
    return df.set_index("cell_id")[["lat", "lon"]]


def _km(lat1, lon1, lat2, lon2):
    p = math.pi / 180
    a = (math.sin((lat2 - lat1) * p / 2) ** 2
         + math.cos(lat1 * p) * math.cos(lat2 * p) * math.sin((lon2 - lon1) * p / 2) ** 2)
    return 12742 * math.asin(math.sqrt(a))


TYPE_LABEL = {"hospital": "Hospital", "police": "Police station", "fire_station": "Fire station"}


def find_centers(lat: float, lon: float, radius: int = 3000):
    q = (
        "[out:json][timeout:25];("
        f'node["amenity"~"^(hospital|police|fire_station)$"](around:{radius},{lat},{lon});'
        f'way["amenity"~"^(hospital|police|fire_station)$"](around:{radius},{lat},{lon});'
        ");out center 40;"
    )
    try:
        r = requests.post("https://overpass-api.de/api/interpreter", data={"data": q},
                          headers={"User-Agent": "civicpulse-ai-demo"}, timeout=30)
        els = r.json().get("elements", [])
    except Exception as e:
        print("Overpass error:", e)
        raise HTTPException(503, "Nearby centers are unavailable right now. Please try again shortly.")
    out = []
    for e in els:
        t = e.get("tags", {})
        la = e.get("lat") or (e.get("center") or {}).get("lat")
        lo = e.get("lon") or (e.get("center") or {}).get("lon")
        if la is None or lo is None:
            continue
        out.append({
            "name": t.get("name:en") or t.get("name") or TYPE_LABEL.get(t.get("amenity"), "Center"),
            "type": TYPE_LABEL.get(t.get("amenity"), "Center"),
            "distance_km": round(_km(lat, lon, la, lo), 2),
            "phone": t.get("phone") or t.get("contact:phone"),
            "lat": la, "lon": lo,
        })
    out.sort(key=lambda x: x["distance_km"])
    return out[:10]


@router.get("/api/v1/admin/reports/{rid}/help-centers")
def report_help_centers(rid: str, admin: dict = Depends(require_admin)):
    rep = mdb().reports.find_one({"_id": ObjectId(rid)})
    if not rep:
        raise HTTPException(404, "Report not found.")
    c = _cells()
    if rep["cell_id"] not in c.index:
        raise HTTPException(404, "Location for this report was not found.")
    lat, lon = float(c.loc[rep["cell_id"], "lat"]), float(c.loc[rep["cell_id"], "lon"])
    return {"centers": find_centers(lat, lon),
            "note": "Data comes from OpenStreetMap and may be incomplete or outdated. Verify phone numbers before sending."}


class HelpIn(BaseModel):
    note: str = Field(default="", max_length=400)
    centers: list[dict]


@router.post("/api/v1/admin/reports/{rid}/send-help")
def send_help(rid: str, b: HelpIn, admin: dict = Depends(require_admin)):
    rep = mdb().reports.find_one({"_id": ObjectId(rid)})
    if not rep:
        raise HTTPException(404, "Report not found.")
    clean_centers = []
    for c in b.centers[:6]:
        clean_centers.append({
            "name": str(c.get("name", ""))[:100], "type": str(c.get("type", ""))[:30],
            "distance_km": float(c.get("distance_km", 0)),
            "phone": str(c["phone"])[:40] if c.get("phone") else None,
            "lat": float(c.get("lat", 0)), "lon": float(c.get("lon", 0)),
        })
    info = {"note": b.note.strip(), "centers": clean_centers, "sent_at": int(time.time())}
    upd = {"help_info": info}
    if rep.get("status") == "new":
        upd["status"] = "forwarded"
    mdb().reports.update_one({"_id": rep["_id"]}, {"$set": upd})
    emailed = False
    if rep.get("user_email"):
        try:
            from notifier import send_mail
            lines = [f"- {c['type']}: {c['name']} ({c['distance_km']} km)" + (f", {c['phone']}" if c["phone"] else "")
                     for c in clean_centers]
            body = (f"An admin has sent help information for your report ({rep.get('place_name') or 'your area'}).\n\n"
                    f"{info['note']}\n\nNearby help centers:\n" + "\n".join(lines) +
                    "\n\nIf life is in danger, call 112 immediately.")
            emailed = bool(send_mail(rep["user_email"], "CivicPulse AI: nearby help information", body))
        except Exception as e:
            print("Help mail error:", e)
    return {"ok": True, "emailed": emailed}