// Package redact is the last gate before anything reaches a customer. It
// builds the public shapes of tasks, models and errors from internal records,
// so provider names, upstream IDs, upstream URLs and provider error text
// can't leak through a serializer by accident: the public types simply have
// no field for them.
package redact

import (
	"encoding/json"
	"math"
	"time"

	"github.com/brieeflabs/modelvend/services/internal/catalog"
	"github.com/brieeflabs/modelvend/services/internal/providers"
	"github.com/brieeflabs/modelvend/services/internal/tasks"
)

// Task is a task as customers see it.
type Task struct {
	ID         string          `json:"id"`
	Object     string          `json:"object"`
	Target     Target          `json:"target"`
	Status     tasks.Status    `json:"status"`
	Progress   *Progress       `json:"progress"`
	Input      json.RawMessage `json:"input"`
	Output     json.RawMessage `json:"output"`
	Error      *Error          `json:"error"`
	Usage      *Usage          `json:"usage"`
	CreatedAt  time.Time       `json:"created_at"`
	StartedAt  *time.Time      `json:"started_at"`
	FinishedAt *time.Time      `json:"finished_at"`
	Metadata   json.RawMessage `json:"metadata"`
}

// Target names what ran. For models the version is ours to show; app releases stay internal.
type Target struct {
	Type    string `json:"type"`
	ID      string `json:"id"`
	Version string `json:"version,omitempty"`
}

// Progress is a generic stage, never a model or provider name.
type Progress struct {
	Stage   string `json:"stage,omitempty"`
	Percent *int   `json:"percent,omitempty"`
}

type Error struct {
	Code    string `json:"code"`
	Message string `json:"message"`
}

type Usage struct {
	Units    float64 `json:"units"`
	Unit     string  `json:"unit"`
	Cost     float64 `json:"cost"`
	Currency string  `json:"currency"`
}

// PublicTask builds the customer view of a task.
func PublicTask(t tasks.Task) Task {
	out := Task{
		ID:         t.ID,
		Object:     "task",
		Target:     Target{Type: t.Target.Type, ID: t.Target.ID},
		Status:     t.Status,
		Input:      t.Input,
		Output:     t.Output,
		CreatedAt:  t.CreatedAt,
		StartedAt:  t.StartedAt,
		FinishedAt: t.FinishedAt,
		Metadata:   t.Metadata,
	}
	if t.Target.Type == "model" {
		out.Target.Version = t.VersionID
	}
	if len(out.Metadata) == 0 {
		out.Metadata = json.RawMessage(`{}`)
	}
	if t.Stage != "" || t.Progress != nil {
		out.Progress = &Progress{Stage: t.Stage, Percent: t.Progress}
	}
	if t.ErrorCode != "" {
		out.Error = &Error{Code: t.ErrorCode, Message: t.ErrorMessage}
	}
	if t.Status == tasks.Succeeded && t.Units != nil {
		out.Usage = &Usage{Units: *t.Units, Unit: t.Unit, Cost: Dollars(t.PriceMicros), Currency: "USD"}
	}
	return out
}

// Dollars turns micro-dollars into dollars for display.
func Dollars(micros int64) float64 {
	return math.Round(float64(micros)) / 1e6
}

// Public error codes. Messages are ours; the provider's text stays on the attempt.
const (
	CodeInvalidInput     = "invalid_input"
	CodeContentPolicy    = "content_policy"
	CodeGenerationFailed = "generation_failed"
	CodeTimeout          = "timeout"
	CodeUnavailable      = "model_unavailable"
)

// UpstreamError maps a provider's failure to the error customers see.
func UpstreamError(e *providers.UpstreamError) Error {
	if e == nil {
		return Error{Code: CodeGenerationFailed, Message: "The model couldn't complete this task. You weren't charged."}
	}
	switch e.Kind {
	case providers.InvalidInput:
		return Error{Code: CodeInvalidInput, Message: "The model couldn't use this input. Check it against the model's schema. You weren't charged."}
	case providers.ContentPolicy:
		return Error{Code: CodeContentPolicy, Message: "The input or the output was blocked by the content policy."}
	case providers.Timeout:
		return Error{Code: CodeTimeout, Message: "The model took too long to answer. You weren't charged; try again."}
	case providers.Unavailable:
		return Error{Code: CodeUnavailable, Message: "The model is unavailable right now. You weren't charged; try again shortly."}
	default:
		return Error{Code: CodeGenerationFailed, Message: "The model couldn't complete this task. You weren't charged."}
	}
}

// Model is a model as customers see it.
type Model struct {
	ID           string          `json:"id"`
	Object       string          `json:"object"`
	Name         string          `json:"name"`
	Description  string          `json:"description"`
	Modality     string          `json:"modality"`
	Tasks        []string        `json:"tasks"`
	Version      string          `json:"version"`
	InputSchema  json.RawMessage `json:"input_schema"`
	OutputSchema json.RawMessage `json:"output_schema"`
	Pricing      Pricing         `json:"pricing"`
	// Author appears only for open models.
	Author      string       `json:"author,omitempty"`
	Deprecation *Deprecation `json:"deprecation,omitempty"`
}

type Pricing struct {
	Unit        string         `json:"unit"`
	DefaultTier string         `json:"default_tier"`
	Tiers       []catalog.Tier `json:"tiers"`
	Currency    string         `json:"currency"`
}

type Deprecation struct {
	SunsetAt    *time.Time `json:"sunset_at"`
	Replacement string     `json:"replacement,omitempty"`
}

// PublicModel builds the customer view of a model at one version. White-label
// models never show their author.
func PublicModel(r catalog.Resolved) Model {
	m := Model{
		ID:           r.Model.ID,
		Object:       "model",
		Name:         r.Model.Name,
		Description:  r.Model.Description,
		Modality:     r.Model.Modality,
		Tasks:        r.Model.Tasks,
		Version:      r.Version.ID,
		InputSchema:  r.Version.InputSchema,
		OutputSchema: r.Version.OutputSchema,
		Pricing: Pricing{
			Unit:        r.Version.Pricing.Unit,
			DefaultTier: r.Version.Pricing.DefaultTier,
			Tiers:       r.Version.Pricing.Tiers,
			Currency:    "USD",
		},
	}
	if m.Tasks == nil {
		m.Tasks = []string{}
	}
	if m.Pricing.Tiers == nil {
		m.Pricing.Tiers = []catalog.Tier{}
	}
	if r.Model.Disclosure == catalog.Open {
		m.Author = r.Model.Author
	}
	if r.Deprecated {
		m.Deprecation = &Deprecation{SunsetAt: r.Version.SunsetAt}
		if r.Version.Replacement != "" {
			m.Deprecation.Replacement = r.Model.ID + "@" + r.Version.Replacement
		}
	}
	return m
}
