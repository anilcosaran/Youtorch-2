package catalog

import "testing"

func TestParseRef(t *testing.T) {
	cases := map[string]Ref{
		"google/veo-3.1":              {Publisher: "google", Slug: "veo-3.1"},
		"modelvend/lumen-1@v2":        {Publisher: "modelvend", Slug: "lumen-1", Version: "v2"},
		" bfl/flux-2-pro@2026-09-30 ": {Publisher: "bfl", Slug: "flux-2-pro", Version: "2026-09-30"},
	}
	for in, want := range cases {
		got, err := ParseRef(in)
		if err != nil || got != want {
			t.Errorf("ParseRef(%q) = %+v, %v; want %+v", in, got, err, want)
		}
	}
	for _, bad := range []string{"", "veo", "google/", "/veo", "Google/Veo", "google/veo@", "google/veo@V2", "a/b/c", "google/veo 3"} {
		if _, err := ParseRef(bad); err == nil {
			t.Errorf("ParseRef(%q) should fail", bad)
		}
	}
}

func TestRefString(t *testing.T) {
	if s := (Ref{Publisher: "kling", Slug: "kling-3", Version: "v3"}).String(); s != "kling/kling-3@v3" {
		t.Fatal(s)
	}
	if s := (Ref{Publisher: "kling", Slug: "kling-3"}).String(); s != "kling/kling-3" {
		t.Fatal(s)
	}
}

func TestPricingTier(t *testing.T) {
	p := Pricing{DefaultTier: "1080p", Tiers: []Tier{{ID: "720p", Price: 0.05}, {ID: "1080p", Price: 0.08}}}
	if tier, ok := p.Tier(""); !ok || tier.ID != "1080p" {
		t.Fatalf("default tier: %+v", tier)
	}
	if _, ok := p.Tier("4k"); ok {
		t.Fatal("unknown tier should not be found")
	}
}
