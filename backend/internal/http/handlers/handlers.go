package handlers

import (
	"context"
	"encoding/csv"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"mime/multipart"
	"net/http"
	"path/filepath"
	"strconv"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/go-playground/validator/v10"
	"github.com/jackc/pgx/v5"
	"github.com/rs/zerolog"

	"github.com/freedom_case_2/backend/internal/ai"
	"github.com/freedom_case_2/backend/internal/db"
	"github.com/freedom_case_2/backend/internal/geocode"
	"github.com/freedom_case_2/backend/internal/models"
	"github.com/freedom_case_2/backend/internal/service"
)

type Handler struct {
	Store          *db.Store
	AI             ai.Adapter
	Assistant      ai.Assistant
	Geocoder       geocode.Geocoder
	Validator      *validator.Validate
	Logger         zerolog.Logger
	AdminKey       string
	CountryDefault string
}

type ImportSummary struct {
	Tickets struct {
		Parsed   int `json:"parsed"`
		Inserted int `json:"inserted"`
		Errors   int `json:"errors"`
	} `json:"tickets"`
	Managers struct {
		Parsed          int `json:"parsed"`
		Inserted        int `json:"inserted"`
		Errors          int `json:"errors"`
		Upserted        int `json:"upserted_count"`
		LoadInitialized int `json:"current_load_initialized_count"`
	} `json:"managers"`
	BusinessUnits struct {
		Parsed           int                 `json:"parsed"`
		Inserted         int                 `json:"inserted"`
		Errors           int                 `json:"errors"`
		GeocodedOK       int                 `json:"geocoded_ok_count"`
		GeocodedFailed   int                 `json:"geocoded_failed_count"`
		GeocodedFailures []map[string]string `json:"geocoded_failures,omitempty"`
	} `json:"business_units"`
	Errors []string `json:"errors"`
}

func (h *Handler) Healthz(c *gin.Context) {
	ctx, cancel := context.WithTimeout(c.Request.Context(), 3*time.Second)
	defer cancel()
	if err := h.Store.Ping(ctx); err != nil {
		writeError(c, http.StatusServiceUnavailable, "DB_UNAVAILABLE", "Database unavailable", err.Error())
		return
	}
	c.JSON(http.StatusOK, gin.H{"status": "ok"})
}

// @Summary Import CSV data
// @Description Upload tickets, managers, and business units CSV files
// @Tags import
// @Accept multipart/form-data
// @Produce json
// @Param tickets formData file true "tickets.csv"
// @Param managers formData file true "managers.csv"
// @Param business_units formData file true "business_units.csv"
// @Success 200 {object} ImportSummary
// @Failure 400 {object} map[string]any
// @Router /api/import [post]
func (h *Handler) Import(c *gin.Context) {
	ticketsFile, err := c.FormFile("tickets")
	if err != nil {
		writeError(c, http.StatusBadRequest, "INVALID_REQUEST", "tickets file required", nil)
		return
	}
	managersFile, err := c.FormFile("managers")
	if err != nil {
		writeError(c, http.StatusBadRequest, "INVALID_REQUEST", "managers file required", nil)
		return
	}
	unitsFile, err := c.FormFile("business_units")
	if err != nil {
		writeError(c, http.StatusBadRequest, "INVALID_REQUEST", "business_units file required", nil)
		return
	}

	summary := ImportSummary{}

	ctx := c.Request.Context()
	summary.Errors = []string{}

	// parse
	if !validateExt(ticketsFile.Filename) || !validateExt(managersFile.Filename) || !validateExt(unitsFile.Filename) {
		writeError(c, http.StatusBadRequest, "INVALID_REQUEST", "all files must be .csv", nil)
		return
	}

	tickets, errs := parseTicketsCSV(ticketsFile)
	summary.Tickets.Parsed = len(tickets)
	summary.Tickets.Errors = len(errs)
	summary.Errors = append(summary.Errors, errs...)

	managers, errs := parseManagersCSV(managersFile)
	summary.Managers.Parsed = len(managers)
	summary.Managers.Errors = len(errs)
	summary.Errors = append(summary.Errors, errs...)

	units, errs := parseBusinessUnitsCSV(unitsFile)
	summary.BusinessUnits.Parsed = len(units)
	summary.BusinessUnits.Errors = len(errs)
	summary.Errors = append(summary.Errors, errs...)

	if len(summary.Errors) > 0 {
		writeError(c, http.StatusBadRequest, "CSV_PARSE_ERROR", "CSV validation errors", summary.Errors)
		return
	}

	err = h.Store.WithTx(ctx, func(tx pgx.Tx) error {
		_, err := tx.Exec(ctx, `TRUNCATE tickets, managers, business_units, ai_analysis, assignments RESTART IDENTITY`)
		if err != nil {
			return err
		}
		return nil
	})
	if err != nil {
		writeError(c, http.StatusInternalServerError, "DB_ERROR", "Failed to reset tables", err.Error())
		return
	}

	inserted, err := h.Store.InsertTickets(ctx, tickets)
	if err != nil {
		writeError(c, http.StatusInternalServerError, "DB_ERROR", "Failed to insert tickets", err.Error())
		return
	}
	summary.Tickets.Inserted = int(inserted)

	inserted, err = h.Store.UpsertManagers(ctx, managers)
	if err != nil {
		writeError(c, http.StatusInternalServerError, "DB_ERROR", "Failed to insert managers", err.Error())
		return
	}
	summary.Managers.Inserted = int(inserted)
	summary.Managers.Upserted = int(inserted)
	summary.Managers.LoadInitialized = int(inserted)

	inserted, err = h.Store.InsertBusinessUnits(ctx, units)
	if err != nil {
		writeError(c, http.StatusInternalServerError, "DB_ERROR", "Failed to insert business units", err.Error())
		return
	}
	summary.BusinessUnits.Inserted = int(inserted)
	if h.Geocoder != nil {
		okCount, failedCount, failures := h.geocodeBusinessUnits(ctx, units, false)
		summary.BusinessUnits.GeocodedOK = okCount
		summary.BusinessUnits.GeocodedFailed = failedCount
		summary.BusinessUnits.GeocodedFailures = failures
	}

	c.JSON(http.StatusOK, summary)
}

