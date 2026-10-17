// Command worker works the job queues (WORKER_QUEUES, default all) with
// WORKER_CONCURRENCY jobs at once, and serves /healthz, /readyz and /metrics
// on HTTP_ADDR (default :9090).
package main

import (
	"context"
	"errors"
	"fmt"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/prometheus/client_golang/prometheus/promhttp"
	"github.com/riverqueue/river"
	"github.com/riverqueue/river/riverdriver/riverpgxv5"

	"github.com/brieeflabs/modelvend/services/internal/bootstrap"
	"github.com/brieeflabs/modelvend/services/internal/delivery/media"
	"github.com/brieeflabs/modelvend/services/internal/platform/httpx"
	"github.com/brieeflabs/modelvend/services/internal/providers"
	"github.com/brieeflabs/modelvend/services/internal/providers/fake"
	"github.com/brieeflabs/modelvend/services/internal/tasks"
	"github.com/brieeflabs/modelvend/services/internal/tasks/jobs"
)

func main() {
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	err := run(ctx)
	stop()
	if err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
}

func run(ctx context.Context) error {
	d, err := bootstrap.Open(ctx, "worker", ":9090")
	if err != nil {
		return err
	}
	defer d.Close()

	registry := &providers.Registry{}
	if d.Config.Development() {
		registry.Register(fake.Adapter, fake.New())
	}
	rehoster := &media.Rehoster{HTTP: &http.Client{Timeout: 5 * time.Minute}}
	if d.Config.Storage.Configured() {
		store, err := media.NewS3(d.Config.Storage)
		if err != nil {
			return err
		}
		rehoster.Store = store
	} else {
		d.Logger.Warn("storage isn't configured: outputs keep the provider's URLs (development only)")
	}

	workers := river.NewWorkers()
	jobs.Register(workers, &jobs.Deps{
		Tasks: d.Tasks.Store, Catalog: d.Catalog, Providers: registry, Media: rehoster, Logger: d.Logger,
	})
	queues := d.Config.Worker.Queues
	if len(queues) == 0 {
		queues = tasks.Queues
	}
	perQueue := max(d.Config.Worker.Concurrency/len(queues), 1)
	queueConfig := map[string]river.QueueConfig{}
	for _, q := range queues {
		queueConfig[q] = river.QueueConfig{MaxWorkers: perQueue}
	}
	client, err := river.NewClient[pgx.Tx](riverpgxv5.New(d.DB), &river.Config{
		Logger:  d.Logger,
		Queues:  queueConfig,
		Workers: workers,
	})
	if err != nil {
		return fmt.Errorf("job queue: %w", err)
	}
	if err := client.Start(ctx); err != nil {
		return fmt.Errorf("starting job queue: %w", err)
	}
	d.Logger.Info("working queues", "queues", queues, "concurrency", perQueue*len(queues))

	mux := http.NewServeMux()
	httpx.Health(mux, d.DB)
	mux.Handle("GET /metrics", promhttp.HandlerFor(d.Metrics, promhttp.HandlerOpts{Registry: d.Metrics}))
	serveErr := httpx.Listen(ctx, d.Logger, httpx.Server(d.Config.HTTPAddr, mux, d.Logger, 30*time.Second))

	// River's soft stop lets running jobs finish; the hard stop cancels them.
	stopCtx, cancel := context.WithTimeout(context.Background(), 25*time.Second)
	defer cancel()
	if err := client.Stop(stopCtx); err != nil && !errors.Is(err, context.DeadlineExceeded) {
		serveErr = errors.Join(serveErr, err)
	} else if err != nil {
		hardCtx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
		defer cancel()
		serveErr = errors.Join(serveErr, client.StopAndCancel(hardCtx))
	}
	return serveErr
}
