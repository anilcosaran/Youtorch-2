# Modelvend

Modelvend is one API and one balance for every generative video, image, audio and 3D model. This repository holds the whole
platform: the web apps, the Go backend services, and the contracts and packages they share. The design is in
[`docs/architecture.md`](docs/architecture.md) and [`docs/structure.md`](docs/structure.md).

## Repository

```
modelvend/
├─ apps/                        User interfaces (Next.js, npm workspaces)
│  ├─ console/                  Customer UI, app.modelvend.ai
│  └─ admin/                    Operator UI, admin.modelvend.ai (mock admin API in src/mock-api)
├─ services/                    Go backend: one module, several binaries (see services/README.md)
│  ├─ cmd/
│  │  ├─ gateway/               PUBLIC: /v1 tasks and models, OpenAI-compatible endpoints (:8080)
│  │  ├─ mcp/                   PUBLIC: MCP server at /mcp (:8090)
│  │  ├─ adminapi/              INTERNAL: /admin/v1 for the operator UI (:8081, answers 501 for now)
│  │  ├─ worker/                INTERNAL: River job workers; health and metrics (:9090)
│  │  └─ migrate/               Ops: schema migrations, catalog import, dev seed
│  ├─ internal/
│  │  ├─ api/                   Inbound adapters, no business logic
│  │  │  ├─ public/             rest/ (/v1), openaicompat/, mcpserver/, redact/ (public DTOs and errors)
│  │  │  └─ admin/              /admin/v1
│  │  ├─ catalog/               Models, versions, routes, ID resolution; schema/ (JSON Schema), manifest/ (YAML import)
│  │  ├─ tasks/                 Task record, state machine and service; jobs/ (dispatch and poll workers)
│  │  ├─ routing/               Orders a version's routes by strategy
│  │  ├─ providers/             Provider port; mapping/ and a fake/ provider (real adapters come later)
│  │  ├─ apps/                  App releases and step templates
│  │  ├─ billing/               Prices and costs
│  │  ├─ identity/              accounts/, keys/ (API keys), operators/
│  │  ├─ delivery/              media/ (copies outputs to our storage), webhooks/
│  │  ├─ audit/  ratelimit/     Package docs only, for now
│  │  ├─ platform/              config, database (+ dbtest), httpx, ids, logging
│  │  └─ bootstrap/             Wiring every process shares
│  └─ migrations/               goose SQL
├─ api/                         OpenAPI contracts: public and webhooks; admin and console come next
├─ packages/                    Shared JS packages (npm workspaces)
│  ├─ admin-api/                @modelvend/admin-api: typed client and contract types for /admin/v1
│  ├─ api-types/                TypeScript types generated from api/ (make gen)
│  ├─ config-eslint/            ESLint config shared by the apps and packages
│  ├─ config-typescript/        Base tsconfig the apps and packages extend
│  └─ sdk-js/                   @modelvend/sdk (placeholder)
├─ catalog/
│  ├─ models/                   Model manifests, YAML (placeholder)
│  └─ apps/                     App manifests, YAML (placeholder)
├─ deploy/                      Local stack, images, Helm chart and Argo CD (see deploy/README.md)
├─ docs/                        roadmap.md, product-rules.md, audit.md, architecture.md, structure.md
├─ .github/workflows/           CI and image publishing
├─ Makefile                     Common tasks: make help
└─ package.json                 npm workspaces: apps/*, packages/*
```

| Path           | Details                                                                                       |
| -------------- | --------------------------------------------------------------------------------------------- |
| `apps/console` | [README](apps/console/README.md)                                                              |
| `apps/admin`   | [README](apps/admin/README.md)                                                                |
| `services`     | [README](services/README.md). Go 1.26: chi, pgx, goose, River, go-redis, minio-go, MCP go-sdk |
| `docs`         | [Architecture](docs/architecture.md) and [platform structure](docs/structure.md)              |

The apps and packages are npm workspaces with one lockfile at the root. Each app keeps its own `package.json`, Next.js
config, Dockerfile and README, and takes its ESLint and TypeScript settings from `packages/config-*`; the root only
installs dependencies and runs scripts across them.

## Getting started

```bash
npm install            # installs every workspace
npm run dev:console    # http://localhost:3000
npm run dev:admin      # http://localhost:3001
```

Requires Node.js 20.9 or newer. Both apps run on mock data, so they need nothing else.

For the backend you also need Go, Docker and make (on Windows, Git Bash with `scoop install make`):

```bash
make seed    # starts Postgres, Redis, object storage and Mailpit, migrates, and prints a test API key
make dev     # runs every service and both apps
make test    # Go tests, database included, and every workspace's check
```

## Scripts

| Script                              | What it does                                                           |
| ----------------------------------- | ---------------------------------------------------------------------- |
| `npm run dev:console` / `dev:admin` | Dev server for one app                                                 |
| `npm run build`                     | Production build of every app (`build:console`, `build:admin` for one) |
| `npm run check`                     | Each workspace's CI check (`check:console`, `check:admin` for one app) |

`check` runs typecheck, lint and Prettier for the console, and typecheck, lint and Vitest for the admin and `packages/admin-api`.
To run any other script in one workspace, use `npm run <script> --workspace <path>` (e.g. `apps/admin`) or run it inside that
folder.

## Docker

Images are built from the repository root, since the lockfile lives there; each app has its own Dockerfile and ignore file:

```bash
docker build -f apps/console/Dockerfile -t modelvend-console .
docker build -f apps/admin/Dockerfile -t modelvend-admin .
```
