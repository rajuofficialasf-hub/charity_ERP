---
title: Bring the repo to the As-Sunnah standards, the rest
type: migrate
status: in-progress
source: plan
date: 2026-11-11
doc_review: 2026-11-11
---

# Bring the repo to the As-Sunnah standards, the rest

## Goal
The code follows the remaining code-only rules of the organization's standards: comments point at documents by path and heading, the local S3 stand-in and its settings are the standard's, no raw database client in the app's own code, every workspace compiles on the standard's base options (`verbatimModuleSyntax` included), the backend runs as ESM, and every form with a submit is built on the asf contract's `Form` with react-hook-form and zod.

## Problem
The owner made the standards the base of the project (D-167) and, on 2026-11-11, asked to finish them before anything else: the Phase 2 UAT and the NAS move are left to the department's engineers. After the small part (PR #49) and the code-only part (PRs #50, #51), six code-only conversions remain, which earlier plans left out. Two items need something from outside and wait: asf-auth (its source lives in the organization's `skill-web` repository) and the split into two repositories (the owner keeps one, which the standard allows for an existing combined repository).

## Requirements
- **R1** The decisions of 2026-11-11 are in the decision log: the owner's (asf-auth waits for its source; the combined repository stays) with the owner's words, and the team's technical decisions under D-167 (the tests keep `pg` as their own tool; SeaweedFS and the standard's S3 setting names replace MinIO's in development and CI; every form on react-hook-form, the forms line of the stack profile) with their reasons.
- **R2** No code comment points at a document by a section number (`RBAC.md 7`, `API_STANDARDS 4`, `§13`): a pointer names the file by path and the part by its heading, or is removed where the comment says enough (ORG-CMT-08, ORG-CMT-11); no decision or plan ID is left in code comments (ORG-CMT-10).
- **R3** Local Docker and CI use SeaweedFS as the S3 stand-in (NS-20), reachable from this machine only; the API reads the standard's S3 setting names (`S3_ENDPOINT` a full URL with scheme and port, replacing `MINIO_ENDPOINT`, `MINIO_PORT` and `MINIO_USE_SSL`; `S3_REGION`; `S3_ACCESS_KEY_ID` and `S3_SECRET_ACCESS_KEY`, replacing `MINIO_ACCESS_KEY` and `MINIO_SECRET_KEY`), refuses each of the five earlier `MINIO_*` names by name, refuses the committed dev key pair in production, and keeps its private buckets, path-style requests and its readiness check (NS-34, NS-40, NS-42, NS-44).
- **R4** The app's own code, the seed and the scripts reach the database through Prisma only (ST-03); pg-boss keeps its own driver; the tests keep `pg` for raw database checks (R1).
- **R5** Every workspace starts from the standard's base compiler options, `verbatimModuleSyntax` included (ST-14), with no option loosened to pass (ST-16).
- **R6** The backend is ESM: `"type": "module"`, `NodeNext`, relative imports ending in `.js`, no `__dirname` or `require`; production still runs the compiled JavaScript with `node` (ST-14, ST-15); the dev server, the worker, the tests, the E2E server and the Docker image run as before.
- **R7** Every form with a submit outside the dynamic application forms and the form builder's canvas is built on the asf contract's `Form` with react-hook-form and a zod schema (RE-CMP-03, RE-CMP-04), with the same labels, messages, validation and requests as today.

## Scope
- In: the seven requirements, the documents they change (CLAUDE.md stack profile and commands, README, DEPLOYMENT, SYSTEM_ARCHITECTURE, FILES_AND_DOCUMENTS, TEST_STRATEGY, CONTRIBUTING, the UAT start commands, `.env.example`, `infra/`), the decision record.
- Out (not now): asf-auth and tokens only in HttpOnly cookies (waits for the source); two repositories and npm (the owner keeps one); the dynamic application forms (`FormRenderer`, `ApplicationFormPage`, `PublicApplyPage`) and the form builder's canvas and editors (`FormCanvas`, `SettingsPane` with its panels `RepeatSettings`, `TableSettings` and `DefaultSettings`, `CalculationEditor`, `ConditionEditor`, `FormBuilderPage`), which are their own engine and already build on react-hook-form where they hold answers; the NAS mount and copy (the department's engineers).

