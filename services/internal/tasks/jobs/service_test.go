package jobs_test

import (
	"context"
	"encoding/json"
	"errors"
	"sync/atomic"
	"testing"

	"github.com/brieeflabs/modelvend/services/internal/billing"
	"github.com/brieeflabs/modelvend/services/internal/catalog"
	"github.com/brieeflabs/modelvend/services/internal/catalog/schema"
	"github.com/brieeflabs/modelvend/services/internal/identity/keys"
	"github.com/brieeflabs/modelvend/services/internal/providers"
	"github.com/brieeflabs/modelvend/services/internal/tasks"
)

// price is what one image of the env's model costs, and so what a task holds: $0.01.
const price = 10_000

// fund sets the workspace's balance.
func (e *env) fund(t *testing.T, micros int64) {
	t.Helper()
	if _, err := e.db.Exec(context.Background(), `update workspaces set balance_micros = $2 where id = $1`, e.workspace, micros); err != nil {
		t.Fatal(err)
	}
}

// money reads the workspace's balance and what its tasks hold.
func (e *env) money(t *testing.T) (balance, held int64) {
	t.Helper()
	if err := e.db.QueryRow(context.Background(), `select balance_micros, held_micros from workspaces where id = $1`, e.workspace).
		Scan(&balance, &held); err != nil {
		t.Fatal(err)
	}
	return balance, held
}

func (e *env) expectMoney(t *testing.T, balance, held int64) {
	t.Helper()
	if b, h := e.money(t); b != balance || h != held {
		t.Errorf("balance %d, held %d; want %d, %d", b, h, balance, held)
	}
}

type entry struct {
	kind   string
	amount int64
	taskID string
}

func (e *env) ledger(t *testing.T) []entry {
	t.Helper()
	rows, err := e.db.Query(context.Background(), `select kind, amount_micros, coalesce(task_id, '') from ledger_entries
		where workspace_id = $1 order by at`, e.workspace)
	if err != nil {
		t.Fatal(err)
	}
	defer rows.Close()
	var out []entry
	for rows.Next() {
		var x entry
		if err := rows.Scan(&x.kind, &x.amount, &x.taskID); err != nil {
			t.Fatal(err)
		}
		out = append(out, x)
	}
	return out
}

// create calls the task service for the env's workspace, by default for the env's model.
func (e *env) create(t *testing.T, p tasks.CreateParams) (tasks.Created, error) {
	t.Helper()
	p.WorkspaceID = e.workspace
	if p.Model == "" && p.App == "" {
		p.Model = model
	}
	if p.Input == nil {
		p.Input = json.RawMessage(`{"prompt":"x"}`)
	}
	return e.service.Create(context.Background(), p)
}

func (e *env) mustCreate(t *testing.T, p tasks.CreateParams) tasks.Task {
	t.Helper()
	created, err := e.create(t, p)
	if err != nil {
		t.Fatal(err)
	}
	return created.Task
}

func (e *env) count(t *testing.T, sql string) int {
	t.Helper()
	var n int
	if err := e.db.QueryRow(context.Background(), sql).Scan(&n); err != nil {
		t.Fatal(err)
	}
	return n
}

// gate keeps accepted jobs pending upstream until open is called.
func gate(s *script) (open func()) {
	var opened atomic.Bool
	s.onStatus = func(id string) (providers.Result, error) {
		if opened.Load() {
			return done(id), nil
		}
		return pending(id)
	}
	return func() { opened.Store(true) }
}

func TestSucceededTaskIsChargedAndReleasesItsHold(t *testing.T) {
	e := setup(t, catalog.DefaultRouting)
	e.fund(t, 1_000_000)
	open := gate(e.first)
	task := e.mustCreate(t, tasks.CreateParams{})
	if task.HoldMicros != price {
		t.Errorf("task holds %d, want %d", task.HoldMicros, price)
	}
	e.expectMoney(t, 1_000_000, price)

	open()
	task, _ = e.finish(t, task.ID)
	if task.Status != tasks.Succeeded {
		t.Fatalf("task is %s (%s)", task.Status, task.ErrorCode)
	}
	e.expectMoney(t, 1_000_000-price, 0)
	if got := e.ledger(t); len(got) != 1 || got[0] != (entry{"usage", -price, task.ID}) {
		t.Errorf("ledger is %v, want one usage entry of %d for %s", got, -price, task.ID)
	}
}

