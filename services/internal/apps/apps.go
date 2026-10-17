// Package apps runs app releases: each step calls a pinned model version with
// input built from templates, and the release's output map builds what the
// customer gets. Customers only ever see the app task, its generic stage and
// the mapped output; the steps run as child tasks they can't list.
//
// The step executor lands with the worker's app jobs; the release format and
// template rules are fixed here.
package apps

import (
	"errors"
	"fmt"
	"strings"

	"github.com/brieeflabs/modelvend/services/internal/catalog"
)

// Step is one model call of a release.
type Step struct {
	ID    string `json:"id" yaml:"id"`
	Stage string `json:"stage,omitempty" yaml:"stage,omitempty"`
	// Model is "publisher/slug@version"; apps always pin.
	Model string         `json:"model" yaml:"model"`
	Input map[string]any `json:"input" yaml:"input"`
}

// Release is what one deploy of an app runs.
type Release struct {
	Steps     []Step         `json:"steps" yaml:"steps"`
	Stages    []string       `json:"stages" yaml:"stages"`
	OutputMap map[string]any `json:"output_map" yaml:"output_map"`
}

// Validate checks a release before it is stored: unique step IDs, pinned
// models, stages that exist, and templates that only read the run's input
// and earlier steps.
func (r Release) Validate() error {
	var errs []error
	if len(r.Steps) == 0 {
		errs = append(errs, errors.New("a release needs at least one step"))
	}
	stages := map[string]bool{}
	for _, s := range r.Stages {
		stages[s] = true
	}
	seen := map[string]bool{}
	for i, s := range r.Steps {
		where := fmt.Sprintf("step %d (%s)", i+1, s.ID)
		if !catalog.ValidPart(s.ID) {
			errs = append(errs, fmt.Errorf("%s: id must be lowercase letters, digits, dots and dashes", where))
		}
		if seen[s.ID] {
			errs = append(errs, fmt.Errorf("%s: duplicate id", where))
		}
		ref, err := catalog.ParseRef(s.Model)
		if err != nil || ref.Version == "" {
			errs = append(errs, fmt.Errorf("%s: model must be pinned as publisher/slug@version", where))
		}
		if s.Stage != "" && !stages[s.Stage] {
			errs = append(errs, fmt.Errorf("%s: stage %q isn't in stages", where, s.Stage))
		}
		for _, path := range References(s.Input) {
			if err := readable(path, seen); err != nil {
				errs = append(errs, fmt.Errorf("%s: %w", where, err))
			}
		}
		seen[s.ID] = true
	}
	if len(r.OutputMap) == 0 {
		errs = append(errs, errors.New("output_map can't be empty"))
	}
	for _, path := range References(r.OutputMap) {
		if err := readable(path, seen); err != nil {
			errs = append(errs, fmt.Errorf("output_map: %w", err))
		}
	}
	return errors.Join(errs...)
}

// readable reports whether a template path may be read at this point.
func readable(path string, done map[string]bool) error {
	parts := strings.Split(path, ".")
	switch {
	case parts[0] == "input" && len(parts) > 1:
		return nil
	case parts[0] == "steps" && len(parts) > 2 && parts[2] == "output":
		if !done[parts[1]] {
			return fmt.Errorf("{{%s}} reads step %q before it runs", path, parts[1])
		}
		return nil
	default:
		return fmt.Errorf("{{%s}} must start with input. or steps.<id>.output", path)
	}
}
