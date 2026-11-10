# SYSTEM ARCHITECTURE

Status: complete, task T0.8 (2026-10-10). Stack approved by the owner on 2026-10-10 (DECISION_LOG D-050…D-053, O-01). The design choices made inside this document were approved by the owner on 2026-10-10 with implementation requirements, recorded as D-054 (separate worker process), D-055 (zod as the sole validation library plus database constraints), D-056 (Caddy with HTTPS enforcement and network hardening) and D-057 (monitoring from launch; error-tracking service deferred to T3.0), subject to verification during testing and the production-readiness review. Each is also recorded in the ADRs of `docs/architecture/ADR/`. Business rules referenced as BR-nnn (`docs/BUSINESS_RULES.md`); requirements as NFR-nn (`docs/NON_FUNCTIONAL_REQUIREMENTS.md`).

## 1. Context, goals and constraints

The ERP serves one department: officials on desktop and phone, about 2,000 field volunteers on phones on a distribution day, intermittent 2G/3G networks, permanent retention of photos and records, hosting on the organization's own server with an in-house team (BD-45, BD-46, NFR-01, NFR-12…19).

Constraints that shape every decision (constitution §2, §9):

- One deployable backend, one PostgreSQL database, one PWA frontend. No microservices, no message bus, no distributed system.
- Nothing cloud-dependent at runtime. Everything runs with Docker Compose on one server (a second server for backups and, later, for a hot standby is an IT-team option, not a requirement).
- Authorization on the server on every request, default deny; field-level protection of sensitive data; audit log for every important write (§13).
- Offline-first field work: the phone keeps working without network and syncs later (B7, BD-48).
- Simplest adequate architecture: every component below earns its place by a stated need; anything not needed yet is left out.

## 2. Topology (single deployment)

One server, one Docker Compose project per environment (staging, production), the same images for both.

```
                         Internet / office network
                                    │
                             ┌──────┴──────┐
                             │   Caddy     │  TLS (automatic certificates), HTTP/2,
                             │ reverse     │  routes /api/* → api, everything else → web,
                             │ proxy       │  (files are streamed by the api, D-074)
                             └──┬──────┬───┘
                 ┌──────────────┘      └──────────────┐
          ┌──────┴──────┐                       ┌─────┴──────┐
          │    web      │                       │    api     │  Express 5, /api/v1
          │  Vite SPA   │  ───── REST ──────►   │  (HTTP)    │  auth, access, audit,
          │  static     │                       └─────┬──────┘  domain modules
          └─────────────┘                             │
                                                      │  same image, second entry point
                                               ┌──────┴──────┐
                                               │   worker    │  pg-boss consumers:
                                               │  (jobs)     │  sync, notify, alerts,
                                               └──────┬──────┘  exports, photos, storage-stats
                        ┌──────────────┬──────────────┼───────────────┬───────────────┐
                 ┌──────┴──────┐ ┌─────┴─────┐ ┌──────┴──────┐ ┌──────┴──────┐ ┌──────┴──────┐
                 │ PostgreSQL  │ │   MinIO   │ │  SMTP relay │ │ SMS provider│ │  Backups    │
                 │ 17 + JSONB  │ │ S3 API,   │ │ (org mail   │ │ (HTTP API,  │ │ pg_dump,    │
                 │ pg-boss     │ │ buckets,  │ │ server)     │ │ adapter;    │ │ WAL archive,│
                 │ queue tables│ │ private   │ │             │ │ stub in dev)│ │ MinIO mirror│
                 └─────────────┘ └───────────┘ └─────────────┘ └─────────────┘ └─────────────┘
```

Components and why each exists:

| Component | Role | Why this and not less |
|---|---|---|
| Caddy | TLS termination, routing, compression, basic request limits; HTTPS enforced (HTTP → HTTPS redirect, HSTS); only ports 80 and 443 are public; PostgreSQL, the MinIO admin API and the worker stay on the Docker internal network and are never exposed (D-056) | Automatic certificate renewal removes a recurring operations task; one process in front of two apps |
| web (Vite React SPA) | Static files (`apps/web/dist`: app shell, assets, service worker, manifest) served by Caddy with the SPA fallback; no server process (D-073, ADR-013) | One codebase for desktop and phone (Q-15); every screen renders from the API or local data |
| api (Express 5) | REST under `/api/v1`, all authorization, domain logic, audit (D-074, ADR-014) | Plain modules (routes, services) mirror the ten B1 core modules; one `requireAccess` middleware and one `defineRoute` declaration per operation |
| worker | pg-boss consumers for background jobs | Separate process; see 2.1 |
| PostgreSQL 17 | Relational master data, JSONB answers and settings, audit log, pg-boss queues | One database for everything (constitution §2) |
| MinIO | Photos, vouchers, documents, exports behind the storage adapter's S3 driver; private buckets, files streamed by authorized API routes (D-074, NS-41) | Self-hosted S3 API until the NAS driver exists (D-053, BR-204, ADR-005 as amended) |
| SMTP relay | Email through the organization's mail server; Mailpit in dev | BD-47 |
| SMS adapter | Provider-agnostic HTTP adapter; logging stub in dev; a real provider before rollout beyond the Phase 3 pilot (O-49) | Q-11, BD-47 |
| Backups | Daily `pg_dump`, WAL archiving when enabled, MinIO mirror to a second disk or server | O-06: RPO 24 h → 1 h, RTO 4 h |

