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
	if !strings.Contains(s, `"amount_micros":90000`) || !strings.Contains(s, `"version":"v1"`) {
		t.Errorf("expected price and version: %s", s)
	}
	if strings.Contains(s, `"cost"`) {
		t.Errorf("the customer's amount must not be called cost: %s", s)
	}
}

func TestAppTasksHideTheirRelease(t *testing.T) {
	task := tasks.Task{ID: "task_y", Target: tasks.Target{Type: "app", ID: "product-shots"}, VersionID: "v3", AppRelease: 4, Status: tasks.Running}
	pub := PublicTask(task)
	if pub.Target.Version != "" {
		t.Fatalf("app tasks must not show a version: %+v", pub.Target)
	}
}

func TestModelsNeverShowTheirAuthor(t *testing.T) {
	for _, disclosure := range []catalog.Disclosure{catalog.WhiteLabel, catalog.Open} {
		r := catalog.Resolved{
			Model:   catalog.Model{ID: "modelvend/motion-pro", Disclosure: disclosure, Author: "Kling AI"},
			Version: catalog.Version{ID: "v1"},
		}
		b, err := json.Marshal(PublicModel(r))
		if err != nil {
			t.Fatal(err)
		}
		if strings.Contains(string(b), "Kling") {
			t.Errorf("%s model shows its author: %s", disclosure, b)
		}
	}
}

func TestPricesAreDecimalStringsAfterThePromo(t *testing.T) {
	promo := 0.25
	r := catalog.Resolved{Version: catalog.Version{ID: "v1", Pricing: catalog.Pricing{
		Unit: "image", DefaultTier: "s", Promo: &promo,
		Tiers: []catalog.Tier{{ID: "s", Label: "S", Price: 0.039}},
		Input: &catalog.InputPrice{Unit: "image", Price: 0.002, Field: "refs"},
	}}}
	p := PublicModel(r).Pricing
	if p.Tiers[0].Price != "0.02925" || p.Tiers[0].ListPrice != "0.039" {
		t.Errorf("tier: %+v", p.Tiers[0])
	}
	if p.Input == nil || p.Input.Price != "0.002" {
		t.Errorf("input: %+v", p.Input)
	}
	r.Version.Pricing.Promo = nil
	if tier := PublicModel(r).Pricing.Tiers[0]; tier.Price != "0.039" || tier.ListPrice != "" {
		t.Errorf("without a promo: %+v", tier)
	}
}

func TestTimesLeaveInUTCToTheSecond(t *testing.T) {
	istanbul := time.FixedZone("TRT", 3*3600)
	created := time.Date(2026, 10, 31, 12, 0, 0, 123_000_000, istanbul)
	got := PublicTask(tasks.Task{ID: "task_x", Target: tasks.Target{Type: "model"}, CreatedAt: created}).CreatedAt
	if got != "2026-10-31T09:00:00Z" {
		t.Fatalf("got %s", got)
	}
}

func TestListsLeaveOutInputAndOutput(t *testing.T) {
	list := []tasks.Task{{ID: "task_b", Input: json.RawMessage(`{"prompt":"secret-b"}`)}, {ID: "task_a"}}
	page := TaskPage(list, 1)
	if len(page.Data) != 1 || page.NextCursor == nil || *page.NextCursor != "task_b" {
		t.Fatalf("page: %+v", page)
	}
	b, _ := json.Marshal(page)
	if strings.Contains(string(b), "secret-b") || strings.Contains(string(b), `"input"`) {
		t.Fatalf("list carries input: %s", b)
	}
	if last := TaskPage(list, 2); last.NextCursor != nil || len(last.Data) != 2 {
		t.Fatalf("last page: %+v", last)
	}
}

func TestRetiredVersionNamesWhereToGo(t *testing.T) {
	var he *httpx.Error
	if !errors.As(PublicError(&catalog.RetiredError{Suggestion: "a/b@v2"}), &he) || he.Status != http.StatusGone || he.Code != "version_retired" || he.Replacement != "a/b@v2" {
		t.Fatalf("got %+v", he)
	}
	if !errors.Is(&catalog.RetiredError{}, catalog.ErrGone) {
		t.Fatal("a retired error should match ErrGone")
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
