# Backend migration to the organization's standard (Express 5, auth-core)

Status: analysis complete, task T1.7c (2026-10-11); **migration done on 2026-10-12** (task T1.7d, plan `docs/plans/2026-10-11-1742-chore-stack-adoption-admin-minimal-plan.md`, ADR-014): every step of section 5 is complete and NestJS is gone from the repository. Decisions below are recorded as D-074 in `docs/DECISION_LOG.md`; the owner delegated them in chat ("decide yourself and act accordingly", 2026-10-11) after choosing the organization's standard for the backend as well as the frontend (D-073). The migration itself is task T1.7d.

## 1. Why

The organization's engineering standard (assunnah-engineering plugin, `ae-standards`) fixes the stack of every As-Sunnah app: React + Vite (done in T1.7b), **Node.js + Express 5 + TypeScript (ST-02)**, PostgreSQL 17 through Prisma (ST-03), **auth-core** for apps that sign in their own users (ST-04), the storage adapter with the NAS driver as the target (ST-05), zod at every boundary (ST-07), pino, Vitest, Supertest and Playwright (ST-08). The ERP's API was built on NestJS 11 (D-051, ADR-002) through T1.6 and T1.7: about 4,900 lines of source and 4,100 lines of tests. The standard says the repository's own CLAUDE.md wins where they conflict and that the conflict must be named; this document names every one and settles it.

## 2. What exists and where it goes

| Today (NestJS, T1.1–T1.7) | Standard | Decision (D-074) |
|---|---|---|
| `AppModule`, `CoreModule`, Nest DI, `main.ts`, `bootstrap.ts` | Express 5 app in `apps/api/src/app.ts`, `server.ts`; plain modules and factory functions, no DI container | **Port.** One `createApp(env, deps)` returning the Express app (tests build it the same way); services are plain classes constructed in `src/container.ts` |
| `env.ts` (zod, production guards) | NE-CFG-01: one zod schema at startup | **Keep as is** (`src/config.ts`); add `TRUST_PROXY_HOPS` naming per NE-SEC-10 (our `TRUST_PROXY` already does this, D-072) |
| `PrismaService` (Prisma 7, pg adapter) | `src/db/client.ts` singleton, Prisma 7, pg adapter | **Keep**; the `Tx` type stays |
| Request context (AsyncLocalStorage), request id, pino through nestjs-pino | pino-http with the request id (NE-LOG-01), redaction (NE-LOG-02) | **Keep** the context and `logging.ts`; `pino-http` is used directly |
| `EnvelopeInterceptor`, `ok()`, `page()` | NE-REQ-05 `{ error: { code, message } }` and paginated lists (SHOULD) | **Keep our envelope** (`{ data, meta }`, API_STANDARDS 3); a `send(res, result)` helper replaces the interceptor |
| `ApiExceptionFilter`, `ApiError` | NE-ERR-01 one error middleware, NE-SEC-11 no internals | **Keep** as the single error middleware; same catalogue codes, same localized message |
| `ZodValidationPipe`, `@ZBody/@ZQuery/@ZParam` | NE-REQ-01 zod on params, query and body | **Keep the schemas**; a `validate({ body, query, params })` middleware replaces the decorators |
| Pagination helpers | — | **Keep** unchanged |
| `IdempotencyService` | — | **Keep** unchanged (plain class) |
| `RateLimitGuard` (@nestjs/throttler storage, our classes) | NE-SEC-04 `express-rate-limit` per IP on auth endpoints | **Replace the storage with `express-rate-limit`** (one limiter per API_STANDARDS 10 class, keyed as today), same headers and `rate_limit.exceeded` |
| `@Audit` + `AuditEnforcementInterceptor`, `AuditWriter` | — (constitution 13 requires it) | **Keep**; the enforcement becomes a route wrapper (`write(action, handler)`) that fails a write without an audit entry, as today |
| `@ApiContract`, OpenAPI generation, drift test | not covered by the standard; constitution 13 and NFR-54 require the contract | **Keep**: `defineRoute({ contract, handler })` registers the Express route and the OpenAPI operation; the drift test stays |
| `AuthGuard`, `TokenService` (HS256), `SessionService`, OTP, lockout, `PermissionResolver` (T1.7) | auth-core (AU-01…AU-21) | **Keep T1.7's auth, ported to one Express middleware** (`requireAccess(rule)`, AU-21 style, `req.user`); **adopt auth-core only when its login pack exists** (section 4) |
| Users, sessions controllers | thin routes → services (NE-REQ-04) | **Port** to `src/routes/*.ts` (validate → service → respond) and `src/services/*.ts` |
| pg-boss jobs, worker entry | not covered | **Keep** (ST-30: needed, nothing in the stack covers it; ADR-004) |
| MinIO storage with presigned URLs (T1.6) | storage adapter (`put/get/remove`), NAS driver target, S3 driver temporary, **no signed URLs** (NS-41), files streamed by an authorized route (NS-10) | **Adopt the standard's adapter shape**: `StorageDriver` with `put/get/remove/ping`; the S3 driver points at MinIO now (temporary, NS-05 `storage driver` column) and the NAS driver is added before production; **presigned URLs are dropped**; T2.1 serves files through authorized streaming routes with `Content-Disposition: attachment` and `nosniff` (NS-11). FILES_AND_DOCUMENTS.md and NFR-28 are updated in T2.1 |
| SMTP/SMS/in-app adapters | — | **Keep** |
| Health `/health/live`, `/health/ready` | NE-ERR-05 `/healthz`, `/readyz` (SHOULD) | **Keep our paths** (Caddy and the IT check use them) |
| Prisma migrations with hand-written `down.sql` (D-051, ADR-003) | DB-MIG-05 no down migrations | **Keep `down.sql`** (constitution 9 requires reversible migrations; CLAUDE.md wins) |
| PostgreSQL 16 | ST-03 PostgreSQL 17 | **Move to 17** in T1.7d (dev compose, CI services, ADR-003): nothing is in production, the migration SQL is version-neutral |
| Tests: Supertest against the Nest app, cloned databases | TS-01 Supertest against the real Express app, TS-02 real Postgres | **Keep every test**; the harness builds the Express app instead of a Nest module |
| Seed, locations loader, scripts | — | **Keep** (they use Prisma and pg directly) |

