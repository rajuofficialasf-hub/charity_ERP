# CSS ERP — As-Sunnah Foundation, Charity & Social Service Department

ERP for the Charity & Social Service Department of As-Sunnah Foundation: volunteers, beneficiaries, applications, distribution and construction projects, dawah, budgets, SOP documents and monitoring, with an offline-first mobile PWA for field volunteers. It is built with Claude Code under a written project constitution.

Repository: https://github.com/rajuofficialasf-hub/charity_ERP

## Where things are

| Path | What it is |
|---|---|
| `CLAUDE.md` | Instructions Claude Code loads in every session; it imports the constitution |
| `docs/MASTER_PROMPT.md` | The project constitution: rules, 49 approved decisions, roadmap, standards |
| `docs/source/ERP_BLUEPRINT_BN.md` | The business blueprint in Bengali, the top business authority. Diagrams are in `docs/source/images/` |
| `docs/PLAN.md` | The owner's step-by-step plan: 78 task prompts for Phase 0-6 (Bengali guidance, English prompts) |
| `docs/MODEL_GUIDE.md` | Which Claude model and effort level to use for each of the 78 tasks, why, and what to do when a usage limit runs out (Bengali) |
| `docs/ui/DESIGN_BRIEF.md` | The owner's design decisions from the 2026-10-10 interview: look, devices, digits, photos, notifications |
| `docs/ui/brand/colors.md` | Brand colours, ERP colour tokens with contrast checks, and fonts, taken from the Foundation's website |
| `docs/STATUS.md` | Session hand-off: current phase, next task, open decisions, known issues |
| `docs/source/README.md` | Input files the owner still has to supply (mockups, SOP, samples, location data) |
| `.claude/commands/` | Project slash commands: `/css-start`, `/css-end`, `/css-fix`, `/css-change`, `/css-bug`, `/css-review`, `/css-docsync`, `/css-status`, `/css-gate`, `/css-uat` |

## Working with Claude Code

1. Open this folder in Claude Code (terminal: `claude`, or the Claude desktop app, Code tab).
2. Pick the model and effort level for the next task from `docs/MODEL_GUIDE.md`, then run `/css-start`. Claude reports where the project stands and waits.
3. Switch to plan mode (Shift+Tab), paste the next task prompt from `docs/PLAN.md` section 4, review the plan, approve.
4. When the task is done, run `/css-end`: tests, `docs/STATUS.md`, commit, report.

বাংলায় সংক্ষেপে: `docs/MODEL_GUIDE.md` থেকে টাস্কের মডেল বেছে ফোল্ডারে `claude` চালান, `/css-start` দিন, plan mode চালু করে `docs/PLAN.md` থেকে পরের টাস্কের প্রম্পট পেস্ট করুন, কাজ শেষে `/css-end` দিন।

## Application setup

Phase 1 has started: the repository holds the scaffold of task T1.1 (no business features yet).

### Prerequisites

- Node.js 24 LTS (`.nvmrc`) and pnpm 12 (`corepack enable` or `npm install -g pnpm@12.10.1`)
- Docker Desktop with the engine running (Docker Compose v2.20 or newer)
- Git with LF line endings (`.gitattributes` enforces them)

### First run

```bash
pnpm install
docker compose up -d
cp apps/api/.env.example apps/api/.env
cp apps/web/.env.example apps/web/.env
pnpm dev
```

The web app runs at http://127.0.0.1:3000 (Vite, proxying `/api/v1` to the API) and the API at http://localhost:4000 (liveness: http://localhost:4000/health/live; business routes under `/api/v1`). For Playwright, install the browser once: `pnpm --filter @css/web exec playwright install chromium`.

### Layout

| Path | Contents |
|---|---|
| `apps/api` | Express 5 REST API (`/api/v1`, `src/server.ts`) and the pg-boss worker (`src/worker.ts`), Prisma schema and migrations in `prisma/` |
| `apps/web` | Vite React single-page PWA (`src/`: React Router, TanStack Query, use-intl, Serwist service worker), Playwright tests in `e2e/` |
| `packages/shared` | Pure TypeScript shared by API and PWA: zod schemas, permission names, i18n keys, business-rule functions |
| `packages/ui` | Design system: React Aria components, design tokens, Tailwind preset, self-hosted fonts |
| `packages/config` | Shared tsconfig, ESLint and Prettier configuration |
| `infra/` | Docker Compose file for development services |
| `scripts/` | Repository checks (`check-docs.mjs`) |