### 2.1 Workers: a separate process (decision)

pg-boss consumers run in a **separate `worker` process** started from the same `apps/api` build (`node dist/server.js` for HTTP, `node dist/worker.js` for jobs), not inside the HTTP process.

Reasons:

- Latency on distribution day. Exports (NFR-10), photo post-processing, alert computation and large sync batches are CPU- and I/O-heavy; in the same Node event loop they would stretch the p95 targets of the field endpoints (NFR-04…07) exactly when 2,000 volunteers are online (NFR-01).
- Independent restart and scaling. A stuck or memory-hungry job can be restarted without dropping HTTP connections; a second worker container can be added for the Qurbani photo-email burst without touching the API.
- Still one deployable unit. Same image, same code, same configuration; the only difference is the entry point. This keeps the "one backend" rule of constitution §2 while separating runtime concerns.

Trade-off: two containers to monitor instead of one, and jobs must be written so that they never depend on in-process state of the API (they already must, because pg-boss persists jobs in PostgreSQL). For development and automated tests the flag `JOBS_INLINE=true` runs the consumers inside the API process so that a single `pnpm dev` is enough; the flag refuses to activate when `NODE_ENV=production`.

Implementation requirements for production workers (D-054):

- Retries: every queue declares a retry limit and backoff; a job that exhausts its retries is marked failed with the reason and raises an alert.
- Graceful shutdown: on SIGTERM the worker stops taking new jobs, finishes or releases in-flight jobs within a bounded grace period, then exits; the deploy script waits for it.
- Timeouts: every job type has an expiry so that a hung job is released and retried instead of blocking the queue.
- No duplicate side effects: handlers are idempotent, keyed by entity id or `client_uuid`; outbound messages and emails are sent through the outbox with a delivery record checked before sending, so an at-least-once redelivery never sends twice.

## 3. Layering

Every backend module follows the same four layers; the direction of dependencies is strictly downward.

```
controllers            HTTP only: route, DTO validation, guards (auth, permission, scope), serializer
      │
application services   use cases: open a transaction, call domain services/engines, write the audit entry,
      │                enqueue jobs, return plain results
      │
domain services and    business behaviour with no HTTP or database knowledge:
engines                workflow engine, activity engine, form engine, budget ledger, score, zakat,
      │                merge, transfer, handover; pure rule functions imported from packages/shared
      │
repositories           Prisma queries, scope filters applied as query conditions, unit of work
```

Rules:

- No business logic in controllers; a controller that contains an `if` on business data is a defect.
- Engines and domain services never import Prisma; they receive repositories through interfaces, so they can be unit-tested with in-memory fakes.
- `packages/shared` contains pure TypeScript only (zod schemas, permission names, i18n keys, rule functions such as score, zakat net assets, budget math, form logic evaluator). It has no Node, Express, Prisma or web-framework dependency, so the same code runs in the browser offline and on the server (BR-076, BR-083, NFR-53).
- Application services own transactions. One use case = one transaction = one audit entry (or several in the same transaction). Jobs are enqueued inside the transaction through pg-boss's PostgreSQL tables, so a job never exists for a write that rolled back.
- Repositories apply the resolved data scope as query conditions (section 6), never the controllers.

## 4. Module map

### 4.1 Blueprint B1 core modules → API modules

