package redact

import (
	"encoding/json"
	"strings"
	"testing"
	"time"

	"github.com/brieeflabs/modelvend/services/internal/catalog"
	"github.com/brieeflabs/modelvend/services/internal/providers"
	"github.com/brieeflabs/modelvend/services/internal/tasks"
)

func TestPublicTaskHasNoProviderDetails(t *testing.T) {
	units := 2.0
	now := time.Now()
	task := tasks.Task{
		ID: "task_x", Target: tasks.Target{Type: "model", ID: "modelvend/motion-pro"}, ModelID: "modelvend/motion-pro",
		VersionID: "v1", Status: tasks.Succeeded, Input: json.RawMessage(`{"prompt":"a"}`),
		Output: json.RawMessage(`{"images":[{"url":"https://cdn.modelvend.ai/o/task_x/0.png"}]}`),
		Units:  &units, Unit: "image", PriceMicros: 90_000, CostMicros: 72_000, CreatedAt: now, FinishedAt: &now,
	}
	b, err := json.Marshal(PublicTask(task))
	if err != nil {
		t.Fatal(err)
	}
	s := string(b)
	for _, leak := range []string{"cost_micros", "72000", "0.072", "provider", "upstream", "attempt"} {
		if strings.Contains(s, leak) {
			t.Errorf("public task leaks %q: %s", leak, s)
		}
	}
	if !strings.Contains(s, `"cost":0.09`) || !strings.Contains(s, `"version":"v1"`) {
		t.Errorf("expected price and version: %s", s)
	}
}

func TestAppTasksHideTheirRelease(t *testing.T) {
	task := tasks.Task{ID: "task_y", Target: tasks.Target{Type: "app", ID: "product-shots"}, VersionID: "v3", AppRelease: 4, Status: tasks.Running}
	pub := PublicTask(task)
	if pub.Target.Version != "" {
		t.Fatalf("app tasks must not show a version: %+v", pub.Target)
	}
}

func TestUpstreamErrorsNeverEchoProviderText(t *testing.T) {
	for _, kind := range []providers.Kind{providers.InvalidInput, providers.ContentPolicy, providers.Timeout, providers.Unavailable, providers.Internal, "weird"} {
		e := UpstreamError(&providers.UpstreamError{Kind: kind, Message: "fal-ai: SECRET upstream detail"})
		if strings.Contains(e.Message, "SECRET") || strings.Contains(e.Message, "fal") {
			t.Errorf("%s leaks upstream text: %s", kind, e.Message)
		}
		if e.Code == "" {
			t.Errorf("%s has no code", kind)
		}
	}
}

func TestWhiteLabelModelsHideTheirAuthor(t *testing.T) {
	r := catalog.Resolved{
		Model:   catalog.Model{ID: "modelvend/motion-pro", Disclosure: catalog.WhiteLabel, Author: "Kling AI"},
		Version: catalog.Version{ID: "v1"},
	}
	if PublicModel(r).Author != "" {
		t.Fatal("white-label model shows its author")
	}
	r.Model.Disclosure = catalog.Open
	if PublicModel(r).Author != "Kling AI" {
		t.Fatal("open model should credit its author")
	}
}
