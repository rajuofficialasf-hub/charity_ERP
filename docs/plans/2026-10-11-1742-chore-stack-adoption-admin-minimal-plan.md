---
title: Adopt the organization stack fully and give the admin area the Minimal UI
type: chore
status: in-progress
source: brainstorm
date: 2026-10-11
doc_review: 2026-10-11
---

# Adopt the organization stack fully and give the admin area the Minimal UI

## Goal
After this work a developer starts the whole ERP locally with one Docker command, the API runs on the organization's Express stack (D-074), and the Department Head, Monitoring Team and PM open their dashboards and admin settings in the Minimal UI shell, while every other screen keeps the approved design system.

## Problem
The owner chose the organization's engineering standard (assunnah-engineering plugin) for the whole ERP on 2026-10-11. The frontend is done (T1.7b, D-073) and the backend port is decided (T1.7c, D-074) but not built. Two pieces are still open: the one-command local setup the standard expects (ORG-DEV-01) and the UI of the admin area, which the owner wants on the plugin's Minimal template. The first admin screens arrive with T1.13 (settings, audit viewer) and the dashboards with T3.3 and T6.1, so the admin shell must exist before them.

## Requirements

### A. Backend on the organization stack (T1.7d, per D-074)
- **R1** The API serves every operation of `docs/api/openapi.yaml` that exists today (auth, sessions, users, me/language, health) from an Express 5 application; the OpenAPI drift test and the 193 API tests pass unchanged except for the app factory.
- **R2** The 39 Playwright journeys pass against the ported API without changes to the specs.
- **R3** The database runs on PostgreSQL 17 in development, test and CI; migrations apply up, down and up.
- **R4** The storage adapter has the standard's shape (`put`, `get`, `remove` of NS-31, plus `stat` and `ping` as deliberate additions for the file register and the readiness probe; S3 driver on MinIO now, NAS driver later) and offers no presigned URLs.

### B. One-command local environment
- **R5** `docker compose up` on a fresh clone starts PostgreSQL 17, MinIO, Mailpit, the migrations and job install, the seed (base and demo), the API and the web app; no `.env` is required for local defaults, and `docker compose up -d postgres minio mailpit` still starts only the services for people who run the apps on their machine (ORG-DEV-04).
- **R6** The README shows the one command and the two-process alternative (`pnpm dev`).

### C. Minimal UI for the admin area
- **R7** The routes `/admin/*` render inside the Minimal app shell (sidebar navigation, top bar, content area) loaded as a separate lazy chunk; every other route keeps `packages/ui` and the T1.4 look.
- **R8** Admin pages import UI only from the org component set (`@/ui`, RE-UI-01); the Minimal template lives under `src/ui/templates/minimal/` (RE-UI-02) and the import lint rule blocks `@mui/*` elsewhere (RE-UI-05).
- **R9** The admin shell shows the signed-in user's name, the language switch, a log-out action and a placeholder "Dashboard" page for Department Head, Monitoring Team and PM; other roles reaching `/admin` see the forbidden screen (the API enforces the permission; the shell only hides, RE-SEC-05).
- **R10** Bengali text in the admin area renders in Bornomala (the Minimal fonts have no Bengali glyphs); every number stays in English digits (UX-05) through the shared formatter.
- **R11** The initial bundle of the non-admin routes does not grow because of Minimal (NFR-15, 250 KB gzip); the admin chunk size is reported.
- **R12** The admin shell passes axe in both languages at 1280×800; on a phone it shows the "best on a larger screen" notice of UX-04 and remains readable.

## Scope
- In: R1–R12; the admin shell with one placeholder dashboard page; the route split and lint rule; the Docker setup for development.
- Out (not now): any real admin screen (settings and audit viewer T1.13, permission panel T1.8 stays on packages/ui per the owner's answer, dashboards T3.3 and T6.1); auth-core adoption (D-074 section 4); the production Caddy and container images (T3.0); a NAS driver; restyling Minimal to the brand (owner's choice); converting any existing screen to Minimal.

## Key decisions
- **Stack scope = D-074 plus the one-command Docker setup; pnpm stays** (owner answer): the kit's npm workspaces and root layout are not adopted; ST-20 is a SHOULD and the pnpm workspace carries the CI and the `@css/source` condition. Recorded deviations: ST-21 and ST-31 are met with `pnpm-lock.yaml` (committed, `pnpm install --frozen-lockfile` in CI) and `pnpm audit` instead of the npm commands. Governs R5, R6.
- **Minimal only for dashboards and admin settings** (owner answer): the (management) screens and admin settings; setup screens (project setup, form builder, permission panel) and every official and volunteer screen stay on packages/ui. Recorded deviation from RE-UI-01: outside `/admin/*` the UI comes from `@css/ui` (D-064, O-54), not from `@/ui`; inside `/admin/*` RE-UI-01 applies in full. Governs R7.
- **Minimal as it comes, not re-themed to the brand** (owner answer, after the push-back that it departs from UX-01/UX-13 for these screens): Minimal's own palette and Latin fonts; Bornomala is added only as the Bengali fallback (R10). Recorded as a deliberate deviation from DESIGN_SYSTEM for `/admin/*`.
- **Admin shell as its own task after T1.7d, before T1.8** (owner answer): T1.7e, so T1.13, T3.3 and T6.1 build on it.
- **Two UI systems in one SPA, split by route**: `/admin/*` is a lazy route subtree with its own providers (MUI theme, Emotion cache); the rest never loads MUI. Governs R7, R11.
- **Permission to enter `/admin`**: the roles Department Head, Monitoring Team and PM (the (management) audience of SYSTEM_ARCHITECTURE 4.2), checked from `me.roles` in the shell and by the API on every admin endpoint when those arrive.

