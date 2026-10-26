# Modelvend Admin

Operator console for Modelvend: the catalog (models, versions, routes, pricing, schemas), apps and their releases,
upstream providers, customers and credits, API keys, the request log, the audit log and operator access.

It is a separate app from the customer console, on its own host (e.g. `admin.modelvend.ai`), with its own sessions
and accounts. The shell, UI kit and patterns come from the postpane operator console. The domain model and the
architecture behind it are in [`docs/architecture.md`](../../docs/architecture.md).

## Getting started

```bash
npm install        # at the repository root (npm workspaces, one lockfile)
cd apps/admin
npm run dev        # http://localhost:3001
```

From the repository root, `npm run dev:admin` and `npm run check:admin` do the same.

Without `ADMIN_API_URL` the dev server answers `/api/admin/v1/*` from the in-memory mock in `src/mock-api`, which
implements the same contract with seeded data. You start signed in as the seeded admin; after signing out, sign in
as any seeded operator with the password in `src/mock-api` (`MOCK_PASSWORD`). Mock data resets when the server restarts.

## Scripts

| Script              | What it does                                   |
| ------------------- | ---------------------------------------------- |
| `npm run dev`       | Dev server with Turbopack on port 3001         |
| `npm run build`     | Production build (`.next/standalone`)          |
| `npm run typecheck` | Generate route types, then `tsc --noEmit`      |
| `npm run lint`      | ESLint                                         |
| `npm test`          | Vitest unit tests (`src/**/*.test.ts`)         |
| `npm run check`     | Typecheck, lint and tests, in that order (CI)  |

## Structure

```
src/
├─ app/                Routes only; app/api/[...path] forwards /api/admin/v1/* to the admin API (or the mock)
├─ features/           One folder per screen: overview, requests, models, apps, providers,
│                      customers, api-keys, audit, operators, auth
├─ components/         ui/ (shadcn), data/ (table, filters, pager), layout/ (shell, sidebar,
│                      command palette, side panel), shared/ (pills, dialogs, tiles), charts/
├─ lib/                Formatters, labels, permissions, URL state, panel state, catalog helpers,
│                      React Query keys (query-keys.ts)
└─ mock-api/           In-memory implementation of the contract for development
```

Conventions:

- The contract lives in [`packages/admin-api`](../../packages/admin-api), imported as `@modelvend/admin-api/<area>`:
  types and typed client, one file per area. Its doc comments state the rules the server enforces (which lifecycle
  moves are allowed, what returns 409 or 422). The Go admin API implements the same contract; keep the mock in step.
- Filters, tabs and paging live in the query string, so every view can be shared and survives a reload.
- Every change goes through the API, which writes the audit log; screens never keep their own copy of server state
  beyond the React Query cache.
- Money is US dollars as numbers in the API (stored as integer micro-dollars server side). Use `usd`, `usdCompact` and
  `unitPrice` from `lib/format.ts`.

## Environment

| Variable                    | Default                        | Used for                                                   |
| --------------------------- | ------------------------------ | ---------------------------------------------------------- |
| `ADMIN_API_URL`             | unset                          | Where `/api/admin/v1/*` is forwarded, read at request time |
| `ADMIN_API_MOCK`            | unset                          | `1` serves the mock in a production build (demos only)     |
| `TRUSTED_PROXY_HOPS`        | `1`                            | Proxies in front that append to `X-Forwarded-For`          |
| `NEXT_PUBLIC_CONSOLE_NAME`  | `Modelvend Admin`              | Name in the sidebar and page titles                        |
| `NEXT_PUBLIC_CONSOLE_URL`   | `https://app.modelvend.ai`     | "Open in the console" links                                |
| `NEXT_PUBLIC_API_BASE_URL`  | `https://api.modelvend.ai/v1`  | Example calls on a model's schema tab                      |

A production build without `ADMIN_API_URL` answers `/api/admin/v1/*` with 502 instead of falling back to mock data.
The mock has no real sign-in (no cookie means the seeded admin, and `MOCK_PASSWORD` opens every account), so never
set `ADMIN_API_MOCK=1` where anyone but you can reach the console.

## Deploying

The image is built from the repository root, which holds the shared lockfile. The standalone output mirrors the
workspace layout, so the server is `.next/standalone/apps/admin/server.js`.

```bash
docker build -f apps/admin/Dockerfile -t modelvend-admin .
docker run -p 3001:3001 -e ADMIN_API_URL=http://admin-api:8081 modelvend-admin
```

Put it behind an allowlist or SSO proxy; it is for operators only and is marked `noindex`.

The proxy in `app/api/[...path]` is the admin API's only way in from outside:

- It forwards `/api/admin/v1/*` and nothing else, and refuses paths with `..`, `%2e%2e` or an encoded slash, so the
  admin server's health and metrics routes stay internal.
- It refuses changes (anything but GET and HEAD) unless the browser says they came from the console's own pages
  (`Sec-Fetch-Site: same-origin`, or a matching `Origin` from older browsers). SameSite cookies alone don't stop
  this, as the customer console is on the same site.
- It sends the admin API only `Accept`, `Accept-Language`, `Content-Type`, `Cookie` and `User-Agent`, plus its own
  `X-Forwarded-For`, `X-Forwarded-Host` and `X-Forwarded-Proto`. `X-Forwarded-For` is one address: the entry that the
  outermost of `TRUSTED_PROXY_HOPS` proxies added. Set it to the number of proxies in front that append to the header
  (an SSO proxy behind an ingress is 2); with too low a number the audit log records a proxy's address, with too high
  a number operators can write their own.
