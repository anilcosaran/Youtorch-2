// Command adminapi serves /admin/v1 for the operator console on HTTP_ADDR
// (default :8081). It is never exposed publicly: the console's web app
// forwards /api/* to it.
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

	"github.com/brieeflabs/modelvend/services/internal/adminapi"
	"github.com/brieeflabs/modelvend/services/internal/app"
	"github.com/brieeflabs/modelvend/services/internal/platform/httpx"
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
	d, err := app.Open(ctx, "adminapi", ":8081")
	if err != nil {
		return err
	}
	defer d.Close()

	router := chi.NewRouter()
	router.Use(middleware.Recoverer)
	adminapi.Routes(router)

	mux := http.NewServeMux()
	httpx.Health(mux, d.DB)
	mux.Handle("/", router)

	servers := []*http.Server{httpx.Server(d.Config.HTTPAddr, mux, d.Logger, 60*time.Second)}
	if d.Config.MetricsAddr != "" {
		servers = append(servers, httpx.MetricsServer(d.Config.MetricsAddr, d.Metrics, d.Logger))
	}
	return httpx.Listen(ctx, d.Logger, servers...)
}
