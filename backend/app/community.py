import os
import time
from fastapi import Depends
from auth import require_admin

from bson import ObjectId
from fastapi import APIRouter, Header, HTTPException, Request
from pydantic import BaseModel, Field
from pymongo import DESCENDING

from db import mdb

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
        raise HTTPException(429, "Thoda ruko, kuch second baad dobara bhejo.")
    _last_post[ip] = now


class ReportIn(BaseModel):
    cell_id: int
    place_name: str | None = Field(default=None, max_length=120)
    kind: str
    text: str = Field(min_length=3, max_length=500)
    author: str | None = Field(default=None, max_length=40)


class FeedbackIn(BaseModel):
    rating: int = Field(ge=1, le=5)
    message: str | None = Field(default=None, max_length=1000)


class StatusIn(BaseModel):
    status: str | None = None
    hidden: bool | None = None
    note: str | None = Field(default=None, max_length=300)


from auth import optional_user


@router.post("/api/v1/reports")
def add_report(r: ReportIn, request: Request, user: dict | None = Depends(optional_user)):
    if r.kind not in KINDS:
        raise HTTPException(400, "Galat report type.")
    check_rate(request)
    doc = {
        "cell_id": r.cell_id,
        "place_name": r.place_name,
        "kind": r.kind,
        "text": r.text.strip(),
        "author": (user["name"] if user else (r.author or "Anonymous")).strip() or "Anonymous",
        "user_id": str(user["_id"]) if user else None,
        "user_email": user["email"] if user else None,
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
    return {
        "unverified": True,
        "note": "Ye logon ke comments hain, verified nahi hain.",
        "reports": items,
    }


@router.post("/api/v1/feedback")
def add_feedback(f: FeedbackIn, request: Request):
    check_rate(request, 5)
    mdb().feedback.insert_one(
        {"rating": f.rating, "message": (f.message or "").strip(), "created_at": int(time.time())}
    )
    return {"ok": True, "thanks": "Feedback ke liye shukriya!"}


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
            raise HTTPException(400, "Galat status.")
        upd["status"] = body.status
    if body.hidden is not None:
        upd["hidden"] = body.hidden
    if body.note is not None:
        upd["note"] = body.note
    if not upd:
        raise HTTPException(400, "Kuch badalne ko nahi diya.")
    res = mdb().reports.update_one({"_id": ObjectId(rid)}, {"$set": upd})
    if res.matched_count == 0:
        raise HTTPException(404, "Report nahi mila.")
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