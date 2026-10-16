// Package publicapi serves /v1, the customer API described by api/public.yaml:
// tasks (models and apps), the catalog, and later uploads and usage. Every
// body it writes is a redact type; internal records never reach the encoder.
package publicapi

import (
	"encoding/json"
	"errors"
	"log/slog"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"

	"github.com/brieeflabs/modelvend/services/internal/catalog"
	"github.com/brieeflabs/modelvend/services/internal/keys"
	"github.com/brieeflabs/modelvend/services/internal/openaicompat"
	"github.com/brieeflabs/modelvend/services/internal/platform/httpx"
	"github.com/brieeflabs/modelvend/services/internal/platform/ids"
	"github.com/brieeflabs/modelvend/services/internal/redact"
	"github.com/brieeflabs/modelvend/services/internal/schema"
	"github.com/brieeflabs/modelvend/services/internal/tasks"
)

// API is the /v1 handler set.
type API struct {
	Tasks   *tasks.Service
	Catalog *catalog.Store
	Keys    *keys.Store
	Logger  *slog.Logger
}

// maxWait caps Prefer: wait=N.
const maxWait = 60 * time.Second

// Routes mounts /v1 on r.
func (a *API) Routes(r chi.Router) {
	r.Route("/v1", func(r chi.Router) {
		r.Use(requestID, a.Keys.Middleware)
		r.Post("/tasks", a.createTask)
		r.Get("/tasks", a.listTasks)
		r.Get("/tasks/{id}", a.getTask)
		r.Post("/tasks/{id}/cancel", a.cancelTask)
		r.Get("/models", a.listModels)
		r.Get("/models/{publisher}/{slug}", a.getModel)
		openaicompat.Mount(r)
	})
}

// requestID tags every response so support can find it in the logs.
func requestID(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("X-Request-Id", ids.New("req"))
		next.ServeHTTP(w, r)
	})
}

type createBody struct {
	Model      string          `json:"model"`
	App        string          `json:"app"`
	Input      json.RawMessage `json:"input"`
	WebhookURL string          `json:"webhook_url"`
	Metadata   json.RawMessage `json:"metadata"`
}

func (a *API) createTask(w http.ResponseWriter, r *http.Request) {
	p, _ := keys.FromContext(r.Context())
	var body createBody
	if err := httpx.DecodeJSON(r, &body); err != nil {
		a.fail(w, r, err)
		return
	}
	if err := validateCreate(&body, r.Header.Get("Idempotency-Key")); err != nil {
		a.fail(w, r, err)
		return
	}
	created, err := a.Tasks.Create(r.Context(), tasks.CreateParams{
		WorkspaceID:    p.WorkspaceID,
		KeyID:          p.KeyID,
		Internal:       p.Internal,
		Model:          body.Model,
		App:            body.App,
		Input:          body.Input,
		WebhookURL:     body.WebhookURL,
		Metadata:       body.Metadata,
		IdempotencyKey: r.Header.Get("Idempotency-Key"),
	})
	if err != nil {
		a.fail(w, r, err)
		return
	}
	if created.Deprecated != nil {
		deprecationHeaders(w, *created.Deprecated)
	}
	task := created.Task
	if wait := preferWait(r); wait > 0 && !task.Status.Final() {
		if task, err = a.Tasks.Wait(r.Context(), p.WorkspaceID, task.ID, wait); err != nil {
			a.fail(w, r, err)
			return
		}
	}
	status := http.StatusAccepted
	if task.Status.Final() || !created.Created {
		status = http.StatusOK
	}
	w.Header().Set("Location", "/v1/tasks/"+task.ID)
	httpx.WriteJSON(w, status, redact.PublicTask(task))
}

func validateCreate(b *createBody, idempotencyKey string) error {
	fields := map[string]string{}
	if (b.Model == "") == (b.App == "") {
		fields["model"] = "Set either model or app."
	}
	if len(b.Input) == 0 || b.Input[0] != '{' {
		fields["input"] = "Input must be a JSON object."
	}
	if b.WebhookURL != "" && !strings.HasPrefix(b.WebhookURL, "https://") {
		fields["webhook_url"] = "Webhooks must use https://."
	}
	if len(b.Metadata) > 0 && b.Metadata[0] != '{' {
		fields["metadata"] = "Metadata must be a JSON object."
	} else if len(b.Metadata) > 4096 {
		fields["metadata"] = "Metadata can be up to 4 KB."
	}
	if len(idempotencyKey) > 255 {
		fields["Idempotency-Key"] = "Idempotency keys can be up to 255 characters."
	}
	if len(fields) > 0 {
		return &httpx.Error{Status: http.StatusUnprocessableEntity, Code: "invalid_request", Message: "Some fields need another look.", Fields: fields}
	}
	return nil
}

// preferWait reads "Prefer: wait=N" (RFC 7240).
func preferWait(r *http.Request) time.Duration {
	for _, part := range strings.Split(r.Header.Get("Prefer"), ",") {
		if v, ok := strings.CutPrefix(strings.TrimSpace(part), "wait="); ok {
			if n, err := strconv.Atoi(v); err == nil && n > 0 {
				return min(time.Duration(n)*time.Second, maxWait)
			}
		}
	}
	return 0
}

func deprecationHeaders(w http.ResponseWriter, v catalog.Version) {
	w.Header().Set("Deprecation", "true")
	if v.SunsetAt != nil {
		w.Header().Set("Sunset", v.SunsetAt.UTC().Format(http.TimeFormat))
	}
}

