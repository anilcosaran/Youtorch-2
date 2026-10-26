package redact

import (
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"strings"
	"testing"
	"time"

	"github.com/brieeflabs/modelvend/services/internal/billing"
	"github.com/brieeflabs/modelvend/services/internal/catalog"
	"github.com/brieeflabs/modelvend/services/internal/platform/httpx"
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

func TestBillingAndKeyErrorsArePublic(t *testing.T) {
	for _, c := range []struct {
		err    error
		status int
		code   string
	}{
		{billing.ErrInsufficientCredits, http.StatusPaymentRequired, "insufficient_credits"},
		{fmt.Errorf("creating: %w", billing.ErrSpendLimitReached), http.StatusPaymentRequired, "spend_limit_reached"},
		{tasks.ErrKeyScope, http.StatusForbidden, "key_scope"},
		{tasks.ErrIdempotencyKeyReused, http.StatusUnprocessableEntity, "idempotency_key_reused"},
	} {
		var he *httpx.Error
		if !errors.As(PublicError(c.err), &he) || he.Status != c.status || he.Code != c.code {
			t.Errorf("%v: got %+v, want %d %s", c.err, he, c.status, c.code)
			continue
		}
		if strings.Contains(he.Message, "billing:") || strings.Contains(he.Message, "tasks:") {
			t.Errorf("%v: the message is the internal one: %q", c.err, he.Message)
		}
	}
}
