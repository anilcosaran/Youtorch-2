// Package tasks owns the task record: what a caller asked for, where it
// stands, what it produced and what it cost. Model calls and app runs are both
// tasks; an app's steps are child tasks customers never see.
package tasks

import (
	"encoding/json"
	"errors"
	"time"
)

type Status string

const (
	Queued    Status = "queued"
	Running   Status = "running"
	Succeeded Status = "succeeded"
	Failed    Status = "failed"
	Canceled  Status = "canceled"
)

// Final reports whether the task is done for good.
func (s Status) Final() bool { return s == Succeeded || s == Failed || s == Canceled }

// CanMove reports whether a task may go from s to next.
func (s Status) CanMove(next Status) bool {
	switch s {
	case Queued:
		return next == Running || next.Final()
	case Running:
		return next.Final()
	default:
		return false
	}
}

// Target is what a task runs: a model ("publisher/slug") or an app (its slug).
type Target struct {
	Type string `json:"type"` // "model" or "app"
	ID   string `json:"id"`
}

// Task is the full record. Only the redact package turns it into what
// customers see.
type Task struct {
	ID          string
	WorkspaceID string
	KeyID       string
	ParentID    string
	Target      Target
	// ModelID and VersionID are what the target resolved to.
	ModelID    string
	VersionID  string
	AppRelease int
	Status     Status
	Stage      string
	Progress   *int
	Input      json.RawMessage
	Output     json.RawMessage
	// ErrorCode and ErrorMessage are public: ours, never the provider's.
	ErrorCode    string
	ErrorMessage string
	Units        *float64
	Unit         string
	PriceMicros  int64
	CostMicros   int64
	// HoldMicros is what the task set aside from the balance when it was created.
	HoldMicros int64
	WebhookURL string
	Metadata   json.RawMessage
	CreatedAt  time.Time
	StartedAt  *time.Time
	FinishedAt *time.Time
}

// Attempt is one try on one route. Admin and worker only.
type Attempt struct {
	TaskID        string
	Number        int
	RouteID       string
	ProviderID    string
	UpstreamModel string
	UpstreamID    string
	Status        string // running, succeeded, failed, timeout, canceled
	Error         string
	LatencyMs     *int
	StartedAt     time.Time
	FinishedAt    *time.Time
}

var (
	ErrNotFound = errors.New("tasks: not found")
	// ErrFinal means the task already finished and can't change.
	ErrFinal = errors.New("tasks: already finished")
	// ErrKeyScope means the key's scopes don't list the model or app it called.
	ErrKeyScope = errors.New("tasks: outside the key's scopes")
	// ErrIdempotencyKeyReused means a live idempotency key came with a
	// different request than the one that created its task.
	ErrIdempotencyKeyReused = errors.New("tasks: idempotency key reused for a different request")
)
