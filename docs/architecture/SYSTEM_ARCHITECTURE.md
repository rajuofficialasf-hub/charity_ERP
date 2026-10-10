# SYSTEM ARCHITECTURE

Status: outline, written in task T0.1 (2026-10-10); completed in task T0.8. Stack D-050…D-053 approved by the owner on 2026-10-10 (O-01): pnpm monorepo, NestJS + Prisma + PostgreSQL 16, Next.js PWA, pg-boss, MinIO, SMTP and SMS adapters.

## 1. Context and goals
One deployable backend, one PostgreSQL database, one offline-first PWA (constitution §2, §9); what the system is and is not (scope §4).

## 2. Deployment view
Diagram of the organization's server: reverse proxy with TLS, API, web app, PostgreSQL, object storage, mail relay, job workers, backup targets; the four environments.

## 3. Logical view
The ten core modules of blueprint B1 as backend modules; shared services (notifications, files, locations, i18n, audit); how `packages/shared` holds business rules used by both API and UI.

## 4. Request lifecycle
Order of checks on every request: authentication → device session → rate limit → permission name → scope resolution → validation → domain service → audit → response envelope; where the offline idempotency key is checked.

## 5. Data view
Relational core plus JSONB for dynamic answers and component settings; links to `docs/database/ERD.md`; id formats (open question 3).

## 6. Background jobs
Job types (sync processing, notifications, deadline warnings, alert computation, score computation, report generation, storage-growth report), scheduling, retries, idempotency.

## 7. Cross-cutting concerns
Audit log writer, error handling and codes, localization of messages, configuration and settings, secrets handling, observability.

## 8. Offline and mobile
Summary of `docs/architecture/OFFLINE_SYNC.md`; PWA shell, service worker, outbox.

## 9. Integrations
SMTP, SMS adapter, SSL donor sheet import, exports (CSV/Excel/PDF), optional API for other departments (B10).

## 10. Quality attributes
How the architecture meets `docs/NON_FUNCTIONAL_REQUIREMENTS.md` (load, low-end devices, retention, backup).

## 11. Architecture decision records
Index of ADRs in `docs/architecture/ADR/`.