// A task that makes more units than the one it held for is charged for all
// of them, even past the balance.
func TestChargeBeyondTheHoldMayTakeTheBalanceBelowZero(t *testing.T) {
	e := setup(t, catalog.DefaultRouting)
	e.fund(t, price)
	e.first.onSubmit = func() (providers.Result, error) {
		r := done("up-1")
		r.Units = 3
		return r, nil
	}
	task, _ := e.finish(t, e.mustCreate(t, tasks.CreateParams{}).ID)
	if task.Status != tasks.Succeeded || task.PriceMicros != 3*price {
		t.Fatalf("task is %s at %d, want succeeded at %d", task.Status, task.PriceMicros, 3*price)
	}
	e.expectMoney(t, price-3*price, 0)
}

func TestFailedTaskOnlyReleasesItsHold(t *testing.T) {
	for name, fail := range map[string]func(e *env){
		// Refused by every route: the task fails without an attempt running.
		"refused": func(e *env) {
			e.first.onSubmit = refused(providers.Unavailable)
			e.second.onSubmit = refused(providers.Unavailable)
		},
		// Accepted, then failed upstream: the attempt and the task end together.
		"failed upstream": func(e *env) {
			e.first.onStatus = func(id string) (providers.Result, error) {
				return providers.Result{State: providers.Failed, UpstreamID: id,
					Error: &providers.UpstreamError{Kind: providers.Internal, Message: "boom"}}, nil
			}
		},
	} {
		t.Run(name, func(t *testing.T) {
			e := setup(t, catalog.DefaultRouting)
			e.fund(t, 1_000_000)
			fail(e)
			task, _ := e.finish(t, e.mustCreate(t, tasks.CreateParams{}).ID)
			if task.Status != tasks.Failed {
				t.Fatalf("task is %s", task.Status)
			}
			e.expectMoney(t, 1_000_000, 0)
			if got := e.ledger(t); len(got) != 0 {
				t.Errorf("a failed task posted %v", got)
			}
		})
	}
}

func TestCanceledTaskOnlyReleasesItsHold(t *testing.T) {
	e := setup(t, catalog.DefaultRouting)
	e.fund(t, 1_000_000)
	e.first.onStatus = pending
	task := e.mustCreate(t, tasks.CreateParams{})
	waitFor(t, "the first attempt to be accepted", func() bool {
		a := e.attempts(t, task.ID)
		return len(a) == 1 && a[0].UpstreamID != ""
	})
	if _, err := e.service.Cancel(context.Background(), e.workspace, task.ID); err != nil {
		t.Fatal(err)
	}
	e.expectMoney(t, 1_000_000, 0)
	waitFor(t, "the attempt to be canceled", func() bool { return e.attempts(t, task.ID)[0].Status == "canceled" })
	e.expectMoney(t, 1_000_000, 0)
	if got := e.ledger(t); len(got) != 0 {
		t.Errorf("a canceled task posted %v", got)
	}
}

func TestExpiredTaskReleasesItsHold(t *testing.T) {
	e := setup(t, catalog.DefaultRouting)
	e.fund(t, 1_000_000)
	e.first.onStatus = pending
	task := e.mustCreate(t, tasks.CreateParams{})
	if _, err := e.db.Exec(context.Background(), `update tasks set created_at = now() - interval '25 hours' where id = $1`, task.ID); err != nil {
		t.Fatal(err)
	}
	e.sweep(t)
	if got, _ := e.finish(t, task.ID); got.Status != tasks.Failed {
		t.Fatalf("task is %s", got.Status)
	}
	e.expectMoney(t, 1_000_000, 0)
}

func TestTaskBeyondTheBalanceIsRefused(t *testing.T) {
	e := setup(t, catalog.DefaultRouting)
	e.first.onStatus = pending
	e.fund(t, price+price/2)
	e.mustCreate(t, tasks.CreateParams{})
	// What the first task holds isn't available to the second.
	if _, err := e.create(t, tasks.CreateParams{}); !errors.Is(err, billing.ErrInsufficientCredits) {
		t.Fatalf("got %v, want insufficient credits", err)
	}
	e.expectMoney(t, price+price/2, price)
	if n := e.count(t, `select count(*) from tasks`); n != 1 {
		t.Errorf("%d tasks written, want 1", n)
	}
	if n := e.count(t, `select count(*) from river_job where kind = 'dispatch_task'`); n != 1 {
		t.Errorf("%d dispatch jobs written, want 1", n)
	}
}

