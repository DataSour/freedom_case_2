package service

import (
	"testing"

	"github.com/freedom_case_2/backend/internal/models"
)

func TestFilterEligibleManagers(t *testing.T) {
	managers := []models.Manager{
		{ID: "m1", Role: "Глав спец", Skills: []string{"VIP", "RU"}},
		{ID: "m2", Role: "Оператор", Skills: []string{"RU"}},
		{ID: "m3", Role: "Глав спец", Skills: []string{"ENG"}},
	}
	ticket := models.Ticket{ID: "t1", Segment: "VIP"}
	ai := models.AIAnalysis{Type: "Change of data", Priority: 9, Language: "RU"}

	res := FilterEligibleManagers(managers, ticket, ai)
	if len(res.Eligible) != 1 || res.Eligible[0].ID != "m1" {
		t.Fatalf("expected only m1 eligible, got %+v", res.Eligible)
	}
}

func TestPickAssigneeDeterministic(t *testing.T) {
	eligible := []models.Manager{
		{ID: "m1", CurrentLoad: 5},
		{ID: "m2", CurrentLoad: 1},
		{ID: "m3", CurrentLoad: 1},
	}
	assignee1, top2 := PickAssignee("ticket-1", eligible)
	assignee2, _ := PickAssignee("ticket-1", eligible)
	if assignee1.ID != assignee2.ID {
		t.Fatalf("expected deterministic assignment")
	}
	if len(top2) != 2 {
		t.Fatalf("expected top2 length 2")
	}
}

func TestPickAssigneeUsesDerivedLoad(t *testing.T) {
	managers := []models.Manager{
		{ID: "m1", CurrentLoad: 5},
		{ID: "m2", CurrentLoad: 1},
		{ID: "m3", CurrentLoad: 3},
	}
	assignee, _ := PickAssignee("ticket-99", managers)
	if assignee.ID != "m2" {
		t.Fatalf("expected manager with smaller load to be picked first, got %s", assignee.ID)
	}
}

func TestEvaluateCrossOffice_AssignsWhenGlobalHasVIP(t *testing.T) {
	local := []models.Manager{
		{ID: "m1", Office: "ASTANA", Role: "Специалист", Skills: []string{"RU"}},
	}
	global := []models.Manager{
		{ID: "m1", Office: "ASTANA", Role: "Специалист", Skills: []string{"RU"}},
		{ID: "m2", Office: "ALMATY", Role: "Специалист", Skills: []string{"VIP", "RU"}},
	}
	ticket := models.Ticket{ID: "t1", Segment: "VIP"}
	ai := models.AIAnalysis{Type: "Consultation", Priority: 1, Language: "RU"}

	res := EvaluateCrossOffice(local, global, ticket, ai)
	if !res.Assigned || !res.CrossOffice {
		t.Fatalf("expected cross-office assignment, got %+v", res)
	}
	if res.ReasonCode != "ASSIGNED_CROSS_OFFICE" {
		t.Fatalf("expected ASSIGNED_CROSS_OFFICE, got %s", res.ReasonCode)
	}
	if len(res.Global.Eligible) == 0 {
		t.Fatalf("expected global eligible managers")
	}
}

func TestEvaluateCrossOffice_UnassignedWhenNoVIPAnywhere(t *testing.T) {
	local := []models.Manager{
		{ID: "m1", Office: "ASTANA", Role: "Специалист", Skills: []string{"RU"}},
	}
	global := []models.Manager{
		{ID: "m1", Office: "ASTANA", Role: "Специалист", Skills: []string{"RU"}},
		{ID: "m2", Office: "ALMATY", Role: "Специалист", Skills: []string{"ENG"}},
	}
	ticket := models.Ticket{ID: "t1", Segment: "VIP"}
	ai := models.AIAnalysis{Type: "Consultation", Priority: 1, Language: "RU"}

	res := EvaluateCrossOffice(local, global, ticket, ai)
	if res.Assigned {
		t.Fatalf("expected unassigned globally, got %+v", res)
	}
	if res.ReasonCode != "NO_ELIGIBLE_MANAGERS_GLOBAL" {
		t.Fatalf("expected NO_ELIGIBLE_MANAGERS_GLOBAL, got %s", res.ReasonCode)
	}
	if res.Global.ReasonCode != "VIP_REQUIRED_NO_MATCH" {
		t.Fatalf("expected VIP_REQUIRED_NO_MATCH, got %s", res.Global.ReasonCode)
	}
}
