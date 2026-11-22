---
title: The department's own officials in the development database
type: chore
status: done
source: plan
date: 2026-11-22
doc_review: 2026-11-22
---

# The department's own officials in the development database

## Goal

The development database holds the department's real officials (35 people with their roles, designations, programs and organogram) instead of the demo accounts, and each official can set a password through a link; the demo set stays for the tests.

## Problem

The owner wants to try the app with the department's own people. The demo set is the fixture of every test, and the repository goes to GitHub, so the real list can neither replace the demo set nor be committed.

## Requirements

- **R1** `pnpm db:seed --set org --file <path>` loads the base set and the officials of a staff list file that lives outside the repository; nothing of the list is committed.
- **R2** Each row becomes one official: job ID, name, designation, role, home program (required for a PM, kept for anyone the list gives one), email, mobile and supervisor (the organogram), as a pending account without a password.
- **R3** The list is checked as a whole before anything is written: a duplicate job ID, email or mobile, a malformed job ID, email or mobile, an unknown role, program or supervisor, a supervisor that is the row itself, a PM without a program and a second Department Head are all reported at once, by row number, field and reason (never the cell's value), and nothing is written.
- **R4** The three programs exist as in the demo set (UCD, HUM, ERR, their names unchanged), each with the PM the list gives it.
- **R5** The first Admin of the list becomes the Main Admin when the database has none.
- **R6** Each pending official gets a set-password link; the links are written to a new file next to the list (outside the repository; a new name per run, never overwriting), holding only job ID, name, role, link and expiry, never to the console or the repository, and stay valid 72 hours as the app's own links.
- **R7** The org set runs only on the development database (css_erp_dev on a local host) and refuses a database that already holds the demo set (the `seed.marker.demo` row of `settings`), and a list or links path inside the repository; a second run with the same list changes no account (only new links for the accounts still pending).
- **R8** The development database is reset and loaded with base, the locations and the owner's list, with the owner's corrections of 2026-11-22.
- **R9** With `--demo-password`, every official still without a password is made active with the demo set's password, their open links are revoked and no links file is written; an official with a password of their own keeps it (D-190).

## Scope

- In: officials; the three programs; the set-password links; the dev database load.
- Out (not now): volunteers (a second list follows); projects (made in the app); real email delivery (dev mail goes to Mailpit); staging or production loading (T3.0).

## Key decisions

- **A separate seed set, not a changed demo set**: the demo set is every test's fixture and is committed; the owner chose "dev database, demo removed" on 2026-11-22. Governs R1, R7.
- **The list stays outside the repository** (`D:\Charity Website\ERP-own-data\`): real names, emails and mobiles never reach GitHub (BD-49; constitution §9, production data never in tests). This plan and the decision log name no person either. Governs R1, R6.
- **The owner's mapping (chat, 2026-11-22)** is applied to the prepared list, not to code: the designations map to roles ("Department Head" to Department Head; "Assistant Manager (PM)" to Program Manager; "Monitoring" and "Documentation" to Monitoring Team; "Regional Project Manager" to Regional Program Manager; "Executive" to Project Executive); one Monitoring row becomes the Admin; two PMs' programs are swapped from the list; the list's "Emergency Response, Resilience and Accountability Wing" is ERR with the app's name; one duplicate job ID and two mobiles are corrected. The row-level details are kept with the list in the owner's folder. Governs R8.

<!-- ae-plan adds everything below -->

## Technical decisions

- **The list format is generic**: columns job ID, name, mobile, email, designation, role, program, supervisor's job ID; a role is matched by its key or its English or Bengali name in `docs/security/permissions.yaml`, a program by its code or its English or Bengali name. One-off corrections live in the owner's file, so the code holds no personal data and no one-off mapping (BD-49).
- **Validation reuses the account schemas** of `@css/shared/auth` (`jobIdSchema`, the email and mobile rules of `staffCreateRequestSchema`) and the role check `isGivableOfficialRole` of `apps/api/src/services/registrations.ts`, so the seed accepts exactly what the admin's dialog accepts.
- **The link is issued by the service's own code**: `issue` in `apps/api/src/services/staff-accounts.ts` becomes a module function `createInvitation(tx, { userId, createdBy, now })` that the service and the seed share (token hashed, open links revoked, the `user.invited` audit), so there is one way to make a link.
- **The dev database guard** `checkDestructiveDbAccess` already refuses production; the org set adds, from the command line, a refusal of every database but css_erp_dev, of a database host that is not local (localhost, 127.0.0.1, ::1), of a database whose `settings` hold `seed.marker.demo`, and of a `--file` path inside the repository root; the real list never lands in a test database, and the integration test calls `seedOrg` directly with made-up rows.
- **The links file**: named `invitations-<yyyymmdd-hhmm>.tsv` beside the list, written inside the seed's transaction before it commits (a failed write rolls the run back, so no link exists that nobody holds); a rerun writes a new file with fresh links and revokes the old ones. The owner hands each link to its person privately, the Admin's first, and deletes the file once the links are passed on or expired (U4 and the README of the folder say so).
- **The audit actor of a seed-issued link** is the system actor the seed already writes as (`ctx.actorId`), never an official.
- **Mail on this data**: the dev `.env` keeps SMTP on Mailpit; a link renewed from the staff page goes there, not to the person (written in the README of the owner's folder).
- **IDs stay in the plan**: code, comments and test names carry the meaning in words; the plan's R-, U- and D- IDs stay here (ORG-CMT-50).
- **Deterministic ids** (`seedId('org-user:<job id>')`) and `ctx.upsert` with `state`, `password_hash` and `is_system_owner` insert-only, as the demo set does (`apps/api/seed/sets/demo/index.ts`), so a rerun leaves a set password and an active state alone.
- **Stack profile**: unchanged (CLAUDE.md); no new dependency.

## Implementation units

### U1. The decision and the staff list reader

- **Goal:** record the decision, and read and check a staff list file into validated rows or a full error list.
- **Requirements:** R1, R3
- **Files:** `docs/DECISION_LOG.md` (D-189), `apps/api/src/locations/csv.ts` (a delimiter for tab-separated files), `apps/api/seed/sets/org/staff-file.ts`, `apps/api/seed/sets/org/staff-file.spec.ts`
- **Approach:** like `apps/api/src/locations/convert.ts` (owner file to rows with every fix or problem reported); the row schema built from `@css/shared/auth`; roles and programs matched against the names given to it (the registry's roles, the three programs).
- **Tests:**
  - unit: a clean list gives one row per official with role key, program code and supervisor job ID; a Bengali role name, an English role name and a role key all match; a program by code, English and Bengali name; a mobile with a dash or spaces and an email with spaces are cleaned; every problem of R3 is reported with its row number in one result (duplicate job ID, duplicate email, duplicate mobile, bad job ID, bad mobile, bad email, unknown role, unknown program, unknown supervisor, a supervisor that is the row itself, two Department Heads, a PM without a program); a tab-separated and a comma-separated file read alike; a byte order mark is ignored
- **Done when:** the spec passes and D-189 is in the log.
- **Depends on:** none
- **Size:** M
- **Risk area:** personal data
- **Status:** done

### U2. The org seed set and its links

- **Goal:** write the programs, officials, roles, supervisors and Main Admin of the checked rows, issue the links and write them to a file next to the list.
- **Requirements:** R2, R4, R5, R6, R7
- **Files:** `apps/api/seed/sets/org/index.ts`, `apps/api/seed/run.ts` (`--set org --file <path>`, the css_erp_dev and demo refusals, the links file), `apps/api/src/services/staff-accounts.ts` (`createInvitation`), `apps/api/test/integration/seed-org.test.ts`
- **Approach:** the staff part of `seedDemo` (`apps/api/seed/sets/demo/index.ts`: users, then programs with their PM, then the PMs' home program, then `user_roles`; the Main Admin rule); supervisors written after every user exists; links through `createInvitation`.
- **Tests:**
  - unit: `parseSets` takes `org` as base plus org and needs `--file`; the database check refuses css_erp_test and a non-local host and accepts a local css_erp_dev; a `--file` path inside the repository is refused
  - integration (cloned test database, made-up rows): the officials are pending with no password, with their roles, designations, programs and supervisors; the programs carry their PM; the Admin is the Main Admin when none exists and is not when one exists; each official has one open link whose token answers `POST /auth/invitations/check` with the name and job ID; the `user.invited` rows name the system actor; the links file holds job ID, name, role, link and expiry and nothing else; a second run changes no account and replaces the open links; an official who has set a password keeps it, stays active and gets no new link; a list with a problem writes nothing and its report holds none of the input values; a database with the demo marker is refused
  - existing: the invitation create and reissue covered by `apps/api/test/integration/staff-accounts.test.ts` (kept green after the refactor)
- **Done when:** the integration test and the staff-accounts tests pass.
- **Depends on:** U1
- **Size:** L
- **Risk area:** auth
- **Status:** done

### U3. The documents

- **Goal:** the command and the rule of the org set are written where people look for them.
- **Requirements:** R1, R7
- **Files:** `CLAUDE.md` (commands), `README.md` (the dev data section), `docs/testing/DEMO_ACCOUNTS.md` (the demo accounts are absent from a database loaded with the org set), `docs/testing/TEST_STRATEGY.md` (test data strategy), `docs/STATUS.md`
- **Approach:** the existing lines of `db:seed` in each document.
- **Tests:** `pnpm docs:check`
- **Done when:** docs:check passes.
- **Depends on:** U2
- **Size:** S
- **Risk area:** none
- **Status:** done

### U4. The department's list in the dev database

- **Goal:** the owner's list, with the corrections of 2026-11-22, loaded into css_erp_dev in place of the demo set.
- **Requirements:** R8
- **Files:** none in the repository; `D:\Charity Website\ERP-own-data\staff.tsv` (prepared from `staff-raw.tsv`) and the links file there
- **Approach:** prepare the list with the owner's mapping and corrections; `pnpm db:reset`, `pnpm db:migrate`, `pnpm db:load-locations`, `pnpm db:seed --set org --file …`.
- **Tests:** a check against the database (the counts add to 35): 35 pending officials, one Department Head, one Main Admin who is the list's Admin, the three PMs on their programs, 14 RPMs, 15 Executives and 1 Monitoring Team member, the supervisors as the list gives them; the set-password page of one link shows the name in the browser (the password is not set: it is the person's own).
- **Done when:** the counts match and the link opens the set-password page; the owner knows to hand the links over privately (the Admin's first) and to delete the links file afterwards.
- **Depends on:** U2
- **Size:** S
- **Risk area:** personal data
- **Status:** done

### U5. The demo password for the loaded officials
- **Goal:** let the owner sign in as any of the department's officials on the development database with the demo password.
- **Requirements:** R9
- **Files:** `docs/DECISION_LOG.md` (D-190), `apps/api/seed/sets/org/index.ts`, `apps/api/seed/run.ts`, `apps/api/seed/sets/org/target.spec.ts`, `apps/api/test/integration/seed-org.test.ts`, `CLAUDE.md`, `README.md`, `docs/testing/DEMO_ACCOUNTS.md`; then css_erp_dev
- **Approach:** the demo set's password hash (`DEMO_PASSWORD` and its Argon2id settings in `apps/api/seed/sets/demo/index.ts`); the pending accounts updated in the org set's transaction, their open links revoked.
- **Tests:**
  - unit: `parseSeedArgs` reads `--demo-password` for the org set only
  - integration: with the demo password every pending official is active, signs in with the demo password, has no open link and is not in the handed links; an official with a password of their own keeps it
- **Done when:** the tests pass and an official of the owner's list signs in on css_erp_dev with the demo password.
- **Depends on:** U2
- **Size:** S
- **Risk area:** auth
- **Status:** done

## Checkpoints

- **Mode:** grouped (one by one 3, grouped 9, all at once 3)
- **Signals:** N 4, L 650, R 3, Fd 1, C 3, P 0
- **C1** after U1: a personal-data unit, and U2 builds on its rows
- **C2** after U2: the auth change (the shared link function) and the foundation of U3 and U4
- **C3** after U4: the last unit, a personal-data step
- **C4** after U5: added on the owner's request after C3 (auth: passwords of the loaded accounts)

## Verification

- `pnpm typecheck`
- `npx eslint apps packages scripts`, `pnpm exec prettier --check .`, `pnpm i18n:check`
- `pnpm --filter @css/api exec vitest run seed/sets/org` and `pnpm --filter @css/api exec vitest run --config vitest.db.config.mts test/integration/seed-org.test.ts test/integration/staff-accounts.test.ts`
- `pnpm docs:check`

## Risks and rollback

- **The dev database reset removes the demo data**: `pnpm db:reset`, `pnpm db:migrate`, `pnpm db:load-locations`, `pnpm db:seed` (demo) brings it back; the UAT scripts need the demo set.
- **The links file holds live tokens**: it stays in the owner's folder outside the repository; a link is closed by its use, by 72 hours, or by a new link from the staff page.
- **No migration**: nothing to undo in the schema.

## Definition of done

- All units done and their tests pass
- Verification commands pass
- `ae-review` has run, with no open P0 or P1
- Code from abandoned attempts is removed
