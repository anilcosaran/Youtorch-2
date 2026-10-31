// Package jobs holds the worker's River jobs. A task moves through them:
//
//	dispatch_task  plan the routes, submit to the next untried one
//	poll_task      check a pending upstream job until it finishes or times out
//	sweep_tasks    every minute: re-dispatch tasks no job is working on, and
//	               fail tasks that have run for a day
//
// A route that refuses the task hands it to the next one, up to the version's
// max attempts, when the version allows fallbacks. Once a provider has
// accepted the task, it is polled until it finishes or times out, and never
// handed to another route: the job would be made, and paid for, twice. On
// success the output is copied to our storage and the task is priced and
// charged; however it finishes, the hold it took at creation is released
// (tasks.Store settles in the same transaction as the final status).
// App runs join this package next. Jobs of other contexts live with them
// (webhook delivery in delivery/webhooks, later Stripe jobs in billing);
// cmd/worker registers them all.
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
	"github.com/brieeflabs/modelvend/services/internal/delivery/media"
	"github.com/brieeflabs/modelvend/services/internal/providers"
	"github.com/brieeflabs/modelvend/services/internal/providers/mapping"
	"github.com/brieeflabs/modelvend/services/internal/routing"
	"github.com/brieeflabs/modelvend/services/internal/tasks"
)

const (
	// jobTimeout bounds one run of a dispatch or poll job: a synchronous
	// provider call, or copying a long video to our storage. River's default
	// of a minute would cancel those halfway.
	jobTimeout = 10 * time.Minute
	// writeTimeout bounds the writes that record what a provider said, which
	// must land even when the job's own context has run out.
	writeTimeout = 30 * time.Second

	// The sweep re-dispatches tasks created between 2*maxTaskAge and
	// unattendedAfter ago that no job is working on, and fails tasks still
	// unfinished after maxTaskAge.
	sweepEvery      = time.Minute
	unattendedAfter = time.Minute
	maxTaskAge      = 24 * time.Hour
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
	river.AddWorker(workers, &SweepWorker{d: d})
}

// Periodic lists the jobs inserted on a schedule. Every worker passes them to
// River, which inserts them from whichever process leads.
func Periodic() []*river.PeriodicJob {
	return []*river.PeriodicJob{
		river.NewPeriodicJob(river.PeriodicInterval(sweepEvery),
			func() (river.JobArgs, *river.InsertOpts) { return SweepArgs{}, nil },
			&river.PeriodicJobOpts{RunOnStart: true}),
	}
}

// run is one task with what it resolved to.
type run struct {
	task     tasks.Task
	model    catalog.Model
	version  catalog.Version
	routes   []catalog.Route
	attempts []tasks.Attempt
}

// load reads a task with its attempts and routes. A finished task keeps them
// too, to stop a provider job still running for it; only an unfinished one
// needs its model and version.
func (d *Deps) load(ctx context.Context, taskID string) (*run, error) {
	t, err := d.Tasks.Get(ctx, taskID)
	if err != nil {
		return nil, err
	}
	r := &run{task: t}
	if r.attempts, err = d.Tasks.Attempts(ctx, t.ID); err != nil {
		return nil, fmt.Errorf("loading attempts: %w", err)
	}
	if r.routes, err = d.Catalog.Routes(ctx, t.ModelID, t.VersionID); err != nil {
		return nil, fmt.Errorf("loading routes: %w", err)
	}
	if t.Status.Final() {
		return r, nil
	}
	if r.model, err = d.Catalog.Model(ctx, t.ModelID); err != nil {
		return nil, fmt.Errorf("loading model %s: %w", t.ModelID, err)
	}
	if r.version, err = d.Catalog.Version(ctx, t.ModelID, t.VersionID); err != nil {
		return nil, fmt.Errorf("loading version %s@%s: %w", t.ModelID, t.VersionID, err)
	}
	return r, nil
}

