# NON-FUNCTIONAL REQUIREMENTS

Status: complete first draft, task T0.1 (2026-10-10). Sources: blueprint B7 (offline), B8 (security), B10 (performance and field reality), D2; constitution §9, §10; design brief UX-03, UX-05, UX-06. Requirements the blueprint states are marked **decided**. Measurable targets the blueprint does not give are marked **PROPOSAL** and need the owner's (or the IT team's) approval; where an open question exists its number is given (see `docs/DECISION_LOG.md`, section "Open"). Each requirement has an id NFR-nn so tests and ADRs can cite it.

## 1. Users, load and concurrency

| Id | Requirement | Source | Status |
|---|---|---|---|
| NFR-01 | About 2,000 volunteers work concurrently on a distribution day; server and database are designed for this load and a load test runs before each field rollout | B10, §10 | decided |
| NFR-02 | Load-test pass criteria (k6, before the Phase 3 pilot and before every field rollout): 2,000 virtual users over 30 minutes on the distribution-day mix (today's distribution save, photo upload start, application submit, sync batch, NID lookup) with error rate below 0.5% and the p95 targets of section 2 met | §14, PLAN T3.4 | PROPOSAL |
| NFR-03 | Officials' screens (review queue, approval, lookup, profiles, dashboards) serve tens of concurrent officials; this is not the sizing driver | A4, UX-03 | decided |

## 2. Response time (p95, measured at the API from the organization's server; network time excluded)

| Id | Endpoint or action | Target | Status |
|---|---|---|---|
| NFR-04 | NID / birth-registration lookup | 300 ms | PROPOSAL |
| NFR-05 | Application submit (text only) | 500 ms | PROPOSAL |
| NFR-06 | Sync batch of up to 50 records | 2 s | PROPOSAL |
| NFR-07 | Today's distribution bulk save (up to 50 rows) | 1 s | PROPOSAL |
| NFR-08 | Review queue page (25 rows with score and quota) | 800 ms | PROPOSAL |
| NFR-09 | Dashboard cards (project level) | 2 s, with cached aggregates refreshed at most every 5 minutes | PROPOSAL |
| NFR-10 | Export of up to 10,000 rows to CSV/Excel | generated as a background job within 60 s; larger exports paginated into files | PROPOSAL |
| NFR-11 | Every list endpoint is paginated (default 25, max 100 rows); nothing returns an unbounded list | B10 (data use), §10 | decided |

## 3. Devices, browsers and payload

| Id | Requirement | Source | Status |
|---|---|---|---|
| NFR-12 | Works on low-cost Android phones with 2 GB RAM and older browsers; heavy libraries and large screens avoided | B10, §10 | decided |
| NFR-13 | Primary target Android Chrome; also iOS Safari and installed iOS PWAs (storage eviction, no background sync, push only when installed, Bangla install guidance) | UX-06 | decided |
| NFR-14 | Browser support: the last 2 major versions of Chrome and Safari plus Android WebView and Chrome on Android from version 90; Firefox desktop current; no Internet Explorer | — | PROPOSAL |
| NFR-15 | Initial JavaScript payload of the volunteer PWA (first route, compressed) at most 250 KB; the rest loaded on demand; fonts precached by the service worker | B10 (first load), UX-13 | PROPOSAL |
| NFR-16 | Time to interactive on a 3G profile (1.6 Mbps, 300 ms RTT) under 5 s for the volunteer home after the first install | B10 | PROPOSAL |
| NFR-17 | Officials' screens fully usable at 360 px width; setup screens desktop first with a phone notice | UX-03, UX-04 | decided |

## 4. Network and offline

| Id | Requirement | Source | Status |
|---|---|---|---|
| NFR-18 | 2G/3G and intermittent connectivity assumed; small requests; automatic retry with backoff | B10, B7 | decided |
| NFR-19 | Everything field-facing works offline: application capture, today's distribution, today's class, construction updates, visits, follow-ups; records queue with client_uuid and sync when the network returns; nothing is lost | B7, Q-23, §10 | decided |
| NFR-20 | Text syncs before photos; photos in a separate compressed queue; no completion while photos are pending | B7 | decided |
| NFR-21 | Offline data set per device: current form versions of assigned projects, own beneficiaries and applications, syllabus, locations | B7 | decided (open question 7 for the budget) |
| NFR-22 | Offline storage budget per device: photo queue up to 200 MB (decided, O-07); structured data up to 50 MB; the app warns at 80% and blocks new photos at 100% until sync (the 50 MB and warning levels remain PROPOSAL) | B7, O-07 | decided (O-07) for the photo queue; rest PROPOSAL |
| NFR-23 | Sync conflict rules as BD-48; "needs verification" state for NID collisions | B7, Q-43 | decided |

## 5. Photos and files

| Id | Requirement | Source | Status |
|---|---|---|---|
| NFR-24 | Images compressed on the phone before upload; resumable (chunked) upload that continues where it stopped | B10, §9 | decided |
| NFR-25 | Maximum photo size after compression 300 KB at the longest edge 1,600 px (JPEG quality about 80); originals are not kept on the server | B10 | PROPOSAL |
| NFR-26 | Each photo keeps capture date-time and GPS where available; EXIF is read on the device before compression and stored as metadata | A8.1, BD-21 | decided |
| NFR-27 | Upload validation: allowed types (JPEG, PNG, WebP for photos; PDF, JPEG, PNG for vouchers and documents), size limits (photos 5 MB before compression, documents 20 MB), virus-scan hook | §13 | decided (limits PROPOSAL) |
| NFR-28 | Private files served only through signed URLs that expire within 15 minutes, after an authorization check | B8, §9 | decided (expiry PROPOSAL) |

## 6. Data volume, retention and storage growth

| Id | Requirement | Source | Status |
|---|---|---|---|
| NFR-29 | Retention is permanent for audit log, beneficiary history, photos and documents; no deletion | B8, Q-39, BD-46 | decided |
| NFR-30 | The system reports storage growth (database and object storage, per month and per project) to the IT team on an admin screen and in a monthly email | B10, BD-46 | decided (channel PROPOSAL) |
| NFR-31 | Sizing assumption for the IT team: roughly 100,000 applications per year with an average of 2 photos of 300 KB each gives about 60 GB of photos per year plus documents; the database stays under 20 GB per year | B10 | PROPOSAL (estimate only) |
| NFR-32 | Business data is never hard-deleted; soft delete only where approved | §2, §13 | decided |

## 7. Availability, backup and recovery

| Id | Requirement | Source | Status |
|---|---|---|---|
| NFR-33 | Availability target 99.5% per month during distribution seasons, measured on the login and sync endpoints; planned maintenance announced in-app and outside field hours | §10 | PROPOSAL |
| NFR-34 | Daily automatic backup to a separate location with regular restore tests | B8 | decided |
| NFR-35 | RPO 24 hours initially (daily `pg_dump` plus MinIO mirror), 1 hour once WAL archiving is enabled; RTO 4 hours; restore drill monthly with a written result in `docs/ops/RUNBOOK.md` | §10, O-06 | decided (O-06); IT team to confirm feasibility |
| NFR-36 | A phone that is lost or stolen can have its device session revoked by an official; local data is wiped on logout or revocation | B10, B7 | decided |

## 8. Security and privacy

| Id | Requirement | Source | Status |
|---|---|---|---|
| NFR-37 | Server-side authorization on every endpoint, default deny; object- and function-level checks; no IDOR | B4, §2, §13 | decided |
| NFR-38 | Field-level protection of NID, bank, ratings, categories, donor data and official section, on screens and in exports | B8 | decided |
| NFR-39 | OWASP baseline: input validation, CSRF/XSS protection, session hardening, safe uploads, dependency scanning, no secrets in code or logs, errors without stack traces or SQL | §13 | decided |
| NFR-40 | Authentication parameters: minimum password 8 characters with a letter and a digit (12 for Department Head and Monitoring Team); access token 15 minutes; refresh token 30 days bound to the device session and revocable; hard session limit 180 days; idle timeout 12 hours for official desktop sessions; at most 5 devices per user; lock 15 minutes after 5 failed attempts; role or permission change forces a session refresh; OTP (6 digits, 5 minutes, 5 attempts) for registration and password reset only | B8, O-05, O-25 | decided (O-05, O-25) |
| NFR-41 | Rate limiting: authentication endpoints 10 attempts per minute per account and IP; public application form 20 submissions per hour per IP; OTP requests 5 per hour per number | §13 | PROPOSAL |
| NFR-42 | Sensitive data on the phone encrypted at rest; TLS everywhere; database and object storage reachable only from the application network | B7, B8 | decided (network rule PROPOSAL) |
| NFR-43 | Every security-relevant action audited per constitution §13; exports of sensitive data logged | §13 | decided |

## 9. Localization and accessibility

| Id | Requirement | Source | Status |
|---|---|---|---|
| NFR-44 | Bangla and English first-class, switchable per user; bilingual data fields; a third language without rewrite | B9, §11 | decided |
| NFR-45 | English digits 0–9 for all numbers in both languages via one formatting utility | UX-05 | decided |
| NFR-46 | Accessibility: keyboard navigation, visible focus, semantic HTML, labels, contrast per `docs/ui/brand/colors.md` (AA), screen-reader names; axe checks on key screens with zero serious violations | §10, §14 | decided (axe threshold PROPOSAL) |
| NFR-47 | Touch targets at least 44 × 44 px on phone layouts | UX-02 | PROPOSAL |

## 10. Deployment, environments and operations

| Id | Requirement | Source | Status |
|---|---|---|---|
| NFR-48 | Hosting on the organization's own server; nothing cloud-dependent at runtime | B9, Q-40, BD-45 | decided |
| NFR-49 | Four environments: development, test, staging, production; secrets never committed; production data never used in tests; dummy OTP and seed data never in production | §9, BD-49 | decided |
| NFR-50 | One deployable backend, one database, one PWA frontend; background jobs in the same deployment | §2, §9 | decided |
| NFR-51 | Deployment pipeline with smoke tests exists before the Phase 3 pilot (PLAN T3.0); `docs/ops/DEPLOYMENT.md` and `RUNBOOK.md` describe deploy, rollback, backup and restore | §14, PLAN | decided (timing from the plan) |
| NFR-52 | Observability from launch: structured JSON logs without secrets or personal data, request ids, liveness and readiness health checks, a protected Prometheus-format `/metrics` endpoint (request rate, latency, queue depth, sync failures, storage), job states on an admin screen, and essential error alerting (failed jobs, elevated 5xx rate, readiness failures → in-app alert to the Monitoring Team and email to IT); a dedicated error-tracking service may be added later (T3.0) | §13, D-057 | decided (D-057) |
| NFR-60 | Production workers support retries with backoff, per-job timeouts, graceful shutdown on SIGTERM and idempotent handlers; `JOBS_INLINE=true` is impossible in production | D-054 | decided (D-054) |
| NFR-61 | Network exposure: only ports 80 and 443 are public; HTTPS enforced with redirect and HSTS; PostgreSQL, MinIO admin API and the worker are reachable only on the Docker internal network | D-056 | decided (D-056) |

## 11. Maintainability and quality

| Id | Requirement | Source | Status |
|---|---|---|---|
| NFR-53 | Business logic (score, zakat, budget math, form evaluator, permission names) lives once in `packages/shared` and is used by API and UI | §13 | decided (location depends on D-050) |
| NFR-54 | OpenAPI drift test: the generated spec must match `docs/api/openapi.yaml` in CI | §13, D-051 | decided (tooling depends on D-051) |
| NFR-55 | Every migration reversible with a hand-written `down.sql` | §9 | decided (depends on D-051) |
| NFR-56 | Test pyramid per constitution §14 executed in CI: lint, typecheck, unit, API, E2E; load, accessibility and security tests before each gate | §14 | decided |
| NFR-57 | Documentation and code change in the same commit (PROJECT_RULES §5) | §2 | decided |

## 12. Training and support (from the blueprint D2)

| Id | Requirement | Source | Status |
|---|---|---|---|
| NFR-58 | Short in-app videos and a Bangla guide; one training session for RPMs and 20–30 volunteers before each pilot; 1–2 champion volunteers per region | D2 | decided |
| NFR-59 | "Report a problem" button sending a ticket with screenshot and device data to the IT team; helpline during distribution seasons | D2 | decided |

## 13. Open items for this document

| Open question | NFR ids |
|---|---|
| 5, 6, 7: answered 2026-10-10 (O-05, O-06, O-07) | NFR-40, NFR-35, NFR-22 now decided |
| IT team approval of availability, sizing, network rules and the backup targets' feasibility | NFR-31, NFR-33, NFR-35, NFR-42 |
| All other PROPOSAL rows: owner confirms or changes in T0.21 (test strategy and security policy) | NFR-02, 04–10, 14–16, 22 (50 MB part), 25, 27, 28, 30, 41, 46, 47 |
