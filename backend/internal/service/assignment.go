package service

import (
	"sort"
	"strings"

	"github.com/freedom_case_2/backend/internal/models"
	"github.com/freedom_case_2/backend/internal/utils"
)

type EligibilityResult struct {
	Eligible []models.Manager
	Reasons  []string
}

func FilterEligibleManagers(managers []models.Manager, ticket models.Ticket, ai models.AIAnalysis) EligibilityResult {
	var eligible []models.Manager
	var reasons []string

	needsVIP := strings.EqualFold(ticket.Segment, "VIP") || ai.Priority >= 9
	needsRole := strings.EqualFold(ai.Type, "Change of data")
	needsLang := ai.Language

	for _, m := range managers {
		if needsVIP && !hasSkill(m.Skills, "VIP") {
			continue
		}
		if needsRole && !strings.EqualFold(m.Role, "Глав спец") {
			continue
		}
		if needsLang != "" && (needsLang == "KZ" || needsLang == "ENG" || needsLang == "RU") {
			if !hasSkill(m.Skills, needsLang) {
				continue
			}
		}
		eligible = append(eligible, m)
	}

	if len(eligible) == 0 {
		if needsVIP {
			reasons = append(reasons, "VIP_REQUIRED")
		}
		if needsRole {
			reasons = append(reasons, "ROLE_REQUIRED")
		}
		if needsLang != "" {
			reasons = append(reasons, "LANGUAGE_REQUIRED")
		}
	}

	return EligibilityResult{Eligible: eligible, Reasons: reasons}
}

func PickAssignee(ticketID string, eligible []models.Manager) (models.Manager, []models.Manager) {
	sort.Slice(eligible, func(i, j int) bool {
		if eligible[i].CurrentLoad == eligible[j].CurrentLoad {
			return eligible[i].ID < eligible[j].ID
		}
		return eligible[i].CurrentLoad < eligible[j].CurrentLoad
	})

	if len(eligible) <= 2 {
		idx := int(utils.HashStringToUint64(ticketID) % uint64(len(eligible)))
		return eligible[idx], eligible
	}

	top2 := eligible[:2]
	idx := int(utils.HashStringToUint64(ticketID) % 2)
	return top2[idx], top2
}

func hasSkill(skills []string, target string) bool {
	for _, s := range skills {
		if strings.EqualFold(strings.TrimSpace(s), target) {
			return true
		}
	}
	return false
}