func (r *run) maxAttempts() int { return max(r.version.Routing.MaxAttempts, 1) }

// timeout is how long one attempt may run upstream; a version without one gets the default.
func (r *run) timeout() time.Duration {
	seconds := r.version.Routing.TimeoutSeconds
	if seconds <= 0 {
		seconds = catalog.DefaultRouting.TimeoutSeconds
	}
	return time.Duration(seconds) * time.Second
}

// running is the attempt still running upstream, if there is one.
func (r *run) running() (tasks.Attempt, bool) {
	for _, a := range r.attempts {
		if a.Status == "running" {
			return a, true
		}
	}
	return tasks.Attempt{}, false
}

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

func (w *DispatchWorker) Timeout(*river.Job[tasks.DispatchArgs]) time.Duration { return jobTimeout }

func (w *DispatchWorker) Work(ctx context.Context, job *river.Job[tasks.DispatchArgs]) error {
	d := w.d
	r, err := d.load(ctx, job.Args.TaskID)
	if errors.Is(err, tasks.ErrNotFound) {
		return river.JobCancel(err)
	}
	if err != nil {
		return err
	}
	if a, ok := r.running(); ok {
		// An earlier run of this job submitted already, or the sweep found the task without a job.
		return d.resume(ctx, r, a)
	}
	if r.task.Status.Final() {
		return nil
	}
	tried := map[string]bool{}
	for _, a := range r.attempts {
		tried[a.RouteID] = true
	}
	var lastErr *providers.UpstreamError
	for _, rt := range routing.Plan(r.model, r.version, r.routes, nil, nil) {
		if tried[rt.ID] {
			continue
		}
		if len(r.attempts) >= r.maxAttempts() || (len(r.attempts) > 0 && !r.version.Routing.Fallbacks) {
			break
		}
		number := len(r.attempts) + 1
		res, err := d.submit(ctx, r, rt, number)
		var lost *lostSubmit
		switch {
		case errors.Is(err, tasks.ErrFinal):
			// Canceled before it went out.
			return nil
		case errors.As(err, &lost):
			// The provider may be running it: another route could make it twice.
			return d.endAndFail(ctx, r.task.ID, number, "failed",
				&providers.UpstreamError{Kind: providers.Unavailable, Message: lost.Error()})
		case err != nil:
			return err
		}
		r.attempts = append(r.attempts, tasks.Attempt{RouteID: rt.ID, Number: number})
		switch res.State {
		case providers.Pending:
			return d.watch(ctx, r.task.ID, number)
		case providers.Succeeded:
			return d.succeed(ctx, r, rt, number, res)
		default:
			if res.Error != nil && !res.Error.Kind.Retryable() {
				return d.endAndFail(ctx, r.task.ID, number, "failed", res.Error)
			}
			// Refused before it was accepted, so another route may take it.
			lastErr = res.Error
			if err := d.Tasks.EndAttempt(ctx, r.task.ID, number, "failed", upstreamText(res.Error), time.Now()); err != nil {
				return err
			}
		}
	}
	if lastErr == nil && len(r.attempts) == 0 {
		d.Logger.WarnContext(ctx, "no usable route", "task", r.task.ID, "model", r.task.ModelID, "version", r.task.VersionID)
		lastErr = &providers.UpstreamError{Kind: providers.Unavailable, Message: "no usable route"}
	}
	return d.fail(ctx, r.task.ID, lastErr)
}

// resume picks up an attempt that was submitted but has no job watching it.
// With the provider's job ID it is polled; without one we can't tell whether
// the provider has it, so the task fails rather than risk it being made twice.
func (d *Deps) resume(ctx context.Context, r *run, a tasks.Attempt) error {
	if a.UpstreamID != "" {
		return d.watch(ctx, r.task.ID, a.Number)
	}
	return d.endAndFail(ctx, r.task.ID, a.Number, "failed",
		&providers.UpstreamError{Kind: providers.Unavailable, Message: "submitted, but the provider's job ID was never recorded"})
}