func (a *API) getTask(w http.ResponseWriter, r *http.Request) {
	p, _ := keys.FromContext(r.Context())
	t, err := a.Tasks.Get(r.Context(), p.WorkspaceID, chi.URLParam(r, "id"))
	if err != nil {
		a.fail(w, r, err)
		return
	}
	httpx.WriteJSON(w, http.StatusOK, redact.PublicTask(t))
}

func (a *API) cancelTask(w http.ResponseWriter, r *http.Request) {
	p, _ := keys.FromContext(r.Context())
	t, err := a.Tasks.Cancel(r.Context(), p.WorkspaceID, chi.URLParam(r, "id"))
	if err != nil {
		a.fail(w, r, err)
		return
	}
	httpx.WriteJSON(w, http.StatusOK, redact.PublicTask(t))
}

// List is a page of items.
type List[T any] struct {
	Object     string  `json:"object"`
	Data       []T     `json:"data"`
	NextCursor *string `json:"next_cursor"`
}

func (a *API) listTasks(w http.ResponseWriter, r *http.Request) {
	p, _ := keys.FromContext(r.Context())
	q := r.URL.Query()
	limit, _ := strconv.Atoi(q.Get("limit"))
	if limit <= 0 || limit > 100 {
		limit = 20
	}
	status := tasks.Status(q.Get("status"))
	switch status {
	case "", tasks.Queued, tasks.Running, tasks.Succeeded, tasks.Failed, tasks.Canceled:
	default:
		a.fail(w, r, httpx.Errorf(http.StatusBadRequest, "invalid_request", "status must be queued, running, succeeded, failed or canceled."))
		return
	}
	list, err := a.Tasks.Store.List(r.Context(), p.WorkspaceID, tasks.ListFilter{
		Status: status, Target: q.Get("target"), Before: q.Get("cursor"), Limit: limit + 1,
	})
	if err != nil {
		a.fail(w, r, err)
		return
	}
	out := List[redact.Task]{Object: "list", Data: []redact.Task{}}
	for i, t := range list {
		if i == limit {
			next := list[i-1].ID
			out.NextCursor = &next
			break
		}
		out.Data = append(out.Data, redact.PublicTask(t))
	}
	httpx.WriteJSON(w, http.StatusOK, out)
}

func (a *API) listModels(w http.ResponseWriter, r *http.Request) {
	models, err := a.Catalog.ListPublic(r.Context())
	if err != nil {
		a.fail(w, r, err)
		return
	}
	out := List[redact.Model]{Object: "list", Data: make([]redact.Model, 0, len(models))}
	for _, m := range models {
		out.Data = append(out.Data, redact.PublicModel(m))
	}
	httpx.WriteJSON(w, http.StatusOK, out)
}

func (a *API) getModel(w http.ResponseWriter, r *http.Request) {
	p, _ := keys.FromContext(r.Context())
	ref, err := catalog.ParseRef(chi.URLParam(r, "publisher") + "/" + chi.URLParam(r, "slug"))
	if err != nil {
		a.fail(w, r, catalog.ErrNotFound)
		return
	}
	if v := r.URL.Query().Get("version"); v != "" {
		ref.Version = v
	}
	resolved, err := a.Catalog.Resolve(r.Context(), ref, catalog.Access{Internal: p.Internal})
	if err != nil {
		a.fail(w, r, err)
		return
	}
	if resolved.Deprecated {
		deprecationHeaders(w, resolved.Version)
	}
	httpx.WriteJSON(w, http.StatusOK, redact.PublicModel(resolved))
}

// fail answers with the public form of err.
func (a *API) fail(w http.ResponseWriter, r *http.Request, err error) {
	httpx.WriteError(w, r, a.Logger, PublicError(err))
}

// PublicError turns a domain error into the *httpx.Error customers see. Errors
// it doesn't know are returned as they are and answered as a generic 500.
// MCP uses it too, so both surfaces say the same thing.
func PublicError(err error) error {
	var fields schema.FieldErrors
	switch {
	case errors.As(err, &fields):
		err = &httpx.Error{Status: http.StatusUnprocessableEntity, Code: "invalid_input",
			Message: "The input doesn't match the model's schema.", Fields: fields}
	case errors.Is(err, catalog.ErrNotFound):
		err = httpx.Errorf(http.StatusNotFound, "model_not_found", "There's no model with that ID, or your key can't use it.")
	case errors.Is(err, catalog.ErrPaused):
		err = httpx.Errorf(http.StatusServiceUnavailable, "model_paused", "This model is paused. Try again later.")
	case errors.Is(err, catalog.ErrNotLive):
		err = httpx.Errorf(http.StatusNotFound, "model_not_found", "This model has no version you can call yet.")
	case errors.Is(err, catalog.ErrGone):
		err = httpx.Errorf(http.StatusGone, "version_retired", "This version was retired. Call the model without a version, or pin a live one.")
	case errors.Is(err, tasks.ErrTarget):
		err = &httpx.Error{Status: http.StatusUnprocessableEntity, Code: "invalid_request",
			Message: "Name a model as publisher/slug or publisher/slug@version, or an app.", Fields: map[string]string{"model": err.Error()}}
	case errors.Is(err, tasks.ErrAppsUnavailable):
		err = httpx.Errorf(http.StatusNotImplemented, "not_implemented", "App runs aren't available through the API yet.")
	case errors.Is(err, tasks.ErrNotFound):
		err = httpx.Errorf(http.StatusNotFound, "task_not_found", "There's no task with that ID in this workspace.")
	case errors.Is(err, tasks.ErrFinal):
		err = httpx.Errorf(http.StatusConflict, "task_finished", "This task has already finished.")
	}
	return err
}
