# Modelvend

Modelvend is one API and one balance for every generative video, image, audio and 3D model. This repository holds the whole
platform: the web apps, the Go backend services, and the contracts and packages they share. The design is in
[`docs/architecture.md`](docs/architecture.md) and [`docs/structure.md`](docs/structure.md).

## Repository

```
modelvend/
├─ apps/                        Next.js apps (npm workspaces)
│  ├─ console/                  Customer console, app.modelvend.ai
│  └─ admin/                    Operator console, admin.modelvend.ai (mock admin API in src/mock-api)
├─ services/                    Go backend: one module, several binaries
│  ├─ cmd/
│  │  ├─ gateway/               Public API /v1: tasks, models, OpenAI-compatible endpoints (:8080)
│  │  ├─ mcp/                   MCP server at /mcp (:8090)
│  │  ├─ worker/                River job workers; health and metrics (:9090)
│  │  ├─ adminapi/              /admin/v1 for the operator console (:8081, answers 501 for now)
│  │  └─ migrate/               Schema migrations, catalog import, dev seed
│  ├─ internal/
│  │  ├─ platform/              config, database (+ dbtest), httpx, ids, logging
│  │  ├─ app/                   Wiring every process shares
│  │  ├─ catalog/               Models, versions, routes, ID resolution; manifest/ imports catalog YAML
│  │  ├─ schema/                JSON Schema validation and defaults for task input
│  │  ├─ tasks/                 Task record, store and service (create, get, wait, cancel)
│  │  ├─ routing/               Orders a version's routes by strategy
│  │  ├─ providers/             Provider interface; mapping/ and a fake/ provider (real adapters come later)
│  │  ├─ jobs/                  Worker jobs: dispatch and poll
│  │  ├─ redact/                Public shapes of tasks, models and errors; nothing provider-side leaks
│  │  ├─ media/                 Copies outputs to our storage
│  │  ├─ apps/                  App releases and step templates
│  │  ├─ billing/  keys/  webhooks/
│  │  ├─ publicapi/  openaicompat/  mcpserver/  adminapi/
│  │  └─ accounts/  ratelimit/  operators/  audit/    Package docs only, for now
│  └─ migrations/               goose SQL
├─ api/                         OpenAPI contracts: public, admin, webhooks (placeholder)
├─ packages/
│  ├─ api-types/                TypeScript types generated from api/ (placeholder)
│  └─ sdk-js/                   @modelvend/sdk (placeholder)
├─ catalog/
│  ├─ models/                   Model manifests, YAML (placeholder)
│  └─ apps/                     App manifests, YAML (placeholder)
├─ deploy/
│  ├─ docker/                   Service images (placeholder)
│  └─ helm/                     Kubernetes chart (placeholder)
├─ docs/                        architecture.md, structure.md
├─ Makefile                     Common tasks (placeholder)
└─ package.json                 npm workspaces: apps/*
```

| Path           | Details                                                                                    |
| -------------- | ------------------------------------------------------------------------------------------ |
| `apps/console` | [README](apps/console/README.md)                                                           |
| `apps/admin`   | [README](apps/admin/README.md)                                                             |
| `services`     | Go 1.26: chi, pgx, goose, River, go-redis, minio-go, MCP go-sdk. `go test ./...` from here |
| `docs`         | [Architecture](docs/architecture.md) and [platform structure](docs/structure.md)           |

The apps are npm workspaces with one lockfile at the root. Each app keeps its own `package.json`, configs, Dockerfile and
README; the root only installs dependencies and runs scripts across them.

## Getting started

```bash
npm install            # installs every workspace
npm run dev:console    # http://localhost:3000
npm run dev:admin      # http://localhost:3001
```

Requires Node.js 20.9 or newer.

## Scripts

| Script                              | What it does                                                           |
| ----------------------------------- | ---------------------------------------------------------------------- |
| `npm run dev:console` / `dev:admin` | Dev server for one app                                                 |
| `npm run build`                     | Production build of every app (`build:console`, `build:admin` for one) |
| `npm run check`                     | Each app's CI check (`check:console`, `check:admin` for one)           |

`check` runs typecheck, lint and Prettier for the console, and typecheck, lint and Vitest for the admin. To run any other script
in one app, use `npm run <script> --workspace apps/<app>` or run it inside the app's folder.

## Docker

Images are built from the repository root, since the lockfile lives there; each app has its own Dockerfile and ignore file:

```bash
docker build -f apps/console/Dockerfile -t modelvend-console .
docker build -f apps/admin/Dockerfile -t modelvend-admin .
```
