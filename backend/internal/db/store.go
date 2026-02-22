package db

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/freedom_case_2/backend/internal/models"
)

type Store struct {
	Pool *pgxpool.Pool
}

func New(ctx context.Context, databaseURL string) (*Store, error) {
	cfg, err := pgxpool.ParseConfig(databaseURL)
	if err != nil {
		return nil, err
	}
	pool, err := pgxpool.NewWithConfig(ctx, cfg)
	if err != nil {
		return nil, err
	}
	return &Store{Pool: pool}, nil
}

func (s *Store) Close() {
	s.Pool.Close()
}

func (s *Store) Ping(ctx context.Context) error {
	return s.Pool.Ping(ctx)
}

func (s *Store) WithTx(ctx context.Context, fn func(tx pgx.Tx) error) error {
	tx, err := s.Pool.BeginTx(ctx, pgx.TxOptions{})
	if err != nil {
		return err
	}
	defer func() {
		_ = tx.Rollback(ctx)
	}()
	if err := fn(tx); err != nil {
		return err
	}
	return tx.Commit(ctx)
}

func (s *Store) InsertTickets(ctx context.Context, tickets []models.Ticket) (int64, error) {
	rows := make([][]any, 0, len(tickets))
	for _, t := range tickets {
		var raw any
		if strings.TrimSpace(t.RawJSON) != "" {
			raw = t.RawJSON
		} else {
			raw = nil
		}
		rows = append(rows, []any{t.ID, t.CreatedAt, t.Segment, t.City, t.Address, t.Message, raw})
	}
	copyCount, err := s.Pool.CopyFrom(ctx, pgx.Identifier{"tickets"}, []string{"id", "created_at", "segment", "city", "address", "message", "raw_json"}, pgx.CopyFromRows(rows))
	return copyCount, err
}

func (s *Store) UpsertManagers(ctx context.Context, managers []models.Manager) (int64, error) {
	batch := &pgx.Batch{}
	for _, m := range managers {
		batch.Queue(`
			INSERT INTO managers (id, name, office, role, skills, baseline_load, updated_at)
			VALUES ($1, $2, $3, $4, $5, $6, $7)
			ON CONFLICT (id)
			DO UPDATE SET
				name = EXCLUDED.name,
				office = EXCLUDED.office,
				role = EXCLUDED.role,
				skills = EXCLUDED.skills,
				baseline_load = EXCLUDED.baseline_load,
				updated_at = EXCLUDED.updated_at
		`, m.ID, m.Name, m.Office, m.Role, m.Skills, m.BaselineLoad, m.UpdatedAt)
	}
	br := s.Pool.SendBatch(ctx, batch)
	defer br.Close()
	var count int64
	for range managers {
		if _, err := br.Exec(); err != nil {
			return count, err
		}
		count++
	}
	return count, nil
}

func (s *Store) InsertBusinessUnits(ctx context.Context, units []models.BusinessUnit) (int64, error) {
	rows := make([][]any, 0, len(units))
	for _, u := range units {
		rows = append(rows, []any{u.ID, u.Name, u.City, u.Address, u.Lat, u.Lon})
	}
	copyCount, err := s.Pool.CopyFrom(ctx, pgx.Identifier{"business_units"}, []string{"id", "name", "city", "address", "lat", "lon"}, pgx.CopyFromRows(rows))
	return copyCount, err
}

