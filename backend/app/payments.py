import hashlib
import hmac
import os
import time

import requests
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from backend.app.auth import current_user, is_premium
from backend.app.db import mdb
from auth import current_user, is_premium, require_admin
from bson import ObjectId

router = APIRouter()

# Amount paise mein (9900 = Rs 99). Server hi price tay karta hai, client nahi.
PLANS = {
    "monthly": {"label": "Premium 1 mahina", "amount": 9900, "days": 30},
    "yearly": {"label": "Premium 1 saal", "amount": 79900, "days": 365},
}


def keys():
    kid, sec = os.environ.get("RAZORPAY_KEY_ID"), os.environ.get("RAZORPAY_KEY_SECRET")
    if not kid or not sec:
        raise HTTPException(503, "Payment abhi set nahi hai (Razorpay keys .env mein chahiye).")
    return kid, sec


class OrderIn(BaseModel):
    plan: str


class VerifyIn(BaseModel):
    razorpay_order_id: str
    razorpay_payment_id: str
    razorpay_signature: str


@router.get("/api/v1/billing/plans")
def plans():
    return [{"id": k, "label": v["label"], "price_inr": v["amount"] / 100, "days": v["days"]}
            for k, v in PLANS.items()]


@router.get("/api/v1/billing/status")
def status(user: dict = Depends(current_user)):
    return {"premium": is_premium(user), "premium_until": int(user.get("premium_until", 0))}


@router.post("/api/v1/billing/order")
def create_order(b: OrderIn, user: dict = Depends(current_user)):
    plan = PLANS.get(b.plan)
    if not plan:
        raise HTTPException(400, "Galat plan.")
    kid, sec = keys()
    try:
        r = requests.post(
            "https://api.razorpay.com/v1/orders", auth=(kid, sec), timeout=20,
            json={"amount": plan["amount"], "currency": "INR",
                  "receipt": f"cp_{int(time.time())}", "notes": {"user": str(user["_id"]), "plan": b.plan}},
        )
        data = r.json()
    except Exception as e:
        print("Razorpay error:", e)
        raise HTTPException(503, "Payment service abhi nahi mil rahi, thodi der baad try karo.")
    if r.status_code != 200 or "id" not in data:
        print("Razorpay order fail:", data)
        raise HTTPException(502, "Order nahi ban paya.")
    mdb().orders.insert_one({"order_id": data["id"], "user_id": str(user["_id"]), "plan": b.plan,
                             "amount": plan["amount"], "status": "created", "created_at": int(time.time())})
    return {"order_id": data["id"], "amount": plan["amount"], "currency": "INR", "key_id": kid, "label": plan["label"]}


@router.post("/api/v1/billing/verify")
def verify(b: VerifyIn, user: dict = Depends(current_user)):
    _, sec = keys()
    expected = hmac.new(sec.encode(), f"{b.razorpay_order_id}|{b.razorpay_payment_id}".encode(),
                        hashlib.sha256).hexdigest()
    if not hmac.compare_digest(expected, b.razorpay_signature):
        raise HTTPException(400, "Payment verify nahi hui (signature galat).")
    db = mdb()
    order = db.orders.find_one({"order_id": b.razorpay_order_id, "user_id": str(user["_id"])})
    if not order:
        raise HTTPException(404, "Order nahi mila.")
    if order["status"] == "paid":  # double click par dobara days nahi judenge
        return {"ok": True, "premium_until": int(user.get("premium_until", 0))}
    days = PLANS[order["plan"]]["days"]
    base = max(float(user.get("premium_until", 0)), time.time())
    until = int(base + days * 86400)
    db.users.update_one({"_id": user["_id"]}, {"$set": {"premium_until": until}})
    db.orders.update_one({"_id": order["_id"]}, {"$set": {"status": "paid", "payment_id": b.razorpay_payment_id,
                                                          "paid_at": int(time.time())}})
    return {"ok": True, "premium_until": until}


@router.get("/api/v1/admin/premium")
def admin_premium(admin: dict = Depends(require_admin)):
    db = mdb()
    now = time.time()
    orders = list(db.orders.find({"status": "paid"}).sort("paid_at", -1).limit(200))
    ids = list({o["user_id"] for o in orders})
    users = {str(u["_id"]): u for u in db.users.find({"_id": {"$in": [ObjectId(i) for i in ids]}})}
    payments = []
    for o in orders:
        u = users.get(o["user_id"], {})
        payments.append({
            "order_id": o["order_id"], "payment_id": o.get("payment_id"),
            "name": u.get("name", "Deleted user"), "email": u.get("email", "-"),
            "plan": o["plan"], "amount_inr": o["amount"] / 100, "paid_at": o.get("paid_at", 0),
        })
    active = []
    for u in db.users.find({"premium_until": {"$gt": now}}):
        active.append({"id": str(u["_id"]), "name": u["name"], "email": u["email"],
                       "premium_until": int(u["premium_until"])})
    return {
        "revenue_inr": sum(p["amount_inr"] for p in payments),
        "total_payments": len(payments),
        "active_count": len(active),
        "active": active,
        "payments": payments,
    }


class GrantIn(BaseModel):
    email: str
    days: int = 30


@router.post("/api/v1/admin/premium/grant")
def admin_grant(b: GrantIn, admin: dict = Depends(require_admin)):
    if not 1 <= b.days <= 3650:
        raise HTTPException(400, "Days must be between 1 and 3650.")
    db = mdb()
    u = db.users.find_one({"email": b.email.lower().strip()})
    if not u:
        raise HTTPException(404, "No user with this email.")
    base = max(float(u.get("premium_until", 0)), time.time())
    db.users.update_one({"_id": u["_id"]}, {"$set": {"premium_until": int(base + b.days * 86400)}})
    return {"ok": True}


@router.post("/api/v1/admin/premium/revoke")
def admin_revoke(b: GrantIn, admin: dict = Depends(require_admin)):
    r = mdb().users.update_one({"email": b.email.lower().strip()}, {"$set": {"premium_until": 0}})
    if r.matched_count == 0:
        raise HTTPException(404, "No user with this email.")
    return {"ok": True}