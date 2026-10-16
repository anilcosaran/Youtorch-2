// Package media copies task outputs from providers to our storage, so the
// URLs customers get are ours (cdn.modelvend.ai/o/<task>/<n>.<ext>) and keep
// working after the provider's expire. Stripping EXIF/XMP/ID3 metadata comes
// next; provenance marks such as C2PA manifests and SynthID are kept.
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
	"strings"
	"sync"

	"github.com/minio/minio-go/v7"
	"github.com/minio/minio-go/v7/pkg/credentials"

	"github.com/brieeflabs/modelvend/services/internal/platform/config"
)

// Store keeps output files.
type Store interface {
	Put(ctx context.Context, key, contentType string, body io.Reader, size int64) error
	// URL is where customers fetch key.
	URL(key string) string
}

// S3 stores files in an S3-compatible bucket (R2 in production, MinIO in development).
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

func (s *S3) Put(ctx context.Context, key, contentType string, body io.Reader, size int64) error {
	_, err := s.client.PutObject(ctx, s.bucket, key, body, size, minio.PutObjectOptions{ContentType: contentType})
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

// Rehoster rewrites every "url" in an output to a copy in Store.
type Rehoster struct {
	Store Store
	HTTP  *http.Client
}

// Rehost copies each file an output points at and returns the output with our
// URLs. Without a store (development only) the output passes through.
func (r *Rehoster) Rehost(ctx context.Context, taskID string, output json.RawMessage) (json.RawMessage, error) {
	if r.Store == nil || len(output) == 0 {
		return output, nil
	}
	var doc any
	if err := json.Unmarshal(output, &doc); err != nil {
		return nil, fmt.Errorf("output isn't JSON: %w", err)
	}
	n := 0
	if err := r.walk(ctx, taskID, doc, &n); err != nil {
		return nil, err
	}
	return json.Marshal(doc)
}

func (r *Rehoster) walk(ctx context.Context, taskID string, v any, n *int) error {
	switch x := v.(type) {
	case map[string]any:
		if u, ok := x["url"].(string); ok {
			contentType, err := r.copy(ctx, fmt.Sprintf("o/%s/%d", taskID, *n), u, x)
			if err != nil {
				return err
			}
			*n++
			if _, has := x["content_type"]; !has && contentType != "" {
				x["content_type"] = contentType
			}
		}
		for k, child := range x {
			if k != "url" {
				if err := r.walk(ctx, taskID, child, n); err != nil {
					return err
				}
			}
		}
	case []any:
		for _, child := range x {
			if err := r.walk(ctx, taskID, child, n); err != nil {
				return err
			}
		}
	}
	return nil
}

func (r *Rehoster) copy(ctx context.Context, base, src string, holder map[string]any) (string, error) {
	body, contentType, err := r.fetch(ctx, src)
	if err != nil {
		return "", err
	}
	key := base + extension(contentType)
	if err := r.Store.Put(ctx, key, contentType, bytes.NewReader(body), int64(len(body))); err != nil {
		return "", fmt.Errorf("storing output: %w", err)
	}
	holder["url"] = r.Store.URL(key)
	return contentType, nil
}

func (r *Rehoster) fetch(ctx context.Context, src string) ([]byte, string, error) {
	if rest, ok := strings.CutPrefix(src, "data:"); ok {
		meta, data, ok := strings.Cut(rest, ",")
		if !ok || !strings.HasSuffix(meta, ";base64") {
			return nil, "", errors.New("unsupported data URL in output")
		}
		body, err := base64.StdEncoding.DecodeString(data)
		return body, strings.TrimSuffix(meta, ";base64"), err
	}
	if !strings.HasPrefix(src, "https://") && !strings.HasPrefix(src, "http://") {
		return nil, "", fmt.Errorf("unsupported output URL scheme")
	}
	client := r.HTTP
	if client == nil {
		client = http.DefaultClient
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, src, nil)
	if err != nil {
		return nil, "", err
	}
	resp, err := client.Do(req)
	if err != nil {
		return nil, "", fmt.Errorf("downloading output: %w", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return nil, "", fmt.Errorf("downloading output: %s", resp.Status)
	}
	body, err := io.ReadAll(io.LimitReader(resp.Body, MaxFile+1))
	if err != nil {
		return nil, "", err
	}
	if len(body) > MaxFile {
		return nil, "", errors.New("output file is too large")
	}
	contentType, _, _ := mime.ParseMediaType(resp.Header.Get("Content-Type"))
	return body, contentType, nil
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