| B1 # | Core module | API module (`apps/api/src/routes/…` and `src/services/…`) | MODULE_CATALOG ids | Notes |
|---|---|---|---|---|
| 1 | Program & Project | `programs` | M06 | programs, projects, settings, areas, components, templates, quotas, fund sources, lifecycle incl. Closing (O-12) |
| 2 | Beneficiary | `beneficiaries` | M05 | master, lookup, correction requests, duplicate detection, merge, blocklist (shared with volunteers), media consent |
| 3 | Volunteer | `volunteers` | M03, M04 | registration, approval, tab, assignment and permission sets, teams, ratings, categories, transfer, handover |
| 4 | Application & Form Platform | `forms`, `applications` | M07, M08 | forms, versions, sections, fields, public links; applications, answers, scores, field changes |
| 5 | Workflow & Approval | `applications/workflow` (engine inside `applications`) | M08 | workflow templates, transitions, guards; project lifecycle workflow used by `programs` |
| 6 | Project Activities | `activities`, `activities/qurbani` | M09, M11 | activity engine, stock, distribution, construction stages, issues, site verification, payments, vouchers, expense claims; Qurbani donors, animals, photos |
| 7 | Dawah | `dawah` | M12 | syllabus, assignments, classes, attendance, progress, exams, call logs |
| 8 | Budget & Project Accounts | `budget` | M10 | ledger buckets, fund-source checks, payment methods |
| 9 | Monitoring & Follow-up | `monitoring` | M14 | alerts and thresholds, work summaries, follow-up evaluations |
| 10 | Reports & Audit | `reports`, `audit` | M15, M16 | dashboards, KPIs, export jobs; audit log writer and viewer |
| — | Shared services | `auth`, `access`, `files`, `notifications`, `jobs`, `i18n`, `exports`, `locations`, `documents`, `admin`, `sync` | M01, M02, M18, M17, —, M20, M16, M19, M13, M21, M22 | see section 5 |

Each module exposes a small public API (its application services, constructed in `container.ts`) and keeps its data access private; routers are thin (validate → service → send, NE-REQ-04) and modules depend on each other only through those services; the dependency graph in MODULE_CATALOG section 3 is enforced by review and the ESLint import rules.

### 4.2 Route groups of the PWA (`apps/web/src`, React Router)

The groups below are the audiences of the screens. Since T1.15 one layout route, the app shell (`src/components/shell/AppShell.tsx`), wraps every signed-in screen with the app bar, the navigation of the screen's width and the offline banner; the sign-in screens and the dev-only gallery stand alone, and the admin pages are one lazy route chunk inside the shell.

| Route group | Audience and device priority (DESIGN_BRIEF §5) | Screens (SCREENS.md) |
|---|---|---|
| `(auth)` | Everyone; phone first | login, registration with two OTP steps, password reset, consent flow |
| `(volunteer)` | Volunteers, team members, Local দায়ীs, paid volunteers; phone first, offline capable | home with offline banner, my projects, new application with NID lookup, my applications, today's distribution / class / construction, expense claim, inbox |
| `(official)` | Project Executive, RPM, Official দায়ী; responsive, usable at 360 px | review queue and detail, volunteer and beneficiary tabs and profiles, issue log, site verification, payments and expense verification, document register, handover |
| `(management)` | Department Head, Monitoring Team, PM; responsive | project, program, central and dawah dashboards, monitoring control centre, work summaries, audit viewer |
| `(setup)` | PM, Department Head, Monitoring Team; desktop first with a phone notice | program and project setup, form builder, templates, permission panel, admin settings, checklist and rating editors |
| `(public)` | Anyone; phone first | tree-planting public application form (BR-087) |

Every screen renders in the browser: official and management lists read the API through TanStack Query, volunteer screens read the Dexie outbox so that they work offline (T2.7). Shared UI is the asf UI system of the organization's kit (D-150, ADR-016) in `apps/web/src/ui`: the contract (`contract.ts`), the theme tokens (`tokens.ts`) and the asf template (`templates/asf/`, MUI core with Emotion), which pages import only through `@/ui`; the app's own page CSS sits in `src/styles/` on the asf palette, in light and dark. Data access goes only through the REST API, so there is exactly one authorization path. Route-level code splitting is explicit (`lazy`): the dev-only asf gallery (`/dev/asf`) is its own chunk, absent from production builds, and the icon drawings load in a chunk of their own after the page appears.

## 5. Cross-cutting services

