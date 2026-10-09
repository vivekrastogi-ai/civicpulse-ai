import hashlib
import hmac
import os
import re
import secrets
import time

import jwt
from bson import ObjectId
from fastapi import APIRouter, Depends, Header, HTTPException
from pydantic import BaseModel, Field

from db import mdb

router = APIRouter()
EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
TOKEN_DAYS = 7


def hash_pw(pw: str) -> str:
    salt = secrets.token_bytes(16)
    h = hashlib.scrypt(pw.encode(), salt=salt, n=2**14, r=8, p=1)
    return salt.hex() + ":" + h.hex()


def check_pw(pw: str, stored: str) -> bool:
    try:
        salt_hex, h_hex = stored.split(":")
        h = hashlib.scrypt(pw.encode(), salt=bytes.fromhex(salt_hex), n=2**14, r=8, p=1)
        return hmac.compare_digest(h.hex(), h_hex)
    except Exception:
        return False


def secret() -> str:
    s = os.environ.get("JWT_SECRET")
    if not s or len(s) < 20:
        raise HTTPException(503, "JWT_SECRET .env mein set karo (kam se kam 20 akshar).")
    return s


def make_token(user: dict) -> str:
    payload = {"sub": str(user["_id"]), "role": user["role"],
               "exp": int(time.time()) + TOKEN_DAYS * 86400}
    return jwt.encode(payload, secret(), algorithm="HS256")


def public(user: dict) -> dict:
    return {"id": str(user["_id"]), "name": user["name"], "email": user["email"],
            "role": user["role"], "tour_done": user.get("tour_done", False)}


def ensure_admin():
    """.env ke ADMIN_EMAIL/ADMIN_PASSWORD se admin account banao (agar nahi hai)."""
    email = (os.environ.get("ADMIN_EMAIL") or "").lower().strip()
    pw = os.environ.get("ADMIN_PASSWORD")
    if not email or not pw:
        return
    users = mdb().users
    if not users.find_one({"email": email}):
        users.insert_one({"name": "Admin", "email": email, "password": hash_pw(pw),
                          "role": "admin", "tour_done": False, "created_at": int(time.time())})


def current_user(authorization: str | None = Header(default=None)) -> dict:
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(401, "Pehle login karo.")
    try:
        data = jwt.decode(authorization[7:], secret(), algorithms=["HS256"])
    except Exception:
        raise HTTPException(401, "Login expire ho gaya, dobara login karo.")
    user = mdb().users.find_one({"_id": ObjectId(data["sub"])})
    if not user:
        raise HTTPException(401, "User nahi mila.")
    return user

def optional_user(authorization: str | None = Header(default=None)):
    """Login ho toh user, nahi toh None (anonymous bhi report kar sake)."""
    if not authorization:
        return None
    try:
        return current_user(authorization)
    except HTTPException:
        return None

def require_admin(user: dict = Depends(current_user)) -> dict:
    if user["role"] != "admin":
        raise HTTPException(403, "Sirf admin ke liye.")
    return user


class RegisterIn(BaseModel):
    name: str = Field(min_length=2, max_length=60)
    email: str = Field(max_length=120)
    password: str = Field(min_length=6, max_length=100)


class LoginIn(BaseModel):
    email: str
    password: str


@router.post("/api/v1/auth/register")
def register(b: RegisterIn):
    email = b.email.lower().strip()
    if not EMAIL_RE.match(email):
        raise HTTPException(400, "Email sahi nahi hai.")
    ensure_admin()
    if mdb().users.find_one({"email": email}):
        raise HTTPException(409, "Ye email pehle se registered hai.")
    doc = {"name": b.name.strip(), "email": email, "password": hash_pw(b.password),
           "role": "user", "tour_done": False, "created_at": int(time.time())}
    doc["_id"] = mdb().users.insert_one(doc).inserted_id
    return {"token": make_token(doc), "user": public(doc)}


@router.post("/api/v1/auth/login")
def login(b: LoginIn):
    ensure_admin()
    user = mdb().users.find_one({"email": b.email.lower().strip()})
    if not user or not check_pw(b.password, user["password"]):
        raise HTTPException(401, "Email ya password galat hai.")
    return {"token": make_token(user), "user": public(user)}


@router.get("/api/v1/auth/me")
def me(user: dict = Depends(current_user)):
    return public(user)


@router.post("/api/v1/auth/tour-done")
def tour_done(user: dict = Depends(current_user)):
    mdb().users.update_one({"_id": user["_id"]}, {"$set": {"tour_done": True}})
    return {"ok": True}