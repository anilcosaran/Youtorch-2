// Package routing orders a version's routes for one task. It is pure: health
// windows and circuit breakers will feed it later through Health.
package routing

import (
	"math/rand/v2"
	"sort"

	"github.com/brieeflabs/modelvend/services/internal/catalog"
)

// Health is what the router knows about a route's recent behaviour.
type Health struct {
	// Open is a tripped circuit breaker: skip the route for now.
	Open  bool
	P50Ms int
}

// Plan returns the routes to try in order. It drops paused and draining
// routes, routes on paused providers, routes with an open breaker, and, for
// white-label models, routes whose provider doesn't allow reselling.
func Plan(model catalog.Model, version catalog.Version, routes []catalog.Route, tier string, health map[string]Health, rnd *rand.Rand) []catalog.Route {
	var usable []catalog.Route
	for _, r := range routes {
		if r.Status != "active" || !r.ProviderActive || health[r.ID].Open {
			continue
		}
		if model.Disclosure == catalog.WhiteLabel && !r.WhiteLabelAllowed {
			continue
		}
		usable = append(usable, r)
	}
	switch version.Routing.Strategy {
	case "cheapest":
		sort.SliceStable(usable, func(i, j int) bool {
			a, b := usable[i].Cost(tier), usable[j].Cost(tier)
			if a != b {
				return a < b
			}
			return usable[i].Priority < usable[j].Priority
		})
	case "fastest":
		sort.SliceStable(usable, func(i, j int) bool {
			a, b := latency(health, usable[i]), latency(health, usable[j])
			if a != b {
				return a < b
			}
			return usable[i].Priority < usable[j].Priority
		})
	case "weighted":
		sort.SliceStable(usable, func(i, j int) bool { return usable[i].Priority < usable[j].Priority })
		weighted(usable, rnd)
	default: // priority
		sort.SliceStable(usable, func(i, j int) bool { return usable[i].Priority < usable[j].Priority })
	}
	if !version.Routing.Fallbacks && len(usable) > 1 {
		usable = usable[:1]
	}
	return usable
}

// latency puts routes without a measurement after measured ones.
func latency(health map[string]Health, r catalog.Route) int {
	if h, ok := health[r.ID]; ok && h.P50Ms > 0 {
		return h.P50Ms
	}
	return int(^uint(0) >> 1)
}

// weighted reorders each run of equal priority by a weighted random draw.
func weighted(routes []catalog.Route, rnd *rand.Rand) {
	if rnd == nil {
		rnd = rand.New(rand.NewPCG(rand.Uint64(), rand.Uint64()))
	}
	for start := 0; start < len(routes); {
		end := start
		for end < len(routes) && routes[end].Priority == routes[start].Priority {
			end++
		}
		group := routes[start:end]
		for i := range group {
			total := 0
			for _, r := range group[i:] {
				total += max(r.Weight, 0)
			}
			if total == 0 {
				break
			}
			pick := rnd.IntN(total)
			for j := i; j < len(group); j++ {
				pick -= max(group[j].Weight, 0)
				if pick < 0 {
					group[i], group[j] = group[j], group[i]
					break
				}
			}
		}
		start = end
	}
}
