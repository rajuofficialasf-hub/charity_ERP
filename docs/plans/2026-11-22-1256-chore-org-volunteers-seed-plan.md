---
title: The department's own volunteers in the development database
type: chore
status: done
source: plan
date: 2026-11-22
doc_review: 2026-11-22
---

# The department's own volunteers in the development database

## Goal
The development database holds the department's own volunteers next to its officials, each signing in with their mobile, so the owner can try the app with real people on both sides.

## Problem
The org set (D-189) loads the officials only. The owner gave a second list with the volunteers' names and mobiles and asked for everything else to be filled in sensibly.

## Requirements
- **R1** `pnpm db:seed --set org --file <staff list> --volunteers <volunteer list>` also loads the volunteers of a list kept outside the repository (columns name and mobile).
- **R2** The volunteer list is checked as a whole before anything is written: a missing name, a malformed mobile, a mobile twice in the list, a mobile an official of the staff list already uses and a mobile another account of the database already holds are reported by line, column and reason, never with the cell's value, and nothing is written.
- **R3** A mobile written without its leading zero (ten digits starting with 1) is read with it.
- **R4** Each row becomes an approved general volunteer whose details the list does not give carry obvious placeholders: an NID of the reserved fake range, father's and mother's names marked as samples, and a home address spread over the divisions and their districts (D-192; first Savar union of Savar, Dhaka for all, changed on the owner's word the same day; the 20 already loaded were moved by a one-off update, since the seed writes an address only for a new volunteer).
- **R5** With `--demo-password` every volunteer whose account has no password yet signs in with the demo password by their mobile; a volunteer who has set a password of their own keeps it on every rerun; without the flag they set one through the app's own "forgot password".
- **R6** The volunteer list obeys the org set's guards (outside the repository; css_erp_dev on a local host only), and a rerun with the same lists changes nothing.
- **R7** css_erp_dev gets the owner's 20 volunteers.

## Scope
- In: volunteers with placeholders; the dev database load.
- Out (not now): their real NIDs, parents' names and addresses (edited in the app or a later list); project assignments; team members.

## Key decisions
- **Placeholders the reader recognises as samples (owner, chat 2026-11-22: "বাকি যা কিছু লাগে তা তুমি তোমার মত করে দিয়ে সাজাও")**: the NID from the reserved fake range of `packages/shared/src/testing/fake.ts`, which can never be a real person's; names marked "(নমুনা)"; one default address. Governs R4.
- **No real volunteer data leaves the owner's folder**: the documents name the volunteers by count only, the tests use the reserved fake mobiles and sample names of `packages/shared/src/testing/fake.ts`, and the seed prints counts, never a name or a mobile (BD-49). Governs R1, R2.
- **One account per mobile**: the two names the owner's list gives one mobile are one person (owner, chat 2026-11-22); the prepared list keeps the first. Governs R2, R7.

<!-- ae-plan adds everything below -->

## Technical decisions
- **The reader follows the staff list reader** (`apps/api/seed/sets/org/staff-file.ts`): `parseCsvLines`, a cleaned header, problems by line, column and reason, the mobile rule of `@css/shared/auth`.
- **The writes follow the demo set's volunteers** (`apps/api/seed/sets/demo/index.ts`): a `users` row of kind volunteer, the `volunteer_general` role and a `volunteers` row, approved by the system actor; ids `seedId('org-volunteer:<mobile>')` so a rerun matches.
- **The fake NID index** is taken from the volunteer's place in a stable order of mobiles plus a fixed offset of the org set, so a rerun gives each volunteer the same NID.
- **IDs stay in the plan**: code, comments and test names carry the meaning in words (ORG-CMT-10).
- **Stack profile**: unchanged.

## Implementation units
### U1. The decision and the volunteer list reader
- **Goal:** record the decision and read a volunteer list into checked rows or problems.
- **Requirements:** R1, R2, R3
- **Files:** `docs/DECISION_LOG.md` (D-191), `apps/api/seed/sets/org/volunteer-file.ts`, `apps/api/seed/sets/org/volunteer-file.spec.ts`
- **Approach:** like `staff-file.ts`.
- **Tests:**
  - unit: a clean list gives name and mobile per row (the fake mobiles of `fake.ts`); a ten-digit mobile starting with 1 gains its zero; a mobile with spaces or dashes is cleaned; a missing name, a bad mobile, a mobile twice and a mobile of an official are reported by line and column without the value; a list without its columns or rows is refused; a tab- and a comma-separated list read alike
- **Done when:** the spec passes.
- **Depends on:** none
- **Size:** S
- **Risk area:** personal data
- **Status:** done

### U2. The volunteers in the org set
- **Goal:** write the volunteers with their placeholders and sign-in, and take the list on the command line.
- **Requirements:** R1, R4, R5, R6
- **Files:** `apps/api/seed/sets/org/index.ts`, `apps/api/seed/run.ts`, `apps/api/seed/sets/org/target.spec.ts`, `apps/api/test/integration/seed-org.test.ts`, `CLAUDE.md`, `README.md`, `docs/testing/DEMO_ACCOUNTS.md`, `docs/STATUS.md`
- **Approach:** the demo set's volunteer rows; the volunteer list path through `checkOrgTarget`.
- **Tests:**
  - unit: `parseSeedArgs` reads `--volunteers` for the org set only
  - integration: each volunteer is an active, approved general volunteer with the role, a fake-range NID, sample parents' names and the default address; with the demo password they sign in by mobile; a rerun changes nothing; a volunteer who set a password of their own keeps it on a rerun with the demo password; a mobile another account of the database holds is refused and nothing is written
- **Done when:** the tests pass.
- **Depends on:** U1
- **Size:** M
- **Risk area:** personal data
- **Status:** done

### U3. The owner's volunteers in the dev database
- **Goal:** the owner's 20 volunteers in css_erp_dev.
- **Requirements:** R7
- **Files:** none in the repository; the prepared list in the owner's folder
- **Approach:** `pnpm db:seed --set org --file <staff list> --volunteers <volunteer list> --demo-password`.
- **Tests:** a database check (20 volunteers, active, approved, the general role) and one volunteer signing in by mobile in the browser.
- **Done when:** the counts match and the sign-in works.
- **Depends on:** U2
- **Size:** S
- **Risk area:** personal data
- **Status:** done

## Checkpoints
- **Mode:** all at once (one by one 3, grouped 3, all at once 9)
- **Signals:** N 3, L 250, R 3, Fd 0, C 3, P 0
- **C1** after U3: the last unit

## Verification
- `pnpm typecheck`, `pnpm exec eslint apps/api/seed`, `pnpm exec prettier --check`, `pnpm docs:check`
- `pnpm --filter @css/api exec vitest run seed/sets/org` and the database test `test/integration/seed-org.test.ts`

## Risks and rollback
- The volunteers are added to the officials already in css_erp_dev; `pnpm db:reset` and a new org run remove or reload them. No migration.

## Definition of done
- All units done and their tests pass
- Verification commands pass
- `ae-review` has run, with no open P0 or P1
- Code from abandoned attempts is removed