## Open questions
- Minimal licence: the plugin ships Minimal 7.7.0 under a paid licence (`kit/templates/minimal/LICENSE.md`). The owner confirms the organization's licence covers this project before the template is copied into the repository. This gates U10 to U12 only; U1 to U9 proceed without it.

<!-- ae-plan adds everything below -->

## Technical decisions
- **Stack profile** (ST-43, written to CLAUDE.md in U8): Database: PostgreSQL 17 through Prisma 7 (staff and volunteers create and change records with relations, search and personal data, ST-41). Auth: own authentication of T1.7 ported to one Express middleware; auth-core adopted when its login pack and source exist (D-074 section 4; ST-42 line crossed, deviation recorded). Storage: the storage adapter with the S3 driver on MinIO now and the NAS driver before production (ST-05); no presigned URLs (NS-41). Jobs: pg-boss (ADR-004; ST-30: nothing in the stack covers queued work). Frontend: React + Vite (ST-01, D-073). Package manager: pnpm workspaces (owner answer; ST-20 is a SHOULD).
- **Express app factory** (NE-REQ-03, NE-REQ-04): `createApp(deps)` in `apps/api/src/app.ts` after the kit's `kit/base/apps/api/src/app.ts` (trust proxy → request logging → helmet → CORS allowlist → json 100 KB → health → routes → 404 → error handler); `server.ts` listens and shuts down on SIGTERM (NE-ERR-04). Our additions in that order: the request-context middleware right after logging, the per-class rate limiters on their routes, the audit wrapper on every write route.
- **Routes declare their contract** (constitution 13, NFR-54): `defineRoute(router, { contract, validate, handler })` registers the Express handler, the per-class limiter, the audit enforcement and the OpenAPI operation in one registry; `buildOpenApiDocument()` reads the registry; `src/openapi/drift.ts` and its test are reused unchanged. The envelope `{ data, meta }` and the error block of API_STANDARDS 3 stay (NE-REQ-05 is a SHOULD; CLAUDE.md wins).
- **Validation** (NE-REQ-01, ST-07): `validate({ body, query, params })` middleware with the shared zod schemas; unknown query parameters stay 400 `validation.unknown_parameter`, field problems 422 with details, as `core/validation.ts` does today.
- **Rate limits** (NE-SEC-04): `express-rate-limit` 8 with `MemoryStore`, one limiter per API_STANDARDS 10 class keyed as today (`rate-limit.ts` keys), `RateLimit-*` headers and `Retry-After` on 429; `RATE_LIMITS_RELAXED` kept for E2E (D-072).
- **Auth middleware** (AU-21 shape, NE-SEC-03): `requireAccess(rule)` does what `AuthGuard` does today (bearer → session → permission version → state → interim resolver) and sets `req.user` (the `Principal`); routes without a rule are refused by `defineRoute` (default deny).
- **Cookies and CSRF** (NE-SEC-05): unchanged (`css_refresh`, `css_csrf`, D-070); cookie parsing stays in `auth/cookies.ts` (no cookie-parser dependency, ST-30).
- **Errors** (NE-ERR-01, NE-SEC-11): one `errorHandler` built from the logic of `ApiExceptionFilter` (codes, localized message, `Retry-After`, body-parser errors mapped to `validation.malformed` and 413).
- **Logging** (NE-LOG-01, NE-LOG-02): `pino-http` directly with our `loggerOptions` (redaction list of `core/logging.ts`).
- **Storage** (ST-05, NS-01 to NS-11, NS-41): `StorageDriver { name: 's3' | 'filesystem'; put; get; remove; stat; ping }` in `src/storage/`; the S3 driver uses `@aws-sdk/client-s3` against MinIO (path style) as in the kit's `kit/addons/storage/files/apps/api/src/storage/drivers/s3.ts`; uploads stream through `@aws-sdk/lib-storage` `Upload` (NS-42), both SDK packages imported only in `drivers/s3.ts`; every S3-only line and setting carries a `TEMP:` marker (NS-35); `STORAGE_DRIVER` becomes a zod discriminated union with no default (NS-34); the second driver is named `filesystem` and serves tests only, because the NAS driver of NS-30 is built with the production file service (T3.0) when the NAS path exists; buckets stay private (`infra/minio/bootstrap.sh` sets `mc anonymous set none`, NS-40); `presignGet`, `presignPut` and their tests are removed; file download routes (T2.1) stream with `Content-Disposition: attachment` and nosniff.
- **Database** (ST-03, DB-MIG-*, DB-ROLE-01): PostgreSQL 17.11 pinned by digest in `infra/docker-compose.dev.yml` and `postgres:17` in CI; Prisma migrations, `down.sql` and `prisma/sql/roles.sql` unchanged (constitution 9 over DB-MIG-05, a named conflict).
- **Build and run** (ST-13, ST-15, ST-22): `tsc -p tsconfig.build.json` to `dist/`, `node dist/server.js` and `node dist/worker.js`; `tsx watch` in development; `tsconfig/nest.json` becomes `tsconfig/node.json` (NodeNext, no decorators). The decorator compiler settings go away with Nest.
- **Published ports and proxies in Compose** (D-056, D-072, NE-SEC-10): every published port binds to `127.0.0.1` as today; only the in-container listeners use `0.0.0.0`. The `api` service gets `TRUST_PROXY=uniquelocal` (the Vite proxy in the `web` container is one private-network hop), the `web` service `CSS_API_ORIGIN=http://api:4000`. The demo seed and the dummy OTP keep refusing `NODE_ENV=production` (`db-guard.ts`, `env.ts`, BR-024).
- **One-command environment** (ORG-DEV-01 to ORG-DEV-04): `compose.yaml` adds `setup` (pnpm install, package builds), `migrate` (migrate deploy, jobs install, seed base and demo; one-shot), `api` (`tsx watch`) and `web` (`vite --host 0.0.0.0`) services on a `docker/app/Dockerfile.dev` (node:24 with corepack pnpm), with `depends_on` health conditions; the existing `postgres`, `minio`, `minio-init` and `mailpit` services keep their names so `docker compose up -d postgres minio mailpit` still works. Secrets stay dev-only defaults (NE-CFG-02); the API's auth secrets get fixed dev values in the compose environment, never in a committed `.env`.
- **Minimal in this repo** (RE-UI-01 to RE-UI-05): the kit's `kit/templates/minimal/src` is copied to `apps/web/src/ui/templates/minimal/` and its `public/assets` to `apps/web/public/minimal/`; the contract and tokens come from `kit/base/apps/web/src/ui/{contract.ts,tokens.ts,index.ts}`; `eslint.config.mjs` adds `no-restricted-imports` for `@mui/*`, `@emotion/*`, `minimal-shared` outside `src/ui/templates/**`. The import alias `@/ui` resolves through the existing `@` alias. Icons stay offline: the kit's `iconify/register-icons.ts` registers the icon sets with `addCollection`, so `/admin` never calls the Iconify API (checked by the U11 e2e: no request to an external host). The copied tree holds no auth, no `localStorage`/`sessionStorage` use and no `dangerouslySetInnerHTML` (checked 2026-10-11 in the kit; re-checked in U10). The SPA's Content-Security-Policy (Emotion needs `style-src 'unsafe-inline'`) is decided with Caddy in T3.0.
- **Two UI systems by route** (RE-CMP-02, NFR-15): `/admin` is a lazy route subtree (`src/admin/`) whose layout element mounts the Minimal `UiProvider` (MUI theme, Emotion cache, the `AppShell` of the contract); nothing outside `src/admin/` and `src/ui/templates/` imports MUI, so the main chunk stays Minimal-free (checked in the build output). `use-intl` and `@css/shared/format` are used inside the admin pages as everywhere (I18N 6); Bornomala is added to the Minimal theme's font fallback for Bengali (R10).
- **Admin header actions on the contract** (RE-UI-01, RE-UI-04): the language switch and the log-out action inside the shell are admin-local components built from the contract's `SelectField` and `Button` (`src/admin/AdminHeaderActions.tsx`), not the `@css/ui` `LanguageSwitch` or `LogoutButton`; they call the same `useLocaleSwitch()` and `logout()` of `src/lib`.
- **Admin access** (RE-SEC-05): the `/admin` layout reads `me.roles` and shows the contract's `ErrorScreen kind="forbidden"` for roles outside `department_head`, `monitoring_team`, `program_manager`; the API keeps enforcing on every admin endpoint when those arrive (T1.13).
- **Versions** (D-058): express 5.2, helmet 8, cors 2, express-rate-limit 8, pino-http 11 (present), @aws-sdk/client-s3 (the kit's line), @mui/material 9.4 with @emotion 11, minimal-shared 1.1, @iconify/react 6 (the template's `template.json` list), postgres 17.11-alpine.

