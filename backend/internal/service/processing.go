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
	Store  *db.Store
	AI     ai.Adapter
	Logger zerolog.Logger
}

type RunSummary struct {
	Events  []map[string]any `json:"events"`
	Counts  map[string]any   `json:"counts"`
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

	allManagers, err := s.Store.ListManagers(ctx, "", "")
	if err != nil {
		return RunSummary{}, err
	}
	managerByOffice := map[string][]models.Manager{}
	loadMap := map[string]int{}
	for _, m := range allManagers {
		managerByOffice[m.Office] = append(managerByOffice[m.Office], m)
		loadMap[m.ID] = m.CurrentLoad
	}

	summary := RunSummary{Counts: map[string]any{}}
	start := time.Now()
	summary.Events = append(summary.Events, map[string]any{
		"type":    "import_summary",
		"message": "Tickets ready for processing",
		"count":   len(tickets),
		"time":    time.Now().UTC(),
	})

	var (
		enrichedCount            int
		latencyTotal             int64
		geoCoverage              int
		fallbackCount            int
		assignedCount            int
		assignedLocalCount       int
		assignedCrossOfficeCount int
		unassignedCount          int
		unassignedGlobalCount    int
		aiErrors                 int
		topUnassignedReasons     = map[string]int{}
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

		managers := applyLoads(managerByOffice[office], loadMap)
		elig := FilterEligibleManagers(managers, t, aiResult)
		if len(elig.Eligible) == 0 {
			globalManagers := applyLoads(allManagers, loadMap)
			cross := EvaluateCrossOffice(managers, globalManagers, t, aiResult)
			if cross.Assigned {
				assignee, top2 := PickAssignee(t.ID, cross.Global.Eligible)
				hashMod := int(utils.HashStringToUint64(t.ID) % uint64(len(top2)))
				reasoning := buildCrossOfficeReasoning(office, usedGeo, aiResult, cross.Local, cross.Global, true, top2, &assignee, hashMod)
				assignedOffice := assignee.Office
				if assignedOffice == "" {
					assignedOffice = office
				}
				if err := s.writeAssignment(ctx, t, aiResult, &assignee, assignedOffice, StatusAssigned, cross.ReasonCode, cross.ReasonText, reasoning); err != nil {
					s.writeAssignmentError(ctx, t, "DB_ERROR", "Assignment write failed", map[string]any{"error": err.Error()})
					continue
				}
				assignedCount++
				assignedCrossOfficeCount++
				loadMap[assignee.ID] = loadMap[assignee.ID] + 1
				continue
			}

			unassignedCount++
			unassignedGlobalCount++
			reasonCode := cross.ReasonCode
			reasonText := cross.ReasonText
			reasoning := buildCrossOfficeReasoning(office, usedGeo, aiResult, cross.Local, cross.Global, true, nil, nil, 0)
			s.writeAssignment(ctx, t, aiResult, nil, office, StatusUnassigned, reasonCode, reasonText, reasoning)
			unassignedReason := cross.Global.ReasonCode
			if unassignedReason == "" {
				unassignedReason = reasonCode
			}
			topUnassignedReasons[unassignedReason]++
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
		hashMod := int(utils.HashStringToUint64(t.ID) % uint64(len(top2)))
		reasoning := buildCrossOfficeReasoning(office, usedGeo, aiResult, elig, EligibilityResult{}, false, top2, &assignee, hashMod)

		if err := s.writeAssignment(ctx, t, aiResult, &assignee, office, StatusAssigned, "ASSIGNED_LOCAL", "Assigned in local office", reasoning); err != nil {
			s.writeAssignmentError(ctx, t, "DB_ERROR", "Assignment write failed", map[string]any{"error": err.Error()})
			continue
		}
		assignedCount++
		assignedLocalCount++
		loadMap[assignee.ID] = loadMap[assignee.ID] + 1
	}

	summary.Events = append(summary.Events, map[string]any{
		"type":           "ai_enrichment",
		"message":        "AI enrichment complete",
		"count":          enrichedCount,
		"avg_latency_ms": avgLatency(latencyTotal, enrichedCount),
		"errors":         aiErrors,
		"time":           time.Now().UTC(),
	})

	summary.Events = append(summary.Events, map[string]any{
		"type":           "office_selection",
		"geo_coverage":   geoCoverage,
		"fallback_count": fallbackCount,
		"time":           time.Now().UTC(),
	})

	summary.Events = append(summary.Events, map[string]any{
		"type":                  "assignment",
		"assigned":              assignedCount,
		"assigned_local":        assignedLocalCount,
		"assigned_cross_office": assignedCrossOfficeCount,
		"unassigned":            unassignedCount,
		"unassigned_global":     unassignedGlobalCount,
		"time":                  time.Now().UTC(),
	})

	summary.Events = append(summary.Events, map[string]any{
		"type":       "db_save",
		"message":    "Processing saved",
		"elapsed_ms": time.Since(start).Milliseconds(),
		"time":       time.Now().UTC(),
	})

	summary.Counts["tickets_processed"] = len(tickets)
	summary.Counts["assigned"] = assignedCount
	summary.Counts["assigned_local_count"] = assignedLocalCount
	summary.Counts["assigned_cross_office_count"] = assignedCrossOfficeCount
	summary.Counts["unassigned"] = unassignedCount
	summary.Counts["unassigned_global_count"] = unassignedGlobalCount
	summary.Counts["ai_errors"] = aiErrors
	summary.Counts["top_unassigned_reasons"] = topUnassignedReasons
	return summary, nil
}

func SelectOffice(ticketID string, ai models.AIAnalysis, units []models.BusinessUnit) (string, bool) {
	if ai.Confidence >= 0.70 && len(units) > 0 {
		minIdx := -1
		minDist := 0.0
		for i := 0; i < len(units); i++ {
			if units[i].Lat == nil || units[i].Lon == nil {
				continue
			}
			d := utils.HaversineKm(ai.Lat, ai.Lon, *units[i].Lat, *units[i].Lon)
			if minIdx == -1 || d < minDist {
				minDist = d
				minIdx = i
			}
		}
		if minIdx >= 0 {
			return normalizeOfficeEnum(units[minIdx].Name), true
		}
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
		return nil
	})
}

