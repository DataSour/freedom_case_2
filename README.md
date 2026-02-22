# freedom_case_2

Full-stack F.I.R.E. hackathon project.

## Overview
- `frontend/`: React + Vite UI
- `backend/`: Go (Gin) API + PostgreSQL + migrations
- `ml/`: ML/AI assets, datasets, and experiments
- `docker-compose.yml`: runs API + DB + migrations + ML service

## Quick Start (Docker)
From repo root:
```
export GROQ_API_KEY=your_key_here

docker compose up --build
```

## Frontend (local)
```
cd frontend
npm install
npm run dev
```

## Backend (local)
```
cd backend
make migrate-up
make run
```

## ML Service (local)
```
cd ml
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
export GROQ_API_KEY=your_key_here
uvicorn api:app --host 0.0.0.0 --port 8000
```

## Environment Variables

### Frontend (`frontend/.env`)
- `VITE_API_BASE_URL` (default `http://localhost:8080`)
- `VITE_ADMIN_KEY` (admin key for protected endpoints)

### Backend (`backend/.env`)
- `PORT` (default `8080`)
- `DATABASE_URL` (required)
- `ADMIN_KEY` (required for admin endpoints)
- `AI_URL` (ML service base URL; default in docker is `http://ml:8000`)
- `GEOCODER_PROVIDER` (default `nominatim`)
- `GEOCODER_USER_AGENT` (default `fire-hackathon-demo`, required by Nominatim)
- `GEOCODER_MIN_INTERVAL_MS` (default `1000`)
- `COUNTRY_DEFAULT` (default `Kazakhstan`)
- `CORS_ALLOWED_ORIGINS` (default `*`)
- `REQUEST_TIMEOUT` (default `30s`)
- `LOG_LEVEL` (default `info`)
- `MAX_UPLOAD_MB` (default `20`)

### ML Service
- `GROQ_API_KEY` (required)

## Key API Endpoints
- `POST /api/import` (multipart: tickets, managers, business_units)
- `POST /api/process`
- `GET /api/runs/latest`
- `GET /api/tickets?status=&office=&language=&q=&limit=&offset=`
- `GET /api/tickets/:id`
- `GET /api/managers?office=&skill=`
- `GET /api/business-units?geocoded=&q=`
- `POST /api/business-units/regeocode` (admin, optional `force=true`)
- `POST /api/tickets/:id/reassign` (admin)
- `POST /api/tickets/:id/resolve` (admin)
- `GET /healthz`

## Manager Load
Manager load is derived by the backend from active assignments (`ASSIGNED`, `IN_PROGRESS`).
The `managers.csv` file no longer includes a `current_load` column.
If a CSV provides load values, they are stored as `baseline_load` and displayed as `baseline + active` in the UI.

## Frontend Map Guidance
To render office locations on a map:
1. Call `GET /api/business-units` and filter to items with `lat` and `lon`.
2. Use Leaflet + OpenStreetMap tiles.
3. For each unit, place a marker and show a popup with office name, address, and `geocode_display_name`.

## ML / Data Assets
See `ml/README.md`.
