package tasks

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"slices"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/brieeflabs/modelvend/services/internal/billing"
)

// Store reads and writes tasks and attempts.
type Store struct {
	DB *pgxpool.Pool
}

const taskColumns = `id, workspace_id, coalesce(key_id::text, ''), coalesce(parent_id, ''), target_type, target_id,
	coalesce(model_id, ''), coalesce(version_id, ''), coalesce(app_release, 0), status, coalesce(stage, ''), progress,
	input, output, coalesce(error_code, ''), coalesce(error_message, ''), units, coalesce(unit, ''),
	price_micros, cost_micros, hold_micros, coalesce(webhook_url, ''), metadata, created_at, started_at, finished_at`

// scanTask reads taskColumns, then any extra columns selected after them into extra.
func scanTask(row pgx.Row, extra ...any) (Task, error) {
	var t Task
	var progress *int16
	var units *float64
	err := row.Scan(append([]any{&t.ID, &t.WorkspaceID, &t.KeyID, &t.ParentID, &t.Target.Type, &t.Target.ID,
		&t.ModelID, &t.VersionID, &t.AppRelease, &t.Status, &t.Stage, &progress,
		&t.Input, &t.Output, &t.ErrorCode, &t.ErrorMessage, &units, &t.Unit,
		&t.PriceMicros, &t.CostMicros, &t.HoldMicros, &t.WebhookURL, &t.Metadata, &t.CreatedAt, &t.StartedAt, &t.FinishedAt},
		extra...)...)
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

// IdempotencyWindow is how long an idempotency key answers with its task.
// After it the key is free again and starts a new task.
const IdempotencyWindow = 24 * time.Hour

// Idempotency is a caller's idempotency key and the fingerprint of the request
// it came with.
type Idempotency struct {
	Key         string
	Fingerprint string
}

// querier is what the pool and a transaction both offer.
type querier interface {
	QueryRow(ctx context.Context, sql string, args ...any) pgx.Row
}

// Replay returns the workspace's task that idem.Key created at or after
// since: ErrNotFound when there is none, ErrIdempotencyKeyReused when a
// different request created it.
func (s *Store) Replay(ctx context.Context, q querier, workspaceID string, idem Idempotency, since time.Time) (Task, error) {
	var fingerprint string
	t, err := scanTask(q.QueryRow(ctx, `select `+taskColumns+`, coalesce(idempotency_fingerprint, '') from tasks
		where workspace_id = $1 and idempotency_key = $2 and created_at >= $3`, workspaceID, idem.Key, since), &fingerprint)
	if err != nil {
		return Task{}, err
	}
	// Tasks from before fingerprints were recorded can't be compared.
	if fingerprint != "" && fingerprint != idem.Fingerprint {
		return Task{}, ErrIdempotencyKeyReused
	}
	return t, nil
}

// ReleaseIdempotencyKey frees key when its task was created before cutoff,
// so a new task may take it. The old task keeps everything but the key.
func (s *Store) ReleaseIdempotencyKey(ctx context.Context, tx pgx.Tx, workspaceID, key string, cutoff time.Time) error {
	_, err := tx.Exec(ctx, `update tasks set idempotency_key = null
		where workspace_id = $1 and idempotency_key = $2 and created_at < $3`, workspaceID, key, cutoff)
	return err
}

// Insert writes a new task inside tx. When the workspace already has a task
// with the same idempotency key, it returns that one with created false, or
// ErrIdempotencyKeyReused when that task came from a different request.
func (s *Store) Insert(ctx context.Context, tx pgx.Tx, t Task, idem Idempotency) (Task, bool, error) {
	var key, fingerprint *string
	if idem.Key != "" {
		key, fingerprint = &idem.Key, &idem.Fingerprint
	}
	metadata := t.Metadata
	if len(metadata) == 0 {
		metadata = json.RawMessage(`{}`)
	}
	tag, err := tx.Exec(ctx, `
		insert into tasks (id, workspace_id, key_id, parent_id, target_type, target_id, model_id, version_id,
			status, input, hold_micros, webhook_url, metadata, idempotency_key, idempotency_fingerprint)
		values ($1, $2, nullif($3, '')::uuid, nullif($4, ''), $5, $6, nullif($7, ''), nullif($8, ''),
			$9, $10, $11, nullif($12, ''), $13, $14, $15)
		on conflict (workspace_id, idempotency_key) do nothing`,
		t.ID, t.WorkspaceID, t.KeyID, t.ParentID, t.Target.Type, t.Target.ID, t.ModelID, t.VersionID,
		t.Status, t.Input, t.HoldMicros, t.WebhookURL, metadata, key, fingerprint)
	if err != nil {
		return Task{}, false, fmt.Errorf("inserting task: %w", err)
	}
	if tag.RowsAffected() == 0 {
		existing, err := s.Replay(ctx, tx, t.WorkspaceID, idem, time.Time{})
		return existing, false, err
	}
	created, err := scanTask(tx.QueryRow(ctx, `select `+taskColumns+` from tasks where id = $1`, t.ID))
	return created, true, err
}

// KeySpend is what a key has spent on tasks created since: the price of those
// that succeeded and the holds of those still unfinished.
func (s *Store) KeySpend(ctx context.Context, q querier, keyID string, since time.Time) (int64, error) {
	var spent int64
	err := q.QueryRow(ctx, `select coalesce(sum(case status when 'succeeded' then price_micros else hold_micros end), 0)::bigint
		from tasks where key_id = $1 and created_at >= $2 and status in ('succeeded', 'queued', 'running')`,
		keyID, since).Scan(&spent)
	return spent, err
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

// List returns a workspace's top-level tasks, newest first. IDs sort by
// creation time, so the list and its cursor go by ID, along the
// tasks_workspace_list index. Callers may ask for one row more than a page
// (101) to learn whether another page follows.
func (s *Store) List(ctx context.Context, workspaceID string, f ListFilter) ([]Task, error) {
	limit := f.Limit
	if limit <= 0 || limit > 101 {
		limit = 20
	}
	// Only the filters given go in, so the cursor is an index condition rather than a filter.
	where := []string{"workspace_id = $1", "parent_id is null"}
	args := []any{workspaceID}
	add := func(cond string, v any) {
		args = append(args, v)
		where = append(where, fmt.Sprintf(cond, len(args)))
	}
	if f.Status != "" {
		add("status = $%d", string(f.Status))
	}
	if f.Target != "" {
		add("target_id = $%d", f.Target)
	}
	if f.Before != "" {
		add("id < $%d", f.Before)
	}
	args = append(args, limit)
	rows, err := s.DB.Query(ctx, `select `+taskColumns+` from tasks where `+strings.Join(where, " and ")+
		fmt.Sprintf(` order by id desc limit $%d`, len(args)), args...)
	if err != nil {
		return nil, err
	}
	return pgx.CollectRows(rows, func(row pgx.CollectableRow) (Task, error) { return scanTask(row) })
}

// The final status changes. Each is guarded by the task's current status, so
// it happens once, and returns what settlement needs.
const (
	settleColumns = `returning id, workspace_id, hold_micros, status = 'succeeded', price_micros`
	succeedSQL    = `update tasks set status = 'succeeded', output = $2, units = $3, unit = $4,
		price_micros = $5, cost_micros = $6, finished_at = $7, error_code = null, error_message = null
		where id = $1 and status in ('queued', 'running') ` + settleColumns
	failSQL = `update tasks set status = 'failed', error_code = $2, error_message = $3, finished_at = $4
		where id = $1 and status in ('queued', 'running') ` + settleColumns
	cancelSQL = `update tasks set status = 'canceled', finished_at = $2
		where id = $1 and status in ('queued', 'running') ` + settleColumns
	endAttemptSQL = `update attempts set status = $3, error = nullif($4, ''), finished_at = $5,
			latency_ms = (extract(epoch from ($5 - started_at)) * 1000)::int
		where task_id = $1 and number = $2`
)

// Start marks a queued task running; ErrFinal when it finished (was canceled) meanwhile.
func (s *Store) Start(ctx context.Context, id string, at time.Time) error {
	tag, err := s.DB.Exec(ctx, `update tasks set status = 'running', started_at = coalesce(started_at, $2)
		where id = $1 and status in ('queued', 'running')`, id, at)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return ErrFinal
	}
	return nil
}

// Fail records the public error and releases the task's hold.
func (s *Store) Fail(ctx context.Context, id, code, message string, at time.Time) error {
	return s.finish(ctx, nil, failSQL, id, code, message, at)
}

// Cancel stops a task that hasn't finished and releases its hold.
func (s *Store) Cancel(ctx context.Context, id string, at time.Time) error {
	return s.finish(ctx, nil, cancelSQL, id, at)
}

// SucceedAttempt ends an attempt as succeeded and records the task's output
// and what it cost, and charges it, together.
func (s *Store) SucceedAttempt(ctx context.Context, taskID string, number int, output json.RawMessage, units float64, unit string, priceMicros, costMicros int64, at time.Time) error {
	end := endAttempt{taskID: taskID, number: number, status: "succeeded", at: at}
	return s.finish(ctx, &end, succeedSQL, taskID, output, units, unit, priceMicros, costMicros, at)
}

// FailAttempt ends an attempt as status (failed or timeout) with the
// provider's error text, and fails the task with the public error, together.
func (s *Store) FailAttempt(ctx context.Context, taskID string, number int, status, errText, code, message string, at time.Time) error {
	end := endAttempt{taskID: taskID, number: number, status: status, errText: errText, at: at}
	return s.finish(ctx, &end, failSQL, taskID, code, message, at)
}

// endAttempt is an attempt to end together with its task.
type endAttempt struct {
	taskID  string
	number  int
	status  string
	errText string
	at      time.Time
}

// finish gives a task its final status and settles it in one transaction, so
// a finished task has always paid, and paid once. With end, the attempt ends
// in the same transaction, so a task never stays unfinished behind an attempt
// that ended. ErrFinal when the task had finished meanwhile; the attempt is
// ended anyway.
func (s *Store) finish(ctx context.Context, end *endAttempt, sql string, args ...any) error {
	tx, err := s.DB.Begin(ctx)
	if err != nil {
		return err
	}
	defer func() { _ = tx.Rollback(ctx) }()
	if end != nil {
		if _, err := tx.Exec(ctx, endAttemptSQL, end.taskID, end.number, end.status, end.errText, end.at); err != nil {
			return err
		}
	}
	var st billing.Settlement
	moved := tx.QueryRow(ctx, sql, args...).Scan(&st.TaskID, &st.WorkspaceID, &st.HoldMicros, &st.Succeeded, &st.PriceMicros)
	switch {
	case errors.Is(moved, pgx.ErrNoRows):
		moved = ErrFinal
	case moved != nil:
		return moved
	default:
		if err := billing.Settle(ctx, tx, st); err != nil {
			return err
		}
	}
	if end == nil && moved != nil {
		return moved
	}
	if err := tx.Commit(ctx); err != nil {
		return err
	}
	return moved
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

// EndAttempt records how an attempt ended, leaving the task as it is.
func (s *Store) EndAttempt(ctx context.Context, taskID string, number int, status, errText string, at time.Time) error {
	_, err := s.DB.Exec(ctx, endAttemptSQL, taskID, number, status, errText, at)
	return err
}

// Unattended lists tasks no job is working on although one should be: an
// unfinished task, or a finished one with an attempt still running upstream.
// Every such task normally has a live dispatch or poll job, so these are left
// over from a crash or a job that ran out of retries. Only tasks created
// between since and before are considered, oldest first.
func (s *Store) Unattended(ctx context.Context, since, before time.Time, limit int) ([]string, error) {
	rows, err := s.DB.Query(ctx, `
		with candidates as (
			select id, created_at from tasks
			where status in ('queued', 'running') and target_type = 'model' and created_at between $1 and $2
			union
			select t.id, t.created_at from attempts a join tasks t on t.id = a.task_id
			where a.status = 'running' and t.created_at between $1 and $2
		)
		select c.id from candidates c
		where not exists (
			select 1 from river_job j
			where j.kind in ($3, $4) and j.state in ('available', 'pending', 'retryable', 'running', 'scheduled')
				and j.args @> jsonb_build_object('task_id', c.id))
		order by c.created_at limit $5`,
		since, before, DispatchArgs{}.Kind(), PollArgs{}.Kind(), limit)
	if err != nil {
		return nil, err
	}
	return pgx.CollectRows(rows, pgx.RowTo[string])
}

// Expire fails unfinished tasks created before cutoff with f, releases their
// holds, and returns how many there were. Their running attempts are left for
// the worker to stop.
func (s *Store) Expire(ctx context.Context, cutoff time.Time, f Failure, at time.Time) (int64, error) {
	tx, err := s.DB.Begin(ctx)
	if err != nil {
		return 0, err
	}
	defer func() { _ = tx.Rollback(ctx) }()
	rows, err := tx.Query(ctx, `update tasks set status = 'failed', error_code = $2, error_message = $3, finished_at = $4
		where status in ('queued', 'running') and created_at < $1 `+settleColumns, cutoff, f.Code, f.Message, at)
	if err != nil {
		return 0, err
	}
	expired, err := pgx.CollectRows(rows, func(row pgx.CollectableRow) (billing.Settlement, error) {
		var st billing.Settlement
		err := row.Scan(&st.TaskID, &st.WorkspaceID, &st.HoldMicros, &st.Succeeded, &st.PriceMicros)
		return st, err
	})
	if err != nil {
		return 0, err
	}
	// Workspaces are locked in a fixed order, so two sweeps can't deadlock.
	slices.SortFunc(expired, func(a, b billing.Settlement) int {
		return strings.Compare(a.WorkspaceID+a.TaskID, b.WorkspaceID+b.TaskID)
	})
	for _, st := range expired {
		if err := billing.Settle(ctx, tx, st); err != nil {
			return 0, err
		}
	}
	return int64(len(expired)), tx.Commit(ctx)
}
