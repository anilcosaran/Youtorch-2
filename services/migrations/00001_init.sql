-- +goose Up

-- Money is stored as integer micro-dollars (1e-6 USD) everywhere. Unit prices
-- inside pricing JSON are decimal US dollars per billing unit, as the APIs send them.

create table workspaces (
  id                 uuid primary key default gen_random_uuid(),
  name               text not null,
  tier               text not null default 'standard' check (tier in ('free', 'standard', 'scale', 'enterprise')),
  status             text not null default 'active' check (status in ('active', 'suspended')),
  suspended_reason   text,
  -- Overrides of the tier's limits: {"requestsPerMinute": 600, ...}.
  limits             jsonb not null default '{}',
  -- Cached sum of ledger_entries.amount_micros.
  balance_micros     bigint not null default 0,
  created_at         timestamptz not null default now()
);

create table api_keys (
  id                   uuid primary key default gen_random_uuid(),
  workspace_id         uuid not null references workspaces (id),
  name                 text not null,
  -- First characters of the secret, e.g. "mv_live_3fa9", to recognise a key.
  prefix               text not null,
  -- SHA-256 of the full secret; the secret itself is never stored.
  secret_hash          text not null unique,
  env                  text not null check (env in ('live', 'test')),
  -- Model IDs or app slugs the key may call; empty for everything.
  scopes               text[] not null default '{}',
  spend_limit_micros   bigint,
  status               text not null default 'active' check (status in ('active', 'revoked')),
  created_at           timestamptz not null default now(),
  last_used_at         timestamptz,
  revoked_at           timestamptz,
  revoked_reason       text
);
create index api_keys_workspace on api_keys (workspace_id);

