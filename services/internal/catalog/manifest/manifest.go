// Package manifest imports catalog/ YAML files: model manifests (with "id")
// and app manifests (with "slug"). The database stays the source of truth;
// an import only ever adds draft versions and draft releases, never touches a
// live one, so the lifecycle (promote, default, deploy) stays in the admin.
// catalog/manifest.schema.json describes the format for editors.
package manifest

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"slices"
	"strings"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"go.yaml.in/yaml/v3"

	"github.com/brieeflabs/modelvend/services/internal/apps"
	"github.com/brieeflabs/modelvend/services/internal/billing"
	"github.com/brieeflabs/modelvend/services/internal/catalog"
	"github.com/brieeflabs/modelvend/services/internal/catalog/schema"
	"github.com/brieeflabs/modelvend/services/internal/providers/mapping"
)

type Model struct {
	ID          string    `yaml:"id"`
	Name        string    `yaml:"name"`
	Description string    `yaml:"description"`
	Modality    string    `yaml:"modality"`
	Tasks       []string  `yaml:"tasks"`
	Inputs      []string  `yaml:"inputs"`
	Outputs     []string  `yaml:"outputs"`
	Tags        []string  `yaml:"tags"`
	License     string    `yaml:"license"`
	Visibility  string    `yaml:"visibility"`
	Disclosure  string    `yaml:"disclosure"`
	Author      string    `yaml:"author"`
	Versions    []Version `yaml:"versions"`
}

type Version struct {
	ID        string          `yaml:"id"`
	Label     string          `yaml:"label"`
	Changelog string          `yaml:"changelog"`
	Input     map[string]any  `yaml:"input"`
	Output    map[string]any  `yaml:"output"`
	Pricing   catalog.Pricing `yaml:"pricing"`
	Routing   *Routing        `yaml:"routing"`
	Routes    []Route         `yaml:"routes"`
}

// Routing is a version's routing block. What it leaves out comes from
// catalog.DefaultRouting, so `routing: {max_attempts: 3}` keeps fallbacks and
// the timeout.
type Routing struct {
	Strategy       *string `yaml:"strategy"`
	Fallbacks      *bool   `yaml:"fallbacks"`
	MaxAttempts    *int    `yaml:"max_attempts"`
	TimeoutSeconds *int    `yaml:"timeout_seconds"`
}

// Resolve is the routing a version gets, filled in from the defaults.
func (r *Routing) Resolve() catalog.Routing {
	out := catalog.DefaultRouting
	if r == nil {
		return out
	}
	if r.Strategy != nil {
		out.Strategy = *r.Strategy
	}
	if r.Fallbacks != nil {
		out.Fallbacks = *r.Fallbacks
	}
	if r.MaxAttempts != nil {
		out.MaxAttempts = *r.MaxAttempts
	}
	if r.TimeoutSeconds != nil {
		out.TimeoutSeconds = *r.TimeoutSeconds
	}
	return out
}

type Route struct {
	Provider       string         `yaml:"provider"`
	Upstream       string         `yaml:"upstream"`
	Priority       int            `yaml:"priority"`
	Weight         *int           `yaml:"weight"`
	Cost           float64        `yaml:"cost"`
	Region         string         `yaml:"region"`
	MaxConcurrency *int           `yaml:"max_concurrency"`
	Mapping        map[string]any `yaml:"mapping"`
	Transform      string         `yaml:"transform"`
}

type App struct {
	Slug        string         `yaml:"slug"`
	Name        string         `yaml:"name"`
	Tagline     string         `yaml:"tagline"`
	Description string         `yaml:"description"`
	Category    string         `yaml:"category"`
	Input       map[string]any `yaml:"input"`
	Output      map[string]any `yaml:"output"`
	Price       float64        `yaml:"price"`
	Notes       string         `yaml:"notes"`
	Stages      []string       `yaml:"stages"`
	Steps       []apps.Step    `yaml:"steps"`
	OutputMap   map[string]any `yaml:"output_map"`
}

// Files expands paths (files or directories) to the YAML files under them.
func Files(paths []string) ([]string, error) {
	var out []string
	for _, p := range paths {
		info, err := os.Stat(p)
		if err != nil {
			return nil, err
		}
		if !info.IsDir() {
			out = append(out, p)
			continue
		}
		err = filepath.WalkDir(p, func(path string, d os.DirEntry, err error) error {
			if err == nil && !d.IsDir() && (strings.HasSuffix(path, ".yaml") || strings.HasSuffix(path, ".yml")) {
				out = append(out, path)
			}
			return err
		})
		if err != nil {
			return nil, err
		}
	}
	slices.Sort(out)
	return out, nil
}

