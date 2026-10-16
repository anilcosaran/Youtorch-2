# Modelvend

Modelvend is one API and one balance for every generative video, image, audio and 3D model. This repository holds its web apps; the
backend services and shared packages proposed in [`docs/architecture.md`](docs/architecture.md) will join them here.

## Repository

| Path           | What                                                                                                                      |
| -------------- | ------------------------------------------------------------------------------------------------------------------------- |
| `apps/console` | Customer console: models, playground, apps, usage, billing, API keys. See its [README](apps/console/README.md)            |
| `apps/admin`   | Operator console: catalog, versions, routes, providers, customers, keys, requests. See its [README](apps/admin/README.md) |
| `docs/`        | [Platform architecture](docs/architecture.md): domain model, request flow, proposed layout                                |

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
