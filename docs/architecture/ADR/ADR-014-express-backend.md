# ADR-014: Express 5 replaces NestJS for the backend

Status: approved 2026-10-11 by delegation (DECISION_LOG D-074, owner: "decide yourself and act accordingly"), implemented 2026-10-12 (task T1.7d, plan `docs/plans/2026-10-11-1742-chore-stack-adoption-admin-minimal-plan.md`). Supersedes ADR-002. Written in task T1.7d.

## Context

The owner chose the organization's engineering standard for the backend as well as the frontend (D-073, D-074). The standard (assunnah-engineering `ae-standards`, ST-02) names Node.js + Express 5 + TypeScript with plain modules, PostgreSQL 17 through Prisma (ST-03), one storage adapter with interchangeable drivers and no presigned URLs (NS-30…NS-41), and auth-core for sign-in (ST-04). `docs/architecture/BACKEND_STANDARD_MIGRATION.md` (T1.7c) mapped every piece of the NestJS API of T1.1–T1.7 to that standard and settled each conflict; T1.8 (roles, scopes, the permission check on every endpoint) is the most framework-bound task of Phase 1, so the port came first.

## Decision

- `apps/api` is an Express 5 application: `src/app.ts` builds it (trust proxy, pino-http, helmet, CORS allowlist, JSON limit, request context, health probes, the `/api/v1` routers, 404, error handler), `src/server.ts` listens with graceful shutdown, `src/worker.ts` runs the pg-boss consumers; both entries build the same `createContainer(env)` (plain services constructed in dependency order, no DI container).
- Every operation is declared once with `defineRoute(router, deps, { ...OperationSpec, handler })` (`src/openapi/define-route.ts`): the OpenAPI operation goes into the route registry, and the same declaration wires the access rule, the rate-limit chain of its class, zod validation of body, query and params, the envelope and, for writes, the audit enforcement. The drift test compares `buildOpenApiDocument(registry)` with `docs/api/openapi.yaml` (unchanged contract, NFR-54).
- `requireAccess` (`src/auth/require-access.ts`) is the one access middleware (bearer token → device session → permission version → account state → permission; default deny, NE-SEC-03). It runs before the limiters so per-user windows see the caller.
- The backbone of T1.6 is kept as plain modules: `http/send.ts` (envelope), `http/validate.ts`, `http/errors.ts` (localized error block, no stack traces), `rate-limit/limiters.ts` on express-rate-limit with the API_STANDARDS 10 classes, `audit/write-route.ts`, `core/request-context*.ts`, pagination, idempotency, pg-boss (ADR-004), hand-written `down.sql` (ADR-003; CLAUDE.md wins over the standard's DB-MIG-05).
- Storage follows the standard's shape (`storage/{types,index}.ts`, `drivers/{s3,filesystem}.ts`): streams in and out, `NotFoundError`, private buckets, no signed URL ever reaches the browser; the S3 driver points at MinIO and is marked `TEMP:` until the NAS driver exists (ADR-005 amended by D-074).
- PostgreSQL 17 (ST-03) for development, tests, CI and later production; nothing in production existed before the move.
- auth-core is adopted later (D-074 §4): the plugin carries no auth-core code and the documented surface lacks SMS/email OTP, lockout, device lists and account states; the access token stays in memory with `Authorization: Bearer` as a recorded deviation from AU-20.
- pnpm workspaces stay (D-050); the organization kit's npm layout is not adopted.

## Alternatives considered

- Keep NestJS (ADR-002): approved in D-051, but the owner chose the organization's standard; porting after T1.8 would have doubled the work on guards and the authorization matrix.
- Fastify: not the organization's standard.
- Adopt auth-core now: no source or login pack available; the AUTH.md surface is wider than the documented auth-core one.

## Consequences

Positive: the organization's rules, reviewers and kit apply to the API; no decorators or reflection metadata (plain `tsc`, esbuild in Vitest); every behaviour of T1.6 and T1.7 is proven unchanged by the same 193 API tests and 39 E2E journeys running against the Express app; services are plain classes constructed in one place.

Negative: no DI container (every new service is wired by hand in `container.ts`); the Nest OpenAPI decorators are replaced by the route registry, so an operation outside `defineRoute` is invisible to the drift test (which is why routes are only declared through it).

Follow-ups: T1.8 builds the RBAC engine on `requireAccess`; T2.1 adds the file routes that stream objects (NS-10); the NAS driver replaces the S3 driver when the NAS exists; auth-core when its login pack exists.

## Related

D-074, D-051, D-053, D-070, D-072, D-073; ADR-002 (superseded), ADR-003, ADR-004, ADR-005, ADR-013; `docs/architecture/BACKEND_STANDARD_MIGRATION.md`, `docs/architecture/SYSTEM_ARCHITECTURE.md`, `docs/architecture/AUTH.md`, `docs/api/API_STANDARDS.md`, `CONTRIBUTING.md`.
