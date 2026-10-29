package tasks

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"slices"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/riverqueue/river"
	"github.com/riverqueue/river/rivertype"

	"github.com/brieeflabs/modelvend/services/internal/billing"
	"github.com/brieeflabs/modelvend/services/internal/catalog"
	"github.com/brieeflabs/modelvend/services/internal/catalog/schema"
	"github.com/brieeflabs/modelvend/services/internal/platform/ids"
)

// DispatchArgs starts or retries a task on its next route.
type DispatchArgs struct {
	TaskID string `json:"task_id"`
}

func (DispatchArgs) Kind() string { return "dispatch_task" }

func (DispatchArgs) InsertOpts() river.InsertOpts {
	// One live dispatch per task: two could submit the same task twice.
	return river.InsertOpts{Queue: QueueDispatch, MaxAttempts: 5, UniqueOpts: river.UniqueOpts{ByArgs: true, ByState: liveStates}}
}

// PollArgs checks a pending upstream job of one attempt.
type PollArgs struct {
	TaskID  string `json:"task_id"`
	Attempt int    `json:"attempt"`
}

func (PollArgs) Kind() string { return "poll_task" }

func (PollArgs) InsertOpts() river.InsertOpts {
	return river.InsertOpts{Queue: QueuePoll, MaxAttempts: 25, UniqueOpts: river.UniqueOpts{ByArgs: true, ByState: liveStates}}
}

// liveStates are the states of a job that will still run. A finished job
// doesn't count against uniqueness, so a task can be dispatched again later.
var liveStates = []rivertype.JobState{
	rivertype.JobStateAvailable,
	rivertype.JobStatePending,
	rivertype.JobStateRetryable,
	rivertype.JobStateRunning,
	rivertype.JobStateScheduled,
}

// The worker queues; worker pools pick which ones they work.
const (
	QueueDispatch = "dispatch"
	QueuePoll     = "poll"
)

// Queues lists every queue a worker may work.
var Queues = []string{QueueDispatch, QueuePoll}

// Service creates and reads tasks for the public API and MCP.
type Service struct {
	DB      *pgxpool.Pool
	Store   *Store
	Catalog *catalog.Store
	Schemas *schema.Cache
	// Jobs only inserts; the worker process works them.
	Jobs *river.Client[pgx.Tx]
}

// CreateParams is one call to POST /v1/tasks.
type CreateParams struct {
	WorkspaceID string
	KeyID       string
	// Internal keys may reach private models and staging versions.
	Internal bool
	// Scopes are the models ("publisher/slug" or "publisher/slug@version") and
	// apps the key may run; empty for everything.
	Scopes []string
	// SpendLimitMicros caps what the key spends in a calendar month (UTC); nil for no limit.
	SpendLimitMicros *int64
	// Exactly one of Model ("publisher/slug[@version]") and App is set.
	Model          string
	App            string
	Input          json.RawMessage
	WebhookURL     string
	Metadata       json.RawMessage
	IdempotencyKey string
}

var (
	// ErrTarget means the call didn't name exactly one model or app.
	ErrTarget = errors.New("tasks: name a model or an app")
	// ErrAppsUnavailable means app runs aren't available yet.
	ErrAppsUnavailable = errors.New("tasks: app runs aren't available yet")
)

// Created is the task and whether this call created it (false for a repeated idempotency key).
type Created struct {
	Task    Task
	Created bool
	// Deprecated is the resolved version's sunset, when it is deprecated.
	Deprecated *catalog.Version
}

