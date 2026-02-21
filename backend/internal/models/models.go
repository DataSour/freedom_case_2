package models

import "time"

type Ticket struct {
	ID        string    `json:"id"`
	CreatedAt time.Time `json:"created_at"`
	Segment   string    `json:"segment"`
	City      string    `json:"city"`
	Address   string    `json:"address"`
	Message   string    `json:"message"`
	RawJSON   string    `json:"raw_json,omitempty"`
}

type Manager struct {
	ID          string    `json:"id"`
	Name        string    `json:"name"`
	Office      string    `json:"office"`
	Role        string    `json:"role"`
	Skills      []string  `json:"skills"`
	CurrentLoad int       `json:"current_load"`
	UpdatedAt   time.Time `json:"updated_at"`
}

type BusinessUnit struct {
	ID   string  `json:"id"`
	Name string  `json:"name"`
	City string  `json:"city"`
	Lat  float64 `json:"lat"`
	Lon  float64 `json:"lon"`
}

type AIAnalysis struct {
	ID             string    `json:"id"`
	TicketID       string    `json:"ticket_id"`
	Type           string    `json:"type"`
	Sentiment      string    `json:"sentiment"`
	Priority       int       `json:"priority"`
	Language       string    `json:"language"`
	Summary        string    `json:"summary"`
	Recommendation string    `json:"recommendation"`
	Lat            float64   `json:"lat"`
	Lon            float64   `json:"lon"`
	Confidence     float64   `json:"confidence"`
	ModelVersion   string    `json:"model_version"`
	CreatedAt      time.Time `json:"created_at"`
}

type Assignment struct {
	ID         string    `json:"id"`
	TicketID   string    `json:"ticket_id"`
	ManagerID  *string   `json:"manager_id"`
	Office     string    `json:"office"`
	Status     string    `json:"status"`
	ReasonCode string    `json:"reason_code"`
	ReasonText string    `json:"reason_text"`
	Reasoning  []byte    `json:"reasoning"`
	AssignedAt time.Time `json:"assigned_at"`
}

type Run struct {
	ID         string    `json:"id"`
	StartedAt  time.Time `json:"started_at"`
	FinishedAt time.Time `json:"finished_at"`
	Status     string    `json:"status"`
	Summary    []byte    `json:"summary"`
}
