package service

import (
	"sort"
	"strings"

	"github.com/freedom_case_2/backend/internal/models"
	"github.com/freedom_case_2/backend/internal/utils"
)

type EligibilityResult struct {
	Eligible   []models.Manager
	ReasonCode string
	ReasonText string
	Stages     []EligibilityStage
	NeedsVIP   bool
	NeedsRole  bool
	NeedsLang  string
}

type EligibilityStage struct {
	Name       string
	Candidates []models.Manager
}

func FilterEligibleManagers(managers []models.Manager, ticket models.Ticket, ai models.AIAnalysis) EligibilityResult {
	needsVIP := strings.EqualFold(strings.TrimSpace(ticket.Segment), "VIP") || ai.Priority >= 9
	needsRole := strings.EqualFold(strings.TrimSpace(ai.Type), "Change of data")
	needsLang := strings.ToUpper(strings.TrimSpace(ai.Language))

	result := EligibilityResult{
		NeedsVIP:  needsVIP,
		NeedsRole: needsRole,
		NeedsLang: needsLang,
	}

	result.Stages = append(result.Stages, EligibilityStage{
		Name:       "office_candidates",
		Candidates: managers,
	})

	if len(managers) == 0 {
		result.ReasonCode = "NO_ELIGIBLE_MANAGERS"
		result.ReasonText = "No managers in selected office"
		return result
	}

	afterVIP := managers
	if needsVIP {
		afterVIP = filterManagers(afterVIP, func(m models.Manager) bool {
			return hasSkill(m.Skills, "VIP")
		})
	}
	result.Stages = append(result.Stages, EligibilityStage{
		Name:       "vip_rule",
		Candidates: afterVIP,
	})
	if needsVIP && len(afterVIP) == 0 {
		result.ReasonCode = "VIP_REQUIRED_NO_MATCH"
		result.ReasonText = "VIP skill required"
		return result
	}

	afterRole := afterVIP
	if needsRole {
		afterRole = filterManagers(afterRole, func(m models.Manager) bool {
			return strings.EqualFold(strings.TrimSpace(m.Role), "Глав спец")
		})
	}
	result.Stages = append(result.Stages, EligibilityStage{
		Name:       "role_rule",
		Candidates: afterRole,
	})
	if needsRole && len(afterRole) == 0 {
		result.ReasonCode = "ROLE_MISMATCH"
		result.ReasonText = "Role must be Глав спец"
		return result
	}

	afterLang := afterRole
	if needsLang == "KZ" || needsLang == "ENG" || needsLang == "RU" {
		afterLang = filterManagers(afterLang, func(m models.Manager) bool {
			return hasSkill(m.Skills, needsLang)
		})
	}
	result.Stages = append(result.Stages, EligibilityStage{
		Name:       "language_rule",
		Candidates: afterLang,
	})
	if (needsLang == "KZ" || needsLang == "ENG" || needsLang == "RU") && len(afterLang) == 0 {
		result.ReasonCode = "LANGUAGE_MISMATCH"
		result.ReasonText = "Language skill required"
		return result
	}

	result.Eligible = afterLang
	return result
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

func filterManagers(managers []models.Manager, keep func(models.Manager) bool) []models.Manager {
	out := make([]models.Manager, 0, len(managers))
	for _, m := range managers {
		if keep(m) {
			out = append(out, m)
		}
	}
	return out
}
