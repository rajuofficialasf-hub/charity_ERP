---
title: The open issues closed
type: fix
status: in-progress
source: brainstorm
date: 2026-11-18
doc_review: 2026-11-18
---

# The open issues closed

## Goal
The problems listed under "Known issues" in `docs/STATUS.md` that this repository can fix by itself are fixed or proved gone, develop's CI is green again and runs the whole E2E suite on every pull request, and the list holds only what waits for the owner, the IT team or the pilot's load test.

## Problem
The owner asked which problems the pull requests left behind (2026-11-18) and then: "এই সব গুলো সমস্যা কিভাবে সমাধান করা যায় তার পরিকল্পনা করো". Checking the list showed more than it says:
- develop's CI has been red since PR #63. The unit and API jobs pass every test (4366) but fail on one unhandled rejection: `SyncCentrePage.tsx:85` sets state after the test's page is gone (`sync.test.tsx`). Because of it the E2E shards did not run after #64 and #65, and after #63 two of the four shards failed.
- The E2E job runs only on a push to develop or main, so a pull request merges without the E2E suite.
- The list mixes fixed entries of Phase 1 with open ones; several T1.x entries may already be gone.

## Requirements

### CI and tests
- **R1** develop's CI is green: the unhandled rejection of the sync centre's test is removed at its cause (no state change after the page is gone), and the E2E shards that failed after PR #63 pass or their cause is fixed.
- **R2** Every pull request into develop runs the whole E2E suite, split into parallel shards, and the run finishes within 20 minutes of wall time; the merge waits for it.
- **R3** The tests known to fail now and then pass reliably: the devices spec of `auth.spec.ts` (another spec signs the same account in), the password change spec of `auth.spec.ts`, the offline spec's held entry, the permission panel spec on a phone, and the web component tests that time out when the whole web suite runs on one machine. Each either gets its own account or data, or waits for what it needs; none is retried to hide a fault.
- **R4** CI reports the coverage of each package on every run on develop and fails when it drops below the minimums the owner sets (an open question below); until the minimums are set it reports without failing. A pull request's run stays without coverage, so it keeps to R2's time.

