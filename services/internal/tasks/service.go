package tasks

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/riverqueue/river"

	"github.com/brieeflabs/modelvend/services/internal/catalog"
	"github.com/brieeflabs/modelvend/services/internal/platform/ids"
	"github.com/brieeflabs/modelvend/services/internal/schema"
)

// DispatchArgs starts or retries a task on its next route.
type DispatchArgs struct {
	TaskID string `json:"task_id"`
}

func (DispatchArgs) Kind() string { return "dispatch_task" }

func (DispatchArgs) InsertOpts() river.InsertOpts {
	return river.InsertOpts{Queue: QueueDispatch, MaxAttempts: 5}
}

// PollArgs checks a pending upstream job of one attempt.
type PollArgs struct {
	TaskID  string `json:"task_id"`
	Attempt int    `json:"attempt"`
}

func (PollArgs) Kind() string { return "poll_task" }

func (PollArgs) InsertOpts() river.InsertOpts {
	return river.InsertOpts{Queue: QueuePoll, MaxAttempts: 25}
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

// Create validates the input against the target's schema, then writes the task
// and its dispatch job in one transaction, so neither exists without the other.
func (s *Service) Create(ctx context.Context, p CreateParams) (Created, error) {
	if (p.Model == "") == (p.App == "") {
		return Created{}, ErrTarget
	}
	if p.App != "" {
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
	validator, err := s.Schemas.Get(v.ModelID+"@"+v.ID+":input", v.InputSchema)
	if err != nil {
		return Created{}, fmt.Errorf("version %s@%s has a broken input schema: %w", v.ModelID, v.ID, err)
	}
	input, err := validator.Validate(p.Input)
	if err != nil {
		return Created{}, err
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
		WebhookURL:  p.WebhookURL,
		Metadata:    p.Metadata,
	}
	tx, err := s.DB.Begin(ctx)
	if err != nil {
		return Created{}, err
	}
	defer func() { _ = tx.Rollback(ctx) }()
	saved, created, err := s.Store.Insert(ctx, tx, t, p.IdempotencyKey)
	if err != nil {
		return Created{}, err
	}
	if created {
		if _, err := s.Jobs.InsertTx(ctx, tx, DispatchArgs{TaskID: saved.ID}, nil); err != nil {
			return Created{}, fmt.Errorf("queueing task: %w", err)
		}
	}
	if err := tx.Commit(ctx); err != nil {
		return Created{}, err
	}
	out := Created{Task: saved, Created: created}
	if resolved.Deprecated {
		out.Deprecated = &v
	}
	return out, nil
}

// Get reads one of the workspace's tasks.
func (s *Service) Get(ctx context.Context, workspaceID, id string) (Task, error) {
	return s.Store.GetFor(ctx, workspaceID, id)
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
// step; a provider job already running is left to finish unbilled.
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
