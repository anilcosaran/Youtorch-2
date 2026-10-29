# Modelvend services

The Go backend: one module (`github.com/brieeflabs/modelvend/services`), one database, one image, several thin binaries. It is a
modular monolith split by bounded context. Contexts call each other in process, and hand work to each other through River jobs
written in the same transaction as the data (a transactional outbox, so there is no separate broker). The reasoning and the
sources are in [docs/structure.md](../docs/structure.md), section 3.

## Binaries

| Binary         | Surface                                    | Exposure                         | Default address | Serves from                                      |
| -------------- | ------------------------------------------ | -------------------------------- | --------------- | ------------------------------------------------ |
| `cmd/gateway`  | `/v1` tasks and models, OpenAI-compatible  | Public, `api.modelvend.ai`       | `:8080`         | `internal/api/public/rest`, `.../openaicompat`   |
| `cmd/mcp`      | `/mcp` (Streamable HTTP)                   | Public, `mcp.modelvend.ai`       | `:8090`         | `internal/api/public/mcpserver`                  |
| `cmd/adminapi` | `/admin/v1` for `apps/admin`               | Internal: private network or SSO | `:8081`         | `internal/api/admin`                             |
| `cmd/worker`   | River job workers; `/healthz`, `/metrics`  | Internal: no ingress             | `:9090`         | `internal/tasks/jobs` (and later other contexts) |
| `cmd/migrate`  | `up`, `catalog import <paths>`, `dev-seed` | CLI                              |                 | `internal/platform/database`, `.../manifest`     |

Every binary only wires things together. Each listener also answers `/healthz` and `/readyz`.

## Layout

```
services/
├─ cmd/                        One folder per binary; configuration and wiring only
├─ internal/
│  ├─ api/                     Inbound adapters: HTTP and MCP, no business logic
│  │  ├─ public/               Customer-facing, authenticated with API keys
│  │  │  ├─ rest/              /v1 handlers and the API-key middleware
│  │  │  ├─ openaicompat/      /v1/chat/completions, /v1/images/generations
│  │  │  ├─ mcpserver/         /mcp tools
│  │  │  └─ redact/            The only public shapes of tasks, models and errors
│  │  └─ admin/                /admin/v1, for operators only
│  │
│  ├─ catalog/                 Models, versions, routes, prices; ID resolution
│  │  ├─ schema/               JSON Schema validation and defaults for model input
│  │  └─ manifest/             Imports catalog YAML as draft versions
│  ├─ tasks/                   Task record, state machine, service, job arguments, customer error codes
│  │  └─ jobs/                 dispatch_task, poll_task and sweep_tasks workers
│  ├─ routing/                 Orders a version's routes by strategy
│  ├─ providers/               Provider port and registry; mapping/, fake/, real adapters later
│  ├─ apps/                    App releases and step templates
│  ├─ billing/                 Prices and costs, holds, settlement and the ledger; Stripe later
│  ├─ identity/                accounts/, keys/ (API keys, their scopes and spend limits), operators/
│  ├─ delivery/                media/ (copies outputs to our storage), webhooks/ (signing)
│  ├─ audit/  ratelimit/       Package docs only, for now
│  │
│  ├─ platform/                config, database (+ dbtest), egress, httpx, ids, logging
│  ├─ bootstrap/               Process setup every binary shares
│  └─ boundaries/              A test that checks the import rules below
└─ migrations/                 goose SQL, embedded into the binaries
```

### Import rules

`go test ./...` checks the first four rules (`internal/boundaries`, which also fails on a package it has no rule for); review
keeps the last three.

- `cmd/*` imports `bootstrap`, `platform` and the packages it serves from (the table above). The worker also picks the
  provider adapters and the media store its jobs get, and `migrate` uses `keys` for `dev-seed`.
- `api/*` imports contexts and `platform`. The public packages share only `redact`; `rest` also mounts `openaicompat` on its
  authenticated `/v1` router. `api/admin` and `api/public/*` never import each other.
- Contexts and `bootstrap` import contexts (without cycles) and `platform`, never `api/*` or `cmd/*`.
- `platform/*` imports no other internal package, apart from `logging` reading `config`, `database` embedding `migrations`
  and `dbtest` opening `database`.
- Anything that fetches a URL we don't control uses `platform/egress`: http and https only, public addresses only
  (checked on the resolved IP when dialing, so redirects and DNS rebinding are covered), no proxy. `egress.Client`, which
  copies provider outputs, follows at most three redirects; webhook delivery, when it lands, follows none.
- Provider names, upstream IDs, upstream URLs and raw provider errors stay in `providers`, `routing`, `tasks`, `tasks/jobs` and
  `api/admin`. `redact` types have no fields for them.
- A context writes only its own tables. Its River job arguments live with it (`tasks.DispatchArgs`), so it can enqueue in the
  same transaction.

## Commands