func (s *ProcessingService) writeAssignmentError(ctx context.Context, t models.Ticket, reasonCode string, reasonText string, details map[string]any) error {
	aiResult := models.AIAnalysis{
		TicketID:     t.ID,
		Type:         "",
		Sentiment:    "",
		Priority:     0,
		Language:     "",
		Summary:      "",
		ModelVersion: "",
		CreatedAt:    time.Now().UTC(),
	}
	return s.writeAssignment(ctx, t, aiResult, nil, "UNKNOWN", StatusError, reasonCode, reasonText, details)
}

func avgLatency(total int64, count int) int64 {
	if count == 0 {
		return 0
	}
	return total / int64(count)
}

func applyLoads(managers []models.Manager, loadMap map[string]int) []models.Manager {
	out := make([]models.Manager, 0, len(managers))
	for _, m := range managers {
		if load, ok := loadMap[m.ID]; ok {
			m.CurrentLoad = load
		} else {
			m.CurrentLoad = 0
		}
		out = append(out, m)
	}
	return out
}

func buildCrossOfficeReasoning(office string, usedGeo bool, ai models.AIAnalysis, local EligibilityResult, global EligibilityResult, crossOffice bool, top2 []models.Manager, picked *models.Manager, hashMod int) map[string]any {
	attempts := []map[string]any{}
	localFailed := ""
	if len(local.Eligible) == 0 {
		localFailed = local.ReasonCode
		if localFailed == "" {
			localFailed = "NO_ELIGIBLE_MANAGERS"
		}
	}
	attempts = append(attempts, buildAttempt("LOCAL", office, local, localFailed, false))
	if crossOffice {
		globalFailed := ""
		if len(global.Eligible) == 0 {
			globalFailed = global.ReasonCode
			if globalFailed == "" {
				globalFailed = "NO_ELIGIBLE_MANAGERS"
			}
		}
		attempts = append(attempts, buildAttempt("GLOBAL", "", global, globalFailed, true))
	}

	var top2Payload []map[string]any
	if len(top2) > 0 {
		for _, m := range top2 {
			top2Payload = append(top2Payload, map[string]any{
				"manager_id": m.ID,
				"load":       m.CurrentLoad,
			})
		}
	}

	var pickedPayload map[string]any
	if picked != nil {
		pickedPayload = map[string]any{
			"manager_id": picked.ID,
			"method":     "deterministic_round_robin",
			"hash_mod":   hashMod,
		}
	}

	reasoning := map[string]any{
		"office_selected":       office,
		"office_rule":           map[bool]string{true: "nearest_by_geo", false: "fallback_50_50"}[usedGeo],
		"attempts":              attempts,
		"top2":                  top2Payload,
		"picked":                pickedPayload,
		"fallback_cross_office": crossOffice,
		"geo": map[string]any{
			"lat":        ai.Lat,
			"lon":        ai.Lon,
			"confidence": ai.Confidence,
		},
	}
	return reasoning
}

func buildAttempt(scope string, office string, elig EligibilityResult, failedReason string, fallbackUsed bool) map[string]any {
	counts := map[string]any{
		"in_office":      stageCount(elig, "office_candidates"),
		"after_vip":      stageCount(elig, "vip_rule"),
		"after_role":     stageCount(elig, "role_rule"),
		"after_language": stageCount(elig, "language_rule"),
	}
	attempt := map[string]any{
		"scope":  scope,
		"counts": counts,
	}
	if office != "" {
		attempt["office"] = office
	}
	if fallbackUsed {
		attempt["fallback_used"] = true
	}
	if failedReason != "" {
		attempt["failed_reason_code"] = failedReason
	}
	return attempt
}

func stageCount(elig EligibilityResult, name string) int {
	for _, stage := range elig.Stages {
		if stage.Name == name {
			return len(stage.Candidates)
		}
	}
	return 0
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
