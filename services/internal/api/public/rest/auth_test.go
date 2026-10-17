package rest

import (
	"net/http/httptest"
	"testing"
)

func TestBearer(t *testing.T) {
	r := httptest.NewRequest("GET", "/", nil)
	r.Header.Set("Authorization", "Bearer  mv_live_x ")
	if bearer(r) != "mv_live_x" {
		t.Fatal(bearer(r))
	}
	r.Header.Set("Authorization", "Basic abc")
	if bearer(r) != "" {
		t.Fatal("basic auth is not a bearer key")
	}
}
