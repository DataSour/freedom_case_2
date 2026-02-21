package service

import (
	"context"
	"encoding/json"
	"strings"
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
	Samples []map[string]any `json:"samples,omitempty"`
}

func (s *ProcessingService) ProcessTickets(ctx context.Context, debug bool) (RunSummary, error) {
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
		aiResult = normalizeAI(aiResult)
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
			reasonCode := elig.ReasonCode
			reasonText := elig.ReasonText
			if reasonCode == "" {
				reasonCode = "NO_ELIGIBLE_MANAGERS"
				reasonText = "No eligible managers"
			}
			reasoning := buildReasoning(office, usedGeo, aiResult, elig)
			s.writeAssignment(ctx, t, aiResult, nil, office, StatusUnassigned, reasonCode, reasonText, reasoning)
			if debug && len(summary.Samples) < 5 {
				summary.Samples = append(summary.Samples, map[string]any{
					"ticket_id":   t.ID,
					"reason_code": reasonCode,
					"reason_text": reasonText,
					"reasoning":   reasoning,
				})
			}
			continue
		}

		assignee, top2 := PickAssignee(t.ID, elig.Eligible)
		reasoning := buildReasoning(office, usedGeo, aiResult, elig)
		reasoning["top2"] = []string{top2[0].ID}
		reasoning["round_robin"] = utils.HashStringToUint64(t.ID) % uint64(len(top2))
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
		return normalizeOfficeEnum(units[minIdx].Name), true
	}

	if utils.HashStringToUint64(ticketID)%2 == 0 {
		return "ASTANA", false
	}
	return "ALMATY", false
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

func buildReasoning(office string, usedGeo bool, ai models.AIAnalysis, elig EligibilityResult) map[string]any {
	stageCounts := map[string]any{}
	stageIDs := map[string]any{}
	for _, stage := range elig.Stages {
		stageCounts[stage.Name] = map[string]any{
			"count": len(stage.Candidates),
		}
		var ids []string
		for _, m := range stage.Candidates {
			ids = append(ids, m.ID)
		}
		stageIDs[stage.Name] = ids
	}

	reasoning := map[string]any{
		"office": map[string]any{
			"selected": office,
			"rule":     map[bool]string{true: "nearest_by_geo", false: "fallback_50_50"}[usedGeo],
			"geo": map[string]any{
				"lat":        ai.Lat,
				"lon":        ai.Lon,
				"confidence": ai.Confidence,
			},
		},
		"rules": map[string]any{
			"needs_vip":  elig.NeedsVIP,
			"needs_role": elig.NeedsRole,
			"needs_lang": elig.NeedsLang,
		},
		"stages": map[string]any{
			"counts": stageCounts,
			"ids":    stageIDs,
		},
	}
	return reasoning
}

func normalizeAI(ai models.AIAnalysis) models.AIAnalysis {
	ai.Type = normalizeAIType(ai.Type)
	ai.Language = normalizeLanguage(ai.Language)
	return ai
}

// NormalizeAI exposes AI normalization for debug endpoint usage.
func NormalizeAI(ai models.AIAnalysis) models.AIAnalysis {
	return normalizeAI(ai)
}

func normalizeAIType(value string) string {
	v := strings.ToLower(strings.TrimSpace(value))
	switch v {
	case "complaint", "жалоба":
		return "Complaint"
	case "consultation", "консультация":
		return "Consultation"
	case "fraud", "мошеннические действия":
		return "Fraud"
	case "change of data", "смена данных":
		return "Change of data"
	case "technical issue", "нерaботоспособность приложения", "неработоспособность приложения":
		return "Technical issue"
	case "spam", "спам":
		return "Spam"
	default:
		return strings.TrimSpace(value)
	}
}

func normalizeLanguage(value string) string {
	v := strings.ToUpper(strings.TrimSpace(value))
	switch v {
	case "RU", "RUS", "RUSSIAN":
		return "RU"
	case "KZ", "KAZ", "KAZAKH":
		return "KZ"
	case "EN", "ENG", "ENGLISH":
		return "ENG"
	default:
		return v
	}
}

func normalizeOfficeEnum(value string) string {
	v := strings.ToLower(strings.TrimSpace(value))
	if v == "" {
		return ""
	}
	if strings.Contains(v, "астан") || strings.Contains(v, "astan") || strings.Contains(v, "nur-sultan") || strings.Contains(v, "nursultan") {
		return "ASTANA"
	}
	if strings.Contains(v, "алмат") || strings.Contains(v, "almat") {
		return "ALMATY"
	}
	return strings.TrimSpace(value)
}

type pgxTx = pgx.Tx
