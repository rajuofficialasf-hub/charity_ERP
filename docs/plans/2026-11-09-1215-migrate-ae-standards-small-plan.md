---
title: Bring the repo to the As-Sunnah standards, the small part
type: migrate
status: in-progress
source: plan
date: 2026-11-09
doc_review: 2026-11-09
---

# Bring the repo to the As-Sunnah standards, the small part

## Goal
The repository follows the organization's engineering standards (the `assunnah-engineering` plugin, version 0.30.0) on branching, CI, configuration, request security, raw SQL, React data fetching and keys, the API client and code comments, so later work starts from the standard and not from the project's own variants.

## Problem
On 2026-11-09 the owner made the standards the base of the project: anything outside them needs the owner's permission, and every place the repo does not match is converted to the standard. A gap analysis against the standards found 23 mismatches. The owner chose to start with the small ones (items 1 to 9 of that list); the large ones (asf-auth, two repositories, the NAS driver, health probe paths, forms on react-hook-form) are separate decisions later.

## Requirements
- **R1** The repository has `main` and `develop`; every work branch starts from `develop`, its pull request goes into `develop` and is squash-merged, and a release is a pull request from `develop` into `main` (GIT-01, GIT-04, GIT-06, GIT-07).
- **R2** On GitHub `develop` is the default branch, `main` and `develop` are protected, merged branches are deleted (GIT-14; the owner said yes to the settings).
- **R3** CI runs on every pull request and on every push to `main` and `develop` (GIT-13).
- **R4** Work branches are named `<type>/<topic>` from the standard's list of types (GIT-03).
- **R5** Every action in the workflows is pinned by commit SHA and the workflow has no zizmor finding (ST-35).
- **R6** In production the API refuses to start with any local default secret or with a missing one: the JWT, CSRF, OTP, cursor and local-key secrets, the S3 keys and the database password of `.env.example` and the dev compose file (NE-CFG-04).
- **R7** The CORS allowlist comes from `ALLOWED_ORIGINS`, parsed as exact `scheme://host[:port]` origins; `*`, a path or a non-http(s) value stops the API at startup (NE-SEC-02).
- **R8** A POST, PUT, PATCH or DELETE whose `Origin` is missing, `null` or not allowed is answered 403 with a localized error (NE-SEC-05).
- **R9** No `$executeRawUnsafe` in the application code (DB-Q-01).
- **R10** Lists that can reorder, insert or delete use keys from stable ids, never the array index (RE-CMP-01).
- ~~**R11**~~ (dropped: the plan review found every page already on TanStack Query and no effect that fetches; RE-FX-02 is met, the gap list was wrong)
- **R12** The web app calls the API only through `src/api/client.ts` with `credentials: 'include'`; in local dev it calls the backend on its own port through `VITE_API_BASE_URL`, a production build uses an empty base (RE-SEC-06; the owner chose the full rule over keeping the Vite proxy in dev).
- **R13** No rule, decision, plan or task ID in code: comments, TSDoc, test names, log and error messages, config comments; the meaning is written in words (ORG-CMT-10), package by package.

## Scope
- In: the thirteen requirements above, the documents they change (CLAUDE.md, CONTRIBUTING, TEST_STRATEGY, BUSINESS_RULES register, SYSTEM_ARCHITECTURE, DEPLOYMENT, `.env.example`), the decision record.
- Out (not now): asf-auth and tokens only in cookies (ST-04, ST-42, AU-20); two repositories and npm (ST-20, ST-21); health probe paths and shutdown phase (NE-ERR-04, NE-ERR-05); the refresh cookie's path (part of NE-SEC-05, one forced sign-in; with asf-auth); the web contract test (ST-24, TS-04); ESM for the backend (ST-14); the raw `pg` client (ST-45); forms on react-hook-form (RE-CMP-03, RE-CMP-04); the NAS driver.

