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
│  ├─ billing/                 Prices and costs; ledger, holds and Stripe later
│  ├─ identity/                accounts/, keys/ (API keys), operators/
│  ├─ delivery/                media/ (copies outputs to our storage), webhooks/ (signing)
│  ├─ audit/  ratelimit/       Package docs only, for now
│  │
│  ├─ platform/                config, database (+ dbtest), httpx, ids, logging
│  └─ bootstrap/               Process setup every binary shares
└─ migrations/                 goose SQL, embedded into the binaries
```

### Import rules

- `cmd/*` imports `bootstrap` and its own `api/*` package.
- `api/*` imports contexts and `platform`. The public packages share only `redact`; `rest` also mounts `openaicompat` on its
  authenticated `/v1` router. `api/admin` and `api/public/*` never import each other.
- Contexts import other contexts (without cycles) and `platform`, never `api/*` or `cmd/*`.
- `platform/*` imports no other internal package, apart from `logging` reading `config` and `database` embedding `migrations`.
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

## Known gaps

These are left as they are; the layout above is where their fixes go.

- `rest` and `mcpserver` call `tasks.Store.List` directly, because `tasks.Service` has no `List` yet. The worker's jobs also
  work on `tasks.Store` rather than the service.
- `bootstrap.Open` builds the same dependencies for every binary, so `adminapi` gets a task service and queue client it doesn't use.
- `catalog/manifest` and `cmd/migrate/devseed.go` write catalog tables with raw SQL; `catalog.Store` only reads.
- No linter enforces the import rules yet (depguard or go-arch-lint would).