create table providers (
  id                    text primary key,
  name                  text not null,
  kind                  text not null check (kind in ('aggregator', 'first_party', 'managed')),
  adapter               text not null,
  status                text not null default 'disabled' check (status in ('active', 'paused', 'disabled')),
  paused_reason         text,
  base_url              text not null default '',
  regions               text[] not null default '{}',
  credential_ciphertext bytea,
  credential_hint       text,
  concurrency_limit     integer,
  rpm_limit             integer,
  -- Whether its terms let us resell its models under our own name.
  white_label_allowed   boolean not null default false,
  license_notes         text not null default '',
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

create table models (
  id               text primary key, -- publisher/slug
  publisher        text not null,
  slug             text not null,
  name             text not null,
  description      text not null default '',
  modality         text not null check (modality in ('image', 'video', 'audio', '3d', 'text')),
  tasks            text[] not null default '{}',
  inputs           text[] not null default '{}',
  outputs          text[] not null default '{}',
  tags             text[] not null default '{}',
  license          text,
  visibility       text not null default 'private' check (visibility in ('public', 'unlisted', 'private')),
  -- open: author and providers may be shown; white_label: neither ever reaches a customer.
  disclosure       text not null default 'open' check (disclosure in ('open', 'white_label')),
  -- Who really made the model; admin only.
  author           text not null default '',
  featured         boolean not null default false,
  state            text not null default 'active' check (state in ('active', 'paused')),
  paused_reason    text,
  default_version  text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  unique (publisher, slug)
);

create table model_versions (
  model_id       text not null references models (id),
  id             text not null,
  label          text not null,
  status         text not null default 'draft' check (status in ('draft', 'staging', 'live', 'deprecated', 'retired')),
  changelog      text not null default '',
  input_schema   jsonb not null,
  output_schema  jsonb not null,
  -- {"unit": "second", "default_tier": "1080p", "tiers": [{"id", "label", "price"}], "input": null, "promo": null}
  pricing        jsonb not null,
  -- {"strategy": "priority", "fallbacks": true, "max_attempts": 2, "timeout_seconds": 600}
  routing        jsonb not null,
  replacement    text,
  created_by     text,
  created_at     timestamptz not null default now(),
  released_at    timestamptz,
  deprecated_at  timestamptz,
  sunset_at      timestamptz,
  primary key (model_id, id)
);

create table routes (
  id               uuid primary key default gen_random_uuid(),
  model_id         text not null,
  version_id       text not null,
  provider_id      text not null references providers (id),
  upstream_model   text not null,
  status           text not null default 'active' check (status in ('active', 'paused', 'draining')),
  priority         integer not null default 1,
  weight           integer not null default 100 check (weight between 0 and 100),
  -- What the provider charges us per billing unit at the default tier.
  cost_micros      bigint not null default 0,
  region           text not null default 'global',
  max_concurrency  integer,
  -- Our input → the provider's parameters; see services/internal/providers/mapping.
  mapping          jsonb,
  -- Name of a Go transform for mappings the declarative form can't express.
  transform        text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  foreign key (model_id, version_id) references model_versions (model_id, id)
);
create index routes_version on routes (model_id, version_id);

create table apps (
  slug           text primary key,
  name           text not null,
  tagline        text not null default '',
  description    text not null default '',
  category       text not null check (category in ('image', 'video', 'audio', '3d')),
  status         text not null default 'draft' check (status in ('draft', 'live', 'paused')),
  paused_reason  text,
  input_schema   jsonb not null,
  output_schema  jsonb not null,
  live_release   integer,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create table app_releases (
  app_slug      text not null references apps (slug),
  number        integer not null,
  status        text not null default 'draft' check (status in ('draft', 'live', 'superseded')),
  -- [{"id", "stage", "model": "publisher/slug@version", "input": {...templates}}]
  steps         jsonb not null,
  -- Public progress stage names, in order.
  stages        text[] not null default '{}',
  output_map    jsonb not null,
  price_micros  bigint not null,
  notes         text not null default '',
  created_by    text,
  created_at    timestamptz not null default now(),
  published_at  timestamptz,
  primary key (app_slug, number)
);

create table tasks (
  id              text primary key, -- task_…
  workspace_id    uuid not null references workspaces (id),
  key_id          uuid references api_keys (id),
  -- App step tasks point at their app task; customers never list them.
  parent_id       text references tasks (id),
  target_type     text not null check (target_type in ('model', 'app')),
  target_id       text not null,
  model_id        text,
  version_id      text,
  app_release     integer,
  status          text not null check (status in ('queued', 'running', 'succeeded', 'failed', 'canceled')),
  stage           text,
  progress        smallint,
  input           jsonb not null,
  output          jsonb,
  -- Public error: our code and message, never the provider's.
  error_code      text,
  error_message   text,
  units           numeric,
  unit            text,
  price_micros    bigint not null default 0,
  cost_micros     bigint not null default 0,
  webhook_url     text,
  metadata        jsonb not null default '{}',
  idempotency_key text,
  created_at      timestamptz not null default now(),
  started_at      timestamptz,
  finished_at     timestamptz,
  refunded_at     timestamptz,
  unique (workspace_id, idempotency_key)
);
create index tasks_workspace_created on tasks (workspace_id, created_at desc, id desc);
create index tasks_parent on tasks (parent_id) where parent_id is not null;

create table attempts (
  task_id         text not null references tasks (id) on delete cascade,
  number          integer not null,
  route_id        uuid references routes (id),
  provider_id     text not null,
  upstream_model  text not null,
  -- The provider's own request ID, for their support. Admin only.
  upstream_id     text,
  status          text not null check (status in ('running', 'succeeded', 'failed', 'timeout', 'canceled')),
  -- The provider's raw error, admin only.
  error           text,
  latency_ms      integer,
  started_at      timestamptz not null default now(),
  finished_at     timestamptz,
  primary key (task_id, number)
);

create table ledger_entries (
  id             uuid primary key default gen_random_uuid(),
  workspace_id   uuid not null references workspaces (id),
  kind           text not null check (kind in ('top_up', 'grant', 'usage', 'refund', 'adjustment')),
  amount_micros  bigint not null,
  task_id        text references tasks (id),
  note           text not null default '',
  operator_id    text,
  at             timestamptz not null default now()
);
create index ledger_workspace_at on ledger_entries (workspace_id, at desc);

-- +goose Down
drop table ledger_entries;
drop table attempts;
drop table tasks;
drop table app_releases;
drop table apps;
drop table routes;
drop table model_versions;
drop table models;
drop table providers;
drop table api_keys;
drop table workspaces;