## Implementation units

### U1. Characterization baseline (TS-22, TS-24)
- **Goal:** Record the tests that define the API's behaviour today and confirm they are green before anything moves.
- **Requirements:** R1, R2
- **Files:** `docs/plans/2026-10-11-1742-chore-stack-adoption-admin-minimal-plan.md` (Progress notes only)
- **Approach:** Run `pnpm test` (api and api-db projects: 27 files, 193 tests) and `pnpm e2e` (39) on the current NestJS API; list the test files per layer in the Progress notes. No new tests: `apps/api/test/api/*.test.ts`, `apps/api/test/integration/*.test.ts` and `apps/web/e2e/*.spec.ts` are the characterization suite and are not rewritten in later units.
- **Tests:** existing: covered by `apps/api/test/api/`, `apps/api/test/integration/`, `apps/web/e2e/` (checked 2026-10-11, all green).
- **Done when:** both commands are green and the file list is in the plan.
- **Depends on:** none · **Size:** S · **Risk area:** none
- **Status:** todo

### U2. Express application skeleton and test harness
- **Goal:** An Express 5 app that serves the health probes with the T1.6 logging, request context, configuration and error block, built the same way in `server.ts` and in tests.
- **Requirements:** R1
- **Files:** `apps/api/package.json` (add `express`, `helmet`, `cors`), `apps/api/src/app.ts`, `apps/api/src/server.ts`, `apps/api/src/container.ts`, `apps/api/src/config/env.ts` (`CORS_ORIGINS` added), `apps/api/src/http/errors.ts` (from `i18n/api-exception.filter.ts`), `apps/api/src/http/security.ts` (helmet, CORS allowlist, request logging from `core/logging.ts`), `apps/api/src/core/request-context.middleware.ts`, `apps/api/src/health/{routes,service}.ts`, `apps/api/test/support/app.ts`, `apps/api/test/api/health.api.test.ts`, `apps/api/test/api/health-ready.api.test.ts`, `apps/api/test/api/i18n.api.test.ts`
- **Approach:** Copy the order of `kit/base/apps/api/src/app.ts` and `server.ts`; keep our modules as plain classes constructed in `container.ts` (Prisma, AuditWriter, IdempotencyService, storage, adapters, JobRunner); the harness `buildTestApp(env, overrides)` replaces `Test.createTestingModule`. Nest stays installed and untouched until U6, so both apps compile side by side.
- **Tests:**
  - integration (Supertest on the Express app): `/health/live` 200; `/health/ready` 200 and 503 with and without the token (ported `health-ready` test); errors in bn and en, `server.internal` without details (ported `i18n` test); 404 for an unknown path as `permission.not_found`; a 2 MB JSON body answers 413.
  - existing: covered by `apps/api/test/api/health*.test.ts`, `apps/api/test/api/i18n.api.test.ts` (their app factory changes).
