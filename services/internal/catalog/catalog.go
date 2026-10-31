// Package catalog is the source of what callers can address: models, their
// versions with schemas and prices, and the provider routes that serve each
// version. It resolves "publisher/slug[@version]" by the lifecycle rules in
// docs/architecture.md and keeps provider details out of anything public.
package catalog

import (
	"encoding/json"
	"errors"
	"fmt"
	"math"
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
	DeprecatedAt *time.Time
	SunsetAt     *time.Time
}

// Pricing is the sell side. Prices are US dollars per billing unit.
type Pricing struct {
	Unit        string `json:"unit" yaml:"unit"`
	DefaultTier string `json:"default_tier" yaml:"default_tier"`
	// TierField names the input field whose value picks the tier. Without it,
	// or when the input leaves it out, the default tier applies.
	TierField string `json:"tier_field,omitempty" yaml:"tier_field,omitempty"`
	// TierValues maps values of TierField to tier IDs, for values that aren't tier IDs themselves.
	TierValues map[string]string `json:"tier_values,omitempty" yaml:"tier_values,omitempty"`
	Tiers      []Tier            `json:"tiers" yaml:"tiers"`
	// Input is charged for reference media on top of the tier; promos don't apply to it.
	Input *InputPrice `json:"input,omitempty" yaml:"input,omitempty"`
	// Promo is a discount (0-1) off every tier.
	Promo *float64 `json:"promo,omitempty" yaml:"promo,omitempty"`
}

type Tier struct {
	ID    string  `json:"id" yaml:"id"`
	Label string  `json:"label" yaml:"label"`
	Price float64 `json:"price" yaml:"price"`
}

// InputPrice is what each piece of reference media costs. Field is the input
// field that holds them: a list counts its items, a number is the count, and
// anything else present counts as one.
type InputPrice struct {
	Unit  string  `json:"unit" yaml:"unit"`
	Price float64 `json:"price" yaml:"price"`
	Field string  `json:"field" yaml:"field"`
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

// TierFor picks the tier an input runs at. A value that matches no tier is an
// error: the version's schema should have refused it, so its pricing is wrong.
func (p Pricing) TierFor(input map[string]any) (Tier, error) {
	id := ""
	if value, ok := input[p.TierField]; ok && p.TierField != "" && value != nil {
		id = fmt.Sprint(value)
		if mapped, ok := p.TierValues[id]; ok {
			id = mapped
		}
	}
	tier, ok := p.Tier(id)
	if !ok {
		return Tier{}, fmt.Errorf("catalog: %s %q picks no tier", p.TierField, id)
	}
	return tier, nil
}

// Net is a tier's price after any promo.
func (p Pricing) Net(price float64) float64 {
	if p.Promo != nil && *p.Promo > 0 && *p.Promo < 1 {
		// Rounded so a discount doesn't leave binary noise such as 0.029250000000000002.
		return math.Round(price*(1-*p.Promo)*1e9) / 1e9
	}
	return price
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
	// TierCosts is what the provider charges per billing unit at each tier, in dollars.
	TierCosts map[string]float64
	Region    string
	Mapping   json.RawMessage
	Transform string
}

// Cost is what the route charges per unit at a tier.
func (r Route) Cost(tier string) float64 { return r.TierCosts[tier] }

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
	// ErrGone means the version was retired. Resolve returns it as a *RetiredError.
	ErrGone = errors.New("catalog: version retired")
)

// RetiredError is a call to a retired version. Calls are never forwarded, as
// the replacement may cost more or take other input; Suggestion is the
// "publisher/slug@version" to move to, when there is one.
type RetiredError struct {
	Suggestion string
}

func (e *RetiredError) Error() string { return ErrGone.Error() }

func (e *RetiredError) Is(target error) bool { return target == ErrGone }
