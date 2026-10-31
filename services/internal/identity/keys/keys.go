// Package keys issues and checks API keys. A key looks like
// "mv_<32 base62 characters>"; only its SHA-256 and its first characters are
// stored, so a database leak doesn't leak working keys.
package keys

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"math/big"
	"strings"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

const base62 = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz"

// prefixLen is how much of a key is kept to recognise it: "mv_3fa9Bc2xQ".
const prefixLen = 12

// Generate returns a new secret, its prefix and its hash.
func Generate() (secret, prefix, hash string) {
	var b strings.Builder
	b.WriteString("mv_")
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
	body, ok := strings.CutPrefix(s, "mv_")
	if !ok || len(body) != 32 {
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
	// Internal keys reach private models.
	Internal bool
	// Scopes are the model IDs and app slugs the key may run; empty for everything.
	Scopes []string
	// SpendLimitMicros caps what the key spends in a calendar month (UTC); nil for no limit.
	SpendLimitMicros *int64
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
		select k.id, k.workspace_id, k.scopes, k.spend_limit_micros, w.status
		from api_keys k join workspaces w on w.id = k.workspace_id
		where k.secret_hash = $1 and k.status = 'active'`, Hash(secret)).
		Scan(&p.KeyID, &p.WorkspaceID, &p.Scopes, &p.SpendLimitMicros, &workspaceStatus)
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

// FromContext returns the principal the API stored with WithPrincipal.
func FromContext(ctx context.Context) (Principal, bool) {
	p, ok := ctx.Value(ctxKey{}).(Principal)
	return p, ok
}

// WithPrincipal stores p in ctx.
func WithPrincipal(ctx context.Context, p Principal) context.Context {
	return context.WithValue(ctx, ctxKey{}, p)
}
