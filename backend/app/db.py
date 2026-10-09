import os

from dotenv import load_dotenv
from fastapi import HTTPException
from pymongo import MongoClient

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
load_dotenv(os.path.join(ROOT, ".env"))

_client = None


def mdb():
    global _client
    if _client is None:
        uri = os.environ.get("MONGODB_URI")
        if not uri:
            raise HTTPException(503, "Database set nahi hai (MONGODB_URI).")
        _client = MongoClient(uri, serverSelectionTimeoutMS=5000)
    return _client["civicpulse"]