// watch queues the poll job of an attempt; there is never more than one.
func (d *Deps) watch(ctx context.Context, taskID string, number int) error {
	_, err := river.ClientFromContext[pgx.Tx](ctx).Insert(ctx, tasks.PollArgs{TaskID: taskID, Attempt: number},
		&river.InsertOpts{ScheduledAt: time.Now().Add(2 * time.Second)})
	return err
}

// lostSubmit is a Submit that errored: the provider may or may not have the job.
type lostSubmit struct{ err error }

func (e *lostSubmit) Error() string { return "submit outcome unknown: " + e.err.Error() }

// submit records an attempt and sends it to the route's provider. A route we
// can't call counts as an internal upstream failure of that attempt; a Submit
// that errors returns *lostSubmit. ErrFinal means the task was canceled first.
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
	if rt.Transform != "" {
		// No named transform is implemented yet. Without it the provider would
		// get our input as it is, so the route counts as failed before submit
		// and the task may fall back to another one.
		return fail(providers.Internal, fmt.Sprintf("transform %q isn't implemented", rt.Transform))
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
		return providers.Result{}, &lostSubmit{err: err}
	}
	if res.UpstreamID != "" {
		// The provider has the job now: its ID must be kept even if this job's time ran out meanwhile.
		wctx, cancel := context.WithTimeout(context.WithoutCancel(ctx), writeTimeout)
		defer cancel()
		if err := d.Tasks.SetUpstreamID(wctx, r.task.ID, number, res.UpstreamID); err != nil {
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

func (w *PollWorker) Timeout(*river.Job[tasks.PollArgs]) time.Duration { return jobTimeout }

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
	if a.Status != "running" {
		return nil
	}
	if r.task.Status.Final() {
		// Canceled, or failed by the sweep, while the provider works on it.
		d.stop(ctx, r, a)
		return d.Tasks.EndAttempt(ctx, r.task.ID, a.Number, "canceled", "", time.Now())
	}
	// The provider has accepted the job, so from here a failure ends the task.
	rt, ok := r.route(a.RouteID)
	if !ok {
		return d.endAndFail(ctx, r.task.ID, a.Number, "failed", &providers.UpstreamError{Kind: providers.Internal, Message: "route was removed"})
	}
	p, err := d.Providers.Get(rt.Adapter)
	if err != nil {
		return d.endAndFail(ctx, r.task.ID, a.Number, "failed", &providers.UpstreamError{Kind: providers.Internal, Message: err.Error()})
	}
	elapsed := time.Since(a.StartedAt)
	if timeout := r.timeout(); elapsed > timeout {
		d.stop(ctx, r, a)
		return d.endAndFail(ctx, r.task.ID, a.Number, "timeout", &providers.UpstreamError{Kind: providers.Timeout,
			Message: fmt.Sprintf("no result after %s", timeout)})
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
		return d.endAndFail(ctx, r.task.ID, a.Number, "failed", res.Error)
	}
}

// stop asks the provider to stop an attempt's job. It is best effort: a
// provider that can't be reached only gets a log line.
func (d *Deps) stop(ctx context.Context, r *run, a tasks.Attempt) {
	rt, ok := r.route(a.RouteID)
	if !ok || a.UpstreamID == "" {
		return
	}
	p, err := d.Providers.Get(rt.Adapter)
	if err == nil {
		err = p.Cancel(ctx, rt.UpstreamModel, a.UpstreamID)
	}
	if err != nil {
		d.Logger.WarnContext(ctx, "stopping upstream job", "task", r.task.ID, "attempt", a.Number, "error", err)
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

// endAndFail ends an attempt and fails the task with its error, together: a
// task left unfinished behind an ended attempt would be dispatched again.
func (d *Deps) endAndFail(ctx context.Context, taskID string, number int, status string, e *providers.UpstreamError) error {
	pub := tasks.UpstreamFailure(e)
	err := d.Tasks.FailAttempt(ctx, taskID, number, status, upstreamText(e), pub.Code, pub.Message, time.Now())
	if errors.Is(err, tasks.ErrFinal) {
		return nil
	}
	return err
}

// succeed copies the output to our storage, prices it and finishes the task.
func (d *Deps) succeed(ctx context.Context, r *run, rt catalog.Route, number int, res providers.Result) error {
	output, err := d.Media.Rehost(ctx, r.task.ID, res.Output)
	if err != nil {
		d.Logger.ErrorContext(ctx, "copying output", "task", r.task.ID, "error", err)
		return d.endAndFail(ctx, r.task.ID, number, "failed", &providers.UpstreamError{Kind: providers.Internal, Message: "rehost: " + err.Error()})
	}
	units := res.Units
	if units <= 0 {
		units = 1
	}
	quote := r.task.Quote
	if quote == nil {
		// Only a task from before quotes were recorded.
		q, err := billing.NewQuote(r.version.Pricing, r.task.Input)
		if err != nil {
			return d.endAndFail(ctx, r.task.ID, number, "failed", &providers.UpstreamError{Kind: providers.Internal, Message: err.Error()})
		}
		quote = &q
	}
	err = d.Tasks.SucceedAttempt(ctx, r.task.ID, number, output, units, quote.Unit,
		quote.Amount(units), billing.Cost(rt, quote.Tier, units), time.Now())
	if errors.Is(err, tasks.ErrFinal) {
		// Canceled while running: the output is dropped and nothing is charged.
		return nil
	}
	return err
}

func (d *Deps) fail(ctx context.Context, taskID string, e *providers.UpstreamError) error {
	pub := tasks.UpstreamFailure(e)
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

// SweepArgs starts one sweep.
type SweepArgs struct{}

func (SweepArgs) Kind() string { return "sweep_tasks" }

func (SweepArgs) InsertOpts() river.InsertOpts {
	return river.InsertOpts{Queue: tasks.QueueDispatch, MaxAttempts: 1}
}

// SweepWorker finds tasks that would otherwise never finish. Every unfinished
// task normally has a dispatch or poll job, but a crash between two writes, or
// a job that ran out of retries, can leave one without: those are dispatched
// again, which picks them up where they stopped. Tasks unfinished after
// maxTaskAge fail, whatever is still working on them.
type SweepWorker struct {
	river.WorkerDefaults[SweepArgs]
	d *Deps
}

func (w *SweepWorker) Work(ctx context.Context, _ *river.Job[SweepArgs]) error {
	d := w.d
	now := time.Now()
	expired, err := d.Tasks.Expire(ctx, now.Add(-maxTaskAge),
		tasks.UpstreamFailure(&providers.UpstreamError{Kind: providers.Timeout}), now)
	if err != nil {
		return fmt.Errorf("expiring tasks: %w", err)
	}
	if expired > 0 {
		d.Logger.WarnContext(ctx, "failed tasks unfinished after a day", "count", expired)
	}
	ids, err := d.Tasks.Unattended(ctx, now.Add(-2*maxTaskAge), now.Add(-unattendedAfter), 100)
	if err != nil {
		return fmt.Errorf("finding unattended tasks: %w", err)
	}
	if len(ids) == 0 {
		return nil
	}
	params := make([]river.InsertManyParams, len(ids))
	for i, id := range ids {
		params[i] = river.InsertManyParams{Args: tasks.DispatchArgs{TaskID: id}}
	}
	if _, err := river.ClientFromContext[pgx.Tx](ctx).InsertMany(ctx, params); err != nil {
		return fmt.Errorf("dispatching unattended tasks: %w", err)
	}
	d.Logger.WarnContext(ctx, "dispatched tasks no job was working on", "count", len(ids), "tasks", ids)
	return nil
}
