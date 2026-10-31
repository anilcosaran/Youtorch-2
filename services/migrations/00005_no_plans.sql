-- +goose Up

-- There are no plans. A limit is the platform default unless the workspace has
-- its own value in workspaces.limits.
alter table workspaces drop column tier;

-- We go to the labs directly, so there are no aggregators.
update providers set kind = 'first_party' where kind = 'aggregator';
alter table providers drop constraint providers_kind_check;
alter table providers add constraint providers_kind_check check (kind in ('first_party', 'managed'));

-- +goose Down
alter table providers drop constraint providers_kind_check;
alter table providers add constraint providers_kind_check check (kind in ('aggregator', 'first_party', 'managed'));
alter table workspaces add column tier text not null default 'standard' check (tier in ('free', 'standard', 'scale', 'enterprise'));
