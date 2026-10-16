// Package jobs holds the worker's River jobs. A task moves through them:
//
//	dispatch_task  plan the routes, submit to the next untried one
//	poll_task      check a pending upstream job until it finishes or times out
//
// A route that fails before producing output hands the task to the next one,
// up to the version's max attempts; then the task fails with our error. On
// success the output is copied to our storage and the task is priced.
// Webhook delivery, app runs and maintenance jobs join this package next.
package jobs

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/riverqueue/river"

	"github.com/brieeflabs/modelvend/services/internal/billing"
	"github.com/brieeflabs/modelvend/services/internal/catalog"
	"github.com/brieeflabs/modelvend/services/internal/media"
	"github.com/brieeflabs/modelvend/services/internal/providers"
	"github.com/brieeflabs/modelvend/services/internal/providers/mapping"
	"github.com/brieeflabs/modelvend/services/internal/redact"
	"github.com/brieeflabs/modelvend/services/internal/routing"
	"github.com/brieeflabs/modelvend/services/internal/tasks"
)

// Deps is what the jobs need.
type Deps struct {
	Tasks     *tasks.Store
	Catalog   *catalog.Store
	Providers *providers.Registry
	Media     *media.Rehoster
	Logger    *slog.Logger
}

// Register adds every job to workers.
func Register(workers *river.Workers, d *Deps) {
	river.AddWorker(workers, &DispatchWorker{d: d})
	river.AddWorker(workers, &PollWorker{d: d})
}

// run is one task with what it resolved to.
type run struct {
	task     tasks.Task
	model    catalog.Model
	version  catalog.Version
	routes   []catalog.Route
	attempts []tasks.Attempt
}

func (d *Deps) load(ctx context.Context, taskID string) (*run, error) {
	t, err := d.Tasks.Get(ctx, taskID)
	if err != nil {
		return nil, err
	}
	r := &run{task: t}
	if t.Status.Final() {
		return r, nil
	}
	if r.model, err = d.Catalog.Model(ctx, t.ModelID); err != nil {
		return nil, fmt.Errorf("loading model %s: %w", t.ModelID, err)
	}
	if r.version, err = d.Catalog.Version(ctx, t.ModelID, t.VersionID); err != nil {
		return nil, fmt.Errorf("loading version %s@%s: %w", t.ModelID, t.VersionID, err)
	}
	if r.routes, err = d.Catalog.Routes(ctx, t.ModelID, t.VersionID); err != nil {
		return nil, fmt.Errorf("loading routes: %w", err)
	}
	if r.attempts, err = d.Tasks.Attempts(ctx, t.ID); err != nil {
		return nil, fmt.Errorf("loading attempts: %w", err)
	}
	return r, nil
}

func (r *run) maxAttempts() int { return max(r.version.Routing.MaxAttempts, 1) }

func (r *run) route(id string) (catalog.Route, bool) {
	for _, rt := range r.routes {
		if rt.ID == id {
			return rt, true
		}
	}
	return catalog.Route{}, false
}

// DispatchWorker submits a task to its next untried route.
type DispatchWorker struct {
	river.WorkerDefaults[tasks.DispatchArgs]
	d *Deps
}

