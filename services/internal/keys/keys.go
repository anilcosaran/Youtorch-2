// Package keys issues and checks API keys. A key looks like
// "mv_live_<32 base62 characters>"; only its SHA-256 and its first characters
// are stored, so a database leak doesn't leak working keys.
package keys

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"math/big"
	"net/http"
	"strings"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/brieeflabs/modelvend/services/internal/platform/httpx"
)

const base62 = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz"

// prefixLen is how much of a key is kept to recognise it: "mv_live_3fa9".
const prefixLen = 12

// Generate returns a new secret for env ("live" or "test"), its prefix and its hash.
func Generate(env string) (secret, prefix, hash string) {
	var b strings.Builder
	b.WriteString("mv_" + env + "_")
	for range 32 {
		n, _ := rand.Int(rand.Reader, big.NewInt(int64(len(base62))))
		b.WriteByte(base62[n.Int64()])
	}
	secret = b.String()
	return secret, secret[:prefixLen], Hash(secret)
}

// Hash is what the database stores for a secret.
func Hash(secret string) string {
	sum := sha256.Sum256([]byte(secret))
	return hex.EncodeToString(sum[:])
}

// WellFormed reports whether s looks like one of our keys, before any lookup.
func WellFormed(s string) bool {
	rest, ok := strings.CutPrefix(s, "mv_")
	if !ok {
		return false
	}
	env, body, ok := strings.Cut(rest, "_")
	if !ok || (env != "live" && env != "test") || len(body) != 32 {
		return false
	}
	for i := 0; i < len(body); i++ {
		if !strings.ContainsRune(base62, rune(body[i])) {
			return false
		}
	}
	return true
}

// Principal is who a request acts for.
type Principal struct {
	WorkspaceID string
	KeyID       string
	Env         string
	// Internal keys reach private models and staging versions.
	Internal bool
}

var ErrInvalid = errors.New("keys: invalid or revoked key")

// Store looks keys up.
type Store struct {
	DB *pgxpool.Pool
	// InternalWorkspaces are workspaces whose keys count as internal (our own team).
	InternalWorkspaces map[string]bool
}

// Authenticate finds the active key and its active workspace.
func (s *Store) Authenticate(ctx context.Context, secret string) (Principal, error) {
	if !WellFormed(secret) {
		return Principal{}, ErrInvalid
	}
	var p Principal
	var workspaceStatus string
	err := s.DB.QueryRow(ctx, `
		select k.id, k.workspace_id, k.env, w.status
		from api_keys k join workspaces w on w.id = k.workspace_id
		where k.secret_hash = $1 and k.status = 'active'`, Hash(secret)).
		Scan(&p.KeyID, &p.WorkspaceID, &p.Env, &workspaceStatus)
	if errors.Is(err, pgx.ErrNoRows) {
		return Principal{}, ErrInvalid
	}
	if err != nil {
		return Principal{}, err
	}
	if workspaceStatus != "active" {
		return Principal{}, ErrSuspended
	}
	p.Internal = s.InternalWorkspaces[p.WorkspaceID]
	return p, nil
}

// ErrSuspended means the key works but its workspace is suspended.
var ErrSuspended = errors.New("keys: workspace suspended")

type ctxKey struct{}

// FromContext returns the principal Middleware stored.
func FromContext(ctx context.Context) (Principal, bool) {
	p, ok := ctx.Value(ctxKey{}).(Principal)
	return p, ok
}

// WithPrincipal stores p in ctx.
func WithPrincipal(ctx context.Context, p Principal) context.Context {
	return context.WithValue(ctx, ctxKey{}, p)
}

// Bearer reads "Authorization: Bearer <key>".
func Bearer(r *http.Request) string {
	h := r.Header.Get("Authorization")
	token, ok := strings.CutPrefix(h, "Bearer ")
	if !ok {
		return ""
	}
	return strings.TrimSpace(token)
}

// Middleware authenticates every request with its bearer key.
func (s *Store) Middleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		p, err := s.Authenticate(r.Context(), Bearer(r))
		switch {
		case errors.Is(err, ErrInvalid):
			w.Header().Set("WWW-Authenticate", `Bearer realm="modelvend"`)
			httpx.WriteJSON(w, http.StatusUnauthorized, map[string]any{"error": httpx.Errorf(http.StatusUnauthorized,
				"unauthenticated", "Send a valid API key as Authorization: Bearer mv_live_….")})
		case errors.Is(err, ErrSuspended):
			httpx.WriteJSON(w, http.StatusForbidden, map[string]any{"error": httpx.Errorf(http.StatusForbidden,
				"account_suspended", "This workspace is suspended. Contact support.")})
		case err != nil:
			httpx.WriteJSON(w, http.StatusServiceUnavailable, map[string]any{"error": httpx.Errorf(http.StatusServiceUnavailable,
				"unavailable", "We couldn't check your key right now. Try again in a moment.")})
		default:
			next.ServeHTTP(w, r.WithContext(WithPrincipal(r.Context(), p)))
		}
	})
}