## Key decisions
- **One plan for the six conversions, small first, forms last** (owner, 2026-11-11: "সব এক plan-এ").
- **asf-auth waits for its source** (owner, 2026-11-11: "source পেলে করব"); the own AUTH.md implementation stays, the deviation of D-074 section 4.
- **The combined repository stays** (owner, 2026-11-11: "একটাই থাক"); the standard lets an existing combined repository keep working (ST-20).

## Technical decisions
- **Stack profile** (ST-40 to ST-45): unchanged except three lines, each recorded in D-169 first (ST-43): Storage (SeaweedFS as the local S3 stand-in, U3), Database (Prisma for the app, `pg` only in the tests and under pg-boss, U4), and the forms line (every form on react-hook-form, the earlier forms' own state gone, U10).
- **The tests keep `pg`** (ST-03 names ORMs and query builders, not drivers; R4): the database tests hold about 980 raw queries in 98 files, nearly all through the harness's `pg` client (`h.db.query` of `test/integration/support/auth-app.ts`, cloned per file by `support/db.ts`), so only about 14 test files import `pg` themselves; those queries check triggers, constraints and Postgres error codes that Prisma wraps, and a test database is cloned from a template with `CREATE DATABASE … TEMPLATE` on a maintenance connection; moving them would weaken the tests. `pg` stays a dev dependency of the tests and of pg-boss, never imported by `src/` outside `jobs/`.
- **Comments by script, then by hand** (ORG-CMT-11): a scratchpad script maps `DOC N[.M]` through an alias table (`RBAC.md` → `docs/security/RBAC.md`, …) to `docs/…, "<heading text>"` from the numbered headings of the six documents; bare `§N`, constitution sections and unmapped numbers are rewritten or removed by hand; the script stays outside the repository, as in the earlier ID cleanup.
- **SeaweedFS** (NS-20, development and CI only): the `chrislusf/seaweedfs` image pinned by digest, `weed server -s3` with an S3 config file of one throwaway identity whose key pair carries the `css_dev_only` marker, so the production check of the public example secrets refuses it (as it refuses the other local secrets, D-167); the S3 port published on `127.0.0.1` only in the dev compose file and unpublished in the app compose file; a bootstrap that creates the seven buckets with the AWS CLI image (pinned) and grants no anonymous access, ACL or policy (NS-40). What the MinIO bootstrap set and SeaweedFS does not carry over is dropped in dev on purpose: the versioning of `documents` and `photos` (a production backup concern, ADR-005, kept by whichever store production runs) and the bucket expiry of `exports` and `uploads` (the app's own sweeps already delete expired exports and upload parts, `jobs/export-sweep.ts`, `jobs/upload-sweep.ts`). The API's S3 client keeps `forcePathStyle`, adds `requestChecksumCalculation: 'WHEN_REQUIRED'`, and takes its region from `S3_REGION` (`us-east-1` in dev). CI starts it as a step, as MinIO is today. The five earlier `MINIO_*` names are refused at start with their new name, as `CORS_ORIGINS` and `STORAGE_FS_ROOT` are; no environment is deployed yet, so DEPLOYMENT.md lists the new names and the rename as a deploy note.
- **Raw SQL stays safe in Prisma** (NE-SEC-03): U4's statements use the tagged `$executeRaw`/`$queryRaw` only; the import rule of U4 also refuses `$queryRawUnsafe` and `$executeRawUnsafe` in `src/`, `seed/` and `scripts/`, and a dynamic identifier is built with `Prisma.raw` from a constant only.
- **verbatimModuleSyntax first, ESM second** (ST-14): U5 turns on the missing base option in `packages/config/tsconfig/base.json` for every workspace and fixes the type-only imports it reports (`import type`), without loosening anything; U6 then switches the API with a scratchpad codemod for the `.js` endings, `import.meta.dirname` for `__dirname`, `createRequire(import.meta.url)` where a CJS-only path is needed, and the Prisma generator's `moduleFormat = "esm"`. `tsx` (dev, scripts) and Vitest already run ESM; the build stays `tsc` and the start `node dist/server.js` (ST-15).
- **Sign-in stays one message** (AU-10, RE-SEC-03): the sign-in and reset forms' resolvers only check that a field is filled (no password rule shown before the server answers), every sign-in failure keeps showing the one same message, and no password or token field takes a default from storage or is kept anywhere but the form's memory.
- **Forms on the asf contract** (RE-CMP-03, RE-CMP-04): each form keeps its fields, labels and request; its state moves into `useForm` with `zodResolver` and the contract's `Form`, `TextField` and siblings; the request schemas of `@css/shared` are the resolvers where they exist (an old combined repository uses `packages/shared`, RE-CMP-04), otherwise a small zod schema beside the form; messages stay i18n keys. The existing component tests and E2E specs are the proof the behaviour is unchanged; a form without a test gets one written against today's form first (TS-24).

## Implementation units

### U1. The decisions of 2026-11-11
- **Goal:** the owner's decisions are recorded before any change that depends on them.
- **Requirements:** R1
- **Files:** `docs/DECISION_LOG.md` (D-169), `docs/STATUS.md`
- **Approach:** a row like D-167 and D-168.
- **Tests:**
  - none (a document); `pnpm docs:check` passes.
- **Done when:** D-169 holds the owner's two decisions with the owner's words and the team's three technical decisions (tests keep `pg`, SeaweedFS and the S3 names, the forms line) with their reasons.
- **Depends on:** none
- **Size:** S
- **Risk area:** none
- **Status:** done

### U2. Comments point at documents by heading
- **Goal:** no code comment names a document section by number, and no decision ID is left in a comment.
- **Requirements:** R2
- **Files:** about 150 files under `apps/` and `packages/` and `scripts/` (comments only)
- **Approach:** the scratchpad mapping script, then a hand pass over the rest; follow the earlier ID cleanup (`docs/plans/2026-11-09-1215-migrate-ae-standards-small-plan.md`, its comment units).
- **Tests:**
  - unit: none (comments only); a check that the diff changes no code line (only comment lines), as in the earlier cleanup.
  - existing: `pnpm typecheck`, `pnpm lint`, `pnpm docs:check` and the test suites stay green.
- **Done when:** a search for `\b[A-Z_]+(\.md)? \d+(\.\d+)?\b` and `§\d` in comments finds only text that is not a pointer, listed in the unit's note.
- **Depends on:** none
- **Size:** M
- **Risk area:** none
- **Status:** done

### U3. SeaweedFS and the standard's S3 settings
- **Goal:** development and CI store files in SeaweedFS through the S3 driver under the standard's setting names.
- **Requirements:** R3
- **Files:** `infra/docker-compose.dev.yml`, `infra/docker-compose.app.yml`, `infra/seaweedfs/` (new: s3 config, bucket bootstrap), `infra/minio/` (removed), `infra/.env.example`, `compose.yaml`, `apps/api/src/config/env.ts`, `apps/api/src/config/env.spec.ts`, `apps/api/src/storage/index.ts`, `apps/api/src/storage/drivers/s3.ts`, `apps/api/src/storage/index.spec.ts`, `apps/api/test/integration/storage.test.ts`, `apps/api/.env.example`, `.github/workflows/ci.yml`, `README.md`, `docs/testing/uat/PHASE_1_UAT_BN.md`, `docs/testing/uat/PHASE_2_UAT_BN.md`, `docs/testing/uat/OFFLINE_DEVICE_CHECKLIST_BN.md` (their `docker compose up -d postgres minio mailpit` start command), `docs/testing/TEST_STRATEGY.md`, `docs/ops/DEPLOYMENT.md`, `docs/architecture/SYSTEM_ARCHITECTURE.md`, `docs/architecture/FILES_AND_DOCUMENTS.md`, `CLAUDE.md`
- **Approach:** the env rename follows `CORS_ORIGINS` → `ALLOWED_ORIGINS` in `env.ts`; the driver change stays inside `drivers/s3.ts` and the driver map of `storage/index.ts` (NS-31, NS-32).
- **Tests:**
  - unit: `env.spec.ts`: the S3 names are required with `s3`, `S3_ENDPOINT` must be an http(s) URL, each of the five `MINIO_*` names is refused naming its new one, the committed dev key pair is refused in production, the names of `.env.example` and the dev compose file match; `index.spec.ts` builds the s3 driver from the new names.
  - integration: `storage.test.ts` against SeaweedFS: put, get, stat, remove, a missing key, ping, the bucket check; the whole API and database suites with the s3 driver where they used MinIO.
  - existing: covered by `storage.test.ts`, `env.spec.ts`, `index.spec.ts`; updated in place.
- **Done when:** `docker compose up` brings SeaweedFS with the seven buckets, the api turns ready, an upload works in the dev app; CI's checks job passes on SeaweedFS.
- **Depends on:** U1
- **Size:** M
- **Risk area:** file storage
- **Status:** done

### U4. Prisma for the app's own database access
- **Goal:** `src/` (outside the pg-boss files), the seed and the scripts reach the database through Prisma only.
- **Requirements:** R4
- **Files:** `apps/api/src/notifications/template-sync.ts`, `apps/api/src/locations/load.ts`, `apps/api/seed/{run,context}.ts`, `apps/api/seed/sets/util.ts`, `apps/api/scripts/{load-locations,perf-seed,perf-lists,e2e-server}.ts`, their tests (`test/integration/seed.test.ts`, `locations.test.ts`, `notifications.test.ts`), `apps/api/package.json`, an ESLint rule or test that refuses `pg` imports in `src/` outside `jobs/` and the unsafe raw calls in `src/`, `seed/` and `scripts/`, `CLAUDE.md`
- **Approach:** `$executeRaw` and `$queryRaw` with tagged templates where the statement stays SQL (the seed's upserts, the locations load), the client elsewhere; the template clone of the tests stays on `pg`.
- **Tests:**
  - integration: the seed runs twice and changes nothing the second time (`seed.test.ts`); the locations load and the template sync as today; the new rule refuses a `pg` import in `src/` and a `$queryRawUnsafe` or `$executeRawUnsafe` call.
  - existing: covered by `seed.test.ts`, `locations.test.ts`, `notifications.test.ts`; `perf-*` scripts by a dry run on the dev database.
- **Done when:** `rg "from 'pg'" apps/api/src apps/api/seed apps/api/scripts` finds only `src/jobs/` and the type of the locations row if kept as a type; the seed and the E2E server work.
- **Depends on:** U1
- **Size:** M
- **Risk area:** none
- **Status:** done

### U5. The standard's base compiler options
- **Goal:** every workspace compiles with `verbatimModuleSyntax` and the other base options of the standard.
- **Requirements:** R5
- **Files:** `packages/config/tsconfig/base.json`, the type-only imports the compiler reports across `apps/` and `packages/`
- **Approach:** turn the option on, fix each report with `import type` or `export type`; the base file's explicit `"exactOptionalPropertyTypes": false` stays as it is (the standard's base does not list the option); never loosen.
- **Tests:**
  - existing: `pnpm typecheck`, `pnpm build`, and the unit suites of every package stay green.
- **Done when:** `pnpm typecheck` and `pnpm build` pass with the option on.
- **Depends on:** none
- **Size:** M
- **Risk area:** none
- **Status:** done

### U6. The backend as ESM
- **Goal:** the API, its worker, scripts, seed and tests run as ESM.
- **Requirements:** R6
- **Files:** `apps/api/package.json` (`"type": "module"`), `packages/config/tsconfig/node.json`, `apps/api/tsconfig*.json`, every relative import in `apps/api/{src,test,scripts,seed}` (codemod), the `__dirname` and `createRequire(__filename)` sites (about 20 files), `apps/api/prisma/schema.prisma` (`moduleFormat = "esm"`), `apps/api/vitest*.mts`, `apps/api/scripts/e2e-server.ts`, `docker/app/Dockerfile.dev`, `infra/docker-compose.app.yml`, `CLAUDE.md`, `CONTRIBUTING.md`
- **Approach:** the scratchpad codemod adds `.js` to relative imports (and `/index.js` for folder imports); `import.meta.dirname` replaces `__dirname`; no existing example in the repo (a new pattern for the API).
- **Tests:**
  - existing: the API unit and database projects, the contract coverage, the drift test, `pnpm build` then `node dist/server.js` and `node dist/worker.js` answering readiness, the E2E server and one Playwright spec, `docker compose up`.
- **Done when:** all of the above pass; `rg "__dirname|require\(" apps/api` finds no CommonJS use.
- **Depends on:** U5
- **Size:** L
- **Risk area:** none
- **Status:** done

### U7. Forms on the asf contract: sign-in, registration and the own account
- **Goal:** the sign-in, reset, invitation, registration and own-account forms are built on the contract's `Form`.
- **Requirements:** R7
- **Files:** `apps/web/src/features/auth/{LoginForm,ResetForm,InvitePage}.tsx`, `features/registration/RegisterPage.tsx` and its step forms, `features/account/{OfficialDetails,ChangePasswordView,ChangeRequests,EditSection}.tsx`, their tests
- **Approach:** the contract's `Form` example in `apps/web/src/ui/contract.ts` and its test `ui/templates/asf/ui.contract.test.tsx`; the shared request schemas (`@css/shared/auth` `loginRequestSchema`, `passwordChangeRequestSchema`, …) as resolvers.
- **Tests:**
  - component: each form shows the same labels, refuses the same invalid input with the same message, and sends the same request (MSW), in bn and en; every sign-in failure (wrong password, unknown account, locked, 401, 429) shows the one same message; no password or token is written to `localStorage` or `sessionStorage`.
  - e2e: existing `e2e/auth.spec.ts`, `registration.spec.ts`, `profile.spec.ts`, `official-profile.spec.ts` pass unchanged on the mobile and desktop projects.
  - existing: covered by the feature tests under `features/auth`, `features/registration`, `features/account`; updated, not duplicated.
- **Done when:** no `useState` holds a field value in these forms; the tests above pass.
- **Depends on:** none
- **Size:** L
- **Risk area:** auth
- **Status:** done

### U8. Forms on the asf contract: the people screens of the admin area
- **Goal:** the officials, registrations, beneficiaries, permissions and handover dialogs are built on the contract's `Form`.
- **Requirements:** R7
- **Files:** `apps/web/src/admin/staff/{OfficialDialog,LinkDialog,RenewLinkDialog}.tsx`, `admin/registrations/{EditRequests,StaffEditRequests,VolunteerDecisions,StaffDecisionDialog,CorrectionDialog,Blocklist}.tsx`, `admin/beneficiaries/{ContactDialog,CorrectionDialog}.tsx`, `admin/beneficiaries/duplicates/MergeDialog.tsx`, `admin/permissions/{GrantDialog,RevokeDialog}.tsx`, the handover form, their tests
- **Approach:** as U7.
- **Tests:**
  - component: as U7, per dialog.
  - e2e: existing `admin.spec.ts`, `admin-permissions.spec.ts`, `handover.spec.ts`, `beneficiaries.spec.ts`, `staff-accounts.spec.ts` pass unchanged.
  - existing: the admin folders' component tests.
- **Done when:** as U7, for these dialogs.
- **Depends on:** U7 (its pattern)
- **Size:** L
- **Risk area:** none
- **Status:** done

### U9. Forms on the asf contract: projects, programs, nisab, templates and the office's decisions
- **Goal:** the project, program, nisab, template, assignment and application decision dialogs are built on the contract's `Form`.
- **Requirements:** R7
- **Files:** `apps/web/src/admin/projects/volunteers/{AssignDialog,ChangeAssignmentDialog}.tsx`, `admin/projects/ReasonDialog.tsx`, the setup sections with a submit in `admin/projects/setup/`, `admin/programs/{ProgramDialog,ProgramsPage}.tsx`, `admin/nisab/{NisabDialog,NisabPage}.tsx`, `admin/templates/{SaveTemplateDialog,TemplateDialog}.tsx`, `admin/applications/{DecisionDialog,VerifyDialog,ReferralDialog,ApplicationReviewPage}.tsx`, their tests
- **Approach:** as U7.
- **Tests:**
  - component: as U7, per dialog.
  - e2e: existing `projects.spec.ts`, `assignment.spec.ts`, `application-rules.spec.ts`, `applications.spec.ts`, `media.spec.ts` pass unchanged.
  - existing: the admin folders' component tests.
- **Done when:** as U7, for these dialogs.
- **Depends on:** U7 (its pattern)
- **Size:** L
- **Risk area:** none
- **Status:** done

### U10. Forms on the asf contract: the form area's dialogs and the settings
- **Goal:** the form area's dialogs outside the canvas and the settings and channels forms are built on the contract's `Form`.
- **Requirements:** R7
- **Files:** `apps/web/src/admin/forms/{NewFormDialog,NewReadyFormDialog,OwnQuestionDialog,PlaceFormDialog,ScoringDialog,PublicLinkPanel}.tsx`, `admin/settings/{SettingsForms,ChannelsPanel}.tsx`, their tests, `CLAUDE.md` (the forms line of the stack profile: every form on react-hook-form)
- **Approach:** as U7; the builder's canvas and editors stay out (Scope).
- **Tests:**
  - component: as U7, per dialog.
  - e2e: existing `form-builder.spec.ts`, `form-logic.spec.ts`, `admin-settings.spec.ts` pass unchanged.
  - existing: the forms and settings folders' component tests.
- **Done when:** as U7; a search for forms with a submit and `useState` field values outside the excluded engine finds none.
- **Depends on:** U7 (its pattern)
- **Size:** L
- **Risk area:** none
- **Status:** done

### U11. Forms on the asf contract: the forms no earlier unit named
- **Goal:** the forms with a submit that U10's search found outside every unit's file list are built on the contract's `Form`, so R7 holds across the app.
- **Requirements:** R7
- **Files:** `apps/web/src/features/media/{ReferralPanel,WorkHistory,StagePanel,ScriptEditor,PublicationsPanel,MembersEditor}.tsx`, `admin/settings/ListsPanel.tsx` (`ItemDialog`), `admin/notifications/NotificationTemplatesPage.tsx`, `features/exports/ExportDialog.tsx`, `features/projects/{MyProjectPage,TeamPage}.tsx`, their tests, `CLAUDE.md` (the forms line no longer names forms still on their own state)
- **Approach:** as U7 to U10: `useSchemaResolver` and `showFailure` from `lib/form-schema.ts`, the `Form`'s own `error`, one `useWatch` per form, a submit that sends only what the button would and nothing twice while a save is on its way; a script editor's If-Match and an export's limits unchanged.
- **Tests:**
  - component: as U7, per form.
  - e2e: existing `media.spec.ts`, `exports.spec.ts`, `notifications.spec.ts`, `admin-settings.spec.ts`, `assignment.spec.ts` (the volunteer's consent) pass unchanged.
  - existing: the folders' component tests.
- **Done when:** as U7; U10's search for forms with a submit and `useState` field values outside the excluded engine finds only the search boxes, filters and the lookup it lists as left on purpose.
- **Depends on:** U10 (its search)
- **Size:** L
- **Risk area:** none
- **Status:** todo

## Checkpoints
- **Mode:** grouped (one by one 0, grouped 14, all at once 2; one by one scored 6, moved to grouped since N is over 4)
- **Signals:** N 10, L 2650, R 2, Fd 2, C 2, P 1
- **C1** after U1: foundation for U3 and U4
- **C2** after U3: file storage risk
- **C3** after U6: the new ESM pattern, after U4 and U5 (700 lines since C2)
- **C4** after U7: auth risk, and a foundation: U8 to U10 follow its pattern
- **C5** after U8: size and file count
- **C6** after U9: size and file count
- **C7** after U10: size and file count
- **C8** after U11: end (U11 added after C7 for the forms U10's search found; one more group of the same kind)

## Verification
- `pnpm typecheck`, `pnpm lint`, `pnpm docs:check`, `pnpm build`
- `pnpm test` (API unit, database project with `docker compose up -d`, shared, web)
- `pnpm --filter @css/api contract:coverage --no-run` after `pnpm test`; the OpenAPI drift test
- `pnpm e2e` (the specs named in U7 to U11 at least), and the web contract test against `pnpm --filter @css/api e2e:server`
- `pnpm --filter @css/web build` and `pnpm --filter @css/web bundle:report` (the forms move must keep the first route within 400 KB)
- `docker compose up` from the main checkout after the merge of U3 and U6

## Risks and rollback
- **ESM** (U6): touches every API file's imports; the codemod is one commit of its own so it can be reverted at once; the build and start are proven before the merge.
- **SeaweedFS** (U3): development and CI only; production keeps its configured driver; the earlier `MINIO_*` names are refused with the new name, never ignored. Rolling back is reverting the unit.
- **Forms** (U7 to U11): behaviour must not change; each form's existing tests and E2E specs are the guard, and a form without a test is characterized first.
- **Sign-in forms** (U7): the sign-in and reset forms are the way in for everyone; the auth E2E specs run on the three projects before the merge.

## Definition of done
- All units done and their tests pass
- Verification commands pass
- `ae-review` has run, with no open P0 or P1
- Code from abandoned attempts is removed

## Progress
- **Branch:** `chore/ae-standards-rest`
- **Updated:** 2026-11-12 04:20
- **Next:** U11, the forms no earlier unit named
- **Reviewed through:** C7 at the commit after 5400f185 (T2, three reviewers: no security finding; fixed: a server message about a group of fields (a title of two languages) shows above the form instead of nowhere, the confirmation dialog's reason rule is written once, two comments no longer claim Enter sends a dialog whose button sits outside its form; left: the placement dialog reads its choice from two places, the settings save casts its value; also found and fixed: the demo form's E2E spec had not followed the review part of the phone's form, and CI's E2E job stops at its 20-minute limit, so no run on develop has finished)
- **Uncommitted:** none
- **Notes:** U2: kept on purpose, the ADR file names inside document paths (an ID in a path is a file name, not a citation), a date after DECISION_LOG.md and the project names A1 and B1 of the test fixtures (data); a section number in a comment did not always mean what that heading now says (RBAC "6" meant field-level protection, "8.4" the object-level checks), so those were mapped by topic. The plan review (structure and security) asked for: the five `MINIO_*` names mapped one by one, the dev S3 key pair marked `css_dev_only` so production refuses it, SeaweedFS on 127.0.0.1 only, the dropped bucket rules said out loud, the unsafe Prisma raw calls refused, the sign-in failures kept one message, the three builder panels left out; all are in the plan. U3: SeaweedFS `chrislusf/seaweedfs:4.53@sha256:ccad23e18639c8b98cee17e7100b95830a06077b56d8e5b006d6dcf8ec5e94a0` (`weed server -s3` with one identity in `infra/seaweedfs/s3.json`; it also starts an Iceberg catalogue and a Lance server inside the container, unpublished) and the bootstrap on `amazon/aws-cli:2.39.7@sha256:bba262340b0bc7cbf3a8a48612531263b56f4b280c4f036a07816af1b271bda0`; the dev compose file publishes the S3 port on 127.0.0.1:8334, not SeaweedFS's 8333, which another local SeaweedFS holds on the owner's machine; SeaweedFS answered every S3 call the driver makes as MinIO did (404 for a missing key, `NoSuchBucket` for a missing bucket, 403 to an unsigned GET or listing), and a developer's `apps/api/.env` (also read by the Docker api) must take the `S3_*` lines before the api starts again (README troubleshooting). U4: no exception was needed, not even under `src/jobs/` (pg-boss already runs on `fromPrisma`); the E2E server and perf:seed create and drop their database with `Prisma.raw` on a name matched against a strict pattern, perf:seed keeps its temporary tables on a one-connection pool, and perf:lists rebuilds a logged statement for EXPLAIN with `new Prisma.Sql`; `pnpm db:seed` on a freshly migrated test database took 4.3 s before and 5.5 s after (a repeat run 3.9 s and 5.0 s, about 1.25 ms more per upsert through Prisma), and the perf:seed load at a sixtieth of its size took 21 s against 23 s before. U5: `packages/shared` and `apps/web` already marked every type-only import, so the option changed no import; every report was in the then CommonJS API, where the option refuses ESM syntax altogether, so U5 was committed after U6 to keep each commit green. U6: Prisma 7 takes `moduleFormat = "esm"` on the `prisma-client` generator (its ESM client sets `globalThis.__dirname` itself); Vitest's module runner has no `import.meta.resolve`, so the font files, the Prisma CLI path and the tsx CLI path are found with `createRequire(import.meta.url).resolve`; `ajv/dist/2020` and `ajv-formats` are CommonJS and needed a named import and the plugin's `default`; `node dist/server.js` and `node dist/worker.js` run with the ESM build of `@css/shared` as before, and the Dockerfile and compose files needed no change. U7: the login form with zod and the shared request schemas took the first route from 382.8 KB to 423.3 KB, so the login form now loads in its own lazy chunk as the page appears (first route 395.6 KB, of which 12.7 KB is react-hook-form, pulled into the shared chunk by the asf barrel; 28.8 KB more after it, mostly zod); the contract's form text and select fields took only the core props, so the extended set now binds the extended fields (a password with its show button, inputMode, maxLength, an end action, a select's placeholder) and a `normalize` for the code digits (local.json); the registration's per-step checks stay in `checkStep`, wrapped as a zod `superRefine` of the open step, because the shared submit schema checks the whole registration at once; the reset code step checks only that each field is filled, so the shared reset schema's code and password rules stay the server's to say; the sign-in, reset, invitation and change forms now ask for an empty field before sending ("Fill in this field.") where the server's general message came before; the code field of an open contact edit (`RequestState`) keeps its own state, as it has no form or submit of its own. U8: seven dialogs moved (the official and the new link, the registration correction and staff decision, the beneficiary contact and correction, the permission grant); the reason boxes of the blocklist, the refusals of edit requests, the volunteer decisions, the revoke and the deactivation live in the kit's ConfirmDialog, the merge dialog and the other reason dialogs in ReasonDialog (U9), the handover receiver is a picker for several buttons and the set-password link dialog holds no field, so none of them changed; the grant dialog keeps saying a refusal no field shows above the form beside the field messages (`showFailure` with `everyDetail`), and the first route stayed at 395.6 KB. U9: twenty-two forms moved (the shared reason dialog, the decision, referral and verification dialogs, the program, nisab and two template dialogs, assigning and changing an assignment, the transfer page, the setup's area, access, quota and component settings forms with the end-of-access dialog, and the six wizard steps, which still save through the wizard's buttons, Enter only checking them); the review page, the lists' row choices and the dialogs' open state hold no field and stayed, the filters and lists of the assign dialog, the transfer's choices and the quota being added sit outside the form element so Enter sends nothing, the nisab now refuses a wrongly shaped amount before sending in the server's words, the merge conflict list shows under the Form's alert instead of inside it, and the first route went from 395.6 KB to 395.7 KB. U10: eight forms moved (the new form, the new ready form, the own question and the placement of a ready form; the organisation, language, thresholds and SMS settings, which now refuse before sending in the server's words through the shared setting schemas) and the kit's confirm dialog holds its reason in react-hook-form, while the score dialog and the public link panel hold no form and stayed, the first route went from 395.7 KB to 396.2 KB, and the done-check search left on purpose the search boxes and filters, the NID lookup of the application form, the compare page's choice and the code of an open contact edit, but also found forms with a submit that no unit named, still on their own state for the owner to place: the media work panels (the referral decision, comments, stage, script, publications, team), the settings' list item dialog, the notification texts editor, the export dialog, and the volunteer's consent steps and team choice.