func (w *DispatchWorker) Work(ctx context.Context, job *river.Job[tasks.DispatchArgs]) error {
	d := w.d
	r, err := d.load(ctx, job.Args.TaskID)
	if errors.Is(err, tasks.ErrNotFound) {
		return river.JobCancel(err)
	}
	if err != nil {
		return err
	}
	if r.task.Status.Final() {
		return nil
	}
	tried := map[string]bool{}
	var lastErr *providers.UpstreamError
	for _, a := range r.attempts {
		tried[a.RouteID] = true
		if a.Status == "running" {
			// A previous run of this job submitted already; polling carries on.
			return nil
		}
	}
	for _, rt := range routing.Plan(r.model, r.version, r.routes, nil, nil) {
		if tried[rt.ID] {
			continue
		}
		if len(r.attempts) >= r.maxAttempts() {
			break
		}
		number := len(r.attempts) + 1
		res, err := d.submit(ctx, r, rt, number)
		if err != nil {
			return err
		}
		r.attempts = append(r.attempts, tasks.Attempt{RouteID: rt.ID, Number: number})
		switch res.State {
		case providers.Pending:
			_, err := river.ClientFromContext[pgx.Tx](ctx).Insert(ctx, tasks.PollArgs{TaskID: r.task.ID, Attempt: number},
				&river.InsertOpts{ScheduledAt: time.Now().Add(2 * time.Second)})
			return err
		case providers.Succeeded:
			return d.succeed(ctx, r, rt, number, res)
		default:
			lastErr = res.Error
			if err := d.Tasks.EndAttempt(ctx, r.task.ID, number, "failed", upstreamText(res.Error), time.Now()); err != nil {
				return err
			}
			if res.Error != nil && !res.Error.Kind.Retryable() {
				return d.fail(ctx, r.task.ID, res.Error)
			}
		}
	}
	if lastErr == nil && len(r.attempts) == 0 {
		d.Logger.WarnContext(ctx, "no usable route", "task", r.task.ID, "model", r.task.ModelID, "version", r.task.VersionID)
		lastErr = &providers.UpstreamError{Kind: providers.Unavailable, Message: "no usable route"}
	}
	return d.fail(ctx, r.task.ID, lastErr)
}

// submit records an attempt and sends it to the route's provider. A provider
// that errors counts as an internal upstream failure of that attempt.
func (d *Deps) submit(ctx context.Context, r *run, rt catalog.Route, number int) (providers.Result, error) {
	now := time.Now()
	if err := d.Tasks.Start(ctx, r.task.ID, now); err != nil {
		return providers.Result{}, err
	}
	if err := d.Tasks.StartAttempt(ctx, tasks.Attempt{TaskID: r.task.ID, Number: number, RouteID: rt.ID,
		ProviderID: rt.ProviderID, UpstreamModel: rt.UpstreamModel, StartedAt: now}); err != nil {
		return providers.Result{}, err
	}
	fail := func(kind providers.Kind, msg string) (providers.Result, error) {
		return providers.Result{State: providers.Failed, Error: &providers.UpstreamError{Kind: kind, Message: msg}}, nil
	}
	p, err := d.Providers.Get(rt.Adapter)
	if err != nil {
		return fail(providers.Internal, err.Error())
	}
	spec, err := mapping.Parse(rt.Mapping)
	if err != nil {
		return fail(providers.Internal, err.Error())
	}
	input, err := spec.Apply(r.task.Input)
	if err != nil {
		return fail(providers.InvalidInput, err.Error())
	}
	res, err := p.Submit(ctx, providers.Call{TaskID: r.task.ID, UpstreamModel: rt.UpstreamModel, Input: input})
	if err != nil {
		return fail(providers.Unavailable, err.Error())
	}
	if res.UpstreamID != "" {
		if err := d.Tasks.SetUpstreamID(ctx, r.task.ID, number, res.UpstreamID); err != nil {
			return providers.Result{}, err
		}
	}
	return res, nil
}

// PollWorker checks a pending upstream job.
type PollWorker struct {
	river.WorkerDefaults[tasks.PollArgs]
	d *Deps
}

