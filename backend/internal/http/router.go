package httpapi

import (
	"time"

	"github.com/gin-contrib/cors"
	"github.com/gin-gonic/gin"
	"github.com/go-playground/validator/v10"
	"github.com/rs/zerolog"
	swaggerFiles "github.com/swaggo/files"
	ginSwagger "github.com/swaggo/gin-swagger"

	"github.com/freedom_case_2/backend/internal/ai"
	"github.com/freedom_case_2/backend/internal/config"
	"github.com/freedom_case_2/backend/internal/db"
	"github.com/freedom_case_2/backend/internal/geocode"
	"github.com/freedom_case_2/backend/internal/http/handlers"
	"github.com/freedom_case_2/backend/internal/http/middleware"

	_ "github.com/freedom_case_2/backend/docs"
)

func Router(cfg config.Config, store *db.Store, adapter ai.Adapter, assistant ai.Assistant, geocoder geocode.Geocoder, logger zerolog.Logger) *gin.Engine {
	r := gin.New()
	r.Use(gin.Recovery())
	r.Use(middleware.RequestID())
	r.Use(middleware.Logger(logger))
	r.MaxMultipartMemory = cfg.MaxUploadSizeMB << 20

	corsCfg := cors.Config{
		AllowMethods:     []string{"GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"},
		AllowHeaders:     []string{"Origin", "Content-Type", "Accept", "Authorization", "X-Admin-Key", "X-Request-Id"},
		AllowCredentials: true,
		MaxAge:           12 * time.Hour,
	}
	if cfg.CORSAllowed == "*" {
		corsCfg.AllowAllOrigins = true
	} else {
		corsCfg.AllowOrigins = []string{cfg.CORSAllowed}
	}
	r.Use(cors.New(corsCfg))

	h := &handlers.Handler{
		Store:          store,
		AI:             adapter,
		Assistant:      assistant,
		Geocoder:       geocoder,
		Validator:      validator.New(),
		Logger:         logger,
		AdminKey:       cfg.AdminKey,
		CountryDefault: cfg.CountryDefault,
	}

	r.GET("/healthz", h.Healthz)

	api := r.Group("/api")
	{
		api.GET("/tickets", h.TicketsList)
		api.GET("/tickets/:id", h.TicketDetails)
		api.GET("/managers", h.ManagersList)
		api.GET("/runs/latest", h.RunsLatest)
		api.GET("/business-units", h.BusinessUnitsList)
	}

	admin := api.Group("")
	admin.Use(middleware.AdminKey(cfg.AdminKey))
	{
		admin.POST("/import", h.Import)
		admin.POST("/process", h.Process)
		admin.POST("/tickets/:id/reassign", h.Reassign)
		admin.POST("/tickets/:id/resolve", h.ResolveTicket)
		admin.GET("/debug/eligibility", h.DebugEligibility)
		admin.POST("/assistant/chat", h.AssistantChat)
		admin.POST("/analytics/query", h.AnalyticsQuery)
		admin.POST("/business-units/regeocode", h.RegeocodeBusinessUnits)
	}

	r.GET("/swagger/*any", ginSwagger.WrapHandler(swaggerFiles.Handler))

	return r
}
