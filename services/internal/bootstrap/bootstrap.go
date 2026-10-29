// Package bootstrap wires a process together: configuration, logging, the
// database and metrics for every binary (OpenBase), and the job queue client
// and the stores for the binaries that use them (Open).
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

// Base is what every process shares.
type Base struct {
	Config  config.Config
	Logger  *slog.Logger
	DB      *pgxpool.Pool
	Metrics *prometheus.Registry
}

// Deps adds the job queue client and the stores the gateway, MCP and the worker use.
type Deps struct {
	*Base
	// Jobs is an insert-only queue client; the worker builds its own working one.
	Jobs    *river.Client[pgx.Tx]
	Catalog *catalog.Store
	Tasks   *tasks.Service
	Keys    *keys.Store
}

// OpenBase loads the configuration for process, connects to the database and
// sets up logging and metrics.
func OpenBase(ctx context.Context, process, defaultAddr string) (*Base, error) {
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
	registry := prometheus.NewRegistry()
	registry.MustRegister(collectors.NewGoCollector(), collectors.NewProcessCollector(collectors.ProcessCollectorOpts{}))
	return &Base{Config: cfg, Logger: logger, DB: pool, Metrics: registry}, nil
}

// Open is OpenBase plus the job queue client and the stores.
func Open(ctx context.Context, process, defaultAddr string) (*Deps, error) {
	b, err := OpenBase(ctx, process, defaultAddr)
	if err != nil {
		return nil, err
	}
	jobs, err := river.NewClient(riverpgxv5.New(b.DB), &river.Config{Logger: b.Logger})
	if err != nil {
		b.Close()
		return nil, fmt.Errorf("job queue client: %w", err)
	}

	internal := map[string]bool{}
	for _, id := range b.Config.InternalWorkspaces {
		internal[id] = true
	}
	cat := &catalog.Store{DB: b.DB}
	store := &tasks.Store{DB: b.DB}
	return &Deps{
		Base:    b,
		Jobs:    jobs,
		Catalog: cat,
		Tasks:   &tasks.Service{DB: b.DB, Store: store, Catalog: cat, Schemas: &schema.Cache{}, Jobs: jobs},
		Keys:    &keys.Store{DB: b.DB, InternalWorkspaces: internal},
	}, nil
}

func (b *Base) Close() { b.DB.Close() }