### Behaviour
- **R5** An official given a permission at the GLOBAL scope through the permission panel is held to the 12-character password of the global roles: unless they already hold a global role, they must set a new password at the next sign-in, and every later password of theirs needs 12 characters while such a grant is active. (Research showed a global role itself is given only at the registration's approval, which already asks for it; the panel gives permissions, not roles, and the handover gives neither.)
- **R6** A change request of several details on the own profile is sent as one request: all of them are taken or none is, and the screen names the refused detail.
- **R7** Leaving a section's edit mode with ticked details asks first whether to drop them.
- **R8** On a phone a list opened inside a bottom sheet stays above the sheet while the sheet scrolls.
- **R9** The permission panel picks a scope's program, project or location from a list instead of a typed id, and a revoke override can be lifted from the screen.
- **R10** A photo uploaded before its size was kept gets its resolution, read once from the stored file, so the photo viewer shows it.

### Data and clean-up
- ~~**R11**~~ (dropped by the owner, 2026-11-22) The locations master is checked against the official BBS geocode list the owner provides: every difference is reported and fixed with the owner's approval, and a union gets its own post code where the official list has one.
- **R12** The unused column `registration_drafts.reference_lookups` is dropped by a migration with its `down.sql`.
- **R13** The repeated code the scripted checks list across the admin pages (dialog footers, page headers on one pattern) is moved into shared pieces where the behaviour stays the same and tests prove it.
- **R14** Every entry of "Known issues" in `docs/STATUS.md` is checked against the code: a fixed one is removed with the change that fixed it named, an open one stays with what it waits for, and the deliberate decisions move under "Decided to leave as is". The small gallery change one entry waits for (`PageBand` missing from the asf gallery, T1.9b) is made here.
- **R15** The officials' registrations, the volunteers' edit requests and the officials' own requests on the registrations page page past their first 100 rows, as the other lists do.

## Scope
- In: R1 to R15, without R11 (dropped).
- Out (not now): the preparation for production (the SMS provider, the review of the notification texts, the production storage and the MinIO conditions, a shared store for several API processes, the held `@swc/core`); the work waiting for the pilot's load test (the login limit behind one address, the public link's per-IP limit, the program cards' speed); the decisions the owner already made to leave as they are (the lookup limit's two answers, the phone notice on the other admin pages, the photo's own page with one photo, the banner's small photo, the old projects' workflow snapshots); the owner's own clean-up of the retired role `implementer` in the development database; the audit exception E-002, which is reviewed by its expiry.

## Key decisions
- **E2E on every pull request, in parallel shards** (the owner: "ভাগ করে একসঙ্গে চালাও"): a pull request is not merged without the whole suite. Governs R2.
- **A GLOBAL-scope permission from the panel counts as a global role for the password** (the owner: "হ্যাঁ, পরের লগইনে বদলাতে বাধ্য", then, once research showed no role is given later, "প্যানেলের সব-অঞ্চল অনুমতিতেও ১২ অক্ষর"). Governs R5.
- **The own profile's change of several details is all or nothing, and leaving the edit mode asks first** (the owner: "সব একসঙ্গে, আর সতর্ক করো"). Governs R6 and R7.
- **The preparation for production and the load-test work stay out** (the owner's choice of 2026-11-18). Governs Scope.
- **The repeated code clean-up stays in** (the owner left it in), and `jscpd` is downloaded once for it (the owner: "হ্যাঁ, ডাউনলোড করো", 2026-11-22). Governs R13.
- **The locations check is dropped** (the owner, 2026-11-22: "U16 বাদ দিন"): the locations master stays as it is. Governs R11.
- **A flaky test is fixed at its cause, never by a retry** (`docs/testing/TEST_STRATEGY.md`). Governs R3.
- **Coverage is reported on develop only** (the owner: "কভারেজ শুধু develop-এ"), so a pull request's run stays near 19 minutes. Governs R2 and R4.
- **The plan review's security hardening is added whole** (the owner: "সব যোগ করো"): the profile batch takes only the allowed details, a bounded list and a key scoped to the caller, and never echoes a value; only a caller with GLOBAL reach gives a GLOBAL grant, a revoke is ended only by a caller whose reach covers it, and the pickers list only the caller's own programs, projects and places; a GLOBAL grant holds an open session to the password change too; the E2E job of a pull request holds no secret; the size backfill skips oversized files; `jscpd` runs at a pinned version without secrets. Governs R2, R5, R6, R9, R10, R13.

## Success criteria
- Three develop runs in a row are green, each with all E2E shards.
- The whole E2E suite and the whole web suite pass three times in a row on the owner's machine.
- "Known issues" in `docs/STATUS.md` names no fixed problem.

## Open questions
- **R4:** the coverage minimums per package (lines and branches). Until the owner sets them, CI reports coverage without failing.

## Technical decisions
- **Stack profile unchanged** (`CLAUDE.md`, ST-40 to ST-45): no new runtime dependency. The repeated code is found with `jscpd` run once through `pnpm dlx` at a pinned version, with an environment that holds no `.env` value or token (NE-CFG-02), and is not added to the repository.
- **E2E on pull requests runs beside the unit and API job** (TS-01): the `e2e` job of `.github/workflows/ci.yml` runs on a `pull_request` into develop too (never `pull_request_target`) and needs only `security` (about a minute), not `checks` (about 19 minutes), so the wall time is the longer of the two, about 19 minutes. A secret or an unaccepted advisory still stops it. The job holds `permissions: contents: read` and only the throwaway CI values it has today (the demo accounts, the local database and storage); a pull request from a fork runs it the same way, with no secret. Four shards of about 13 minutes spend about 52 runner minutes per pull request; the owner chose this.
- **Coverage on develop only**: the `checks` job runs `pnpm test:coverage` on a push to develop or main and `pnpm test` on a pull request; the summary groups the root `coverage-summary.json` by package folder (`apps/api`, `apps/web`, `packages/shared`), and the owner's later minimums are per-package checks of that grouping.
- **One rule decides "global" for the password** (AU-10): a service function `holdsGlobalScope(tx, userId)` in `apps/api/src/services/auth.ts` counts the global roles and the active GLOBAL-scope grants (effect `grant`, not ended, inside its dates); `auth.ts` (the change and the reset) and `staff-accounts.ts` (the set-password link, lines 184 and 193, today `minPasswordLength(user.globalRole)`) both call it.
- **The flag holds an open session too**: `require-access.ts` already refuses every operation but the password change while `passwordChangeRequired` is set (line 67); the grant raises the user's permission version so the cached session facts (60 seconds, `session.service.ts`) are read again at once.
- **Who may change GLOBAL reach and lift a revoke** (NE-SEC-03, RE-SEC-05): a GLOBAL-scope grant is given only by a caller whose own panel permission is at GLOBAL scope; a revoke override is ended only by a caller whose panel reach covers the grant's scope and the person; the pickers read the programs, projects and places through the caller's scoped lists, and the server checks the picked reference against the caller's reach as it does today (`services/access.ts` `invalid()`).
- **The profile batch is bounded** (NE-SEC-03, NE-LOG-02): it takes only the detail kinds the one-detail operations take, each through the same validator and rules (a new mobile or email still needs its code); at most 20 details; the idempotency key is stored per user with a hash of the body, and a key reused with another body is refused (409); a refusal names the field and never the value, and the body is not logged.
- **The size backfill is bounded** (NS-03, NS-05): a file over the largest upload size of its kind (`@css/shared/files`) or over the 40-megapixel limit of `checkImage` is skipped and logged once by id; each file is read through the driver its row names (`storage_driver`), not the current setting.
- **A test that fails now and then is fixed at its cause** (`docs/testing/TEST_STRATEGY.md`): an account a spec changes is never used by another spec; the CI retry of one stays as it is and is never raised.
- **The sync centre lets go of its work when the page closes**, with the `alive` flag of `apps/web/src/features/sync/use-sync-store.ts` (lines 42 to 63).
- **The GLOBAL-scope grant sets the existing `password_change_required` flag**, which today only the approval sets (`apps/api/src/services/registrations.ts` lines 583 to 594), and the 12-character minimum reads the active GLOBAL-scope grants beside the global roles (`apps/api/src/services/auth.ts` `hasGlobalScope`, line 88; `packages/shared/src/auth/password.ts` `minPasswordLength`). Ending the grant later does not clear a flag already set; the person still changes the password once.
- **The own profile's several details go in one request** to a new batch operation of each owner (volunteer and official), written in one transaction under an idempotency key like the bulk review of applications (`apps/api/src/applications/bulk.ts`); the one-detail operations stay.
- **The backfill of photo sizes is a job like the name keys** (`apps/api/src/jobs/name-keys.ts`: batches by id, nightly and at the worker's start when rows wait), reading the stored file as `apps/api/src/jobs/file-process.ts` does (lines 112 and 113) and measuring it with `checkImage` (`apps/api/src/files/images-process.ts` line 33).
- **The column is dropped by a migration with its `down.sql`** (DB-MIG rules, ADR-003); the down restores the column and its check.
- **The locations check is a script**, `pnpm --filter @css/api locations:compare <file>`, beside `locations:convert`; it reports and never writes. The owner approves the differences before `locations:convert` and `pnpm db:load-locations` apply them.

## Implementation units
### U1. develop's CI green again
- **Goal:** the sync centre's handler sets no state after the page closes, so the unit and API job of develop is green again.
- **Requirements:** R1
- **Files:** `apps/web/src/features/sync/SyncCentrePage.tsx`, `apps/web/src/features/sync/sync.test.tsx`.
- **Approach:** `run()` and `failWith` (lines 68 to 87) keep an `alive` ref set to false on unmount, as `use-sync-store.ts` does; the test that sends a refused record again waits for the busy button to return before it ends. The E2E half of R1 is proved in U2, whose pull request is the first to run the shards.
- **Tests:**
  - unit: `sync.test.tsx` "groups the records … sends a refused record again" (line 163) and the unmount case (lines 279 to 290) end with no unhandled rejection; the whole web suite reports 0 errors.
  - existing: unit covered by `apps/web/src/features/sync/sync.test.tsx`.
- **Done when:** `pnpm --filter @css/web test` reports no unhandled error.
- **Depends on:** none
- **Size:** S
- **Risk area:** none
- **Status:** done

### U2. The E2E suite on every pull request
- **Goal:** a pull request into develop runs the four E2E shards beside the unit and API job and cannot merge before they pass, and the specs that failed on develop after PR #63 pass.
- **Requirements:** R1, R2, R4
- **Files:** `.github/workflows/ci.yml` (the `e2e` job's `if` at line 138, `needs` at line 140, `permissions`, the header comments at lines 3 to 10; the `checks` job's test step at line 108 runs coverage on develop only, U6), `CONTRIBUTING.md`, `docs/testing/TEST_STRATEGY.md`; the specs that failed on run 43937447149 (`apps/web/e2e/program-pages.spec.ts` line 162, `apps/web/e2e/offline.spec.ts` line 176) if they still fail.
- **Approach:** the `if` admits a `pull_request` into develop; `needs: [security]`; `permissions: contents: read`; the contract test of shard 1 (lines 190 to 198) stays; develop's branch protection requires the four E2E checks (set through `ae-branch.mjs setup --github`, or by the owner in the repository settings). A spec that fails on the shards is fixed at its cause in this unit.
- **Tests:**
  - e2e: this unit's own pull request shows the four shards, all green, within about 20 minutes of the push, with `program-pages.spec.ts` "a program card shows its short description on the front in two lines" and `offline.spec.ts` "an application taken offline with its photo reaches the office when the network returns" passing.
  - existing: e2e covered by the two specs above.
- **Done when:** a pull request's checks hold "E2E (Playwright 1/4)" to "4/4", started beside "Lint, typecheck, test, build", all green.
- **Depends on:** U1
- **Size:** S
- **Risk area:** none
- **Status:** done

### U3. Each E2E account changed by one spec only
- **Goal:** no spec signs in with an account that another spec revokes, signs out or changes.
- **Requirements:** R3
- **Files:** `apps/web/e2e/photo-viewer.spec.ts` (line 11 signs the mobile project in with 01700000102, the desktop devices account of `auth.spec.ts`), `apps/web/e2e/offline.spec.ts` (line 32 signs out every device of 01700000111, which `admin.spec.ts` line 11 and `volunteers.spec.ts` line 10 sign in), `apps/web/e2e/admin-permissions.spec.ts` (both projects change their targets at once, line 102), `docs/testing/DEMO_ACCOUNTS.md` ("Accounts the E2E specs change"), and `apps/api/seed/sets/demo/index.ts` with `apps/api/test/integration/seed.test.ts` if a new demo volunteer is needed.
- **Approach:** a read-only spec takes an account no spec changes; a spec that signs out or revokes keeps its account to itself; where all twenty demo volunteers are taken, the demo seed adds one and the seed test counts it. The held entry of `offline.spec.ts` (the timed-out run recorded in `docs/STATUS.md`, the asf move) is run three times after the account change; if it still fails, its own cause is found and fixed here.
- **Tests:**
  - e2e: `auth.spec.ts` devices, `photo-viewer.spec.ts`, `offline.spec.ts`, `admin.spec.ts`, `volunteers.spec.ts` and `admin-permissions.spec.ts` pass in one full run, three runs in a row.
  - integration: `seed.test.ts` counts a new volunteer, if one is added.
  - existing: covered by those specs.
- **Done when:** `DEMO_ACCOUNTS.md` names one changing spec per account, and three full E2E runs pass.
- **Depends on:** none
- **Size:** S
- **Risk area:** none
- **Status:** done

### U4. A sign-out that a refresh in flight cannot undo
- **Goal:** after a sign-out, a refresh already on its way never restores the session (the cause recorded for the password change spec's failure, `docs/STATUS.md` T1.9d).
- **Requirements:** R3
- **Files:** `apps/web/src/api/client.ts` (the shared refresh), `apps/web/src/lib/auth.tsx` (sign-out), `apps/api/src/services/auth.ts` and `apps/api/src/auth/session.service.ts` (a refresh of a signed-out session), their tests.
- **Approach:** characterize first: a test starts a refresh, signs out before it answers, and checks that no session survives. The client drops the answer of a refresh started before the sign-out; the API refuses the refresh of a session the sign-out ended.
- **Tests:**
  - unit: the client ignores a refresh answer that arrives after the sign-out.
  - integration: a refresh with the cookie of a signed-out session answers 401 and sets no cookie.
  - e2e: `auth.spec.ts` "changes the password and logs in with the new one" passes three times in a row.
  - existing: e2e covered by `apps/web/e2e/auth.spec.ts` line 145; unit and integration: none, characterize first.
- **Done when:** the three tests pass and the spec does not fail in three full runs.
- **Depends on:** none
- **Size:** M
- **Risk area:** auth
- **Status:** done

### U5. The whole web suite on one machine without time-outs
- **Goal:** `pnpm test` passes on the owner's machine with no web component test timing out.
- **Requirements:** R3
- **Files:** `apps/web/vitest.config.mts` (jsdom, no `testTimeout`, so the 5-second default), the root `vitest.config.mts` (the four projects; a worker limit belongs to the run, not a project), `apps/web/package.json` (`test` script), the slow test files a timed run names.
- **Approach:** a run with `--reporter=verbose` names the tests that pass alone and time out together; each such test waits for the element it needs, or on fake timers, instead of real time; where load still stretches the whole run, the worker limit goes into the root config or the `test` script's flags, checked to take effect.
- **Tests:**
  - unit: the whole web suite three times in a row, 0 failures.
- **Done when:** three whole runs of `pnpm test` pass on the owner's machine, and a run shows the worker limit in force.
- **Depends on:** none
- **Size:** S
- **Risk area:** none
- **Status:** todo

### U6. Coverage reported on develop
- **Goal:** CI writes each package's line and branch coverage into the job's summary of every run on develop, without failing until the owner sets minimums.
- **Requirements:** R4
- **Files:** `.github/workflows/ci.yml` (the `checks` job's test step, line 108), the root `vitest.config.mts` (coverage reporters, lines 6 to 15), `scripts/coverage-summary.mjs` (new), `docs/testing/TEST_STRATEGY.md`.
- **Approach:** on a push to develop or main the test step runs `pnpm test:coverage`, on a pull request `pnpm test`; the script groups `coverage/coverage-summary.json` by package folder into a table in `$GITHUB_STEP_SUMMARY`; thresholds stay off (the open question).
- **Tests:**
  - unit: the script turns a small summary of two packages into the expected table.
  - e2e: the first develop run after the merge shows the table; a pull request's run does not run coverage.
- **Done when:** the table is on a develop run, and a pull request's `checks` job is no slower than before.
- **Depends on:** none
- **Size:** S
- **Risk area:** none
- **Status:** done (the table of the first develop run after the merge is checked then)

### U7. A GLOBAL-scope grant asks for the 12-character password
- **Goal:** an official given a GLOBAL-scope permission through the panel sets a password at the next sign-in, and every password of theirs needs 12 characters while the grant is active.
- **Requirements:** R5
- **Files:** `apps/api/src/services/access.ts` (`grant`, about lines 226 to 260; `refusal`, lines 146 to 164), `apps/api/src/services/auth.ts` (`hasGlobalScope` line 88 becomes the shared `holdsGlobalScope`; its use at line 407), `apps/api/src/services/staff-accounts.ts` (lines 184 and 193), `apps/api/test/integration/password-change-required.test.ts`, `apps/api/test/integration/access-panel.test.ts`, `docs/architecture/AUTH.md`, `docs/security/RBAC.md`, `docs/BUSINESS_RULES.md`.
- **Approach:** a grant of effect `grant` at scope GLOBAL is given only by a caller whose panel permission is at GLOBAL scope; it sets `password_change_required` in the same transaction unless the user holds a global role, raises the user's permission version, and its audit entry says so; `holdsGlobalScope` counts the global roles and the active GLOBAL-scope grants, so the change, the reset and the set-password link ask 12.
- **Tests:**
  - integration: a GLOBAL-scope grant sets the flag; a grant at another scope does not; a holder of a global role is not flagged; a manager whose panel permission is narrower than GLOBAL is refused the GLOBAL grant (403); an open session of the flagged official may only change the password, at once; 11 characters refused and 12 taken, also through the reset and the set-password link; an ended or expired GLOBAL grant no longer asks 12; a revoke-effect grant sets nothing; no other official is touched.
  - existing: integration covered by `password-change-required.test.ts` (7 cases) and `access-panel.test.ts`.
- **Done when:** the tests pass and AUTH.md and RBAC.md state the rule.
- **Depends on:** none
- **Size:** M
- **Risk area:** auth
- **Status:** done

### U8. The own profile's details in one request
- **Goal:** a volunteer's or an official's change of several details is taken whole or not at all.
- **Requirements:** R6
- **Files:** `apps/api/src/services/change-requests.ts`, `apps/api/src/services/staff-change-requests.ts`, their routes in `apps/api/src/routes/`, `docs/api/openapi.yaml`, the request schemas in `@css/shared`, the own edit request tests in `apps/api/test/integration/`, `docs/security/AUTHORIZATION_MATRIX.md` (regenerated).
- **Approach:** a batch operation per owner takes a list of at most 20 details of the kinds the one-detail operations take, checks every one through the same validator and rules, and writes all the requests in one transaction under an idempotency key stored per user with a hash of the body, as `apps/api/src/applications/bulk.ts` does for the review; a refused detail answers 422 naming the field and never its value, nothing is written, and the body is not logged.
- **Tests:**
  - integration: three details are written together; one invalid detail refuses all and names it, without its value; a detail kind the one-detail operation refuses is refused; 21 details are refused; a replay with the same key and body writes nothing new, and the same key with another body is refused (409); another user's profile is refused (404); no session answers 401.
  - existing: integration covered by the volunteer's and the official's own request tests in `apps/api/test/integration/`.
- **Done when:** the tests pass, the contract coverage counts the new operations and the matrix is current.
- **Depends on:** none
- **Size:** M
- **Risk area:** personal data
- **Status:** done

### U9. The profile sends once and asks before dropping
- **Goal:** the own profile's edit sends its ticked details in one request, and the Cancel button asks before dropping ticked details.
- **Requirements:** R6, R7
- **Files:** `apps/web/src/features/account/EditSection.tsx` (lines 66 to 90 send one request per detail), `OfficialDetails.tsx` (lines 339 to 356, the Cancel at line 478), `ProfileView.tsx` (the leave guard at lines 158 to 166 and 221 to 230), `edit-form.ts`, `profile-api.ts`, i18n `account`, `profile.test.tsx`, `OfficialProfile.test.tsx`, `apps/web/e2e/profile.spec.ts`.
- **Approach:** the section calls U8's batch operation; the Cancel button with ticked details opens the same confirmation as the section switch (`profile.edit.leave_*`); the official's profile gets the same guard.
- **Tests:**
  - unit: one request carries every ticked detail; a refusal shows under the named detail and keeps the others ticked; Cancel with ticked details asks, and keeping them keeps them.
  - e2e: on `/account/profile`, tick two details, press "বাতিল": the leave question of the section switch appears; confirming shows the section's values unchanged.
  - existing: unit covered by `profile.test.tsx` and `OfficialProfile.test.tsx`; e2e covered by `profile.spec.ts` and `official-profile.spec.ts`.
- **Done when:** the tests pass on both projects.
- **Depends on:** U8
- **Size:** M
- **Risk area:** none
- **Status:** todo

### U10. A list in a bottom sheet stays with the sheet
- **Goal:** on a phone a Combobox opened inside a bottom sheet stays above the sheet and moves with it.
- **Requirements:** R8
- **Files:** `apps/web/src/ui/templates/asf/components/choices.tsx` (the `Combobox`, lines 173 to 226, MUI `Autocomplete` with the default portalled Popper), `components/drawer.tsx` (lines 21 to 49), `src/ui/templates/asf/local.json`, `ui.local.choices.test.tsx`, `apps/web/e2e/asf-gallery.spec.ts`.
- **Approach:** the Drawer gives its content a context; a Combobox inside it renders its Popper inside the sheet (`disablePortal`) above the sheet's body, so it scrolls with it.
- **Tests:**
  - unit: a Combobox inside a bottom Drawer renders its list inside the Drawer's paper; outside a Drawer it stays portalled.
  - e2e: the gallery's sheet with a Combobox at 360 px: open the list, scroll the sheet, the list stays visible above it.
  - existing: unit covered by `ui.local.choices.test.tsx`; e2e covered by `asf-gallery.spec.ts`.
- **Done when:** both tests pass.
- **Depends on:** none
- **Size:** S
- **Risk area:** none
- **Status:** todo

### U11. The permission panel picks its scopes and lifts a revoke
- **Goal:** a grant's program, project or location is chosen from a list, and a revoke override can be ended from the screen.
- **Requirements:** R9
- **Files:** `apps/web/src/admin/permissions/GrantDialog.tsx` (the typed `scopeRef`, lines 191 to 197), `EffectivePermissions.tsx` (row actions, lines 54 and 140 to 155), `RevokeDialog.tsx`, `apps/web/src/admin/projects/ProjectPicker.tsx`, `apps/web/src/features/registration/AddressFields.tsx`, i18n `admin`, `permissions.test.tsx`, `apps/web/e2e/admin-permissions.spec.ts`.
- **Approach:** the scope type chooses the picker (programs from their list, a project from `ProjectPicker`, a location from `AddressFields` down to the chosen level), each read through the caller's scoped list; the server keeps checking the picked reference (`services/access.ts` `invalid()`) and also refuses one outside the caller's reach. The row of a revoke override offers the end through the existing operation (`POST /permission-grants/:grantId/revoke`, `apps/api/src/routes/access.ts` lines 102 to 104), which ends a grant only for a caller whose panel reach covers its scope and its person.
- **Tests:**
  - unit: each scope type offers its picker and sends the picked id; a revoke row offers the end and sends it with the reason.
  - integration: a manager whose reach does not cover a revoke's scope or person is refused its end (404); a picked reference outside the caller's reach is refused (422); the Department Head ends any.
  - e2e: on `/admin/permissions`, a manager withholds a permission at a district picked from the lists, then ends that withholding; the effective list shows the permission again.
  - existing: unit covered by `permissions.test.tsx` (11 cases); e2e covered by `admin-permissions.spec.ts` line 49.
- **Done when:** the tests pass on both projects.
- **Depends on:** none
- **Size:** M
- **Risk area:** permissions
- **Status:** done (moved to `docs/plans/2026-11-19-1000-feat-admin-role-and-permissions-plan.md`, U8 and U9: the scope chosen by name and the revoke given back from the panel's override list)

### U12. The sizes of older photos filled in
- **Goal:** every stored image without a width and height gets them once, read from the file.
- **Requirements:** R10
- **Files:** `apps/api/src/jobs/file-dimensions.ts` (new, after `apps/api/src/jobs/name-keys.ts`), `apps/api/src/jobs/consumers.ts` (lines 147 to 178 start the name keys), `apps/api/src/jobs/queues.ts`, `apps/api/src/container.ts`, a job test in `apps/api/test/integration/`, `docs/architecture/FILES_AND_DOCUMENTS.md`.
- **Approach:** batches of image rows with null sizes, ordered by id; each file read through the driver its row names, `storage.get` and `buffer`, measured by `checkImage`, and written with a guard on still-null sizes; a file over its kind's largest upload size or over 40 megapixels is skipped, and a file that cannot be read keeps null; each is logged once by id; nightly and at the worker's start when rows wait.
- **Tests:**
  - integration: two photos without sizes get them (an upright and a rotated one); a damaged file stays null and the batch goes on; an oversized file is skipped without being read whole; a second run touches nothing; a file that is no image is left out.
  - existing: integration covered by `apps/api/test/integration/file-process.test.ts` for new uploads.
- **Done when:** the tests pass and the worker starts the job when rows wait.
- **Depends on:** none
- **Size:** M
- **Risk area:** file storage
- **Status:** todo

### U13. The unused column dropped
- **Goal:** `registration_drafts.reference_lookups` is gone, with a reverse that restores it.
- **Requirements:** R12
- **Files:** `apps/api/prisma/schema.prisma` (line 494), a new migration with `migration.sql` and `down.sql`, `apps/api/test/integration/constraints.test.ts` (lines 721 and 747 to 751 test its check), `docs/database/DATABASE_SCHEMA.md`, `docs/database/ERD.md` if it names it.
- **Approach:** the migration drops the column; the down adds it back with its default 0 and the check `registration_drafts_reference_lookups_check`.
- **Tests:**
  - integration: the constraint test's case goes; the `migrations.test.ts` round trip passes.
  - existing: integration covered by `constraints.test.ts` and `migrations.test.ts`.
- **Done when:** both tests pass and nothing in `apps/api/src` names the column.
- **Depends on:** none
- **Size:** S
- **Risk area:** migrations
- **Status:** todo

### U14. The registrations page pages past 100 rows
- **Goal:** the officials' registrations, the edit requests and the officials' own requests show every row, page by page.
- **Requirements:** R15
- **Files:** `apps/web/src/admin/registrations/registrations-api.ts` (lines 25 to 29, 49 and 57 ask `limit=100`), `RegistrationsPage.tsx`, `StaffEditRequests.tsx`, `apps/web/src/admin/list-paging.ts` (`numberedPaging`), the registrations tests, and the three list operations' paging in the API where it lacks it.
- **Approach:** each list asks a page with `include=total` and draws `numberedPaging`, as the applications list does.
- **Tests:**
  - unit: 25 officials' registrations over two pages, the pages named, the second page asked with its cursor.
  - integration: the three list operations answer a page and its total, where not yet covered; a cursor replayed by an official outside the list's reach returns no foreign row and no foreign total; the officials' own requests list holds only the caller's; no session answers 401.
  - existing: unit covered by the registrations page tests in `apps/web/src/admin/registrations/`.
- **Done when:** the tests pass.
- **Depends on:** none
- **Size:** M
- **Risk area:** none
- **Status:** todo

### U15. The admin pages' repeated code in shared pieces
- **Goal:** the dialog footers and page headers repeated across the admin pages come from shared pieces, with the same behaviour.
- **Requirements:** R13
- **Files:** `apps/web/src/admin/**` (the places `jscpd` lists), new shared pieces under `apps/web/src/admin/` or the asf kit's additions (`src/ui/templates/asf/local.json`).
- **Approach:** `pnpm dlx jscpd@<pinned version> apps/web/src/admin`, run with an environment that holds no `.env` value or token, lists the repeats (the owner approves the download); a repeat of 10 lines or more in three places or more moves; each moved page's tests stay unchanged.
- **Tests:**
  - unit: the existing tests of every moved page pass unchanged.
- **Done when:** a second `jscpd` run lists no repeat of that size in the admin pages, and the web suite passes.
- **Depends on:** none
- **Size:** M
- **Risk area:** none
- **Status:** todo

### U17. Known issues that hold only what is open
- **Goal:** `docs/STATUS.md` names no fixed problem, and the gallery shows `PageBand`.
- **Requirements:** R14
- **Files:** `docs/STATUS.md`, `apps/web/src/dev/AsfGallery.tsx`, `apps/web/e2e/asf-gallery.spec.ts`.
- **Approach:** the fixed entries go, naming the change that fixed them (the volunteer unblock on the profile, the scope filters of every list, `/beneficiaries` at `x-scope: beneficiary`, the signed-in password hint, the photo scan hook, `Stepper` in the gallery, and everything this plan fixes); the owner's decisions move under a new "Decided to leave as is"; each waiting entry names what it waits for.
- **Tests:**
  - e2e: `asf-gallery.spec.ts` finds `PageBand`.
  - existing: e2e covered by `asf-gallery.spec.ts`.
- **Done when:** every remaining entry says what it waits for.
- **Depends on:** U1, U2, U3, U4, U5, U6, U7, U8, U9, U10, U11, U12, U13, U14, U15 (it names what they fixed; U16 is added to the status when it lands)
- **Size:** S
- **Risk area:** none
- **Status:** todo

### U16. The locations checked against the official list
- **Goal:** every difference between the locations master and the owner's BBS list is reported, and the approved ones are loaded.
- **Requirements:** R11
- **Files:** `apps/api/src/locations/compare.ts` (new, beside `convert.ts`, `csv.ts` and `load.ts`), `apps/api/package.json` (`locations:compare`), `docs/source/data/README.md`, `docs/source/data/bd-locations.csv`, a unit test beside `convert.spec.ts`.
- **Approach:** the script reads the owner's file and the CSV and lists codes and names missing on either side, names that differ, and the unions whose own post code the official list gives (today 4,260 unions carry their upazila's code); it writes nothing. The owner approves the list; `locations:convert` and `pnpm db:load-locations` apply it with the codes kept.
- **Tests:**
  - unit: a missing union, a renamed upazila and an own post code are each reported once; two equal lists report nothing.
- **Done when:** the owner has the report, and the approved changes are in the CSV and loaded. Waits for the owner's file; without it the plan ends after U17.
- **Depends on:** none
- **Size:** M
- **Risk area:** none
- **Status:** dropped (the owner, 2026-11-22: "U16 বাদ দিন"; the locations master stays as it is)

## Checkpoints
- **Mode:** grouped (one by one 0, grouped 14, all at once 1; one by one's 5 moved to grouped since N is over 4)
- **Signals:** N 17, L 1,750, R 6, Fd 2 (U1, U8), C 3 (U1, U2, U17), P 0
- **C1** after U1: a foundation (U2 and U17 build on it)
- **C2** after U4: the CI change and the sign-out fix (auth)
- **C3** after U7: the panel's password rule (auth)
- **C4** after U8: a foundation and a new write operation on personal data
- **C5** after U11: the permission panel (permissions)
- **C6** after U12: a job that reads the stored files (file storage)
- **C7** after U13: a migration
- **C8** after U17 (U14, U15, U17): the paging, the clean-up and the status (end; U16 was dropped)

## Verification
- `pnpm lint`, `pnpm typecheck`, `pnpm docs:check`, `pnpm i18n:check`
- `pnpm test`, `pnpm --filter @css/api contract:coverage`, `pnpm --filter @css/api authz:matrix`
- `pnpm e2e` three times in a row for U3 to U5, and the pull request's four CI shards
- `pnpm --filter @css/web bundle:report` after `pnpm --filter @css/web build`

## Rollback
- U2 and U6: revert the workflow change; nothing else depends on it.
- U7: the flag is set per grant; a revert stops new flags, and a flagged official changes the password once.
- U8: the batch operations are additive and the one-detail operations stay, so reverting U9 alone returns the screen to them.
- U13: the `down.sql` restores the column with its default and check.

## Progress
- **Branch:** U4 to U17 on `fix/open-issues-rest` from develop at b3c83378 (the owner, 2026-11-22: every remaining unit before the UAT); U3 shipped alone from `test/e2e-own-accounts` (the owner's word of 2026-11-19); U4 and U5 start on a new branch from develop; U1 and U2 merged as PR #67 (fb6d6e34), the UAT scripts as PR #68
- **Next:** U9 (the profile sends its ticked details through the batch and asks before Cancel drops them); the three whole runs of U5 go on beside it
- **Reviewed through:** C2 and C3 together at the commit after `3e19a039` (U4 to U7, one pack; earlier: C1 at fb6d6e34 (U1 and U2 went through the pull request's own six checks and develop's run after the merge, all green; no reviewer run: two small units, one a workflow change))
- **Uncommitted:** —
- **Notes:** U8: `POST /me/change-requests/batch` and `POST /me/staff-change-requests/batch` (BR-328), each single create split into its check and its write (`createIn`) so the two paths share every rule; `apps/api/src/services/edit-batch.ts` holds the shared parts (every detail checked before anything is written, a refusal named by its detail, the body kept only as a hash, the answers in the order asked). The key store already in use (`IdempotencyService.runWithKey`) refuses a key reused with another body with 422, not the 409 the unit named; it keeps only the ids of the requests. A detail refused while written (a request still open) answers its own status (409) with the detail named. The answer is a whole list with the meta of a list page, as the panel's grants. C2 and C3 (three reviewers, T2, one pack for U4 to U7 while the second whole run ran): the logout's count moved at its start made a logout with a stale token fail while a refresh was on its way, so the logout now waits for that refresh first and goes out with the newest token, and the count at its end drops a refresh started during it; the two client tests set their order through the requests themselves, no clock; the password change spec sets the old password back in `finally`, and its new password is one constant. Dismissed: the save count of the score test (a self-saving draft saves after a pause, so how many saves a step makes depends on the typing; the test checks what each save holds and the points of every save); a flag left set when the grant ends before the next sign-in (intended and written in AUTH.md: the password is set once); the password literal leads of the E2E spec (the local test account's demo password); no test beside `holdsGlobalScope` (four integration tests cover it). U7: the whole country is given by an Admin or the Department Head only (`whole_country_top_roles_only`, the rule the extra areas already use), stricter than the planned "a holder of the panel at GLOBAL": the panel is the Admin's and the Head's since the Admin role, and a holder an Admin makes at another scope is refused too; a withdrawal at GLOBAL stays open to any holder. The role change of the Admin role already set the flag for a new global role, so the panel's grant was the one gap. `holdsGlobalScope` lives in `apps/api/src/auth/global-scope.ts`, read by the change, the reset and the set-password link. An open session meets the flag after its token goes stale (the grant raises the version) and the refresh. Two panel tests gave the whole country only to set up something else; they now give a region and a program, and the E2E panel spec gives the own records (SELF), so no demo account is asked for a new password; the UAT's step গ-3 gives a region, and ঢ-7 tells of the new password. U6: the grouping lives in `scripts/lib/coverage-summary.mjs` with its types beside it and its test in `packages/shared/test/`, as the rule status does; `scripts/coverage-summary.mjs` appends the table to `GITHUB_STEP_SUMMARY` and prints it; a pull request runs `pnpm test` alone. U4: the server already refused a crossed refresh (the rotation updates only a row whose session is not revoked); the new API test sends a refresh and the logout together five times and finds no cookie that opens the session afterwards, passing on the code as it was. The client accepted a refresh that answered while the logout request was still on its way (the count of sign-ins moved only after the logout's answer), shown by a new client test that failed for that reason; the count now moves when the logout starts. The password change spec could not repeat (the first round left the account on the new password); it now sets the old one back through the API and passed 6 of 6 with `--repeat-each 3 --workers 1`. U2: develop is protected on GitHub since 2026-11-18 (the six checks required, no force push, no deletion; admins may pass). The pull request's third shard took 25 minutes once and 7 the next time; watch it. U3: the offline journeys got a demo volunteer of their own (21, 01700000121), `photo-viewer.spec.ts` (mobile) and `volunteers.spec.ts` (desktop) read their refusal as volunteer 3, and `admin.spec.ts` keeps volunteers 11 and 12, whose saved language it switches; the six specs ran together, 40 passed. The three full runs in a row of U3's Done-when are left for C2, with U4 and U5. The pull request's first shard run failed in the web contract test, not in E2E: `tests/contract/photos.contract.test.ts` (added with the photo viewer) uploaded a program's cover as the PM, whom `program.update` refuses (403). It skips without `CONTRACT_API_URL`, so it had never run; it now signs in as the Department Head and passed against the E2E API (65 of 65). A contract test is run with the API's address before it is called passing. U1 also guards the overview read of `use-sync-store.ts` (it set state after its await too) and adds `apps/web/src/lib/use-alive.ts`; the whole web suite then ran with 0 unhandled errors, 8 tests timed out under load and passed when their 5 files ran alone (U5). PR #66 merged as ece97080 before this branch started; its own CI run passed the unit and API job, so the unhandled rejection of the sync test is intermittent.
