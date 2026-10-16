// Command mcp serves the MCP endpoint (/mcp, Streamable HTTP) on HTTP_ADDR
// (default :8090). Clients authenticate with a Modelvend API key as a bearer token.
package main

import (
	"context"
	"fmt"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/brieeflabs/modelvend/services/internal/app"
	"github.com/brieeflabs/modelvend/services/internal/mcpserver"
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
	d, err := app.Open(ctx, "mcp", ":8090")
	if err != nil {
		return err
	}
	defer d.Close()

	server := &mcpserver.Server{Tasks: d.Tasks, Catalog: d.Catalog, Keys: d.Keys, Logger: d.Logger, Version: app.Version}
	mux := http.NewServeMux()
	httpx.Health(mux, d.DB)
	mux.Handle("/mcp", server.Handler())

	servers := []*http.Server{httpx.Server(d.Config.HTTPAddr, mux, d.Logger, 90*time.Second)}
	if d.Config.MetricsAddr != "" {
		servers = append(servers, httpx.MetricsServer(d.Config.MetricsAddr, d.Metrics, d.Logger))
	}
	return httpx.Listen(ctx, d.Logger, servers...)
}