// @Summary Process tickets
// @Tags process
// @Produce json
// @Success 200 {object} map[string]any
// @Router /api/process [post]
func (h *Handler) Process(c *gin.Context) {
	runID, err := h.Store.CreateRun(c.Request.Context(), "RUNNING")
	if err != nil {
		h.Logger.Error().Err(err).Msg("failed to create run")
		writeError(c, http.StatusInternalServerError, "DB_ERROR", "Failed to create run", err.Error())
		return
	}

	processor := service.ProcessingService{Store: h.Store, AI: h.AI, Logger: h.Logger}
	debug := c.Query("debug")
	summary, err := processor.ProcessTickets(c.Request.Context(), debug == "1" || strings.EqualFold(debug, "true"))
	status := "SUCCESS"
	if err != nil {
		status = "FAILED"
	}
	b, _ := json.Marshal(summary)
	if finishErr := h.Store.FinishRun(c.Request.Context(), runID, status, b); finishErr != nil {
		h.Logger.Error().Err(finishErr).Msg("failed to finish run")
	}

	if err != nil {
		h.Logger.Error().Err(err).Msg("processing failed")
		writeError(c, http.StatusInternalServerError, "PROCESSING_ERROR", "Processing failed", err.Error())
		return
	}
	c.JSON(http.StatusOK, summary)
}

// @Summary Latest run
// @Tags runs
// @Produce json
// @Success 200 {object} map[string]any
// @Router /api/runs/latest [get]
func (h *Handler) RunsLatest(c *gin.Context) {
	result, err := h.Store.GetLatestRun(c.Request.Context())
	if err != nil {
		writeError(c, http.StatusNotFound, "NOT_FOUND", "No runs found", err.Error())
		return
	}
	c.JSON(http.StatusOK, result)
}

// @Summary Business units list
// @Tags business-units
// @Produce json
// @Param geocoded query bool false "Filter by geocoded"
// @Param q query string false "Search by office/address"
// @Success 200 {object} map[string]any
// @Router /api/business-units [get]
func (h *Handler) BusinessUnitsList(c *gin.Context) {
	var geocoded *bool
	if v := strings.TrimSpace(c.Query("geocoded")); v != "" {
		val := strings.EqualFold(v, "true") || v == "1"
		geocoded = &val
	}
	q := strings.TrimSpace(c.Query("q"))
	units, err := h.Store.ListBusinessUnitsFiltered(c.Request.Context(), geocoded, q)
	if err != nil {
		writeError(c, http.StatusInternalServerError, "DB_ERROR", "Failed to list business units", err.Error())
		return
	}
	c.JSON(http.StatusOK, gin.H{"items": units})
}

