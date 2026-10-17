package mapping

import (
	"encoding/json"
	"testing"
)

func apply(t *testing.T, spec, input string) map[string]any {
	t.Helper()
	s, err := Parse(json.RawMessage(spec))
	if err != nil {
		t.Fatal(err)
	}
	out, err := s.Apply(json.RawMessage(input))
	if err != nil {
		t.Fatal(err)
	}
	var m map[string]any
	if err := json.Unmarshal(out, &m); err != nil {
		t.Fatal(err)
	}
	return m
}

func TestApply(t *testing.T) {
	got := apply(t, `{
		"prompt": "prompt",
		"duration": {"from": "duration", "as": "string"},
		"quality": {"from": "tier", "map": {"1080p": "hd", "720p": "sd"}},
		"negative_prompt": {"const": "blurry, watermark"},
		"seed": {"from": "seed", "default": 42},
		"image": "reference.url",
		"steps": {"from": "steps", "as": "integer"}
	}`, `{"prompt": "a fox", "duration": 10, "tier": "1080p", "reference": {"url": "https://x/y.png"}, "steps": "30"}`)

	want := map[string]any{
		"prompt":          "a fox",
		"duration":        "10",
		"quality":         "hd",
		"negative_prompt": "blurry, watermark",
		"seed":            float64(42),
		"image":           "https://x/y.png",
		"steps":           float64(30),
	}
	for k, v := range want {
		if got[k] != v {
			t.Errorf("%s = %#v, want %#v", k, got[k], v)
		}
	}
	if len(got) != len(want) {
		t.Errorf("unexpected params: %v", got)
	}
}

func TestOmitsMissingFields(t *testing.T) {
	got := apply(t, `{"prompt": "prompt", "image_url": "image_url"}`, `{"prompt": "x"}`)
	if _, ok := got["image_url"]; ok {
		t.Fatalf("missing source should be omitted: %v", got)
	}
}

func TestPassThroughWithoutMapping(t *testing.T) {
	s, err := Parse(nil)
	if err != nil || s != nil {
		t.Fatalf("empty mapping: %v %v", s, err)
	}
	out, _ := s.Apply(json.RawMessage(`{"a":1}`))
	if string(out) != `{"a":1}` {
		t.Fatal(string(out))
	}
}

func TestErrors(t *testing.T) {
	if _, err := Parse(json.RawMessage(`{"x": {"as": "string"}}`)); err == nil {
		t.Error("a rule without from or const should fail")
	}
	s, _ := Parse(json.RawMessage(`{"q": {"from": "tier", "map": {"hd": "x"}}}`))
	if _, err := s.Apply(json.RawMessage(`{"tier": "4k"}`)); err == nil {
		t.Error("unmapped value should fail")
	}
	s, _ = Parse(json.RawMessage(`{"n": {"from": "n", "as": "number"}}`))
	if _, err := s.Apply(json.RawMessage(`{"n": "many"}`)); err == nil {
		t.Error("bad number should fail")
	}
}