- **Done when:** the three ported test files pass against Express; `node dist/server.js` answers `/health/live`.
- **Depends on:** U1 · **Size:** L · **Risk area:** none
- **Status:** todo

### U3. Backbone on Express: validation, envelope, rate limits, audit wrapper, route registry and OpenAPI
- **Goal:** Every cross-cutting service of T1.6 works as Express middleware or a route wrapper, and the OpenAPI document is generated from the route registry.
- **Requirements:** R1
- **Files:** `apps/api/package.json` (add `express-rate-limit`), `apps/api/src/http/validate.ts` (from `core/validation.ts`), `apps/api/src/http/send.ts` (from `core/envelope.ts`), `apps/api/src/rate-limit/rate-limit.ts` (express-rate-limit), `apps/api/src/audit/write-route.ts` (from `audit.decorator.ts`), `apps/api/src/openapi/{define-route,registry,document}.ts` (from `api-contract.ts`, `document.ts`), `apps/api/src/openapi/drift.ts` (unchanged), `apps/api/scripts/openapi-generate.ts`, `apps/api/test/api/core.api.test.ts`, `apps/api/test/api/guards.api.test.ts`, `apps/api/test/api/openapi-drift.test.ts`, `apps/api/test/integration/{pagination,audit-idempotency}.test.ts`
- **Approach:** `defineRoute` mirrors the `ApiContract` spec (same fields) and registers: the validators, the limiter of `rateLimit`, `write(action, handler)` when the method is a write, the handler wrapped in `send()`, and the OpenAPI operation (`jsonSchemaOf` reused). The probe controllers of the tests become probe routers.
- **Tests:**
  - unit: `issueCode` mapping (`validate.spec.ts`: unknown query parameter → 400, nested paths); limiter key functions (the cases of `auth.spec.ts` moved).
  - integration: envelope and `X-Request-Id` echo; 422 details in bn and en; unknown parameter 400; malformed JSON 400; 10 logins per minute per id and per IP then 429 with `Retry-After`, forwarded address counted separately through the trusted loopback proxy, and a spoofed `X-Forwarded-For` from an untrusted address does not reset the limit (D-072, NE-SEC-10); default class 600; a write without an audit entry fails with `server.internal`; a write route without `audit` cannot be registered; drift test green for the registry; a drifting probe route is reported with every difference.
  - existing: covered by `apps/api/test/api/{core,guards,openapi-drift}.api.test.ts`, `apps/api/test/integration/{pagination,audit-idempotency}.test.ts` (factories change, assertions stay).
- **Done when:** those five test files pass on Express and `pnpm --filter @css/api openapi:generate` runs without error.
- **Depends on:** U2 · **Size:** L · **Risk area:** none
- **Status:** todo