// @Summary Re-geocode business units
// @Tags business-units
// @Produce json
// @Param force query bool false "Force re-geocode"
// @Success 200 {object} map[string]any
// @Router /api/business-units/regeocode [post]
func (h *Handler) RegeocodeBusinessUnits(c *gin.Context) {
	if h.Geocoder == nil {
		writeError(c, http.StatusBadRequest, "GEOCODER_DISABLED", "Geocoder not configured", nil)
		return
	}
	force := strings.EqualFold(c.Query("force"), "true") || c.Query("force") == "1"
	var (
		units []models.BusinessUnit
		err   error
	)
	if force {
		units, err = h.Store.ListBusinessUnitsFiltered(c.Request.Context(), nil, "")
	} else {
		geocoded := false
		units, err = h.Store.ListBusinessUnitsFiltered(c.Request.Context(), &geocoded, "")
	}
	if err != nil {
		writeError(c, http.StatusInternalServerError, "DB_ERROR", "Failed to load business units", err.Error())
		return
	}
	okCount, failedCount, failures := h.geocodeBusinessUnits(c.Request.Context(), units, force)
	c.JSON(http.StatusOK, gin.H{
		"geocoded_ok_count":     okCount,
		"geocoded_failed_count": failedCount,
		"geocoded_failures":     failures,
	})
}

func (h *Handler) TicketsList(c *gin.Context) {
	status := c.Query("status")
	office := normalizeOfficeName(c.Query("office"))
	language := strings.ToUpper(strings.TrimSpace(c.Query("language")))
	q := c.Query("q")
	limit, _ := strconv.Atoi(c.DefaultQuery("limit", "50"))
	offset, _ := strconv.Atoi(c.DefaultQuery("offset", "0"))

	items, err := h.Store.ListTickets(c.Request.Context(), status, office, language, q, limit, offset)
	if err != nil {
		writeError(c, http.StatusInternalServerError, "DB_ERROR", "Failed to list tickets", err.Error())
		return
	}
	c.JSON(http.StatusOK, gin.H{"items": items, "limit": limit, "offset": offset})
}

// @Summary Resolve ticket
// @Tags tickets
// @Produce json
// @Param id path string true "Ticket ID"
// @Success 200 {object} map[string]any
// @Router /api/tickets/:id/resolve [post]
func (h *Handler) ResolveTicket(c *gin.Context) {
	id := strings.TrimSpace(c.Param("id"))
	if id == "" {
		writeError(c, http.StatusBadRequest, "VALIDATION_ERROR", "ticket id required", nil)
		return
	}
	_, err := h.Store.UpdateAssignmentStatus(c.Request.Context(), id, "RESOLVED")
	if err != nil {
		writeError(c, http.StatusInternalServerError, "DB_ERROR", "Failed to resolve ticket", err.Error())
		return
	}
	c.JSON(http.StatusOK, gin.H{"status": "RESOLVED"})
}

func (h *Handler) TicketDetails(c *gin.Context) {
	id := c.Param("id")
	result, err := h.Store.GetTicketDetails(c.Request.Context(), id)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			writeError(c, http.StatusNotFound, "NOT_FOUND", "Ticket not found", nil)
			return
		}
		writeError(c, http.StatusInternalServerError, "DB_ERROR", "Failed to get ticket", err.Error())
		return
	}
	c.JSON(http.StatusOK, result)
}

func (h *Handler) ManagersList(c *gin.Context) {
	office := normalizeOfficeName(c.Query("office"))
	skill := strings.ToUpper(strings.TrimSpace(c.Query("skill")))
	items, err := h.Store.ListManagers(c.Request.Context(), office, skill)
	if err != nil {
		writeError(c, http.StatusInternalServerError, "DB_ERROR", "Failed to list managers", err.Error())
		return
	}
	c.JSON(http.StatusOK, gin.H{"items": items})
}

