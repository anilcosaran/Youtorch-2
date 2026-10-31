// Package media copies task outputs from providers to our storage, so the
// URLs customers get are ours (cdn.modelvend.ai/o/<task>/<n>.<ext>) and keep
// working after the provider's expire. Stripping EXIF/XMP/ID3 metadata comes
// next; provenance marks such as C2PA manifests and SynthID are kept.
//
// Output URLs come from providers, so they are fetched as untrusted: through
// an egress.Client in production, and streamed to storage rather than held
// in memory.
package media

import (
	"bytes"
	"context"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"mime"
	"net/http"
	"net/url"
	"slices"
	"strings"
	"sync"

	"github.com/minio/minio-go/v7"
	"github.com/minio/minio-go/v7/pkg/credentials"

	"github.com/brieeflabs/modelvend/services/internal/platform/config"
)

// Store keeps output files.
type Store interface {
	// Put stores body under key. size is -1 when it isn't known in advance;
	// body is read once, to its end, and may be larger than any buffer.
	Put(ctx context.Context, key, contentType string, body io.Reader, size int64) error
	// URL is where customers fetch key.
	URL(key string) string
}

// S3 stores files in an S3-compatible bucket (Bunny Storage in the cluster, SeaweedFS in development).
type S3 struct {
	client    *minio.Client
	bucket    string
	publicURL string
}

func NewS3(c config.Storage) (*S3, error) {
	client, err := minio.New(c.Endpoint, &minio.Options{
		Creds:  credentials.NewStaticV4(c.AccessKey, c.SecretKey, ""),
		Secure: c.UseSSL,
		Region: c.Region,
	})
	if err != nil {
		return nil, fmt.Errorf("storage client: %w", err)
	}
	return &S3{client: client, bucket: c.Bucket, publicURL: c.PublicURL}, nil
}

// partSize is what one upload buffers at most: files larger than it go up
// in parts of this size, so memory doesn't grow with the file.
const partSize = 16 << 20

func (s *S3) Put(ctx context.Context, key, contentType string, body io.Reader, size int64) error {
	_, err := s.client.PutObject(ctx, s.bucket, key, body, size, minio.PutObjectOptions{ContentType: contentType, PartSize: partSize})
	return err
}

func (s *S3) URL(key string) string { return s.publicURL + "/" + key }

// Memory keeps files in memory, for tests.
type Memory struct {
	BaseURL string
	mu      sync.Mutex
	Files   map[string][]byte
}

func (m *Memory) Put(_ context.Context, key, _ string, body io.Reader, _ int64) error {
	b, err := io.ReadAll(body)
	if err != nil {
		return err
	}
	m.mu.Lock()
	defer m.mu.Unlock()
	if m.Files == nil {
		m.Files = map[string][]byte{}
	}
	m.Files[key] = b
	return nil
}

func (m *Memory) URL(key string) string { return m.BaseURL + "/" + key }

// MaxFile caps one output file.
const MaxFile = 2 << 30

// ErrTooLarge means an output file is larger than MaxFile.
var ErrTooLarge = errors.New("output file is too large")

// Rehoster copies every file an output points at to Store and rewrites the
// output to point at the copies.
type Rehoster struct {
	Store Store
	// HTTP fetches output files; use an egress.Client. Without one, a client
	// with no address checks is used (tests only).
	HTTP *http.Client
}

// Rehost copies each file an output points at and returns the output with our
// URLs. Every http(s) URL string anywhere in the output is a file to copy,
// whatever its key ("url", "video_url", an array element), and so is a base64
// data URL; a value under a "url" key that is neither is refused. URLs inside
// longer text are left alone. Without a store (development only) the output
// passes through.
func (r *Rehoster) Rehost(ctx context.Context, taskID string, output json.RawMessage) (json.RawMessage, error) {
	if r.Store == nil || len(output) == 0 {
		return output, nil
	}
	var doc any
	if err := json.Unmarshal(output, &doc); err != nil {
		return nil, fmt.Errorf("output isn't JSON: %w", err)
	}
	w := walker{r: r, taskID: taskID, copied: map[string]copied{}}
	doc, err := w.walk(ctx, doc, "")
	if err != nil {
		return nil, err
	}
	return json.Marshal(doc)
}

// copied is a file already copied in this output: one URL in several places is stored once.
type copied struct {
	url         string
	contentType string
}

type walker struct {
	r      *Rehoster
	taskID string
	n      int
	copied map[string]copied
}

