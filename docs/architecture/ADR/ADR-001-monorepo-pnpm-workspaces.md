# ADR-001: Monorepo with pnpm workspaces

Status: approved 2026-10-10 (DECISION_LOG D-050, confirmed by the owner in O-01). Written in task T0.8.

## Context

The system has one backend (`apps/api`), one PWA (`apps/web`) and business rules that must behave identically on both sides: the form logic evaluator runs offline in the browser and again on the server; priority score, zakat net assets and budget math are shown in the UI and enforced in the API; permission names and i18n keys are referenced by both. Constitution §13 forbids duplicated calculations across UI, API, database and reports. A single in-house team maintains everything.

## Decision

One git repository managed with pnpm workspaces:

```
apps/web        Vite React SPA (PWA; ADR-013)
apps/api        Express 5 API and worker entry points (ADR-014)
packages/shared zod schemas, permission names, i18n keys, pure business rules (score, zakat, budget, form evaluator)
packages/ui     design system components and tokens
packages/config eslint, tsconfig, prettier shared configuration
infra/          docker-compose files, Caddyfile, backup scripts
docs/           all project documents
```

`packages/shared` has no runtime dependency on Node, Nest, Prisma or the web framework; it is consumed by both apps as TypeScript source through workspace links, so no package publishing is needed. CI runs lint, typecheck, unit, API and E2E tests for the whole workspace on every commit.

## Alternatives considered

- Two repositories (api, web) with a published contract package: contract drift between repositories, versioning overhead, and the shared rule code would need a release process for every change.
- Single app with Next.js route handlers as the backend: fewer packages, but REST versioning, OpenAPI generation, background jobs and the permission × scope guard model are weaker (see ADR-002).

## Consequences

Positive: one commit changes schema, API and UI together (documentation sync rule); shared rules are tested once; a single `pnpm install` and `pnpm dev` for the whole system; Claude Code sessions see all code in one place.

Negative: a larger repository and a longer CI run as the code grows; workspace tooling (pnpm, TypeScript project references) must be configured correctly in T1.1; care is needed so that `packages/shared` never imports server-only code (enforced by its own tsconfig and an ESLint rule).

Follow-ups: T1.1 scaffolds the workspace, the scripts named in CLAUDE.md (`pnpm dev`, `test`, `e2e`, `lint`, `typecheck`, `db:migrate`, `db:seed`) and the CI pipeline. Done in T1.1 (2026-10-11): packages are named `@css/*`; `packages/shared` and `packages/ui` export their TypeScript sources under the `@css/source` condition (used by Vitest and `tsc --noEmit`) and `dist/` for builds and runtime; the ESLint rule that keeps `packages/shared` free of Node, Nest, Next, Prisma and React imports is in `packages/config/eslint.config.mjs`.

## Related

D-050; NFR-53, NFR-56; `docs/architecture/SYSTEM_ARCHITECTURE.md` §3; `docs/PLAN.md` §2.2.
