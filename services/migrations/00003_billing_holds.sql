-- +goose Up

-- Holds: a task sets aside an estimate of its price when it is created, and
-- releases it when it finishes; a succeeded task is charged at the same time.
alter table workspaces
  -- Sum of the holds of the workspace's unfinished tasks. What a workspace may
  -- still spend is balance_micros - held_micros.
  add column held_micros bigint not null default 0 check (held_micros >= 0);

alter table tasks
  -- What the task set aside when it was created; released when it finishes.
  add column hold_micros bigint not null default 0,
  -- SHA-256 of the request an Idempotency-Key came with, to catch a key reused
  -- for a different request. Null for tasks created before it was recorded.
  add column idempotency_fingerprint text;

-- Settlement posts at most one entry of each kind for a task.
create unique index ledger_task_kind on ledger_entries (task_id, kind) where task_id is not null;

-- A key's spend this month, for its spend limit.
create index tasks_key_created on tasks (key_id, created_at) where key_id is not null;

-- Task lists page by ID, which sorts by creation time (platform/ids), so the
-- index follows the query rather than created_at.
drop index tasks_workspace_created;
create index tasks_workspace_list on tasks (workspace_id, id desc) where parent_id is null;

-- +goose Down
drop index tasks_workspace_list;
create index tasks_workspace_created on tasks (workspace_id, created_at desc, id desc);
drop index tasks_key_created;
drop index ledger_task_kind;
alter table tasks drop column idempotency_fingerprint, drop column hold_micros;
alter table workspaces drop column held_micros;
