# DEPLOYMENT

Status: outline, written in task T0.1 (2026-10-10); completed in task T3.0 (pipeline, staging, backup before the pilot) and finalized in task T6.5 (production hardening). D-053 approved (O-01); backup targets decided (O-06: RPO 24 h then 1 h with WAL, RTO 4 h, monthly drill); server details still to be supplied by the owner.

## 1. Environments
Development (Docker Compose), test (CI), staging and production on the organization's server; configuration and secrets per environment.

## 2. Topology
Reverse proxy with TLS, API, web, workers, PostgreSQL, object storage, mail relay; ports and networks.

## 3. Build and release
Build steps, versioning, release checklist, database migrations with `down.sql`, zero-downtime considerations.

## 4. Configuration
Environment variables (names only, never values), SMTP and SMS provider settings, dummy OTP disabled in production (BR-024).

API and worker variables (T1.6; schema in `apps/api/src/config/env.ts`): `NODE_ENV`, `PORT`, `DATABASE_URL`, `LOG_LEVEL`, `CURSOR_SECRET`, `HEALTH_TOKEN`, `JOBS_INLINE` (must be false in production), `STORAGE_DRIVER` (must be minio in production), `MINIO_ENDPOINT`, `MINIO_PORT`, `MINIO_USE_SSL`, `MINIO_ACCESS_KEY`, `MINIO_SECRET_KEY`, `STORAGE_FS_ROOT` (tests only), `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASSWORD`, `SMTP_FROM`, `SMS_MODE`. Start-up order: `pnpm db:migrate` (Prisma migrations, then the pg-boss schema and queues, D-069), then the api (`node dist/main.js`) and the worker (`node dist/worker.js`).

## 5. Deployment procedure
Step-by-step deploy and rollback; smoke tests after deploy.

## 6. Backups
What, where, how often, encryption, retention of backups, verification.

## 7. Monitoring
Health checks, logs, metrics, alerts for the IT team.

## 8. Capacity
Sizing from NFR-31, storage growth reporting, scaling path.