// Create validates the input against the target's schema, holds the task's
// estimated price from the workspace's balance, and writes the task and its
// dispatch job, all in one transaction, so none exists without the others.
//
// A repeated idempotency key returns the task it created within
// IdempotencyWindow, whatever changed since (the model, the balance, the key's
// limits), and holds nothing again; the same key with a different request is
// ErrIdempotencyKeyReused.
func (s *Service) Create(ctx context.Context, p CreateParams) (Created, error) {
	if (p.Model == "") == (p.App == "") {
		return Created{}, ErrTarget
	}
	now := time.Now()
	idem := Idempotency{Key: p.IdempotencyKey}
	if idem.Key != "" {
		idem.Fingerprint = fingerprint(p)
		existing, err := s.Store.Replay(ctx, s.DB, p.WorkspaceID, idem, now.Add(-IdempotencyWindow))
		if !errors.Is(err, ErrNotFound) {
			return Created{Task: existing}, err
		}
	}
	if p.App != "" {
		if !inScope(p.Scopes, p.App, "") {
			return Created{}, ErrKeyScope
		}
		return Created{}, ErrAppsUnavailable
	}
	ref, err := catalog.ParseRef(p.Model)
	if err != nil {
		return Created{}, fmt.Errorf("%w: %v", ErrTarget, err)
	}
	resolved, err := s.Catalog.Resolve(ctx, ref, catalog.Access{Internal: p.Internal})
	if err != nil {
		return Created{}, err
	}
	v := resolved.Version
	if !inScope(p.Scopes, v.ModelID, v.ID) {
		return Created{}, ErrKeyScope
	}
	validator, err := s.Schemas.Get(v.ModelID+"@"+v.ID+":input", v.InputSchema)
	if err != nil {
		return Created{}, fmt.Errorf("version %s@%s has a broken input schema: %w", v.ModelID, v.ID, err)
	}
	input, err := validator.Validate(p.Input)
	if err != nil {
		return Created{}, err
	}
	hold, ok := billing.Estimate(v.Pricing)
	if !ok {
		return Created{}, fmt.Errorf("version %s@%s has no price at its default tier %q", v.ModelID, v.ID, v.Pricing.DefaultTier)
	}

	t := Task{
		ID:          ids.New("task"),
		WorkspaceID: p.WorkspaceID,
		KeyID:       p.KeyID,
		Target:      Target{Type: "model", ID: ref.ModelID()},
		ModelID:     v.ModelID,
		VersionID:   v.ID,
		Status:      Queued,
		Input:       input,
		HoldMicros:  hold,
		WebhookURL:  p.WebhookURL,
		Metadata:    p.Metadata,
	}
	tx, err := s.DB.Begin(ctx)
	if err != nil {
		return Created{}, err
	}
	defer func() { _ = tx.Rollback(ctx) }()
	if idem.Key != "" {
		// Before the workspace is locked: finishing a task locks the task, then
		// its workspace, and this must take them in the same order.
		if err := s.Store.ReleaseIdempotencyKey(ctx, tx, p.WorkspaceID, idem.Key, now.Add(-IdempotencyWindow)); err != nil {
			return Created{}, err
		}
	}
	// From here on the workspace's task creations run one at a time, so each
	// is checked against the holds of the others.
	account, err := billing.Lock(ctx, tx, p.WorkspaceID)
	if err != nil {
		return Created{}, err
	}
	if idem.Key != "" {
		// A call with the same key may have created the task while this one waited.
		existing, err := s.Store.Replay(ctx, tx, p.WorkspaceID, idem, now.Add(-IdempotencyWindow))
		if !errors.Is(err, ErrNotFound) {
			return Created{Task: existing}, err
		}
	}
	if p.SpendLimitMicros != nil && p.KeyID != "" {
		month := time.Date(now.UTC().Year(), now.UTC().Month(), 1, 0, 0, 0, 0, time.UTC)
		spent, err := s.Store.KeySpend(ctx, tx, p.KeyID, month)
		if err != nil {
			return Created{}, fmt.Errorf("reading the key's spend: %w", err)
		}
		if !billing.LimitAllows(p.SpendLimitMicros, spent, hold) {
			return Created{}, billing.ErrSpendLimitReached
		}
	}
	if err := billing.Hold(ctx, tx, account, hold); err != nil {
		return Created{}, err
	}
	saved, created, err := s.Store.Insert(ctx, tx, t, idem)
	if err != nil || !created {
		// Left uncommitted: the existing task keeps its own hold, and this one's is dropped.
		return Created{Task: saved}, err
	}
	if _, err := s.Jobs.InsertTx(ctx, tx, DispatchArgs{TaskID: saved.ID}, nil); err != nil {
		return Created{}, fmt.Errorf("queueing task: %w", err)
	}
	if err := tx.Commit(ctx); err != nil {
		return Created{}, err
	}
	out := Created{Task: saved, Created: true}
	if resolved.Deprecated {
		out.Deprecated = &v
	}
	return out, nil
}

// inScope reports whether a key with scopes may run target, a model ID at
// version or an app slug.
func inScope(scopes []string, target, version string) bool {
	return len(scopes) == 0 || slices.Contains(scopes, target) ||
		(version != "" && slices.Contains(scopes, target+"@"+version))
}

// fingerprint identifies a create request, so an idempotency key reused for a
// different one is caught. Input and metadata count as JSON values: the same
// object with its keys in another order or other spacing is the same request.
func fingerprint(p CreateParams) string {
	value := func(raw json.RawMessage) any {
		var v any
		if len(raw) == 0 || json.Unmarshal(raw, &v) != nil {
			return string(raw)
		}
		return v
	}
	b, _ := json.Marshal([]any{p.Model, p.App, value(p.Input), p.WebhookURL, value(p.Metadata)})
	sum := sha256.Sum256(b)
	return hex.EncodeToString(sum[:])
}

// Get reads one of the workspace's tasks.
func (s *Service) Get(ctx context.Context, workspaceID, id string) (Task, error) {
	return s.Store.GetFor(ctx, workspaceID, id)
}

// List returns the workspace's top-level tasks, newest first.
func (s *Service) List(ctx context.Context, workspaceID string, f ListFilter) ([]Task, error) {
	return s.Store.List(ctx, workspaceID, f)
}

// Wait returns the task once it finishes or wait runs out, whichever is first.
func (s *Service) Wait(ctx context.Context, workspaceID, id string, wait time.Duration) (Task, error) {
	deadline := time.Now().Add(wait)
	for {
		t, err := s.Store.GetFor(ctx, workspaceID, id)
		if err != nil || t.Status.Final() || time.Now().After(deadline) {
			return t, err
		}
		select {
		case <-ctx.Done():
			return t, nil
		case <-time.After(250 * time.Millisecond):
		}
	}
}

// Cancel stops one of the workspace's tasks. The worker drops it at its next
// step, and asks the provider to stop a job it already started.
func (s *Service) Cancel(ctx context.Context, workspaceID, id string) (Task, error) {
	t, err := s.Store.GetFor(ctx, workspaceID, id)
	if err != nil {
		return t, err
	}
	if t.Status.Final() {
		return t, ErrFinal
	}
	if err := s.Store.Cancel(ctx, id, time.Now()); err != nil {
		return t, err
	}
	return s.Store.GetFor(ctx, workspaceID, id)
}
