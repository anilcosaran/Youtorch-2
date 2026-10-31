package jobs_test

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log/slog"
	"slices"
	"sync"
	"testing"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/riverqueue/river"
	"github.com/riverqueue/river/riverdriver/riverpgxv5"

	"github.com/brieeflabs/modelvend/services/internal/catalog"
	"github.com/brieeflabs/modelvend/services/internal/catalog/schema"
	"github.com/brieeflabs/modelvend/services/internal/delivery/media"
	"github.com/brieeflabs/modelvend/services/internal/platform/database/dbtest"
	"github.com/brieeflabs/modelvend/services/internal/platform/ids"
	"github.com/brieeflabs/modelvend/services/internal/providers"
	"github.com/brieeflabs/modelvend/services/internal/tasks"
	"github.com/brieeflabs/modelvend/services/internal/tasks/jobs"
)

// script is a provider each test programs. Unset hooks accept and finish at once.
type script struct {
	mu       sync.Mutex
	onSubmit func() (providers.Result, error)
	onStatus func(upstreamID string) (providers.Result, error)
	submits  int
	cancels  []string
}

func (s *script) Submit(_ context.Context, _ providers.Call) (providers.Result, error) {
	s.mu.Lock()
	s.submits++
	n, hook := s.submits, s.onSubmit
	s.mu.Unlock()
	if hook != nil {
		return hook()
	}
	return providers.Result{State: providers.Pending, UpstreamID: fmt.Sprintf("up-%d", n)}, nil
}

func (s *script) Status(_ context.Context, _ string, upstreamID string) (providers.Result, error) {
	s.mu.Lock()
	hook := s.onStatus
	s.mu.Unlock()
	if hook != nil {
		return hook(upstreamID)
	}
	return done(upstreamID), nil
}

func (s *script) Cancel(_ context.Context, _ string, upstreamID string) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.cancels = append(s.cancels, upstreamID)
	return nil
}

func (s *script) counts() (int, []string) {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.submits, slices.Clone(s.cancels)
}

func done(upstreamID string) providers.Result {
	return providers.Result{State: providers.Succeeded, UpstreamID: upstreamID, Output: json.RawMessage(`{"images":[]}`), Units: 1}
}

func pending(upstreamID string) (providers.Result, error) {
	return providers.Result{State: providers.Pending, UpstreamID: upstreamID}, nil
}

func refused(kind providers.Kind) func() (providers.Result, error) {
	return func() (providers.Result, error) {
		return providers.Result{State: providers.Failed, Error: &providers.UpstreamError{Kind: kind, Message: "refused"}}, nil
	}
}

// env is a database with one model served by two routes, "first" (tried
// first) and "second", and a running worker.
type env struct {
	db            *pgxpool.Pool
	store         *tasks.Store
	service       *tasks.Service
	client        *river.Client[pgx.Tx]
	first, second *script
	workspace     string
}

const model, version = "test/model", "v1"

func setup(t *testing.T, routing catalog.Routing) *env {
	t.Helper()
	t.Parallel()
	ctx := context.Background()
	db := dbtest.New(t)
	e := &env{db: db, store: &tasks.Store{DB: db}, first: &script{}, second: &script{}}
	routingJSON, _ := json.Marshal(routing)
	statements := []string{
		`insert into providers (id, name, kind, adapter, status, white_label_allowed) values
			('first', 'First', 'first_party', 'first', 'active', true),
			('second', 'Second', 'first_party', 'second', 'active', true)`,
		`insert into models (id, publisher, slug, name, modality, visibility, default_version)
			values ('test/model', 'test', 'model', 'Test', 'image', 'public', 'v1')`,
		`insert into model_versions (model_id, id, label, status, input_schema, output_schema, pricing, routing)
			values ('test/model', 'v1', '1', 'live', '{}', '{}',
				'{"unit": "image", "default_tier": "standard", "tiers": [{"id": "standard", "label": "Standard", "price": 0.01}]}', $1)`,
		`insert into routes (model_id, version_id, provider_id, upstream_model, priority) values
			('test/model', 'v1', 'first', 'm1', 1), ('test/model', 'v1', 'second', 'm2', 2)`,
	}
	for i, sql := range statements {
		args := []any{}
		if i == 2 {
			args = append(args, routingJSON)
		}
		if _, err := db.Exec(ctx, sql, args...); err != nil {
			t.Fatal(err)
		}
	}
	if err := db.QueryRow(ctx, `insert into workspaces (name) values ('Test') returning id`).Scan(&e.workspace); err != nil {
		t.Fatal(err)
	}

	registry := &providers.Registry{}
	registry.Register("first", e.first)
	registry.Register("second", e.second)
	logger := slog.New(slog.NewTextHandler(io.Discard, nil))
	workers := river.NewWorkers()
	jobs.Register(workers, &jobs.Deps{
		Tasks: e.store, Catalog: &catalog.Store{DB: db}, Providers: registry, Media: &media.Rehoster{}, Logger: logger,
	})
	client, err := river.NewClient[pgx.Tx](riverpgxv5.New(db), &river.Config{
		Logger:            logger,
		Queues:            map[string]river.QueueConfig{tasks.QueueDispatch: {MaxWorkers: 2}, tasks.QueuePoll: {MaxWorkers: 2}},
		Workers:           workers,
		FetchCooldown:     20 * time.Millisecond,
		FetchPollInterval: 50 * time.Millisecond,
		TestOnly:          true,
	})
	if err != nil {
		t.Fatal(err)
	}
	if err := client.Start(ctx); err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() {
		stopCtx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
		defer cancel()
		_ = client.StopAndCancel(stopCtx)
	})
	e.client = client
	e.service = &tasks.Service{DB: db, Store: e.store, Catalog: &catalog.Store{DB: db}, Schemas: &schema.Cache{}, Jobs: client}
	return e
}

