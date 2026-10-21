# Architecture decision records

Index created in task T0.1; ADR-001…006 written in task T0.8 (2026-10-10). One file per technical decision, named `ADR-nnn-short-title.md`, with sections Status, Context, Decision, Alternatives considered, Consequences, Related. A superseded ADR keeps its file with status "superseded by ADR-mmm".

| ADR | Title | DECISION_LOG id | Status |
|---|---|---|---|
| [ADR-001](ADR-001-monorepo-pnpm-workspaces.md) | Monorepo with pnpm workspaces | D-050 | approved 2026-10-10 |
| [ADR-002](ADR-002-nestjs-backend.md) | NestJS for the backend | D-051 | superseded by ADR-014 (2026-10-12) |
| [ADR-003](ADR-003-prisma-with-down-sql.md) | Prisma on PostgreSQL 17 with hand-written down.sql | D-051 | approved 2026-10-10; PostgreSQL 17 since 2026-10-12 (D-074) |
| [ADR-004](ADR-004-pg-boss-background-jobs.md) | pg-boss background jobs in a separate worker process | D-053 | approved 2026-10-10 |
| [ADR-005](ADR-005-minio-object-storage.md) | MinIO object storage, filesystem adapter for tests (presigned URLs replaced by streaming through the API, D-074, D-108) | D-053 | approved 2026-10-10, amended 2026-10-20 |
| [ADR-006](ADR-006-nextjs-pwa-stack.md) | Next.js PWA stack: App Router, Serwist, Dexie, Tailwind tokens, next-intl | D-052 | superseded by ADR-013 (2026-10-11) |
| [ADR-007](ADR-007-email-sms-adapters.md) | Provider-agnostic email and SMS adapters behind a transactional outbox | Q-11, D-053, O-33 | approved with NOTIFICATIONS.md, 2026-10-10 |
| [ADR-008](ADR-008-workflow-templates-yaml.md) | Workflow templates as YAML with named guards and effects | Q-35, BD-11 | approved with WORKFLOW_ENGINE.md, 2026-10-10 |
| [ADR-010](ADR-010-offline-outbox-conflicts.md) | Offline outbox with client_uuid idempotency and server-decided conflicts | BD-48, O-07, O-13 | approved with OFFLINE_SYNC.md, 2026-10-10 |
| [ADR-011](ADR-011-identifier-formats.md) | Identifier formats (BEN-ID = UUID v7, application number = project code + year + sequence) | O-03 | approved; written at the Phase 0 gate (T0.22) |
| [ADR-012](ADR-012-react-aria-headless-components.md) | React Aria Components as the headless primitive library of packages/ui | D-064 | superseded by ADR-015 (2026-10-19) |
| [ADR-013](ADR-013-vite-react-spa.md) | Vite React SPA (React Router, TanStack Query, use-intl, Serwist) replaces Next.js | D-073 | approved 2026-10-11 (T1.7b) |
| [ADR-014](ADR-014-express-backend.md) | Express 5 replaces NestJS for the backend; storage adapter in the standard's shape; PostgreSQL 17 | D-074 | approved 2026-10-11, implemented 2026-10-12 (T1.7d) |
| [ADR-015](ADR-015-mui-core-component-set.md) | MUI core behind the component set of packages/ui (the organization's UI standard) | D-103 | approved 2026-10-19 |

Planned (written when the decision is designed):

| ADR | Title | DECISION_LOG id | Written in |
|---|---|---|---|
| ADR-009 | Form definitions as JSON with a shared evaluator | BD-12 | T2.3 (the JSON shape is already fixed by `form-field-logic.schema.json`) |
