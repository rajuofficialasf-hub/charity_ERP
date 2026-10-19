# TEST STRATEGY

Status: complete for Phase 0, written in task T0.21 (2026-10-10). Binding for every task from T1.1 on and for every phase gate. Sources: constitution §9, §14, §15; PROJECT_RULES §6 and §7; NFR-01, NFR-02, NFR-04 to NFR-10, NFR-46, NFR-49, NFR-51, NFR-54 to NFR-56; RBAC.md §10; OFFLINE_SYNC.md §13; I18N.md §12; decisions D-054, O-29, O-30, O-46 in `docs/DECISION_LOG.md`. Security rules that the tests prove are in `docs/security/SECURITY_POLICY.md`.

## 1. Principles

1. **Tested means executed.** A test counts only when it ran in the current session or CI run and its command and summary output are shown (constitution §2, §15).
2. **Testing is part of every task.** Each task adds or updates the tests for the behaviour it changes in the same commit; there is no separate "testing phase".
3. **Every testable business rule has a test.** BUSINESS_RULES.md names the test type per rule; the test-status register (§7) records the executed test.
4. **Real dependencies where it matters.** Integration and API tests use a real PostgreSQL 16, never a mocked database (O-46 item 1).
5. **No production data, ever.** Tests use deterministic seeds and factories with obviously fake identities (§4, NFR-49, BD-49).
6. **Never weaken a check to make a test pass.** A failing security, validation or authorization test is fixed in the code or reported; it is never disabled (constitution §15).

## 2. Pyramid and tools

| Layer | Tool | Lives in | Runs |
|---|---|---|---|
| Unit | Vitest | `packages/shared/**/*.test.ts`, `apps/api/src/**/*.spec.ts`, `apps/web/src/**/*.test.{ts,tsx}` | every push |
| Component | Vitest + React Testing Library + MSW (handlers typed from `openapi.yaml`) + axe-core | `apps/web`, `packages/ui` | every push |
| Integration | Vitest against PostgreSQL 16 (docker-compose test profile), one database per test file cloned from a migrated template | `apps/api/test/integration` | every push |
| API and contract | Supertest + the contract recorder (Ajv against `openapi.yaml`, every response of both API Vitest projects, coverage per operation); drift test; Redocly lint | `apps/api/test/support/contract.ts`, `apps/api/test/api`, `docs/api/redocly.yaml` | every push |
| Authorization matrix | Generated Supertest suite from `permissions.yaml` and the OpenAPI `x-permission`/`x-scope` annotations | `apps/api/test/authz` | every push |
| E2E | Playwright (Chromium; WebKit for iOS behaviour; offline emulation; throttled 3G profile) | `apps/web/e2e` | smoke subset every push; full nightly and before gates |
| Accessibility | axe-core inside component tests and Playwright | with the tests above | every push (smoke), full before gates |
| Visual regression | Playwright `toHaveScreenshot` | `apps/web/e2e/visual` | nightly and before gates |
| Load | k6 | `tests/load` | before the Phase 3 pilot and every field rollout (T3.4) |
| List measurement | `perf:seed` and `perf:lists` on the large data set in css_erp_perf ([PERFORMANCE.md](PERFORMANCE.md)) | `apps/api/scripts/perf-*.ts` | when a nationwide list, its filters or its indexes change (T1.10) |
| Security scans | `pnpm audit`, gitleaks, ESLint security rules, OWASP ZAP baseline (Docker) | CI configuration | audit and gitleaks every push; ZAP before gates from Phase 3 |
| Smoke | Playwright + HTTP checks against the deployed environment | `tests/smoke` | after every deployment (NFR-51) |
| Device matrix and UAT | Manual Bengali scripts | `docs/testing/uat/` | before each gate |

Test environment for automated layers (O-46 item 1): object storage through the local-filesystem adapter (ADR-005), email to Mailpit, SMS to the logging stub, jobs inline (`JOBS_INLINE=true`, test only, D-054), the dummy OTP (BD-44, BD-49), the clock injectable so deadlines, countdowns and token expiry are tested without waiting.

## 3. What each layer must cover

### 3.1 Unit

- Every business rule implemented as a pure function in `packages/shared`: priority score and criteria (BD-17), zakat net assets against the nisab snapshot (BD-28), budget buckets (BD-29), form logic and calculation evaluator (BD-12, BD-14), limits and deadlines (BD-16), stock reconciliation (BD-22), rating proposals (BD-40), working-day countdown (BR-166), permission and scope resolution helpers.
- The formatter and normalization of I18N.md §6 with the exact outputs (I18N §12).
- The offline outbox state machine, retry schedule and conflict rules (OFFLINE_SYNC §13, O-29).
- Workflow guards and effects as units against a template snapshot (WORKFLOW_ENGINE).

