package rest

import (
	"errors"
	"net/http"
	"strings"

	"github.com/brieeflabs/modelvend/services/internal/identity/keys"
	"github.com/brieeflabs/modelvend/services/internal/platform/httpx"
)

// authenticate checks every request's bearer key and stores its principal.
func authenticate(store *keys.Store) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			p, err := store.Authenticate(r.Context(), bearer(r))
			switch {
			case errors.Is(err, keys.ErrInvalid):
				w.Header().Set("WWW-Authenticate", `Bearer realm="modelvend"`)
				httpx.WriteJSON(w, http.StatusUnauthorized, map[string]any{"error": httpx.Errorf(http.StatusUnauthorized,
					"unauthenticated", "Send a valid API key as Authorization: Bearer mv_live_….")})
			case errors.Is(err, keys.ErrSuspended):
				httpx.WriteJSON(w, http.StatusForbidden, map[string]any{"error": httpx.Errorf(http.StatusForbidden,
					"account_suspended", "This workspace is suspended. Contact support.")})
			case err != nil:
				httpx.WriteJSON(w, http.StatusServiceUnavailable, map[string]any{"error": httpx.Errorf(http.StatusServiceUnavailable,
					"unavailable", "We couldn't check your key right now. Try again in a moment.")})
			default:
				next.ServeHTTP(w, r.WithContext(keys.WithPrincipal(r.Context(), p)))
			}
		})
	}
}

// bearer reads "Authorization: Bearer <key>".
func bearer(r *http.Request) string {
	h := r.Header.Get("Authorization")
	token, ok := strings.CutPrefix(h, "Bearer ")
	if !ok {
		return ""
	}
	return strings.TrimSpace(token)
}
