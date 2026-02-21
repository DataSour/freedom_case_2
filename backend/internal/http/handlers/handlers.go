package handlers

import (
	"context"
	"encoding/csv"
	"encoding/json"
	"errors"
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
	"github.com/freedom_case_2/backend/internal/models"
	"github.com/freedom_case_2/backend/internal/service"
)

type Handler struct {
	Store     *db.Store
	AI        ai.Adapter
	Validator *validator.Validate
	Logger    zerolog.Logger
	AdminKey  string
}

type ImportSummary struct {
	Tickets struct {
		Parsed   int `json:"parsed"`
		Inserted int `json:"inserted"`
		Errors   int `json:"errors"`
	} `json:"tickets"`
	Managers struct {
		Parsed   int `json:"parsed"`
		Inserted int `json:"inserted"`
		Errors   int `json:"errors"`
	} `json:"managers"`
	BusinessUnits struct {
		Parsed   int `json:"parsed"`
		Inserted int `json:"inserted"`
		Errors   int `json:"errors"`
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

	inserted, err = h.Store.InsertManagers(ctx, managers)
	if err != nil {
		writeError(c, http.StatusInternalServerError, "DB_ERROR", "Failed to insert managers", err.Error())
		return
	}
	summary.Managers.Inserted = int(inserted)

	inserted, err = h.Store.InsertBusinessUnits(ctx, units)
	if err != nil {
		writeError(c, http.StatusInternalServerError, "DB_ERROR", "Failed to insert business units", err.Error())
		return
	}
	summary.BusinessUnits.Inserted = int(inserted)

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
		writeError(c, http.StatusInternalServerError, "DB_ERROR", "Failed to create run", err.Error())
		return
	}

	processor := service.ProcessingService{Store: h.Store, AI: h.AI, Logger: h.Logger}
	summary, err := processor.ProcessTickets(c.Request.Context())
	status := "SUCCESS"
	if err != nil {
		status = "FAILED"
	}
	b, _ := json.Marshal(summary)
	_ = h.Store.FinishRun(c.Request.Context(), runID, status, b)

	if err != nil {
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

func (h *Handler) TicketsList(c *gin.Context) {
	status := c.Query("status")
	office := c.Query("office")
	language := c.Query("language")
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
	office := c.Query("office")
	skill := c.Query("skill")
	items, err := h.Store.ListManagers(c.Request.Context(), office, skill)
	if err != nil {
		writeError(c, http.StatusInternalServerError, "DB_ERROR", "Failed to list managers", err.Error())
		return
	}
	c.JSON(http.StatusOK, gin.H{"items": items})
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
		"manual": true,
		"override": override,
		"reason": req.Reason,
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

		id := getField(rec, index, "id")
		createdAtStr := getField(rec, index, "created_at")
		segment := getField(rec, index, "segment")
		city := getField(rec, index, "city")
		address := getField(rec, index, "address")
		message := getField(rec, index, "message")
		createdAt, err := time.Parse(time.RFC3339, createdAtStr)
		if err != nil {
			createdAt = time.Now().UTC()
		}

		t := models.Ticket{ID: id, CreatedAt: createdAt, Segment: segment, City: city, Address: address, Message: message}
		if t.ID == "" {
			errors = append(errors, "ticket id required")
			continue
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

		id := getField(rec, index, "id")
		name := getField(rec, index, "name")
		office := getField(rec, index, "office")
		role := getField(rec, index, "role")
		skillsRaw := getField(rec, index, "skills")
		loadStr := getField(rec, index, "current_load")
		load, _ := strconv.Atoi(loadStr)
		skills := splitSkills(skillsRaw)

		m := models.Manager{ID: id, Name: name, Office: office, Role: role, Skills: skills, CurrentLoad: load, UpdatedAt: time.Now().UTC()}
		if m.ID == "" || m.Name == "" || m.Office == "" {
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

		id := getField(rec, index, "id")
		name := getField(rec, index, "name")
		city := getField(rec, index, "city")
		latStr := getField(rec, index, "lat")
		lonStr := getField(rec, index, "lon")
		lat, _ := strconv.ParseFloat(latStr, 64)
		lon, _ := strconv.ParseFloat(lonStr, 64)

		u := models.BusinessUnit{ID: id, Name: name, City: city, Lat: lat, Lon: lon}
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
		idx[strings.ToLower(strings.TrimSpace(h))] = i
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
}

func validateExt(name string) bool {
	ext := strings.ToLower(filepath.Ext(name))
	return ext == ".csv"
}
