package keys

import (
	"net/http/httptest"
	"strings"
	"testing"
)

func TestGenerate(t *testing.T) {
	secret, prefix, hash := Generate("live")
	if !WellFormed(secret) || !strings.HasPrefix(secret, prefix) || len(prefix) != 12 {
		t.Fatalf("bad key %q prefix %q", secret, prefix)
	}
	if hash != Hash(secret) || len(hash) != 64 {
		t.Fatalf("bad hash %q", hash)
	}
	other, _, _ := Generate("live")
	if other == secret {
		t.Fatal("keys must differ")
	}
}

func TestWellFormed(t *testing.T) {
	good, _, _ := Generate("test")
	if !WellFormed(good) {
		t.Fatal(good)
	}
	for _, bad := range []string{"", "sk-123", "mv_prod_" + strings.Repeat("a", 32), "mv_live_" + strings.Repeat("a", 31), "mv_live_" + strings.Repeat("-", 32)} {
		if WellFormed(bad) {
			t.Errorf("%q should be rejected", bad)
		}
	}
}

func TestBearer(t *testing.T) {
	r := httptest.NewRequest("GET", "/", nil)
	r.Header.Set("Authorization", "Bearer  mv_live_x ")
	if Bearer(r) != "mv_live_x" {
		t.Fatal(Bearer(r))
	}
	r.Header.Set("Authorization", "Basic abc")
	if Bearer(r) != "" {
		t.Fatal("basic auth is not a bearer key")
	}
}
