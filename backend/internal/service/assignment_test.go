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
