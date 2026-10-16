package media

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestRehostRewritesEveryURL(t *testing.T) {
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "video/mp4")
		_, _ = w.Write([]byte("fake video"))
	}))
	defer upstream.Close()

	store := &Memory{BaseURL: "https://cdn.modelvend.ai"}
	r := &Rehoster{Store: store, HTTP: upstream.Client()}
	out, err := r.Rehost(context.Background(), "task_1", json.RawMessage(`{
		"video": {"url": "`+upstream.URL+`/v.mp4"},
		"thumbnails": [{"url": "data:image/png;base64,iVBORw0KGgo="}],
		"seed": 7
	}`))
	if err != nil {
		t.Fatal(err)
	}
	s := string(out)
	if strings.Contains(s, upstream.URL) || strings.Contains(s, "data:") {
		t.Fatalf("upstream URL left in output: %s", s)
	}
	if !strings.Contains(s, "https://cdn.modelvend.ai/o/task_1/") || !strings.Contains(s, `"seed":7`) {
		t.Fatalf("unexpected output: %s", s)
	}
	if len(store.Files) != 2 {
		t.Fatalf("want 2 files, got %d", len(store.Files))
	}
	if string(store.Files["o/task_1/0.mp4"]) != "fake video" && string(store.Files["o/task_1/1.mp4"]) != "fake video" {
		t.Fatalf("video not stored: %v", store.Files)
	}
}

func TestRehostRefusesOtherSchemes(t *testing.T) {
	r := &Rehoster{Store: &Memory{}}
	if _, err := r.Rehost(context.Background(), "t", json.RawMessage(`{"url": "file:///etc/passwd"}`)); err == nil {
		t.Fatal("file URLs must be refused")
	}
}

func TestPassThroughWithoutStore(t *testing.T) {
	r := &Rehoster{}
	out, err := r.Rehost(context.Background(), "t", json.RawMessage(`{"url":"https://x"}`))
	if err != nil || string(out) != `{"url":"https://x"}` {
		t.Fatalf("%s %v", out, err)
	}
}