// task adds a queued task, and its dispatch job unless dispatch is false.
func (e *env) task(t *testing.T, dispatch bool) string {
	t.Helper()
	ctx := context.Background()
	tx, err := e.db.Begin(ctx)
	if err != nil {
		t.Fatal(err)
	}
	defer func() { _ = tx.Rollback(ctx) }()
	saved, _, err := e.store.Insert(ctx, tx, tasks.Task{
		ID: ids.New("task"), WorkspaceID: e.workspace, Target: tasks.Target{Type: "model", ID: model},
		ModelID: model, VersionID: version, Status: tasks.Queued, Input: json.RawMessage(`{"prompt":"x"}`),
	}, tasks.Idempotency{})
	if err != nil {
		t.Fatal(err)
	}
	if dispatch {
		if _, err := e.client.InsertTx(ctx, tx, tasks.DispatchArgs{TaskID: saved.ID}, nil); err != nil {
			t.Fatal(err)
		}
	}
	if err := tx.Commit(ctx); err != nil {
		t.Fatal(err)
	}
	return saved.ID
}

// leftover adds a task created two minutes ago with one attempt still running
// on the first route and no job, as a crash would leave it.
func (e *env) leftover(t *testing.T, upstreamID string) string {
	t.Helper()
	ctx := context.Background()
	id := e.task(t, false)
	if _, err := e.db.Exec(ctx, `update tasks set status = 'running', created_at = now() - interval '2 minutes' where id = $1`, id); err != nil {
		t.Fatal(err)
	}
	if _, err := e.db.Exec(ctx, `insert into attempts (task_id, number, route_id, provider_id, upstream_model, upstream_id, status)
		select $1, 1, id, provider_id, upstream_model, nullif($2, ''), 'running' from routes where provider_id = 'first'`, id, upstreamID); err != nil {
		t.Fatal(err)
	}
	return id
}

func (e *env) sweep(t *testing.T) {
	t.Helper()
	if _, err := e.client.Insert(context.Background(), jobs.SweepArgs{}, nil); err != nil {
		t.Fatal(err)
	}
}

// waitFor polls until ok holds or the test times out.
func waitFor(t *testing.T, what string, ok func() bool) {
	t.Helper()
	deadline := time.Now().Add(30 * time.Second)
	for !ok() {
		if time.Now().After(deadline) {
			t.Fatalf("timed out waiting for %s", what)
		}
		time.Sleep(50 * time.Millisecond)
	}
}

func (e *env) get(t *testing.T, id string) tasks.Task {
	t.Helper()
	task, err := e.store.Get(context.Background(), id)
	if err != nil {
		t.Fatal(err)
	}
	return task
}

func (e *env) attempts(t *testing.T, id string) []tasks.Attempt {
	t.Helper()
	attempts, err := e.store.Attempts(context.Background(), id)
	if err != nil {
		t.Fatal(err)
	}
	return attempts
}

// finish waits for the task to finish and returns it with its attempts.
func (e *env) finish(t *testing.T, id string) (tasks.Task, []tasks.Attempt) {
	t.Helper()
	waitFor(t, "the task to finish", func() bool { return e.get(t, id).Status.Final() })
	return e.get(t, id), e.attempts(t, id)
}