### 3.2 Integration

- Database constraints and triggers: unique NID and birth registration, unique `transaction_id`, `client_uuid`, (animal, assigned volunteer), the BD-03 volunteer-mobile trigger, published form immutability, `[L]` log tables append-only (O-46 item 9), `updated_at` backstop.
- Cross-module effects inside one transaction: approval posting to the ledger and quota, audit entries written with the business write, notifications queued in the outbox (NOTIFICATIONS §7).
- Jobs: retries, timeouts, idempotent handlers keyed by entity id or `client_uuid`, graceful shutdown (D-054, NFR-60).
- File pipeline: quarantine until the scan is clean, EICAR rejected, a stopped scanner never marks a file clean (O-30, O-46 item 7).

### 3.3 API and contract

- Every endpoint: success, validation errors with codes, authentication failure, permission denial, out-of-scope 404, stale `If-Match` 412, idempotent replay, pagination and rate limit where declared (API_STANDARDS).
- Every response validated against the `openapi.yaml` schema of that operation (O-46 item 2) by the **contract recorder** (`apps/api/test/support/contract.ts`, T1.16): the test app is wrapped in an outer Express app that records every response under `/api/v1` — the JSON body, or the absence of one for a 204 or a streamed file — finds its operation in the YAML (a static path before a parameter), and validates the body with Ajv 2020 and ajv-formats against the declared response schema (the JSON Schemas of `docs/database/json-schemas` and the workflow template schema are registered under their relative paths). An undeclared 4xx/5xx must still be the shared `ErrorResponse`; an undeclared 2xx, a missing JSON body where one is declared, or a schema Ajv cannot compile is a violation. The setup file `apps/api/test/support/setup.ts` (both API Vitest projects) fails the test that produced a violation, so a schema that disagrees with the real answer cannot stay green. Paths the YAML does not know are test probes and are recorded without an operation. The body validated is the value the client receives (`JSON.parse(JSON.stringify(body))`, so a `Date` is a string). Every response is also appended as a coverage line to `apps/api/test-results/contract/<project>/<pid>.jsonl`, the project's folder emptied once per run by `test/support/contract-global-setup.ts`; `pnpm --filter @css/api contract:coverage` runs both API projects and lists every registered operation whose success status no test answered (`--no-run` reads the lines of the last run of each project); CI runs it after `pnpm test`, so a new operation needs its happy-path test before it merges. The recorder's own tests point the recorder at a scratch folder, so their probes never count as coverage.
- **Drift test** (NFR-54): the document generated from the route registry (`buildOpenApiDocument`, every `defineRoute` declaration) is compared with `docs/api/openapi.yaml`; any difference fails CI. A contract change therefore needs a deliberate edit of `openapi.yaml` in the same commit (constitution §13).
- Redocly lint of `openapi.yaml` with `docs/api/redocly.yaml`.

### 3.4 E2E: critical journeys (constitution §14)

| # | Journey | Gate that requires it | Task |
|---|---|---|---|
| 1 | Login and logout; role-based denial for every role | Phase 1 | T1.16 |
| 2 | Volunteer registration with two OTPs, correction, approval | Phase 1 | T1.16 |
| 3 | Mobile application with NID auto-fill, offline capture and sync, needs-verification path | Phase 2 | T2.9 |
| 4 | Review, score, waitlist, approval, field unlock | Phase 2 | T2.9 |
| 5 | Application transfer | Phase 2 | T2.9 |
| 6 | Today's distribution with photos and stock reconciliation | Phase 3 | T3.5 |
| 7 | Expense claim and payment record with unique transaction id | Phase 3 | T3.5 |
| 8 | House-construction issue raise and resolve | Phase 4 | T4.6 |
| 9 | Self-reliance exam, then payment, then voucher lock | Phase 4 | T4.6 |
| 10 | Qurbani animal allocation exclusivity | Phase 4 | T4.6 |
| 11 | Document deadline warning and deficiency report | Documentation module (built last, O-34) and Phase 6 | T5.4, T6.6 |
| 12 | Language switch (persistence, offline, inbox re-rendered) | Phase 1 | T1.16 |

Additional E2E coverage per phase is listed in the gate test tasks of `docs/PLAN.md` (T1.16, T2.9, T3.5, T4.6, T5.6). Journeys run on Chromium; journeys 2, 3, 6 and 12 also run on WebKit for iOS behaviour (NFR-13).

The Phase 1 checklist (T1.16): each journey of the gate and the Playwright spec that runs it in `apps/web/e2e/`, on the `mobile` (Pixel 7, Chromium) and `desktop` (Chromium) projects unless the spec says one of them; `auth.spec.ts`, `registration.spec.ts` and `home.spec.ts` also run on the `iphone` project (WebKit, iPhone 13; NFR-13, UX-06) with its own accounts, so the phone registration, the sign-in, the devices and every role's home are proven on the iOS engine too (the password screens are changed on Chromium only). `isPhone(info)` in `e2e/support/admin.ts` names both phone projects.