func (s *Store) ListBusinessUnits(ctx context.Context) ([]models.BusinessUnit, error) {
	rows, err := s.Pool.Query(ctx, `SELECT id, name, city, address, lat, lon, geocode_provider, geocode_display_name, geocode_confidence, geocoded_at FROM business_units`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var out []models.BusinessUnit
	for rows.Next() {
		var u models.BusinessUnit
		var lat, lon sql.NullFloat64
		var provider, display sql.NullString
		var confidence sql.NullFloat64
		var geocodedAt sql.NullTime
		if err := rows.Scan(&u.ID, &u.Name, &u.City, &u.Address, &lat, &lon, &provider, &display, &confidence, &geocodedAt); err != nil {
			return nil, err
		}
		if lat.Valid {
			u.Lat = &lat.Float64
		}
		if lon.Valid {
			u.Lon = &lon.Float64
		}
		if provider.Valid {
			u.GeocodeProvider = &provider.String
		}
		if display.Valid {
			u.GeocodeDisplayName = &display.String
		}
		if confidence.Valid {
			u.GeocodeConfidence = &confidence.Float64
		}
		if geocodedAt.Valid {
			u.GeocodedAt = &geocodedAt.Time
		}
		out = append(out, u)
	}
	return out, rows.Err()
}

func (s *Store) ListBusinessUnitsFiltered(ctx context.Context, geocoded *bool, q string) ([]models.BusinessUnit, error) {
	query := `SELECT id, name, city, address, lat, lon, geocode_provider, geocode_display_name, geocode_confidence, geocoded_at FROM business_units`
	var args []any
	var wheres []string
	if geocoded != nil {
		if *geocoded {
			wheres = append(wheres, "lat IS NOT NULL AND lon IS NOT NULL")
		} else {
			wheres = append(wheres, "lat IS NULL OR lon IS NULL")
		}
	}
	if strings.TrimSpace(q) != "" {
		args = append(args, "%"+strings.ToLower(strings.TrimSpace(q))+"%")
		wheres = append(wheres, fmt.Sprintf("(LOWER(name) LIKE $%d OR LOWER(address) LIKE $%d OR LOWER(city) LIKE $%d)", len(args), len(args), len(args)))
	}
	if len(wheres) > 0 {
		query += " WHERE " + strings.Join(wheres, " AND ")
	}
	query += " ORDER BY name ASC"

	rows, err := s.Pool.Query(ctx, query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var out []models.BusinessUnit
	for rows.Next() {
		var u models.BusinessUnit
		var lat, lon sql.NullFloat64
		var provider, display sql.NullString
		var confidence sql.NullFloat64
		var geocodedAt sql.NullTime
		if err := rows.Scan(&u.ID, &u.Name, &u.City, &u.Address, &lat, &lon, &provider, &display, &confidence, &geocodedAt); err != nil {
			return nil, err
		}
		if lat.Valid {
			u.Lat = &lat.Float64
		}
		if lon.Valid {
			u.Lon = &lon.Float64
		}
		if provider.Valid {
			u.GeocodeProvider = &provider.String
		}
		if display.Valid {
			u.GeocodeDisplayName = &display.String
		}
		if confidence.Valid {
			u.GeocodeConfidence = &confidence.Float64
		}
		if geocodedAt.Valid {
			u.GeocodedAt = &geocodedAt.Time
		}
		out = append(out, u)
	}
	return out, rows.Err()
}

func (s *Store) UpdateBusinessUnitGeocode(ctx context.Context, unitID string, lat float64, lon float64, provider string, displayName string, confidence float64, geocodedAt time.Time) error {
	_, err := s.Pool.Exec(ctx, `
		UPDATE business_units
		SET lat = $1,
			lon = $2,
			geocode_provider = $3,
			geocode_display_name = $4,
			geocode_confidence = $5,
			geocoded_at = $6
		WHERE id = $7
	`, lat, lon, provider, displayName, confidence, geocodedAt, unitID)
	return err
}

func (s *Store) ListManagers(ctx context.Context, office string, skill string) ([]models.Manager, error) {
	query := `SELECT m.id, m.name, m.office, m.role, m.skills, COALESCE(m.baseline_load, 0),
		COALESCE(a.cnt, 0) AS current_load,
		COALESCE(m.updated_at, NOW())
		FROM managers m
		LEFT JOIN (
			SELECT manager_id, COUNT(*) AS cnt
			FROM assignments
			WHERE manager_id IS NOT NULL
				AND status IN ('ASSIGNED', 'IN_PROGRESS')
			GROUP BY manager_id
		) a ON a.manager_id = m.id`
	var args []any
	var wheres []string
	if office != "" {
		args = append(args, office)
		wheres = append(wheres, fmt.Sprintf("office = $%d", len(args)))
	}
	if skill != "" {
		args = append(args, skill)
		wheres = append(wheres, fmt.Sprintf("$%d = ANY(skills)", len(args)))
	}
	if len(wheres) > 0 {
		query += " WHERE " + strings.Join(wheres, " AND ")
	}
	query += " ORDER BY current_load ASC, id ASC"

	rows, err := s.Pool.Query(ctx, query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var out []models.Manager
	for rows.Next() {
		var m models.Manager
		if err := rows.Scan(&m.ID, &m.Name, &m.Office, &m.Role, &m.Skills, &m.BaselineLoad, &m.CurrentLoad, &m.UpdatedAt); err != nil {
			return nil, err
		}
		if m.UpdatedAt.IsZero() {
			m.UpdatedAt = time.Now().UTC()
		}
		out = append(out, m)
	}
	return out, rows.Err()
}

func (s *Store) ListManagersByOffice(ctx context.Context, office string) ([]models.Manager, error) {
	rows, err := s.Pool.Query(ctx, `SELECT m.id, m.name, m.office, m.role, m.skills, COALESCE(m.baseline_load, 0),
		COALESCE(a.cnt, 0) AS current_load,
		COALESCE(m.updated_at, NOW())
		FROM managers m
		LEFT JOIN (
			SELECT manager_id, COUNT(*) AS cnt
			FROM assignments
			WHERE manager_id IS NOT NULL
				AND status IN ('ASSIGNED', 'IN_PROGRESS')
			GROUP BY manager_id
		) a ON a.manager_id = m.id
		WHERE m.office = $1
		ORDER BY current_load ASC, m.id ASC`, office)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var out []models.Manager
	for rows.Next() {
		var m models.Manager
		if err := rows.Scan(&m.ID, &m.Name, &m.Office, &m.Role, &m.Skills, &m.BaselineLoad, &m.CurrentLoad, &m.UpdatedAt); err != nil {
			return nil, err
		}
		out = append(out, m)
	}
	return out, rows.Err()
}

func (s *Store) ListTickets(ctx context.Context, status, office, language, q string, limit, offset int) ([]map[string]any, error) {
	if limit <= 0 {
		limit = 50
	}
	if limit > 200 {
		limit = 200
	}
	if offset < 0 {
		offset = 0
	}

	query := `SELECT t.id, t.created_at, t.segment,
		COALESCE(t.city, ''), COALESCE(t.address, ''), COALESCE(t.message, ''),
		a.status, a.office, a.manager_id, a.reason_code, a.reason_text,
		ai.language, ai.priority, ai.type, ai.sentiment
		FROM tickets t
		LEFT JOIN assignments a ON a.ticket_id = t.id
		LEFT JOIN ai_analysis ai ON ai.ticket_id = t.id`
	var args []any
	var wheres []string
	if status != "" {
		args = append(args, status)
		wheres = append(wheres, fmt.Sprintf("a.status = $%d", len(args)))
	}
	if office != "" {
		args = append(args, office)
		wheres = append(wheres, fmt.Sprintf("a.office = $%d", len(args)))
	}
	if language != "" {
		args = append(args, language)
		wheres = append(wheres, fmt.Sprintf("ai.language = $%d", len(args)))
	}
	if q != "" {
		args = append(args, "%"+q+"%")
		wheres = append(wheres, fmt.Sprintf("(t.message ILIKE $%d OR t.id ILIKE $%d)", len(args), len(args)))
	}
	if len(wheres) > 0 {
		query += " WHERE " + strings.Join(wheres, " AND ")
	}
	query += " ORDER BY t.created_at DESC LIMIT $" + fmt.Sprint(len(args)+1) + " OFFSET $" + fmt.Sprint(len(args)+2)
	args = append(args, limit, offset)

	rows, err := s.Pool.Query(ctx, query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var out []map[string]any
	for rows.Next() {
		var (
			id         string
			createdAt  time.Time
			segment    string
			city       string
			address    string
			message    string
			st         *string
			officeVal  *string
			managerID  *string
			reasonCode *string
			reasonText *string
			lang       *string
			priority   *int
			aiType     *string
			sentiment  *string
		)
		if err := rows.Scan(&id, &createdAt, &segment, &city, &address, &message, &st, &officeVal, &managerID, &reasonCode, &reasonText, &lang, &priority, &aiType, &sentiment); err != nil {
			return nil, err
		}
		item := map[string]any{
			"id":          id,
			"created_at":  createdAt,
			"segment":     segment,
			"city":        city,
			"address":     address,
			"message":     message,
			"status":      st,
			"office":      officeVal,
			"manager_id":  managerID,
			"reason_code": reasonCode,
			"reason_text": reasonText,
			"language":    lang,
			"priority":    priority,
			"type":        aiType,
			"sentiment":   sentiment,
		}
		out = append(out, item)
	}
	return out, rows.Err()
}

func (s *Store) GetTicketDetails(ctx context.Context, ticketID string) (map[string]any, error) {
	row := s.Pool.QueryRow(ctx, `
		SELECT t.id, t.created_at, t.segment,
			COALESCE(t.city, ''), COALESCE(t.address, ''), COALESCE(t.message, ''), COALESCE(t.raw_json::text, ''),
			a.id, a.manager_id, a.office, a.status, a.reason_code, a.reason_text, a.reasoning, a.assigned_at,
			ai.id, ai.type, ai.sentiment, ai.priority, ai.language, ai.summary, ai.recommendation, ai.lat, ai.lon, ai.confidence, ai.model_version, ai.created_at
		FROM tickets t
		LEFT JOIN assignments a ON a.ticket_id = t.id
		LEFT JOIN ai_analysis ai ON ai.ticket_id = t.id
		WHERE t.id = $1
	`, ticketID)

	var (
		t            models.Ticket
		aID          *string
		managerID    *string
		aOffice      *string
		aStatus      *string
		reasonCode   *string
		reasonText   *string
		reasoning    []byte
		assignedAt   *time.Time
		aiID         *string
		aiType       *string
		sentiment    *string
		priority     *int
		language     *string
		summary      *string
		rec          *string
		lat          *float64
		lon          *float64
		conf         *float64
		modelVersion *string
		aiCreated    *time.Time
	)

	if err := row.Scan(
		&t.ID, &t.CreatedAt, &t.Segment, &t.City, &t.Address, &t.Message, &t.RawJSON,
		&aID, &managerID, &aOffice, &aStatus, &reasonCode, &reasonText, &reasoning, &assignedAt,
		&aiID, &aiType, &sentiment, &priority, &language, &summary, &rec, &lat, &lon, &conf, &modelVersion, &aiCreated,
	); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, err
		}
		return nil, err
	}

	result := map[string]any{
		"ticket": t,
	}
	if aID != nil {
		var reasoningValue any
		if len(reasoning) > 0 {
			var tmp any
			if err := json.Unmarshal(reasoning, &tmp); err == nil {
				reasoningValue = tmp
			}
		}
		result["assignment"] = map[string]any{
			"id":          *aID,
			"manager_id":  managerID,
			"office":      aOffice,
			"status":      aStatus,
			"reason_code": reasonCode,
			"reason_text": reasonText,
			"reasoning":   reasoningValue,
			"assigned_at": assignedAt,
		}
	}
	if aiID != nil {
		result["ai_analysis"] = map[string]any{
			"id":             *aiID,
			"type":           derefString(aiType),
			"sentiment":      derefString(sentiment),
			"priority":       derefInt(priority),
			"language":       derefString(language),
			"summary":        derefString(summary),
			"recommendation": derefString(rec),
			"lat":            derefFloat(lat),
			"lon":            derefFloat(lon),
			"confidence":     derefFloat(conf),
			"model_version":  derefString(modelVersion),
			"created_at":     aiCreated,
		}
	}
	return result, nil
}

func derefString(v *string) string {
	if v == nil {
		return ""
	}
	return *v
}

func derefInt(v *int) int {
	if v == nil {
		return 0
	}
	return *v
}

func derefFloat(v *float64) float64 {
	if v == nil {
		return 0
	}
	return *v
}

func (s *Store) GetTicketsForProcessing(ctx context.Context) ([]models.Ticket, error) {
	rows, err := s.Pool.Query(ctx, `
		SELECT t.id, t.created_at, t.segment,
			COALESCE(t.city, ''), COALESCE(t.address, ''), COALESCE(t.message, ''), COALESCE(t.raw_json::text, '')
		FROM tickets t
		LEFT JOIN assignments a ON a.ticket_id = t.id
		WHERE a.ticket_id IS NULL
		ORDER BY t.created_at ASC
	`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var out []models.Ticket
	for rows.Next() {
		var t models.Ticket
		if err := rows.Scan(&t.ID, &t.CreatedAt, &t.Segment, &t.City, &t.Address, &t.Message, &t.RawJSON); err != nil {
			return nil, err
		}
		out = append(out, t)
	}
	return out, rows.Err()
}

func (s *Store) UpsertAIAnalysis(ctx context.Context, tx pgx.Tx, ai models.AIAnalysis) error {
	_, err := tx.Exec(ctx, `
		INSERT INTO ai_analysis (ticket_id, type, sentiment, priority, language, summary, recommendation, lat, lon, confidence, model_version, created_at)
		VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
		ON CONFLICT (ticket_id) DO UPDATE SET
			type = EXCLUDED.type,
			sentiment = EXCLUDED.sentiment,
			priority = EXCLUDED.priority,
			language = EXCLUDED.language,
			summary = EXCLUDED.summary,
			recommendation = EXCLUDED.recommendation,
			lat = EXCLUDED.lat,
			lon = EXCLUDED.lon,
			confidence = EXCLUDED.confidence,
			model_version = EXCLUDED.model_version,
			created_at = EXCLUDED.created_at
	`, ai.TicketID, ai.Type, ai.Sentiment, ai.Priority, ai.Language, ai.Summary, ai.Recommendation, ai.Lat, ai.Lon, ai.Confidence, ai.ModelVersion, ai.CreatedAt)
	return err
}

func (s *Store) UpsertAssignment(ctx context.Context, tx pgx.Tx, a models.Assignment) error {
	_, err := tx.Exec(ctx, `
		INSERT INTO assignments (ticket_id, manager_id, office, status, reason_code, reason_text, reasoning, assigned_at)
		VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
		ON CONFLICT (ticket_id) DO UPDATE SET
			manager_id = EXCLUDED.manager_id,
			office = EXCLUDED.office,
			status = EXCLUDED.status,
			reason_code = EXCLUDED.reason_code,
			reason_text = EXCLUDED.reason_text,
			reasoning = EXCLUDED.reasoning,
			assigned_at = EXCLUDED.assigned_at
	`, a.TicketID, a.ManagerID, a.Office, a.Status, a.ReasonCode, a.ReasonText, a.Reasoning, a.AssignedAt)
	return err
}

func (s *Store) UpdateManagerLoad(ctx context.Context, tx pgx.Tx, managerID string, delta int) error {
	_, err := tx.Exec(ctx, `UPDATE managers SET current_load = current_load + $1, updated_at = NOW() WHERE id = $2`, delta, managerID)
	return err
}

func (s *Store) UpdateAssignmentStatus(ctx context.Context, ticketID string, status string) (string, error) {
	var managerID string
	err := s.Pool.QueryRow(ctx, `
		UPDATE assignments
		SET status = $2
		WHERE ticket_id = $1
		RETURNING COALESCE(manager_id, '')
	`, ticketID, status).Scan(&managerID)
	return managerID, err
}

func (s *Store) CreateRun(ctx context.Context, status string) (string, error) {
	var id string
	err := s.Pool.QueryRow(ctx, `INSERT INTO runs (status, started_at) VALUES ($1, NOW()) RETURNING id`, status).Scan(&id)
	return id, err
}

func (s *Store) FinishRun(ctx context.Context, runID string, status string, summary []byte) error {
	_, err := s.Pool.Exec(ctx, `UPDATE runs SET status = $1, summary = $2, finished_at = NOW() WHERE id = $3`, status, summary, runID)
	return err
}

func (s *Store) GetLatestRun(ctx context.Context) (map[string]any, error) {
	row := s.Pool.QueryRow(ctx, `SELECT id, started_at, finished_at, status, summary FROM runs ORDER BY started_at DESC LIMIT 1`)
	var (
		id       string
		started  time.Time
		finished *time.Time
		status   string
		summary  []byte
	)
	if err := row.Scan(&id, &started, &finished, &status, &summary); err != nil {
		return nil, err
	}
	return map[string]any{
		"id":          id,
		"started_at":  started,
		"finished_at": finished,
		"status":      status,
		"summary":     summary,
	}, nil
}

func (s *Store) GetAssignmentManager(ctx context.Context, tx pgx.Tx, ticketID string) (*string, error) {
	var managerID *string
	if err := tx.QueryRow(ctx, `SELECT manager_id FROM assignments WHERE ticket_id = $1`, ticketID).Scan(&managerID); err != nil {
		return nil, err
	}
	return managerID, nil
}

func (s *Store) Reassign(ctx context.Context, ticketID string, managerID string, office string, reasoning []byte, reasonText string, override bool) error {
	return s.WithTx(ctx, func(tx pgx.Tx) error {
		var prevManager *string
		err := tx.QueryRow(ctx, `SELECT manager_id FROM assignments WHERE ticket_id = $1`, ticketID).Scan(&prevManager)
		if err != nil {
			return err
		}

		if prevManager != nil {
			if *prevManager != managerID {
				if err := s.UpdateManagerLoad(ctx, tx, *prevManager, -1); err != nil {
					return err
				}
				if err := s.UpdateManagerLoad(ctx, tx, managerID, 1); err != nil {
					return err
				}
			}
		} else {
			if err := s.UpdateManagerLoad(ctx, tx, managerID, 1); err != nil {
				return err
			}
		}

		status := "ASSIGNED"
		reasonCode := "MANUAL_REASSIGN"
		if override {
			reasonCode = "MANUAL_OVERRIDE"
		}

		_, err = tx.Exec(ctx, `
			UPDATE assignments
			SET manager_id = $1, office = $2, status = $3, reason_code = $4, reason_text = $5, reasoning = $6, assigned_at = NOW()
			WHERE ticket_id = $7
		`, managerID, office, status, reasonCode, reasonText, reasoning, ticketID)
		return err
	})
}

func (s *Store) GetAssistantContext(ctx context.Context) (map[string]any, error) {
	out := map[string]any{}
	var errs []string

	// total tickets
	var totalTickets int
	if err := s.Pool.QueryRow(ctx, `SELECT COUNT(*) FROM tickets`).Scan(&totalTickets); err != nil {
		errs = append(errs, "tickets_count_failed")
	} else {
		out["total_tickets"] = totalTickets
	}

	// total managers
	var totalManagers int
	if err := s.Pool.QueryRow(ctx, `SELECT COUNT(*) FROM managers`).Scan(&totalManagers); err != nil {
		errs = append(errs, "managers_count_failed")
	} else {
		out["total_managers"] = totalManagers
	}

	// total business units
	var totalUnits int
	if err := s.Pool.QueryRow(ctx, `SELECT COUNT(*) FROM business_units`).Scan(&totalUnits); err != nil {
		errs = append(errs, "business_units_count_failed")
	} else {
		out["total_business_units"] = totalUnits
		out["total_offices"] = totalUnits
	}

	// assignment counts
	assignCounts := map[string]int{}
	rows, err := s.Pool.Query(ctx, `SELECT status, COUNT(*) FROM assignments GROUP BY status`)
	if err != nil {
		errs = append(errs, "assignment_counts_failed")
	} else {
		defer rows.Close()
		for rows.Next() {
			var status string
			var count int
			if scanErr := rows.Scan(&status, &count); scanErr == nil {
				assignCounts[status] = count
			}
		}
		out["assignment_counts"] = assignCounts
	}

	// top unassigned reasons
	var unassignedReasons []map[string]any
	rows, err = s.Pool.Query(ctx, `
		SELECT COALESCE(reason_code, 'UNKNOWN'), COUNT(*)
		FROM assignments
		WHERE status = 'UNASSIGNED'
		GROUP BY reason_code
		ORDER BY COUNT(*) DESC
		LIMIT 5
	`)
	if err != nil {
		errs = append(errs, "unassigned_reasons_failed")
	} else {
		defer rows.Close()
		for rows.Next() {
			var reason string
			var count int
			if scanErr := rows.Scan(&reason, &count); scanErr == nil {
				unassignedReasons = append(unassignedReasons, map[string]any{
					"reason_code": reason,
					"count":       count,
				})
			}
		}
		out["top_unassigned_reasons"] = unassignedReasons
	}

	// top managers by load
	var topManagers []map[string]any
	rows, err = s.Pool.Query(ctx, `
		SELECT id, name, office, current_load
		FROM managers
		ORDER BY current_load DESC, id ASC
		LIMIT 5
	`)
	if err != nil {
		errs = append(errs, "top_managers_failed")
	} else {
		defer rows.Close()
		for rows.Next() {
			var id, name, office string
			var load int
			if scanErr := rows.Scan(&id, &name, &office, &load); scanErr == nil {
				topManagers = append(topManagers, map[string]any{
					"id":           id,
					"name":         name,
					"office":       office,
					"current_load": load,
				})
			}
		}
		out["top_managers_by_load"] = topManagers
	}

	// tickets by office
	var officeDist []map[string]any
	rows, err = s.Pool.Query(ctx, `
		SELECT COALESCE(office, 'UNASSIGNED') AS office, COUNT(*)
		FROM assignments
		GROUP BY office
		ORDER BY COUNT(*) DESC
		LIMIT 10
	`)
	if err != nil {
		errs = append(errs, "office_distribution_failed")
	} else {
		defer rows.Close()
		for rows.Next() {
			var office string
			var count int
			if scanErr := rows.Scan(&office, &count); scanErr == nil {
				officeDist = append(officeDist, map[string]any{
					"office": office,
					"count":  count,
				})
			}
		}
		out["office_distribution"] = officeDist
	}

	// latest run summary
	if latest, err := s.GetLatestRun(ctx); err == nil {
		var summary any
		if b, ok := latest["summary"].([]byte); ok && len(b) > 0 {
			_ = json.Unmarshal(b, &summary)
		}
		out["latest_run"] = map[string]any{
			"id":          latest["id"],
			"status":      latest["status"],
			"started_at":  latest["started_at"],
			"finished_at": latest["finished_at"],
			"summary":     summary,
		}
	}

	if len(errs) > 0 {
		out["context_errors"] = errs
	}

	return out, nil
}