// Importer writes manifests to the catalog.
type Importer struct {
	DB *pgxpool.Pool
	// Report receives one line per thing done or skipped.
	Report func(string)
}

func (im *Importer) report(format string, args ...any) {
	if im.Report != nil {
		im.Report(fmt.Sprintf(format, args...))
	}
}

// ImportFile reads one manifest and imports it in a transaction.
func (im *Importer) ImportFile(ctx context.Context, path string) error {
	raw, err := os.ReadFile(path)
	if err != nil {
		return err
	}
	var probe map[string]any
	if err := yaml.Unmarshal(raw, &probe); err != nil {
		return fmt.Errorf("%s: %w", path, err)
	}
	dec := yaml.NewDecoder(bytes.NewReader(raw))
	dec.KnownFields(true)
	switch {
	case probe["id"] != nil:
		var m Model
		if err := dec.Decode(&m); err != nil {
			return fmt.Errorf("%s: %w", path, err)
		}
		return im.withTx(ctx, func(tx pgx.Tx) error { return im.importModel(ctx, tx, m) })
	case probe["slug"] != nil:
		var a App
		if err := dec.Decode(&a); err != nil {
			return fmt.Errorf("%s: %w", path, err)
		}
		return im.withTx(ctx, func(tx pgx.Tx) error { return im.importApp(ctx, tx, a) })
	default:
		return fmt.Errorf("%s: a manifest has an id (model) or a slug (app)", path)
	}
}

func (im *Importer) withTx(ctx context.Context, fn func(pgx.Tx) error) error {
	tx, err := im.DB.Begin(ctx)
	if err != nil {
		return err
	}
	defer func() { _ = tx.Rollback(ctx) }()
	if err := fn(tx); err != nil {
		return err
	}
	return tx.Commit(ctx)
}

func oneOf(field, value string, allowed ...string) error {
	if !slices.Contains(allowed, value) {
		return fmt.Errorf("%s must be one of %s, not %q", field, strings.Join(allowed, ", "), value)
	}
	return nil
}

// Validate checks a model manifest without touching the database.
func (m *Model) Validate() error {
	var errs []error
	ref, err := catalog.ParseRef(m.ID)
	if err != nil || ref.Version != "" {
		errs = append(errs, fmt.Errorf("id must be publisher/slug"))
	}
	if strings.TrimSpace(m.Name) == "" {
		errs = append(errs, errors.New("name is required"))
	}
	if m.Visibility == "" {
		m.Visibility = "private"
	}
	if m.Disclosure == "" {
		m.Disclosure = "open"
	}
	errs = append(errs,
		oneOf("modality", m.Modality, "image", "video", "audio", "3d", "text"),
		oneOf("visibility", m.Visibility, "public", "unlisted", "private"),
		oneOf("disclosure", m.Disclosure, "open", "white_label"),
	)
	if len(m.Versions) == 0 {
		errs = append(errs, errors.New("a manifest needs at least one version"))
	}
	for _, v := range m.Versions {
		if err := v.validate(); err != nil {
			errs = append(errs, fmt.Errorf("version %s: %w", v.ID, err))
		}
	}
	return errors.Join(errs...)
}

func (v *Version) validate() error {
	var errs []error
	if !catalog.ValidPart(v.ID) {
		errs = append(errs, errors.New("id must be lowercase letters, digits, dots and dashes"))
	}
	if v.Label == "" {
		v.Label = v.ID
	}
	for name, s := range map[string]map[string]any{"input": v.Input, "output": v.Output} {
		raw, _ := json.Marshal(s)
		if _, err := schema.Compile(raw); err != nil || s == nil {
			errs = append(errs, fmt.Errorf("%s schema: %v", name, err))
		}
	}
	if len(v.Pricing.Tiers) == 0 || v.Pricing.Unit == "" {
		errs = append(errs, errors.New("pricing needs a unit and at least one tier"))
	} else if _, ok := v.Pricing.Tier(""); !ok {
		errs = append(errs, fmt.Errorf("pricing default_tier %q isn't a tier", v.Pricing.DefaultTier))
	}
	for _, t := range v.Pricing.Tiers {
		if t.Price < 0 {
			errs = append(errs, fmt.Errorf("tier %s has a negative price", t.ID))
		}
	}
	for i, r := range v.Routes {
		if r.Provider == "" || r.Upstream == "" {
			errs = append(errs, fmt.Errorf("route %d needs provider and upstream", i+1))
		}
		if r.Cost < 0 {
			errs = append(errs, fmt.Errorf("route %d has a negative cost", i+1))
		}
		raw, _ := json.Marshal(r.Mapping)
		if r.Mapping != nil {
			if _, err := mapping.Parse(raw); err != nil {
				errs = append(errs, fmt.Errorf("route %d: %w", i+1, err))
			}
		}
	}
	return errors.Join(errs...)
}