| Service | Module | What it provides | Design |
|---|---|---|---|
| Authentication | `auth/*`, `routes/{auth,me,sessions,users}.ts`, `services/{auth,sessions,users}.ts` (T1.7, ported in T1.7d) | `requireAccess` (before the rate limiters): bearer JWT → device session (cached 60 s) → permission version → account state → effective permission and scope handle of the `access` module (T1.8); `defineRoute`'s `permission` and `allowPending` declare access, `public` marks the open operations; `principalOf(req)` gives the `Principal`; `SessionService`, `PermissionVersionService.bump(tx, …)`; `TRUST_PROXY` decides which proxies may set the client address (D-072) |
| Authorization and scope resolution | `access/*` (registry, conditions, effective, scope, service, field-mask; T1.8), `routes/access.ts`, `services/access.ts` | Permission names from `docs/security/permissions.yaml`, role resolution, scope resolution, object-level checks, field-level masks, the permission panel and project grants | Section 6 and RBAC.md 8. Resolution reads the user's roles, project assignments (`project_volunteers`, `project_staff`), the project's area split (`project_areas`, O-09 four-level locations) and the permission-panel overrides per request; the registry is loaded once at start (`PERMISSIONS_FILE`) |
| Audit log | `audit` | `AuditWriter.record(...)` called by application services inside the transaction | Append-only table; no UPDATE/DELETE grants for the application role; viewer and export in `reports` |
| Files | `files` | Upload initiation, chunked resumable upload, validation, virus-scan hook, metadata extraction, duplicate detection, downloads streamed through the API (D-074, D-108) | `StorageAdapter` interface with the S3 driver on MinIO (staging, production, dev) and the filesystem driver (automated tests); no URL to an object is issued |
| Notifications | `notifications` | In-app inbox, email, SMS; bilingual templates; delivery status | Outbox table `outbound_messages` written in the transaction; the worker delivers through `EmailAdapter` (Nodemailer/SMTP, Mailpit in dev) and `SmsAdapter` (provider HTTP client; `LoggingSmsAdapter` in dev and test) |
| Jobs | `jobs/queues.ts`, `jobs/job-runner.ts`, `jobs/consumers.ts`, `jobs/install.ts`, `worker.ts` | Queue registry with retry, backoff and expiry; `JobRunner.enqueue(queue, data, { tx })` inside the transaction; `JobConsumers` registers consumers and cron schedules (Asia/Dhaka) in the worker, or in the api through `startInlineConsumers` with `JOBS_INLINE`; the schema and queues come from `jobs:install` in `db:migrate` (D-069); sample job: the `maintenance` heartbeat every five minutes |
| i18n | `i18n` + `packages/shared/i18n` | Message catalogue bn/en, server-side message resolution for API errors and templates, bilingual column helpers, English-digit formatter | Keys are code; catalogues are data; a missing key fails CI |
| Exports | `exports` | Job-based CSV, XLSX and PDF generation with the same field-level masks as screens, download streamed through the API (D-074), audit entry for sensitive exports | Fonts for PDF (Public Sans and Noto Sans Bengali) from the Fontsource packages, embedded by `apps/api/src/exports/pdf/fonts.ts` |
| Locations | `locations` | Four-level master (division → district → upazila → union), admin management (add, rename, deactivate; never delete), offline snapshot endpoint | O-09, BR-228 |
| Documents | `documents` | SOP register, checklist templates, deadlines, deficiency reports, quarterly audit | BR-162…171 |
| Admin | `admin` | Settings (thresholds, photo defaults, payment methods, expense categories, holiday calendar with Friday weekend, nisab versions, provider settings), master template editors | O-04, O-14, O-15, O-16, O-22 |
| Sync | `sync` | Batch endpoint, idempotency on `client_uuid`, conflict rules, needs-verification routing, photo queue coordination | Section 7 and `OFFLINE_SYNC.md` |

### 5.1 Implemented patterns (T1.6)

The backbone every module uses, in `apps/api/src` (D-068, D-069, O-57). A new endpoint follows CONTRIBUTING.md "How to add an endpoint".