// @Summary Debug eligibility
// @Tags debug
// @Produce json
// @Param ticket_id query string true "Ticket ID"
// @Success 200 {object} map[string]any
// @Router /api/debug/eligibility [get]
func (h *Handler) DebugEligibility(c *gin.Context) {
	ticketID := strings.TrimSpace(c.Query("ticket_id"))
	if ticketID == "" {
		writeError(c, http.StatusBadRequest, "VALIDATION_ERROR", "ticket_id is required", nil)
		return
	}

	details, err := h.Store.GetTicketDetails(c.Request.Context(), ticketID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			writeError(c, http.StatusNotFound, "NOT_FOUND", "Ticket not found", nil)
			return
		}
		writeError(c, http.StatusInternalServerError, "DB_ERROR", "Failed to load ticket", err.Error())
		return
	}

	ticket, ok := details["ticket"].(models.Ticket)
	if !ok {
		writeError(c, http.StatusInternalServerError, "DB_ERROR", "Ticket load failed", nil)
		return
	}
	aiRaw, ok := details["ai_analysis"].(map[string]any)
	if !ok {
		writeError(c, http.StatusBadRequest, "INVALID_STATE", "Ticket has no AI analysis", nil)
		return
	}
	ai := service.NormalizeAI(models.AIAnalysis{
		TicketID:   ticket.ID,
		Type:       getString(aiRaw, "type"),
		Priority:   getInt(aiRaw, "priority"),
		Language:   getString(aiRaw, "language"),
		Lat:        getFloat(aiRaw, "lat"),
		Lon:        getFloat(aiRaw, "lon"),
		Confidence: getFloat(aiRaw, "confidence"),
	})

	units, err := h.Store.ListBusinessUnits(c.Request.Context())
	if err != nil {
		writeError(c, http.StatusInternalServerError, "DB_ERROR", "Failed to load business units", err.Error())
		return
	}
	office, usedGeo := service.SelectOffice(ticket.ID, ai, units)
	managers, err := h.Store.ListManagersByOffice(c.Request.Context(), office)
	if err != nil {
		writeError(c, http.StatusInternalServerError, "DB_ERROR", "Failed to load managers", err.Error())
		return
	}
	elig := service.FilterEligibleManagers(managers, ticket, ai)

	stageIDs := map[string][]string{}
	for _, stage := range elig.Stages {
		var ids []string
		for _, m := range stage.Candidates {
			ids = append(ids, m.ID)
		}
		stageIDs[stage.Name] = ids
	}

	resp := gin.H{
		"ticket_id": ticket.ID,
		"office":    office,
		"used_geo":  usedGeo,
		"stages":    stageIDs,
		"final": gin.H{
			"eligible":    stageIDs["language_rule"],
			"reason_code": elig.ReasonCode,
			"reason_text": elig.ReasonText,
		},
	}
	c.JSON(http.StatusOK, resp)
}

type AssistantRequest struct {
	Message string           `json:"message" validate:"required"`
	History []ai.ChatMessage `json:"history,omitempty"`
}

func (h *Handler) AssistantChat(c *gin.Context) {
	var req AssistantRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		writeError(c, http.StatusBadRequest, "INVALID_REQUEST", "Invalid payload", err.Error())
		return
	}
	if err := h.Validator.Struct(req); err != nil {
		writeError(c, http.StatusBadRequest, "VALIDATION_ERROR", "Validation failed", err.Error())
		return
	}

	ctxData, err := h.Store.GetAssistantContext(c.Request.Context())
	if err != nil {
		writeError(c, http.StatusInternalServerError, "DB_ERROR", "Failed to load assistant context", err.Error())
		return
	}
	contextJSON, _ := json.Marshal(ctxData)

	systemPrompt := `You are FIRE Assistant for the ticket routing system. 
Use the provided CONTEXT(JSON) as the source of truth for counts, assignments, managers, offices (business units), and latest runs.
If the user asks about system state, tickets, managers, offices, or reasons, answer using the context.
If data is missing, say you don't have that data. Answer in the user's language. Be concise and specific.
If the user asks general definitions (e.g., "who is a manager"), provide a short domain explanation.

Assignment rules summary:
1) Office selection: if geo.confidence >= 0.70 -> nearest office by haversine distance, else deterministic 50/50 split by hash(ticket_id) between ASTANA/ALMATY.
2) Hard rules:
   - VIP rule: if segment==VIP OR priority>=9, manager must have VIP skill.
   - Change of data: if type=="Change of data", manager role must be "Глав спец".
   - Language: if language in {KZ, ENG, RU}, manager must have that language skill.
3) If no eligible managers after rules -> UNASSIGNED with reason_code (VIP_REQUIRED_NO_MATCH, ROLE_MISMATCH, LANGUAGE_MISMATCH, or NO_ELIGIBLE_MANAGERS).
4) If eligible: pick top-2 least loaded, then deterministic round-robin with hash(ticket_id) % len(top2).

How to submit a complaint (ticket):
Create a ticket via the UI (tickets/import) or upload tickets.csv via Import. The system treats complaints as tickets and will process them through the pipeline.

If the user asks for a chart or distribution, respond with a strict JSON object only:
{
  "intent": "chart",
  "title": "...",
  "chart": "bar|stacked_bar|pie",
  "group_by": ["city","type"], 
  "filters": {}
}
Use group_by fields from: city, type, segment, language, sentiment, office, status, manager_id.`

	fullPrompt := fmt.Sprintf("%s\n\nCONTEXT(JSON): %s\n\nUSER QUESTION: %s", systemPrompt, string(contextJSON), req.Message)

	answer, err := h.Assistant.Ask(c.Request.Context(), fullPrompt, req.History)
	if err != nil {
		if rl, ok := err.(ai.RateLimitError); ok {
			writeError(c, http.StatusTooManyRequests, "AI_RATE_LIMIT", "Assistant rate limited", map[string]any{
				"retry_after_seconds": int(rl.RetryAfter.Seconds()),
			})
			return
		}
		h.Logger.Error().Err(err).Msg("assistant failed")
		writeError(c, http.StatusInternalServerError, "AI_ERROR", "Assistant failed", err.Error())
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"answer": answer,
	})
}