## Key decisions
- **The standards are the base; mismatches are converted** (owner in chat, 2026-11-09). Recorded as D-167 in the first unit.
- **IDs leave the code package by package** (owner's choice): shared, then api, then web, each its own pull request; the BUSINESS_RULES register lines follow the renamed tests in the same pull request.
- **Full RE-SEC-06 in dev** (owner's choice): the web dev server calls `http://127.0.0.1:4000` directly; the Vite proxy stays only for `vite preview` of the production build used by the E2E run, whose base is empty.
- **GitHub settings with `ae-branch.mjs setup --github`** (owner's choice); the protection binds admins too (owner's choice).
- **E2E runs on pushes to `develop` and to `main`** (owner's choice): every merge is checked at once, and a release again.

## Technical decisions
- **Stack profile unchanged** (ST-40 to ST-45): this plan adds no stack piece; CLAUDE.md's Stack profile keeps its lines, and its Git safety and commands text changes for `develop` (ST-43).
- **One Origin middleware before the routers** (NE-SEC-05): allowed set = `ALLOWED_ORIGINS` plus `APP_ORIGIN` (the PWA's own origin, same-origin in production behind Caddy); safe methods pass; the refusal is `ApiError('request.origin_refused', 403)` rendered by `http/errors.ts` in the request language; an exemption list by route name stays empty (no webhook exists). Follows `apps/api/src/http/security.ts` (`corsAllowlist`).
- **Test requests carry the app's origin** (TS-01): `test/support/app.ts` and `test/integration/support/auth-app.ts` wrap the app so a request without `Origin` gets `APP_ORIGIN`, unless the test asks for none; the refusal tests ask for none or a foreign origin.
- **A fixed savepoint name** (DB-Q-01): rows run one after another in one transaction, so `SAVEPOINT bulk_row` with the tagged `$executeRaw` replaces the per-index names; Postgres releases or rolls back the newest savepoint of that name.
- **One ID pattern for the cleanup** (ORG-CMT-10): `\b(D|BD|BR|UX|O|E|ADR)-\d{2,3}\b|\bT\d\.\d+[a-z]?\b|\b(NE|RE|ST|TS|DB|NS|AU|GIT|ORG)-[A-Z]*-?\d{2}\b` over `*.ts, *.tsx, *.mjs, *.css, *.yml`, outside `node_modules`, `dist`, `generated` and the SQL of applied migrations (an applied migration's file keeps its checksum); a pointer to a document by name ("AUTH.md section 2") is words, not an ID, and stays.
- **Stable keys from a client id** (RE-CMP-01): rows without a data id get a `uuidv7()` client key when created or loaded (kept out of the saved JSON), following the repeat rows of `features/forms/RepeatGroup.tsx`.
- **`VITE_API_BASE_URL`** (RE-SEC-06): read once in `src/api/client.ts`; the dev env file sets `http://127.0.0.1:4000`, and the API's dev `ALLOWED_ORIGINS` gets `http://127.0.0.1:3000`. Cookies stay `SameSite=Lax`: 127.0.0.1:3000 and :4000 are the same site.

## Implementation units

### U1. `develop`, GitHub settings and the decision record
- **Goal:** the branch model of the standard is in place and recorded.
- **Requirements:** R1, R2, R3, R4
- **Files:** `.github/workflows/ci.yml` (push trigger `main`, `develop`; the E2E job's `if:` and the header comment for both branches), `docs/DECISION_LOG.md` (D-167), `CLAUDE.md` (Working rules: Git safety, branch flow), `CONTRIBUTING.md`, `docs/STATUS.md`
- **Approach:** `node <plugin>/scripts/ae-branch.mjs setup --github` from an up-to-date `main`; then this plan's branches start with `ae-branch.mjs start`. The open pull request #48 (`feat/mobile-apply-redesign`) is retargeted to `develop`. The protection of both branches requires a pull request and the CI checks, blocks force push and deletion, and applies to admins. The owner's standing rule "merge to main after green CI" becomes "merge to develop after green CI; a release to main on the owner's word".
- **Tests:**
  - existing: CI itself; `pnpm docs:check`
- **Done when:** `git ls-remote origin develop` answers; the GitHub default branch is `develop`; `gh api repos/:owner/:repo/branches/develop/protection` (and `main`) shows the required checks, a required pull request, no force push or deletion, admins enforced; CI and E2E run on a push to `develop`; D-167 is in the log.
- **Depends on:** none
- **Size:** S
- **Risk area:** none
- **Status:** done

### U2. Actions pinned by SHA
- **Goal:** the workflow passes zizmor.
- **Requirements:** R5
- **Files:** `.github/workflows/ci.yml`
- **Approach:** each `uses:` gets the commit SHA of its current tag with the tag in a trailing comment; the gitleaks image by digest; `permissions:` least per job; no secret reaches a pull request from a fork; run `zizmor` if installed (`ae-setup` lists it), else say so.
- **Tests:**
  - existing: CI run on the pull request
- **Done when:** no `uses:` line without a 40-character SHA; zizmor clean or reported as not run.
- **Depends on:** U1
- **Size:** S
- **Risk area:** none
- **Status:** done

### U3. Production refuses the local secrets
- **Goal:** a production start with any example or missing secret fails at once.
- **Requirements:** R6
- **Files:** `apps/api/src/config/env.ts`, `apps/api/src/config/env.spec.ts`, `apps/api/.env.example`, `infra/docker-compose.app.yml` (comment: local only), `docs/ops/DEPLOYMENT.md`
- **Approach:** extend the existing `superRefine` (it already refuses `LOCAL_KEY_SECRET` starting `change-me`). In production a value is refused when it starts with `change-me` or `dev-only-` or contains `css_dev_only`. Checked always: `JWT_SECRET`, `AUTH_CSRF_SECRET`, `OTP_SECRET`, `CURSOR_SECRET`, `LOCAL_KEY_SECRET`, the password in `DATABASE_URL`; checked when set: `JWT_PREVIOUS_SECRET`, `LOCAL_KEY_PREVIOUS_SECRET`, `HEALTH_TOKEN`, `SMTP_PASSWORD`; `MINIO_ACCESS_KEY` and `MINIO_SECRET_KEY` required and checked when `STORAGE_DRIVER=s3`. The message names the key and never prints the value or the database URL (NE-CFG-03). `.env.example` and the dev compose file mark those values "local only".
- **Tests:**
  - unit: production refused for every secret value of `.env.example` and of `infra/docker-compose.app.yml`, one case each, naming the key without the value; production with real values starts; development keeps the examples
  - existing: covered by the env tests of `apps/api/src/config` (update, not duplicate)
- **Done when:** the unit tests pass; `NODE_ENV=production` with `.env.example` refuses with every offending key listed.
- **Depends on:** none
- **Size:** S
- **Risk area:** auth
- **Status:** todo

### U4. `ALLOWED_ORIGINS`
- **Goal:** the CORS allowlist follows the standard's name and parsing.
- **Requirements:** R7
- **Files:** `apps/api/src/config/env.ts`, `apps/api/src/app.ts`, `apps/api/src/http/security.ts`, `apps/api/test/api/cors.api.test.ts`, `apps/api/.env.example`, `infra/docker-compose.app.yml`, `docs/architecture/SYSTEM_ARCHITECTURE.md`, `docs/ops/DEPLOYMENT.md`
- **Approach:** rename `CORS_ORIGINS` in `env.ts`, `app.ts`, the CORS test and SYSTEM_ARCHITECTURE, and document `ALLOWED_ORIGINS` in `.env.example`, the dev compose file and DEPLOYMENT; the zod transform parses each entry with `URL`, keeps `origin` only when it equals the entry, refuses `*`, paths and non-http(s); in production every entry must be `https://` and not a loopback host; startup fails with the bad entry named.
- **Tests:**
  - unit: valid list, `*`, a path, `ftp://`, a trailing slash, empty list; production refuses `http://` and `https://127.0.0.1`
  - integration: an allowed origin gets the allow headers with credentials; another origin gets none
  - existing: covered by `apps/api/test/api/cors.api.test.ts`
- **Done when:** tests pass; no `CORS_ORIGINS` left in `apps/`, `infra/` and the current docs (the history of STATUS and DECISION_LOG stays).
- **Depends on:** none
- **Size:** S
- **Risk area:** auth
- **Status:** todo

### U5. Origin check on writes
- **Goal:** a cross-site or origin-less write is refused before any route runs.
- **Requirements:** R8
- **Files:** `apps/api/src/http/security.ts` (`originCheck`), `apps/api/src/app.ts`, `apps/api/src/http/errors.ts`, `packages/shared/src/i18n/messages/{bn,en}/errors.json` (or the errors namespace in use), `docs/api/openapi.yaml` and `apps/api/src/openapi` (403 on writes, if the drift test needs it), `apps/api/test/support/app.ts`, `apps/api/test/integration/support/auth-app.ts`, new `apps/api/test/api/origin.api.test.ts`, `apps/web/playwright.config.ts` and the request contexts of `apps/web/e2e/support/*.ts` (the API calls of the E2E helpers send the app origin), any script or smoke test that writes to the API, `docs/security/SECURITY_POLICY.md`, `docs/api/API_STANDARDS.md`
- **Approach:** middleware after CORS and before the JSON parser; GET, HEAD, OPTIONS pass; the allowed set from U4 plus `APP_ORIGIN`; refusal logged at warn with the method and path; follows `corsAllowlist` in `http/security.ts`.
- **Tests:**
  - integration: POST with the app origin passes; with no Origin, `null`, a foreign origin → 403 `request.origin_refused` with the bn and en message; GET without Origin passes; the public form submit and the sign-in with the app origin pass
  - e2e: no new spec; the E2E helpers' direct API calls (about 26 writes through Playwright's `request`, which sends no `Origin`) get the app origin through `extraHTTPHeaders` of their request contexts; the existing journeys then prove the browser's same-origin writes and the helpers' seeding still work
  - existing: every API and integration test (they get the default origin through the test app)
- **Done when:** the new tests pass and the full API suites pass unchanged in behavior.
- **Depends on:** U4
- **Size:** M
- **Risk area:** auth
- **Status:** todo

### U6. The bulk review's savepoints without raw unsafe SQL
- **Goal:** no `$executeRawUnsafe` remains.
- **Requirements:** R9
- **Files:** `apps/api/src/applications/bulk.ts`
- **Approach:** tagged `tx.$executeRaw` with the fixed name `bulk_row` for SAVEPOINT, RELEASE and ROLLBACK TO.
- **Tests:**
  - integration: a bulk run with one refused row in the middle keeps the rows before and after
  - existing: covered by `apps/api/test/integration/bulk-review.test.ts`
- **Done when:** `grep -r executeRawUnsafe apps/api/src` is empty and the bulk tests pass.
- **Depends on:** none
- **Size:** S
- **Risk area:** none
- **Status:** todo

### U7. Stable keys in the editable lists
- **Goal:** inserting, removing or moving a row never moves another row's state.
- **Requirements:** R10
- **Files:** `apps/web/src/admin/forms/CalculationEditor.tsx`, `apps/web/src/admin/forms/ConditionEditor.tsx`, `apps/web/src/admin/forms/ScoreSettings.tsx`, `apps/web/src/admin/projects/setup/BudgetSection.tsx`, their tests in `apps/web/src/admin/forms/*.test.tsx` and `apps/web/src/admin/projects/setup/*.test.tsx`
- **Approach:** a client key per row from `uuidv7()` when a row is created or loaded, stripped before save; static lists (`ChangeSummary.tsx`, `features/account/DetailValues.tsx`, the three index keys in `ui/templates/asf/components`) checked and left when they never reorder.
- **Tests:**
  - unit: removing the first of three rows keeps the typed values of the other two in their fields (each editor)
  - existing: the editors' component tests
- **Done when:** no `key={i}` or `key={index}` on an editable list; the new tests pass.
- **Depends on:** none
- **Size:** M
- **Risk area:** none
- **Status:** done

### ~~U8~~. TanStack Query on the three pages (dropped: the plan review found the three pages already on `useQuery` and no effect that fetches anywhere in `apps/web/src`; RE-FX-02 is met)
- **Goal:** the form builder, the project setup and the organogram load their data through queries.
- **Requirements:** ~~R11~~
- **Files:** `apps/web/src/admin/forms/FormBuilderPage.tsx`, `apps/web/src/admin/projects/setup/ProjectSetupPage.tsx`, `apps/web/src/admin/staff/OrganogramPage.tsx`, their tests
- **Approach:** `useQuery` with keys beside the existing ones of each area (for example the project keys of `admin/projects`), loading and error states through the existing `Skeleton` and `LoadError`; the builder's self-saving draft (`use-draft-save.ts`) keeps its own flow.
- **Tests:**
  - unit: each page shows its data, its loading state and its error with retry
  - existing: the pages' component tests; `e2e/form-builder.spec.ts`, `e2e/projects.spec.ts` on desktop
- **Done when:** nothing to do.
- **Depends on:** none
- **Size:** M
- **Risk area:** none
- **Status:** done (dropped)

### U9. The API client at `src/api/client.ts`
- **Goal:** one client path, credentials included, dev talking to the backend's own port.
- **Requirements:** R12
- **Files:** `apps/web/src/lib/api.ts` → `apps/web/src/api/client.ts` and every importer (177 files, a mechanical import change), `apps/web/vite.config.ts` (dev proxy removed, preview proxy kept), `apps/web/.env.development` (new, `VITE_API_BASE_URL=http://127.0.0.1:4000`), `apps/web/.env.example`, `apps/web/src/vite-env.d.ts`, `apps/web/src/sw.ts` (the API test of the worker), `apps/api/.env.example` (`ALLOWED_ORIGINS=http://127.0.0.1:3000`), `infra/docker-compose.app.yml` (`ALLOWED_ORIGINS`, and `TRUST_PROXY` false once no proxy sits in front of the dev API), `README.md`, CLAUDE.md repository map
- **Approach:** `git mv` keeps history; one base prefixes every path: `VITE_API_BASE_URL` in dev only, an empty base in every production build (the client ignores the variable outside dev, and `vite.config.ts` stops a production build that sets it); `credentials: 'include'` on the three fetches; the service worker's "never cache the API" test matches the API by path on both origins.
- **Tests:**
  - unit: the client builds `${BASE}/api/v1/...`; credentials include; refresh still shares one call; a production build keeps the base empty
  - e2e: `e2e/auth.spec.ts`, `e2e/shell.spec.ts` and `e2e/offline.spec.ts` on the mobile project against the preview build (empty base); a manual dev check: sign in, reload, sign out at http://127.0.0.1:3000 with the API at :4000
  - existing: `apps/web/src/lib/api.test.ts` (moves with the file)
- **Done when:** no import of `lib/api`; dev sign-in and refresh work across the two ports; the E2E specs pass.
- **Depends on:** U4, U5
- **Size:** L
- **Risk area:** auth
- **Status:** todo

### U10. IDs out of `packages/shared`
- **Goal:** the shared package carries no ID in code.
- **Requirements:** R13
- **Files:** `packages/shared/src/**` and its tests; the BUSINESS_RULES register lines of renamed tests; `docs/testing/TEST_STRATEGY.md` section 7 (drop "older tests keep the id")
- **Approach:** each ID replaced by what it stands for, read from DECISION_LOG or BUSINESS_RULES; test names say the behavior; `pnpm rules:status --phase 1` and `--phase 2` stay green.
- **Tests:**
  - existing: the package's tests and `pnpm docs:check` (register lines point at existing tests)
- **Done when:** the ID pattern of the technical decisions finds nothing in the package; tests and docs check pass.
- **Depends on:** none
- **Size:** M
- **Risk area:** none
- **Status:** todo

### U11. IDs out of `apps/api`
- **Goal:** the API carries no ID in code, comments, messages or test names.
- **Requirements:** R13
- **Files:** `apps/api/src/**`, `apps/api/test/**`, `apps/api/scripts/**`, `apps/api/prisma/**` comments (migration SQL already applied stays as it is: changing an applied migration's file changes its checksum), the register lines
- **Approach:** as U10; error and log messages lose the bracketed IDs (`(BR-024)`, `(D-072)`), and the tests that assert those messages change with them.
- **Tests:**
  - existing: API unit and both API Vitest projects, the OpenAPI drift test, `pnpm docs:check`
- **Done when:** the ID pattern finds nothing outside applied migrations; suites pass.
- **Depends on:** U3, U4, U5, U6, U10
- **Size:** L
- **Risk area:** none
- **Status:** todo

### U12. IDs out of `apps/web`
- **Goal:** the web app carries no ID in code, styles, specs or test names.
- **Requirements:** R13
- **Files:** `apps/web/src/**`, `apps/web/e2e/**`, `apps/web/test/**`, `apps/web/scripts/**`, the register lines
- **Approach:** as U10.
- **Tests:**
  - existing: `apps/web` Vitest, typecheck, lint, the Playwright specs whose names change (listed by the grep)
- **Done when:** the ID pattern finds nothing; suites pass.
- **Depends on:** U7, U9, U11
- **Size:** L
- **Risk area:** none
- **Status:** todo

## Checkpoints
- **Mode:** grouped (one by one 6, grouped 16, all at once 0; N is over 4, so one by one's points go to grouped)
- **Signals:** N 11, L 1,900, R 4, Fd 1, C 4, P 1 (scored again after the review dropped U8)
- **C1** after U3: a risk unit (production secrets); covers U1 to U3
- **C2** after U4: foundation of U5 and U9, and a risk unit
- **C3** after U5: a risk unit that U9 depends on
- **C4** after U7: size limit, U9 touches over 25 files
- **C5** after U9: a risk unit and a new pattern (dev across two ports)
- **C6** after U10: size limit, U11 touches over 25 files
- **C7** after U11: size limit, U12 touches over 25 files
- **C8** after U12: end

## Verification
- `pnpm typecheck`, `pnpm lint`, `pnpm docs:check`, `pnpm rules:status --phase 1`, `pnpm rules:status --phase 2 --report-only`
- the ID pattern of the technical decisions, with `grep -rEn` over the units' folders
- `pnpm test` (Vitest: shared, api unit, api-db, web with `--maxWorkers=4` on this machine)
- `pnpm --filter @css/api contract:coverage --no-run` after the API runs
- `pnpm e2e` before the release pull request; per unit the specs named in its Tests
- U1: `git ls-remote origin develop`; `gh api repos/:owner/:repo --jq .default_branch`

## Risks and rollback
- **U5 Origin check:** a client that sends no `Origin` on a write is refused. Rollback: revert the middleware commit; no data changes.
- **U9 dev across two ports:** a cookie or CORS mistake shows as a sign-in loop in dev only (production keeps the same origin). Rollback: revert U9's commit; `VITE_API_BASE_URL` unset means the empty base.
- **U3:** a production deploy with an example secret stops at start instead of running weakly; the deployment guide lists every key.
- **U1 settings:** branch protection can be lifted in the repository settings by the owner if it blocks an emergency.

## Definition of done
- All units done and their tests pass
- Verification commands pass
- `ae-review` has run, with no open P0 or P1
- Code from abandoned attempts is removed

## Progress
- **Branch:** `chore/ae-standards-small`
- **Updated:** 2026-11-09 12:45
- **Next:** U3 tests once Node 24.16 or later is installed (the owner installs it), then U4
- **Reviewed through:** none
- **Uncommitted:** U3 written and typechecked, tests not run: apps/api/src/config/env.ts, env.spec.ts, apps/api/.env.example, infra/docker-compose.app.yml, docs/ops/DEPLOYMENT.md
- **Notes:** `develop` was created and pushed and made the default branch with `ae-branch.mjs setup --github`, and PR #48 was retargeted to develop. Branch protection is not available: the repository is private on GitHub's free plan, so neither main nor develop can be protected (the owner chose protection binding admins too); the plugin's guard is the only protection until the plan changes. The API Vitest projects refuse Node 24.15.0 on Windows (the guard of D-164); the owner installs Node 24 LTS, so U3 to U6 and U11 wait for it, and U7 was built first. U7: one hook src/lib/use-row-keys.ts keeps a key per row beside the data; its own test proves a removed row takes its key, so no test per editor was added (the editors are controlled by their data). U2: zizmor is not installed on this machine, so it did not run; the actions, the postgres and gitleaks images are pinned by SHA or digest and every checkout has persist-credentials false (its usual finding). The structure reviewer found the gap list wrong on RE-FX-02, so U8 was dropped.
