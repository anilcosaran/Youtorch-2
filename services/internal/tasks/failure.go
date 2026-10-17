package tasks

import "github.com/brieeflabs/modelvend/services/internal/providers"

// Public error codes a failed task carries. Messages are ours; the provider's text stays on the attempt.
const (
	CodeInvalidInput     = "invalid_input"
	CodeContentPolicy    = "content_policy"
	CodeGenerationFailed = "generation_failed"
	CodeTimeout          = "timeout"
	CodeUnavailable      = "model_unavailable"
)

// Failure is the error a failed task shows customers.
type Failure struct {
	Code    string
	Message string
}

// UpstreamFailure maps a provider's failure to the error customers see.
func UpstreamFailure(e *providers.UpstreamError) Failure {
	if e == nil {
		return Failure{Code: CodeGenerationFailed, Message: "The model couldn't complete this task. You weren't charged."}
	}
	switch e.Kind {
	case providers.InvalidInput:
		return Failure{Code: CodeInvalidInput, Message: "The model couldn't use this input. Check it against the model's schema. You weren't charged."}
	case providers.ContentPolicy:
		return Failure{Code: CodeContentPolicy, Message: "The input or the output was blocked by the content policy."}
	case providers.Timeout:
		return Failure{Code: CodeTimeout, Message: "The model took too long to answer. You weren't charged; try again."}
	case providers.Unavailable:
		return Failure{Code: CodeUnavailable, Message: "The model is unavailable right now. You weren't charged; try again shortly."}
	default:
		return Failure{Code: CodeGenerationFailed, Message: "The model couldn't complete this task. You weren't charged."}
	}
}