func statuses(attempts []tasks.Attempt) []string {
	out := make([]string, len(attempts))
	for i, a := range attempts {
		out[i] = a.ProviderID + ":" + a.Status
	}
	return out
}

func expect(t *testing.T, task tasks.Task, attempts []tasks.Attempt, status tasks.Status, want ...string) {
	t.Helper()
	if task.Status != status {
		t.Errorf("task is %s (%s), want %s", task.Status, task.ErrorCode, status)
	}
	if got := statuses(attempts); !slices.Equal(got, want) {
		t.Errorf("attempts are %v, want %v", got, want)
	}
}

func TestAcceptedTaskIsPolledToSuccess(t *testing.T) {
	e := setup(t, catalog.DefaultRouting)
	task, attempts := e.finish(t, e.task(t, true))
	expect(t, task, attempts, tasks.Succeeded, "first:succeeded")
}

func TestRefusedTaskFallsBackToTheNextRoute(t *testing.T) {
	e := setup(t, catalog.DefaultRouting)
	e.first.onSubmit = refused(providers.Unavailable)
	task, attempts := e.finish(t, e.task(t, true))
	expect(t, task, attempts, tasks.Succeeded, "first:failed", "second:succeeded")
}

func TestRefusedTaskStaysOnOneRouteWithoutFallbacks(t *testing.T) {
	routing := catalog.DefaultRouting
	routing.Fallbacks = false
	e := setup(t, routing)
	e.first.onSubmit = refused(providers.Unavailable)
	task, attempts := e.finish(t, e.task(t, true))
	expect(t, task, attempts, tasks.Failed, "first:failed")
	if task.ErrorCode != tasks.CodeUnavailable {
		t.Errorf("error code %q, want %q", task.ErrorCode, tasks.CodeUnavailable)
	}
}

func TestAcceptedTaskThatFailsUpstreamDoesNotFallBack(t *testing.T) {
	e := setup(t, catalog.DefaultRouting)
	e.first.onStatus = func(id string) (providers.Result, error) {
		return providers.Result{State: providers.Failed, UpstreamID: id,
			Error: &providers.UpstreamError{Kind: providers.Unavailable, Message: "worker lost"}}, nil
	}
	task, attempts := e.finish(t, e.task(t, true))
	expect(t, task, attempts, tasks.Failed, "first:failed")
	if submits, _ := e.second.counts(); submits != 0 {
		t.Errorf("the second route got %d submits after the first accepted the task", submits)
	}
}

func TestTimedOutTaskIsStoppedUpstreamWithoutFallback(t *testing.T) {
	routing := catalog.DefaultRouting
	routing.TimeoutSeconds = 1
	e := setup(t, routing)
	e.first.onStatus = pending
	task, attempts := e.finish(t, e.task(t, true))
	expect(t, task, attempts, tasks.Failed, "first:timeout")
	if task.ErrorCode != tasks.CodeTimeout {
		t.Errorf("error code %q, want %q", task.ErrorCode, tasks.CodeTimeout)
	}
	if _, cancels := e.first.counts(); !slices.Equal(cancels, []string{"up-1"}) {
		t.Errorf("canceled upstream %v, want [up-1]", cancels)
	}
	if submits, _ := e.second.counts(); submits != 0 {
		t.Errorf("the second route got %d submits after a timeout", submits)
	}
}

func TestSubmitWithUnknownOutcomeFailsWithoutFallback(t *testing.T) {
	e := setup(t, catalog.DefaultRouting)
	e.first.onSubmit = func() (providers.Result, error) { return providers.Result{}, errors.New("read: connection reset") }
	task, attempts := e.finish(t, e.task(t, true))
	expect(t, task, attempts, tasks.Failed, "first:failed")
	if submits, _ := e.second.counts(); submits != 0 {
		t.Errorf("the second route got %d submits when the first may have the job", submits)
	}
}

func TestCancelStopsTheUpstreamJob(t *testing.T) {
	e := setup(t, catalog.DefaultRouting)
	e.first.onStatus = pending
	id := e.task(t, true)
	waitFor(t, "the first attempt to be accepted", func() bool {
		a := e.attempts(t, id)
		return len(a) == 1 && a[0].UpstreamID != ""
	})
	if err := e.store.Cancel(context.Background(), id, time.Now()); err != nil {
		t.Fatal(err)
	}
	waitFor(t, "the attempt to be canceled", func() bool { return e.attempts(t, id)[0].Status == "canceled" })
	if _, cancels := e.first.counts(); !slices.Equal(cancels, []string{"up-1"}) {
		t.Errorf("canceled upstream %v, want [up-1]", cancels)
	}
	expect(t, e.get(t, id), e.attempts(t, id), tasks.Canceled, "first:canceled")
}

