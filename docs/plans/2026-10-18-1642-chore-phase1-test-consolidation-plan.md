---
title: Phase 1 test consolidation (T1.16)
type: chore
status: in-progress
source: brainstorm
date: 2026-10-18
doc_review: 2026-10-18
---

# Phase 1 test consolidation (T1.16)

## Goal
Before the Phase 1 gate, every business rule of a Phase 1 feature that is built has an executed test recorded in `docs/BUSINESS_RULES.md`, every Phase 1 endpoint's responses are checked against `docs/api/openapi.yaml`, the critical Phase 1 journeys run green in Playwright on Chromium and (for the phone journeys) WebKit, every Phase 1 screen passes axe in both languages, and the gate report can list what is still untested and why.

## Problem
Phase 1 built its features in the tasks T1.5 to T1.15, each with its own tests, but nobody has checked the whole against the gate's requirements (`docs/testing/TEST_STRATEGY.md`, section 9): 268 rules exist and 56 have a register line; the response-schema check that TEST_STRATEGY section 3.3 promises (O-46 item 2) does not exist; the strategy's WebKit runs for the phone journeys and the untested-rules script of section 7 are missing; the `down.sql` round trip is tested in `migrations.test.ts` but not yet recorded in TEST_STRATEGY. T1.17 (the gate with real testers) needs this done first.

## Requirements

### Business rules
- **R1** A script lists, for the Phase 1 modules of `docs/MODULE_CATALOG.md` (M01, M02, M03, M04 part, M06 part, M15, M17, M19, M20, M21 core, the My Work home), every rule of `docs/BUSINESS_RULES.md` whose expected test is not `manual` or `none` and that has no line in the test-status register (section 19), and the gate report shows that list with a reason per rule.
- **R2** Every Phase 1 rule whose feature is built has an executed unit, integration or API test named with the rule id, and a register line `BR-nnn: <file>::<test> — passing (date)`; missing tests are added.
- **R3** A Phase 1 rule whose feature is not built yet gets a register line `deferred to <task> (feature not built)` instead of a test; a rule tested only by hand is marked `manual` with the reason.

### API contract
- **R4** A shared Supertest helper validates every response of the integration and API tests against the schema of that operation in `docs/api/openapi.yaml` (status code and body), and a response the schema does not allow fails the test.
- **R5** Every Phase 1 endpoint of the route registry is covered by at least one test whose response went through that helper; a list of the endpoints without one fails the build.
- **R6** The drift test and the authorization matrix test pass on the consolidated code.

### End-to-end
- **R7** The Playwright suite covers these Phase 1 journeys, each green on the mobile and desktop Chromium projects: login and logout; role-based denial for every official and volunteer role (each demo role is refused the pages and the API of another role); volunteer registration with two OTPs, correction request, resubmit, approval, assignment, consent and the project visible; team-member registration with the NID reference; staff handover before deactivation; a permission-panel change with its audit entry; project draft, activate, close, reopen; language switch persisting across a reload; device revocation ending the other session.
- **R8** A WebKit (iPhone) Playwright project runs, in CI as well as locally, the registration spec (which holds the language-switch journey), the login spec and the home spec.
- **R9** The existing specs are kept and extended, not duplicated; a journey already covered keeps its spec, and the T1.16 list is a checklist in `TEST_STRATEGY.md` naming the spec per journey.

### Accessibility and migrations
- **R10** axe reports no violations on every Phase 1 screen of `docs/ui/SCREENS.md` (the Built screens) in Bengali and in English, on the phone and the desktop project; screens that need data are reached with the demo accounts.
- **R11** An automated check runs every migration up, then down with its `down.sql`, then up again on an empty database, and fails when a `down.sql` leaves tables, columns, indexes, constraints or types behind or cannot run.

### Reporting
- **R12** `docs/testing/TEST_STRATEGY.md` records the Phase 1 state: coverage per layer with the executed commands and their summary output, the journey checklist (R9), the WebKit project, the response-schema helper, the migration check and the untested-rules script; the test-status register of `docs/BUSINESS_RULES.md` is complete for the Phase 1 rules (R2, R3).