| Concern | Where | Pattern |
|---|---|---|
| Configuration | `config/env.ts` | One zod schema; `loadEnv(process.env)` fails fast; `createContainer(env)` builds every service from it; production refuses `JOBS_INLINE`, the dummy OTP, relaxed rate limits and the filesystem storage driver |
| Database | `core/prisma.service.ts` | One `PrismaService` (Prisma 7 pg adapter); services that write inside a caller's transaction take a `Tx` |
| Request context | `core/request-context.ts`, `core/request-context.middleware.ts` | AsyncLocalStorage opened by `requestContext()` after the JSON body is read: request id, locale, IP, and (from the access middleware) user, device session and role; read by the logger, the audit writer and the error handler |
| Request id and logs | `core/request-id.ts`, `core/logging.ts`, `http/security.ts` | `X-Request-Id` reused when well-formed, else `req_<uuidv7>`, echoed on every response; pino-http: one line per request with id, user id, path (no query string), status and latency; bodies, cookies, authorization and personal fields never logged, known sensitive keys redacted; helmet headers and the CORS allowlist (`ALLOWED_ORIGINS`, exact origins; a wildcard, a path or another scheme stops the start, and production takes only https on a real host) live beside it |
| Envelope | `http/send.ts` | Every result becomes `{ data, meta: { requestId, … } }`; handlers return values, `ok(data, meta)` or `page(rows, pageMeta)`; a route declared with status 204 sends no body; health probes answer outside the envelope |
| Errors | `i18n/api-error.ts`, `http/errors.ts` | Services throw `ApiError(code, status, params?, details?)`; the error middleware renders `{ error: { code, messageKey, message, details?, requestId } }` in the request language; body-parser and other client errors become 4xx `validation.malformed`; anything else is `server.internal` without details |
| Validation | `http/validate.ts` | `defineRoute` mounts `validate({ body, query, params })` with the shared zod schemas; strict query schemas reject unknown parameters (400 `validation.unknown_parameter`); field problems are 422 `validation.failed` with one detail per field; a schema names a specific code with `{ message: 'validation.nid_format' }`; the handler receives the parsed parts |
| Lists | `core/pagination.ts` | `pageQuery` (limit 25, maximum 100), HMAC-signed cursors bound to the endpoint and caller, `parseSort` (whitelist, id tiebreaker), `keysetWhere`/`orderBy`/`buildPage` for next and previous pages, `parseList`, `parseRange` (Dhaka days), `searchWhere` (NFC, at least 2 characters, trigram-served contains), totals capped at "10000+" |
| Idempotency | `idempotency/idempotency.service.ts` | O-57: `replayByClientUuid` returns the existing record with 200 and `Idempotent-Replay: true`; `runWithKey` stores sync and bulk results in `sync_batches` and replays them, race-safe |
| Rate limits | `rate-limit/rate-limit.ts` (rules), `rate-limit/limiters.ts` | The API_STANDARDS 10 classes with their keys (login id, address, session, caller, IP through `TRUST_PROXY`) on express-rate-limit chains, one chain per route, IP windows first; `RateLimit-*` headers of the tightest window, `Retry-After` on 429; `RATE_LIMITS_RELAXED` for E2E only |
| Audit | `audit/audit-writer.ts`, `audit/write-route.ts` | `AuditWriter.record(tx, entry)` inside the business transaction; every write route declares its audit action in `defineRoute` (a write without one cannot be registered, BR-179); a declared action without an entry fails the request with `server.internal` |
| OpenAPI | `openapi/define-route.ts`, `openapi/registry.ts`, `openapi/build-document.ts`, `openapi/drift.ts` | `defineRoute(router, deps, { ...spec, handler })` declares the operation once (contract, access rule, rate-limit class, audit action, idempotency mode, schemas) and registers it; `buildOpenApiDocument(registry)` generates the document; the drift test compares it with `docs/api/openapi.yaml`; `pnpm --filter @css/api openapi:generate` writes `openapi.generated.json` |
| Jobs | `jobs/queues.ts`, `jobs/job-runner.ts`, `jobs/jobs.module.ts`, `jobs/install.ts`, `worker.ts` | Queue registry with retry, backoff and expiry; `JobRunner.enqueue(queue, data, { tx })` inside the transaction; consumers and cron schedules (Asia/Dhaka) in the worker or with `JOBS_INLINE`; the schema and queues come from `jobs:install` in `db:migrate` (D-069); sample job: the `maintenance` heartbeat every five minutes |
| Storage | `storage/{types,index}.ts`, `storage/drivers/{s3,filesystem}.ts` | One `StorageDriver` (`put`, `get`, `stat`, `remove`, `ping`; streams in and out, `NotFoundError`) chosen by `STORAGE_DRIVER` (no default); the S3 driver on MinIO is `TEMP:` until the NAS driver exists; private buckets, no signed URLs, safe keys only (NS-30…NS-44, D-074) |
| Notifications | `notifications/adapters.ts` | `EmailAdapter` (`SmtpEmailAdapter`, Nodemailer), `SmsAdapter` (`StubSmsAdapter`: masked logging or dry run until a provider exists), `InAppAdapter` (a `notifications` row with key and parameters); `DeliveryError` transient or permanent for the outbox (T1.14) |
| Authentication | `auth/*`, `users/*` (T1.7) | `AuthGuard` (global, before the rate limiter): bearer JWT → device session (cached 60 s) → permission version → account state → interim `PermissionResolver` (O-59); `@ApiContract({ permission, allowPending })` declares access, `@Public()` marks routes outside the contract; `@CurrentUser()` gives the `Principal`; `SessionService`, `PermissionVersionService.bump(tx, …)`; `TRUST_PROXY` decides which proxies may set the client address (D-072) |
| Health | `health/routes.ts`, `health/service.ts` | `/api/v1/healthz` and `/api/v1/livez` (liveness, never a dependency) and `/api/v1/readyz` (readiness: database and queue critical, file store not; side by side, 2 seconds each, a finished result reused for 2 seconds; `pass` or `warn` with 200, `fail` with 503, also while shutting down), `application/health+json`, `no-store`, `GET` and `HEAD`, no session, no rate limit, not in the request log; the body is the status alone and the failed check goes to the log (D-168) |

