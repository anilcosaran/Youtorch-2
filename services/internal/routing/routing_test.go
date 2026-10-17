package routing

import (
	"math/rand/v2"
	"testing"

	"github.com/brieeflabs/modelvend/services/internal/catalog"
)

func route(id string, priority int, cost int64) catalog.Route {
	return catalog.Route{ID: id, Status: "active", ProviderActive: true, WhiteLabelAllowed: true, Priority: priority, Weight: 100, CostMicros: cost}
}

func ids(routes []catalog.Route) string {
	s := ""
	for _, r := range routes {
		s += r.ID
	}
	return s
}

func version(strategy string, fallbacks bool) catalog.Version {
	return catalog.Version{Routing: catalog.Routing{Strategy: strategy, Fallbacks: fallbacks, MaxAttempts: 3}}
}

func TestPriorityAndSkips(t *testing.T) {
	paused := route("p", 0, 1)
	paused.Status = "paused"
	down := route("d", 0, 1)
	down.ProviderActive = false
	routes := []catalog.Route{route("b", 2, 10), paused, route("a", 1, 50), down, route("c", 3, 5)}
	got := Plan(catalog.Model{}, version("priority", true), routes, map[string]Health{"c": {Open: true}}, nil)
	if ids(got) != "ab" {
		t.Fatalf("got %s", ids(got))
	}
}

func TestCheapestAndFastest(t *testing.T) {
	routes := []catalog.Route{route("a", 1, 50), route("b", 2, 10), route("c", 3, 30)}
	if got := ids(Plan(catalog.Model{}, version("cheapest", true), routes, nil, nil)); got != "bca" {
		t.Fatalf("cheapest: %s", got)
	}
	health := map[string]Health{"a": {P50Ms: 900}, "c": {P50Ms: 300}}
	if got := ids(Plan(catalog.Model{}, version("fastest", true), routes, health, nil)); got != "cab" {
		t.Fatalf("fastest: %s", got)
	}
}

func TestNoFallbacksKeepsOne(t *testing.T) {
	routes := []catalog.Route{route("a", 1, 1), route("b", 2, 1)}
	if got := ids(Plan(catalog.Model{}, version("priority", false), routes, nil, nil)); got != "a" {
		t.Fatalf("got %s", got)
	}
}

func TestWhiteLabelNeedsPermission(t *testing.T) {
	forbidden := route("x", 1, 1)
	forbidden.WhiteLabelAllowed = false
	routes := []catalog.Route{forbidden, route("y", 2, 1)}
	model := catalog.Model{Disclosure: catalog.WhiteLabel}
	if got := ids(Plan(model, version("priority", true), routes, nil, nil)); got != "y" {
		t.Fatalf("white label: %s", got)
	}
	if got := ids(Plan(catalog.Model{Disclosure: catalog.Open}, version("priority", true), routes, nil, nil)); got != "xy" {
		t.Fatalf("open: %s", got)
	}
}

func TestWeightedFollowsWeights(t *testing.T) {
	a, b := route("a", 1, 1), route("b", 1, 1)
	a.Weight, b.Weight = 90, 10
	rnd := rand.New(rand.NewPCG(1, 2))
	first := map[string]int{}
	for range 2000 {
		first[Plan(catalog.Model{}, version("weighted", true), []catalog.Route{a, b}, nil, rnd)[0].ID]++
	}
	if first["a"] < 1600 || first["b"] < 100 {
		t.Fatalf("weights not respected: %v", first)
	}
}
