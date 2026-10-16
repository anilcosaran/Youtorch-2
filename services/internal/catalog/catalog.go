// Package catalog is the source of what callers can address: models, their
// versions with schemas and prices, and the provider routes that serve each
// version. It resolves "publisher/slug[@version]" by the lifecycle rules in
// docs/architecture.md and keeps provider details out of anything public.
package catalog

import (
	"encoding/json"
	"errors"
	"time"
)

type Disclosure string

const (
	// Open models may show their author and providers to customers.
	Open Disclosure = "open"
	// WhiteLabel models never reveal their author or providers to customers.
	WhiteLabel Disclosure = "white_label"
)

type Visibility string

const (
	Public   Visibility = "public"
	Unlisted Visibility = "unlisted"
	Private  Visibility = "private"
)

type VersionStatus string

const (
	Draft      VersionStatus = "draft"
	Staging    VersionStatus = "staging"
	Live       VersionStatus = "live"
	Deprecated VersionStatus = "deprecated"
	Retired    VersionStatus = "retired"
)

type Model struct {
	ID          string
	Publisher   string
	Slug        string
	Name        string
	Description string
	Modality    string
	Tasks       []string
	Visibility  Visibility
	Disclosure  Disclosure
	// Author is who really made the model. Admin only.
	Author         string
	Paused         bool
	DefaultVersion string
	CreatedAt      time.Time
	UpdatedAt      time.Time
}

type Version struct {
	ModelID      string
	ID           string
	Label        string
	Status       VersionStatus
	Changelog    string
	InputSchema  json.RawMessage
	OutputSchema json.RawMessage
	Pricing      Pricing
	Routing      Routing
	Replacement  string
	SunsetAt     *time.Time
}

// Pricing is the sell side. Prices are US dollars per billing unit.
type Pricing struct {
	Unit        string     `json:"unit" yaml:"unit"`
	DefaultTier string     `json:"default_tier" yaml:"default_tier"`
	Tiers       []Tier     `json:"tiers" yaml:"tiers"`
	Input       *UnitPrice `json:"input,omitempty" yaml:"input,omitempty"`
	Promo       *float64   `json:"promo,omitempty" yaml:"promo,omitempty"`
}

type Tier struct {
	ID    string  `json:"id" yaml:"id"`
	Label string  `json:"label" yaml:"label"`
	Price float64 `json:"price" yaml:"price"`
}

type UnitPrice struct {
	Unit  string  `json:"unit" yaml:"unit"`
	Price float64 `json:"price" yaml:"price"`
}

// Tier returns the tier with id, or the default tier when id is empty.
func (p Pricing) Tier(id string) (Tier, bool) {
	if id == "" {
		id = p.DefaultTier
	}
	for _, t := range p.Tiers {
		if t.ID == id {
			return t, true
		}
	}
	return Tier{}, false
}

type Routing struct {
	Strategy       string `json:"strategy" yaml:"strategy"`
	Fallbacks      bool   `json:"fallbacks" yaml:"fallbacks"`
	MaxAttempts    int    `json:"max_attempts" yaml:"max_attempts"`
	TimeoutSeconds int    `json:"timeout_seconds" yaml:"timeout_seconds"`
}

// DefaultRouting applies when a version doesn't say.
var DefaultRouting = Routing{Strategy: "priority", Fallbacks: true, MaxAttempts: 2, TimeoutSeconds: 600}

// Route is one way to serve a version. Admin and worker only.
type Route struct {
	ID             string
	ProviderID     string
	Adapter        string
	ProviderActive bool
	// WhiteLabelAllowed is whether the provider's terms let us resell under our own name.
	WhiteLabelAllowed bool
	UpstreamModel     string
	Status            string // active, paused, draining
	Priority          int
	Weight            int
	// CostMicros is what the provider charges per unit at the default tier.
	CostMicros int64
	Region     string
	Mapping    json.RawMessage
	Transform  string
}

// Resolved is what a request to "publisher/slug[@version]" reaches.
type Resolved struct {
	Model   Model
	Version Version
	// Deprecated carries the sunset date callers are told about.
	Deprecated bool
}

var (
	ErrNotFound = errors.New("catalog: not found")
	// ErrPaused means the model's kill switch is on.
	ErrPaused = errors.New("catalog: model paused")
	// ErrNotLive means the model has no version callers may use.
	ErrNotLive = errors.New("catalog: no live version")
	// ErrGone means the version was retired without a replacement.
	ErrGone = errors.New("catalog: version retired")
)