| Journey | Spec and test |
|---|---|
| Login and logout; the session survives a reload; a device is logged out from another one and has to log in again | `auth.spec.ts` (logs in, logs out and refuses the protected page afterwards; keeps the session across a reload; lists the devices and logs out another one) |
| Role-based denial for every role: the forbidden screen and the API's 403 `permission.denied` | `roles.spec.ts` (one test per demo role: volunteer, Finance, Media, Procurement, Official দায়ী, Implementer, Project Executive, RPM, PM; the Department Head and the Monitoring Team hold every permission, so they have no row) |
| Volunteer registration with two OTPs → correction request → resubmit → approval → assignment → consent → the project visible | `registration.spec.ts` (a volunteer registers with two codes and reaches the pending confirmation, on the phone; an RPM asks for a correction, the volunteer fixes it, the RPM approves, then the RPM assigns the volunteer to a project of this run, who consents and sees it active) |
| A team member: added by the main volunteer, consents on their own, sees the project | `registration.spec.ts` (a main volunteer adds a team member, who consents on their own and then works on the project; the NID reference comes from the demo seed, since O-64 removed it from the registration form, BUSINESS_RULES section 20 item 25) |
| Staff handover before deactivation | `handover.spec.ts` (deactivation waits for the handover of all pending work) |
| Permission panel change with its audit entry | `admin-permissions.spec.ts` (a manager grants a permission and ends it again, and finds the grant with its reason in the audit log) |
| Project draft → activate → close → reopen; a draft cancelled; a copy of a previous project | `projects.spec.ts` (a PM walks the setup wizard, activates, closes and reopens a project; a draft that was never activated is cancelled; a PM copies a previous project) |
| Language switch that persists | `registration.spec.ts` (the registration page switches to English from the bar and keeps it), `gallery.spec.ts` (the language switch turns the gallery to English and back, and the choice persists) |
| Device revocation ends the session | `auth.spec.ts` (lists the devices and logs out another one, which then has to log in again) |
| A threshold changed and audited; nisab versions | `admin-settings.spec.ts` |
| The shell: bottom tabs, sidebar, profile menu, offline banner; each role's home | `shell.spec.ts`, `home.spec.ts` |

### 3.5 Load (NFR-01, NFR-02)

