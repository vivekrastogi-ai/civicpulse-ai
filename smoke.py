import datetime as dt
import requests

B = "http://127.0.0.1:8000"
today = dt.date.today().isoformat()
tests = [
    ("health", "GET", "/health", None),
    ("risk-map (2024 demo)", "GET", "/api/v1/risk-map?date=2024-09-13", None),
    ("predict", "GET", "/api/v1/predict?cell_id=1241&date=2024-09-13", None),
    ("search", "GET", "/api/v1/search?q=Rohini", None),
    ("simulation", "POST", "/api/v1/simulations", {"cell_id": 1241, "date": "2024-09-13", "rain_multiplier": 2}),
    ("assistant", "POST", "/api/v1/assistant/chat", {"cell_id": 1241, "date": "2024-09-13", "question": "kyun risk high hai?"}),
    ("live risk-map (aaj)", "GET", f"/api/v1/risk-map?date={today}", None),
    ("timeline", "GET", "/api/v1/timeline?cell_id=1501", None),
    ("feedback list", "GET", "/api/v1/feedback", None),
    ("reports list", "GET", "/api/v1/reports?cell_id=1241", None),
    ("oauth providers", "GET", "/api/v1/auth/oauth/providers", None),
    ("admin (bina login, 401 aana chahiye)", "GET", "/api/v1/admin/summary", None),
]
for name, m, path, body in tests:
    try:
        r = requests.request(m, B + path, json=body, timeout=150)
        ok = r.status_code == (401 if "admin" in name else 200)
        print(("OK  " if ok else "FAIL"), name, r.status_code, "" if ok else r.text[:150])
    except Exception as e:
        print("FAIL", name, e)