func TestRepeatedIdempotencyKeyHoldsOnce(t *testing.T) {
	e := setup(t, catalog.DefaultRouting)
	e.first.onStatus = pending
	e.fund(t, 1_000_000)
	p := tasks.CreateParams{IdempotencyKey: "order-1", Input: json.RawMessage(`{"prompt": "x", "n": 1}`)}
	first, err := e.create(t, p)
	if err != nil || !first.Created {
		t.Fatalf("first call: %+v %v", first, err)
	}
	// The same object in another key order is the same request.
	p.Input = json.RawMessage(`{"n":1,"prompt":"x"}`)
	again, err := e.create(t, p)
	if err != nil || again.Created || again.Task.ID != first.Task.ID {
		t.Fatalf("repeat: created %v, task %s, err %v; want task %s", again.Created, again.Task.ID, err, first.Task.ID)
	}
	e.expectMoney(t, 1_000_000, price)

	// A retry gets its task back even once the balance no longer covers a new one.
	e.fund(t, 0)
	if again, err := e.create(t, p); err != nil || again.Task.ID != first.Task.ID {
		t.Fatalf("repeat without credits: %s %v", again.Task.ID, err)
	}
	if n := e.count(t, `select count(*) from tasks`); n != 1 {
		t.Errorf("%d tasks written, want 1", n)
	}
}

func TestIdempotencyKeyReusedForAnotherRequestIsRefused(t *testing.T) {
	e := setup(t, catalog.DefaultRouting)
	e.first.onStatus = pending
	e.fund(t, 1_000_000)
	e.mustCreate(t, tasks.CreateParams{IdempotencyKey: "order-1", Input: json.RawMessage(`{"prompt":"a cat"}`)})
	_, err := e.create(t, tasks.CreateParams{IdempotencyKey: "order-1", Input: json.RawMessage(`{"prompt":"a dog"}`)})
	if !errors.Is(err, tasks.ErrIdempotencyKeyReused) {
		t.Fatalf("got %v, want idempotency key reused", err)
	}
	e.expectMoney(t, 1_000_000, price)
}

func TestIdempotencyKeyExpiresAfterADay(t *testing.T) {
	e := setup(t, catalog.DefaultRouting)
	e.first.onStatus = pending
	e.fund(t, 1_000_000)
	old := e.mustCreate(t, tasks.CreateParams{IdempotencyKey: "order-1", Input: json.RawMessage(`{"prompt":"a cat"}`)})
	if _, err := e.db.Exec(context.Background(), `update tasks set created_at = now() - interval '25 hours' where id = $1`, old.ID); err != nil {
		t.Fatal(err)
	}
	created, err := e.create(t, tasks.CreateParams{IdempotencyKey: "order-1", Input: json.RawMessage(`{"prompt":"a dog"}`)})
	if err != nil || !created.Created || created.Task.ID == old.ID {
		t.Fatalf("expired key: created %v, task %s, err %v; want a new task", created.Created, created.Task.ID, err)
	}
	if n := e.count(t, `select count(*) from tasks where idempotency_key = 'order-1'`); n != 1 {
		t.Errorf("%d tasks hold the key, want only the new one", n)
	}
	e.expectMoney(t, 1_000_000, 2*price)
}

// key adds an API key and returns its principal, as the API would see it.
func (e *env) key(t *testing.T, scopes []string, limit *int64) keys.Principal {
	t.Helper()
	ctx := context.Background()
	secret, prefix, hash := keys.Generate("test")
	if scopes == nil {
		scopes = []string{}
	}
	if _, err := e.db.Exec(ctx, `insert into api_keys (workspace_id, name, prefix, secret_hash, env, scopes, spend_limit_micros)
		values ($1, 'test', $2, $3, 'test', $4, $5)`, e.workspace, prefix, hash, scopes, limit); err != nil {
		t.Fatal(err)
	}
	p, err := (&keys.Store{DB: e.db}).Authenticate(ctx, secret)
	if err != nil {
		t.Fatal(err)
	}
	return p
}

func params(p keys.Principal) tasks.CreateParams {
	return tasks.CreateParams{KeyID: p.KeyID, Scopes: p.Scopes, SpendLimitMicros: p.SpendLimitMicros}
}