### U4. Authentication, sessions, users and `/me/language` on Express
- **Goal:** Every T1.7 operation is served by Express routes behind one `requireAccess` middleware with identical behaviour.
- **Requirements:** R1, R2
- **Files:** `apps/api/src/auth/require-access.ts` (from `auth.guard.ts`), `apps/api/src/routes/{auth,sessions,users,me}.ts` (from the three controllers), `apps/api/src/services/{auth,sessions,users}.ts` (moved services, logic unchanged), `apps/api/src/auth/{cookies,token.service,session.service,otp.service,password-hasher,permission-resolver,permission-version.service,lockout,login-id}.ts` (imports only), `apps/api/test/integration/{auth,password,sessions-users,user-language}.test.ts`, `apps/api/test/integration/support/auth-app.ts`, `apps/api/scripts/e2e-server.ts`
- **Approach:** `requireAccess(rule)` reproduces `AuthGuard.canActivate` and sets `req.user`; `defineRoute` takes the rule from the contract (`permission`, `allowPending`); the OTP start-up warning moves to `server.ts`; the idempotency header mode reads `req.user`. Routes are thin (NE-REQ-04): validate → service → send.
- **Tests:**
  - integration: the 39 tests of `auth`, `password`, `sessions-users` and `user-language` unchanged (login by mobile and email, lockout, pending, blocked and deactivated accounts, refresh rotation and reuse, CSRF, idle and hard limits, device limit, revoke own and by official, Main Admin protection, If-Match, unlock, OTP reset, language) plus: a route registered without a rule answers 403 `permission.denied` (default deny, TS-13); `req.user` is absent on public routes.
  - e2e: the 12 auth journeys of `apps/web/e2e/auth.spec.ts` unchanged, against the Express E2E server.
  - existing: covered by `apps/api/test/integration/{auth,password,sessions-users,user-language}.test.ts`, `apps/web/e2e/auth.spec.ts`.
- **Done when:** all of the above pass; the drift test lists the 20 operations.
- **Depends on:** U3 · **Size:** L · **Risk area:** auth
- **Status:** todo

### U5. Jobs, storage adapter, notifications and readiness on Express
- **Goal:** The worker, the storage adapter in the standard's shape and the notification adapters run under the Express container; presigned URLs are gone.
- **Requirements:** R1, R4
- **Files:** `apps/api/package.json` (add `@aws-sdk/client-s3`, `@aws-sdk/lib-storage`), `apps/api/src/storage/{types,index}.ts`, `apps/api/src/storage/drivers/{s3,filesystem}.ts` (from `minio-storage.ts`, `filesystem-storage.ts`), `apps/api/src/config/env.ts` (`STORAGE_DRIVER` union without default), `apps/api/src/jobs/*` (imports), `apps/api/src/worker.ts`, `apps/api/src/notifications/*` (imports), `apps/api/src/health/service.ts` (readiness checks), `apps/api/test/integration/{jobs,minio-storage,notifications}.test.ts`, `apps/api/src/storage/filesystem-storage.spec.ts`, `docs/architecture/FILES_AND_DOCUMENTS.md` (one note: streaming instead of presigned URLs, detailed in T2.1)
- **Approach:** Follow `kit/addons/storage/files/apps/api/src/storage/drivers/s3.ts` (SDK v3, path style, timeouts) with the `MINIO_*` configuration; `assertKey` and `BUCKETS` stay; remove `presignGet`, `presignPut`, `urlTtl`, `MAX_URL_TTL_SECONDS` and the NFR-28 API note.
- **Tests:**
  - integration: MinIO put (streamed `Upload`), get, stat, remove and ping through the S3 driver (the existing cases minus presign); an unauthenticated HTTP GET of an object URL on the bucket is refused (private bucket, NS-40); the filesystem driver the same; pg-boss install, transactional enqueue and rollback, heartbeat; Mailpit delivery; readiness with all three checks.
  - existing: covered by `apps/api/test/integration/{jobs,minio-storage,notifications}.test.ts`, `apps/api/src/storage/filesystem-storage.spec.ts` (presign cases removed).
- **Done when:** those tests pass; `grep -rn presign apps/api/src` is empty; every S3-only line carries `TEMP:`.
- **Depends on:** U3 · **Size:** M · **Risk area:** file storage
- **Status:** todo

