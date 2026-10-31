package mcpserver

import (
	"bytes"
	"context"
	"errors"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/modelcontextprotocol/go-sdk/mcp"

	"github.com/brieeflabs/modelvend/services/internal/billing"
	"github.com/brieeflabs/modelvend/services/internal/catalog/schema"
	"github.com/brieeflabs/modelvend/services/internal/identity/keys"
)

func text(t *testing.T, res *mcp.CallToolResult) string {
	t.Helper()
	if res == nil || len(res.Content) != 1 {
		t.Fatalf("want one content item, got %+v", res)
	}
	c, ok := res.Content[0].(*mcp.TextContent)
	if !ok {
		t.Fatalf("want text, got %T", res.Content[0])
	}
	return c.Text
}

func TestToolErrorsAreOurs(t *testing.T) {
	var logs bytes.Buffer
	s := &Server{Logger: slog.New(slog.NewTextHandler(&logs, nil))}
	ctx := context.Background()
	raw := fmt.Errorf("inserting task: %w", errors.New(`ERROR: unsupported Unicode escape sequence (SQLSTATE 22P05)`))

	for _, c := range []struct {
		err  error
		want string
	}{
		{raw, "internal: Something went wrong on our side. Try again in a moment."},
		{billing.ErrInsufficientCredits, "insufficient_credits: "},
		{schema.FieldErrors{"prompt": "too long", "duration": "not one of 5, 10"},
			"invalid_input: The input doesn't match the model's schema.\n- duration: not one of 5, 10\n- prompt: too long"},
	} {
		res, out, err := s.result(ctx, nil, c.err)
		if err != nil || out != nil {
			t.Fatalf("%v: the error went to the SDK: %v", c.err, err)
		}
		if got := text(t, res); !res.IsError || !strings.HasPrefix(got, c.want) {
			t.Errorf("%v: got %q (error %v), want %q", c.err, got, res.IsError, c.want)
		}
	}
	if !strings.Contains(logs.String(), "SQLSTATE 22P05") {
		t.Errorf("the real error wasn't logged: %s", logs.String())
	}

	// Values that can't be encoded fail generically too.
	res, _, err := s.result(ctx, func() {}, nil)
	if err != nil || !res.IsError || !strings.HasPrefix(text(t, res), "internal: ") {
		t.Errorf("unencodable value: %v %v", res, err)
	}
}

func TestKeyCheckFailuresAreGeneric(t *testing.T) {
	// A database that isn't there: the lookup fails with the driver's own words.
	pool, err := pgxpool.New(context.Background(), "postgres://modelvend:secret@127.0.0.1:1/modelvend?connect_timeout=2")
	if err != nil {
		t.Fatal(err)
	}
	defer pool.Close()
	var logs bytes.Buffer
	s := &Server{Keys: &keys.Store{DB: pool}, Logger: slog.New(slog.NewTextHandler(&logs, nil))}

	secret, _, _ := keys.Generate()
	req := httptest.NewRequest(http.MethodPost, "/mcp", strings.NewReader(`{}`))
	req.Header.Set("Authorization", "Bearer "+secret)
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()
	s.Handler().ServeHTTP(rec, req)

	body, _ := io.ReadAll(rec.Body)
	if rec.Code < 500 || !strings.Contains(string(body), errKeyCheck.Error()) {
		t.Errorf("got %d %q, want a 5xx with our message", rec.Code, body)
	}
	for _, leak := range []string{"127.0.0.1", "connect", "modelvend:secret", "dial"} {
		if strings.Contains(string(body), leak) {
			t.Errorf("the response leaks %q: %s", leak, body)
		}
	}
	if !strings.Contains(logs.String(), "127.0.0.1") {
		t.Errorf("the real error wasn't logged: %s", logs.String())
	}
}
