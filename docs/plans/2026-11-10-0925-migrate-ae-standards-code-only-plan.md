---
title: Bring the repo to the As-Sunnah standards, the code-only part
type: migrate
status: in-progress
source: plan
date: 2026-11-10
doc_review: 2026-11-10
---

# Bring the repo to the As-Sunnah standards, the code-only part

## Goal
The API answers the standard health probes and shuts down in the standard order, can store files on the NAS once IT mounts it, tells a volunteer plainly why an old draft can't be sent, and the web app's view of every API response is checked against the running API.

## Problem
The small part of the standards (D-167, plan `docs/plans/2026-11-09-1215-migrate-ae-standards-small-plan.md`) is merged. The remaining mismatches split into ones that need something from outside (asf-auth's source, new repositories, IT's NAS mount, the owner's Docker settings) and ones that need only code. On 2026-11-10 the owner chose to plan four code-only items together:

1. Health probes and the shutdown order (NE-ERR-04, NE-ERR-05).
2. A clear message when a draft made on an older form version is sent: today the send answers 422 `validation.failed` with one detail `{ path: 'answers', code: 'validation.option_unknown' }`, so the volunteer reads "কিছু তথ্য সঠিক নয়" and nothing else (the owner hit it on 2026-11-09).
3. The NAS storage driver (NS-30 to NS-35, NS-50), ready for the mount that comes with the staging task.
4. The web API contract test (ST-24, TS-04, ST-07).

## Requirements
- **R1** The API serves `/api/v1/healthz` and `/api/v1/livez` (liveness, never touching a dependency) and `/api/v1/readyz` (readiness) for `GET` and `HEAD`, with `Content-Type: application/health+json`, `Cache-Control: no-store`, a body of `status` alone (`pass`, `warn` or `fail`), no authentication, mounted before the rate limiters and left out of the request log; which check failed goes only to the log (NE-ERR-05, CWE-200).
- **R2** Readiness checks the database and the job queue (critical: `fail`, 503) and the file store (non-critical: `warn`, 200) in parallel, each with a 2 s limit, and probes that arrive together share one run (NE-ERR-05).
- **R3** On `SIGTERM` the API makes readiness answer 503 at once, keeps serving for `SHUTDOWN_DELAY_MS` (default 0), stops accepting connections, finishes in-flight requests, then closes the job queue, the PDF browser and the database, and forces the exit after a fixed grace period; the worker forces its exit after the same kind of grace period (NE-ERR-04).
- **R4** Every caller of the old `/health/live` and `/health/ready` uses the new paths (the compose healthcheck, the Playwright web server, the documents), and the old paths and `HEALTH_TOKEN` are gone.
- **R5** `STORAGE_DRIVER` is `nas` or `s3`. The `nas` driver stores under `STORAGE_ROOT` (absolute, allowed in production), refuses any key that resolves outside the root, and its `ping` checks the root is readable and writable. The test-only `filesystem` name and `STORAGE_FS_ROOT` are gone; a start with either is refused with a message naming the new one (NS-02, NS-30 to NS-35).
- **R6** Every file row records the driver it was stored with, and a copy script moves the files of one driver to another, row by row, idempotently, updating each row's driver after its copy (NS-05, NS-50).
- **R7** When an application is sent with an answer that is no longer in its list (a coded column such as gender, marital status, education or relationship whose option came from an older form version), the API answers with its own error code naming the question, and the volunteer's screen says which question and what to do next; the reason survives the offline outbox and the sync centre.
- **R8** The API serves its OpenAPI document at `/api/v1/openapi.json`, listing shapes and no data: public outside production, and in production only to a signed-in person (NE-REQ-06, ST-24; owner, 2026-11-10).
- **R9** The web app has a zod schema for every API response it reads; the TypeScript types the pages use are derived from those schemas (ST-07).
- **R10** `pnpm --filter @css/web test:contract` signs in with the demo accounts and parses real responses of a running API with those schemas; it reads the API's address from `CONTRACT_API_URL` and skips when that is unset; a coverage check fails when a web call has no contract case; CI runs it on pushes to `develop` and `main` against the seeded API (ST-24, TS-04).

## Scope
- In: the ten requirements, the documents they change (SYSTEM_ARCHITECTURE, DEPLOYMENT, RUNBOOK, FILES_AND_DOCUMENTS, TEST_STRATEGY, API_STANDARDS, openapi.yaml, CLAUDE.md commands and repository map, `.env.example`, the error catalogue), the decision record.
- Out (not now): moving the real files to the NAS and its mount (with the staging task T3.0); SeaweedFS in place of MinIO in dev (NS-20); asf-auth and the refresh cookie's path; two repositories (ST-20, ST-21); forms on react-hook-form (RE-CMP-03, RE-CMP-04); ESM for the backend; moving an old draft onto the newer form version (R7 only explains; the volunteer deletes the draft and starts again, as worked on 2026-11-09).

## Key decisions
- **The four items in one plan** (owner, 2026-11-10: "১ থেকে ৪ একসঙ্গে plan করো").
- **The contract test covers every response the web reads, in this plan** (owner, 2026-11-10: "সব উত্তর একবারে"), not a starting set. Governs R9 and R10.
- **The OpenAPI document needs a sign-in in production** (owner, 2026-11-10, after the plan's security review): NE-REQ-06 allows it public, but the route map of the admin and permission screens is not handed to strangers; dev, test, CI and staging keep it public for the contract test. Recorded in the decision log as a deviation. Governs R8.
- **The standard probe paths replace ours** (owner, 2026-11-10, item 1 of the list: the health check paths brought to the standard; D-167 converts every mismatch): `docs/architecture/BACKEND_STANDARD_MIGRATION.md` recorded "Keep our paths (Caddy and the IT check use them)"; nothing is deployed yet, so no IT check uses them, and Caddy already sends `/api/v1/*` to the API. The row is updated in U1.
- **An old draft is explained, not migrated** (follows the owner's 2026-11-09 walk-through, where deleting the old draft and starting again worked). Governs R7.

## Technical decisions
- **Stack profile unchanged** (ST-40 to ST-45): no new runtime dependency. zod is already in `apps/web` (offline store) and `packages/shared`; the NAS driver is `node:fs` only; the contract test runs on Vitest. CLAUDE.md's Stack profile keeps its lines except Storage, whose "filesystem driver for tests" becomes "NAS driver (`nas`, tests use it on a temporary root)", a profile change recorded in U3's decision entry (ST-43); its repository map and commands gain the probes, `nas`, `storage:copy` and `test:contract` (ST-43).
- **Probes in their own router under `/api/v1`, outside `defineRoute`** (NE-ERR-05): `apps/api/src/health/routes.ts` keeps one router, mounted in `app.ts` where it is now (after the request context, before the rate limiters); pino-http's `autoLogging.ignore` in `apps/api/src/core/logging.ts` (today only `/health/live`) lists the three probe paths, so they leave no request log line; `HEAD` is declared, not left to Express's GET fallback. `openapi.yaml` documents the three paths under a `health` tag with the `application/health+json` schema; the drift test (`apps/api/test/api/openapi-drift.test.ts`) gets one named list of operations served outside the registry (the probes), so any other unregistered path still fails it. Caddy already sends `/api/v1/*` to the API, so the probes work through it without a change (DEPLOYMENT.md).
- **Critical and non-critical checks** (NE-ERR-05): `HealthService` (`apps/api/src/health/service.ts`) keeps its 2 s limit and shared run, and marks each check `critical` (database, queue, both PostgreSQL) or not (storage; only file routes need it). A down storage gives `warn` with 200. A finished result is reused for 2 s, so a flood of unauthenticated probes costs at most one round of pings per window (NE-ERR-05 keeps the probes unlimited for the orchestrator). The check name and the error's class or code go to the log at `warn`/`error`, never a raw driver message or a URL with its userinfo (NE-LOG-02, NE-CFG-03); the response body is `{ "status": … }` only, and `HEALTH_TOKEN` (the bearer that showed details) is removed from the schema, `.env.example` and DEPLOYMENT, since NE-ERR-05 allows more detail only behind an admin session and the system health page (`/admin/system`) already serves that.
- **Shutdown as one testable function** (NE-ERR-04): `server.ts`'s `shutdown` moves into `apps/api/src/shutdown.ts` as `createShutdown({ health, server, closeContainer, delayMs, graceMs, exit, log })`, so a unit test drives the order with fakes. `health.markShuttingDown()` makes readiness `fail` (503) at once. `SHUTDOWN_DELAY_MS` joins the env schema (integer, default 0). The existing `SHUTDOWN_GRACE_MS = 35_000` stays under compose's `stop_grace_period: 40s`. The worker gets the same forced-exit timer.
- **`nas` replaces `filesystem`** (NS-30 to NS-35): the existing `apps/api/src/storage/drivers/filesystem.ts` is already a folder driver with a `.part` write and rename and a `.meta.json` sidecar for the content type; it becomes `drivers/nas.ts` with `name: 'nas'`, the root from `STORAGE_ROOT`, and a containment check on every operation (put, get, stat, remove), on top of `assertKey`: the lexical check (the path relative to the root must not start with `..` or be absolute), then `fs.realpath` of the deepest existing folder of the target, which must stay under `realpath(STORAGE_ROOT)`, and `lstat` refusing a symlink at the target on read and remove (NS-02, NE-SEC-07); a symlink inside the NAS share can't lead outside it. `ping(signal)` is `fs.access(root, R_OK | W_OK)` (NS-31); the S3 driver's `ping` takes the signal too. `StorageDriver['name']` becomes `'nas' | 's3'`, and the S3 parts keep their `TEMP:` markers (NS-35). Production accepts `nas` with an absolute `STORAGE_ROOT`. The tests and `scripts/e2e-server.ts` use `nas` with a temporary root, as they used `filesystem`.
- **One driver column** (NS-05): only `files` holds permanent objects (thumbnails are keys on the same row; an export's file is a `files` row; `upload_sessions` and their parts are temporary and expire), so the migration adds `files.storage_driver text not null default 's3'` with a check (`'nas'`, `'s3'`), which fills every existing row correctly (every file stored so far is on MinIO), and then drops the default in the same migration, so a writer that forgets the driver fails at once instead of recording `s3` silently. Every write of a `files` row sets it from `storage.name`. Hand-written `down.sql` drops the column (DB-MIG-05).
- **The copy script** (NS-50): `apps/api/scripts/storage-copy.ts`, run as `pnpm --filter @css/api storage:copy --from s3 --to nas [--dry-run] [--limit n]`. `--from` and `--to` must differ. It parses the environment with the normal schema once for each side, with `STORAGE_DRIVER` overridden to that side's name, and builds each driver with `createDriver(name, env)` (a new export of `storage/index.ts` beside `createStorage`), so both drivers' settings must be set while it runs. The logic in `src/storage/copy.ts` takes the two driver instances and their names separately (`copyFiles({ from, fromName, to, toName, … })`), so a test can stand two folder drivers in for `s3` and `nas`. It reads `files` rows whose driver is `fromName` in id order in batches, copies the object and its thumbnails with `get`→`put` (streams, NS-04), checks with the target's `stat` that each copy's size equals the source's (and the row's recorded size for the main object), then updates the row's driver; a size mismatch or a failed stream leaves the row on the source and is reported; a row whose object is missing is reported and left as it is; a second run copies nothing. It never deletes from the source. It writes an audit entry per batch (`storage.copied`, SECURITY_POLICY audit map), and is not behind the dev database guard, because its job is production; it changes no business data.
- **An answer no longer in its list** (R7): `submission.ts` `createProfile` already turns the foreign-key violation into a 422; `core/db-errors.ts` reads the violated constraint, which names the coded column; the service maps the column to the standard field it fills (`split.ts` in `@css/shared/forms`) and to that question's label in the record's version, and raises `ApiError('application.answer_not_in_list', 422, { question }, [{ path: 'answers.<fieldKey>', code: 'validation.option_unknown' }])`. bn and en messages in `errors.json` name the question and say to delete the draft and start a new application. On the web, the outbox row keeps the failure's params beside `failureCode` (`apps/web/src/offline/applications-store.ts`; an optional field of the sealed row's zod schema, no Dexie index, so no store version bump), and `reasonOf` passes them to the message.
- **`/api/v1/openapi.json`** (NE-REQ-06): one `defineRoute` operation, `getOpenApiDocument`, in `apps/api/src/routes/openapi.ts`, registered in `app.ts` with the other route modules (as `routes/settings.ts` is), rate-limit class `reference-read`; its access is public when `NODE_ENV` is not production and any signed-in session (no permission) in production, decided once at startup, the same rule in the registry so `authz:matrix` shows it; returning `buildOpenApiDocument(registry)` built once after every route is registered (the registry does not change while the process runs, so the cache needs no invalidation); documented in `openapi.yaml` like every other operation.
- **Web response schemas** (ST-07, RE-CMP-04): one schema module per area in `apps/web/src/api/schemas/` (for example `applications.ts`, `projects.ts`) with an `index.ts`; each `*-api.ts` module imports its types as `z.infer` of the schema, replacing its hand-written interfaces, so a page and the contract test read the same shape. Pages import types only, so the schemas stay out of the production bundle (`import type`); the first-route budget of 400 KB is checked with `bundle:report`. Shapes the web shares with the API through `@css/shared` stay there (an old combined repo keeps `packages/shared`, ST-07).
- **The contract harness** (ST-24, TS-04): `apps/web/tests/contract/` with its own `vitest.contract.config.mts` (node environment), script `test:contract`; a helper signs in with the demo accounts of `docs/testing/DEMO_ACCOUNTS.md` and the dummy OTP (test values; the dummy OTP is already refused in production by `env.ts`, and the demo accounts exist only through the dev seed); before anything, the helper refuses a `CONTRACT_API_URL` whose host is not a loopback address (`127.0.0.1`, `::1`, `localhost`), because the cases write (approvals, grants, a nisab version, a published form) and must never reach a shared server; sends the app's `Origin` (the origin check of D-167), and `expectContract(operationId, response, schema)` parses each body with `schema.parse` and records the operation id. A coverage test lists every `api<…>(…)` call path of `apps/web/src` (method and path template, read by a small parser, the same idea as `apps/api/scripts/contract-coverage.ts`) and fails on a call no case covers. Every suite is `describe.skipIf(!process.env.CONTRACT_API_URL)`. Cases that write run in an order that creates what they read, on the fresh e2e database.
- **CI** (TS-04): the E2E job (pushes to `develop` and `main`) starts `pnpm --filter @css/api e2e:server` in the background on port 4100 before Playwright, waits for `/api/v1/readyz`, runs `CONTRACT_API_URL=http://127.0.0.1:4100 pnpm --filter @css/web test:contract`, and stops the server; Playwright then recreates the database for its own run.

## Implementation units

### U1. Health probes under `/api/v1`
- **Goal:** the three standard probes replace `/health/live` and `/health/ready`.
- **Requirements:** R1, R2, R4
- **Files:** `apps/api/src/health/routes.ts`, `apps/api/src/health/service.ts`, `apps/api/src/app.ts`, `apps/api/src/container.ts`, `apps/api/src/config/env.ts`, `apps/api/.env.example`, `infra/docker-compose.app.yml`, `apps/web/playwright.config.ts`, `apps/api/src/core/logging.ts`, `docs/api/openapi.yaml`, `apps/api/test/api/openapi-drift.test.ts`, `apps/api/test/api/health.api.test.ts`, `apps/api/test/api/health-ready.api.test.ts`, `apps/api/test/api/cors.api.test.ts`, `apps/api/test/api/core.api.test.ts`, `apps/api/src/health/service.spec.ts`, `.github/workflows/ci.yml`, `README.md`, `CLAUDE.md`, `docs/architecture/SYSTEM_ARCHITECTURE.md`, `docs/architecture/BACKEND_STANDARD_MIGRATION.md`, `docs/ops/DEPLOYMENT.md`, `docs/ops/RUNBOOK.md`, `docs/DECISION_LOG.md`
- **Approach:** extend the existing `healthRouter` and `HealthService` (shared run and 2 s limit already there); mount the router before `requestLogging` in `app.ts`; follow the standard's wording in NE-ERR-05.
- **Tests:**
  - unit: `service.spec.ts`: a down storage gives `warn`, a down database or queue gives `fail`, checks run in parallel (a slow check doesn't delay another's result), a second caller during a run gets the same result.
  - integration: `health.api.test.ts`: `GET` and `HEAD` of `/api/v1/healthz` and `/api/v1/livez` answer 200 `{"status":"pass"}` with `application/health+json` and `no-store`, even with the database stand-in down; `/health/live` answers 404. `health-ready.api.test.ts`: all up gives 200 `pass`; storage down 200 `warn`; database down 503 `fail`; the body never holds a check name, with or without an `Authorization` header; a probe produces no request log line (a pino destination in the test); probes are not rate-limited (more calls than the strictest limit pass); a second probe within 2 s reuses the first result (the database stand-in is called once); a failed check whose error text holds `user:password@` leaves no password in the log line.
  - existing: covered by `apps/api/test/api/health.api.test.ts`, `health-ready.api.test.ts` and `src/health/service.spec.ts`; update them in place.
- **Done when:** the tests pass; `docker compose up` shows the api healthy through the new path; `grep -rn "health/live\|health/ready\|HEALTH_TOKEN"` finds only the decision record and history.
- **Depends on:** none
- **Size:** M
- **Risk area:** none
- **Status:** done

### U2. The shutdown order
- **Goal:** SIGTERM flips readiness first, waits the delay, then drains and closes in order, with a forced exit in the API and the worker.
- **Requirements:** R3
- **Files:** `apps/api/src/shutdown.ts` (new), `apps/api/src/shutdown.spec.ts` (new), `apps/api/src/server.ts`, `apps/api/src/worker.ts`, `apps/api/src/health/service.ts`, `apps/api/src/config/env.ts`, `apps/api/.env.example`, `docs/ops/DEPLOYMENT.md`
- **Approach:** move the body of `server.ts`'s `shutdown` into `createShutdown(deps)`; keep `closeContainer` (`container.ts`) as the close step; follow the existing forced-exit timer.
- **Tests:**
  - unit: `shutdown.spec.ts` with fake timers and fakes: readiness reports shutting down before anything else; `server.close` is called only after `SHUTDOWN_DELAY_MS`; `closeContainer` runs after `close` resolves; a second signal does nothing; a close that hangs ends in `exit(1)` at the grace period; a clean run exits 0. The worker's shutdown exits 1 when `closeContainer` hangs past its grace.
  - integration: `health-ready.api.test.ts`: after `markShuttingDown()`, `/api/v1/readyz` answers 503 `fail` while `/api/v1/healthz` still answers 200.
  - existing: none for the shutdown order, and today's `shutdown` runs at module level beside `listen`, so it can't be imported. The characterization is `shutdown.spec.ts` itself: its first cases pin today's order (close, then the container, the forced exit at the grace period) against `createShutdown` with delay 0, written and passing before the delay and readiness-flip cases are added.
- **Done when:** the spec passes; a manual `docker compose stop api` logs the readiness flip, then the close, then "shutting down" ends without the forced exit.
- **Depends on:** U1
- **Size:** S
- **Risk area:** none
- **Status:** done

### U3. The NAS driver
- **Goal:** `STORAGE_DRIVER=nas` stores files under `STORAGE_ROOT` with path containment and a readiness ping; the `filesystem` name is gone.
- **Requirements:** R5
- **Files:** `apps/api/src/storage/drivers/filesystem.ts` → `apps/api/src/storage/drivers/nas.ts`, `apps/api/src/storage/drivers/filesystem.spec.ts` → `nas.spec.ts`, `apps/api/src/storage/drivers/s3.ts`, `apps/api/src/storage/index.ts`, `apps/api/src/storage/types.ts`, `apps/api/src/config/env.ts`, `apps/api/src/config/env.spec.ts`, `apps/api/test/support/env.ts`, `apps/api/scripts/e2e-server.ts`, `apps/api/scripts/openapi-generate.ts`, `apps/api/scripts/perf-exports.ts`, `apps/api/src/auth/auth.spec.ts`, `apps/api/src/files/parts.spec.ts`, `apps/api/test/integration/registration-photos.test.ts`, `apps/api/.env.example`, `CLAUDE.md` (the Storage line of the Stack profile), `docs/ops/DEPLOYMENT.md`, `docs/architecture/FILES_AND_DOCUMENTS.md`, `docs/DECISION_LOG.md`
- **Approach:** rename and extend the filesystem driver; the env rename and its refusal follow `CORS_ORIGINS` → `ALLOWED_ORIGINS` in `env.ts` (D-167).
- **Tests:**
  - unit: `nas.spec.ts`: put, get, stat and remove round trip under a temporary root; a key that would resolve outside the root (`a/../../x` built past `assertKey` through a crafted bucket) is refused with no file written; a folder inside the root that is a symlink to a folder outside it is refused on put, get, stat and remove (realpath), and a symlinked object is refused on get and remove (lstat); `ping` passes on a writable root and fails on a missing or read-only one within its signal; remove of a missing key succeeds. `env.spec.ts`: production starts with `nas` and an absolute root; a relative root, `STORAGE_DRIVER=filesystem` and `STORAGE_FS_ROOT` are refused, each naming the new setting; `nas` without `STORAGE_ROOT` is refused.
  - integration: the whole API and database suites run on the `nas` driver through `test/support/env.ts` (the uploads, files, exports and photo tests are the proof the rename broke nothing); `storage.test.ts` keeps the S3 driver on MinIO.
  - existing: covered by `apps/api/src/storage/drivers/filesystem.spec.ts`, `types.spec.ts` and `apps/api/test/integration/storage.test.ts`; rename and extend, don't duplicate.
- **Done when:** the tests pass and `grep -rn "filesystem\|STORAGE_FS_ROOT" apps/api` finds only the refusal message and its test.
- **Depends on:** U1
- **Size:** M
- **Risk area:** file storage
- **Status:** done

### U4. The driver column and the copy script
- **Goal:** every file row says where it lives, and one script copies the files of one driver to another.
- **Requirements:** R6
- **Files:** `apps/api/prisma/schema.prisma`, `apps/api/prisma/migrations/<timestamp>_file_storage_driver/{migration.sql,down.sql}`, the four writers of `files` rows (`apps/api/src/services/uploads.ts`, `apps/api/src/jobs/export-run.ts`, `apps/api/src/services/registration-photos.ts`, `apps/api/src/services/public-photos.ts`), `apps/api/src/storage/index.ts` (`createDriver`), `apps/api/scripts/storage-copy.ts` (new), `apps/api/src/storage/copy.ts` (new, the logic the script calls), `apps/api/test/integration/storage-copy.test.ts` (new), `apps/api/package.json`, `docs/database/DATABASE_SCHEMA.md`, `docs/ops/RUNBOOK.md`, `docs/security/SECURITY_POLICY.md` (audit map)
- **Approach:** migration with a hand-written `down.sql` like `20261107120000_location_post_codes`; the script follows `apps/api/scripts/load-locations.ts` (env file, `tsx`, exit codes), with its logic in `src/storage/copy.ts` so the test calls it directly.
- **Tests:**
  - unit: none (the copy logic needs a database and two drivers; it is proven in integration).
  - integration: `storage-copy.test.ts` on a cloned database with two folder drivers on separate temporary roots passed to `copyFiles` as `fromName: 's3'` and `toName: 'nas'` (the copy goes through the `StorageDriver` interface only): rows on the source with an object and two thumbnails are copied, each row's driver becomes `nas`, the source objects stay; a second run copies nothing; a target whose stream fails or truncates leaves the row on `s3` and is reported; `--from` equal to `--to` is refused; `--dry-run` copies nothing and reports the count; a row whose object is missing is reported and keeps its driver; one audit entry per batch. The upload and export tests assert a new `files` row records `nas` (the test driver); an insert without the driver fails (the default is dropped).
  - existing: none for the driver column, characterize first: assert in the existing upload test that a stored file's row is readable before the migration adds the column.
- **Done when:** migration and `down.sql` apply and revert on a copy of the dev database; the copy test passes; `pnpm --filter @css/api storage:copy --from s3 --to nas --dry-run` on the dev database reports the row count and copies nothing.
- **Depends on:** U3
- **Size:** M
- **Risk area:** migration
- **Status:** done

### U5. A plain reason for an answer no longer in its list
- **Goal:** sending a draft whose coded answer is no longer valid names the question and says to delete the draft and start again.
- **Requirements:** R7
- **Files:** `apps/api/src/applications/submission.ts`, `apps/api/src/core/db-errors.ts`, `packages/shared/src/i18n/messages/{bn,en}/errors.json`, `apps/api/test/integration/applications.test.ts` (or `application-cycle.test.ts`), `apps/web/src/offline/applications-store.ts`, `apps/web/src/offline/sync-engine.ts`, `apps/web/src/features/applications/ApplicationFormPage.tsx`, `apps/web/src/features/sync/RecordRow.tsx`, `apps/web/src/features/applications/applications.test.tsx`, `apps/web/src/features/applications/offline.test.tsx`, `docs/BUSINESS_RULES.md` (a new rule line), `docs/api/openapi.yaml` (the error code on the submit operation)
- **Approach:** follow `isForeignKeyViolation` in `core/db-errors.ts` and the error rendering of `apps/api/src/http/errors.ts`; the outbox field follows `failureCode` in `applications-store.ts`. Bengali text through `ae-bangla-copy`.
- **Tests:**
  - unit: `db-errors` reads the column of a coded-column foreign key from a Prisma error and returns nothing for another constraint.
  - integration: a draft on a form version whose gender question has its own option code is sent: 422 `application.answer_not_in_list`, the detail path names the gender question, the message (bn and en) names its label, no profile row is created; a valid draft still goes through; another volunteer's draft answers 404 as before.
  - e2e: none. The message is the only change in the flow, and the case needs a form version with its own codes that the builder no longer makes (D-163); the component tests prove the screen.
  - component: `applications.test.tsx`: a send that fails with `application.answer_not_in_list` shows "লিঙ্গ" in the reason and the delete action stays offered; `offline.test.tsx`: the same failure through the outbox keeps the question's name on the sync centre row after a reload.
  - existing: none for this failure, characterize first: a case that pins today's generic "কিছু তথ্য সঠিক নয়" on this failure, then changed by the unit.
- **Done when:** the tests pass; on a copy of the dev database the owner's old IDPP draft shows the new message on the phone.
- **Depends on:** none
- **Size:** M
- **Risk area:** none
- **Status:** done

### U6. The OpenAPI document and the contract harness
- **Goal:** the API serves `/api/v1/openapi.json`; the web has `test:contract` with its sign-in helper, the coverage check and the CI step, and the schemas of the sign-in and session responses.
- **Requirements:** R8, R9 (sign-in and session part), R10
- **Files:** `apps/api/src/routes/openapi.ts` (new), `apps/api/src/app.ts`, `docs/api/openapi.yaml`, `apps/api/test/api/openapi-json.api.test.ts` (new), `apps/web/vitest.contract.config.mts` (new), `apps/web/package.json`, `apps/web/tests/contract/support/{session.ts,expect.ts,calls.ts}` (new), `apps/web/tests/contract/support/session.spec.ts` (new), `apps/web/tests/contract/coverage.contract.test.ts` (new), `apps/web/tests/contract/session.contract.test.ts` (new), `apps/web/src/api/schemas/{index.ts,session.ts}` (new), `apps/web/src/api/client.ts`, `apps/web/tsconfig.json` (include `tests`), `.github/workflows/ci.yml`, `docs/testing/TEST_STRATEGY.md`, `CLAUDE.md`, `CONTRIBUTING.md`
- **Approach:** the route follows any public `defineRoute` operation (for example the public settings in `routes/settings.ts`); the coverage parser follows `apps/api/scripts/contract-coverage.ts`; the sign-in follows `apps/web/e2e/support/admin.ts` `signIn` but through `fetch`. No existing web contract test: a new pattern.
- **Tests:**
  - unit: `session.spec.ts`: a `CONTRACT_API_URL` on a host other than loopback (a LAN address, a staging name) is refused before any request. `calls.ts` parser: finds `api<…>('/me/profile')`, a template path with `${id}`, a call with a method option, and ignores test files.
  - integration: `openapi-json.api.test.ts`: `GET /api/v1/openapi.json` answers 200 without a session outside production, its `paths` equal the registry's, and it holds no example values from the seed; with the production setting it answers 401 without a session and 200 with any signed-in volunteer.
  - contract: `session.contract.test.ts` against `CONTRACT_API_URL`: login, `GET /me`, refresh, logout and the public settings parse; with the variable unset the run reports the suites skipped and exits 0. `coverage.contract.test.ts` lists the calls not yet covered (allowed in this unit by an explicit list of the areas U7 to U10 cover, emptied by U10).
  - existing: covered by `apps/api/test/api/openapi-drift.test.ts` for the document's content.
- **Done when:** `pnpm --filter @css/web test:contract` skips cleanly without the variable and passes against `pnpm --filter @css/api e2e:server`; CI's E2E job has the step (seen running on the first push to `develop` after the merge).
- **Depends on:** U1, U3 (the CI step waits on `/api/v1/readyz`, and `e2e:server` runs on the `nas` driver)
- **Size:** L
- **Risk area:** none
- **Status:** done

### U7. Schemas of the volunteer's and the person's own screens
- **Goal:** every response read by `apps/web/src/features/**` and `lib/`, `offline/`, `components/` has a schema, a type derived from it and a contract case.
- **Requirements:** R9, R10
- **Files:** `apps/web/src/api/schemas/{registration,projects,applications,forms,home,notifications,account,exports,media,sync,uploads,files}.ts`; the API modules they type: `features/registration/registration-api.ts`, `features/projects/my-projects-api.ts`, `features/applications/applications-api.ts`, `features/forms/public-api.ts`, `features/home/home-api.ts`, `features/notifications/notifications-api.ts`, `features/account/profile-api.ts`, `features/account/{ChangePasswordView,SessionsView}.tsx`, `features/auth/{InvitePage,ResetForm}.tsx`, `features/exports/exports-api.ts`, `features/media/media-api.ts`, `offline/sync-api.ts`, `lib/uploads.ts`, `lib/public-settings.ts`, `components/{FileImage,LanguageSwitch}.tsx`; `apps/web/tests/contract/volunteer.contract.test.ts`, `apps/web/tests/contract/account.contract.test.ts`, `apps/web/tests/contract/media-exports.contract.test.ts`
- **Approach:** follow U6's `session.ts` schema and contract case; derive each type with `z.infer` and delete the hand-written interface it replaces; reuse `@css/shared` shapes where the module already imports them.
- **Tests:**
  - unit: none (the schemas are proven against the API).
  - contract: one case per covered call: a new applicant registers on the e2e database through the two OTP steps with the dummy code and submits the form (the registration calls, creating one pending volunteer), the demo volunteer signs in, reads `my-projects`, a project's form version, starts and sends an application, reads its list and detail, the attention items, notifications, profile, sessions, uploads one part of a photo and finishes it, requests an export and reads its job; the Media Team account reads its home, a referral and a work. The coverage test's list drops these areas.
  - existing: the component tests of each touched feature (`apps/web/src/features/**/*.test.tsx`) keep passing on the derived types; typecheck is the main proof.
- **Done when:** `pnpm typecheck`, the web component tests and `test:contract` pass; coverage reports no uncovered call in these folders.
- **Depends on:** U6
- **Size:** L
- **Risk area:** none
- **Status:** done

### U8. Schemas of the people screens of the admin area
- **Goal:** the volunteer, beneficiary, merge, registration, staff, user, permission and handover screens are covered.
- **Requirements:** R9, R10
- **Files:** `apps/web/src/api/schemas/{volunteers,beneficiaries,registrations,staff,access,handover}.ts`; `admin/volunteers/volunteers-api.ts`, `admin/beneficiaries/beneficiaries-api.ts`, `admin/beneficiaries/duplicates/merge-api.ts`, `admin/registrations/registrations-api.ts`, `admin/staff/staff-api.ts`, `admin/UserSearch.tsx`, `admin/permissions/{EffectivePermissions,RevokeDialog}.tsx`, `admin/handover/HandoverPage.tsx`; `apps/web/tests/contract/people.contract.test.ts`
- **Approach:** as U7.
- **Tests:**
  - contract: the Department Head and the Dhaka RPM read the volunteer list and counts, a volunteer profile, the beneficiary list, a 360° profile and its history, the duplicate pairs, the registrations and edit requests, approve one demo registration, the staff tabs, the organogram, a user, the effective permissions, grant and revoke one permission on a demo account, and read a handover. The coverage list drops these areas.
  - existing: the component tests under `apps/web/src/admin/{volunteers,beneficiaries,registrations,staff,permissions,handover}` keep passing.
- **Done when:** as U7, for these folders.
- **Depends on:** U6
- **Size:** L
- **Risk area:** none
- **Status:** done

### U9. Schemas of the project, form and application screens of the admin area
- **Goal:** programs, projects, setup, project volunteers, transfers, templates, the form builder and the office's applications are covered.
- **Requirements:** R9, R10
- **Files:** `apps/web/src/api/schemas/{programs,project-admin,setup,templates,form-builder,office-applications}.ts`; `admin/programs/programs-api.ts`, `admin/projects/projects-api.ts`, `admin/projects/setup/setup-api.ts`, `admin/projects/volunteers/{project-volunteers-api,transfer-api}.ts`, `admin/templates/templates-api.ts`, `admin/forms/forms-api.ts`, `admin/applications/applications-api.ts`; `apps/web/tests/contract/projects.contract.test.ts`, `apps/web/tests/contract/forms.contract.test.ts`, `apps/web/tests/contract/office-applications.contract.test.ts`
- **Approach:** as U7; the writes run in an order that builds what they read (a draft project, its setup, a form draft, a publish).
- **Tests:**
  - contract: the Monitoring Team creates a draft project and reads it through every setup section, saves it as a template, builds and publishes a ready form, places it; the RPM assigns a volunteer and reads the transfer page; the office reads an application list, a review page, its timeline, change log, score and quotas, and runs one bulk review. The coverage list drops these areas.
  - existing: the component tests under `apps/web/src/admin/{programs,projects,templates,forms,applications}` keep passing.
- **Done when:** as U7, for these folders.
- **Depends on:** U6
- **Size:** L
- **Risk area:** none
- **Status:** done

### U10. Schemas of the system screens, and coverage closed
- **Goal:** settings, nisab, audit, system health and notification admin are covered, and the coverage check allows no uncovered call.
- **Requirements:** R9, R10
- **Files:** `apps/web/src/api/schemas/{settings,nisab,audit,system,notification-admin}.ts`; `admin/settings/settings-api.ts`, `admin/nisab/nisab-api.ts`, `admin/audit/audit-api.ts`, `admin/system/system-api.ts`, `admin/notifications/notifications-admin-api.ts`; `apps/web/tests/contract/system.contract.test.ts`, `apps/web/tests/contract/coverage.contract.test.ts`, `docs/testing/TEST_STRATEGY.md`, `docs/STATUS.md`
- **Approach:** as U7; the coverage test's allowed list is removed.
- **Tests:**
  - contract: the Department Head reads the settings and the public settings, the reference lists, adds a nisab version, reads the audit log with a filter, the sessions monitor, the system health and storage figures, the notification texts and the deliveries. `coverage.contract.test.ts` fails on any call of `apps/web/src` without a case (proved once by a temporary uncovered call during the unit, then removed).
  - existing: the component tests under `apps/web/src/admin/{settings,nisab,audit,system,notifications}` keep passing.
- **Done when:** `test:contract` passes with no allowed list, against `e2e:server`.
- **Depends on:** U7, U8, U9
- **Size:** M
- **Risk area:** none
- **Status:** done

## Checkpoints
- **Mode:** grouped (one by one 0, grouped 17, all at once 0; one by one scored 10, moved to grouped since N is over 4)
- **Signals:** N 10, L 2400, R 2, Fd 3, C 5, P 1
- **C1** after U1: foundation for U2, U3 and U6 (the probes and readiness checks they build on)
- **C2** after U3: file storage risk, and a foundation for U4 and U6
- **C3** after U4: a migration
- **C4** after U6: foundation for U7 to U10, and the new contract-test pattern
- **C5** after U7: size and file count (U7 alone touches about 25 files)
- **C6** after U8: size and file count
- **C7** after U9: size and file count
- **C8** after U10: end

## Verification
- `pnpm typecheck`, `pnpm lint`, `pnpm docs:check`
- `pnpm test` (API unit, database project with `docker compose up -d`, shared, web)
- `pnpm --filter @css/api db:migrate:dev` is not used; the migration is written by hand and applied with `pnpm db:migrate` on the dev database, reverted with its `down.sql` on a copy
- `pnpm --filter @css/web test:contract` (skips) and, with `pnpm --filter @css/api e2e:server` running, `CONTRACT_API_URL=http://127.0.0.1:4100 pnpm --filter @css/web test:contract`
- `pnpm --filter @css/api contract:coverage` and `pnpm --filter @css/api authz:matrix` (the new public route)
- `pnpm --filter @css/web build` and `pnpm --filter @css/web bundle:report` (the schemas stay out of the first route)
- `pnpm e2e` (the Playwright web server waits on the new readiness path)
- `docker compose up` from the main checkout: the api turns healthy through `/api/v1/healthz`

## Risks and rollback
- **The migration** (U4): additive, a default fills every row; `down.sql` drops the column. The copy script never deletes a source object, so a stopped copy is rerun, and rolling back the driver setting needs no file move.
- **The NAS rename** (U3): only tests, the E2E server and the two measurement and generation scripts (`perf-exports.ts`, `openapi-generate.ts`) used `filesystem`, all changed in U3; dev and production stay on `s3` until T3.0 sets `nas`. A deployment still sending `STORAGE_FS_ROOT` is refused at start with the new name, never silently ignored.
- **The probe paths** (U1): the compose healthcheck and the Playwright web server move in the same unit; nothing outside the repository calls them yet (no deployment).
- **The derived types** (U7 to U10): a schema that disagrees with a page's use shows as a typecheck error, and a schema that disagrees with the API fails the contract run; both are found before the merge. A page that breaks is reverted by its unit's commit.

## Definition of done
- All units done and their tests pass
- Verification commands pass
- `ae-review` has run, with no open P0 or P1
- Code from abandoned attempts is removed

## Progress
- **Branch:** `chore/ae-standards-schemas` (units 1 to 6 merged into develop through PR #50 from `chore/ae-standards-code-only`)
- **Updated:** 2026-11-11 21:00
- **Next:** checkpoint C8 (U10, the last), then the finish of the plan
- **Reviewed through:** C6 at e8600a26
- **Uncommitted:** none
- **Notes:** C6 review (U8; T2): no P0 to P2; P3 fixed: the duplicate rules and handover categories checked to list every value, an alias dropped; P3 left: the admin modules keep re-exporting their derived types for their importers (moving every importer changes no behaviour). the plan's security review asked for the OpenAPI document behind a sign-in in production (the owner chose it), a loopback-only contract test, a realpath check in the NAS driver, a size check before the copy flips a row, a 2 s reuse of the readiness result and no secrets in the probe logs; all are in the plan. U1: the probes got the rate-limit class `probe` (no limit) in redocly.yaml and API_STANDARDS section 10, and a commented Redocly ignore file (`docs/api/.redocly.lint-ignore.yaml`) for the rule that wants a 4xx response, which a probe never gives; `HealthService.detail()` keeps each check's result for the system health page (admin session), sharing the probe's run; `markShuttingDown` is in U1 already, U2 wires it to the signal. The compose healthcheck on the new path is checked once this reaches develop (the main checkout runs develop). C1 review (logic, security, standards; T2): P1 readiness never fails on SIGTERM because nothing calls `markShuttingDown` yet, which is U2's job; P2 fixed: a failed pg-boss start was cached, keeping the critical queue check down until a restart (`job-runner.ts`, new `job-runner.spec.ts`); P3 fixed: the test-only `forget()`, a redundant try/catch, a map lookup, the log exclusion by case and trailing slash. The betterleaks P0 was the log test's fake credential; the value is now built from parts. The E2E server runs the built API (`dist/`), so a local Playwright run needs `pnpm --filter @css/api build` after an API change (`pnpm e2e` and CI build first). U2: the grace period counts from after the delay (`graceMs = SHUTDOWN_DELAY_MS + 35 s`), so a delay never shortens the drain; `SHUTDOWN_DELAY_MS` is capped at 30 s. The manual `docker compose stop api` check waits for develop on the main checkout. U3: `ping` keeps its signature without an AbortSignal (neither `fs.access` nor the MinIO client takes one; the health service already bounds each check to 2 s), a small departure from the plan's wording. The bucket is checked against the known list inside the driver too, so a crafted bucket name can't lead out of the root. A file-link test needs rights Windows grants here; the read-only root test runs only off Windows (CI). C2 review (T2; no P0 or P1): P2 fixed, one temporary name per key let a retried upload part truncate the first write (now a name per write, body and content type file); P2 fixed, a comment that told history; P3 fixed: the grace counted inside the shutdown after the delay, the delay capped at 5 s for the 40 s stop grace, the content type file parsed with zod and a missing one read as unknown, a stale storage line in SYSTEM_ARCHITECTURE; P3 left: a second signal does not force an exit (the grace timer does), and the NAS ping cannot tell an unmounted share from an empty folder (its comment now says what it checks); the two duplicate-code leads were small try/catch shapes, not taken. U4: the shared fixture `insert` of the database tests gives a file row `storage_driver: nas` unless the test names one (like the app on the test configuration), and eight raw SQL inserts name it; the copy writes one audit entry per batch by the system user (`users.kind = system`); the migration adds an index (storage_driver, id) for the copy. The dry run on the dev database was not run: the main checkout runs develop, whose API would then write rows without the driver; the integration dry-run case stands in, and the first real dry run is the RUNBOOK step at T3.0. After the merge, `pnpm db:migrate` on the dev database. C3 review (T2): P1 fixed, the switch could lose files written after the last pass and thumbnails made after a row was copied (the copy now waits with an unprocessed upload, reports what is left, and the runbook stops the api and drains the worker before the last pass); P2 fixed: the copy checks the SHA-256 read back from the target; P2 decided: the default s3 stays (expand only, a deploy may still run the earlier API; the drift test keeps the schema and the migrations equal), so the plan's "drop the default" is the later contract step after the switch, and each writer's test checks the driver instead of the types; P2 fixed: tests for a refusing target, a thumbnail failing or missing, batches and the limit; P3 fixed: one bad row no longer stops the run, the audit is written per batch even on an error, `--limit` is checked; P3 left: thumbnails copied one after the other (gentle on MinIO); `createDriver` got its own test. U5: the check runs before the profile is made (a foreign-key refusal aborts the transaction, so it cannot be read afterwards): the gender answer must be a code of the gender list; the profile takes no other coded column. The refusal travels with its values through the sync row result (`params` in `rowResultSchema` and openapi RowResult), the outbox keeps `failureParams`, and the three screens that word a refusal pass them. BR-296 added. U6 API part committed on its own: `routes/openapi.ts` (`reference.openapi.get`, public outside production, authenticated in production by `openApiAccess`, registered last in `app.ts`, sends with `res.json` so the contract recorder reads it), the authz matrix regenerated. U6 web part: the coverage check is the last contract file (a sequencer in `vitest.contract.config.mts` runs the suites one after another, coverage last), reading the calls the suites recorded in `apps/web/test-results/contract/`; its `NOT_YET` list holds the folders U7 to U10 cover; the client's own `api` and its retry are not calls. The session schemas are tied to the shared `Me` and `TokenPair` with `satisfies z.ZodType<…>` (the shared types stay, a combined repo keeps packages/shared). Run locally against `e2e:server` after `pnpm --filter @css/api build`: 3 of 3. C4 review (T2; no P0 or P1 after checking): P2 fixed, an empty gender answer was blamed on an old form (the check now only for a present code with its question found); P2 fixed: a decision number in a code comment, the batch description moved off its class, the OpenAPI test compared the builder with itself and never reached the production 401; P3 fixed: `markFailed` keeps no old values, one `failureReason` helper for the three screens, stale comments; left: the question is stored in the language of the send (a later language switch shows it in the other language), the OpenAPI document is public when a deploy forgets NODE_ENV (the app-wide default, a staging task item); the betterleaks lead on the demo password is the published test value the E2E specs hold too. U7: the E2E API runs no photo worker, so an uploaded photo stays in quarantine (423) and the file content call is proven with an export's CSV instead; a path part that is a word rather than an id (an action, a list's name, a photo slot, a link's token) is sent through the `at` tagged template in the cases so the run records it as the source names it, and four calls that built their path elsewhere (the public form, a record's PDF, the locations and the data set) now write literal paths. C5 review (U7): fixed, each account case now makes the people and records it reads (a new registration, an approved volunteer, a new official from the invitation, a draft project), so it passes alone, shuffled and on a database an earlier run wrote to; the device case revokes the session it signed in; the password case puts the demo password back in a finally; the world builder parses every step's answer with a schema, takes the project code from a UUID and the year from the clock; the project count reads row ids and the works page uses `pageOf`. U8: no staff registration can be made any more (officials are invited), so the staff decision call is reached with the refusal on an invited account and the staff list may be empty; a merge refuses two profiles with applications on one project, so a pair is applied for on two projects; the coverage parser reads a path's `${listQuery(…)}` as its query, and the grant and the deactivation calls got a type argument so the coverage check sees them. U9: the E2E seed's question library is empty and holds an open draft, so the library case adds a question to that draft and publishes it; a review edit enters the change log only while the application is under review, and only the global roles (or a Project Executive with edit access) may make it; a project's own form is made by the Monitoring Team, not the PM; the seed sets no nisab, so the case adds today's unless a run before did; the field-map call the plan names has no caller in the web app. U10: the coverage check has no exception list any more and was proved once by a temporary uncovered call in admin/nisab/nisab-api.ts, which the run named and failed on (then removed); the notification-text calls now write literal paths; the settings are read per key with the shared value schemas, so the settings forms take the per-key types; the system case saves the settings, the SMS setting and a notification text as they are and withdraws the nisab version it adds, so the shared configuration stays as found.