func (im *Importer) importModel(ctx context.Context, tx pgx.Tx, m Model) error {
	if err := m.Validate(); err != nil {
		return fmt.Errorf("model %s: %w", m.ID, err)
	}
	ref, _ := catalog.ParseRef(m.ID)
	tag, err := tx.Exec(ctx, `
		insert into models (id, publisher, slug, name, description, modality, tasks, inputs, outputs, tags, license,
			visibility, disclosure, author)
		values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, nullif($11, ''), $12, $13, $14)
		on conflict (id) do nothing`,
		m.ID, ref.Publisher, ref.Slug, m.Name, m.Description, m.Modality, nonNil(m.Tasks), nonNil(m.Inputs),
		nonNil(m.Outputs), nonNil(m.Tags), m.License, m.Visibility, m.Disclosure, m.Author)
	if err != nil {
		return fmt.Errorf("model %s: %w", m.ID, err)
	}
	if tag.RowsAffected() == 1 {
		im.report("model %s: created (%s, %s)", m.ID, m.Visibility, m.Disclosure)
	} else {
		im.report("model %s: exists; its details are edited in the admin", m.ID)
	}
	for _, v := range m.Versions {
		if err := im.importVersion(ctx, tx, m, v); err != nil {
			return fmt.Errorf("model %s version %s: %w", m.ID, v.ID, err)
		}
	}
	return nil
}

func (im *Importer) importVersion(ctx context.Context, tx pgx.Tx, m Model, v Version) error {
	var status string
	err := tx.QueryRow(ctx, `select status from model_versions where model_id = $1 and id = $2`, m.ID, v.ID).Scan(&status)
	switch {
	case err == nil && status != string(catalog.Draft):
		im.report("  %s@%s: %s; imports only add or replace drafts, so it's left as it is", m.ID, v.ID, status)
		return nil
	case err == nil:
		if _, err := tx.Exec(ctx, `delete from routes where model_id = $1 and version_id = $2`, m.ID, v.ID); err != nil {
			return err
		}
		if _, err := tx.Exec(ctx, `delete from model_versions where model_id = $1 and id = $2`, m.ID, v.ID); err != nil {
			return err
		}
	case !errors.Is(err, pgx.ErrNoRows):
		return err
	}
	routing := v.Routing.Resolve()
	input, _ := json.Marshal(v.Input)
	output, _ := json.Marshal(v.Output)
	pricing, _ := json.Marshal(v.Pricing)
	routingJSON, _ := json.Marshal(routing)
	if _, err := tx.Exec(ctx, `
		insert into model_versions (model_id, id, label, status, changelog, input_schema, output_schema, pricing, routing, created_by)
		values ($1, $2, $3, 'draft', $4, $5, $6, $7, $8, 'catalog import')`,
		m.ID, v.ID, v.Label, v.Changelog, input, output, pricing, routingJSON); err != nil {
		return err
	}
	for i, r := range v.Routes {
		var whiteLabelAllowed bool
		err := tx.QueryRow(ctx, `select white_label_allowed from providers where id = $1`, r.Provider).Scan(&whiteLabelAllowed)
		if errors.Is(err, pgx.ErrNoRows) {
			return fmt.Errorf("route %d: provider %q doesn't exist; add it in the admin first", i+1, r.Provider)
		}
		if err != nil {
			return err
		}
		if m.Disclosure == "white_label" && !whiteLabelAllowed {
			im.report("  warning: %s doesn't allow white-label resale yet; the router skips this route until it does", r.Provider)
		}
		var mappingJSON []byte
		if r.Mapping != nil {
			mappingJSON, _ = json.Marshal(r.Mapping)
		}
		weight := 100
		if r.Weight != nil {
			weight = *r.Weight
		}
		priority := r.Priority
		if priority == 0 {
			priority = i + 1
		}
		region := r.Region
		if region == "" {
			region = "global"
		}
		if _, err := tx.Exec(ctx, `
			insert into routes (model_id, version_id, provider_id, upstream_model, priority, weight, cost_micros, region,
				max_concurrency, mapping, transform)
			values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, nullif($11, ''))`,
			m.ID, v.ID, r.Provider, r.Upstream, priority, weight, billing.Micros(r.Cost), region, r.MaxConcurrency,
			mappingJSON, r.Transform); err != nil {
			return fmt.Errorf("route %d: %w", i+1, err)
		}
	}
	im.report("  %s@%s: draft with %d route(s); promote it in the admin", m.ID, v.ID, len(v.Routes))
	return nil
}

