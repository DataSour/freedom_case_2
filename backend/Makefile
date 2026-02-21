SHELL := /bin/sh

APP=fire-backend

run:
	go run ./cmd/server

test:
	go test ./...

lint:
	golangci-lint run

migrate-up:
	migrate -path ./migrations -database "$$DATABASE_URL" up

migrate-down:
	migrate -path ./migrations -database "$$DATABASE_URL" down 1

migrate-force:
	migrate -path ./migrations -database "$$DATABASE_URL" force $$VERSION