type AnalyticsQueryRequest struct {
	GroupBy []string          `json:"group_by" validate:"required,min=1"`
	Filters map[string]string `json:"filters,omitempty"`
	Limit   int               `json:"limit,omitempty"`
}

func (h *Handler) AnalyticsQuery(c *gin.Context) {
	var req AnalyticsQueryRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		writeError(c, http.StatusBadRequest, "INVALID_REQUEST", "Invalid payload", err.Error())
		return
	}
	if err := h.Validator.Struct(req); err != nil {
		writeError(c, http.StatusBadRequest, "VALIDATION_ERROR", "Validation failed", err.Error())
		return
	}

	allowed := map[string]string{
		"city":       "t.city",
		"type":       "ai.type",
		"segment":    "t.segment",
		"language":   "ai.language",
		"sentiment":  "ai.sentiment",
		"office":     "a.office",
		"status":     "a.status",
		"manager_id": "a.manager_id",
	}

	var groupCols []string
	var selectCols []string
	for _, g := range req.GroupBy {
		col, ok := allowed[g]
		if !ok {
			writeError(c, http.StatusBadRequest, "INVALID_GROUP", "Unsupported group_by field", g)
			return
		}
		groupCols = append(groupCols, col)
		selectCols = append(selectCols, fmt.Sprintf("%s AS %s", col, g))
	}

	whereClauses := []string{}
	args := []any{}
	if req.Filters != nil {
		for k, v := range req.Filters {
			col, ok := allowed[k]
			if !ok {
				writeError(c, http.StatusBadRequest, "INVALID_FILTER", "Unsupported filter field", k)
				return
			}
			args = append(args, v)
			whereClauses = append(whereClauses, fmt.Sprintf("%s = $%d", col, len(args)))
		}
	}

	limit := req.Limit
	if limit <= 0 || limit > 200 {
		limit = 200
	}

	query := fmt.Sprintf(`
		SELECT %s, COUNT(*) AS count
		FROM tickets t
		LEFT JOIN ai_analysis ai ON ai.ticket_id = t.id
		LEFT JOIN assignments a ON a.ticket_id = t.id
	`, strings.Join(selectCols, ", "))
	if len(whereClauses) > 0 {
		query += " WHERE " + strings.Join(whereClauses, " AND ")
	}
	query += " GROUP BY " + strings.Join(groupCols, ", ")
	query += " ORDER BY COUNT(*) DESC"
	query += fmt.Sprintf(" LIMIT %d", limit)

	rows, err := h.Store.Pool.Query(c.Request.Context(), query, args...)
	if err != nil {
		writeError(c, http.StatusInternalServerError, "DB_ERROR", "Query failed", err.Error())
		return
	}
	defer rows.Close()

	var results []map[string]any
	for rows.Next() {
		values, err := rows.Values()
		if err != nil {
			writeError(c, http.StatusInternalServerError, "DB_ERROR", "Query failed", err.Error())
			return
		}
		if len(values) != len(req.GroupBy)+1 {
			continue
		}
		row := map[string]any{}
		for i, key := range req.GroupBy {
			row[key] = values[i]
		}
		row["count"] = values[len(values)-1]
		results = append(results, row)
	}

	c.JSON(http.StatusOK, gin.H{"items": results})
}

type ReassignRequest struct {
	ManagerID string `json:"manager_id" validate:"required"`
	Reason    string `json:"reason" validate:"required"`
}