func (w *PollWorker) Work(ctx context.Context, job *river.Job[tasks.PollArgs]) error {
	d := w.d
	r, err := d.load(ctx, job.Args.TaskID)
	if errors.Is(err, tasks.ErrNotFound) {
		return river.JobCancel(err)
	}
	if err != nil {
		return err
	}
	if job.Args.Attempt < 1 || job.Args.Attempt > len(r.attempts) {
		return river.JobCancel(fmt.Errorf("task %s has no attempt %d", job.Args.TaskID, job.Args.Attempt))
	}
	a := r.attempts[job.Args.Attempt-1]
	rt, ok := r.route(a.RouteID)
	if !ok {
		return d.retryOrFail(ctx, r, a.Number, &providers.UpstreamError{Kind: providers.Internal, Message: "route was removed"}, "failed")
	}
	p, err := d.Providers.Get(rt.Adapter)
	if err != nil {
		return d.retryOrFail(ctx, r, a.Number, &providers.UpstreamError{Kind: providers.Internal, Message: err.Error()}, "failed")
	}
	if r.task.Status.Final() {
		// Canceled meanwhile: stop the upstream job, best effort.
		_ = p.Cancel(ctx, rt.UpstreamModel, a.UpstreamID)
		return d.Tasks.EndAttempt(ctx, r.task.ID, a.Number, "canceled", "", time.Now())
	}
	elapsed := time.Since(a.StartedAt)
	if timeout := time.Duration(r.version.Routing.TimeoutSeconds) * time.Second; timeout > 0 && elapsed > timeout {
		_ = p.Cancel(ctx, rt.UpstreamModel, a.UpstreamID)
		return d.retryOrFail(ctx, r, a.Number, &providers.UpstreamError{Kind: providers.Timeout,
			Message: fmt.Sprintf("no result after %s", timeout)}, "timeout")
	}
	res, err := p.Status(ctx, rt.UpstreamModel, a.UpstreamID)
	if err != nil {
		// The provider didn't answer this time; try again shortly.
		return river.JobSnooze(pollEvery(elapsed))
	}
	switch res.State {
	case providers.Pending:
		return river.JobSnooze(pollEvery(elapsed))
	case providers.Succeeded:
		return d.succeed(ctx, r, rt, a.Number, res)
	default:
		return d.retryOrFail(ctx, r, a.Number, res.Error, "failed")
	}
}

// pollEvery backs off as a job runs longer: quick images, patient videos.
func pollEvery(elapsed time.Duration) time.Duration {
	switch {
	case elapsed < 30*time.Second:
		return 2 * time.Second
	case elapsed < 2*time.Minute:
		return 5 * time.Second
	default:
		return 10 * time.Second
	}
}

// retryOrFail ends an attempt and hands the task to the next route when the
// failure allows it and attempts remain.
func (d *Deps) retryOrFail(ctx context.Context, r *run, number int, e *providers.UpstreamError, status string) error {
	if err := d.Tasks.EndAttempt(ctx, r.task.ID, number, status, upstreamText(e), time.Now()); err != nil {
		return err
	}
	if e != nil && e.Kind.Retryable() && r.version.Routing.Fallbacks && len(r.attempts) < r.maxAttempts() {
		_, err := river.ClientFromContext[pgx.Tx](ctx).Insert(ctx, tasks.DispatchArgs{TaskID: r.task.ID}, nil)
		return err
	}
	return d.fail(ctx, r.task.ID, e)
}

// succeed copies the output to our storage, prices it and finishes the task.
func (d *Deps) succeed(ctx context.Context, r *run, rt catalog.Route, number int, res providers.Result) error {
	output, err := d.Media.Rehost(ctx, r.task.ID, res.Output)
	if err != nil {
		d.Logger.ErrorContext(ctx, "copying output", "task", r.task.ID, "error", err)
		if endErr := d.Tasks.EndAttempt(ctx, r.task.ID, number, "failed", "rehost: "+err.Error(), time.Now()); endErr != nil {
			return endErr
		}
		return d.fail(ctx, r.task.ID, &providers.UpstreamError{Kind: providers.Internal, Message: err.Error()})
	}
	units := res.Units
	if units <= 0 {
		units = 1
	}
	// Tier selection by input lands with pricing; the default tier applies until then.
	price, _ := billing.Charge(r.version.Pricing, "", units)
	cost := billing.Cost(rt, units)
	now := time.Now()
	if err := d.Tasks.EndAttempt(ctx, r.task.ID, number, "succeeded", "", now); err != nil {
		return err
	}
	err = d.Tasks.Succeed(ctx, r.task.ID, output, units, r.version.Pricing.Unit, price, cost, now)
	if errors.Is(err, tasks.ErrFinal) {
		// Canceled while running: the output is dropped and nothing is charged.
		return nil
	}
	return err
}

func (d *Deps) fail(ctx context.Context, taskID string, e *providers.UpstreamError) error {
	pub := redact.UpstreamError(e)
	err := d.Tasks.Fail(ctx, taskID, pub.Code, pub.Message, time.Now())
	if errors.Is(err, tasks.ErrFinal) {
		return nil
	}
	return err
}

func upstreamText(e *providers.UpstreamError) string {
	if e == nil {
		return ""
	}
	return e.Error()
}
