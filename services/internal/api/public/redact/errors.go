package redact

import (
	"errors"
	"net/http"

	"github.com/brieeflabs/modelvend/services/internal/catalog"
	"github.com/brieeflabs/modelvend/services/internal/catalog/schema"
	"github.com/brieeflabs/modelvend/services/internal/platform/httpx"
	"github.com/brieeflabs/modelvend/services/internal/tasks"
)

// PublicError turns a domain error into the *httpx.Error customers see. Errors
// it doesn't know are returned as they are and answered as a generic 500.
// /v1 and MCP both use it, so both surfaces say the same thing.
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
