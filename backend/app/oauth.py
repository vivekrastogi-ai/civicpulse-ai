import os
import secrets
import time
from urllib.parse import quote, urlencode

import jwt
import requests
from fastapi import APIRouter, HTTPException
from fastapi.responses import RedirectResponse

from auth import hash_pw, make_token, secret
from db import mdb

router = APIRouter()

PROVIDERS = {
    "google": {
        "auth": "https://accounts.google.com/o/oauth2/v2/auth",
        "token": "https://oauth2.googleapis.com/token",
        "scope": "openid email profile",
    },
    "github": {
        "auth": "https://github.com/login/oauth/authorize",
        "token": "https://github.com/login/oauth/access_token",
        "scope": "read:user user:email",
    },
    "linkedin": {
        "auth": "https://www.linkedin.com/oauth/v2/authorization",
        "token": "https://www.linkedin.com/oauth/v2/accessToken",
        "scope": "openid profile email",
    },
}


def backend_url():
    return os.environ.get("BACKEND_URL", "http://127.0.0.1:8000")


def frontend_url():
    return os.environ.get("FRONTEND_URL", "http://localhost:3000")


def creds(name):
    k = name.upper()
    return os.environ.get(f"{k}_CLIENT_ID"), os.environ.get(f"{k}_CLIENT_SECRET")


def redirect_uri(name):
    return f"{backend_url()}/api/v1/auth/oauth/{name}/callback"


def fail(msg):
    return RedirectResponse(f"{frontend_url()}/login?error={quote(msg)}")


@router.get("/api/v1/auth/oauth/providers")
def providers():
    return {n: all(creds(n)) for n in PROVIDERS}


@router.get("/api/v1/auth/oauth/{provider}/start")
def start(provider: str):
    if provider not in PROVIDERS:
        raise HTTPException(404, "Unknown provider")
    cid, csec = creds(provider)
    if not cid or not csec:
        return fail(f"{provider.title()} login abhi set nahi hai (.env mein keys chahiye).")
    state = jwt.encode(
        {"p": provider, "n": secrets.token_urlsafe(8), "exp": int(time.time()) + 600},
        secret(), algorithm="HS256",
    )
    params = {"client_id": cid, "redirect_uri": redirect_uri(provider),
              "response_type": "code", "scope": PROVIDERS[provider]["scope"], "state": state}
    return RedirectResponse(PROVIDERS[provider]["auth"] + "?" + urlencode(params))


def profile(provider, tok):
    h = {"Authorization": f"Bearer {tok}"}
    if provider == "google":
        d = requests.get("https://openidconnect.googleapis.com/v1/userinfo", headers=h, timeout=15).json()
        return d.get("name") or "Google User", d.get("email") if d.get("email_verified") else None
    if provider == "linkedin":
        d = requests.get("https://api.linkedin.com/v2/userinfo", headers=h, timeout=15).json()
        return d.get("name") or "LinkedIn User", d.get("email") if d.get("email_verified") else None
    h["Accept"] = "application/vnd.github+json"
    u = requests.get("https://api.github.com/user", headers=h, timeout=15).json()
    emails = requests.get("https://api.github.com/user/emails", headers=h, timeout=15).json()
    email = next((e["email"] for e in emails if e.get("primary") and e.get("verified")), None)
    return u.get("name") or u.get("login") or "GitHub User", email


@router.get("/api/v1/auth/oauth/{provider}/callback")
def callback(provider: str, code: str | None = None, state: str | None = None, error: str | None = None):
    if provider not in PROVIDERS:
        raise HTTPException(404, "Unknown provider")
    if error or not code or not state:
        return fail("Login cancel ho gaya.")
    try:
        data = jwt.decode(state, secret(), algorithms=["HS256"])
        if data.get("p") != provider:
            raise ValueError("provider mismatch")
    except Exception:
        return fail("Login session expire ho gaya, dobara try karo.")
    cid, csec = creds(provider)
    try:
        r = requests.post(
            PROVIDERS[provider]["token"],
            data={"grant_type": "authorization_code", "code": code, "client_id": cid,
                  "client_secret": csec, "redirect_uri": redirect_uri(provider)},
            headers={"Accept": "application/json"}, timeout=15,
        )
        tok = r.json().get("access_token")
        if not tok:
            return fail("Provider ne token nahi diya.")
        name, email = profile(provider, tok)
    except Exception as e:
        print("OAuth error:", e)
        return fail("Login nahi ho paya, thodi der baad try karo.")
    if not email:
        return fail("Verified email nahi mila. Doosra tareeka try karo.")
    email = email.lower().strip()
    users = mdb().users
    user = users.find_one({"email": email})
    if user and user["role"] == "admin":
        return fail("Admin account sirf password se login hota hai.")
    if not user:
        doc = {"name": name, "email": email, "password": hash_pw(secrets.token_urlsafe(24)),
               "role": "user", "tour_done": False, "provider": provider,
               "created_at": int(time.time())}
        doc["_id"] = users.insert_one(doc).inserted_id
        user = doc
    return RedirectResponse(f"{frontend_url()}/auth/callback#token={make_token(user)}")