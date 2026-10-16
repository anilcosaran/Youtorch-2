package apps

import (
	"reflect"
	"strings"
	"testing"
)

func TestRender(t *testing.T) {
	scope := map[string]any{
		"input": map[string]any{"scene": "marble countertop", "image_url": "https://x/p.png"},
		"steps": map[string]any{
			"describe": map[string]any{"output": map[string]any{"prompt": "a bottle on marble"}},
			"render":   map[string]any{"output": map[string]any{"images": []any{map[string]any{"url": "https://cdn/0.png"}}}},
		},
	}
	got, err := Render(map[string]any{
		"prompt":               "{{input.scene}} product photo",
		"reference_image_urls": []any{"{{input.image_url}}"},
		"enhanced":             "{{ steps.describe.output.prompt }}",
		"images":               "{{steps.render.output.images}}",
		"first":                "{{steps.render.output.images.0.url}}",
		"num_images":           2,
	}, scope)
	if err != nil {
		t.Fatal(err)
	}
	want := map[string]any{
		"prompt":               "marble countertop product photo",
		"reference_image_urls": []any{"https://x/p.png"},
		"enhanced":             "a bottle on marble",
		"images":               []any{map[string]any{"url": "https://cdn/0.png"}},
		"first":                "https://cdn/0.png",
		"num_images":           2,
	}
	if !reflect.DeepEqual(got, want) {
		t.Fatalf("got %#v", got)
	}
	if _, err := Render("{{input.missing}}", scope); err == nil {
		t.Fatal("missing value should fail")
	}
}

func TestValidateRelease(t *testing.T) {
	good := Release{
		Stages: []string{"Analyzing", "Rendering"},
		Steps: []Step{
			{ID: "describe", Stage: "Analyzing", Model: "modelvend/prompt-boost-1@v1", Input: map[string]any{"prompt": "{{input.scene}}"}},
			{ID: "render", Stage: "Rendering", Model: "google/nano-banana-pro@2026-09-30", Input: map[string]any{"prompt": "{{steps.describe.output.prompt}}"}},
		},
		OutputMap: map[string]any{"images": "{{steps.render.output.images}}"},
	}
	if err := good.Validate(); err != nil {
		t.Fatal(err)
	}

	bad := Release{
		Stages: []string{"Rendering"},
		Steps: []Step{
			{ID: "render", Stage: "Painting", Model: "google/nano-banana-pro", Input: map[string]any{"prompt": "{{steps.later.output.x}}"}},
			{ID: "render", Model: "x/y@v1", Input: map[string]any{"a": "{{secrets.key}}"}},
		},
	}
	err := bad.Validate()
	for _, want := range []string{"pinned", "stage \"Painting\"", "before it runs", "duplicate id", "must start with input", "output_map"} {
		if err == nil || !strings.Contains(err.Error(), want) {
			t.Errorf("want %q in %v", want, err)
		}
	}
}
