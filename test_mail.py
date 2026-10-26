import sys
sys.path.insert(0, "backend/app")
from dotenv import load_dotenv
load_dotenv()
import notifier

ok = notifier.send_mail(
    "rastogivivek067@gmail.com",
    "CivicPulse test",
    "Test: reminder email chal raha hai.",
)
print("Bheja:", ok)