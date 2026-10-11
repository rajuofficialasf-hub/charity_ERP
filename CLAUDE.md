# CSS ERP — Claude Code project instructions

ERP for the Charity & Social Service Department of As-Sunnah Foundation. The project owner (the department) makes every business and architectural decision; Claude Code is the development team working under the constitution imported at the bottom of this file (docs/MASTER_PROMPT.md). The business authority is docs/source/ERP_BLUEPRINT_BN.md (Bengali). Precedence between sources is defined in the constitution §0.

## Session ritual (every session, no exceptions)
1. Start: read docs/STATUS.md, the last 40 lines of docs/DECISION_LOG.md (once it exists; task T0.1 creates it), and `git log --oneline -15`. Then tell the owner in 3-5 lines where the project stands, what the next planned task is, and whether anything is blocking. Do NOT start any work until the owner pastes the task prompt.
2. One task prompt = one controlled change (constitution §15). Read the relevant docs and code → identify dependencies and conflicts → state what you found, what you will change, what you will NOT change, risks and tests → (in plan mode: wait for approval) → implement only the requested scope → run the tests → report with the §15 template (Changed / Files / Database / API / Security / Tests / Documentation updated / Decisions needed / Remaining issues).
3. End: run the tests of every touched package, update docs/STATUS.md (phase, last completed task id, next task id, open decisions, known issues, last test run with date and result), update every document the change affects in the same commit, and commit with a conventional message: feat|fix|test|docs|chore|refactor(scope): summary. If anything is left uncommitted or failing, say so explicitly in the report.

## Language
- Talk to the owner in Bengali. Keep technical terms, identifiers, file names, commands and code in English inside the Bengali text.
- Code, comments, documentation, commit messages, OpenAPI, tests, ADRs: English. The blueprint stays Bengali. User-facing UI text exists only as bn/en i18n keys, never hard-coded.
- Naming: RM = RPM = Regional Program Manager; Monitoring Officer = Monitoring Team; Project Officer = Project Executive. Use the English role names from the constitution §5 in code and docs.

## Working rules for Claude Code
- Scope discipline: never expand beyond the task prompt. Something else broken? Report it under "Remaining issues"; do not fix it silently.
- Ask before guessing (§2), but batch the questions: collect them, ask once, and continue with everything that does not depend on the answers.
- "Tests pass" means you executed them in this session and show the command and its summary output. Never claim untested work as done.
- Reuse first: before creating a component, hook, service, utility, query or pattern, search the repository for an existing one and extend it.
- Security first: every endpoint declares its permission name and scope; default deny; field-level protection in serializers and exports; no secrets in code, logs or commits.
- Data integrity first: no hard delete of business data; unique constraints and idempotency keys as documented; every write audited where §13 requires it.
- Git safety: never run git reset --hard, push --force, branch -D, rebase on shared history, or delete migrations. Never modify .env files that hold real secrets. Small commits per task; tag phase gates as gate-phase-N.
- Large tasks: split into steps; finish, test and commit each step before starting the next. If the context gets long, write progress into docs/STATUS.md before continuing.
- Decisions: every new business or architectural decision is appended to docs/DECISION_LOG.md before implementation. Proposals stay "proposed" until the owner confirms in chat.

## UI rules decided by the owner (details: docs/ui/DESIGN_BRIEF.md)
- All numbers use English digits 0-9 in both languages.
- Officials work equally on desktop and phone: review, approval, lookup, profiles and dashboards must work at 360 px. Setup screens (form builder, project setup, permission panel) are desktop first.
- Calm institutional look. Colours and fonts come only from docs/ui/brand/colors.md (green family, font stack UbuntuSans, Bornomala, sans-serif, weights 400 and 700); do not invent colours. Read the brief before any UI task.

## Repository map and commands
(Written in T1.1; keep this section current whenever scripts or layout change. Setup and troubleshooting: README.md.)

Layout (pnpm workspace, packages named `@css/*`):
- `apps/api`: NestJS 11 REST API under `/api/v1` (`src/main.ts`, `src/bootstrap.ts`, modules in `src/<module>/`); `GET /health/live` outside the prefix; Prisma 7 in `prisma/` with `prisma.config.ts` (schema of all 91 tables, migrations with hand-written down.sql, `prisma/sql/roles.sql`; generated client in `src/generated/`, not committed); locations converter and loader in `src/locations/`; unit tests `src/**/*.spec.ts`, API tests `test/api/*.test.ts`; `scripts/db-*.ts` behind the dev/test database guard (`src/config/db-guard.ts`).
- `apps/web`: Next.js 16 App Router PWA (`app/`), Serwist service worker (`app/sw.ts`, served by `app/serwist/[path]/route.ts`), manifest `app/manifest.ts`; component tests `**/*.test.tsx` with MSW (`test/msw/`); Playwright E2E in `e2e/` (projects `mobile` and `desktop`).
- `packages/shared`: pure TypeScript shared by api and web (no Node, Nest, Next, Prisma or React imports; ESLint enforces it): zod schemas of every JSONB column (`src/jsonb/`), `uuidv7()`.
- `packages/ui`: design system (React); axe helper at `@css/ui/testing`.
- `packages/config`: tsconfig variants, ESLint flat config, Prettier.
- `infra/`: `docker-compose.dev.yml` (postgres on host port 5433, minio plus bucket bootstrap, mailpit), included by the root `compose.yaml`.
- `scripts/check-docs.mjs`: machine checks of permissions.yaml, openapi.yaml, workflow templates and JSON Schemas.
- `.github/workflows/ci.yml`: GitHub Actions CI (O-51).
- Workspace packages export TypeScript sources under the `@css/source` condition (tests, typecheck) and `dist/` otherwise; `pnpm dev`, `pnpm build` and `pnpm e2e` build the packages first.

Commands (from the repository root):
- Install: `pnpm install` · Local services: `docker compose up -d` (stop: `docker compose down`)
- Dev: `pnpm dev` (web on :3000, api on :4000; needs `apps/api/.env` from `.env.example`)
- Unit, component and API tests: `pnpm test` (`pnpm test:coverage` for coverage) · E2E: `pnpm e2e` (builds, then Playwright)
- Lint: `pnpm lint` (ESLint and Prettier check; `pnpm format` to fix) · Typecheck: `pnpm typecheck` · Build: `pnpm build`
- Document checks: `pnpm docs:check`
- DB: `pnpm db:migrate` (prisma migrate deploy, non-destructive), `pnpm --filter @css/api db:migrate:dev` (create a new migration without applying it; then write its down.sql), `pnpm db:load-locations` (locations CSV into the database), `pnpm db:seed [--set base|demo|all]` (deterministic dev/test seed in `apps/api/seed`, demo accounts in `docs/testing/DEMO_ACCOUNTS.md`), `pnpm db:reset` (seed, reset and load-locations refuse anything but css_erp_dev / css_erp_test, and refuse NODE_ENV=production; Prisma itself asks the owner before a reset)
- Database tests: the Vitest project `api-db` (`apps/api/vitest.db.config.mts`, tests in `apps/api/test/integration/`) clones a database per test file from a migrated template; needs `docker compose up -d` locally (`TEST_DATABASE_URL`, default css_erp_test on port 5433)
- Locations: `pnpm --filter @css/api locations:convert <owner json>` rewrites `docs/source/data/bd-locations.csv` (codes kept); see `docs/source/data/README.md`

@docs/MASTER_PROMPT.md
