package tasks

import (
	"strings"
	"testing"

	"github.com/brieeflabs/modelvend/services/internal/providers"
)

func TestUpstreamFailuresNeverEchoProviderText(t *testing.T) {
	for _, kind := range []providers.Kind{providers.InvalidInput, providers.ContentPolicy, providers.Timeout, providers.Unavailable, providers.Internal, "weird"} {
		e := UpstreamFailure(&providers.UpstreamError{Kind: kind, Message: "fal-ai: SECRET upstream detail"})
		if strings.Contains(e.Message, "SECRET") || strings.Contains(e.Message, "fal") {
			t.Errorf("%s leaks upstream text: %s", kind, e.Message)
		}
		if e.Code == "" {
			t.Errorf("%s has no code", kind)
		}
	}
}
