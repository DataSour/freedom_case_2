# freedom_case_2

Full-stack F.I.R.E. hackathon project.

## Overview
- `frontend/`: React + Vite UI
- `backend/`: Go (Gin) API + PostgreSQL + migrations
- `main.py`: ML/AI utilities (data prep / experiments)
- `*.csv`, `*.png`, `final_results.csv`: sample data + artifacts

## Quick Start (Docker)
From repo root:
```
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

## Environment Variables

### Frontend (`frontend/.env`)
- `VITE_API_BASE_URL` (default `http://localhost:8080`)
- `VITE_ADMIN_KEY` (admin key for protected endpoints)

### Backend (`backend/.env`)
- `PORT` (default `8080`)
- `DATABASE_URL` (required)
- `ADMIN_KEY` (required for admin endpoints)
- `AI_URL` (optional; empty uses mock adapter)
- `CORS_ALLOWED_ORIGINS` (default `*`)
- `REQUEST_TIMEOUT` (default `30s`)
- `LOG_LEVEL` (default `info`)
- `MAX_UPLOAD_MB` (default `20`)

## Key API Endpoints
- `POST /api/import` (multipart: tickets, managers, business_units)
- `POST /api/process`
- `GET /api/runs/latest`
- `GET /api/tickets?status=&office=&language=&q=&limit=&offset=`
- `GET /api/tickets/:id`
- `GET /api/managers?office=&skill=`
- `POST /api/tickets/:id/reassign` (admin)
- `GET /healthz`

## ML / Data Artifacts
- `main.py`: scripts/experiments for AI enrichment and dataset handling
- `requirements.txt`: Python dependencies
- `tickets.csv`, `managers.csv`, `business_units.csv`: sample datasets
- `final_results.csv`: sample results
- `data_error.png`, `order_error.png`: sample output images
- `THE F.I.R.E. CHALLENGE.docx`: source brief
