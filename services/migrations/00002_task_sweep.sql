-- +goose Up
-- The worker's sweep looks for unfinished tasks, and attempts still running
-- upstream, that no job is working on.
create index tasks_unfinished on tasks (created_at) where status in ('queued', 'running');
create index attempts_running on attempts (task_id) where status = 'running';

-- +goose Down
drop index attempts_running;
drop index tasks_unfinished;
