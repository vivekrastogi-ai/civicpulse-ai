import os
import smtplib
import time
from email.message import EmailMessage

from apscheduler.schedulers.background import BackgroundScheduler

from db import mdb

_sched = None


def send_mail(to: str, subject: str, body: str):
    user = os.environ.get("SMTP_USER")
    pw = os.environ.get("SMTP_PASSWORD")
    if not user or not pw:
        print("SMTP set nahi hai, email skip")
        return False
    msg = EmailMessage()
    msg["From"], msg["To"], msg["Subject"] = user, to, subject
    msg.set_content(body)
    with smtplib.SMTP_SSL("smtp.gmail.com", 465, timeout=20) as s:
        s.login(user, pw)
        s.send_message(msg)
    return True


def check_all(checker):
    """checker(cell_id, date, time_hhmm) -> dict with alert/message."""
    import datetime as dt
    today = dt.date.today().isoformat()
    db = mdb()
    for r in db.reminders.find({}):
        if r.get("last_sent") == today:
            continue
        # jaane se 2 ghante pehle tak ke window mein hi bhejo
        h, m = map(int, r["time"].split(":"))
        now = dt.datetime.now()
        mins_left = (h * 60 + m) - (now.hour * 60 + now.minute)
        if not (0 <= mins_left <= 120):
            continue
        try:
            c = checker(r["cell_id"], today, r["time"])
        except Exception as e:
            print("Reminder check fail:", e)
            continue
        if not c.get("alert"):
            continue
        from bson import ObjectId
        user = db.users.find_one({"_id": ObjectId(r["user_id"])})
        if not user:
            continue
        ok = send_mail(
            user["email"],
            f"CivicPulse AI: {r['label']} ({r['place_name']}) par barish ka risk",
            f"{c['message']}\n\nYe model ka estimate hai, emergency alert nahi. Zaroorat par 112.",
        )
        if ok:
            db.reminders.update_one({"_id": r["_id"]}, {"$set": {"last_sent": today}})


def start(checker):
    global _sched
    if _sched:
        return
    _sched = BackgroundScheduler()
    _sched.add_job(lambda: check_all(checker), "interval", minutes=10, id="reminders")
    _sched.start()
    