### Scripts (run from the root)

| Command | What it does |
|---|---|
| `pnpm dev` | Builds the shared packages, then runs web and API in watch mode |
| `pnpm build` | Builds every package and app |
| `pnpm test` | Unit, component, API and database integration tests (Vitest, all packages; the database tests need `docker compose up -d`) |
| `pnpm test:coverage` | The same with a coverage report |
| `pnpm e2e` | Builds the packages, the API and the PWA with the dev component gallery, then runs Playwright (mobile and desktop) against the API on a fresh `css_erp_test_e2e` database with the demo accounts (needs `docker compose up -d`) |
| `pnpm lint` | ESLint (including the hard-coded text rule), the Prettier check and `pnpm i18n:check` (`pnpm format` rewrites) |
| `pnpm i18n:check` | Message catalogue check (bn/en parity, ICU, parameters, digits, error codes) and no Bengali text in code |
| `pnpm typecheck` | TypeScript in every package |
| `pnpm docs:check` | Parses and validates permissions.yaml, openapi.yaml, workflow templates and JSON Schemas; Redocly lint |
| `pnpm db:migrate` | Applies the Prisma migrations to `DATABASE_URL` (`prisma migrate deploy`, non-destructive), then installs the pg-boss schema and queues (`jobs:install`) |
| `pnpm --filter @css/api dev:worker` | Runs the job worker in watch mode (the API enqueues, the worker consumes) |
| `pnpm --filter @css/api openapi:generate` | Writes the OpenAPI document generated from the code to `apps/api/openapi.generated.json` |
| `pnpm db:load-locations` | Loads `docs/source/data/bd-locations.csv` into the locations table (dev and test databases only) |
| `pnpm db:seed` | Development and test seed (`--set base`, `demo` or `all`, default all; idempotent); demo accounts in `docs/testing/DEMO_ACCOUNTS.md`; refuses non-dev databases and production |
| `pnpm db:reset` | Drops and re-creates the dev database from the migrations; refuses anything but `css_erp_dev` / `css_erp_test` and production |
| `docker compose up -d` / `docker compose down` | Starts or stops the development services |

### Development services

| Service | Address | Notes |
|---|---|---|
| PostgreSQL 17 | `127.0.0.1:5433` | Databases `css_erp_dev` and `css_erp_test`; user `css`, dev-only password in `infra/docker-compose.dev.yml` |
| MinIO (S3 API) | http://127.0.0.1:9000 | Buckets created by the `minio-init` container; console at http://127.0.0.1:9001 |
| Mailpit | SMTP `127.0.0.1:1025`, inbox http://127.0.0.1:8025 | Catches every email sent in development |

All ports listen on 127.0.0.1 only. Overrides (ports, dev passwords) go in `infra/.env`, see `infra/.env.example`.

### Troubleshooting

- **`docker compose up` cannot connect**: start Docker Desktop and wait until it reports "Engine running".
- **Port already in use** (for example a PostgreSQL installed on Windows holds 5432, which is why the dev database uses 5433): set another port in `infra/.env` and the same port in `DATABASE_URL` of `apps/api/.env`.
- **`pnpm install` reports ignored build scripts**: only the packages listed under `allowBuilds` in `pnpm-workspace.yaml` may run install scripts; add a package there only after reviewing it.
- **Prisma client missing**: run `pnpm --filter @css/api db:generate`.
- **Playwright cannot find a browser**: run `pnpm --filter @css/web exec playwright install chromium`.
- **The web app cannot reach the API** (`ECONNREFUSED 127.0.0.1:4000` in the Vite log): start the API (`pnpm dev` starts both) or set `CSS_API_ORIGIN` in `apps/web/.env` to where it runs.
- **Line endings on Windows**: the repository keeps LF; if Git converted files, run `git config core.autocrlf false` and check out again.

Commit conventions and the working rules for changes are in `CONTRIBUTING.md`.