```bash
go build ./...
go vet ./...
go test ./...
go run ./cmd/migrate up
go run ./cmd/gateway
```

Set the version at build time with `-ldflags "-X github.com/brieeflabs/modelvend/services/internal/bootstrap.Version=…"`.

## Environment

Every setting is one environment variable, read by `internal/platform/config`.

| Variable                                   | Default                 | Notes                                                                  |
| ------------------------------------------ | ----------------------- | ---------------------------------------------------------------------- |
| `APP_ENV`                                  | `production`            | `development` or `production`                                          |
| `LOG_LEVEL`, `LOG_FORMAT`                  | `info`, `json`          | `LOG_FORMAT` is `json` or `text`                                       |
| `HTTP_ADDR`                                | per binary (see above)  |                                                                        |
| `METRICS_ADDR`                             | unset                   | Separate Prometheus listener; the worker serves `/metrics` on its port |
| `DATABASE_URL`                             | required                |                                                                        |
| `MIGRATE_ON_START`                         | `false`                 | Run migrations when a process starts                                   |
| `REDIS_URL`                                | unset                   | Optional until rate limits and health counters land                    |
| `PUBLIC_API_URL`                           | `http://localhost:8080` | Public origin of the gateway                                           |
| `INTERNAL_WORKSPACES`                      | unset                   | Comma-separated; their keys reach private models and staging versions  |
| `STORAGE_ENDPOINT`, `STORAGE_BUCKET`       | unset                   | Required outside development                                           |
| `STORAGE_REGION`                           | `auto`                  |                                                                        |
| `STORAGE_ACCESS_KEY`, `STORAGE_SECRET_KEY` | unset                   |                                                                        |
| `STORAGE_USE_SSL`                          | `true`                  |                                                                        |
| `STORAGE_PUBLIC_URL`                       | unset                   | CDN origin; required with `STORAGE_ENDPOINT`                           |
| `WORKER_QUEUES`                            | all                     | Comma-separated queue names                                            |
| `WORKER_CONCURRENCY`                       | `20`                    | Split across the queues                                                |
| `DEV_API_KEY`                              | generated               | `migrate dev-seed` only                                                |
| `TEST_DATABASE_URL`                        | unset                   | `platform/database/dbtest` creates a fresh database per test from it   |

## Money and limits

How a task pays, in short (the code is in `billing`, `tasks.Service.Create` and `tasks.Store`):

- **Hold.** Creating a task locks the workspace row and holds one unit at the version's default tier. When
  `balance_micros - held_micros` doesn't cover it, the call fails with 402 `insufficient_credits` and nothing is written.
  The hold is added to `workspaces.held_micros` and recorded on the task (`tasks.hold_micros`).
- **Settlement** happens in the transaction that gives the task its final status. A success posts a `usage` ledger entry
  (−price, with the task ID), takes the price from the balance and releases the hold; a failure, cancel or expiry only
  releases the hold. `ledger_entries` allows one entry per task and kind.
- **Keys.** A key with `scopes` may only create tasks for the models (`publisher/slug`, or `publisher/slug@version`) and
  apps listed, else 403 `key_scope`. A key with `spend_limit_micros` refuses with 402 `spend_limit_reached` when this
  UTC month's spend (the price of its succeeded tasks plus the holds of its unfinished ones, by creation date) and the
  new hold would pass the limit. Test keys are billed and limited like live keys.
- **Idempotency keys** return the task they created for 24 hours, without holding again. The same key with a different
  request (model, app, input, webhook URL or metadata) answers 422 `idempotency_key_reused`. After 24 hours the key starts
  a new task; the old task's `idempotency_key` is cleared. MCP's `create_task` takes the key as `idempotency_key`.

## Known gaps

These are left as they are; the layout above is where their fixes go.

- The worker's jobs work on `tasks.Store` rather than `tasks.Service`.
- `catalog/manifest` and `cmd/migrate/devseed.go` write catalog tables with raw SQL; `catalog.Store` only reads.
- Holds are an estimate: one unit at the default tier, the least a success can cost. Settlement charges the real units, so
  a task that makes more of them can take the balance below zero. Holds follow the input once tiers and units come from it.
- Task creation takes the workspace row lock, so one workspace creates tasks one at a time. A busy workspace would need
  the hold counter moved to Redis (docs/architecture.md, section 10.2).
- Key scopes and spend limits are only checked when a task is created; reading models and tasks isn't scoped.
- Media copying rewrites output strings that are a whole http(s) or data URL, under any key. A URL inside longer text
  (a caption, say) is left as it is.
- Provider output containing U+0000 can't be stored: finishing the task fails until the sweep expires it a day later.
- Named route transforms (`routes.transform`) aren't implemented: an attempt on such a route fails before it is submitted,
  so the task falls back to the next route if the version allows it.
- When the database can't check an MCP key, the SDK answers 500 (with our message); `/v1` answers 503.