## 6. Request lifecycle (exact order of checks)

Every request to `/api/v1` passes these steps in this order. A failure at any step stops the request with the error code of that step; later steps never run.

```
 1  Caddy        TLS, size limits, forwards X-Request-Id or creates one
 2  api          request id attached to the log context
 3  rate limit   per route class: auth/OTP, public form, default (NFR-41)
 4  authentication
      - bearer access token valid and not expired
      - device session exists and is not revoked (BR-201)
      - user active, not blocked (a blocked volunteer sees only the block message, BR-047)
 5  role resolution
      - official roles and volunteer type from the user record
      - Department Head and Monitoring Team get GLOBAL scope (BR-184)
 6  permission check
      - the route declares permission 'application.approve' and scope entity 'project' (defineRoute)
      - the permission must be held by one of the user's roles, by a project permission set,
        or by a permission-panel override; default deny (BR-180, BR-193)
 7  data-scope resolution
      - compute the user's effective scope for the target entity type:
        GLOBAL | PROGRAM(ids) | PROJECT(ids) | REGION(project, divisions) |
        DISTRICT/UPAZILA/UNION(project, location ids) | ASSIGNED(user) | SELF(user)
      - the resolved scope becomes a mandatory query filter in the repository call (BR-182)
 8  object-level check (ASSIGNED / SELF and single-record routes)
      - load the target record through the scoped repository; not found under the scope = 404,
        never 403 (no existence leak); for SELF, submitted_by or owner must equal the user;
        for ASSIGNED, an assignment row must exist (BR-160, BR-120)
 9  input validation
      - DTO validated with the zod schema from packages/shared (same schema the PWA used offline);
        field-level errors with i18n keys (API_STANDARDS §3, §7)
10  idempotency (sync batches, payments, public form)
      - client_uuid / idempotency key looked up; a repeat returns the stored result (BR-194, BR-134)
11  application service
      - one transaction; domain services and engines run their own guards
        (workflow transition allowed, project not closed, photos present, stock balanced,
        exam passed, voucher verified, limit and deadline, score comment present)
      - audit entry written in the same transaction (BR-179)
      - jobs enqueued in the same transaction
12  field-level filtering
      - the serializer removes NID number and photo, bank details, ratings, categories, donor data,
        official-section answers and blocklist reasons unless the resolved role may see them;
        the same mask runs in exports (BR-183)
13  response envelope with request id (API_STANDARDS §3)
```

Where guards live: steps 4–7 are the `requireAccess` middleware (`auth/require-access.ts` with `access/service.ts`; it puts the scope handle on the request) and the rate-limit chain that `defineRoute` mounts; step 8 runs in the service through `AccessService.findUser` / `findProject` and the `userWhere` / `projectWhere` filters (404 outside the scope); step 9 is the `validate` middleware; steps 10–11 are inside the application service; step 12 is the field mask that `defineRoute` runs on every response with a response schema (`access/field-mask.ts`). In the implementation the rate limiters run after the access check, so the per-user windows see the caller. Business guards (step 11) are never duplicated in controllers.

Writes that bypass HTTP (jobs, sync processing) run the same application services with a system actor and the originating user's identity recorded in the audit entry, so the audit trail and the business guards are identical for online and offline work.

## 7. Offline sync flow (high level)

```
phone (PWA)                                   api                              worker
──────────                                    ───                              ──────
capture record ──► Dexie outbox (client_uuid, created_at, sync_status=pending)
photos ──────────► photo queue (compressed, separate)
network back ────► POST /sync/batch (text records, ≤50) ─────► step 10 idempotency
                                                              per record: validate, run the
                                                              application service, conflict rule
                                                              (server wins on approved data,
                                                              last write on drafts/field updates,
                                                              both audited; NID collision →
                                                              needs verification, BR-104, BR-199)
                   ◄─ per-record result (synced | failed+reason | needs_verification) ─┘
mark synced / retry with backoff (BR-195)
photo queue ─────► chunked upload (resumable) ──────────────► files service ──► `photos` job:
                                                              hash, metadata, duplicate warning,
                                                              link to activity; completion guard
                                                              stays blocked until photos arrive (BR-196)
```

