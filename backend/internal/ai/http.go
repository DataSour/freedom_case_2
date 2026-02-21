package ai

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"time"

	"github.com/freedom_case_2/backend/internal/models"
)

type HTTPAdapter struct {
	BaseURL string
	Client  *http.Client
}

type requestBody struct {
	TicketID string `json:"ticket_id"`
	Segment  string `json:"segment"`
	City     string `json:"city"`
	Address  string `json:"address"`
	Message  string `json:"message"`
}

type responseBody struct {
	TicketID       string `json:"ticket_id"`
	Type           string `json:"type"`
	Sentiment      string `json:"sentiment"`
	Priority       int    `json:"priority"`
	Language       string `json:"language"`
	Summary        string `json:"summary"`
	Recommendation string `json:"recommendation"`
	Geo            struct {
		Lat        float64 `json:"lat"`
		Lon        float64 `json:"lon"`
		Confidence float64 `json:"confidence"`
	} `json:"geo"`
	ModelVersion string `json:"model_version"`
}

func (h HTTPAdapter) AnalyzeTicket(ctx context.Context, t models.Ticket) (models.AIAnalysis, int64, error) {
	if h.Client == nil {
		h.Client = &http.Client{Timeout: 15 * time.Second}
	}

	payload := requestBody{
		TicketID: t.ID,
		Segment:  t.Segment,
		City:     t.City,
		Address:  t.Address,
		Message:  t.Message,
	}
	b, _ := json.Marshal(payload)
	start := time.Now()

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, h.BaseURL+"/analyze", bytes.NewBuffer(b))
	if err != nil {
		return models.AIAnalysis{}, 0, err
	}
	
	req.Header.Set("Content-Type", "application/json")
	resp, err := h.Client.Do(req)
	if err != nil {
		return models.AIAnalysis{}, time.Since(start).Milliseconds(), err
	}
	defer resp.Body.Close()

	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return models.AIAnalysis{}, time.Since(start).Milliseconds(), errors.New("ai service error")
	}

	var r responseBody
	if err := json.NewDecoder(resp.Body).Decode(&r); err != nil {
		return models.AIAnalysis{}, time.Since(start).Milliseconds(), err
	}

	analysis := models.AIAnalysis{
		TicketID:       t.ID,
		Type:           r.Type,
		Sentiment:      r.Sentiment,
		Priority:       r.Priority,
		Language:       r.Language,
		Summary:        r.Summary,
		Recommendation: r.Recommendation,
		Lat:            r.Geo.Lat,
		Lon:            r.Geo.Lon,
		Confidence:     r.Geo.Confidence,
		ModelVersion:   r.ModelVersion,
		CreatedAt:      time.Now().UTC(),
	}
	return analysis, time.Since(start).Milliseconds(), nil
}
