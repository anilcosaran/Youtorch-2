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
as any seeded operator with the password in `src/mock-api` (`MOCK_PASSWORD`). Mock data resets when the server
restarts, and so do sessions: the session cookie is signed with a key made at startup, so after a restart you are
asked to sign in again (unless you never signed out, in which case you are still the seeded admin).

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
├─ features/           One folder per screen: overview, tasks, models, apps, providers,
│                      customers, api-keys, audit, operators, auth
├─ components/         ui/ (shadcn), data/ (table, filters, pager), layout/ (shell, sidebar,
│                      command palette, side panel), shared/ (pills, dialogs, tiles), charts/
├─ lib/                Formatters, labels, permissions, URL state, panel state, catalog helpers,
│                      React Query keys (query-keys.ts)
└─ mock-api/           In-memory implementation of the contract for development
```

Conventions:

- The contract is [`api/admin.yaml`](../../api/admin.yaml), with the rules the server enforces (which lifecycle moves
  are allowed, what returns 409 or 422). `make gen` generates its types, and
  [`packages/admin-api`](../../packages/admin-api) is the typed client on them, imported as
  `@modelvend/admin-api/<area>`. `src/mock-api/contract.test.ts` checks every answer of the mock against the spec, so the
  two can't drift; the Go admin API has to pass the same behaviour.
- Filters, tabs and paging live in the query string, so every view can be shared and survives a reload.
- Every change goes through the API, which writes the audit log; screens never keep their own copy of server state
  beyond the React Query cache.
- Money: amounts are whole micro-dollars (`…Micros`), unit prices are decimal strings. `usd` and `usdCompact` take
  micro-dollars and `unitPrice` a decimal, both from `lib/format.ts`. Forms take dollars and convert at the edge, with
  `@modelvend/admin-api/money`.

## Environment

| Variable                    | Default                        | Used for                                                   |
| --------------------------- | ------------------------------ | ---------------------------------------------------------- |
| `ADMIN_API_URL`             | unset                          | Where `/api/admin/v1/*` is forwarded, read at request time |
| `ADMIN_API_MOCK`            | unset                          | `1` serves the mock in a production build (demos only)     |
| `ADMIN_API_MOCK_PASSWORD`   | unset                          | What seeded operators sign in with when `ADMIN_API_MOCK=1` |
| `TRUSTED_PROXY_HOPS`        | `1`                            | Proxies in front that append to `X-Forwarded-For`          |
| `NEXT_PUBLIC_CONSOLE_NAME`  | `Modelvend Admin`              | Name in the sidebar and page titles                        |
| `NEXT_PUBLIC_CONSOLE_URL`   | `https://app.modelvend.ai`     | "Open in the console" links                                |
| `NEXT_PUBLIC_API_BASE_URL`  | `https://api.modelvend.ai/v1`  | Example calls on a model's schema tab                      |

A production build without `ADMIN_API_URL` answers `/api/admin/v1/*` with 502 instead of falling back to mock data.

The development shortcuts stop in a production build (`NODE_ENV=production`), so `ADMIN_API_MOCK=1` asks everyone to
sign in:

- Nobody is signed in automatically, and `MOCK_PASSWORD` opens no account. Seeded operators sign in with
  `ADMIN_API_MOCK_PASSWORD` (12 characters or more); without it they have a random password nobody knows, and the
  server logs a warning.
- The session cookie is HMAC-signed with a key made when the process starts and checked in constant time, so a
  cookie can't be made up or edited. It carries the operator's ID, a session ID, an expiry (12 hours) and their
  session version: changing a password ends the operator's other sessions, and a reset or disabling ends them all.
  Signing out ends the session even for a copy of the cookie.
- The cookie is `HttpOnly; SameSite=Lax; Path=/`, and over https (or behind a proxy that sends
  `X-Forwarded-Proto: https`) it is `Secure` and named `__Host-mv_mock_session`.
- After 5 failed sign-ins in 15 minutes an email gets 429 with `Retry-After`.

It is still demo data in memory with one shared password, so keep it to demos.

## Deploying

The image is built from the repository root, which holds the shared lockfile. The standalone output mirrors the
workspace layout, so the server is `.next/standalone/apps/admin/server.js`.

```bash
docker build -f apps/admin/Dockerfile -t modelvend-admin .
docker run -p 3001:3001 -e ADMIN_API_URL=http://admin-api:8081 modelvend-admin
```

Put it behind an allowlist or SSO proxy; it is for operators only and is marked `noindex`.

The admin API sets the session cookie, and the proxy passes its `Set-Cookie` through unchanged while mapping
`/api/admin/v1` to `/admin/v1`. So the cookie must be `__Host-…; Path=/; Secure; HttpOnly; SameSite=Lax`: with any
other `Path` the browser never sends it back. The rest of the session rules (revocation when a password changes or an
operator is disabled, sign-in throttling with 429 and `Retry-After`) are in `packages/admin-api/src/auth.ts`.

`next.config.ts` sends a Content-Security-Policy with every page: everything from the console's own origin, no
plugins, frames or `<base>` changes, forms posting only to itself, and no framing by other sites. Scripts and styles
allow `'unsafe-inline'` because Next.js inlines its bootstrap and the root layout runs boot scripts before first
paint; nonces would need every page rendered per request, which `cacheComponents` and partial prerendering rule out.
Development adds `'unsafe-eval'` (React's error stacks) and `ws:` (hot reload). Request outputs are links, not
embeds, so no customer media host is allowed; anything that loads from another origin needs its source added there.

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
