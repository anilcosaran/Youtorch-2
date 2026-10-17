// Command migrate manages the database:
//
//	migrate [up]                     apply the schema and River's tables
//	migrate catalog import <paths…>  import model and app manifests as drafts
//	migrate dev-seed                 add a fake provider, a live test model and a
//	                                 workspace with an API key (development only)
package main

import (
	"context"
	"errors"
	"fmt"
	"os"
	"os/signal"
	"syscall"

	"github.com/brieeflabs/modelvend/services/internal/catalog/manifest"
	"github.com/brieeflabs/modelvend/services/internal/platform/config"
	"github.com/brieeflabs/modelvend/services/internal/platform/database"
	"github.com/brieeflabs/modelvend/services/internal/platform/logging"
)

const usage = `usage:
  migrate [up]
  migrate catalog import <file or directory>...
  migrate dev-seed`

func main() {
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	err := run(ctx, os.Args[1:])
	stop()
	if err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
}

func run(ctx context.Context, args []string) error {
	cfg, err := config.Load("")
	if err != nil {
		// Migrations need only the database; storage settings don't matter here.
		if cfg.DatabaseURL == "" {
			return err
		}
	}
	logger := logging.New(cfg, "migrate")
	pool, err := database.Open(ctx, cfg.DatabaseURL)
	if err != nil {
		return err
	}
	defer pool.Close()

	switch {
	case len(args) == 0 || (len(args) == 1 && args[0] == "up"):
		return database.Migrate(ctx, pool, logger)
	case len(args) >= 3 && args[0] == "catalog" && args[1] == "import":
		files, err := manifest.Files(args[2:])
		if err != nil {
			return err
		}
		im := &manifest.Importer{DB: pool, Report: func(line string) { fmt.Println(line) }}
		var errs []error
		for _, f := range files {
			if err := im.ImportFile(ctx, f); err != nil {
				errs = append(errs, err)
			}
		}
		return errors.Join(errs...)
	case len(args) == 1 && args[0] == "dev-seed":
		if !cfg.Development() {
			return errors.New("dev-seed runs only with APP_ENV=development")
		}
		return devSeed(ctx, pool, os.Getenv("DEV_API_KEY"))
	default:
		return errors.New(usage)
	}
}