func (h *Handler) Reassign(c *gin.Context) {
	id := c.Param("id")
	var req ReassignRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		writeError(c, http.StatusBadRequest, "INVALID_REQUEST", "Invalid payload", err.Error())
		return
	}
	if err := h.Validator.Struct(req); err != nil {
		writeError(c, http.StatusBadRequest, "VALIDATION_ERROR", "Validation failed", err.Error())
		return
	}

	managerList, err := h.Store.ListManagers(c.Request.Context(), "", "")
	if err != nil {
		writeError(c, http.StatusInternalServerError, "DB_ERROR", "Failed to load managers", err.Error())
		return
	}

	var manager *models.Manager
	for _, m := range managerList {
		if m.ID == req.ManagerID {
			manager = &m
			break
		}
	}
	if manager == nil {
		writeError(c, http.StatusNotFound, "NOT_FOUND", "Manager not found", nil)
		return
	}

	ticketDetails, err := h.Store.GetTicketDetails(c.Request.Context(), id)
	if err != nil {
		writeError(c, http.StatusNotFound, "NOT_FOUND", "Ticket not found", err.Error())
		return
	}

	ticket := ticketDetails["ticket"].(models.Ticket)
	aiRaw, ok := ticketDetails["ai_analysis"].(map[string]any)
	if !ok {
		writeError(c, http.StatusBadRequest, "INVALID_STATE", "Ticket has no AI analysis", nil)
		return
	}
	ai := models.AIAnalysis{
		TicketID: ticket.ID,
		Type:     getString(aiRaw, "type"),
		Priority: getInt(aiRaw, "priority"),
		Language: getString(aiRaw, "language"),
	}

	eligible := service.FilterEligibleManagers([]models.Manager{*manager}, ticket, ai)
	override := len(eligible.Eligible) == 0
	reasoning := map[string]any{
		"manual":   true,
		"override": override,
		"reason":   req.Reason,
	}
	b, _ := json.Marshal(reasoning)
	if err := h.Store.Reassign(c.Request.Context(), id, req.ManagerID, manager.Office, b, req.Reason, override); err != nil {
		writeError(c, http.StatusInternalServerError, "DB_ERROR", "Failed to reassign", err.Error())
		return
	}
	c.JSON(http.StatusOK, gin.H{"status": "ok", "override": override})
}

func writeError(c *gin.Context, status int, code string, message string, details any) {
	c.JSON(status, gin.H{
		"error": gin.H{
			"code":    code,
			"message": message,
			"details": details,
		},
	})
}

func parseTicketsCSV(file *multipart.FileHeader) ([]models.Ticket, []string) {
	f, err := file.Open()
	if err != nil {
		return nil, []string{err.Error()}
	}
	defer f.Close()

	reader := csv.NewReader(f)
	reader.TrimLeadingSpace = true
	headers, err := reader.Read()
	if err != nil {
		return nil, []string{"failed to read header"}
	}
	index := headerIndex(headers)
	var errors []string
	var out []models.Ticket

	for {
		rec, err := reader.Read()
		if err == io.EOF {
			break
		}
		if err != nil {
			errors = append(errors, err.Error())
			continue
		}

		id := normalizeTrim(getFieldAny(rec, index, "id", "ticket_id", "ticket id", "ticketid", "guid клиента", "guid", "client_guid"))
		createdAtStr := normalizeTrim(getFieldAny(rec, index, "created_at", "created", "date", "дата", "дата создания"))
		segment := normalizeTrim(getFieldAny(rec, index, "segment", "segment клиента", "сегмент клиента", "segment client"))
		city := normalizeTrim(getFieldAny(rec, index, "city", "город", "населённый пункт"))
		street := normalizeTrim(getFieldAny(rec, index, "address", "адрес", "улица"))
		house := normalizeTrim(getFieldAny(rec, index, "дом", "house"))
		address := strings.TrimSpace(strings.TrimSpace(street + " " + house))
		message := normalizeTrim(getFieldAny(rec, index, "message", "описание", "description", "text", "текст"))
		createdAt, err := time.Parse(time.RFC3339, createdAtStr)
		if err != nil {
			createdAt = time.Now().UTC()
		}

		if id == "" {
			id = fmt.Sprintf("TICK-%04d", len(out)+1)
		}
		if city == "" {
			city = "Unknown"
		}
		if address == "" {
			address = "Unknown"
		}
		if message == "" {
			message = "—"
		}

		t := models.Ticket{
			ID:        id,
			CreatedAt: createdAt,
			Segment:   normalizeSegment(segment),
			City:      normalizeCity(city),
			Address:   address,
			Message:   message,
		}
		out = append(out, t)
	}
	return out, errors
}

func parseManagersCSV(file *multipart.FileHeader) ([]models.Manager, []string) {
	f, err := file.Open()
	if err != nil {
		return nil, []string{err.Error()}
	}
	defer f.Close()

	reader := csv.NewReader(f)
	reader.TrimLeadingSpace = true
	headers, err := reader.Read()
	if err != nil {
		return nil, []string{"failed to read header"}
	}
	index := headerIndex(headers)
	var errors []string
	var out []models.Manager

	for {
		rec, err := reader.Read()
		if err == io.EOF {
			break
		}
		if err != nil {
			errors = append(errors, err.Error())
			continue
		}

		id := normalizeTrim(getFieldAny(rec, index, "id", "manager_id", "manager id"))
		name := normalizeTrim(getFieldAny(rec, index, "name", "фио"))
		office := normalizeTrim(getFieldAny(rec, index, "office", "офис"))
		role := normalizeTrim(getFieldAny(rec, index, "role", "должность"))
		skillsRaw := normalizeTrim(getFieldAny(rec, index, "skills", "навыки"))
		loadStr := normalizeTrim(getFieldAny(rec, index, "current_load", "current load", "количество обращений в работе"))
		load, _ := strconv.Atoi(loadStr)
		skills := normalizeSkills(skillsRaw)
		if !hasSkillNormalized(skills, "RU") {
			skills = append(skills, "RU")
		}

		if id == "" {
			id = fmt.Sprintf("MGR-%03d", len(out)+1)
		}
		if role == "" {
			role = "Unknown"
		}

		m := models.Manager{
			ID:           id,
			Name:         name,
			Office:       normalizeOfficeName(office),
			Role:         normalizeRole(role),
			Skills:       skills,
			CurrentLoad:  0,
			BaselineLoad: load,
			UpdatedAt:    time.Now().UTC(),
		}
		if m.Name == "" || m.Office == "" {
			errors = append(errors, "manager id/name/office required")
			continue
		}
		out = append(out, m)
	}
	return out, errors
}

