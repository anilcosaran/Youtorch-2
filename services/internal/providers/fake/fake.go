// Package fake is a provider for development and tests. It needs no network:
// jobs finish after a few polls with a small generated image, and prompts can
// steer it into failures to exercise fallbacks and error mapping:
//
//	"fail:unavailable"  the attempt fails as if the provider were down
//	"fail:content"      the provider's safety system refuses the prompt
//	"sync"              Submit returns the finished result at once
package fake

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"strings"
	"sync"

	"github.com/brieeflabs/modelvend/services/internal/providers"
)

// Adapter is the adapter name routes use for this provider.
const Adapter = "fake"

// pixel is a 1×1 PNG, the output of every job.
const pixel = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=="

type job struct {
	input json.RawMessage
	polls int
}

// Provider keeps its jobs in memory.
type Provider struct {
	// PollsToFinish is how many Status calls a job stays pending for (default 1).
	PollsToFinish int

	mu   sync.Mutex
	jobs map[string]*job
}

func New() *Provider { return &Provider{PollsToFinish: 1, jobs: map[string]*job{}} }

func (p *Provider) Submit(_ context.Context, call providers.Call) (providers.Result, error) {
	var in struct {
		Prompt string `json:"prompt"`
	}
	_ = json.Unmarshal(call.Input, &in)
	id := "fake-" + randomHex()
	switch {
	case strings.Contains(in.Prompt, "fail:unavailable"):
		return providers.Result{State: providers.Failed, UpstreamID: id,
			Error: &providers.UpstreamError{Kind: providers.Unavailable, Message: "fake: 503 upstream overloaded"}}, nil
	case strings.Contains(in.Prompt, "fail:content"):
		return providers.Result{State: providers.Failed, UpstreamID: id,
			Error: &providers.UpstreamError{Kind: providers.ContentPolicy, Message: "fake: prompt flagged by safety filter"}}, nil
	case strings.Contains(in.Prompt, "sync"):
		return finished(id, call.Input), nil
	}
	p.mu.Lock()
	defer p.mu.Unlock()
	p.jobs[id] = &job{input: call.Input}
	return providers.Result{State: providers.Pending, UpstreamID: id}, nil
}

func (p *Provider) Status(_ context.Context, _ string, upstreamID string) (providers.Result, error) {
	p.mu.Lock()
	defer p.mu.Unlock()
	j, ok := p.jobs[upstreamID]
	if !ok {
		return providers.Result{State: providers.Failed, UpstreamID: upstreamID,
			Error: &providers.UpstreamError{Kind: providers.Internal, Message: "fake: unknown job " + upstreamID}}, nil
	}
	j.polls++
	if j.polls < p.PollsToFinish {
		return providers.Result{State: providers.Pending, UpstreamID: upstreamID}, nil
	}
	delete(p.jobs, upstreamID)
	return finished(upstreamID, j.input), nil
}

func (p *Provider) Cancel(_ context.Context, _ string, upstreamID string) error {
	p.mu.Lock()
	defer p.mu.Unlock()
	delete(p.jobs, upstreamID)
	return nil
}

func finished(id string, input json.RawMessage) providers.Result {
	var in struct {
		NumImages int `json:"num_images"`
	}
	_ = json.Unmarshal(input, &in)
	n := max(in.NumImages, 1)
	images := make([]map[string]any, n)
	for i := range images {
		images[i] = map[string]any{"url": pixel, "width": 1, "height": 1, "content_type": "image/png"}
	}
	out, _ := json.Marshal(map[string]any{"images": images})
	return providers.Result{State: providers.Succeeded, UpstreamID: id, Output: out, Units: float64(n)}
}

func randomHex() string {
	b := make([]byte, 8)
	_, _ = rand.Read(b)
	return hex.EncodeToString(b)
}