### U6. Remove NestJS and switch the build, scripts and CI
- **Goal:** No Nest dependency or decorator remains; build, dev, worker, E2E server and CI run the Express app.
- **Requirements:** R1, R2
- **Files:** `apps/api/package.json` (remove `@nestjs/*`, `nestjs-pino`, `reflect-metadata`, `rxjs`, `@swc/core`, `@nestjs/cli`, `@nestjs/testing`), deleted: `apps/api/src/main.ts`, `apps/api/src/bootstrap.ts`, `apps/api/src/app.module.ts`, every `*.module.ts`, `apps/api/src/auth/{auth.controller,sessions.controller,auth.guard}.ts`, `apps/api/src/users/users.controller.ts`, `apps/api/src/core/{core.module,envelope,validation}.ts`, `apps/api/src/openapi/api-contract.ts`, `apps/api/src/audit/audit.decorator.ts`, `apps/api/src/i18n/api-exception.filter.ts`, `apps/api/src/rate-limit/` (Nest guard), `apps/api/nest-cli.json`; `apps/api/tsconfig.json`, `apps/api/tsconfig.build.json`, `packages/config/tsconfig/node.json` (from `nest.json`), `apps/api/nest-cli.json` (deleted), `apps/api/vitest.config.mts`, `apps/api/vitest.db.config.mts` (no swc plugin), `apps/api/scripts/*.ts`, `.github/workflows/ci.yml`, `pnpm-workspace.yaml` (allowBuilds), `pnpm-lock.yaml`
- **Approach:** `dev` = `tsx watch --conditions=@css/source src/server.ts` (the condition resolves `@css/shared` sources, as `dev:worker` does today), `build` = `tsc -p tsconfig.build.json`, `start` = `node dist/server.js`, `worker` = `node dist/worker.js`; `pnpm audit` must stay clean.
- **Tests:**
  - existing: the whole `pnpm test` (61 files) and `pnpm e2e` (39) run on the new build; `pnpm --filter @css/api build` produces `dist/server.js` and `dist/worker.js`.
- **Done when:** `grep -rn "@nestjs" apps packages` is empty; lint, typecheck, test, build, e2e and audit pass.
- **Depends on:** U4, U5 · **Size:** M · **Risk area:** none
- **Status:** todo

### U7. PostgreSQL 17
- **Goal:** Development, test and CI databases run PostgreSQL 17 and every migration applies up, down and up.
- **Requirements:** R3
- **Files:** `infra/docker-compose.dev.yml` (image digest of `postgres:17.11-alpine`), `.github/workflows/ci.yml` (two `postgres:17` services), `docs/architecture/ADR/ADR-003-prisma-with-down-sql.md`, `docs/database/DATABASE_SCHEMA.md` (version line), `docs/ops/DEPLOYMENT.md`, `README.md`
- **Approach:** Pin by digest like the other images; the local volume `pg-data` is recreated (`docker compose down -v` documented as the one-time step; dev data is seed data).
- **Tests:**
  - integration: `apps/api/test/integration/migrations.test.ts` (up, down, up, Prisma drift "No difference") and the full api-db project on 17.
  - existing: covered by `apps/api/test/integration/migrations.test.ts`.
- **Done when:** api-db passes on 17 locally; CI references 17.
- **Depends on:** U6 · **Size:** S · **Risk area:** migrations
- **Status:** todo

### U8. Documentation of the port and the stack profile
- **Goal:** Every document that describes the API matches the Express implementation and CLAUDE.md carries the stack profile.
- **Requirements:** R1 (documentation side)
- **Files:** `docs/architecture/ADR/ADR-014-express-backend.md` (new; ADR-002 superseded), `docs/architecture/ADR/README.md`, `docs/architecture/SYSTEM_ARCHITECTURE.md` (sections 2, 4.1, 5.1, 6, 11), `CONTRIBUTING.md` ("How to add an endpoint"), `docs/ops/DEPLOYMENT.md`, `docs/testing/TEST_STRATEGY.md`, `docs/api/API_STANDARDS.md` (section 16 note), `docs/architecture/BACKEND_STANDARD_MIGRATION.md` (status done), `CLAUDE.md` (map, commands, `## Stack profile`), `README.md`, `docs/STATUS.md`
- **Approach:** As in the T1.6 docs commit; `pnpm docs:check` and the Prettier check gate it.
- **Tests:** existing: `pnpm docs:check`, `pnpm lint` (Prettier on docs).
- **Done when:** no document names NestJS as the current stack except history and ADR-002.
- **Depends on:** U7 · **Size:** S · **Risk area:** none
- **Status:** todo

### U9. One-command local environment
- **Goal:** `docker compose up` on a fresh clone brings up the whole ERP with seed data; the services-only start keeps working.
- **Requirements:** R5, R6
- **Files:** `compose.yaml`, `infra/docker-compose.dev.yml` (services unchanged), `infra/docker-compose.app.yml` (new: `setup`, `migrate`, `api`, `web`), `docker/app/Dockerfile.dev` (node:24-alpine, corepack pnpm 12), `.dockerignore`, `README.md`, `docs/ops/DEPLOYMENT.md` (dev section), `CLAUDE.md` (commands)
- **Approach:** Follow `kit/base/compose.yaml` and `kit/addons/database/files/docker/compose.database.yaml` (one-shot `setup` and `migrate` with `service_completed_successfully`, health checks on `/health/live` and the Vite root, node_modules in named volumes); `migrate` runs `pnpm db:migrate` (Prisma deploy and jobs install), `pnpm db:load-locations` and `pnpm db:seed --set all`; `web` runs `vite --host 0.0.0.0 --port 3000` with `CSS_API_ORIGIN=http://api:4000` (published as `127.0.0.1:3000`); the `api` service runs `tsx watch --conditions=@css/source src/server.ts` with `TRUST_PROXY=uniquelocal`, the dev-only secrets (32-character placeholders) and `OTP_DUMMY_ENABLED=true` (published as `127.0.0.1:4000`); every published port binds to `127.0.0.1` (D-056). The seed and the locations loader are idempotent (T1.3: a second run changes nothing), so a repeated `docker compose up` is safe; when `migrate` fails, `api` and `web` stay down and the README checklist names `docker compose logs migrate` as the first step.
- **Tests:**
  - integration (manual, documented as a checklist in the README): fresh clone → `docker compose up` → http://127.0.0.1:3000/login works with a demo account; `docker compose up -d postgres minio mailpit` then `pnpm dev` works as before.
  - existing: none for compose files; `env.spec.ts` guards the production values.
