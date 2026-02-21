package ai

import (
	"context"
	"fmt"
	"time"

	"github.com/freedom_case_2/backend/internal/models"
	"github.com/freedom_case_2/backend/internal/utils"
)

type MockAdapter struct {
	ModelVersion string
}

func (m MockAdapter) AnalyzeTicket(ctx context.Context, t models.Ticket) (models.AIAnalysis, int64, error) {
	start := time.Now()
	h := utils.HashStringToUint64(t.ID)

	priorities := []int{3, 5, 7, 9, 10}
	langs := []string{"RU", "KZ", "ENG"}
	types := []string{"Change of data", "Payment", "Account", "General"}
	sentiments := []string{"positive", "neutral", "negative"}

	priority := priorities[int(h)%len(priorities)]
	language := langs[int(h/7)%len(langs)]
	aiType := types[int(h/13)%len(types)]
	sentiment := sentiments[int(h/17)%len(sentiments)]

	lat := 51.1605
	lon := 71.4704
	if h%2 == 0 {
		lat = 43.2220
		lon = 76.8512
	}
	confidence := 0.75
	if h%5 == 0 {
		confidence = 0.62
	}

	analysis := models.AIAnalysis{
		TicketID:       t.ID,
		Type:           aiType,
		Sentiment:      sentiment,
		Priority:       priority,
		Language:       language,
		Summary:        fmt.Sprintf("Ticket %s auto-summary", t.ID),
		Recommendation: "Follow standard process",
		Lat:            lat,
		Lon:            lon,
		Confidence:     confidence,
		ModelVersion:   m.ModelVersion,
		CreatedAt:      time.Now().UTC(),
	}

	return analysis, time.Since(start).Milliseconds(), nil
}
