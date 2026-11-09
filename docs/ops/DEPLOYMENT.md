# DEPLOYMENT

Status: outline, written in task T0.1 (2026-10-10); completed in task T3.0 (pipeline, staging, backup before the pilot) and finalized in task T6.5 (production hardening). D-053 approved (O-01); backup targets decided (O-06: RPO 24 h then 1 h with WAL, RTO 4 h, monthly drill); server details still to be supplied by the owner.

## 1. Environments
Development (Docker Compose), test (CI), staging and production on the organization's server; configuration and secrets per environment.

Development (ORG-DEV-01, T1.7d): `docker compose up` from the repository root runs the whole ERP — `infra/docker-compose.dev.yml` (PostgreSQL 17, MinIO, Mailpit) plus `infra/docker-compose.app.yml` (one-shot `setup` and `migrate`, then `api` and `web` from the development image `docker/app/Dockerfile.dev`, the repository bind-mounted, dependencies in volumes, dev-only placeholder secrets, dummy OTP). Nothing of it is used beyond a developer's machine: staging and production get their own compose project, images and secrets (T3.0).

## 2. Topology
Reverse proxy with TLS, API, web, workers, PostgreSQL, object storage, mail relay; ports and networks.

Web (D-073, ADR-013): the PWA is static files (`apps/web/dist` from `pnpm --filter @css/web build`); Caddy serves them with the SPA fallback (every unknown path returns `index.html`), long cache headers for `assets/*` (content-hashed) and no cache for `index.html`, `sw.js` and `manifest.webmanifest`, and routes `/api/v1/*` to the API on the same origin (the refresh cookie and CSRF need it, AUTH.md 5). No Node process runs for the web app. The API's `TRUST_PROXY` names Caddy's address (D-072). Caddy's access log records paths without query strings, because list searches carry names, mobile numbers and NIDs in the query (O-67). Written in full in T3.0.

## 3. Build and release
Build steps, versioning, release checklist, database migrations with `down.sql`, zero-downtime considerations.

## 4. Configuration
Environment variables (names only, never values), SMTP and SMS provider settings, dummy OTP disabled in production (BR-024).

API and worker variables (T1.6; schema in `apps/api/src/config/env.ts`): `NODE_ENV`, `PORT`, `DATABASE_URL`, `LOG_LEVEL`, `CURSOR_SECRET`, `HEALTH_TOKEN`, `JOBS_INLINE` (must be false in production), `STORAGE_DRIVER` (no default; `s3` = MinIO through the S3 API, `filesystem` is for tests only, D-074), `MINIO_ENDPOINT`, `MINIO_PORT`, `MINIO_USE_SSL`, `MINIO_ACCESS_KEY`, `MINIO_SECRET_KEY`, `STORAGE_FS_ROOT` (tests only), `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASSWORD`, `SMTP_FROM`, `SMS_MODE`; since T1.7 `JWT_SECRET`, `JWT_PREVIOUS_SECRET` (only during a key rotation), `AUTH_CSRF_SECRET`, `OTP_SECRET` (each a random value of at least 32 characters, different per environment), `OTP_DUMMY_ENABLED` (must be false in production), `OTP_DUMMY_CODE` (development and test only), `AUTH_COOKIE_SECURE` (must be true in production), `TRUST_PROXY` (Caddy's address or network so the API sees the user's address, D-072; default `loopback`), `RATE_LIMITS_RELAXED` (E2E only, refused in production), `SESSION_DEVICE_LIMIT_RELAXED` (E2E only, the device limit a hundredfold because the specs share the demo accounts; refused in production, D-102); since T1.8 `PERMISSIONS_FILE` (optional path of `permissions.yaml`; by default the API and the worker read `docs/security/permissions.yaml` relative to their build, so the T3.0 images must contain that file; both refuse to start when it is missing or invalid). Since T1.13 `SMS_API_KEY` (optional; the SMS provider's key once one is chosen, O-33; the channels page shows only whether it is set) and `APP_VERSION` (the release shown on the system health page; set it per deployment). Since T2.7 `LOCAL_KEY_SECRET` (a random value of at least 32 characters, different per environment; seals the device keys of sessions in the database, AUTH.md §5; production refuses the example value) and `LOCAL_KEY_PREVIOUS_SECRET` (only during a rotation). Since T2.1 `FILE_SCANNER` (the virus scanner of uploaded files; `skip` exists for development and test only and production refuses it, so the first deployment adds the organization's scanner, ClamAV on its own server by default, D-109; a staging server that holds real data runs the real scanner too, since `skip` lets unscanned files be viewed outside production). The worker processes uploaded files on the `photos` queue (scan, photo metadata, thumbnails, near duplicates) with sharp, whose prebuilt binary for linux-x64 glibc comes with `pnpm install` on the image. Start-up order: the storage buckets of `infra/minio/bootstrap.sh` (every bucket of FILES_AND_DOCUMENTS §8, incl. `uploads` with its two-day expiry; the readiness probe fails while one is missing), `pnpm db:migrate` (Prisma migrations, then the pg-boss schema and queues, D-069), then the api (`node dist/server.js`) and the worker (`node dist/worker.js`).

Exports (T2.8, D-143, D-144): the worker consumes the `exports` queue and runs the daily export sweep at 03:30 Dhaka time. The PDFs are printed by the Chromium of `playwright-core` inside its sandbox, which the owner approved for the worker host (D-144). On the worker host, as root:

1. Run the worker as its own non-root user (for example `css-erp`); Chromium refuses its sandbox to root.
2. Install Chromium where the profile expects it: `PLAYWRIGHT_BROWSERS_PATH=/opt/css-erp/ms-playwright pnpm --filter @css/api exec playwright-core install --with-deps chromium` (about 170 MB), and give the worker the same `PLAYWRIGHT_BROWSERS_PATH` in its environment.
3. On Ubuntu 23.10 or later, open user namespaces to Chromium alone: `cp infra/apparmor/css-erp-chromium /etc/apparmor.d/css-erp-chromium` and `apparmor_parser -r /etc/apparmor.d/css-erp-chromium`. Leave `kernel.apparmor_restrict_unprivileged_userns` at 1; the host-wide switch is for the throwaway CI runners only.
4. A worker in a container keeps Docker's user namespaces closed unless it runs with Chromium's seccomp profile (`--security-opt seccomp=<profile>`); never `--privileged`, and never `--no-sandbox`.
5. Check it as the worker user, from `apps/api`: `node -e "require('playwright-core').chromium.launch({ chromiumSandbox: true }).then((b) => b.close()).then(() => console.log('sandbox ok'))"` prints `sandbox ok`.

The PDFs embed Public Sans and Noto Sans Bengali, read from the API's own dependencies `@fontsource-variable/public-sans` and `@fontsource-variable/noto-sans-bengali` (`apps/api/src/exports/pdf/fonts.ts`), so the worker's image needs the API's installed production dependencies (until D-150 the fonts came from `packages/ui/fonts/`). Without the sandbox or the fonts, PDF jobs fail with `export.pdf_unavailable` while Excel and CSV keep working. Plan about 1 GB of memory for the worker with one large Excel export running (docs/testing/PERFORMANCE.md, "Exports").

## 5. Deployment procedure
Step-by-step deploy and rollback; smoke tests after deploy.

## 6. Backups
What, where, how often, encryption, retention of backups, verification.

## 7. Monitoring
Health checks, logs, metrics, alerts for the IT team.

## 8. Capacity
Sizing from NFR-31, storage growth reporting, scaling path.
