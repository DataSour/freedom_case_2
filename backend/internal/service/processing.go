package service

import (
	"context"
	"encoding/json"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/rs/zerolog"

	"github.com/freedom_case_2/backend/internal/ai"
	"github.com/freedom_case_2/backend/internal/db"
	"github.com/freedom_case_2/backend/internal/models"
	"github.com/freedom_case_2/backend/internal/utils"
)

const (
	StatusAssigned   = "ASSIGNED"
	StatusUnassigned = "UNASSIGNED"
	StatusError      = "ERROR"
)

type ProcessingService struct {
	Store   *db.Store
	AI      ai.Adapter
	Logger  zerolog.Logger
}

type RunSummary struct {
	Events []map[string]any `json:"events"`
	Counts map[string]any   `json:"counts"`
}

func (s *ProcessingService) ProcessTickets(ctx context.Context) (RunSummary, error) {
	tickets, err := s.Store.GetTicketsForProcessing(ctx)
	if err != nil {
		return RunSummary{}, err
	}

	units, err := s.Store.ListBusinessUnits(ctx)
	if err != nil {
		return RunSummary{}, err
	}

	summary := RunSummary{Counts: map[string]any{}}
	start := time.Now()
	summary.Events = append(summary.Events, map[string]any{
		"type": "import_summary",
		"message": "Tickets ready for processing",
		"count": len(tickets),
		"time": time.Now().UTC(),
	})

	var (
		enrichedCount int
		latencyTotal int64
		geoCoverage int
		fallbackCount int
		assignedCount int
		unassignedCount int
		aiErrors int
	)

	for _, t := range tickets {
		aiResult, latencyMs, err := s.AI.AnalyzeTicket(ctx, t)
		if err != nil {
			aiErrors++
			s.writeAssignmentError(ctx, t, "AI_ERROR", "AI enrichment failed", map[string]any{"error": err.Error()})
			continue
		}
		enrichedCount++
		latencyTotal += latencyMs

		office, usedGeo := SelectOffice(t.ID, aiResult, units)
		if usedGeo {
			geoCoverage++
		} else {
			fallbackCount++
		}

		managers, err := s.Store.ListManagersByOffice(ctx, office)
		if err != nil {
			s.writeAssignmentError(ctx, t, "DB_ERROR", "Manager lookup failed", map[string]any{"error": err.Error()})
			continue
		}

		elig := FilterEligibleManagers(managers, t, aiResult)
		if len(elig.Eligible) == 0 {
			unassignedCount++
			s.writeAssignment(ctx, t, aiResult, nil, office, StatusUnassigned, "NO_ELIGIBLE_MANAGERS", "No eligible managers", map[string]any{
				"reasons": elig.Reasons,
			})
			continue
		}

		assignee, top2 := PickAssignee(t.ID, elig.Eligible)
		reasoning := map[string]any{
			"top2":        []string{top2[0].ID},
			"round_robin": utils.HashStringToUint64(t.ID) % uint64(len(top2)),
		}
		if len(top2) == 2 {
			reasoning["top2"] = []string{top2[0].ID, top2[1].ID}
		}

		if err := s.writeAssignment(ctx, t, aiResult, &assignee, office, StatusAssigned, "", "", reasoning); err != nil {
			s.writeAssignmentError(ctx, t, "DB_ERROR", "Assignment write failed", map[string]any{"error": err.Error()})
			continue
		}
		assignedCount++
	}

	summary.Events = append(summary.Events, map[string]any{
		"type": "ai_enrichment",
		"message": "AI enrichment complete",
		"count": enrichedCount,
		"avg_latency_ms": avgLatency(latencyTotal, enrichedCount),
		"errors": aiErrors,
		"time": time.Now().UTC(),
	})

	summary.Events = append(summary.Events, map[string]any{
		"type": "office_selection",
		"geo_coverage": geoCoverage,
		"fallback_count": fallbackCount,
		"time": time.Now().UTC(),
	})

	summary.Events = append(summary.Events, map[string]any{
		"type": "assignment",
		"assigned": assignedCount,
		"unassigned": unassignedCount,
		"time": time.Now().UTC(),
	})

	summary.Events = append(summary.Events, map[string]any{
		"type": "db_save",
		"message": "Processing saved",
		"elapsed_ms": time.Since(start).Milliseconds(),
		"time": time.Now().UTC(),
	})

	summary.Counts["tickets_processed"] = len(tickets)
	summary.Counts["assigned"] = assignedCount
	summary.Counts["unassigned"] = unassignedCount
	summary.Counts["ai_errors"] = aiErrors
	return summary, nil
}

func SelectOffice(ticketID string, ai models.AIAnalysis, units []models.BusinessUnit) (string, bool) {
	if ai.Confidence >= 0.70 && len(units) > 0 {
		minIdx := 0
		minDist := utils.HaversineKm(ai.Lat, ai.Lon, units[0].Lat, units[0].Lon)
		for i := 1; i < len(units); i++ {
			d := utils.HaversineKm(ai.Lat, ai.Lon, units[i].Lat, units[i].Lon)
			if d < minDist {
				minDist = d
				minIdx = i
			}
		}
		return units[minIdx].Name, true
	}

	if utils.HashStringToUint64(ticketID)%2 == 0 {
		return "Astana", false
	}
	return "Almaty", false
}

func (s *ProcessingService) writeAssignment(ctx context.Context, t models.Ticket, aiResult models.AIAnalysis, manager *models.Manager, office string, status string, reasonCode string, reasonText string, reasoning map[string]any) error {
	reasoningJSON, _ := json.Marshal(reasoning)

	return s.Store.WithTx(ctx, func(tx pgxTx) error {
		if err := s.Store.UpsertAIAnalysis(ctx, tx, aiResult); err != nil {
			return err
		}

		var managerID *string
		if manager != nil {
			managerID = &manager.ID
		}

		assignment := models.Assignment{
			TicketID:   t.ID,
			ManagerID:  managerID,
			Office:     office,
			Status:     status,
			ReasonCode: reasonCode,
			ReasonText: reasonText,
			Reasoning:  reasoningJSON,
			AssignedAt: time.Now().UTC(),
		}

		if err := s.Store.UpsertAssignment(ctx, tx, assignment); err != nil {
			return err
		}

		if manager != nil {
			if err := s.Store.UpdateManagerLoad(ctx, tx, manager.ID, 1); err != nil {
				return err
			}
		}
		return nil
	})
}

func (s *ProcessingService) writeAssignmentError(ctx context.Context, t models.Ticket, reasonCode string, reasonText string, details map[string]any) error {
	aiResult := models.AIAnalysis{
		TicketID:  t.ID,
		Type:      "",
		Sentiment: "",
		Priority:  0,
		Language:  "",
		Summary:   "",
		ModelVersion: "",
		CreatedAt: time.Now().UTC(),
	}
	return s.writeAssignment(ctx, t, aiResult, nil, "UNKNOWN", StatusError, reasonCode, reasonText, details)
}

func avgLatency(total int64, count int) int64 {
	if count == 0 {
		return 0
	}
	return total / int64(count)
}

type pgxTx = pgx.Tx
