package billing

import (
	"testing"

	"github.com/brieeflabs/modelvend/services/internal/catalog"
)

func TestCharge(t *testing.T) {
	promo := 0.25
	p := catalog.Pricing{Unit: "second", DefaultTier: "1080p", Tiers: []catalog.Tier{{ID: "720p", Price: 0.056}, {ID: "1080p", Price: 0.084}}}
	if got, ok := Charge(p, "", 5); !ok || got != 420_000 {
		t.Fatalf("default tier: %d %v", got, ok)
	}
	if got, _ := Charge(p, "720p", 10); got != 560_000 {
		t.Fatalf("720p: %d", got)
	}
	p.Promo = &promo
	if got, _ := Charge(p, "", 10); got != 630_000 {
		t.Fatalf("promo: %d", got)
	}
	if _, ok := Charge(p, "4k", 1); ok {
		t.Fatal("unknown tier should not be charged")
	}
}

func TestCostAndMicros(t *testing.T) {
	if got := Cost(catalog.Route{CostMicros: 36_000}, 3); got != 108_000 {
		t.Fatalf("cost: %d", got)
	}
	if Micros(0.0000005) != 1 || Micros(1.25) != 1_250_000 {
		t.Fatal("rounding")
	}
}

func TestEstimateIsOneUnitAtTheDefaultTier(t *testing.T) {
	p := catalog.Pricing{Unit: "second", DefaultTier: "1080p", Tiers: []catalog.Tier{{ID: "720p", Price: 0.056}, {ID: "1080p", Price: 0.084}}}
	if got, ok := Estimate(p); !ok || got != 84_000 {
		t.Fatalf("estimate: %d %v", got, ok)
	}
	p.DefaultTier = "4k"
	if _, ok := Estimate(p); ok {
		t.Fatal("a missing default tier has no estimate")
	}
}

func TestLimitAllows(t *testing.T) {
	limit := int64(100)
	if !LimitAllows(nil, 1<<40, 1) || !LimitAllows(&limit, 60, 40) || LimitAllows(&limit, 60, 41) {
		t.Fatal("limit")
	}
}