func parseBusinessUnitsCSV(file *multipart.FileHeader) ([]models.BusinessUnit, []string) {
	f, err := file.Open()
	if err != nil {
		return nil, []string{err.Error()}
	}
	defer f.Close()

	reader := csv.NewReader(f)
	reader.TrimLeadingSpace = true
	headers, err := reader.Read()
	if err != nil {
		return nil, []string{"failed to read header"}
	}
	index := headerIndex(headers)
	var errors []string
	var out []models.BusinessUnit

	for {
		rec, err := reader.Read()
		if err == io.EOF {
			break
		}
		if err != nil {
			errors = append(errors, err.Error())
			continue
		}

		id := normalizeTrim(getFieldAny(rec, index, "id", "office_id"))
		name := normalizeTrim(getFieldAny(rec, index, "name", "office", "office_name", "офис"))
		city := normalizeTrim(getFieldAny(rec, index, "city", "город"))
		address := normalizeTrim(getFieldAny(rec, index, "address", "адрес"))
		latStr := normalizeTrim(getFieldAny(rec, index, "lat", "latitude"))
		lonStr := normalizeTrim(getFieldAny(rec, index, "lon", "longitude"))
		lat, _ := strconv.ParseFloat(latStr, 64)
		lon, _ := strconv.ParseFloat(lonStr, 64)

		normalizedOffice := normalizeOfficeName(name)
		if normalizedOffice == "" {
			normalizedOffice = normalizeOfficeName(address)
		}
		if city == "" {
			city = normalizedOffice
		}
		if id == "" {
			id = strings.ToLower(strings.ReplaceAll(normalizedOffice, " ", "-"))
			if id == "" {
				id = fmt.Sprintf("office-%d", len(out)+1)
			}
		}

		var latPtr *float64
		var lonPtr *float64
		if lat != 0 || lon != 0 {
			latPtr = &lat
			lonPtr = &lon
		}

		u := models.BusinessUnit{
			ID:      id,
			Name:    normalizedOffice,
			City:    normalizeCity(city),
			Address: address,
			Lat:     latPtr,
			Lon:     lonPtr,
		}
		if u.ID == "" || u.Name == "" {
			errors = append(errors, "business unit id/name required")
			continue
		}
		out = append(out, u)
	}
	return out, errors
}

func headerIndex(headers []string) map[string]int {
	idx := map[string]int{}
	for i, h := range headers {
		idx[normalizeHeader(h)] = i
	}
	return idx
}

func getField(rec []string, idx map[string]int, name string) string {
	pos, ok := idx[name]
	if !ok || pos >= len(rec) {
		return ""
	}
	return strings.TrimSpace(rec[pos])
}

func getFieldAny(rec []string, idx map[string]int, names ...string) string {
	for _, name := range names {
		if v := getField(rec, idx, normalizeHeader(name)); v != "" {
			return v
		}
	}
	return ""
}

func normalizeHeader(h string) string {
	h = strings.ReplaceAll(h, "\ufeff", "")
	return strings.ToLower(strings.TrimSpace(h))
}

func splitSkills(raw string) []string {
	raw = strings.ReplaceAll(raw, ";", ",")
	parts := strings.Split(raw, ",")
	var out []string
	for _, p := range parts {
		p = strings.TrimSpace(p)
		if p != "" {
			out = append(out, p)
		}
	}
	return out
}

func normalizeOfficeName(value string) string {
	v := strings.ToLower(strings.TrimSpace(value))
	if v == "" {
		return ""
	}
	if strings.Contains(v, "астан") {
		return "ASTANA"
	}
	if strings.Contains(v, "nur-sultan") || strings.Contains(v, "nursultan") {
		return "ASTANA"
	}
	if strings.Contains(v, "алмат") {
		return "ALMATY"
	}
	if strings.Contains(v, "almat") {
		return "ALMATY"
	}
	if strings.Contains(v, "astan") {
		return "ASTANA"
	}
	return strings.TrimSpace(value)
}

