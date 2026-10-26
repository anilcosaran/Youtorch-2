// Package dbtest gives integration tests a fresh, migrated database of their
// own. Tests that use it are skipped unless TEST_DATABASE_URL points at a
// Postgres server where the user may create databases (the dev compose
// stack: postgres://modelvend:modelvend@localhost:5432/postgres).
package dbtest

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"io"
	"log/slog"
	"net/url"
	"os"
	"testing"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/brieeflabs/modelvend/services/internal/platform/database"
)

// open bounds how many test databases a test binary uses at once, and
// maxConns the pool of each: parallel tests that each run a River client
// would otherwise exhaust the server's connections (100 by default).
var open = make(chan struct{}, 6)

const maxConns = "10"

// New creates a migrated database, dropped when the test ends. It waits
// while too many other tests of the binary have one.
func New(t testing.TB) *pgxpool.Pool {
	t.Helper()
	if os.Getenv("TEST_DATABASE_URL") == "" {
		t.Skip("TEST_DATABASE_URL is not set")
	}
	open <- struct{}{}
	// Registered first, so it runs last: after the test's own cleanups have
	// stopped what uses the pool, and the database is dropped.
	t.Cleanup(func() { <-open })
	ctx, cancel := context.WithTimeout(context.Background(), time.Minute)
	defer cancel()
	u, err := url.Parse(URL(t))
	if err != nil {
		t.Fatal(err)
	}
	q := u.Query()
	q.Set("pool_max_conns", maxConns)
	u.RawQuery = q.Encode()
	pool, err := database.Open(ctx, u.String())
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(pool.Close)
	if err := database.Migrate(ctx, pool, slog.New(slog.NewTextHandler(io.Discard, nil))); err != nil {
		t.Fatal(err)
	}
	return pool
}

// URL creates an empty database, dropped when the test ends, and returns
// its connection URL.
func URL(t testing.TB) string {
	t.Helper()
	base := os.Getenv("TEST_DATABASE_URL")
	if base == "" {
		t.Skip("TEST_DATABASE_URL is not set")
	}
	ctx, cancel := context.WithTimeout(context.Background(), time.Minute)
	defer cancel()
	admin, err := pgx.Connect(ctx, base)
	if err != nil {
		t.Fatalf("connecting to TEST_DATABASE_URL: %v", err)
	}
	defer admin.Close(ctx)
	b := make([]byte, 6)
	_, _ = rand.Read(b)
	name := "test_" + hex.EncodeToString(b)
	if _, err := admin.Exec(ctx, "create database "+name); err != nil {
		t.Fatalf("creating test database: %v", err)
	}
	t.Cleanup(func() {
		ctx, cancel := context.WithTimeout(context.Background(), time.Minute)
		defer cancel()
		conn, err := pgx.Connect(ctx, base)
		if err != nil {
			return
		}
		defer conn.Close(ctx)
		_, _ = conn.Exec(ctx, "drop database if exists "+name+" with (force)")
	})
	u, err := url.Parse(base)
	if err != nil {
		t.Fatalf("parsing TEST_DATABASE_URL: %v", err)
	}
	u.Path = "/" + name
	return u.String()
}
