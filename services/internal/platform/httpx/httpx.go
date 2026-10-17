// Package httpx holds what every HTTP surface shares: JSON responses, the
// error shape, health endpoints and graceful serving.
package httpx

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/prometheus/client_golang/prometheus"
	"github.com/prometheus/client_golang/prometheus/promhttp"
)

// Error is a failed request as clients see it:
// {"error": {"code": "...", "message": "...", "fields": {...}}}.
type Error struct {
	Status  int               `json:"-"`
	Code    string            `json:"code"`
	Message string            `json:"message"`
	Fields  map[string]string `json:"fields,omitempty"`
}

func (e *Error) Error() string { return e.Code + ": " + e.Message }

// Errorf makes an Error with a formatted message.
func Errorf(status int, code, format string, args ...any) *Error {
	return &Error{Status: status, Code: code, Message: fmt.Sprintf(format, args...)}
}

// WriteJSON writes v with the status.
func WriteJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(v)
}

// WriteError writes err in the error shape. Anything that isn't an *Error is
// logged and answered as a generic 500, so internal details never leak.
func WriteError(w http.ResponseWriter, r *http.Request, logger *slog.Logger, err error) {
	var e *Error
	if !errors.As(err, &e) {
		logger.ErrorContext(r.Context(), "request failed", "method", r.Method, "path", r.URL.Path, "error", err)
		e = &Error{Status: http.StatusInternalServerError, Code: "internal", Message: "Something went wrong on our side. Try again in a moment."}
	}
	WriteJSON(w, e.Status, map[string]*Error{"error": e})
}

// MaxBody caps JSON request bodies.
const MaxBody = 4 << 20

// DecodeJSON reads a JSON body into v, refusing unknown fields and oversized bodies.
func DecodeJSON(r *http.Request, v any) error {
	dec := json.NewDecoder(io.LimitReader(r.Body, MaxBody+1))
	dec.DisallowUnknownFields()
	if err := dec.Decode(v); err != nil {
		return Errorf(http.StatusBadRequest, "invalid_json", "The body isn't valid JSON for this endpoint: %v", err)
	}
	return nil
}

// Health mounts GET /healthz (the process is up) and GET /readyz (its
// database answers) on mux.
func Health(mux interface {
	HandleFunc(pattern string, handler func(http.ResponseWriter, *http.Request))
}, pool *pgxpool.Pool) {
	mux.HandleFunc("GET /healthz", func(w http.ResponseWriter, _ *http.Request) {
		WriteJSON(w, http.StatusOK, map[string]string{"status": "ok"})
	})
	mux.HandleFunc("GET /readyz", func(w http.ResponseWriter, r *http.Request) {
		ctx, cancel := context.WithTimeout(r.Context(), 2*time.Second)
		defer cancel()
		if pool != nil {
			if err := pool.Ping(ctx); err != nil {
				WriteJSON(w, http.StatusServiceUnavailable, map[string]string{"status": "database unavailable"})
				return
			}
		}
		WriteJSON(w, http.StatusOK, map[string]string{"status": "ready"})
	})
}

// Server is an http.Server with the timeouts every listener uses.
func Server(addr string, handler http.Handler, logger *slog.Logger, writeTimeout time.Duration) *http.Server {
	return &http.Server{
		Addr:              addr,
		Handler:           handler,
		ReadHeaderTimeout: 10 * time.Second,
		ReadTimeout:       30 * time.Second,
		WriteTimeout:      writeTimeout,
		IdleTimeout:       2 * time.Minute,
		MaxHeaderBytes:    64 << 10,
		ErrorLog:          slog.NewLogLogger(logger.Handler(), slog.LevelWarn),
	}
}

// MetricsServer serves the registry on GET /metrics.
func MetricsServer(addr string, registry *prometheus.Registry, logger *slog.Logger) *http.Server {
	mux := http.NewServeMux()
	mux.Handle("GET /metrics", promhttp.HandlerFor(registry, promhttp.HandlerOpts{Registry: registry}))
	return Server(addr, mux, logger, 30*time.Second)
}

// shutdownGrace is how long in-flight requests get to finish.
const shutdownGrace = 30 * time.Second

// Listen serves until ctx ends or a server fails, then shuts every server down.
func Listen(ctx context.Context, logger *slog.Logger, servers ...*http.Server) error {
	failed := make(chan error, len(servers))
	for _, s := range servers {
		go func() {
			logger.Info("listening", "addr", s.Addr)
			if err := s.ListenAndServe(); !errors.Is(err, http.ErrServerClosed) {
				failed <- fmt.Errorf("serving %s: %w", s.Addr, err)
			}
		}()
	}
	var err error
	select {
	case <-ctx.Done():
		logger.Info("shutting down")
	case err = <-failed:
	}
	shutdownCtx, cancel := context.WithTimeout(context.Background(), shutdownGrace)
	defer cancel()
	for _, s := range servers {
		if serr := s.Shutdown(shutdownCtx); serr != nil {
			err = errors.Join(err, fmt.Errorf("shutting down %s: %w", s.Addr, serr))
		}
	}
	return err
}
