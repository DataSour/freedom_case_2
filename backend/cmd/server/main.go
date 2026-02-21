package main

import (
	"context"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/rs/zerolog"
	"github.com/rs/zerolog/log"

	"github.com/freedom_case_2/backend/internal/ai"
	"github.com/freedom_case_2/backend/internal/config"
	"github.com/freedom_case_2/backend/internal/db"
	httpapi "github.com/freedom_case_2/backend/internal/http"
)

func main() {
	cfg, err := config.Load()
	if err != nil {
		panic(err)
	}

	zerolog.TimeFieldFormat = time.RFC3339
	level, _ := zerolog.ParseLevel(cfg.LogLevel)
	logger := log.Level(level).With().Str("service", "fire-backend").Logger()

	ctx := context.Background()
	store, err := db.New(ctx, cfg.DatabaseURL)
	if err != nil {
		logger.Fatal().Err(err).Msg("failed to connect db")
	}
	defer store.Close()

	var adapter ai.Adapter
	if cfg.AIURL == "" {
		adapter = ai.MockAdapter{ModelVersion: "mock-v1"}
		logger.Info().Msg("using mock AI adapter")
	} else {
		adapter = ai.HTTPAdapter{BaseURL: cfg.AIURL}
	}

	router := httpapi.Router(cfg, store, adapter, logger)

	srv := &http.Server{
		Addr:    ":" + cfg.Port,
		Handler: router,
	}

	go func() {
		logger.Info().Str("port", cfg.Port).Msg("server started")
		if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			logger.Fatal().Err(err).Msg("server error")
		}
	}()

	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
	<-quit

	ctxShutdown, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	_ = srv.Shutdown(ctxShutdown)
	logger.Info().Msg("server stopped")
}
