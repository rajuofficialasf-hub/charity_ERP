# ADR-002: NestJS for the backend

Status: superseded by ADR-014 on 2026-10-12 (D-074: Express 5 per the organization's standard). Originally approved 2026-10-10 (DECISION_LOG D-051, confirmed by the owner in O-01). Written in task T0.8; kept as history.

## Context

The backend must expose a versioned REST API under `/api/v1` documented in `docs/api/openapi.yaml` (constitution §9), enforce permission × data scope on every request with default deny (B4, BR-180…183), write an audit entry for every important write (§13), and be organized around the ten core modules of blueprint B1. Node.js 24 LTS and TypeScript are already decided (D-051). The team is small and will rely on a framework's conventions rather than invent its own.

## Decision

NestJS on Node.js 24 LTS with TypeScript:

- One NestJS module per core domain module and per cross-cutting service (SYSTEM_ARCHITECTURE §4.1); module boundaries enforced through module imports.
- Guards and interceptors implement the request lifecycle order of SYSTEM_ARCHITECTURE §6: rate limit, authentication, role, permission (declared per handler with a decorator carrying the permission name from `permissions.yaml`), scope resolution, object-level check, validation pipe, serializer with field-level masks.
- OpenAPI generated with `@nestjs/swagger` from the controllers and DTOs, and a CI test that fails when the generated document differs from `docs/api/openapi.yaml` (NFR-54); the file in `docs/api` is the contract, the code must match it.
- One validation library for DTOs: zod, through the schemas in `packages/shared`, so that the PWA validates offline with the same schema; `class-validator` is not used, to avoid two sources of truth. Approved as D-055 with the requirement that every request is validated on the backend regardless of client validation and that data integrity is additionally enforced by database constraints (ADR-003).
- Two entry points from one build: HTTP (`main.ts`) and worker (`worker.ts`, see ADR-004).

## Alternatives considered

- Fastify or Express assembled by hand: lighter and faster to start, but the guard/interceptor/module structure that encodes the authorization model would have to be invented and documented; for a single-developer team the framework's discipline is worth more than the saved overhead.
- Next.js route handlers as the only backend: one application, but versioned REST, OpenAPI generation, long-running jobs and a strict module structure are weaker; it would also couple the volunteer PWA's deployment to the API's.
- A non-Node stack (Laravel, Django): would split the language between frontend and backend and prevent sharing `packages/shared`; rejected unless the owner's IT team asks for it (PLAN §2.1).

## Consequences

Positive: authorization checks are declarative and visible per endpoint (a review can grep every handler for its permission); OpenAPI stays in sync by test; the module map mirrors the blueprint and the MODULE_CATALOG; NestJS testing utilities support the authorization-matrix test generated from `permissions.yaml`.

Negative: NestJS adds abstraction (decorators, DI containers) and a learning curve; start-up time and memory are higher than a bare Fastify app (acceptable on the server; irrelevant on phones). Decorator metadata must be kept out of `packages/shared`.

Follow-ups: T1.6 builds the API backbone (envelope, guards, audit writer, job and storage adapters); T1.8 implements `access` and the authorization-matrix test; T0.17/T0.18 define the standards and the Phase 1–2 contract.

## Related

D-051; BR-180…183, BR-193; NFR-37, NFR-54; `docs/api/API_STANDARDS.md`; `docs/security/RBAC.md`.
