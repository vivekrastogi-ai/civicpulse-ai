
import os
import certifi

from dotenv import load_dotenv
from fastapi import HTTPException
from pymongo import MongoClient

ROOT = os.path.abspath(
    os.path.join(os.path.dirname(__file__), "..", "..")
)

load_dotenv(os.path.join(ROOT, ".env"))

_client = None


def mdb():
    global _client

    if _client is None:
        uri = os.environ.get("MONGODB_URI")

        if not uri:
            raise HTTPException(
                status_code=503,
                detail="Database set nahi hai (MONGODB_URI)."
            )

        try:
            _client = MongoClient(
                uri,
                tls=True,
                tlsCAFile=certifi.where(),
                serverSelectionTimeoutMS=15000,
                connectTimeoutMS=20000,
                socketTimeoutMS=20000
            )

            # Verify MongoDB connection
            _client.admin.command("ping")

        except Exception as e:
            _client = None
            print(f"MongoDB Connection Error: {type(e).__name__}: {e}")

            raise HTTPException(
                status_code=503,
                detail="Database connection failed. Check MongoDB configuration."
            )

    return _client["civicpulse"]