- **Done when:** both paths were run on this machine and the README shows them.
- **Depends on:** U7 · **Size:** M · **Risk area:** none
- **Status:** todo

### U10. Minimal template and the `@/ui` contract in the web app
- **Goal:** The Minimal template is in the repository behind the org component contract, type-checked, linted and tested, without touching any existing screen or the main bundle.
- **Requirements:** R8, R11
- **Files:** `apps/web/src/ui/{contract.ts,tokens.ts,index.ts}`, `apps/web/src/ui/templates/minimal/**` (copied from `kit/templates/minimal/src`), `apps/web/public/minimal/**` (copied assets), `apps/web/src/ui/templates/minimal/contract.test.tsx`, `apps/web/src/ui/templates/minimal/{UPSTREAM.md,LICENSE.md}` (copied), `apps/web/package.json` (the template dependencies of `template.json`), `packages/config/eslint.config.mjs` (restricted imports), `apps/web/test/ui-imports.test.ts`
- **Approach:** Copy as `template.json` describes; add Bornomala to the theme's `fontFamily` fallback in `src/ui/templates/minimal/theme/theme-config.ts` (the only edit, listed in UPSTREAM.md); `src/ui/index.ts` exports the Minimal implementation; nothing imports `@/ui` yet except the tests; the copy is pinned to the kit's UPSTREAM.md version and checked for `localStorage`, `sessionStorage` and `dangerouslySetInnerHTML` (none expected); `pnpm audit` covers the new dependencies. Gate: starts only after the owner confirms the Minimal licence (Open questions).
- **Tests:**
  - unit: the template's `contract.test.tsx` (every contract component renders, main interaction, empty and error states) runs in the web Vitest project; ESLint fails on a probe file importing `@mui/material` outside the template folder (`apps/web/test/ui-imports.test.ts` through the ESLint API, like `no-literal-ui-text.test.ts`).
  - existing: `pnpm build` size report: the `index` chunk gzip unchanged (within 2 KB) and no MUI chunk until U11.
- **Done when:** typecheck, lint and the two tests pass; the build output is unchanged.
- **Depends on:** none (the web app does not depend on the backend port; the licence gate applies) · **Size:** L · **Risk area:** none
- **Status:** todo

### U11. Admin area on the Minimal shell
- **Goal:** Department Head, Monitoring Team and PM open `/admin` in the Minimal shell with a placeholder dashboard; everyone else sees the forbidden screen; the rest of the app is unchanged.
- **Requirements:** R7, R9, R10, R11, R12
- **Files:** `apps/web/src/admin/{AdminLayout,AdminProviders,AdminHeaderActions,DashboardPage,navigation}.tsx`, `apps/web/src/admin/admin.test.tsx`, `apps/web/src/routes/index.tsx` (lazy `/admin` subtree), `apps/web/src/features/account/HomeView.tsx` (an "Admin" link for the three roles), `packages/shared/src/i18n/messages/{bn,en}/admin.json` (namespace `admin`: nav, dashboard placeholder, forbidden, phone notice), `packages/shared/src/i18n/catalogue.ts`, `apps/web/e2e/admin.spec.ts`
- **Approach:** `AdminLayout` = `RequireAuth` → role check → Minimal `UiProvider` → `AppShell` (navigation from `navigation.tsx`; header actions from `AdminHeaderActions.tsx` built on the contract: user name as `Text`, language as `SelectField`, log out as `Button`) → `<Outlet/>`; `DashboardPage` uses `Page`, `Heading`, `Text` and `Alert` from `@/ui`; the UX-04 notice is a contract `Alert` shown under 768 px; titles through `DocumentTitle`.
- **Tests:**
  - unit (RTL, MSW): a Department Head sees the shell with the nav item "Dashboard" / "ড্যাশবোর্ড" and the heading; a volunteer sees the forbidden screen; the language switch re-renders the shell in English; axe in bn and en.
  - e2e (`apps/web/e2e/admin.spec.ts`; one account per project because the projects share the database: desktop `head@example.org` and volunteer `01700000111`, mobile `monitoring@example.org` and volunteer `01700000112`): sign in → `/` shows the link "অ্যাডমিন" → `/admin` shows the heading "ড্যাশবোর্ড" inside a sidebar with the item "ড্যাশবোর্ড" and the user's name; the placeholder shows a date as `11-10-2026` (English digits, UX-05) and the Bengali heading's computed font family contains Bornomala (R10); no network request leaves the origin (icons offline); axe at 1280×800 has no violations; on mobile the notice "এই পর্দা বড় স্ক্রিনে ভালো চলে" is visible; the volunteer at `/admin` sees "এই পাতায় আপনার প্রবেশাধিকার নেই"; log out from the shell returns to `/login?ended=logout`.
  - existing: `apps/web/e2e/{home,auth,gallery}.spec.ts` unchanged; the build size report (index chunk unchanged, admin chunk listed).
