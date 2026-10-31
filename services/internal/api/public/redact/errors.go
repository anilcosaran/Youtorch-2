package redact

import (
	"errors"
	"net/http"

	"github.com/brieeflabs/modelvend/services/internal/billing"
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
	var invalid *tasks.InvalidRequest
	var retired *catalog.RetiredError
	switch {
	case errors.As(err, &fields):
		err = &httpx.Error{Status: http.StatusUnprocessableEntity, Code: "invalid_input",
			Message: "The input doesn't match the model's schema.", Fields: fields}
	case errors.As(err, &invalid):
		err = &httpx.Error{Status: http.StatusUnprocessableEntity, Code: "invalid_request",
			Message: "Some fields need another look.", Fields: invalid.Fields}
	case errors.As(err, &retired):
		message := "This version was retired. Call the model without a version, or pin a live one."
		if retired.Suggestion != "" {
			message = "This version was retired. Move to " + retired.Suggestion + "; check its schema and price first."
		}
		err = &httpx.Error{Status: http.StatusGone, Code: "version_retired", Message: message, Replacement: retired.Suggestion}
	case errors.Is(err, catalog.ErrNotFound):
		err = httpx.Errorf(http.StatusNotFound, "model_not_found", "There's no model with that ID, or your key can't use it.")
	case errors.Is(err, catalog.ErrPaused):
		err = httpx.Errorf(http.StatusServiceUnavailable, "model_paused", "This model is paused. Try again later.")
	case errors.Is(err, catalog.ErrNotLive):
		err = httpx.Errorf(http.StatusNotFound, "model_not_found", "This model has no version you can call yet.")
	case errors.Is(err, tasks.ErrAppsUnavailable):
		err = httpx.Errorf(http.StatusNotImplemented, "not_implemented", "App runs aren't available through the API yet.")
	case errors.Is(err, tasks.ErrNotFound):
		err = httpx.Errorf(http.StatusNotFound, "task_not_found", "There's no task with that ID in this workspace.")
	case errors.Is(err, tasks.ErrFinal):
		err = httpx.Errorf(http.StatusConflict, "task_finished", "This task has already finished.")
	case errors.Is(err, tasks.ErrKeyScope):
		err = httpx.Errorf(http.StatusForbidden, "key_scope", "This API key can't run this model or app. Use a key whose scopes include it.")
	case errors.Is(err, tasks.ErrIdempotencyKeyReused):
		err = httpx.Errorf(http.StatusUnprocessableEntity, "idempotency_key_reused",
			"This idempotency key was used for a different request in the last 24 hours. Send a new key for a new request.")
	case errors.Is(err, billing.ErrInsufficientCredits):
		err = httpx.Errorf(http.StatusPaymentRequired, "insufficient_credits", "Your balance doesn't cover this task. Add credits and try again.")
	case errors.Is(err, billing.ErrSpendLimitReached):
		err = httpx.Errorf(http.StatusPaymentRequired, "spend_limit_reached", "This API key has reached its monthly spend limit. Raise the limit or use another key.")
	}
	return err
}
