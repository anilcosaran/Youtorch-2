-- +goose Up

-- Versions are tried in the dev environment and with the admin's test run, so
-- there is no staging status. Anything left in it goes back to draft.
update model_versions set status = 'draft' where status = 'staging';
alter table model_versions drop constraint model_versions_status_check;
alter table model_versions add constraint model_versions_status_check
  check (status in ('draft', 'live', 'deprecated', 'retired'));

-- There is one kind of key.
alter table api_keys drop column env;

-- What the provider charges per billing unit at each tier, in decimal US
-- dollars: {"720p": 0.056, "1080p": 0.084}. Micro-dollars can't hold token prices.
alter table routes add column tier_costs jsonb not null default '{}';
-- The one cost a route had goes to every tier, as a manifest's single `cost` does.
update routes r set tier_costs = (
    select coalesce(jsonb_object_agg(t ->> 'id', r.cost_micros::numeric / 1000000), '{}')
    from jsonb_array_elements(v.pricing -> 'tiers') t
  )
  from model_versions v
  where v.model_id = r.model_id and v.id = r.version_id;
alter table routes drop column cost_micros;

-- The prices a task was accepted at, so settlement charges those whatever
-- changes in the catalog meanwhile. See billing.Quote.
alter table tasks add column quote jsonb;

-- +goose Down
alter table tasks drop column quote;
alter table routes add column cost_micros bigint not null default 0;
update routes r set cost_micros = round(coalesce((r.tier_costs ->> (v.pricing ->> 'default_tier'))::numeric, 0) * 1000000)
  from model_versions v
  where v.model_id = r.model_id and v.id = r.version_id;
alter table routes drop column tier_costs;
alter table api_keys add column env text not null default 'live' check (env in ('live', 'test'));
alter table model_versions drop constraint model_versions_status_check;
alter table model_versions add constraint model_versions_status_check
  check (status in ('draft', 'staging', 'live', 'deprecated', 'retired'));
