package tasks

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// Store reads and writes tasks and attempts.
type Store struct {
	DB *pgxpool.Pool
}

const taskColumns = `id, workspace_id, coalesce(key_id::text, ''), coalesce(parent_id, ''), target_type, target_id,
	coalesce(model_id, ''), coalesce(version_id, ''), coalesce(app_release, 0), status, coalesce(stage, ''), progress,
	input, output, coalesce(error_code, ''), coalesce(error_message, ''), units, coalesce(unit, ''),
	price_micros, cost_micros, coalesce(webhook_url, ''), metadata, created_at, started_at, finished_at`

func scanTask(row pgx.Row) (Task, error) {
	var t Task
	var progress *int16
	var units *float64
	err := row.Scan(&t.ID, &t.WorkspaceID, &t.KeyID, &t.ParentID, &t.Target.Type, &t.Target.ID,
		&t.ModelID, &t.VersionID, &t.AppRelease, &t.Status, &t.Stage, &progress,
		&t.Input, &t.Output, &t.ErrorCode, &t.ErrorMessage, &units, &t.Unit,
		&t.PriceMicros, &t.CostMicros, &t.WebhookURL, &t.Metadata, &t.CreatedAt, &t.StartedAt, &t.FinishedAt)
	if errors.Is(err, pgx.ErrNoRows) {
		return t, ErrNotFound
	}
	if progress != nil {
		p := int(*progress)
		t.Progress = &p
	}
	t.Units = units
	return t, err
}

// Insert writes a new task inside tx. When the workspace already has a task
// with the same idempotency key, it returns that one with created false.
func (s *Store) Insert(ctx context.Context, tx pgx.Tx, t Task, idempotencyKey string) (Task, bool, error) {
	var key *string
	if idempotencyKey != "" {
		key = &idempotencyKey
	}
	metadata := t.Metadata
	if len(metadata) == 0 {
		metadata = json.RawMessage(`{}`)
	}
	tag, err := tx.Exec(ctx, `
		insert into tasks (id, workspace_id, key_id, parent_id, target_type, target_id, model_id, version_id,
			status, input, webhook_url, metadata, idempotency_key)
		values ($1, $2, nullif($3, '')::uuid, nullif($4, ''), $5, $6, nullif($7, ''), nullif($8, ''),
			$9, $10, nullif($11, ''), $12, $13)
		on conflict (workspace_id, idempotency_key) do nothing`,
		t.ID, t.WorkspaceID, t.KeyID, t.ParentID, t.Target.Type, t.Target.ID, t.ModelID, t.VersionID,
		t.Status, t.Input, t.WebhookURL, metadata, key)
	if err != nil {
		return Task{}, false, fmt.Errorf("inserting task: %w", err)
	}
	if tag.RowsAffected() == 0 {
		existing, err := scanTask(tx.QueryRow(ctx, `select `+taskColumns+` from tasks
			where workspace_id = $1 and idempotency_key = $2`, t.WorkspaceID, idempotencyKey))
		return existing, false, err
	}
	created, err := scanTask(tx.QueryRow(ctx, `select `+taskColumns+` from tasks where id = $1`, t.ID))
	return created, true, err
}

// Get reads a task by ID, whoever owns it. Worker and admin only.
func (s *Store) Get(ctx context.Context, id string) (Task, error) {
	return scanTask(s.DB.QueryRow(ctx, `select `+taskColumns+` from tasks where id = $1`, id))
}

// GetFor reads a top-level task of a workspace; other workspaces' tasks and
// app steps don't exist for it.
func (s *Store) GetFor(ctx context.Context, workspaceID, id string) (Task, error) {
	return scanTask(s.DB.QueryRow(ctx, `select `+taskColumns+` from tasks
		where id = $1 and workspace_id = $2 and parent_id is null`, id, workspaceID))
}

// ListFilter narrows a workspace's task list.
type ListFilter struct {
	Status Status
	// Target matches a model ID ("publisher/slug") or an app slug.
	Target string
	// Before is the cursor: the last ID of the previous page.
	Before string
	Limit  int
}

