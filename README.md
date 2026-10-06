# CivicPulse AI

Urban waterlogging risk prediction and explanation platform for Delhi (NCT).

> **Prototype / decision-support demo. NOT an emergency warning system.**
> The model is trained on **SYNTHETIC incident data**. Metrics shown here
> do NOT represent real-world predictive accuracy.

## What it does

- Divides Delhi into 1,621 grid cells (1 km x 1 km)
- Predicts daily waterlogging risk for each cell (monsoon, June-September)
- Explains each prediction with SHAP (top contributing factors)
- Interactive risk map with date picker
- What-if simulation: scale rainfall and see how risk changes

## Architecture

Data (Open-Meteo rainfall, elevation, OpenStreetMap) -> feature engineering
-> XGBoost + isotonic calibration -> SHAP -> FastAPI -> Next.js + Leaflet map

## Tech stack

Python, Pandas, GeoPandas, XGBoost, scikit-learn, SHAP, FastAPI, pytest,
Next.js, React, Tailwind CSS, Leaflet, OpenStreetMap.

## Data

| Source | Used for |
|---|---|
| Open-Meteo Archive (ERA5) | Hourly rainfall, temperature, humidity, wind (2018-2024) |
| Open-Meteo Elevation | Cell elevation |
| OpenStreetMap (osmnx) | Roads, waterways, tunnels/underpasses |
| **Synthetic generator** | Waterlogging incidents (no public clean dataset exists for Delhi) |

## Model

- Time-based split: train 2018-2022, validation 2023, test 2024
- Baseline: Logistic Regression. Candidate: XGBoost + isotonic calibration
- Test (2024) PR-AUC: ~0.17-0.19 (random guess: 0.008). Positive rate 0.78%.
- **These numbers reflect the synthetic generating rules, not real waterlogging.**

## Limitations

- Incidents are synthetic; the model learned the generator's rules.
- Rainfall resolution is ~10 km, so neighbouring cells share rainfall.
- Temperature/humidity are rainfall proxies, not causes.
- Map risk levels are relative to the selected day; probability is absolute.
- What-if is unreliable outside the rainfall range seen in training.
- Daily resolution only; no live data.

## Run locally

```bash
python -m venv venv
venv\Scripts\activate
pip install -r requirements.txt

# Backend
python -m uvicorn backend.app.main:app --reload

# Frontend (new terminal)
cd frontend
npm install
npm run dev
```

Open http://localhost:3000 (API docs: http://127.0.0.1:8000/docs).

Data files are not in git. Regenerate them by running the scripts in
`ml/preprocessing/` in numeric order (01 to 07), then `ml/training/09_train_model.py`.

## Tests

```bash
python -m pytest backend/tests -v
```