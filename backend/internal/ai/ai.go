package ai

import (
	"context"

	"github.com/freedom_case_2/backend/internal/models"
)

type Adapter interface {
	AnalyzeTicket(ctx context.Context, t models.Ticket) (models.AIAnalysis, int64, error)
}