Not changed by the migration: the OpenAPI contract, the database schema, the shared package, the PWA, the catalogue, the business rules, the audit model, the seed and the demo accounts.

## 3. Standard rules that change behaviour (checked one by one)

- NE-SEC-01 `helmet()` and NE-SEC-02 CORS allowlist: added (CORS is an allowlist of the PWA origin for non-same-origin setups; same origin stays the default).
- NE-SEC-05 cookies: `css_refresh` and `css_csrf` already comply (HttpOnly, Secure, SameSite=Strict, path; CSRF token).
- NE-SEC-10 `trust proxy`: D-072 already.
- NE-REQ-02 `express.json({ limit: '100kb' })`: adopted; the sync batch route raises its own limit (O-29).
- NE-ERR-03 timeouts on outbound calls (SMTP, SMS, MinIO): added where missing.
- NE-ERR-04 graceful SIGTERM: adopted (today Nest's shutdown hooks).
- AU-10 one message for every login failure: already (`auth.invalid_credentials` for unknown id and wrong password).
- AU-13 per-IP rate limit in front of login, OTP and password endpoints: already (API_STANDARDS 10).
- AU-20 tokens only in HttpOnly cookies: **deviation kept**: the access token travels in memory and `Authorization: Bearer` (AUTH.md 5, OFFLINE_SYNC: the service worker and the outbox need it without a cookie); only the refresh token is a cookie. Recorded as a CLAUDE.md-wins conflict; revisited when auth-core is adopted.
- RE-SEC-03 / ST-42: unchanged.

## 4. auth-core: adopt later, not now

Facts (2026-10-11): the plugin has no auth-core code. Its source lives in the external repository `skill-web/src/auth-core/`; there is no npm package; the kit's "login pack" and the `sync-auth-core.mjs` script do not exist yet (they wait for auth-core on Prisma 7). The documented surface: Argon2id passwords, ES256 access tokens with a JWKS, rotating refresh tokens, TOTP, a per-account throttle, signing-key rotation, the `authn` schema, `createAuthCore({ store, keys, events, clock })`, one verifying middleware. Not documented: SMS/email OTP, lockout rules, device-session lists and remote revocation, account states, CSRF handling, cookie names.

Decision (D-074): T1.7's authentication stays, ported to Express as one middleware (`requireAccess`) that sets `req.user`, so that a later swap to auth-core touches one place. The adoption is scheduled when the login pack exists and the owner provides the source: the analysis then maps `authn` accounts to `public.users` (one account per user, the profile row keeps a reference), decides whether SMS/email OTP, lockout, device lists and account states move into auth-core or stay as wrappers around it, and replaces HS256 with ES256 and the JWKS. Until then our tokens are verified only by this API, which is the only consumer.

## 5. Order of work (T1.7d, one task, committed step by step)

1. Decisions and docs first (this document, D-074, ADR-002 superseded by ADR-014 "Express 5 replaces NestJS", ADR-003 PostgreSQL 17).
2. Express skeleton beside Nest: `app.ts` (helmet, CORS allowlist, trust proxy, pino-http, request context, json limit, health router, the route registry, 404, error middleware), `server.ts` (graceful shutdown), `container.ts`; the test harness `test/support/app.ts` builds it.
3. Port the backbone: envelope helper, validation middleware, rate limiters, audit wrapper, `defineRoute` with the OpenAPI registry and the drift test (the contract comparison code is reused as is).
4. Port auth, sessions, users and `/me/language` routes and the auth middleware; run the 39 API-db tests and 20 API tests against the Express app.
5. Port health, jobs wiring (`worker.ts` keeps pg-boss), storage adapter to the standard's shape (presign removed), notifications; readiness test.
6. Remove Nest: dependencies, `nest-cli.json`, decorators, `tsconfig/nest.json`; Vitest, build (`tsc -p tsconfig.build.json`, `node dist/server.js`), E2E server script, CI.
7. PostgreSQL 17 in `infra/docker-compose.dev.yml` and CI services; migrations up/down/up test.
8. Docs: SYSTEM_ARCHITECTURE 2, 5.1 and 6, CONTRIBUTING "How to add an endpoint", DEPLOYMENT, TEST_STRATEGY, CLAUDE.md, README, STATUS.

Test strategy (TS-22): the existing 193 API and API-db tests are the characterization tests; they are not rewritten, only their app factory changes. The E2E suite (39) runs unchanged against the ported API. Every step above ends with lint, typecheck and the tests of the touched area green.

Effort: about the size of T1.6 plus T1.7 together (two long sessions). Risk: behaviour drift in the middleware order (rate limit before or after auth, audit enforcement on writes); the tests of T1.6 and T1.7 cover each of these points.

## 6. Why now, before T1.8

T1.8 (roles, scopes, the permission guard on every endpoint, the authorization-matrix test over every registered route) is the most framework-bound task of Phase 1. Building it on Nest guards and then porting it would double that work; building it on the Express `requireAccess` middleware and the route registry does it once.

## 7. Related

D-051, D-053, D-070, D-072, D-073, D-074; ADR-002, ADR-003, ADR-004, ADR-005, ADR-013; `docs/architecture/SYSTEM_ARCHITECTURE.md`, `docs/architecture/AUTH.md`, `docs/api/API_STANDARDS.md`; organization standard files `stack.md`, `node-express.md`, `auth-core.md`, `postgres-prisma.md`, `storage.md`, `testing.md` (assunnah-engineering plugin 0.16.0).
