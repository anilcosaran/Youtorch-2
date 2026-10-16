// Command gateway serves the public API: /v1 (tasks, models, OpenAI-compatible
// endpoints) on HTTP_ADDR (default :8080), with /healthz and /readyz, and
// Prometheus metrics on METRICS_ADDR when set.
package main

import (
	"context"
	"fmt"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"

	"github.com/brieeflabs/modelvend/services/internal/app"
	"github.com/brieeflabs/modelvend/services/internal/platform/httpx"
	"github.com/brieeflabs/modelvend/services/internal/publicapi"
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
	d, err := app.Open(ctx, "gateway", ":8080")
	if err != nil {
		return err
	}
	defer d.Close()

	router := chi.NewRouter()
	router.Use(middleware.Recoverer)
	api := &publicapi.API{Tasks: d.Tasks, Catalog: d.Catalog, Keys: d.Keys, Logger: d.Logger}
	api.Routes(router)

	mux := http.NewServeMux()
	httpx.Health(mux, d.DB)
	mux.Handle("/", router)

	// Prefer: wait can hold a request for a minute.
	servers := []*http.Server{httpx.Server(d.Config.HTTPAddr, mux, d.Logger, 90*time.Second)}
	if d.Config.MetricsAddr != "" {
		servers = append(servers, httpx.MetricsServer(d.Config.MetricsAddr, d.Metrics, d.Logger))
	}
	return httpx.Listen(ctx, d.Logger, servers...)
}
