// Package bootstrap wires a process together: configuration, logging, the database,
// the job queue client and the stores every binary shares.
package bootstrap

import (
	"context"
	"fmt"
	"log/slog"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/prometheus/client_golang/prometheus"
	"github.com/prometheus/client_golang/prometheus/collectors"
	"github.com/riverqueue/river"
	"github.com/riverqueue/river/riverdriver/riverpgxv5"

	"github.com/brieeflabs/modelvend/services/internal/catalog"
	"github.com/brieeflabs/modelvend/services/internal/catalog/schema"
	"github.com/brieeflabs/modelvend/services/internal/identity/keys"
	"github.com/brieeflabs/modelvend/services/internal/platform/config"
	"github.com/brieeflabs/modelvend/services/internal/platform/database"
	"github.com/brieeflabs/modelvend/services/internal/platform/logging"
	"github.com/brieeflabs/modelvend/services/internal/tasks"
)

// Version is the build's version, set with -ldflags "-X .../internal/bootstrap.Version=…".
var Version = "dev"

// Deps is what every process shares.
type Deps struct {
	Config  config.Config
	Logger  *slog.Logger
	DB      *pgxpool.Pool
	Metrics *prometheus.Registry
	// Jobs is an insert-only queue client; the worker builds its own working one.
	Jobs    *river.Client[pgx.Tx]
	Catalog *catalog.Store
	Tasks   *tasks.Service
	Keys    *keys.Store
}

// Open loads the configuration for process and connects everything.
func Open(ctx context.Context, process, defaultAddr string) (*Deps, error) {
	cfg, err := config.Load(defaultAddr)
	if err != nil {
		return nil, err
	}
	logger := logging.New(cfg, process).With("version", Version)
	pool, err := database.Open(ctx, cfg.DatabaseURL)
	if err != nil {
		return nil, err
	}
	if cfg.MigrateOnStart {
		if err := database.Migrate(ctx, pool, logger); err != nil {
			pool.Close()
			return nil, err
		}
	}
	jobs, err := river.NewClient(riverpgxv5.New(pool), &river.Config{Logger: logger})
	if err != nil {
		pool.Close()
		return nil, fmt.Errorf("job queue client: %w", err)
	}
	registry := prometheus.NewRegistry()
	registry.MustRegister(collectors.NewGoCollector(), collectors.NewProcessCollector(collectors.ProcessCollectorOpts{}))

	internal := map[string]bool{}
	for _, id := range cfg.InternalWorkspaces {
		internal[id] = true
	}
	cat := &catalog.Store{DB: pool}
	store := &tasks.Store{DB: pool}
	return &Deps{
		Config:  cfg,
		Logger:  logger,
		DB:      pool,
		Metrics: registry,
		Jobs:    jobs,
		Catalog: cat,
		Tasks:   &tasks.Service{DB: pool, Store: store, Catalog: cat, Schemas: &schema.Cache{}, Jobs: jobs},
		Keys:    &keys.Store{DB: pool, InternalWorkspaces: internal},
	}, nil
}

func (d *Deps) Close() { d.DB.Close() }
