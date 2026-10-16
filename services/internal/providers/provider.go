// Package providers defines how the worker talks to upstream providers. Each
// provider is one adapter package (fal, replicate, vertex, …) implementing
// Provider; the registry maps a provider's adapter name to it. Nothing a
// provider returns reaches customers directly: the worker records it on the
// attempt and the redact package decides what the task shows.
package providers

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"sync"
)

// Call is one attempt to run a version on a provider.
type Call struct {
	// TaskID is ours; adapters may send it as a correlation ID but never need it.
	TaskID        string
	UpstreamModel string
	// Input is already mapped to the provider's parameter names.
	Input json.RawMessage
	// WebhookURL is where the provider may report completion, when it supports that.
	WebhookURL string
}

// State of an upstream job.
type State string

const (
	Pending   State = "pending"
	Succeeded State = "succeeded"
	Failed    State = "failed"
)

// Kind classifies an upstream failure; redact turns it into the public error.
type Kind string

const (
	// InvalidInput: the provider refused the input (after our own validation passed).
	InvalidInput Kind = "invalid_input"
	// ContentPolicy: the provider's safety system refused the prompt or the output.
	ContentPolicy Kind = "content_policy"
	// Unavailable: the provider is down, overloaded or rate limiting us; another route may work.
	Unavailable Kind = "unavailable"
	// Timeout: the attempt ran past the version's timeout.
	Timeout Kind = "timeout"
	// Internal: anything else went wrong upstream.
	Internal Kind = "internal"
)

// Retryable reports whether another route may succeed where this one failed.
func (k Kind) Retryable() bool { return k == Unavailable || k == Timeout || k == Internal }

// UpstreamError is a provider's failure. Message is the provider's own text,
// kept on the attempt for operators and never shown to customers.
type UpstreamError struct {
	Kind    Kind
	Message string
}

func (e *UpstreamError) Error() string { return string(e.Kind) + ": " + e.Message }

// Result is where an upstream job stands.
type Result struct {
	State State
	// UpstreamID is the provider's own job ID.
	UpstreamID string
	// Output uses our output schema's shape; media are still the provider's URLs.
	Output json.RawMessage
	// Units produced, in the version's billing unit (images, seconds, …).
	Units float64
	Error *UpstreamError
}

// Provider is one upstream API.
type Provider interface {
	// Submit starts a job. Synchronous providers may return a finished Result.
	Submit(ctx context.Context, call Call) (Result, error)
	// Status polls a job Submit left pending.
	Status(ctx context.Context, upstreamModel, upstreamID string) (Result, error)
	// Cancel asks the provider to stop a pending job; best effort.
	Cancel(ctx context.Context, upstreamModel, upstreamID string) error
}

// Registry maps adapter names to providers.
type Registry struct {
	mu        sync.RWMutex
	providers map[string]Provider
}

// Register adds the provider for an adapter name, replacing any before it.
func (r *Registry) Register(adapter string, p Provider) {
	r.mu.Lock()
	defer r.mu.Unlock()
	if r.providers == nil {
		r.providers = map[string]Provider{}
	}
	r.providers[adapter] = p
}

// ErrNoAdapter means no provider is registered for a route's adapter.
var ErrNoAdapter = errors.New("providers: no adapter registered")

// Get returns the provider for an adapter name.
func (r *Registry) Get(adapter string) (Provider, error) {
	r.mu.RLock()
	defer r.mu.RUnlock()
	p, ok := r.providers[adapter]
	if !ok {
		return nil, fmt.Errorf("%w: %q", ErrNoAdapter, adapter)
	}
	return p, nil
}