## Scope
- In: the untested-rules script, the missing rule tests of built Phase 1 features, the response-schema helper and its use in every Phase 1 test, the endpoint-coverage check, the Playwright journeys and the WebKit project, axe in both languages on every Phase 1 screen, the migration up/down/up check, the documentation of the state (TEST_STRATEGY, BUSINESS_RULES register, STATUS).
- Out (not now): visual-regression baselines (T1.17, owner's decision), the UAT script and the gate sign-off (T1.17), load tests (Phase 3), tests for Phase 2 features (applications, forms, offline), new product behaviour of any kind; a failing feature found on the way is fixed only when a Phase 1 rule's test exposes it, otherwise reported.

## Key decisions
- **Only built features get tests now** (owner, 2026-10-18): a Phase 1 rule whose feature arrives later is registered as deferred with its task, not tested against a stub. Governs R2, R3.
- **The response-schema helper is built in T1.16** (owner, 2026-10-18): every Phase 1 endpoint's responses are validated against `openapi.yaml`, as TEST_STRATEGY 3.3 and O-46 item 2 require; the drift test alone is not enough for the gate. Governs R4, R5.
- **WebKit project now** (owner, 2026-10-18): volunteers on iPhones (UX-06) are covered for the registration (with the language switch), login and home journeys from this gate on. Governs R8.
- **Migration check in T1.16, visual baselines in T1.17** (owner, 2026-10-18): the `down.sql` round trip is proven here; screenshot baselines wait for the gate, when the screens are stable. Governs R11 and the scope.

## Success criteria
- `pnpm test`, the database suite, `pnpm e2e` (Chromium mobile and desktop, WebKit for the three specs), `pnpm docs:check`, the authorization matrix and the migration check all pass in one run on the branch, and the gate report lists every Phase 1 rule as tested, deferred or manual.

## Technical decisions
- **Stack profile unchanged** (CLAUDE.md "Stack profile"; ST-40 to ST-44): Vitest 4, Supertest against the real Express app, Playwright, axe-core; no new runtime library. `ajv` 8 and `js-yaml` are already root dev dependencies (`scripts/check-docs.mjs`, `packages/shared/test/jsonb-conformance.test.ts`), so the response-schema check adds nothing (ST-30).
- **Responses are checked against the YAML, not the registry** (R4; TEST_STRATEGY 3.3, O-46 item 2): the drift test already proves registry equals `docs/api/openapi.yaml`; the new check proves the server's real responses equal the YAML, which neither test does today. The YAML is loaded once with js-yaml, every operation's `responses[status].content['application/json'].schema` is compiled with Ajv 2020 plus ajv-formats (the whole document as the root schema so `$ref` into `components` resolves; OpenAPI keywords such as `example` allowed), as `scripts/check-docs.mjs` compiles the JSON Schemas.
- **A recorder around the test app, no production hook** (TS-16): `buildTestApp` and `authHarness` wrap the real `app` in an outer Express app whose middleware overrides `res.json` to record `{ method, path: req.baseUrl + req.route.path, status, body }` once the inner app has routed; the operation is found in the YAML through `openApiPath()` of `src/openapi/registry.ts`. Streams and `204` are skipped. A Vitest `setupFiles` entry for both API projects asserts after each test that the recorder saw no schema violation, so every existing Supertest and `fetch` call is covered without touching the call sites. The recorder appends `{ operationId, status }` lines to `apps/api/test-results/contract/*.jsonl` (gitignored) for the coverage check.
- **Coverage is "every registered operation answered its success status in some test"** (R5): the registry holds only built routes, so every operation is a Phase 1 endpoint; `apps/api/scripts/contract-coverage.ts` (tsx, as `apps/api/scripts/notifications-sync.ts`) lists the registry, reads the JSONL files and fails on an operation without a recorded success (2xx) response. The authorization matrix test touches every route but mostly with 401, 403 and 404, so it does not count.
- **Test names say the behaviour; the register links the rule** (ORG-CMT-40 over TEST_STRATEGY 7 "tests reference their rule in the test name"): new tests get behaviour names, the register line `BR-nnn: <file>::<test>` is the link, and TEST_STRATEGY 7 is amended to say so; existing names that carry an id are left alone (renaming them would churn 44 tests for no behaviour gain). The untested-rules script therefore reads the register, never test names.
- **The untested-rules script is dev tooling in `scripts/`** (ST-53): `scripts/check-rules.mjs` parses the BR table rows and the register of `docs/BUSINESS_RULES.md` and the Phase map of `docs/MODULE_CATALOG.md` section 4; its parsing lives in `scripts/lib/rules-status.mjs` with a Vitest test under `packages/shared/test/` (the project that already tests repo documents, `i18n.test.ts`), run by `pnpm test`; `pnpm rules:status --phase 1` prints the report and `pnpm docs:check` runs it in CI with the rule that every Phase 1 testable rule has a register line (tested, deferred or manual).
- **WebKit as a third Playwright project** (R8; NFR-13, UX-06): `iphone` with `devices['iPhone 13']` (WebKit 2370 is installed locally; CI installs `chromium webkit`), running `registration.spec.ts`, `auth.spec.ts` and `home.spec.ts` through `testMatch`. `isPhone()` in `e2e/support/admin.ts` treats `iphone` as a phone. Specs that change data get an `iphone` entry in their account tables (the free demo volunteers 01700000102, 104 and 110); the password change and OTP reset tests of `auth.spec.ts` stay on Chromium (they reset passwords and need more accounts than are free) until the Phase 2 device matrix.
- **The journeys of R7 extend the existing specs** (R9; TS-24): the registration spec grows the chain (assignment, consent, project visible) on the volunteer it just registered, the permission spec opens the audit viewer for its entry, a new `roles.spec.ts` holds the table-driven denial of every role, a new `a11y.spec.ts` holds the axe sweep; nothing existing is duplicated.
- **Migrations are already proven** (R11): `apps/api/test/integration/migrations.test.ts` runs up, down and up again with a catalog snapshot (identical schema, empty after down, each later `down.sql` restores the one before, schema.prisma and migrations agree) and runs in `pnpm test`; U7 records it and nothing is added.
- **Plan IDs stay in the plan** (ORG-CMT-50): R, U, BR and rule codes stay here and in the docs; code, comments and test names carry the meaning in words.

## Implementation units

### U1. The untested-rules script
- **Goal:** `pnpm rules:status --phase 1` lists every Phase 1 rule as tested, deferred, manual or untested, and `pnpm docs:check` fails while an untested one is left.
- **Requirements:** R1, R3 (format of the register lines)
- **Files:** `scripts/lib/rules-status.mjs` (parse the BR rows: id, module tokens, expected test, status; parse the register lines: id, file, test, state `passing` / `deferred to …` / `manual`; the Phase map from `docs/MODULE_CATALOG.md` section 4 "Phase map"; a rule belongs to a phase when any of its module tokens is a module of that phase, M04 and M06 included whole, since a rule of theirs whose part is not built is answered by a `deferred` register line, never by leaving it out), `scripts/check-rules.mjs` (CLI: `--phase n`, Markdown table to stdout, exit 1 on untested rules unless `--report-only`), `scripts/check-docs.mjs` (calls the check for Phase 1), `package.json` (`rules:status`), `packages/shared/test/rules-status.test.ts`, `docs/testing/TEST_STRATEGY.md` section 7 (the command), `CLAUDE.md` (the command line)
- **Approach:** `scripts/check-docs.mjs` for the style (`ok`, `fail`, exit code) and `scripts/check-i18n.mjs` for a parser over repo files; `packages/shared/test/i18n.test.ts` for a Vitest test that reads repo documents.
- **Tests:**
  - unit: a fixture BUSINESS_RULES text with four rules (tested, deferred, manual, untested) and a fixture Phase map gives the four states and only the rules of the asked phase; a register line whose file does not exist is reported; a rule with `Test: none` or `manual` in the table is never "untested"; a register line that names several ids (`BR-181, BR-182: …`) marks each; the CLI exits 1 on an untested rule and 0 with `--report-only`.
- **Done when:** the command prints the Phase 1 table on the real documents and `pnpm docs:check` reports the untested count (it may fail until U3 ends).
- **Depends on:** none · **Size:** M · **Risk area:** none
- **Status:** done

### U2. Every response against the contract
- **Goal:** every response of the API tests is validated against `docs/api/openapi.yaml`, and every registered operation has a recorded success response.
- **Requirements:** R4, R5, R6
- **Files:** `apps/api/test/support/contract.ts` (load the YAML, compile the response schemas with Ajv 2020 and ajv-formats, `recordResponses(app)` returning the outer app, `violations()`, `reset()`, the JSONL writer), `apps/api/test/support/app.ts` and `apps/api/test/integration/support/auth-app.ts` (wrap the app), `apps/api/test/support/setup.ts` (new `setupFiles` of `apps/api/vitest.config.mts` and `apps/api/vitest.db.config.mts`: `afterEach` asserts no violation and resets), `apps/api/scripts/contract-coverage.ts` and `apps/api/package.json` (`contract:coverage`: clears `test-results/contract/`, runs both API Vitest projects, compares), `.gitignore` (`apps/api/test-results/`), `apps/api/test/api/contract.test.ts`, plus the integration tests the coverage check names as missing (new `it` blocks in the existing test file of each module), `.github/workflows/ci.yml` (the coverage step after `pnpm test`), `docs/testing/TEST_STRATEGY.md` section 3.3.
- **Approach:** `apps/api/test/api/openapi-drift.test.ts` for loading the YAML with js-yaml and `buildTestApp`; `scripts/check-docs.mjs` for Ajv 2020 with ajv-formats; `apps/api/test/integration/authorization-matrix.test.ts` for walking `registry.list()`; `apps/api/scripts/notifications-sync.ts` for a tsx script of the API package.
- **Tests:**
  - unit (`contract.test.ts`, on `buildTestApp` with an extra probe router): a probe route whose body matches its declared schema records a success and no violation; a probe route that answers a body outside its schema is reported with the operation, status and the Ajv error path; a `204` and a streamed response are skipped; an error envelope is validated against the shared error response of the YAML; a response of an unknown path is reported as "no operation".
  - integration: the whole database suite passes with the recorder on (existing tests, now validated); for every operation `contract:coverage` names as missing, one happy-path test in that module's existing test file, with the 403 of another role when the module's tests do not have it yet (TS-13).
- **Done when:** `pnpm --filter @css/api contract:coverage` prints zero violations and zero uncovered operations, and `pnpm test` stays green.
- **Depends on:** none · **Size:** L · **Risk area:** none
- **Status:** done

### U3. The Phase 1 rules: tests and the register
- **Goal:** every Phase 1 rule is tested, deferred or manual in the register, with the tests of the built features executed.
- **Requirements:** R2, R3
- **Files:** `docs/BUSINESS_RULES.md` section 19 (register lines), new or extended tests in `apps/api/test/integration/*.test.ts`, `apps/api/src/**/*.spec.ts`, `packages/shared/src/**/*.test.ts`, `apps/web/src/**/*.test.tsx` as the rules need
- **Approach:** run `pnpm rules:status --phase 1 --report-only` (U1); for each untested rule decide from the code: (a) the feature is built and a test already proves it (most of T1.10 to T1.15: the volunteer and beneficiary tabs, teams, blocklist, consent, programs, projects, templates, lifecycle, settings, nisab, audit viewer, sessions, notifications, the shell and the home) → a register line naming the existing `file::test`; (b) built but untested → a test in the module's existing test file named for the behaviour, then the register line; (c) not built (ratings, categories, budgets, applications, forms, offline, documents) → `deferred to <task> (feature not built)`; (d) a process or physical rule → `manual (<reason>)`. A new integration test follows `apps/api/test/integration/attention.test.ts` (harness, accounts, fixtures).
- **Tests:**
  - unit / integration: the tests of case (b), each with its 401 or 403 where the rule is about access (TS-12, TS-13); the classification itself is proven by `pnpm docs:check` passing with zero untested Phase 1 rules.
- **Done when:** `pnpm docs:check` passes, the Phase 1 table of `pnpm rules:status --phase 1` has no untested row, and `pnpm test` plus the database suite are green.
- **Depends on:** U1, U2 (both add tests to the same integration files) · **Size:** L · **Risk area:** none
- **Status:** done

### U4. The Phase 1 journeys in Playwright
- **Goal:** every journey of R7 runs green on the mobile and desktop projects, each in one spec that the checklist names.
- **Requirements:** R7, R9
- **Files:** `apps/web/e2e/registration.spec.ts` (the chain continues: the Dhaka RPM assigns the approved volunteer to the active Dhaka project in `/admin/projects/:id/volunteers`, the volunteer opens "আমার প্রকল্প", reads the rules part by part, "সম্মতি দিন", then sees the project with "সক্রিয়"; a second test registers a team member with the main volunteer's NID as reference and the pending status page says so), `apps/web/e2e/admin-permissions.spec.ts` (after the grant, "অডিট লগ" shows the `permission_change` entry of the target with the reason), new `apps/web/e2e/roles.spec.ts` (table-driven: for each demo role one account, the page of another role shows "প্রবেশাধিকার নেই" and the API answers 403 `permission.denied` through `request`: volunteer → `/admin/permissions`; Finance → `/admin/volunteers`; Media → `/admin/projects`; Procurement → `/admin/settings`; Official দায়ী → `/admin/registrations`; Implementer → `/admin/permissions`; Executive → `/admin/handover`; RPM → `/admin/settings`; PM → `/admin/permissions`; and a volunteer's `/api/v1/users` answers 403; the Department Head and the Monitoring Team hold every permission, and their one exception, the Main Admin transfer, has no endpoint yet, so they have no denial row), `apps/web/e2e/support/admin.ts` (an `apiAs(request, loginId)` helper for the API checks), `docs/testing/TEST_STRATEGY.md` section 3.4 (the checklist: journey → spec)
- **Approach:** `e2e/registration.spec.ts` and `e2e/assignment.spec.ts` for the registration and consent steps (reuse their helpers), `e2e/admin-settings.spec.ts` for reading the audit viewer, `e2e/handover.spec.ts` for an API client as the Department Head, `e2e/home.spec.ts` for a table of roles.
- **Tests:**
  - e2e: the journeys above with the labels given; `roles.spec.ts` has one test per role; the mobile and desktop projects use different accounts where data changes (the registration chain generates its own person; the team member references the volunteer registered in the same test).
  - existing: covered by `auth.spec.ts` (login, logout, revocation), `registration.spec.ts` (two OTPs, correction, approval, language toggle persisting over a reload), `assignment.spec.ts`, `handover.spec.ts`, `admin-permissions.spec.ts`, `projects.spec.ts` (draft, activate, close, reopen); these are extended, not copied.
- **Done when:** `pnpm e2e` is green and `npx playwright test e2e/registration.spec.ts e2e/roles.spec.ts e2e/admin-permissions.spec.ts --repeat-each 3 --workers 1` passes.
- **Depends on:** none · **Size:** L · **Risk area:** none
- **Status:** done

### U5. The WebKit project
- **Goal:** the registration, login and home specs run on an iPhone (WebKit) project locally and in CI.
- **Requirements:** R8
- **Files:** `apps/web/playwright.config.ts` (project `iphone`, `devices['iPhone 13']`, `testMatch` for `registration.spec.ts`, `auth.spec.ts`, `home.spec.ts`), `apps/web/e2e/support/admin.ts` (`isPhone` by a set of phone project names), `apps/web/e2e/auth.spec.ts` (an `iphone` account set: 01700000102 login, 01700000104 reload, 01700000110 devices; `test.skip` of the password change and the OTP reset on `iphone` with the reason), `apps/web/e2e/registration.spec.ts` (phone checks keyed on `isPhone`), `.github/workflows/ci.yml` (`playwright install --with-deps chromium webkit`), `docs/testing/TEST_STRATEGY.md` sections 3.4 and 6, `docs/testing/DEMO_ACCOUNTS.md` (the accounts the iPhone project uses)
- **Approach:** the `mobile` project of `playwright.config.ts`; the per-project account tables of `e2e/auth.spec.ts` and `e2e/admin.spec.ts`.
- **Tests:**
  - e2e: `npx playwright test --project iphone` passes three times (`--repeat-each 3`); a phone-only check in `registration.spec.ts` runs on `iphone` as on `mobile`.
  - existing: `pnpm e2e` on the two Chromium projects stays green (covered by the whole suite).
- **Done when:** the iPhone project is green locally and the CI E2E job installs WebKit and runs it.
- **Depends on:** U4 (both change `registration.spec.ts` and `support/admin.ts`) · **Size:** M · **Risk area:** none
- **Status:** done

### U6. axe on every Phase 1 screen in both languages
- **Goal:** one spec sweeps every built Phase 1 screen with axe in Bengali and English on the phone and the desktop project.
- **Requirements:** R10
- **Files:** new `apps/web/e2e/a11y.spec.ts`, `apps/web/e2e/support/admin.ts` (`switchLanguage(page, 'en' | 'bn')` through the app bar or the profile menu on a phone), `docs/testing/TEST_STRATEGY.md` section 3.6 (the sweep and the screen list)
- **Approach:** `e2e/home.spec.ts` (one test per role from a table, `scan(page)`), `e2e/gallery.spec.ts` (the same page in both languages); the screens from `docs/ui/SCREENS.md` section 2 with a Phase 1 task: signed out `/login`, `/login/reset`, `/register` (first step), `/invite?token=x` (the expired-link state); as a volunteer (01700000116) `/`, `/account/profile`, `/account/sessions`, `/account/password`, `/notifications`, `/my-projects`, `/my-projects/:id`, `/my-projects/:id/team` (01700000117 leads a team); as the Department Head `/admin/volunteers`, `/admin/volunteers/:id`, `/admin/beneficiaries`, `/admin/beneficiaries/:id`, `/admin/registrations`, `/admin/staff`, `/admin/staff/organogram`, `/admin/handover`, `/admin/programs`, `/admin/templates`, `/admin/projects`, `/admin/projects/new`, `/admin/projects/:id`, `/admin/projects/:id/setup`, `/admin/projects/:id/volunteers`, `/admin/settings`, `/admin/nisab`, `/admin/audit`, `/admin/sessions`, `/admin/health`, `/admin/notification-templates`, `/admin/deliveries`, `/admin/permissions`; the ids come from the lists on the way (first row). One test per role and language; the mobile and desktop projects both run it; a record page is skipped with a message when its list is empty.
- **Tests:**
  - e2e: every listed screen has zero axe violations in bn and en on both projects; a screen a role may not open is not in that role's list (the sweep never asserts on a forbidden page).
- **Done when:** `npx playwright test e2e/a11y.spec.ts` is green on both projects and its screen list equals the Phase 1 screens of SCREENS.md.
- **Depends on:** U4, U5 (`support/admin.ts`, the phone project set) · **Size:** M · **Risk area:** none
- **Status:** done

### U7. The Phase 1 test report
- **Goal:** the documents say what the gate can rely on: coverage per layer, the executed commands with their summary output, the journey checklist, the tooling and the untested rules with reasons.
- **Requirements:** R6, R11, R12
- **Files:** `docs/testing/TEST_STRATEGY.md` (a new section "Phase 1 state (T1.16)" with the commands and outputs, the layer coverage, the migration round trip of `migrations.test.ts`, the WebKit project, the response-schema check, the coverage check and the rules script; sections 3.3, 3.4, 3.6, 6, 7 and 9 updated), `docs/STATUS.md`, `CLAUDE.md` (commands)
- **Approach:** `docs/testing/PERFORMANCE.md` section 6 for a report with measured numbers and commands.
- **Tests:**
  - none to write: the section quotes the summary lines of `pnpm test`, the database suite, `pnpm --filter @css/api contract:coverage`, `pnpm rules:status --phase 1`, `pnpm e2e` (three projects) and `pnpm docs:check`, all executed in that run.
- **Done when:** every command in the section was run on the final branch state and its output is quoted; `pnpm docs:check` passes.
- **Depends on:** U1, U2, U3, U4, U5, U6 · **Size:** S · **Risk area:** none
- **Status:** todo

## Checkpoints
- **Mode:** grouped (one by one 4, grouped 12, all at once 3; N is over 4, so one by one's points go to grouped)
- **Signals:** N 7, L 1,700, R 0, Fd 4 (U1, U2, U4, U5 each feed two or more later units), C 4 (U4 → U5 → U6 → U7), P 1 (U2's response recorder)
- **C1** after U1: foundation for U3 and U7
- **C2** after U2: a new pattern (the recorder and the coverage check) and a foundation for U3
- **C3** after U5: U4 and U5 are foundations for U6 and U7 (two checkpoints in a row kept as one), and the code since C2 would pass 1,000 lines with U6
- **C4** after U7: end; scripted checks on the whole branch

## Verification
- `pnpm typecheck` · `pnpm lint` · `pnpm test` (includes `apps/api/vitest.db.config.mts` with `migrations.test.ts`; needs `docker compose up -d`)
- `pnpm docs:check` (now with the Phase 1 rules check) · `pnpm rules:status --phase 1`
- `pnpm --filter @css/api contract:coverage` · `pnpm --filter @css/api authz:matrix`
- `pnpm e2e` (mobile, desktop and iphone), and from `apps/web`: `npx playwright test e2e/registration.spec.ts e2e/roles.spec.ts e2e/a11y.spec.ts --repeat-each 3 --workers 1` and `npx playwright test --project iphone --repeat-each 3`

## Risks and rollback
- **Flaky end-to-end runs:** the preview server stopped midway in two full runs on this machine (STATUS known issues); every spec is run alone with `--repeat-each 3 --workers 1` before it counts, and a failure under the full run is rerun once before it is called a regression.
- **The response check finds real contract gaps:** a server answer outside the YAML is a bug in one of them; the fix follows the contract (the YAML is the agreement with the web app) and goes through the drift test; none is silenced in the recorder.
- **Shared E2E database:** the new chain in `registration.spec.ts` and `roles.spec.ts` use generated people and read-only accounts, so the three projects can run in parallel; the account allocation is written in DEMO_ACCOUNTS.md.
- No migration; production code changes only where a Phase 1 rule's test or the contract check exposes a defect (Scope), never in the recorder itself; a revert of the branch restores the previous test setup.

## Definition of done
- All units done and their tests pass
- Verification commands pass
- `ae-review` has run, with no open P0 or P1
- Code from abandoned attempts is removed

## Progress
- **Branch:** `chore/phase1-test-consolidation` (stacked on `feat/media-roles-d101`, PR #9)
- **Updated:** 2026-10-19 01:10
- **Next:** U7: the Phase 1 state section of TEST_STRATEGY with the final command outputs, STATUS, then C4 (review and the whole-branch scripted checks)
- **Reviewed through:** C3 at HEAD of the C3 fix commit (see git log: test(e2e): the sweep makes its own project…)
- **Uncommitted:** none
- **Notes:** doc review on 2026-10-18 (plan-reviewer): the migration round trip is already tested in `apps/api/test/integration/migrations.test.ts`, so R11 is recording work only; the Department Head and the Monitoring Team have no denial row in `roles.spec.ts` (their only exception, the Main Admin transfer, has no endpoint yet). U1: on the real documents the Phase 1 table is tested 37, untested 99 (so `pnpm docs:check` fails until U3 ends); one register line (BR-201) names the old Next.js path `apps/web/app/_lib/api.test.ts`, to fix in U3; a rule whose Test column is `manual` or `none` is not counted at all, the register's `manual` state is for rules that expected a test. C1 review (logic, security, standards; no P0/P1): the state of a register line is read from its form only (a test file plus `— passing (date…)` at the end; `failing` explicit), test paths in any folder are checked, the CLI has its own tests through `--docs <fixture dir>` and exits 2 on a usage error; a TypeScript test importing an `.mjs` needs the `.d.mts` beside it (the shared package has no `allowJs`). U2: the drift test compares only the response status codes, not the schemas, so the recorder found six places where the YAML disagreed with the real answers (PermissionGrant nullables, the pending registration's volunteer shape and the approve answer, the programs list meta, a test fixture's partial address, the pending photo rule of a draft's distribution settings: new `$defs.photo_rule_pending` in the component settings schema, excluded from the zod-mirror check as a stored state writes never accept). The recorder records body-less answers too (a 204, a streamed file) from the response `finish` event, otherwise the 21 operations with a 204 would count as uncovered. One `contract:coverage` run ended with `Worker exited unexpectedly` in the database project (56 of 57 files); the direct rerun of the same project passed 57/57, so it is treated as a transient fork crash and watched in C2 (the C2 reruns of the database project passed 57/57 twice). C2 review (logic, security, standards; no P0/P1): the harness returned the raw app beside the wrapped server, so two suites skipped the recorder; the recorder's own probes were counted as coverage of real operations; both fixed. Coverage lines now live per project (`test-results/contract/<project>/`), emptied by a global setup; the body validated is the serialized one. U3: of the 99 untested rules, 67 got register lines on existing tests (no new test was needed: every built Phase 1 behaviour already had one) and 32 are deferred by phase and module (`deferred to Phase <n> (<module>, …)`, since the later task ids are not fixed; TEST_STRATEGY section 7 allows that form). Two contradictions found and recorded in BUSINESS_RULES section 20 (items 25 and 26): BR-040 still names the NID reference at registration that O-64 removed; BR-233 bundles three behaviours nobody built. U4: the plan's team-member line (a registration with the main volunteer's NID as reference) cannot be built, because O-64 removed the reference from the registration form; the team journey runs instead on the demo seed (volunteer 1 adds volunteer 19, who consents on their own), recorded in TEST_STRATEGY 3.4. Running every journey together showed two account races: `auth.spec.ts` changed the passwords of the Executive and the Implementer and counted the Finance Team's devices while `roles.spec.ts` signed in with them (now dedicated accounts: volunteer 2, the Media Director and the Media Assistant Director; DEMO_ACCOUNTS lists them), and eight specs signing in as the Department Head hit the five-device limit, which revoked the handover journey's session mid-way: `SESSION_DEVICE_LIMIT_RELAXED` (D-102, proposed) raises the limit a hundredfold for the E2E server only, refused in production like D-072. The iphone project of U5 must not use volunteer 2 (now the desktop devices account); 105/106 can be shared for login and reload, 110 for its devices test. U5: the iphone project uses 104 and 105 for login and reload and 110 for its devices test; WebKit lost the session on every reload because the E2E server set Secure cookies over http (Chromium treats 127.0.0.1 as secure, WebKit does not), so `e2e-server.ts` sets `AUTH_COOKIE_SECURE=false`; the devices test signs out at its end so a repeat finds one other device; repeat runs of the auth spec need `--workers 1` (the repeats share the accounts), as the handover spec already notes. U6 was built before C3 (the sweep needed only U4's helpers), so C3 reviews U4 to U6 together. The sweep found two defects and they are fixed: the inbox empty state jumped from h1 to h3, and the setup stepper's step buttons had no name on phones (`display: none` on the name; now visually hidden). The sweep signs in through the API with the device language set beforehand, because the login form writes the language onto the account (LoginForm applies `me.language`), which would change what the other specs see on the shared accounts. C3 review (logic, security, standards; no P0/P1): the sweep's record pages depended on data other specs created and were silently skipped when absent; the sweep now makes its own project (the ERR PM's wizard), assigns volunteer 3 and consents through the API, and a missing record fails the test; the devices test and the sweep wait for rows that arrive after the heading (a phone card's link is clipped, so attached, not visible). Ids removed from new comments and from the auth test name; the device limit parameter is required. Not done, with reasons: zod parsing of the login answer in the E2E helper (zod is not a dependency of apps/web and the helper only reads one field); the password journeys stay on Chromium only (every demo account is spoken for, a changed password breaks every other login with it), recorded in TEST_STRATEGY 3.4 as a deliberate partial run of the iphone project.