The PWA evaluates the same zod schemas and form logic as the server (`packages/shared`), so a record that validates offline validates online unless the server state changed (deadline, limit, blocklist, closed project), in which case the per-record result carries the reason. Full protocol, storage budget (O-07) and iOS notes are in `OFFLINE_SYNC.md`.

## 8. Environments and deployment

| Environment | Where | Composition | Differences |
|---|---|---|---|
| development | developer machine | Docker Compose (`infra/docker-compose.dev.yml`, started with `docker compose up -d` from the root): postgres (host port 5433), minio with bucket bootstrap, mailpit; `pnpm dev` runs web and api; `JOBS_INLINE=true` | dummy OTP on, `LoggingSmsAdapter`, seed data, hot reload |
| test | CI runner and local `pnpm test` | same compose for API and E2E tests; `FilesystemStorage`; one database per test file cloned from a migrated template (O-46) | dummy OTP on, no outbound email or SMS, Playwright with offline emulation, k6 before gates |
| staging | organization's server | Docker Compose: caddy, web, api, worker, postgres, minio; own database, buckets, secrets; real SMTP; SMS adapter in dry-run until the provider is chosen | dummy OTP off; anonymized demo data only; UAT runs here |
| production | organization's server | same images as staging; separate compose project, volumes, secrets | dummy OTP refuses to enable; real SMTP and SMS; backups active |

Deployment diagram for the organization's server (staging and production side by side):

```
 organization's server (Linux, Docker)                      backup target (second disk or server)
 ┌────────────────────────────────────────────────────┐     ┌──────────────────────────────┐
 │ caddy  (ports 80/443; staging.<host>, erp.<host>)  │     │ nightly pg_dump (encrypted)  │
 │ ┌───────────── compose: css-erp-prod ────────────┐ │     │ WAL archive (when enabled)   │
 │ │ web · api · worker · postgres · minio          │ │ ──► │ MinIO mirror (mc mirror)     │
 │ │ volumes: pg-data, minio-data; secrets: .env    │ │     │ monthly restore drill log    │
 │ └────────────────────────────────────────────────┘ │     └──────────────────────────────┘
 │ ┌───────────── compose: css-erp-staging ─────────┐ │
 │ │ web · api · worker · postgres · minio          │ │     IT team: OS updates, disk growth,
 │ │ smaller volumes; separate secrets              │ │     uptime checks, certificate DNS
 │ └────────────────────────────────────────────────┘ │
 └────────────────────────────────────────────────────┘
```

Release flow (detailed in `docs/ops/DEPLOYMENT.md`, written in T3.0): CI builds and tests on every commit → images tagged with the git SHA → deploy to staging → smoke tests and UAT → the same images promoted to production → Prisma migrations run by a one-shot container before the new API starts; each migration has a `down.sql` for rollback (ADR-003).

## 9. Configuration and secrets

- All configuration comes from environment variables, loaded into one typed `Config` object validated with zod at process start; a missing or malformed value stops the process with a clear message (fail fast). The same schema documents every variable (names only) in `DEPLOYMENT.md`.
- `.env` files exist only on the developer machine (`.env.example` is committed with placeholder values) and on the server outside the repository; Claude Code never reads or edits real `.env` files (CLAUDE.md).
- Secrets (database password, JWT signing keys, MinIO keys, SMTP and SMS credentials) are injected by Docker Compose from the server's `.env`; rotation steps are in `RUNBOOK.md`; keys are versioned so that tokens signed with the previous key stay valid during rotation.
- Guarded flags: `OTP_DUMMY_ENABLED` and `JOBS_INLINE` throw at start when `NODE_ENV=production` (BR-024).
- Nothing secret is ever logged; the logger redacts known fields (passwords, tokens, OTP codes, NID numbers, bank account numbers, mobile numbers).

## 10. Logging and monitoring

