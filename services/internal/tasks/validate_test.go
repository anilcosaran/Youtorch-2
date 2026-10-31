package tasks

import (
	"context"
	"encoding/json"
	"errors"
	"strings"
	"testing"
)

// Every surface goes through Create, so each refuses these in the same words,
// before anything touches the database. Postgres can't store U+0000, so it must
// be refused as bad input, not fail the insert with a 500.
func TestCreateRefusesBadRequests(t *testing.T) {
	input := json.RawMessage(`{}`)
	for field, p := range map[string]CreateParams{
		"model":           {Input: input},
		"input":           {Model: "a/b", Input: json.RawMessage(`[1]`)},
		"metadata":        {Model: "a/b", Input: input, Metadata: json.RawMessage(`{"order": "A\u0000"}`)},
		"webhook_url":     {Model: "a/b", Input: input, WebhookURL: "https://example.com/\x00"},
		"idempotency_key": {Model: "a/b", Input: input, IdempotencyKey: strings.Repeat("k", 256)},
	} {
		_, err := (&Service{}).Create(context.Background(), p)
		var invalid *InvalidRequest
		if !errors.As(err, &invalid) || invalid.Fields[field] == "" {
			t.Errorf("%s: got %v, want an invalid request naming the field", field, err)
		}
	}
	for field, p := range map[string]CreateParams{
		"both targets": {Model: "a/b", App: "c", Input: input},
		"bad model":    {Model: "not-a-model", Input: input},
		"plain http":   {Model: "a/b", Input: input, WebhookURL: "http://example.com"},
		"long metadata": {Model: "a/b", Input: input,
			Metadata: json.RawMessage(`{"a": "` + strings.Repeat("x", 5000) + `"}`)},
	} {
		_, err := (&Service{}).Create(context.Background(), p)
		var invalid *InvalidRequest
		if !errors.As(err, &invalid) {
			t.Errorf("%s: got %v, want an invalid request", field, err)
		}
	}
}

func TestParseStatusAndPageLimit(t *testing.T) {
	if s, err := ParseStatus("running"); err != nil || s != Running {
		t.Fatalf("running: %v %v", s, err)
	}
	if s, err := ParseStatus(""); err != nil || s != "" {
		t.Fatalf("empty: %v %v", s, err)
	}
	var invalid *InvalidRequest
	if _, err := ParseStatus("bogus"); !errors.As(err, &invalid) {
		t.Fatalf("bogus: %v", err)
	}
	for in, want := range map[int]int{0: 20, -1: 20, 5: 5, 100: 100, 500: 100} {
		if got := PageLimit(in); got != want {
			t.Errorf("PageLimit(%d) = %d, want %d", in, got, want)
		}
	}
}
