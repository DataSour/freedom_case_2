# F.I.R.E. Backend

Production-ready Go backend for AI ticket enrichment + automatic manager assignment.

**Stack**
- Go 1.22+
- Gin
- PostgreSQL + pgx
- Migrations: golang-migrate
- Config: viper (.env)
- Logging: zerolog
- Validation: go-playground/validator
- OpenAPI: swaggo (minimal docs registered)

## Quick Start (Docker)
From repo root:
```
docker compose up --build
```

## Env Vars
- `PORT` (default `8080`)
- `DATABASE_URL` (required)
- `ADMIN_KEY` (optional but required for admin endpoints)
- `AI_URL` (optional, if empty uses mock adapter)
- `CORS_ALLOWED_ORIGINS` (default `*`)
- `REQUEST_TIMEOUT` (default `30s`)
- `LOG_LEVEL` (default `info`)
- `MAX_UPLOAD_MB` (default `20`)

## Migrations
Using `golang-migrate`:
```
export DATABASE_URL="postgres://fire:firepass@localhost:5432/firedb?sslmode=disable"
make -C backend migrate-up
```

## API Examples
Import CSVs:
```
curl -X POST http://localhost:8080/api/import \
  -H "X-Admin-Key: dev-admin-key" \
  -F "tickets=@./samples/tickets.csv" \
  -F "managers=@./samples/managers.csv" \
  -F "business_units=@./samples/business_units.csv"
```

Process tickets:
```
curl -X POST http://localhost:8080/api/process \
  -H "X-Admin-Key: dev-admin-key"
```

List tickets:
```
curl "http://localhost:8080/api/tickets?status=ASSIGNED&office=Astana&limit=20&offset=0"
```

Ticket details:
```
curl http://localhost:8080/api/tickets/TICK-001
```

Reassign ticket:
```
curl -X POST http://localhost:8080/api/tickets/TICK-001/reassign \
  -H "X-Admin-Key: dev-admin-key" \
  -H "Content-Type: application/json" \
  -d '{"manager_id":"MGR-02","reason":"Load balancing"}'
```

## CSV Format Notes
`tickets.csv`
- Headers: `id,created_at,segment,city,address,message`
- `created_at` in RFC3339 (fallback to now if invalid)

`managers.csv`
- Headers: `id,name,office,role,skills,current_load`
- `skills` can be comma or semicolon separated

`business_units.csv`
- Headers: `id,name,city,lat,lon`

## Mock AI Response Example
When `AI_URL` is empty, backend uses deterministic mock values based on `ticket_id`.

Example AI response format (for real AI adapter):
```
{
  "ticket_id": "TICK-001",
  "type": "Change of data",
  "sentiment": "neutral",
  "priority": 9,
  "language": "RU",
  "summary": "Customer requested data change",
  "recommendation": "Verify identity and update",
  "geo": {"lat": 51.1605, "lon": 71.4704, "confidence": 0.82},
  "model_version": "v1"
}
```

## Swagger
Swagger UI available at `http://localhost:8080/swagger/index.html`.
If you want to regenerate docs with `swag`:
```
swag init -g cmd/server/main.go -o ./docs
```