| Concern | Mechanism |
|---|---|
| Logs | Structured JSON logs (pino) from web, api and worker; every line carries request id, user id (not name), route, latency, outcome; no personal data (NID, mobile, bank) in logs; log rotation by Docker |
| Health | `GET /api/v1/healthz` (process up; the Compose healthcheck) and `GET /api/v1/readyz` (database, queue and file store; Caddy, the deploy scripts and the IT team's uptime check), both reached through Caddy's `/api/v1/*` route (D-168) |
| Metrics | `GET /metrics` in Prometheus text format from api and worker: request rate and latency per route class, error rate, pg-boss queue depth and failures per queue, sync batch outcomes, active device sessions, storage bytes; the IT team may scrape it with Prometheus/Grafana (optional, not required for go-live) |
| Jobs | pg-boss job states visible on an admin screen (queued, active, failed with reason, retries); failed jobs alert the Monitoring Team in-app |
| Errors and alerting (from launch, D-057) | Unhandled errors logged with stack traces server-side only (never returned to clients, BR-210); essential alerting is available at go-live without any extra service: failed jobs after retries, an elevated 5xx rate over a window, and readiness failures raise an in-app alert to the Monitoring Team and an email to the IT address configured in settings. A dedicated error-tracking service (for example self-hosted Sentry) may be added later; decided in T3.0 |
| Protection of monitoring endpoints (D-057) | `/metrics` is reachable only from the Docker internal network or the IT team's allowlisted addresses through Caddy; the probes return the status alone, and the detail of each check is on the system health page behind the global roles' session (D-168); no secret or personal data appears in metrics or logs |
| Audit | The audit log is the business-level trail; it is not a substitute for logs and logs are not a substitute for it |

## 11. Storage growth reporting

Retention is permanent (BD-46), so growth must be visible (NFR-30):

- A nightly `storage-stats` job records into `storage_stats`: database size, size per large table (audit_log, application_answers, files), MinIO bytes per bucket and per project (photos, vouchers, documents, exports), counts of objects.
- An admin screen shows totals, growth per month and the projected date on which the configured disk threshold is reached.
- A monthly email summarizing the same figures goes to the IT team's address configured in settings; the budget-style threshold (e.g. 80% of disk) raises a monitoring alert.
- Exports that are older than a configured number of days are the only objects ever deleted (they are regenerable); business files are never deleted.

## 12. Trade-offs

| Choice | Chosen | Not chosen | Why |
|---|---|---|---|
| Backend framework | Express 5 with plain modules, one access middleware and `defineRoute` (route registry → OpenAPI) | NestJS (ADR-002, superseded), Fastify | The organization's standard (ST-02, D-074); the contract, envelope, audit enforcement and drift test of the Nest design are kept as plain code (ADR-014) |
| ORM and migrations | Prisma with hand-written `down.sql` | Drizzle, TypeORM, raw SQL | Schema file mirrors the ERD; type safety; reversibility added by the down.sql rule (ADR-003) |
| Jobs | pg-boss in PostgreSQL | BullMQ with Redis | No extra service, transactional enqueue, adequate throughput for this load (ADR-004) |
| Worker placement | Separate process from the same image | In-process only | Protects field-endpoint latency; one image keeps deployment simple (section 2.1) |
| Files | MinIO behind the storage adapter, files streamed by the API (D-074, D-108); filesystem adapter in tests | Plain filesystem, cloud object storage | Mirroring for free, no cloud dependency, and every byte behind the API's permission check (ADR-005) |
| Frontend | Vite React SPA (React Router, TanStack Query, use-intl, Serwist, Dexie) | Next.js (ADR-006, superseded), native apps | Organization standard ST-01 and the owner's decision D-073; no screen needs server rendering; static hosting (ADR-013) |
| Repository | pnpm monorepo | Separate repos per app | Shared business rules and schemas used by both sides without publishing packages (ADR-001) |
| Reverse proxy | Caddy | nginx + certbot | Automatic TLS; fewer moving parts for the IT team |
| Observability | Logs + health + Prometheus endpoint; error tracker optional | Full APM | Enough to run; can grow if the IT team already runs Grafana |

What is deliberately absent: Redis, Kafka or any broker, Kubernetes, a separate auth server, GraphQL, server-side rendering of volunteer screens (they must work offline), and any cloud-managed service.

## 13. ADRs and open items

ADRs: `docs/architecture/ADR/README.md` (ADR-001…008, ADR-010 and ADR-011 written in Phase 0; ADR-009 is written with the form engine in T2.3).

CI runs on GitHub Actions (O-51). Development MinIO images come from Chainguard because official community images are discontinued (D-059, proposed); production packaging is decided before T3.0.

Open items for later tasks: error-tracking tool (T3.0); MinIO packaging for staging and production (D-059, before T3.0); server details, domain names and the backup target (owner/IT, before T3.0); SMS provider (before rollout beyond the Phase 3 pilot, O-49); whether the IT team scrapes the metrics endpoint (T3.0).
