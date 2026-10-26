package rest

import (
	"encoding/json"
	"errors"
	"net/http"
	"testing"

	"github.com/brieeflabs/modelvend/services/internal/platform/httpx"
)

// Postgres can't store U+0000, so it must be refused as bad input before
// anything is written, not fail the insert with a 500.
func TestCreateRefusesTheNullCharacter(t *testing.T) {
	for field, body := range map[string]createBody{
		"metadata":    {Model: "a/b", Input: json.RawMessage(`{}`), Metadata: json.RawMessage(`{"order": "A\u0000"}`)},
		"webhook_url": {Model: "a/b", Input: json.RawMessage(`{}`), WebhookURL: "https://example.com/\x00"},
	} {
		err := validateCreate(&body, "")
		var he *httpx.Error
		if !errors.As(err, &he) || he.Status != http.StatusUnprocessableEntity || he.Fields[field] == "" {
			t.Errorf("%s: got %v, want a 422 on the field", field, err)
		}
	}
	ok := createBody{Model: "a/b", Input: json.RawMessage(`{}`), Metadata: json.RawMessage(`{"order": "A-1042"}`)}
	if err := validateCreate(&ok, "key-1"); err != nil {
		t.Errorf("a valid body was refused: %v", err)
	}
}