func TestCanceledTaskIsNeverSubmitted(t *testing.T) {
	e := setup(t, catalog.DefaultRouting)
	id := e.task(t, false)
	if err := e.store.Cancel(context.Background(), id, time.Now()); err != nil {
		t.Fatal(err)
	}
	if _, err := e.client.Insert(context.Background(), tasks.DispatchArgs{TaskID: id}, nil); err != nil {
		t.Fatal(err)
	}
	waitFor(t, "the dispatch job to finish", func() bool {
		var live bool
		err := e.db.QueryRow(context.Background(), `select exists (select 1 from river_job
			where kind = 'dispatch_task' and state not in ('completed', 'cancelled', 'discarded'))`).Scan(&live)
		return err == nil && !live
	})
	if submits, _ := e.first.counts(); submits != 0 {
		t.Errorf("a canceled task was submitted %d times", submits)
	}
}

func TestSweepPicksUpATaskNoJobIsWatching(t *testing.T) {
	e := setup(t, catalog.DefaultRouting)
	id := e.leftover(t, "up-7")
	e.sweep(t)
	task, attempts := e.finish(t, id)
	expect(t, task, attempts, tasks.Succeeded, "first:succeeded")
	if submits, _ := e.first.counts(); submits != 0 {
		t.Errorf("the task was submitted again %d times instead of polled", submits)
	}
}

func TestSweepFailsATaskWhoseSubmitWasLost(t *testing.T) {
	e := setup(t, catalog.DefaultRouting)
	id := e.leftover(t, "")
	e.sweep(t)
	task, attempts := e.finish(t, id)
	expect(t, task, attempts, tasks.Failed, "first:failed")
	first, _ := e.first.counts()
	second, _ := e.second.counts()
	if first+second != 0 {
		t.Errorf("the task was submitted again (%d, %d) though the provider may have it", first, second)
	}
}

func TestSweepFailsTasksUnfinishedAfterADay(t *testing.T) {
	e := setup(t, catalog.DefaultRouting)
	id := e.task(t, false)
	if _, err := e.db.Exec(context.Background(), `update tasks set created_at = now() - interval '25 hours' where id = $1`, id); err != nil {
		t.Fatal(err)
	}
	e.sweep(t)
	task, _ := e.finish(t, id)
	if task.Status != tasks.Failed || task.ErrorCode != tasks.CodeTimeout {
		t.Errorf("task is %s (%s), want failed (timeout)", task.Status, task.ErrorCode)
	}
}

func TestRouteWithAnUnimplementedTransformFallsBack(t *testing.T) {
	e := setup(t, catalog.DefaultRouting)
	if _, err := e.db.Exec(context.Background(), `update routes set transform = 'kling_v3' where provider_id = 'first'`); err != nil {
		t.Fatal(err)
	}
	task, attempts := e.finish(t, e.task(t, true))
	expect(t, task, attempts, tasks.Succeeded, "first:failed", "second:succeeded")
	if submits, _ := e.first.counts(); submits != 0 {
		t.Errorf("the route with a transform got %d submits of untransformed input", submits)
	}
}

func TestListPagesNewestFirst(t *testing.T) {
	e := setup(t, catalog.DefaultRouting)
	ctx := context.Background()
	var want []string
	for range 3 {
		want = append([]string{e.task(t, false)}, want...)
		time.Sleep(2 * time.Millisecond) // IDs order by the millisecond
	}
	if err := e.store.Cancel(ctx, want[0], time.Now()); err != nil {
		t.Fatal(err)
	}
	var got []string
	cursor := ""
	for {
		page, err := e.store.List(ctx, e.workspace, tasks.ListFilter{Before: cursor, Limit: 2})
		if err != nil {
			t.Fatal(err)
		}
		if len(page) == 0 {
			break
		}
		for _, task := range page {
			got = append(got, task.ID)
		}
		cursor = page[len(page)-1].ID
	}
	if !slices.Equal(got, want) {
		t.Errorf("listed %v, want %v", got, want)
	}
	canceled, err := e.store.List(ctx, e.workspace, tasks.ListFilter{Status: tasks.Canceled, Target: model, Limit: 101})
	if err != nil || len(canceled) != 1 || canceled[0].ID != want[0] {
		t.Errorf("filtered list: %v %v", canceled, err)
	}
}
