package main

import (
	"context"
	"fmt"

	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/brieeflabs/modelvend/services/internal/keys"
)

// DevWorkspace is the seeded workspace's ID.
const DevWorkspace = "00000000-0000-4000-8000-000000000001"

// devSeed adds what a local stack needs to run a task end to end: the fake
// provider, the real providers as disabled placeholders, a live white-label
// test model on the fake provider, and a workspace with an API key. It is
// safe to run again; the key is only created (and printed) the first time,
// unless DEV_API_KEY names one.
func devSeed(ctx context.Context, pool *pgxpool.Pool, devKey string) error {
	tx, err := pool.Begin(ctx)
	if err != nil {
		return err
	}
	defer func() { _ = tx.Rollback(ctx) }()

	statements := []string{
		`insert into providers (id, name, kind, adapter, status, base_url, regions, white_label_allowed, license_notes) values
			('fake', 'Fake (development)', 'managed', 'fake', 'active', 'memory://fake', '{global}', true, 'Test fixture.'),
			('fal', 'fal', 'aggregator', 'fal', 'disabled', 'https://queue.fal.run', '{us,eu}', false, ''),
			('replicate', 'Replicate', 'aggregator', 'replicate', 'disabled', 'https://api.replicate.com/v1', '{us}', false, ''),
			('kling', 'Kling', 'first_party', 'http', 'disabled', 'https://api.klingai.com', '{apac}', false, '')
		on conflict (id) do nothing`,
		`insert into models (id, publisher, slug, name, description, modality, tasks, inputs, outputs, visibility,
			disclosure, author, default_version)
		values ('modelvend/dev-echo', 'modelvend', 'dev-echo', 'Dev Echo',
			'Returns a 1×1 image after a moment. Put fail:unavailable or fail:content in the prompt to see failures.',
			'image', '{text-to-image}', '{text}', '{image}', 'public', 'white_label', 'Modelvend test fixture', 'v1')
		on conflict (id) do nothing`,
		`insert into model_versions (model_id, id, label, status, changelog, input_schema, output_schema, pricing, routing, released_at)
		values ('modelvend/dev-echo', 'v1', '1.0', 'live', 'First version.',
			'{"type": "object", "required": ["prompt"], "additionalProperties": false, "properties": {
				"prompt": {"type": "string", "minLength": 1, "maxLength": 2000, "description": "What to make."},
				"num_images": {"type": "integer", "minimum": 1, "maximum": 4, "default": 1, "x-ui": {"group": "quick"}}}}',
			'{"type": "object", "properties": {"images": {"type": "array", "items": {"type": "object", "properties": {
				"url": {"type": "string", "format": "uri"}, "width": {"type": "integer"}, "height": {"type": "integer"},
				"content_type": {"type": "string"}}}}}}',
			'{"unit": "image", "default_tier": "standard", "tiers": [{"id": "standard", "label": "Standard", "price": 0.01}]}',
			'{"strategy": "priority", "fallbacks": true, "max_attempts": 2, "timeout_seconds": 60}', now())
		on conflict (model_id, id) do nothing`,
		`insert into routes (model_id, version_id, provider_id, upstream_model, priority, cost_micros, mapping)
		select 'modelvend/dev-echo', 'v1', 'fake', 'echo', 1, 4000,
			'{"prompt": "prompt", "num_images": {"from": "num_images", "default": 1}}'
		where not exists (select 1 from routes where model_id = 'modelvend/dev-echo' and version_id = 'v1')`,
		`insert into workspaces (id, name, tier, balance_micros) values ('` + DevWorkspace + `', 'Dev workspace', 'standard', 100000000)
		on conflict (id) do nothing`,
	}
	for _, sql := range statements {
		if _, err := tx.Exec(ctx, sql); err != nil {
			return fmt.Errorf("seeding: %w", err)
		}
	}

	secret, prefix, hash := keys.Generate("test")
	if devKey != "" {
		if !keys.WellFormed(devKey) {
			return fmt.Errorf("DEV_API_KEY must look like mv_test_<32 letters and digits>")
		}
		secret, prefix, hash = devKey, devKey[:12], keys.Hash(devKey)
	}
	var existing int
	if err := tx.QueryRow(ctx, `select count(*) from api_keys where workspace_id = $1 and name = 'dev'`, DevWorkspace).Scan(&existing); err != nil {
		return err
	}
	created := false
	if existing == 0 || devKey != "" {
		_, err := tx.Exec(ctx, `insert into api_keys (workspace_id, name, prefix, secret_hash, env) values ($1, 'dev', $2, $3, 'test')
			on conflict (secret_hash) do nothing`, DevWorkspace, prefix, hash)
		if err != nil {
			return err
		}
		created = true
	}
	if err := tx.Commit(ctx); err != nil {
		return err
	}
	fmt.Println("seeded: providers fake, fal, replicate, kling; model modelvend/dev-echo@v1 (live); Dev workspace")
	if created {
		fmt.Println("API key (shown once):", secret)
	} else {
		fmt.Println("API key: already created earlier; set DEV_API_KEY to add a known one")
	}
	return nil
}