// Validate checks an app manifest without touching the database.
func (a *App) Validate() error {
	var errs []error
	if !catalog.ValidPart(a.Slug) {
		errs = append(errs, errors.New("slug must be lowercase letters, digits, dots and dashes"))
	}
	if strings.TrimSpace(a.Name) == "" {
		errs = append(errs, errors.New("name is required"))
	}
	errs = append(errs, oneOf("category", a.Category, "image", "video", "audio", "3d"))
	if a.Price <= 0 {
		errs = append(errs, errors.New("price per run must be more than zero"))
	}
	for name, s := range map[string]map[string]any{"input": a.Input, "output": a.Output} {
		raw, _ := json.Marshal(s)
		if _, err := schema.Compile(raw); err != nil || s == nil {
			errs = append(errs, fmt.Errorf("%s schema: %v", name, err))
		}
	}
	errs = append(errs, a.release().Validate())
	return errors.Join(errs...)
}

func (a *App) release() apps.Release {
	return apps.Release{Steps: a.Steps, Stages: a.Stages, OutputMap: a.OutputMap}
}

func (im *Importer) importApp(ctx context.Context, tx pgx.Tx, a App) error {
	if err := a.Validate(); err != nil {
		return fmt.Errorf("app %s: %w", a.Slug, err)
	}
	input, _ := json.Marshal(a.Input)
	output, _ := json.Marshal(a.Output)
	tag, err := tx.Exec(ctx, `
		insert into apps (slug, name, tagline, description, category, input_schema, output_schema)
		values ($1, $2, $3, $4, $5, $6, $7) on conflict (slug) do nothing`,
		a.Slug, a.Name, a.Tagline, a.Description, a.Category, input, output)
	if err != nil {
		return fmt.Errorf("app %s: %w", a.Slug, err)
	}
	if tag.RowsAffected() == 1 {
		im.report("app %s: created as a draft", a.Slug)
	} else {
		im.report("app %s: exists; its details are edited in the admin", a.Slug)
	}
	for _, s := range a.Steps {
		ref, _ := catalog.ParseRef(s.Model)
		var status string
		err := tx.QueryRow(ctx, `select status from model_versions where model_id = $1 and id = $2`, ref.ModelID(), ref.Version).Scan(&status)
		if errors.Is(err, pgx.ErrNoRows) {
			im.report("  warning: step %s calls %s, which isn't in the catalog yet", s.ID, s.Model)
		} else if err != nil {
			return err
		} else if status != "live" {
			im.report("  warning: step %s calls %s, which is %s; the release can't deploy until it's live", s.ID, s.Model, status)
		}
	}
	steps, _ := json.Marshal(a.Steps)
	outputMap, _ := json.Marshal(a.OutputMap)
	var number int
	err = tx.QueryRow(ctx, `select number from app_releases where app_slug = $1 and status = 'draft'`, a.Slug).Scan(&number)
	switch {
	case err == nil:
		_, err = tx.Exec(ctx, `update app_releases set steps = $3, stages = $4, output_map = $5, price_micros = $6, notes = $7,
			created_by = 'catalog import', created_at = now() where app_slug = $1 and number = $2`,
			a.Slug, number, steps, nonNil(a.Stages), outputMap, billing.Micros(a.Price), a.Notes)
		im.report("  release %d: draft replaced; deploy it in the admin", number)
	case errors.Is(err, pgx.ErrNoRows):
		err = tx.QueryRow(ctx, `
			insert into app_releases (app_slug, number, steps, stages, output_map, price_micros, notes, created_by)
			values ($1, coalesce((select max(number) from app_releases where app_slug = $1), 0) + 1, $2, $3, $4, $5, $6, 'catalog import')
			returning number`,
			a.Slug, steps, nonNil(a.Stages), outputMap, billing.Micros(a.Price), a.Notes).Scan(&number)
		im.report("  release %d: draft created; deploy it in the admin", number)
	}
	return err
}

func nonNil(s []string) []string {
	if s == nil {
		return []string{}
	}
	return s
}