- **Done when:** the tests above pass and `pnpm build` lists the admin chunk separately with the index chunk within 2 KB of U10.
- **Depends on:** U10 · **Size:** M · **Risk area:** auth
- **Status:** todo

### U12. Design and screen documentation of the admin area
- **Goal:** The documents say which screens use Minimal, why, and what the deviation from the brand is.
- **Requirements:** R7 (documentation side)
- **Files:** `docs/ui/DESIGN_SYSTEM.md` (new section "Admin area on Minimal"), `docs/ui/SCREENS.md` (SCR-017, SCR-050 and the management rows: UI = Minimal), `docs/ui/DESIGN_BRIEF.md` (owner decision UX-15), `docs/DECISION_LOG.md` (UX-15, D-075), `docs/STATUS.md`, `CLAUDE.md` (UI rule line)
- **Approach:** Record the owner's three answers (dashboards and settings only; Minimal as it comes; Bornomala fallback) as UX-15 and D-075, together with the recorded deviations (RE-UI-01 outside `/admin`, ST-21 and ST-31 through pnpm, the SPA CSP decision deferred to T3.0).
- **Tests:** existing: `pnpm docs:check`, Prettier.
- **Done when:** the documents are consistent and the plan's status is done.
- **Depends on:** U11 · **Size:** S · **Risk area:** none
- **Status:** todo

## Checkpoints
- **Mode:** grouped (one by one 8, added to grouped because N > 4; grouped 16; all at once 0)
- **Signals:** N 12, L 2,400, R 4 (U4 auth, U5 file storage, U7 migrations, U11 auth), Fd 2 (U3, U7), C 7, P 2 (U9, U10)
- **C1** after U3: foundation for U4 and U5 (route registry, limiters, audit wrapper); U2 reviewed with it (800 lines since start)
- **C2** after U4: risk unit (auth) that U6 depends on
- **C3** after U5: risk unit (file storage)
- **C4** after U7: risk unit (migrations) and foundation for U8 and U9; U6 reviewed with it
- **C5** after U9: new pattern (one-command compose); U8 reviewed with it
- **C6** after U10: new pattern (Minimal template, lint rule)
- **C7** after U12: end; U11 (auth risk) reviewed here with its documentation

## Verification
- `pnpm lint` · `pnpm typecheck` · `pnpm test` · `pnpm build` · `pnpm e2e` · `pnpm docs:check` · `pnpm audit --audit-level high`
- `pnpm --filter @css/api build && node apps/api/dist/server.js` with the dev `.env`, then `curl http://127.0.0.1:4000/health/ready`
- `docker compose down -v && docker compose up`, then http://127.0.0.1:3000/login with `head@example.org`
- `pnpm --filter @css/web build`: the chunk table shows `index` within 2 KB of T1.7b (187 KB gzip), one `admin` chunk and no gallery chunk

## Risks and rollback
- **Port drift** (U2 to U6): the characterization suite of U1 is the guard; every unit keeps the old Nest app runnable until U6, so a step can be abandoned by deleting the new files. Rollback after U6: revert the U6 commit (the Nest dependencies return through the lockfile).
- **PostgreSQL 17** (U7): no production data; local volumes are recreated; CI changes are two image lines. Rollback: restore the 16 digest.
- **Presigned URLs removed** (U5): no screen uses them yet; T2.1 designs the streaming. Rollback: restore `minio-storage.ts` from git.
- **Minimal licence** (U10): nothing is copied before the owner confirms that the licence covers this project.
- **Two UI systems** (U11): the admin chunk is isolated by the lint rule and the lazy route; the build output proves that MUI loads only on `/admin`.

## Definition of done
- All units done and their tests pass
- Verification commands pass
- `ae-review` has run, with no open P0 or P1
- Code from abandoned attempts is removed

<!-- ae-work adds this while status is in-progress, and removes it at done -->

## Progress
- **Branch:** `migrate/org-stack-admin-minimal`
- **Updated:** 2026-10-11 18:05
- **Next:** U1, run the characterization suites and list them here
- **Uncommitted:** none
- **Reviewed through:** none yet
- **Notes:** The owner pushes `main` manually and does not open pull requests; this branch is merged into `main` by the owner (fast-forward) when the plan is done, or earlier at a checkpoint on request. U10 to U12 wait for the owner's confirmation of the Minimal licence.
