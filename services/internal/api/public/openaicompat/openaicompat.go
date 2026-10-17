// Package openaicompat serves the OpenAI-shaped endpoints postpane and other
// OpenAI clients already call (/v1/chat/completions, /v1/images/generations).
// They translate to tasks on the same engine; until that lands they answer 501
// so clients fail clearly instead of hanging.
package openaicompat

import (
	"net/http"

	"github.com/go-chi/chi/v5"

	"github.com/brieeflabs/modelvend/services/internal/platform/httpx"
)

// Mount adds the compatible endpoints to the authenticated /v1 router.
func Mount(r chi.Router) {
	r.Post("/chat/completions", notYet)
	r.Post("/images/generations", notYet)
}

func notYet(w http.ResponseWriter, _ *http.Request) {
	httpx.WriteJSON(w, http.StatusNotImplemented, map[string]any{"error": httpx.Errorf(http.StatusNotImplemented,
		"not_implemented", "The OpenAI-compatible endpoints aren't available yet. Use POST /v1/tasks.")})
}
