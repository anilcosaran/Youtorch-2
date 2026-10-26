package media

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"io"
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

// Providers put file URLs under any key and in plain arrays; every one of
// them must be replaced, or the provider's CDN reaches the customer.
func TestRehostRewritesURLsUnderAnyKey(t *testing.T) {
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "image/png")
		_, _ = w.Write([]byte("png " + r.URL.Path))
	}))
	defer upstream.Close()

	store := &Memory{BaseURL: "https://cdn.modelvend.ai"}
	r := &Rehoster{Store: store, HTTP: upstream.Client()}
	out, err := r.Rehost(context.Background(), "task_2", json.RawMessage(`{
		"images": ["`+upstream.URL+`/a.png", "`+upstream.URL+`/b.png"],
		"video_url": "`+strings.ToUpper(upstream.URL[:4])+upstream.URL[4:]+`/v",
		"nested": {"frames": [{"src": "`+upstream.URL+`/a.png"}]},
		"caption": "made at `+upstream.URL+`/a.png",
		"note": "file:///etc/passwd",
		"seed": 7
	}`))
	if err != nil {
		t.Fatal(err)
	}
	var got struct {
		Images   []string `json:"images"`
		VideoURL string   `json:"video_url"`
		Nested   struct {
			Frames []struct {
				Src string `json:"src"`
			} `json:"frames"`
		} `json:"nested"`
		Caption string `json:"caption"`
		Note    string `json:"note"`
	}
	if err := json.Unmarshal(out, &got); err != nil {
		t.Fatal(err)
	}
	for _, u := range append(got.Images, got.VideoURL, got.Nested.Frames[0].Src) {
		if !strings.HasPrefix(u, "https://cdn.modelvend.ai/o/task_2/") {
			t.Errorf("%q wasn't rewritten: %s", u, out)
		}
	}
	// One file in two places is copied once.
	if got.Nested.Frames[0].Src != got.Images[0] || len(store.Files) != 3 {
		t.Errorf("a repeated URL was copied again: %d files, %s", len(store.Files), out)
	}
	// URLs inside text and other schemes outside "url" keys are text, not files.
	if !strings.Contains(got.Caption, upstream.URL) || got.Note != "file:///etc/passwd" {
		t.Errorf("text was changed: %s", out)
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

// discard is a store that streams what it is given, as S3 does, and keeps nothing.
type discard struct{ size int64 }

func (d *discard) Put(_ context.Context, _, _ string, body io.Reader, size int64) error {
	d.size = size
	_, err := io.Copy(io.Discard, body)
	return err
}

func (d *discard) URL(key string) string { return "https://cdn.modelvend.ai/" + key }

func TestLargeFilesAreRefusedWhileStreaming(t *testing.T) {
	big := bytes.Repeat([]byte("x"), 64<<10)
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		// Chunked, so the size is only known by reading.
		w.(http.Flusher).Flush()
		for range 4 {
			_, _ = w.Write(big)
		}
	}))
	defer upstream.Close()

	store := &discard{}
	r := &Rehoster{Store: store, HTTP: upstream.Client()}
	body, size, _, err := r.open(context.Background(), upstream.URL)
	if err != nil {
		t.Fatal(err)
	}
	defer body.Close()
	if size != -1 {
		t.Fatalf("size %d, want unknown", size)
	}
	body.(*limited).left = int64(len(big)) * 3
	if _, err := io.Copy(io.Discard, body); !errors.Is(err, ErrTooLarge) {
		t.Fatalf("got %v, want ErrTooLarge", err)
	}

	// Within the cap the whole file streams through, its size unknown to the store.
	if _, err := r.Rehost(context.Background(), "t", json.RawMessage(`{"url": "`+upstream.URL+`"}`)); err != nil || store.size != -1 {
		t.Fatalf("size %d, err %v", store.size, err)
	}
}
