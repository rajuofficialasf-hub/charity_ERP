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
- `apps/api`: NestJS 11 REST API under `/api/v1` (`src/main.ts`, `src/bootstrap.ts`, modules in `src/<module>/`; errors rendered in the request language by `src/i18n/api-exception.filter.ts`, raise `ApiError(code, status)`; backbone of T1.6 in `src/core/` (config, Prisma, request context, logging, envelope, validation, pagination), `src/audit/`, `src/idempotency/`, `src/rate-limit/`, `src/openapi/` (`@ApiContract` and the drift test), `src/jobs/` (pg-boss) with the worker entry `src/worker.ts`, `src/storage/`, `src/notifications/`, `src/health/`; authentication, sessions and user administration of T1.7 in `src/auth/` (global `AuthGuard`, interim permission resolver until T1.8) and `src/users/`; patterns in SYSTEM_ARCHITECTURE §5.1, steps in CONTRIBUTING "How to add an endpoint"); `GET /health/live` outside the prefix; Prisma 7 in `prisma/` with `prisma.config.ts` (schema of all 91 tables, migrations with hand-written down.sql, `prisma/sql/roles.sql`; generated client in `src/generated/`, not committed); locations converter and loader in `src/locations/`; unit tests `src/**/*.spec.ts`, API tests `test/api/*.test.ts`; `scripts/db-*.ts` behind the dev/test database guard (`src/config/db-guard.ts`).
- `apps/web`: Vite 8 + React 19 single-page PWA (D-073, ADR-013) in `src/`: `main.tsx` (root, service-worker registration in production), `app.tsx` (providers: TanStack Query, `LocaleProvider` with use-intl, `UiProvider`, `AuthProvider`, React Router), `routes/index.tsx` (route table, error boundary, dev-only gallery route constant-folded out of production builds), `i18n/` (device language: cookie `css_locale` and localStorage, typed keys in `types.d.ts`), `lib/` (`api.ts` client with the in-memory token and shared refresh, `auth.tsx` with `RequireAuth`, `wipe.ts`, `query-client.ts`), `components/` (AuthShell, AccountPage, LanguageSwitch, DocumentTitle, RouteError), `features/auth` and `features/account` (screens with their tests), `dev/Gallery.tsx`, `sw.ts`; `index.html`; `vite.config.ts` (proxy of `/api/v1` to `CSS_API_ORIGIN`, default http://127.0.0.1:4000; manifest plugin; `@serwist/vite`); `scripts/fonts.mjs` copies the fonts to `public/fonts/` (gitignored), `scripts/build.mjs [--e2e]` builds (`--e2e` adds the gallery and the dummy-OTP note); component tests `src/**/*.test.tsx` with MSW (`test/msw/`, providers in `test/auth.tsx`); Playwright E2E in `e2e/` (projects `mobile` and `desktop`) against `vite preview`; Tailwind 4 via `postcss.config.mjs` and `src/styles/globals.css`.
- `packages/shared`: pure TypeScript shared by api and web (no Node, Nest, Prisma, React or web-framework imports; ESLint enforces it): zod schemas of every JSONB column (`src/jsonb/`), `uuidv7()`; the i18n entry `@css/shared/i18n` (message catalogue `src/i18n/messages/{bn,en}/<namespace>.json`, `translate()`, `resolveLocale()`, bilingual-data helpers, `checkCatalogue()`) and the formatter `@css/shared/format` (I18N.md §6; every number, date and amount goes through it).
- `packages/ui`: design system on React Aria (D-064): components in `src/components/<Name>/` (tsx, test, css), `UiProvider` with the typed `UiMessages` texts (example values at `@css/ui/example-messages` until T1.5), tokens and styles exported as `@css/ui/styles.css`, the Tailwind 4 preset as `@css/ui/tailwind.css`, self-hosted fonts with licences in `fonts/` (UbuntuSans subset built by `scripts/subset-ubuntu-sans.py`, D-065); test helpers `renderWithUi` and `expectNoAxeViolations` at `@css/ui/testing`.
- `packages/config`: tsconfig variants, ESLint flat config, Prettier.
- `infra/`: `docker-compose.dev.yml` (postgres on host port 5433, minio plus bucket bootstrap, mailpit), included by the root `compose.yaml`.
- `scripts/check-docs.mjs`: machine checks of permissions.yaml, openapi.yaml, workflow templates and JSON Schemas.
- `.github/workflows/ci.yml`: GitHub Actions CI (O-51).
- Workspace packages export TypeScript sources under the `@css/source` condition (tests, typecheck) and `dist/` otherwise; `pnpm dev`, `pnpm build` and `pnpm e2e` build the packages first.

Commands (from the repository root):
- Install: `pnpm install` · Local services: `docker compose up -d` (stop: `docker compose down`)
- Dev: `pnpm dev` (web on http://127.0.0.1:3000, api on :4000; needs `apps/api/.env` from `.env.example`)
- Unit, component and API tests: `pnpm test` (`pnpm test:coverage` for coverage) · E2E: `pnpm e2e` (builds the packages, the API and the web app with the dev gallery, then Playwright; Playwright starts the API on port 4100 with `pnpm --filter @css/api e2e:server`, which recreates css_erp_test_e2e with the demo seed and the dummy OTP 123456; needs `docker compose up -d`) · Component gallery: `pnpm --filter @css/web dev`, then http://127.0.0.1:3000/dev/components (the language follows the switch on the page)
- Lint: `pnpm lint` (ESLint incl. the hard-coded text rule `css/no-literal-ui-text`, Prettier check, and `pnpm i18n:check`; `pnpm format` to fix). New user-facing text: add the key to both `bn` and `en` JSON files, never a literal · Typecheck: `pnpm typecheck` · Build: `pnpm build`
- Worker: `pnpm --filter @css/api dev:worker` (development) or `worker` (built); OpenAPI from the code: `pnpm --filter @css/api openapi:generate`
- Document checks: `pnpm docs:check`
- DB: `pnpm db:migrate` (prisma migrate deploy, then the pg-boss schema and queues with `jobs:install`, D-069; non-destructive), `pnpm --filter @css/api db:migrate:dev` (create a new migration without applying it; then write its down.sql), `pnpm db:load-locations` (locations CSV into the database), `pnpm db:seed [--set base|demo|all]` (deterministic dev/test seed in `apps/api/seed`, demo accounts in `docs/testing/DEMO_ACCOUNTS.md`), `pnpm db:reset` (seed, reset and load-locations refuse anything but css_erp_dev / css_erp_test, and refuse NODE_ENV=production; Prisma itself asks the owner before a reset)
- Database tests: the Vitest project `api-db` (`apps/api/vitest.db.config.mts`, tests in `apps/api/test/integration/`) clones a database per test file from a migrated template; needs `docker compose up -d` locally (`TEST_DATABASE_URL`, default css_erp_test on port 5433)
- Locations: `pnpm --filter @css/api locations:convert <owner json>` rewrites `docs/source/data/bd-locations.csv` (codes kept); see `docs/source/data/README.md`

@docs/MASTER_PROMPT.md
