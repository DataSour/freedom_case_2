package handlers

import (
	"context"
	"net/http"
	"net/http/httptest"
	"os"
	"testing"

	"github.com/gin-gonic/gin"
	"github.com/rs/zerolog"

	"github.com/freedom_case_2/backend/internal/db"
)

func TestHealthzIntegration(t *testing.T) {
	url := os.Getenv("TEST_DATABASE_URL")
	if url == "" {
		t.Skip("TEST_DATABASE_URL not set")
	}

	store, err := db.New(context.Background(), url)
	if err != nil {
		t.Fatalf("db connect: %v", err)
	}
	defer store.Close()

	h := &Handler{Store: store, Logger: zerolog.Nop()}

	r := gin.New()
	r.GET("/healthz", h.Healthz)

	req, _ := http.NewRequest(http.MethodGet, "/healthz", nil)
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", w.Code)
	}
}
