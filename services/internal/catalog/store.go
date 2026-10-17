package catalog

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// Store reads the catalog from Postgres.
type Store struct {
	DB *pgxpool.Pool
}

// Access says who is asking: customers reach public, unlisted and live
// versions; internal keys also reach private models and staging versions.
type Access struct {
	Internal bool
}

const modelColumns = `id, publisher, slug, name, description, modality, tasks, visibility, disclosure, author,
	state = 'paused', coalesce(default_version, ''), created_at, updated_at`

func scanModel(row pgx.Row) (Model, error) {
	var m Model
	err := row.Scan(&m.ID, &m.Publisher, &m.Slug, &m.Name, &m.Description, &m.Modality, &m.Tasks,
		&m.Visibility, &m.Disclosure, &m.Author, &m.Paused, &m.DefaultVersion, &m.CreatedAt, &m.UpdatedAt)
	if errors.Is(err, pgx.ErrNoRows) {
		return m, ErrNotFound
	}
	return m, err
}

const versionColumns = `model_id, id, label, status, changelog, input_schema, output_schema, pricing, routing,
	coalesce(replacement, ''), sunset_at`

func scanVersion(row pgx.Row) (Version, error) {
	var v Version
	var pricing, routing []byte
	err := row.Scan(&v.ModelID, &v.ID, &v.Label, &v.Status, &v.Changelog, &v.InputSchema, &v.OutputSchema,
		&pricing, &routing, &v.Replacement, &v.SunsetAt)
	if errors.Is(err, pgx.ErrNoRows) {
		return v, ErrNotFound
	}
	if err != nil {
		return v, err
	}
	if err := json.Unmarshal(pricing, &v.Pricing); err != nil {
		return v, fmt.Errorf("version %s@%s pricing: %w", v.ModelID, v.ID, err)
	}
	v.Routing = DefaultRouting
	if err := json.Unmarshal(routing, &v.Routing); err != nil {
		return v, fmt.Errorf("version %s@%s routing: %w", v.ModelID, v.ID, err)
	}
	return v, nil
}

// Model reads one model, whatever its visibility. Admin and worker only.
func (s *Store) Model(ctx context.Context, id string) (Model, error) {
	return scanModel(s.DB.QueryRow(ctx, `select `+modelColumns+` from models where id = $1`, id))
}

// Version reads one version, whatever its status. Admin and worker only.
func (s *Store) Version(ctx context.Context, modelID, id string) (Version, error) {
	return scanVersion(s.DB.QueryRow(ctx, `select `+versionColumns+` from model_versions where model_id = $1 and id = $2`, modelID, id))
}

// Resolve finds what a caller reaches with ref, by the lifecycle rules:
// draft versions answer nobody, staging answers internal keys only,
// deprecated still answers, and retired forwards to its replacement or is gone.
func (s *Store) Resolve(ctx context.Context, ref Ref, access Access) (Resolved, error) {
	m, err := s.Model(ctx, ref.ModelID())
	if err != nil {
		return Resolved{}, err
	}
	if m.Visibility == Private && !access.Internal {
		return Resolved{}, ErrNotFound
	}
	if m.Paused {
		return Resolved{}, ErrPaused
	}
	id := ref.Version
	if id == "" {
		if m.DefaultVersion == "" {
			return Resolved{}, ErrNotLive
		}
		id = m.DefaultVersion
	}
	// One hop through a retired version's replacement; replacements are live.
	for hop := 0; hop < 2; hop++ {
		v, err := s.Version(ctx, m.ID, id)
		if err != nil {
			return Resolved{}, err
		}
		switch v.Status {
		case Live:
			return Resolved{Model: m, Version: v}, nil
		case Deprecated:
			return Resolved{Model: m, Version: v, Deprecated: true}, nil
		case Staging:
			if access.Internal {
				return Resolved{Model: m, Version: v}, nil
			}
			return Resolved{}, ErrNotFound
		case Retired:
			if v.Replacement == "" {
				return Resolved{}, ErrGone
			}
			id = v.Replacement
		default:
			return Resolved{}, ErrNotFound
		}
	}
	return Resolved{}, ErrGone
}

// Routes reads every route of a version with its provider's state.
func (s *Store) Routes(ctx context.Context, modelID, versionID string) ([]Route, error) {
	rows, err := s.DB.Query(ctx, `
		select r.id, r.provider_id, p.adapter, p.status = 'active', p.white_label_allowed, r.upstream_model, r.status,
			r.priority, r.weight, r.cost_micros, r.region, r.mapping, coalesce(r.transform, '')
		from routes r join providers p on p.id = r.provider_id
		where r.model_id = $1 and r.version_id = $2
		order by r.priority, r.weight desc, r.id`, modelID, versionID)
	if err != nil {
		return nil, err
	}
	return pgx.CollectRows(rows, func(row pgx.CollectableRow) (Route, error) {
		var r Route
		err := row.Scan(&r.ID, &r.ProviderID, &r.Adapter, &r.ProviderActive, &r.WhiteLabelAllowed, &r.UpstreamModel,
			&r.Status, &r.Priority, &r.Weight, &r.CostMicros, &r.Region, &r.Mapping, &r.Transform)
		return r, err
	})
}

// ListPublic returns the listed models that have a default version, with it.
func (s *Store) ListPublic(ctx context.Context) ([]Resolved, error) {
	rows, err := s.DB.Query(ctx, `
		select m.id, m.publisher, m.slug, m.name, m.description, m.modality, m.tasks, m.visibility, m.disclosure,
			m.author, m.state = 'paused', m.default_version, m.created_at, m.updated_at,
			v.model_id, v.id, v.label, v.status, v.changelog, v.input_schema, v.output_schema, v.pricing, v.routing,
			coalesce(v.replacement, ''), v.sunset_at
		from models m join model_versions v on v.model_id = m.id and v.id = m.default_version
		where m.visibility = 'public' and v.status in ('live', 'deprecated')
		order by m.featured desc, m.name`)
	if err != nil {
		return nil, err
	}
	return pgx.CollectRows(rows, func(row pgx.CollectableRow) (Resolved, error) {
		var r Resolved
		var pricing, routing []byte
		err := row.Scan(&r.Model.ID, &r.Model.Publisher, &r.Model.Slug, &r.Model.Name, &r.Model.Description,
			&r.Model.Modality, &r.Model.Tasks, &r.Model.Visibility, &r.Model.Disclosure, &r.Model.Author,
			&r.Model.Paused, &r.Model.DefaultVersion, &r.Model.CreatedAt, &r.Model.UpdatedAt,
			&r.Version.ModelID, &r.Version.ID, &r.Version.Label, &r.Version.Status, &r.Version.Changelog,
			&r.Version.InputSchema, &r.Version.OutputSchema, &pricing, &routing, &r.Version.Replacement, &r.Version.SunsetAt)
		if err != nil {
			return r, err
		}
		r.Deprecated = r.Version.Status == Deprecated
		if err := json.Unmarshal(pricing, &r.Version.Pricing); err != nil {
			return r, err
		}
		r.Version.Routing = DefaultRouting
		return r, json.Unmarshal(routing, &r.Version.Routing)
	})
}
