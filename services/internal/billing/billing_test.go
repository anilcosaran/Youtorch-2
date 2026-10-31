package billing

import (
	"encoding/json"
	"testing"

	"github.com/brieeflabs/modelvend/services/internal/catalog"
)

func video() catalog.Pricing {
	return catalog.Pricing{Unit: "second", DefaultTier: "1080p", TierField: "resolution", TierValues: map[string]string{"HD": "720p"},
		Tiers: []catalog.Tier{{ID: "720p", Price: 0.056}, {ID: "1080p", Price: 0.084}}}
}

func TestQuotePicksTheTierFromTheInput(t *testing.T) {
	for input, want := range map[string]int64{
		`{}`:                      420_000,
		`{"resolution": "1080p"}`: 420_000,
		`{"resolution": "720p"}`:  280_000,
		`{"resolution": "HD"}`:    280_000,
	} {
		q, err := NewQuote(video(), json.RawMessage(input))
		if err != nil {
			t.Fatalf("%s: %v", input, err)
		}
		if got := q.Amount(5); got != want {
			t.Errorf("%s: %d, want %d", input, got, want)
		}
	}
	if _, err := NewQuote(video(), json.RawMessage(`{"resolution": "4k"}`)); err == nil {
		t.Fatal("a value that picks no tier must fail, not fall back")
	}
	p := video()
	p.DefaultTier = "4k"
	if _, err := NewQuote(p, json.RawMessage(`{}`)); err == nil {
		t.Fatal("a missing default tier has no quote")
	}
}

func TestPromoAppliesToTiersNotToInput(t *testing.T) {
	promo := 0.25
	p := video()
	p.Promo = &promo
	p.Input = &catalog.InputPrice{Unit: "image", Price: 0.01, Field: "refs"}
	q, err := NewQuote(p, json.RawMessage(`{"refs": ["a", "b"]}`))
	if err != nil {
		t.Fatal(err)
	}
	// 10 s at 0.063 and 2 images at the full 0.01.
	if got := q.Amount(10); got != 650_000 {
		t.Fatalf("got %d", got)
	}
	if q.UnitPrice != 0.063 {
		t.Fatalf("unit price %v", q.UnitPrice)
	}
}

func TestInputUnits(t *testing.T) {
	p := catalog.Pricing{Unit: "image", DefaultTier: "s", Tiers: []catalog.Tier{{ID: "s", Price: 1}},
		Input: &catalog.InputPrice{Unit: "image", Price: 1, Field: "ref"}}
	for input, want := range map[string]float64{
		`{}`: 0, `{"ref": null}`: 0, `{"ref": ""}`: 0, `{"ref": "https://x"}`: 1, `{"ref": []}`: 0, `{"ref": ["a", "b", "c"]}`: 3, `{"ref": 2}`: 2,
	} {
		q, err := NewQuote(p, json.RawMessage(input))
		if err != nil {
			t.Fatal(err)
		}
		if q.InputUnits != want {
			t.Errorf("%s: %v, want %v", input, q.InputUnits, want)
		}
	}
}

func TestHoldCoversTinyUnits(t *testing.T) {
	token := catalog.Pricing{Unit: "token", DefaultTier: "s", Tiers: []catalog.Tier{{ID: "s", Price: 0.00000015}}}
	q, err := NewQuote(token, nil)
	if err != nil {
		t.Fatal(err)
	}
	if q.Hold() != 1 {
		t.Fatalf("a token's hold rounds to %d; a zero balance would pass", q.Hold())
	}
	free := catalog.Pricing{Unit: "image", DefaultTier: "s", Tiers: []catalog.Tier{{ID: "s", Price: 0}}}
	if q, _ := NewQuote(free, nil); q.Hold() != 0 {
		t.Fatal("a free model holds nothing")
	}
}

func TestCostAndMicros(t *testing.T) {
	r := catalog.Route{TierCosts: map[string]float64{"720p": 0.012, "1080p": 0.036}}
	if got := Cost(r, "1080p", 3); got != 108_000 {
		t.Fatalf("1080p: %d", got)
	}
	if got := Cost(r, "720p", 3); got != 36_000 {
		t.Fatalf("720p: %d", got)
	}
	if Micros(0.0000005) != 1 || Micros(1.25) != 1_250_000 {
		t.Fatal("rounding")
	}
}

func TestLimitAllows(t *testing.T) {
	limit := int64(100)
	if !LimitAllows(nil, 1<<40, 1) || !LimitAllows(&limit, 60, 40) || LimitAllows(&limit, 60, 41) {
		t.Fatal("limit")
	}
}
