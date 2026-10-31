// Package redact is the last gate before anything reaches a customer. It
// builds the public shapes of tasks, models and errors from internal records,
// so provider names, upstream IDs, upstream URLs and provider error text
// can't leak through a serializer by accident: the public types simply have
// no field for them. api/public.yaml describes these shapes.
package redact

import (
	"encoding/json"
	"strconv"
	"time"

	"github.com/brieeflabs/modelvend/services/internal/catalog"
	"github.com/brieeflabs/modelvend/services/internal/tasks"
)

// TaskSummary is a task as lists show it: everything but its input and output,
// which can run to megabytes.
type TaskSummary struct {
	ID         string          `json:"id"`
	Object     string          `json:"object"`
	Target     Target          `json:"target"`
	Status     tasks.Status    `json:"status"`
	Progress   *Progress       `json:"progress"`
	Error      *Error          `json:"error"`
	Usage      *Usage          `json:"usage"`
	CreatedAt  string          `json:"created_at"`
	StartedAt  *string         `json:"started_at"`
	FinishedAt *string         `json:"finished_at"`
	Metadata   json.RawMessage `json:"metadata"`
}

// Task is a task as customers see it.
type Task struct {
	TaskSummary
	Input  json.RawMessage `json:"input"`
	Output json.RawMessage `json:"output"`
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

// Usage is what a succeeded task used and paid. AmountMicros is whole
// micro-dollars, so customers can add them up without rounding.
type Usage struct {
	Units        float64 `json:"units"`
	Unit         string  `json:"unit"`
	Tier         string  `json:"tier,omitempty"`
	AmountMicros int64   `json:"amount_micros"`
	Currency     string  `json:"currency"`
}

// timestamp is the one way times leave the API: UTC, to the second.
func timestamp(t time.Time) string { return t.UTC().Format(time.RFC3339) }

func timestampOrNil(t *time.Time) *string {
	if t == nil {
		return nil
	}
	s := timestamp(*t)
	return &s
}

// PublicTaskSummary builds the list view of a task.
func PublicTaskSummary(t tasks.Task) TaskSummary {
	out := TaskSummary{
		ID:         t.ID,
		Object:     "task",
		Target:     Target{Type: t.Target.Type, ID: t.Target.ID},
		Status:     t.Status,
		CreatedAt:  timestamp(t.CreatedAt),
		StartedAt:  timestampOrNil(t.StartedAt),
		FinishedAt: timestampOrNil(t.FinishedAt),
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
		out.Usage = &Usage{Units: *t.Units, Unit: t.Unit, AmountMicros: t.PriceMicros, Currency: "USD"}
		if t.Quote != nil {
			out.Usage.Tier = t.Quote.Tier
		}
	}
	return out
}

// PublicTask builds the customer view of a task.
func PublicTask(t tasks.Task) Task {
	return Task{TaskSummary: PublicTaskSummary(t), Input: t.Input, Output: t.Output}
}

// List is a page of items.
type List[T any] struct {
	Object     string  `json:"object"`
	Data       []T     `json:"data"`
	NextCursor *string `json:"next_cursor"`
}

// TaskPage builds a page from a list asked for with limit + 1, so a further
// row means there is another page.
func TaskPage(list []tasks.Task, limit int) List[TaskSummary] {
	out := List[TaskSummary]{Object: "list", Data: []TaskSummary{}}
	for i, t := range list {
		if i == limit {
			next := list[i-1].ID
			out.NextCursor = &next
			break
		}
		out.Data = append(out.Data, PublicTaskSummary(t))
	}
	return out
}

// Model is a model as customers see it.
type Model struct {
	ID           string          `json:"id"`
	Object       string          `json:"object"`
	Publisher    string          `json:"publisher"`
	Slug         string          `json:"slug"`
	Name         string          `json:"name"`
	Description  string          `json:"description"`
	Modality     string          `json:"modality"`
	Tasks        []string        `json:"tasks"`
	State        string          `json:"state"`
	Version      string          `json:"version"`
	InputSchema  json.RawMessage `json:"input_schema"`
	OutputSchema json.RawMessage `json:"output_schema"`
	Pricing      Pricing         `json:"pricing"`
	Deprecation  *Deprecation    `json:"deprecation,omitempty"`
}

// Pricing is what a version costs. Prices are decimal strings, which hold any
// precision a unit needs (a token's price, say) and never pick up binary noise.
type Pricing struct {
	Unit        string            `json:"unit"`
	Currency    string            `json:"currency"`
	DefaultTier string            `json:"default_tier"`
	TierField   string            `json:"tier_field,omitempty"`
	TierValues  map[string]string `json:"tier_values,omitempty"`
	Tiers       []Tier            `json:"tiers"`
	Input       *InputPrice       `json:"input,omitempty"`
}

type Tier struct {
	ID    string `json:"id"`
	Label string `json:"label"`
	// Price is what a unit costs now.
	Price string `json:"price"`
	// ListPrice is the price before a promo; empty without one.
	ListPrice string `json:"list_price,omitempty"`
}

type InputPrice struct {
	Unit  string `json:"unit"`
	Price string `json:"price"`
	Field string `json:"field"`
}

type Deprecation struct {
	DeprecatedAt *string `json:"deprecated_at"`
	SunsetAt     *string `json:"sunset_at"`
	Replacement  string  `json:"replacement,omitempty"`
}

func decimal(v float64) string { return strconv.FormatFloat(v, 'f', -1, 64) }

func publicPricing(p catalog.Pricing) Pricing {
	out := Pricing{Unit: p.Unit, Currency: "USD", DefaultTier: p.DefaultTier, TierField: p.TierField, TierValues: p.TierValues,
		Tiers: make([]Tier, 0, len(p.Tiers))}
	for _, t := range p.Tiers {
		tier := Tier{ID: t.ID, Label: t.Label, Price: decimal(p.Net(t.Price))}
		if net := p.Net(t.Price); net != t.Price {
			tier.ListPrice = decimal(t.Price)
		}
		out.Tiers = append(out.Tiers, tier)
	}
	if p.Input != nil {
		out.Input = &InputPrice{Unit: p.Input.Unit, Price: decimal(p.Input.Price), Field: p.Input.Field}
	}
	return out
}

// PublicModel builds the customer view of a model at one version.
func PublicModel(r catalog.Resolved) Model {
	m := Model{
		ID:           r.Model.ID,
		Object:       "model",
		Publisher:    r.Model.Publisher,
		Slug:         r.Model.Slug,
		Name:         r.Model.Name,
		Description:  r.Model.Description,
		Modality:     r.Model.Modality,
		Tasks:        r.Model.Tasks,
		State:        "active",
		Version:      r.Version.ID,
		InputSchema:  r.Version.InputSchema,
		OutputSchema: r.Version.OutputSchema,
		Pricing:      publicPricing(r.Version.Pricing),
	}
	if r.Model.Paused {
		m.State = "paused"
	}
	if m.Tasks == nil {
		m.Tasks = []string{}
	}
	if r.Deprecated {
		m.Deprecation = &Deprecation{DeprecatedAt: timestampOrNil(r.Version.DeprecatedAt), SunsetAt: timestampOrNil(r.Version.SunsetAt)}
		if r.Version.Replacement != "" {
			m.Deprecation.Replacement = r.Model.ID + "@" + r.Version.Replacement
		}
	}
	return m
}