// walk returns v with its file URLs replaced; key is the key v sits under.
// Keys are visited in order, so files are numbered the same on every run.
func (w *walker) walk(ctx context.Context, v any, key string) (any, error) {
	switch x := v.(type) {
	case string:
		if !isFile(x) {
			if key == "url" {
				return nil, errors.New("unsupported output URL scheme")
			}
			return x, nil
		}
		c, err := w.copy(ctx, x)
		return c.url, err
	case map[string]any:
		keys := make([]string, 0, len(x))
		for k := range x {
			keys = append(keys, k)
		}
		slices.Sort(keys)
		for _, k := range keys {
			before, _ := x[k].(string)
			out, err := w.walk(ctx, x[k], k)
			if err != nil {
				return nil, err
			}
			x[k] = out
			if k == "url" && isFile(before) {
				if _, has := x["content_type"]; !has && w.copied[before].contentType != "" {
					x["content_type"] = w.copied[before].contentType
				}
			}
		}
	case []any:
		for i, child := range x {
			out, err := w.walk(ctx, child, "")
			if err != nil {
				return nil, err
			}
			x[i] = out
		}
	}
	return v, nil
}

// isFile reports whether s, the whole string, is an http(s) URL or a base64 data URL.
func isFile(s string) bool {
	if rest, ok := strings.CutPrefix(s, "data:"); ok {
		meta, _, ok := strings.Cut(rest, ",")
		return ok && strings.HasSuffix(meta, ";base64")
	}
	if strings.ContainsAny(s, " \t\r\n") {
		return false
	}
	u, err := url.Parse(s)
	return err == nil && (u.Scheme == "https" || u.Scheme == "http") && u.Host != ""
}

func (w *walker) copy(ctx context.Context, src string) (copied, error) {
	if c, ok := w.copied[src]; ok {
		return c, nil
	}
	body, size, contentType, err := w.r.open(ctx, src)
	if err != nil {
		return copied{}, err
	}
	defer body.Close()
	key := fmt.Sprintf("o/%s/%d%s", w.taskID, w.n, extension(contentType))
	if err := w.r.Store.Put(ctx, key, contentType, body, size); err != nil {
		return copied{}, fmt.Errorf("storing output: %w", err)
	}
	w.n++
	c := copied{url: w.r.Store.URL(key), contentType: contentType}
	w.copied[src] = c
	return c, nil
}

// open starts reading a file: its body, its size (-1 when unknown) and its
// content type. The body fails with ErrTooLarge past MaxFile.
func (r *Rehoster) open(ctx context.Context, src string) (io.ReadCloser, int64, string, error) {
	if rest, ok := strings.CutPrefix(src, "data:"); ok {
		// Already in memory as part of the output, so decoding it all is no worse.
		meta, data, _ := strings.Cut(rest, ",")
		body, err := base64.StdEncoding.DecodeString(data)
		if err != nil {
			return nil, 0, "", fmt.Errorf("decoding data URL in output: %w", err)
		}
		return io.NopCloser(bytes.NewReader(body)), int64(len(body)), strings.TrimSuffix(meta, ";base64"), nil
	}
	client := r.HTTP
	if client == nil {
		client = http.DefaultClient
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, src, nil)
	if err != nil {
		return nil, 0, "", err
	}
	resp, err := client.Do(req)
	if err != nil {
		return nil, 0, "", fmt.Errorf("downloading output: %w", err)
	}
	if resp.StatusCode != http.StatusOK {
		resp.Body.Close()
		return nil, 0, "", fmt.Errorf("downloading output: %s", resp.Status)
	}
	if resp.ContentLength > MaxFile {
		resp.Body.Close()
		return nil, 0, "", ErrTooLarge
	}
	contentType, _, _ := mime.ParseMediaType(resp.Header.Get("Content-Type"))
	return &limited{ReadCloser: resp.Body, left: MaxFile}, resp.ContentLength, contentType, nil
}

// limited fails with ErrTooLarge once more than left bytes come through,
// rather than cutting the file short.
type limited struct {
	io.ReadCloser
	left int64
}

func (l *limited) Read(p []byte) (int, error) {
	if int64(len(p)) > l.left+1 {
		p = p[:l.left+1]
	}
	n, err := l.ReadCloser.Read(p)
	l.left -= int64(n)
	if l.left < 0 {
		return n, ErrTooLarge
	}
	return n, err
}

func extension(contentType string) string {
	switch contentType {
	case "image/png":
		return ".png"
	case "image/jpeg":
		return ".jpg"
	case "image/webp":
		return ".webp"
	case "video/mp4":
		return ".mp4"
	case "audio/mpeg":
		return ".mp3"
	case "audio/wav", "audio/x-wav":
		return ".wav"
	case "model/gltf-binary":
		return ".glb"
	}
	if exts, _ := mime.ExtensionsByType(contentType); len(exts) > 0 {
		return exts[0]
	}
	return ""
}
