# DEPLOYMENT

Status: outline, written in task T0.1 (2026-10-10); completed in task T3.0 (pipeline, staging, backup before the pilot) and finalized in task T6.5 (production hardening). Depends on D-053 and on the server details the owner supplies.

## 1. Environments
Development (Docker Compose), test (CI), staging and production on the organization's server; configuration and secrets per environment.

## 2. Topology
Reverse proxy with TLS, API, web, workers, PostgreSQL, object storage, mail relay; ports and networks.

## 3. Build and release
Build steps, versioning, release checklist, database migrations with `down.sql`, zero-downtime considerations.

## 4. Configuration
Environment variables (names only, never values), SMTP and SMS provider settings, dummy OTP disabled in production (BR-024).

## 5. Deployment procedure
Step-by-step deploy and rollback; smoke tests after deploy.

## 6. Backups
What, where, how often, encryption, retention of backups, verification.

## 7. Monitoring
Health checks, logs, metrics, alerts for the IT team.

## 8. Capacity
Sizing from NFR-31, storage growth reporting, scaling path.
