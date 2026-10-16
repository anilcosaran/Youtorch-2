# Modelvend Console

Developer console for the Modelvend API: one endpoint and one balance for every generative video, image, audio and 3D model.

Built with Next.js 16 (App Router, Cache Components, Turbopack), React 19 and Tailwind CSS v4.

> All data is mocked (`src/mocks`). Wiring a real backend means replacing those modules and the actions in `ConsoleProvider`; the UI does not import mock files directly beyond them.

## Getting started

```bash
npm install
cp .env.example .env.local   # optional, defaults live in src/config/site.ts
npm run dev                  # http://localhost:3000
```

Requires Node.js 20.9 or newer.

## Scripts

| Script              | What it does                                         |
| ------------------- | ---------------------------------------------------- |
| `npm run dev`       | Dev server with Turbopack                            |
| `npm run build`     | Production build (`.next/standalone`)                |
| `npm run start`     | Serve the production build with `next start`         |
| `npm run typecheck` | Generate route types, then `tsc --noEmit`            |
| `npm run lint`      | ESLint (`eslint-config-next`)                        |
| `npm run format`    | Prettier with Tailwind class sorting                 |
| `npm run check`     | Typecheck, lint and format check, in that order (CI) |

## Repository

| Path         | What                                                                                                                      |
| ------------ | ------------------------------------------------------------------------------------------------------------------------- |
| `/` (`src/`) | This customer console                                                                                                     |
| `apps/admin` | Operator console: catalog, versions, routes, providers, customers, keys, requests. See its [README](apps/admin/README.md) |
| `docs/`      | [Platform architecture](docs/architecture.md): domain model, request flow, proposed layout                                |

Each app has its own `package.json`; root scripts and configs cover the console only.

## Project structure

```
src/
├─ app/                     Routes only: layouts, pages, metadata, error and 404 boundaries
│  └─ (console)/            Everything inside the sidebar shell
├─ components/
│  ├─ ui/                   Design-system primitives (button, dialog, select, input, ...)
│  ├─ charts/               Bar chart, sparkline, mini bars, legend, tooltip
│  ├─ code/                 Code block and shared API snippets
│  ├─ brand/                Logo mark
│  ├─ feedback/             Status screen for 404 / error pages
│  └─ layout/               App shell, sidebar, topbar, command menu, side panel, theme
├─ features/                One folder per product area, each with components/ and lib/
│  ├─ dashboard/            Showcase slider, featured apps, gallery, build banner
│  ├─ models/               Catalog, model card, detail page sections, playground
│  ├─ usage/                KPIs, daily spend chart, side cards, request log
│  ├─ billing/              Balance, bonus ladder, spend overview, payment dialogs
│  ├─ api-keys/             Keys table and create-key dialog
│  └─ quickstart/           Onboarding steps and snippets
├─ providers/               ConsoleProvider: balance, keys, cards, dialogs (client state)
├─ mocks/                   Sample models, usage series, workspace and dashboard content
├─ lib/                     Framework-free helpers: cn, formatters, pricing, theme, modality
├─ types/                   Domain types (Model, Endpoint, ApiKey, DailyUsage, ...)
└─ config/site.ts           Brand name, URLs, user and workspace defaults
```

Conventions:

- Routes stay thin and compose feature components. Features import from `components`, `lib`, `types`, `mocks` and `providers`. The dashboard is an overview, so it is the one feature that reuses others (`ModelCard`, `ModelArt` and model links from `models`, `RequestTable` from `usage`). The shell mounts `BillingDialogs` so any page can open them.
- Brand strings and URLs come from `site` in `src/config/site.ts`, never hard-coded.
- Components are Server Components unless they need state, effects or browser APIs.

## Environment

| Variable                   | Default                       | Used for                      |
| -------------------------- | ----------------------------- | ----------------------------- |
| `NEXT_PUBLIC_SITE_URL`     | `https://app.modelvend.ai`    | `metadataBase`, absolute URLs |
| `NEXT_PUBLIC_API_BASE_URL` | `https://api.modelvend.ai/v1` | Code samples                  |
| `NEXT_PUBLIC_DOCS_URL`     | `https://docs.modelvend.ai`   | Docs links                    |

`NEXT_PUBLIC_*` values are inlined at build time; rebuild after changing them.

## Deploying

The build emits a standalone server (`output: "standalone"`).

```bash
docker build -t modelvend-console \
  --build-arg NEXT_PUBLIC_SITE_URL=https://app.modelvend.ai .
docker run -p 3000:3000 modelvend-console
```

Without Docker:

```bash
npm run build
cp -r public .next/standalone/ && cp -r .next/static .next/standalone/.next/
PORT=3000 node .next/standalone/server.js
```

Security headers (HSTS, `X-Frame-Options`, `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy`) are set in `next.config.ts`. A Content Security Policy is not set yet: it needs nonces for the inline theme script and Next's runtime, so add it together with the auth/proxy layer.

## Before going live

- Replace `src/mocks` with API calls and move `ConsoleProvider` actions to server actions or a data layer.
- Collect card details through the payment provider's hosted fields; `AddCardForm` is a visual placeholder only.
- Add authentication; the console currently renders for anyone and is marked `noindex`.