// List returns a workspace's top-level tasks, newest first.
func (s *Store) List(ctx context.Context, workspaceID string, f ListFilter) ([]Task, error) {
	limit := f.Limit
	if limit <= 0 || limit > 100 {
		limit = 20
	}
	rows, err := s.DB.Query(ctx, `select `+taskColumns+` from tasks
		where workspace_id = $1 and parent_id is null
			and ($2 = '' or status = $2)
			and ($3 = '' or target_id = $3)
			and ($4 = '' or id < $4)
		order by id desc limit $5`, workspaceID, string(f.Status), f.Target, f.Before, limit)
	if err != nil {
		return nil, err
	}
	return pgx.CollectRows(rows, func(row pgx.CollectableRow) (Task, error) { return scanTask(row) })
}

// Start marks a queued task running.
func (s *Store) Start(ctx context.Context, id string, at time.Time) error {
	_, err := s.DB.Exec(ctx, `update tasks set status = 'running', started_at = coalesce(started_at, $2)
		where id = $1 and status in ('queued', 'running')`, id, at)
	return err
}

// Succeed records the output and what it cost.
func (s *Store) Succeed(ctx context.Context, id string, output json.RawMessage, units float64, unit string, priceMicros, costMicros int64, at time.Time) error {
	return s.finish(ctx, `update tasks set status = 'succeeded', output = $2, units = $3, unit = $4,
		price_micros = $5, cost_micros = $6, finished_at = $7, error_code = null, error_message = null
		where id = $1 and status in ('queued', 'running')`, id, output, units, unit, priceMicros, costMicros, at)
}

// Fail records the public error.
func (s *Store) Fail(ctx context.Context, id, code, message string, at time.Time) error {
	return s.finish(ctx, `update tasks set status = 'failed', error_code = $2, error_message = $3, finished_at = $4
		where id = $1 and status in ('queued', 'running')`, id, code, message, at)
}

// Cancel stops a task that hasn't finished.
func (s *Store) Cancel(ctx context.Context, id string, at time.Time) error {
	return s.finish(ctx, `update tasks set status = 'canceled', finished_at = $2
		where id = $1 and status in ('queued', 'running')`, id, at)
}

func (s *Store) finish(ctx context.Context, sql string, args ...any) error {
	tag, err := s.DB.Exec(ctx, sql, args...)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return ErrFinal
	}
	return nil
}

// Attempts reads a task's attempts in order.
func (s *Store) Attempts(ctx context.Context, taskID string) ([]Attempt, error) {
	rows, err := s.DB.Query(ctx, `select task_id, number, coalesce(route_id::text, ''), provider_id, upstream_model,
			coalesce(upstream_id, ''), status, coalesce(error, ''), latency_ms, started_at, finished_at
		from attempts where task_id = $1 order by number`, taskID)
	if err != nil {
		return nil, err
	}
	return pgx.CollectRows(rows, func(row pgx.CollectableRow) (Attempt, error) {
		var a Attempt
		err := row.Scan(&a.TaskID, &a.Number, &a.RouteID, &a.ProviderID, &a.UpstreamModel, &a.UpstreamID,
			&a.Status, &a.Error, &a.LatencyMs, &a.StartedAt, &a.FinishedAt)
		return a, err
	})
}

// StartAttempt records a new attempt.
func (s *Store) StartAttempt(ctx context.Context, a Attempt) error {
	_, err := s.DB.Exec(ctx, `insert into attempts (task_id, number, route_id, provider_id, upstream_model, upstream_id, status, started_at)
		values ($1, $2, nullif($3, '')::uuid, $4, $5, nullif($6, ''), 'running', $7)`,
		a.TaskID, a.Number, a.RouteID, a.ProviderID, a.UpstreamModel, a.UpstreamID, a.StartedAt)
	return err
}

// SetUpstreamID stores the provider's job ID once Submit returns it.
func (s *Store) SetUpstreamID(ctx context.Context, taskID string, number int, upstreamID string) error {
	_, err := s.DB.Exec(ctx, `update attempts set upstream_id = $3 where task_id = $1 and number = $2`, taskID, number, upstreamID)
	return err
}

// EndAttempt records how an attempt ended.
func (s *Store) EndAttempt(ctx context.Context, taskID string, number int, status, errText string, at time.Time) error {
	_, err := s.DB.Exec(ctx, `update attempts set status = $3, error = nullif($4, ''), finished_at = $5,
			latency_ms = (extract(epoch from ($5 - started_at)) * 1000)::int
		where task_id = $1 and number = $2`, taskID, number, status, errText, at)
	return err
}