func normalizeSegment(value string) string {
	v := strings.ToLower(strings.TrimSpace(value))
	if v == "" {
		return "STANDARD"
	}
	if strings.Contains(v, "vip") || strings.Contains(v, "преми") {
		return "VIP"
	}
	if strings.Contains(v, "premium") {
		return "PREMIUM"
	}
	if strings.Contains(v, "standard") || strings.Contains(v, "mass") {
		return "STANDARD"
	}
	return strings.ToUpper(strings.TrimSpace(value))
}

func normalizeTrim(v string) string {
	return strings.TrimSpace(v)
}

func normalizeCity(value string) string {
	v := strings.TrimSpace(value)
	if v == "" {
		return ""
	}
	return v
}

func normalizeSkills(raw string) []string {
	raw = strings.ReplaceAll(raw, ";", ",")
	parts := strings.Split(raw, ",")
	seen := map[string]struct{}{}
	var out []string
	for _, p := range parts {
		p = strings.TrimSpace(p)
		if p == "" {
			continue
		}
		upper := strings.ToUpper(p)
		switch upper {
		case "RU", "RUS", "RUSSIAN":
			upper = "RU"
		case "KZ", "KAZ", "KAZAKH":
			upper = "KZ"
		case "EN", "ENG", "ENGLISH":
			upper = "ENG"
		case "VIP":
			upper = "VIP"
		}
		if _, ok := seen[upper]; ok {
			continue
		}
		seen[upper] = struct{}{}
		out = append(out, upper)
	}
	return out
}

func hasSkillNormalized(skills []string, target string) bool {
	for _, s := range skills {
		if strings.EqualFold(strings.TrimSpace(s), target) {
			return true
		}
	}
	return false
}

func normalizeRole(value string) string {
	v := strings.TrimSpace(value)
	if v == "" {
		return ""
	}
	for strings.Contains(v, "  ") {
		v = strings.ReplaceAll(v, "  ", " ")
	}
	l := strings.ToLower(v)
	if strings.Contains(l, "глав") && strings.Contains(l, "спец") {
		return "Глав спец"
	}
	return v
}

func getString(m map[string]any, key string) string {
	v, ok := m[key]
	if !ok || v == nil {
		return ""
	}
	if s, ok := v.(string); ok {
		return s
	}
	if s, ok := v.(*string); ok && s != nil {
		return *s
	}
	return ""
}

func getInt(m map[string]any, key string) int {
	v, ok := m[key]
	if !ok || v == nil {
		return 0
	}
	switch t := v.(type) {
	case int:
		return t
	case float64:
		return int(t)
	case json.Number:
		i, _ := t.Int64()
		return int(i)
	case *int:
		if t != nil {
			return *t
		}
		return 0
	default:
		return 0
	}
	return 0
}

func (h *Handler) geocodeBusinessUnits(ctx context.Context, units []models.BusinessUnit, force bool) (int, int, []map[string]string) {
	if h.Geocoder == nil {
		return 0, len(units), []map[string]string{{"error": "geocoder not configured"}}
	}
	var okCount int
	var failedCount int
	var failures []map[string]string

	for _, unit := range units {
		if !geocode.ShouldGeocode(unit, force) {
			continue
		}
		query := geocode.BuildGeocodeQuery(h.CountryDefault, unit.Name, unit.Address)
		if strings.TrimSpace(query) == "" {
			failedCount++
			failures = append(failures, map[string]string{
				"office": unit.Name,
				"error":  "empty geocode query",
			})
			continue
		}
		lat, lon, display, confidence, err := h.Geocoder.Geocode(ctx, query)
		if err != nil {
			failedCount++
			failures = append(failures, map[string]string{
				"office": unit.Name,
				"error":  err.Error(),
			})
			continue
		}
		if err := h.Store.UpdateBusinessUnitGeocode(ctx, unit.ID, lat, lon, "nominatim", display, confidence, time.Now().UTC()); err != nil {
			failedCount++
			failures = append(failures, map[string]string{
				"office": unit.Name,
				"error":  err.Error(),
			})
			continue
		}
		okCount++
	}

	return okCount, failedCount, failures
}

func getFloat(m map[string]any, key string) float64 {
	v, ok := m[key]
	if !ok || v == nil {
		return 0
	}
	switch t := v.(type) {
	case float64:
		return t
	case float32:
		return float64(t)
	case int:
		return float64(t)
	case json.Number:
		f, _ := t.Float64()
		return f
	default:
		return 0
	}
}

func validateExt(name string) bool {
	ext := strings.ToLower(filepath.Ext(name))
	return ext == ".csv"
}
