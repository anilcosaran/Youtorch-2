// Package billing prices tasks and, later, keeps the ledger: holds when a task
// is accepted, settlement when it finishes, top-ups through Stripe and
// auto-reload. Amounts are integer micro-dollars; prices in the catalog are
// decimal dollars per unit and are converted here, once.
package billing

import (
	"math"

	"github.com/brieeflabs/modelvend/services/internal/catalog"
)

// Micros converts dollars to micro-dollars, rounding half away from zero.
func Micros(dollars float64) int64 { return int64(math.Round(dollars * 1e6)) }

// Charge is what the customer pays for units at a tier, after any promo.
// Failed tasks and queue time are never charged; callers only charge successes.
func Charge(p catalog.Pricing, tierID string, units float64) (int64, bool) {
	tier, ok := p.Tier(tierID)
	if !ok {
		return 0, false
	}
	price := tier.Price
	if p.Promo != nil && *p.Promo > 0 && *p.Promo < 1 {
		price *= 1 - *p.Promo
	}
	return Micros(price * units), true
}

// Cost is what the provider charges us for units on a route.
func Cost(r catalog.Route, units float64) int64 {
	return int64(math.Round(float64(r.CostMicros) * units))
}