- Scenario: 2,000 virtual users over 30 minutes on the distribution-day mix (today's distribution bulk save, photo upload start, application submit, sync batches, NID lookup) against staging with production-like data volume.
- Pass criteria: error rate below 0.5 % and the p95 targets NFR-04 to NFR-10 met; database query plans checked for the hot paths.
- Schedule: before the Phase 3 pilot and before every field rollout (T3.4, RUNBOOK distribution-day readiness).

### 3.6 Accessibility (NFR-46)

- axe-core with zero violations on every screen in bn and en, at phone and desktop width.
- The Phase 1 sweep (T1.16): `apps/web/e2e/a11y.spec.ts` opens every built Phase 1 screen of `docs/ui/SCREENS.md` section 2 on the `mobile` and `desktop` projects, switches the language on the page (`switchLanguage` in `e2e/support/admin.ts`: the switch of the bar, or the profile menu on a phone) and runs axe in bn and en: signed out `/login`, `/login/reset`, `/register` and the expired-link state of `/invite`; as a volunteer `/`, `/account/profile`, `/account/sessions`, `/account/password`, `/notifications`, `/my-projects` and the first project; as a main volunteer the project and `/my-projects/:id/team`; as the Department Head `/`, the volunteer, beneficiary, registrations, staff, organogram, handover, programs, templates, projects (list, new, the first project with its setup and volunteers), settings, nisab, audit, sessions, health, notification texts, deliveries and permissions pages, the first volunteer and the first beneficiary. A record page whose list is empty is left out with a note on the test; a role never opens a page it may not. Component-level axe runs in every `packages/ui` and `apps/web` component test and in `e2e/gallery.spec.ts`.
- Keyboard-only walkthrough of the review queue, the form renderer and the permission panel before each gate (manual, in the UAT script).

### 3.7 Visual regression (O-46 item 4)

- Key screens of `docs/ui/SCREENS.md` §11 at 360, 768 and 1280 px in bn and en, with the self-hosted fonts loaded for deterministic rendering.
- Baselines are committed; a changed baseline is reviewed like code; threshold 0.1 % of pixels.

### 3.8 Security tests

| Test | Rule |
|---|---|
| Authorization matrix (generated, O-46 item 3) | For every endpoint and role: in scope 2xx, out of scope 404, no grant 403, unauthenticated 401; explicit fixtures for conditions (`if_rpm_grants`, `own_created`, `house_construction_only` and the others in permissions.yaml) |
| IDOR (RBAC §10) | Cross-project, cross-region and cross-volunteer reads and writes by every project role; batch endpoints report per-record denial |
| Field-level masks | Every `sensitive_fields` class absent for every non-permitted role in JSON, CSV, XLSX and PDF (one serializer, NFR-38) |
| Authentication | Lockout after 5 failures, token expiry and rotation, refresh CSRF check, device revocation ends the session and wipes local data, permission change forces a refresh (AUTH.md) |
| Rate limits | Each class of API_STANDARDS §10 returns 429 with `Retry-After` |
| Upload | Type, size, path traversal in names, quarantine, EICAR; API-streamed file access (D-074): permission and scope checked on every request to `/files/{id}/content`, an out-of-scope or revoked caller answers 404 or 403 at once, no file reachable without a token, responses carry `Cache-Control: no-store` and `nosniff` |
| Errors | No stack trace, SQL or internal path in any error response |
| Secrets | gitleaks finds nothing; production configuration refuses dummy OTP and seed markers (O-46 item 8) |
| Dependencies | `pnpm audit` without high or critical findings, or a recorded exception |
| Dynamic scan | OWASP ZAP baseline against staging before every gate from Phase 3 |

### 3.9 Data integrity

- Unique constraints and idempotency: the same `client_uuid` twice creates one record; the same `Idempotency-Key` replays the first response; a second payment on the same claim is rejected (BD-31); the same transaction id is rejected.
- Transactions: a failure in any step of a multi-write service leaves no partial rows (approval, merge, transfer, handover).
- Migrations (NFR-55): in CI every migration is applied up, then all down, then up again on a seeded database; each `down.sql` restores the previous schema exactly (schema dump compared).
- No hard delete: tests assert that business tables have no delete path in services (NFR-32).

### 3.10 Offline and sync

All cases of OFFLINE_SYNC.md §13 and O-29: offline capture and sync, drops mid-batch and mid-chunk, `Retry-After`, authentication expiry with pending records, storage exhaustion, conflict rules of BD-48, iOS eviction simulation; device-matrix steps in the UAT script.

### 3.11 Localization

All tests of I18N.md §12: formatter outputs, NFC normalization, catalogue and lint checks, fallback, server-side language, publish refusal for missing translations, 360 px screenshots in both languages, PDF snapshot.

### 3.12 Smoke tests after each deployment

Health and readiness endpoints; login with a dedicated smoke account; one read and one write in a dedicated smoke project; a private file streamed through its authorized API route (and refused without a token); the job queue processes a no-op job; the version header matches the release. A failing smoke test triggers the rollback in DEPLOYMENT.md (T3.0).

## 4. Test data strategy (O-46 item 8)

| Layer | Content | Used by |
|---|---|---|
| Reference seed | Locations, reference lists (O-38), roles and permissions, workflow templates, settings with defaults | every environment except production data import |
| Demo seed per phase | Demo accounts per role, sample programs and projects, applications in every state | development, staging, UAT |
| Scenario fixtures | Factories in `packages/shared/testing` building exactly the rows a test needs | unit, integration, API, E2E |

- Deterministic: a fixed random seed, fixed clock in tests, stable UUIDs in fixtures where snapshots depend on them.
- Obviously fake identities: NIDs from 1000000000 to 1000099999, birth-registration numbers starting with 1000000, phone numbers 0170000xxxx, email addresses at example.org, demo names marked "(নমুনা)", donors and transaction ids prefixed `TEST-`.
- Anonymized sample forms from `docs/source/samples/` only after the owner supplies them; never real NIDs, phone numbers, bank details or donor data in the repository.
- The dummy OTP works in development and test. Production refuses to start when a seed marker row is present, and refuses dummy-OTP mode unless the explicit, time-limited pilot flag approved under O-49 is set; that flag is logged at every start (seed guard, SECURITY_POLICY §4, §20).
- Production data never flows to test, staging or a developer machine (NFR-49). A production problem is reproduced with fixtures.

## 5. Coverage expectations (O-46 item 5)

| Area | Minimum |
|---|---|
| Business-rule modules in `packages/shared` | 90 % of lines and branches |
| API services, guards and serializers | 80 % of lines |
| Web components and hooks | 70 % of lines |
| Business rules | Every testable BR has at least one executed test before the gate of its phase; otherwise the register marks it manual with a reason |
| Critical journeys | All journeys of §3.4 required by the gate pass |
| Endpoints | Every operation in `openapi.yaml` has at least one API test and appears in the authorization matrix |

There is no single global coverage number; coverage is reported per package by Vitest in CI and summarized in each gate report.

Enforcement (O-52, 2026-10-11): while business logic is largely absent, CI does not fail on coverage. Phase 1 reports coverage per package and lists untested code; before the Phase 1 gate (T1.16, T1.17) the enforcement strategy for these minimums is defined and switched on. Missing enforcement is never taken as evidence that code is adequately tested.

## 6. CI gate

CI runs on GitHub Actions (O-51), in `.github/workflows/ci.yml`. The pipeline fails on the first failing stage. State at T1.1: install, lint, typecheck, document checks (`pnpm docs:check`: YAML parse, template schema validation, JSON Schema compile, Redocly lint), unit and API tests with a PostgreSQL 16 service, build, `pnpm audit` and gitleaks run on every push; E2E (Chromium, mobile and desktop; since T1.16 also WebKit as an iPhone for the sign-in, registration and home specs) runs on pushes to main. Since T1.2 `pnpm test` also runs the Vitest project `api-db` (integration tests on per-file databases cloned from a migrated template, the migration round trip up-down-up with catalog snapshots, the down.sql completeness check and the Prisma schema-to-migrations drift check) against the CI PostgreSQL service (`TEST_DATABASE_URL`). Since T1.4 the Vitest project `ui` runs every design-system component with React Testing Library, user-event keyboard checks and axe in both languages, plus drift tests (tokens.css equals DESIGN_SYSTEM §2.9, no raw hex outside the tokens, translucent colours only from brand tokens, media queries only at the breakpoints, the Tailwind preset producing design-system utilities only, the UbuntuSans subset name and axes); `pnpm e2e` builds the web app with the dev-only component gallery (`build:e2e`, `CSS_DEV_GALLERY=1`) and `e2e/gallery.spec.ts` checks every component at 360×640 (mobile project) and 1280×800 (desktop project) in bn and en: all sections, no horizontal scroll, axe including colour contrast, keyboard flows (modal, confirm reason, tabs, combobox, date picker, table sort and selection, phone cards and filter sheet) and the served fonts and licence texts. Since T1.5 `pnpm lint` also runs `pnpm i18n:check` (catalogue parity, ICU, parameters, digits, error-code coverage, no Bengali script in code) and the ESLint rule `css/no-literal-ui-text`; `pnpm test` covers the formatter (every I18N §6 format, O-42 boundaries, day periods), translate fallback, locale resolution, NFC, the catalogue checker with seeded failures, the bilingual-column registry against the Prisma schema, notification rendering, the API error language and the users.language service; the E2E gallery spec switches the language. Since T1.7b the web app is a Vite SPA: component tests mount the screens inside the real providers and a memory router (`apps/web/test/auth.tsx`), route tests cover the route table and the error boundary, and Playwright runs `vite preview` (the E2E build) whose `/api/v1` proxy points at the E2E API. Since T1.7 the api-db project covers authentication on cloned databases (`test/integration/auth.test.ts`, `password.test.ts`, `sessions-users.test.ts` with a movable clock: login, lockout, account states, refresh rotation and reuse, idle and hard limits, device limit, revocation, user state with If-Match, lock clearing, password change and reset with the dummy OTP, audit rows without secrets), the web project the auth screens and the API client (MSW), and Playwright runs against a real API: `pnpm e2e` builds the API and `scripts/e2e-server.ts` recreates css_erp_test_e2e with the demo seed and the dummy OTP (rate limits relaxed for the one shared address, D-072); every E2E test uses its own demo account per project because mobile and desktop share the database. Since T1.6 the api and api-db projects also cover the backbone: envelope, request id, validation details in both languages, unknown parameters, malformed JSON, log redaction, rate limits with headers, audit enforcement, readiness, keyset pagination on a real table, the audit writer and rollback, idempotent replay under concurrency, pg-boss install, transactional enqueue, the sample job and its schedule, the in-app adapter, MinIO (presigned GET until expiry, presigned PUT) and Mailpit delivery; CI runs MinIO and Mailpit next to PostgreSQL (O-58). The OpenAPI drift test runs since T1.6 (`apps/api/test/api/openapi-drift.test.ts`); the authorization matrix and the nightly set are added by the tasks that create them.

| When | Stages, in order |
|---|---|
| Every push and pull request | 1. Install with the frozen lockfile. 2. Lint (including the i18n literal-text rule) and typecheck. 3. i18n catalogue check (I18N §4). 4. Unit and component tests with axe. 5. Integration and API tests, including the authorization matrix, every response validated by the contract recorder. 6. Contract: drift test, Redocly lint, and `contract:coverage --no-run` (every registered operation answered its success status in a test). 7. Migrations up, down, up. 8. Build. 9. E2E smoke subset with axe. 10. `pnpm audit` and gitleaks |
| Nightly and before every gate | Full E2E on Chromium and WebKit, visual regression, full axe in both languages, bundle-size check against NFR-15, OWASP ZAP baseline against staging (from Phase 3) |
| Before a field rollout | k6 load test (§3.5) |
| After every deployment | Smoke tests (§3.12) |

Merging to `main` requires the push stages to pass. Gate tags (`gate-phase-N`) require the nightly set to pass on the tagged commit.

## 7. How BUSINESS_RULES.md tracks test status

- Each rule row names the expected test type (unit, integration, API, E2E, manual, none).
- When a test exists and runs, the test-status register (BUSINESS_RULES §19) gets one line in the same commit, in exactly this form: `BR-nnn: <test file>::<test name> — passing (date; notes)`. The check reads the state from the form, never from a note: a line counts as tested only with a test file that exists and `— passing (date…)` at its end; `— failing (…)` and anything else count as untested.
- A test name says the behaviour it proves (the organization's comment rules keep ids out of code); the register line is the link between the rule and the test. Older tests that carry the id in their name stay as they are.
- A rule of a phase whose feature is not built yet gets a register line `BR-nnn: deferred to <task> (feature not built)` instead of a test — or `deferred to Phase <n> (<module>, feature not built)` while the task is not numbered yet; it counts as answered until that task. A rule only partly built gets a passing line for the built part with the rest named in the note, so the gate report shows what is still open.
- `pnpm rules:status --phase <n>` (`scripts/check-rules.mjs`) lists every testable rule of the phase's modules (the phase map of MODULE_CATALOG.md section 4; a rule with several modules belongs to every phase of them; `all` and `UI` rules belong to every phase) as tested, deferred, manual or untested, and reports a register line that names a file missing from the repository. `pnpm docs:check` runs it for Phase 1 and fails on an untested rule or a missing file; the gate report quotes its table (T1.16 and the later consolidation tasks).
- Rules tested only by hand (policy rules, physical procedures) are marked manual with the reason in the register; retired rules need no test.

## 8. Environments

| Environment | Purpose | Data | Tests that run there |
|---|---|---|---|
| Development | Developer machines, docker-compose | Reference and demo seed | All automated layers locally |
| Test | CI | One database per test file cloned from a migrated template (O-46), reference seed plus fixtures | Push and nightly stages |
| Staging | Release candidate on the organization's server | Demo seed and generated volume data for load tests | E2E against deployed build, ZAP, k6, UAT, smoke |
| Production | Field use | Real data | Smoke tests with the dedicated smoke account and project only |

## 9. What each phase gate must run

| Gate | BR coverage | API and contract | E2E journeys (§3.4) | Other required runs | Manual |
|---|---|---|---|---|---|
| Phase 1 (T1.16, T1.17) | Phase 1 modules | All Phase 1 endpoints, drift, authorization matrix | 1, 2, 12 plus the T1.16 list | axe on every Phase 1 screen in both languages; visual baselines created; migrations up/down/up | UAT script PHASE_1, keyboard walkthrough |
| Phase 2 (T2.9, T2.10) | Phase 2 modules | All Phase 2 endpoints, drift, matrix | 3, 4, 5 plus the T2.9 list | Offline and sync suite; bundle size and Lighthouse (NFR-15, NFR-16); exports per role | UAT PHASE_2, device matrix (Android 2 GB, iPhone Safari and installed PWA) |
| Phase 3 pilot (T3.4, T3.5, T3.6) | Phase 3 modules | Phase 3 endpoints, drift, matrix | 6, 7 | k6 distribution day (NFR-02); ZAP baseline; deployment smoke tests; backup and restore check on staging | UAT PHASE_3 on staging, pilot go-live checklist |
| Phase 4 (T4.6, T4.7) | Phase 4 modules | Phase 4 endpoints, drift, matrix | 8, 9, 10 | ZAP baseline; k6 again before a new field rollout | UAT PHASE_4 per project type |
| Phase 5 (T5.6, T5.7) | Phase 5 modules | Phase 5 endpoints, drift, matrix | — (journey 11 moves with the documentation module, O-34) | ZAP baseline; audit-log completeness check for every constitution §13 event | UAT PHASE_5 |
| Phase 6 (T6.3 to T6.6; documentation module T5.4 runs after T6.1, O-34) | Every BR tested or marked manual | Full suite | All 12 | T6.3 security audit (OWASP ASVS level 2 checklist), T6.4 performance audit, full restore drill against RPO and RTO (O-06), migration rollback rehearsal, the pre-production checklist of SECURITY_POLICY §20 | UAT closure, go/no-go |

Each gate produces `docs/testing/uat/PHASE_N_UAT_BN.md` before the session and `docs/gates/PHASE_N_SIGNOFF.md` with the executed commands, outputs, coverage per layer and the untested-rules list.

### 9.1 Phase 1 state (T1.16, 2026-10-19)

What the Phase 1 gate (T1.17) can rely on, from the runs on the final state of branch `chore/phase1-test-consolidation` (plan `docs/plans/2026-10-18-1642-chore-phase1-test-consolidation-plan.md`). Every command below was executed on that state; the numbers are its output.

| Command | Output |
|---|---|
| `pnpm typecheck` | every package `Done`, no error |
| `pnpm lint` | ESLint 0 errors (155 warnings, all `security/*` advisories in files this task did not touch); Prettier clean; `i18n check: 0 error(s), 0 warning(s); 152 error codes checked` |
| `pnpm docs:check` | `All document checks passed.`, including `BUSINESS_RULES.md: every testable Phase 1 rule is tested, deferred or manual (136 rules)` |
| `pnpm rules:status --phase 1 --report-only` | `Phase 1 rules: tested 104, deferred 32, manual 0, untested 0` |
| `pnpm test` | `Test Files 169 passed (169)`, `Tests 1558 passed (1558)` in 461 s: `shared` 18 files / 315 tests, `ui` 20 / 80, `api` 31 / 238, `api-db` 57 / 584 (the migration round trip up-down-up and the down.sql completeness check among them, `apps/api/test/integration/migrations.test.ts`), `web` 43 / 341 |
| `pnpm --filter @css/api contract:coverage --no-run` (after `pnpm test`) | `contract coverage: 132 of 132 operations answered their success status in a test`; the recorder reported no violation in either API project |
| `pnpm e2e` (builds, then the three Playwright projects) | `154 passed, 21 skipped, 0 failed` in 3.6 min: `mobile` 63 passed / 13 skipped, `desktop` 72 / 4, `iphone` 19 / 4 (the skips are journeys a spec runs on one project only, by design) |
| `npx playwright test e2e/registration.spec.ts e2e/roles.spec.ts e2e/admin-permissions.spec.ts --repeat-each 3 --workers 1` | `81 passed, 9 skipped` |
| `npx playwright test --project iphone --repeat-each 3 --workers 1` | `57 passed, 12 skipped` |
| `npx playwright test e2e/a11y.spec.ts` | `12 passed` (every listed screen, both languages, both Chromium projects, no page skipped) |

Coverage per layer:

- **Rules (section 7):** 136 testable Phase 1 rules; 104 are proven by a named test in the register of `docs/BUSINESS_RULES.md` section 19, 32 are deferred to the phase and module that builds their feature (ratings and categories, application transfer and applications, the form platform, profile merge, house construction and the issue log, payments, Qurbani, dawah beneficiaries, the document register, follow-up evaluations, offline sync and the outbox, photo-quality alerts, the Media Team module). No rule is untested. Two contradictions found on the way are recorded in BUSINESS_RULES section 20 (items 25 and 26: BR-040's registration reference removed by O-64; BR-233's unbuilt parts).
- **API and contract (section 3.3):** the drift test, the authorization matrix (every endpoint × every role, the committed report up to date), the contract recorder on every response of both API Vitest projects, and the coverage of all 132 registered operations. The recorder found and the task fixed six places where the YAML disagreed with the real answers (PermissionGrant nullables, the pending registration's volunteer shape and the approve answer, the programs list meta, a fixture's partial address, the pending photo rule of a draft).
- **E2E (section 3.4):** the Phase 1 checklist above, every journey green on Chromium as a phone and a desktop; the sign-in, registration and home journeys also on WebKit as an iPhone. Found and fixed on the way: the E2E server set Secure cookies over http, which WebKit drops (the real iPhone over https is unaffected); the shared demo accounts hit the five-device limit under the parallel run (D-102 relaxes it for the E2E server only); the password journeys run on Chromium only because every demo account is spoken for.
- **Accessibility (section 3.6):** axe on every Phase 1 screen in bn and en on both Chromium projects, plus the component-level axe of every `packages/ui` and `apps/web` component test and the gallery spec. The sweep found and the task fixed two defects: the inbox empty state jumped from h1 to h3, and the setup stepper's step buttons had no accessible name on phones.
- **Database:** every test file on a database cloned from a migrated template; the migration round trip and the down.sql completeness check in `migrations.test.ts`; the constraints and triggers suites.
- **Not in this task, for T1.17:** the visual baselines (section 3.7), the Bengali UAT script and the keyboard walkthrough (manual), the gate sign-off document.

### 9.2 After the component set moved to MUI core (2026-10-20)

The runs on the final state of branch `refactor/mui-core-ui` (plan `docs/plans/2026-10-19-0912-refactor-mui-core-ui-plan.md`), which replaced React Aria and Tailwind in `packages/ui` and `apps/web`:

| Command | Output |
|---|---|
| `pnpm typecheck` | every package `Done`, no error |
| `pnpm lint` | ESLint 0 errors (159 warnings, all pre-existing `security/*` advisories); Prettier clean; `i18n check: 0 error(s), 0 warning(s); 152 error codes checked` |
| `pnpm docs:check` | `All document checks passed.` |
| `pnpm rules:status --phase 1 --report-only` | `Phase 1 rules: tested 104, deferred 32, manual 0, untested 0` |
| `pnpm test` | 179 files, 1628 tests: `shared` 18 / 317, `ui` 28 / 138, `api` 31 / 238, `api-db` 57 / 584, `web` 45 / 351; one run lost a Vitest worker (section 10, the machine's known issue) and its file passed alone |
| `pnpm --filter @css/api contract:coverage` | `contract coverage: 132 of 132 operations answered their success status in a test` |
| `pnpm e2e` | `154 passed, 21 skipped, 0 failed` on `mobile`, `desktop` and `iphone`, the axe sweep of every Phase 1 screen included |
| `pnpm --filter @css/web bundle:report` | first route 212.1 KB gzip of 250 KB; the signed-in home adds 64.0 KB |

New tests of this work: the keyboard model of the table (rows, cells, Home, End, Enter, Space, one tab stop), the date field on MUI's picker (dd-mm-yyyy, limits, the phone sheet, inside a dialog), the overlays (alert dialog, pending confirmation, focus return), the menu's links through the router, the layout pieces, the lint boundary that keeps MUI inside the template folder (`apps/web/test/template-boundary.test.ts`) and the class check (`apps/web/test/class-names.test.ts`: every class name a page writes is defined by a stylesheet it loads). The look was checked with a computed-style capture of 27 screens on the phone and desktop projects before and after the Tailwind removal: no element differed; that capture is a one-off measuring tool, not a committed suite, so the visual baselines of section 3.7 remain the T1.17 task.

### 9.3 Phase 1 gate (T1.17, 2026-10-20)

The runs on the final state of branch `chore/phase1-gate`, after the six fixes of the gate review (`docs/gates/PHASE_1_RELEASE_NOTES.md` section 3):

| Command | Output |
|---|---|
| `pnpm typecheck` | every package `Done`, no error |
| `pnpm lint` | ESLint 0 errors (163 warnings, all `security/*` advisories); Prettier clean; `i18n check: 0 error(s), 0 warning(s); 152 error codes checked` |
| `pnpm docs:check` | `All document checks passed.` (incl. the Phase 1 rules check, 136 rules) |
| `pnpm test` | `Test Files  184 passed (184)`, `Tests  1666 passed (1666)` (shared, ui, api, api-db, web) |
| `pnpm --filter @css/api contract:coverage --no-run` | `contract coverage: 132 of 132 operations answered their success status in a test` |
| `pnpm rules:status --phase 1 --report-only` | `Phase 1 rules: tested 104, deferred 32, manual 0, untested 0` |
| `pnpm e2e` | `156 passed`, `21 skipped`, 0 failed on `mobile`, `desktop` and `iphone`; the axe sweep `a11y.spec.ts` of every Phase 1 screen in both languages included |
| `pnpm --filter @css/web bundle:report` | first route 212.8 KB gzip of 250 KB; the signed-in home adds 62.3 KB |

New tests of the gate: the project budget amounts by `budget.view` (`apps/api/test/integration/projects.test.ts`), the password change's rate window per user under the real limits (`password.test.ts`), an RPM against another official's devices in the same area (`sessions-users.test.ts`), parallel wrong passwords toward the lock (`auth.test.ts`), refused correction answers within the hour (`registration-approval.test.ts`), the replaced template's old definition in its audit entry (`templates.test.ts`). The 32 deferred rules are the features of later phases (application transfer, ratings, follow-up, forms, construction, Qurbani, dawah, documents, offline sync, the Media Team module), listed with their phase in `docs/BUSINESS_RULES.md` section 19. Not run at this gate: the visual baselines of section 3.7 and a recorded keyboard walkthrough, deferred until the owner's review of the new list and profile layouts settles the screens (`docs/gates/PHASE_1_SIGNOFF.md` section 5).

## 10. Reporting and flaky tests

- Every task report uses the §15 template; the Tests section shows the commands run and their summary output.
- `docs/STATUS.md` keeps the "last test run" line with date, scope and result.
- Gate sign-off files hold the full results (§9).
- Flaky tests (O-46 item 10): unit and API tests never retry automatically; E2E tests get one retry in CI and the retry is reported; a flaky test is quarantined for at most 7 days with an entry under known issues in STATUS, then fixed or deleted with the reason recorded.
