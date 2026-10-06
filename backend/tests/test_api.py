import pytest
from fastapi.testclient import TestClient

from backend.app.main import app


@pytest.fixture(scope="module")
def client():
    return TestClient(app)


def test_health(client):
    r = client.get("/health")
    assert r.status_code == 200
    assert r.json()["status"] == "ok"


def test_predict_known_cell(client):
    r = client.get("/api/v1/predict", params={"cell_id": 1241, "date": "2024-09-13"})
    assert r.status_code == 200
    d = r.json()
    assert 0.0 <= d["risk_probability"] <= 1.0
    assert d["risk_level"] in ("Low", "Medium", "High")
    assert len(d["top_factors"]) == 5
    assert "disclaimer" in d


def test_predict_invalid_date_returns_404(client):
    r = client.get("/api/v1/predict", params={"cell_id": 1241, "date": "2020-01-01"})
    assert r.status_code == 404


def test_risk_map_shape_and_levels(client):
    r = client.get("/api/v1/risk-map", params={"date": "2024-09-13"})
    assert r.status_code == 200
    d = r.json()
    assert len(d["cells"]) == 1621
    assert sum(d["summary"].values()) == 1621
    for c in d["cells"][:50]:
        assert 0.0 <= c["risk_probability"] <= 1.0
        assert c["risk_level"] in ("Low", "Medium", "High")


def test_dry_day_has_low_probabilities(client):
    # 23 Sep 2024 pe cell 403 par 0 mm barish thi
    r = client.get("/api/v1/predict", params={"cell_id": 403, "date": "2024-09-23"})
    assert r.status_code == 200
    assert r.json()["risk_probability"] < 0.01


def test_simulation_more_rain_more_risk(client):
    body = {"cell_id": 1241, "date": "2024-09-13", "rain_multiplier": 2}
    r = client.post("/api/v1/simulations", json=body)
    assert r.status_code == 200
    d = r.json()
    assert d["scenario_probability"] > d["original_probability"]
    assert d["scenario_rain_mm"] == pytest.approx(d["original_rain_mm"] * 2, rel=1e-3)


def test_simulation_zero_rain_less_risk(client):
    body = {"cell_id": 1241, "date": "2024-09-13", "rain_multiplier": 0}
    r = client.post("/api/v1/simulations", json=body)
    assert r.status_code == 200
    d = r.json()
    assert d["scenario_probability"] < d["original_probability"]


def test_simulation_rejects_out_of_range_multiplier(client):
    body = {"cell_id": 1241, "date": "2024-09-13", "rain_multiplier": 10}
    r = client.post("/api/v1/simulations", json=body)
    assert r.status_code == 400