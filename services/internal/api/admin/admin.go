// Package admin serves /admin/v1 for the operator console (apps/admin).
// Its contract is apps/admin/src/lib/api/*.ts, written up in api/admin.yaml;
// the console's mock API implements it today. The handlers land screen by
// screen, starting with the catalog; until then every route answers 501 so
// the console can point ADMIN_API_URL here and fail clearly.
//
// Operator sessions, permissions and the audit log come from postpane's
// cloud/internal/adminapi.
package admin

import (
	"net/http"

	"github.com/go-chi/chi/v5"

	"github.com/brieeflabs/modelvend/services/internal/platform/httpx"
)

// Routes mounts /admin/v1 on r.
func Routes(r chi.Router) {
	r.HandleFunc("/admin/v1/*", func(w http.ResponseWriter, _ *http.Request) {
		httpx.WriteJSON(w, http.StatusNotImplemented, map[string]any{"error": httpx.Errorf(http.StatusNotImplemented,
			"not_implemented", "The admin API isn't implemented yet; run the console against its mock API.")})
	})
}