func TestKeyScopes(t *testing.T) {
	e := setup(t, catalog.DefaultRouting)
	e.first.onStatus = pending
	e.fund(t, 1_000_000)
	for _, c := range []struct {
		scopes []string
		app    string
		want   error
	}{
		{scopes: nil},
		{scopes: []string{"test/model"}},
		{scopes: []string{"test/model@v1"}},
		{scopes: []string{"test/model@v2"}, want: tasks.ErrKeyScope},
		{scopes: []string{"other/model", "product-shots"}, want: tasks.ErrKeyScope},
		{scopes: []string{"test/model"}, app: "product-shots", want: tasks.ErrKeyScope},
		{scopes: []string{"product-shots"}, app: "product-shots", want: tasks.ErrAppsUnavailable},
	} {
		p := params(e.key(t, c.scopes, nil))
		if c.app != "" {
			p.App = c.app
		}
		if _, err := e.create(t, p); !errors.Is(err, c.want) {
			t.Errorf("scopes %v, app %q: got %v, want %v", c.scopes, c.app, err, c.want)
		}
	}
}

func TestKeySpendLimit(t *testing.T) {
	e := setup(t, catalog.DefaultRouting)
	e.first.onStatus = pending
	e.fund(t, 1_000_000)
	limit := int64(2*price + price/2)
	p := params(e.key(t, nil, &limit))

	first := e.mustCreate(t, p)
	e.mustCreate(t, p)
	// Two unfinished tasks hold 2*price; a third would pass the limit.
	if _, err := e.create(t, p); !errors.Is(err, billing.ErrSpendLimitReached) {
		t.Fatalf("got %v, want spend limit reached", err)
	}
	// Other keys of the workspace aren't limited by it.
	e.mustCreate(t, params(e.key(t, nil, nil)))

	// A succeeded task counts at its price rather than its hold.
	ctx := context.Background()
	if _, err := e.db.Exec(ctx, `update tasks set status = 'succeeded', price_micros = $2 where id = $1`, first.ID, price/4); err != nil {
		t.Fatal(err)
	}
	if _, err := e.create(t, p); err != nil {
		t.Fatalf("with room under the limit: %v", err)
	}
	// Last month's tasks don't count.
	if _, err := e.db.Exec(ctx, `update tasks set created_at = date_trunc('month', now() at time zone 'utc') at time zone 'utc' - interval '1 hour'
		where key_id = $1`, p.KeyID); err != nil {
		t.Fatal(err)
	}
	for range 2 {
		if _, err := e.create(t, p); err != nil {
			t.Fatalf("in a new month: %v", err)
		}
	}
}

// Balance and limits apply to test keys like live ones; the env's keys are test keys.
func TestTestKeysAreBilled(t *testing.T) {
	e := setup(t, catalog.DefaultRouting)
	p := e.key(t, nil, nil)
	if p.Env != "test" {
		t.Fatalf("key env %q", p.Env)
	}
	if _, err := e.create(t, params(p)); !errors.Is(err, billing.ErrInsufficientCredits) {
		t.Fatalf("a test key ran a task without credits: %v", err)
	}
}

func TestInputIsCleanedBeforeItIsStored(t *testing.T) {
	e := setup(t, catalog.DefaultRouting)
	e.first.onStatus = pending
	e.fund(t, 1_000_000)
	if _, err := e.db.Exec(context.Background(), `update model_versions
		set input_schema = '{"type": "object", "properties": {"prompt": {"type": "string"}}}'`); err != nil {
		t.Fatal(err)
	}
	// Postgres would refuse the insert; it must be the caller's error instead.
	_, err := e.create(t, tasks.CreateParams{Input: json.RawMessage(`{"prompt": "a\u0000b"}`)})
	var fields schema.FieldErrors
	if !errors.As(err, &fields) || fields["prompt"] == "" {
		t.Fatalf("got %v, want a field error on prompt", err)
	}
	e.expectMoney(t, 1_000_000, 0)

	task := e.mustCreate(t, tasks.CreateParams{Input: json.RawMessage(`{"prompt": "a", "sync_mode": true}`)})
	var stored map[string]any
	if err := json.Unmarshal(task.Input, &stored); err != nil || len(stored) != 1 || stored["prompt"] != "a" {
		t.Errorf("stored input %s, want the undeclared property dropped", task.Input)
	}
}
