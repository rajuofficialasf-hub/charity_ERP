---
title: A simpler registration, bank branch, the password rule and the language toggle in the bar (T1.9c)
type: feat
status: in-progress
doc_review: 2026-10-13
source: brainstorm
date: 2026-10-13
---

# A simpler registration, bank branch, the password rule and the language toggle in the bar (T1.9c)

## Goal
A volunteer or an official registers by giving only what they can know: no program, workplace, volunteer type or bank details; the password is checked while it is typed against three plain rules; and the language is a toggle in the top bar or at the bottom of the sidebar instead of a block at the end of the page.

## Problem
The owner reviewed the T1.9b screens on 2026-10-13. A new official cannot know the program or the workplace, a volunteer cannot know the volunteer type (the Foundation decides it, per project), nobody has a bank account to give yet, the password rules are too long to follow and refuse "mobile or email inside the password", and the language switch at the end of the page looks bad.

## Requirements
### Registration
- **R1** An official's registration asks for the name, the designation, the mobile and the email (verified as today), the password and the own photo: no program and no workplace division, and no field named workplace anywhere.
- **R2** A volunteer's registration asks no volunteer type and no reference NID: every volunteer registers as a general volunteer and the Foundation sets the role per project later. The API enforces it: the submit takes no type and no reference, the account gets the type `general` and, on approval, the role `volunteer_general`.
- **R3** No bank details are asked at registration (the section is gone from the form). The own profile keeps its bank section, where the volunteer adds or changes the details later (the edit request of D-085).
- **R4** The bank details get a new field, the branch (ব্রাঞ্চ): stored, shown in the own profile and to approvers with the bank field class, and part of the edit request.

### Password
- **R5** A password needs at least 8 characters, one upper-case letter and one digit, and nothing else: it may contain the mobile or the email and it is not compared with a list of common passwords. The rule is shown as a short checklist under the field that ticks while the person types.
- **R6** The rule is one function used by the registration, the password reset and the password change; the Department Head and the Monitoring Team keep the 12 characters of O-25 with the same two letter rules.

### Language
- **R7** The language switch is a compact toggle (বাংলা | English) in a top bar on every page without a sidebar (login, reset, registration, home, own profile, devices, password) and at the very bottom of the sidebar in the admin area (the end of the row on phones); the blocks at the end of the pages and in the admin top bar are gone.

## Scope
- In: the registration form and API, the bank branch column and its screens, the password rule, the language toggle, the documents.
- In besides the above (doc review): removing the reference lookup endpoint, its service path and its rate class, which nothing uses any more (the team member registration is gone); the length limit of the branch field; tests that the lockouts and rate limits of the login and the reset are unchanged.
- Out (reported, not built): setting an official's program and workplace after registration (own profile or the admin); changing a volunteer's type or giving a project role (T1.10, T1.12); forcing a change to 12 characters when a GLOBAL role is granted later (an account registered with 8 characters keeps them until it sets a new one; O-25 applies at the next change); letting a volunteer add the first bank details without an approver (open question).

## Key decisions
- **O-64** (owner, 2026-10-13): the registration asks no program, no workplace, no volunteer type, no bank details; everyone registers as a general volunteer or an official without a workplace; roles and projects come later; the bank details with a new branch field are added from the profile; the password rule is 8 characters, one upper-case letter, one digit, with live hints; the language is a toggle at the end of the nav bar or sidebar (UX-19).
- **UX-19** (owner, 2026-10-13): the language toggle sits in the top bar, or at the bottom of the sidebar in the admin area. Governs R7.
- **D-091** (implements O-64): the staff submit drops `homeProgramId` and `homeDivisionId` (the columns stay, set later); the volunteer submit drops `type`, `referenceNid` and `bank` (type `general`); `volunteers.bank_branch_name` is added; `checkPassword` keeps its signature with the new rules (the identity and common-password rules and `validation.password_identity`, `validation.password_common`, `validation.password_letter_digit` are replaced by `validation.password_uppercase_digit`); the verify answer no longer carries `programs`. **Proposed extension for the owner's confirmation:** the password rule applies to reset and change too (R6), because one function checks all three.

## Technical decisions
- **Shared:** `registrationSubmitRequestSchema` loses the fields above; `bankDetailsSchema` gains `branchName`; `PasswordProblem` becomes `too_short | uppercase_digit`; `RegistrationVerified.programs` is removed.
- **Database:** migration `20261013100000_volunteer_bank_branch`: `volunteers.bank_branch_name text` (nullable); `down.sql` drops it. `permissions.yaml` lists it in the class `volunteer.bank`.
- **API:** `RegistrationService.submit` builds the volunteer with type `general`, no reference and no bank, and the official without home program or division; `activePrograms` and the staff-place check go; `applyField('bank')` and the own-profile and approver views carry the branch.
- **Web:** `form-state.ts` loses the workplace step (the designation moves to step 1 of an official), the type and reference of the work step and the bank section; the account step shows `PasswordRules` live; `packages/ui` gets `SegmentedControl` (React Aria `ToggleButtonGroup`); `components/TopBar.tsx` holds the brand and the toggle for the pages without a sidebar; the admin sidebar ends with the toggle.
- **Scope of an official without a place (doc review):** the scope of an official's role comes from the project areas and programs they are assigned (`project_areas.rpm_user_id`, `programs.pm_user_id`); `homeProgramId` and `homeDivisionId` only decide which users a viewer can reach. A new official with neither therefore has no scope instance and every scoped permission is refused (default deny). U2 adds an integration test for it.
- **The API enforces the password rule** (`checkPassword` in the submit, the reset and the change); the checklist of the PWA is a hint. Unchanged: `PASSWORD_MAX_LENGTH` 128, the per-account lockout, the unknown-id lockout, the IP limits of `login`, `password-reset` and `registration`, one message for every login failure; U2 tests the length cap and the lockout again.
- **Branch field:** `branchName` is trimmed, 1 to 100 characters like the other bank texts; the audit entries of an edit request hold the field name and never the value.
- Stack profile unchanged.

## Implementation units

### U1. Decisions and documents of the rules
- **Goal:** The owner's decisions and the new password rule are written before code.
- **Requirements:** R1 to R7
- **Files:** `docs/DECISION_LOG.md` (O-64, UX-19, D-091), `docs/ui/DESIGN_BRIEF.md`, `docs/architecture/AUTH.md` (section 2 form, section 3 password rules), `docs/BUSINESS_RULES.md` (BR-033, BR-026, BR-203)
- **Tests:** existing: `pnpm docs:check`
- **Done when:** decisions logged, checks pass. **Depends on:** none · **Size:** S · **Risk area:** auth · **Status:** done

### U2. Password rule and registration schemas (shared and API)
- **Goal:** One simple password function; the registration takes only what the owner decided.
- **Requirements:** R1 to R6
- **Files:** `packages/shared/src/auth/password.ts` (+ test), `packages/shared/src/registration/index.ts` (+ test), `packages/shared/src/i18n/messages/{bn,en}/errors.json`, `apps/api/src/services/{registration,auth}.ts`, `apps/api/src/routes/auth.ts`, `apps/api/src/rate-limit/rate-limit.ts` (the class `reference-lookup` goes), `docs/api/openapi.yaml`, `docs/api/API_STANDARDS.md`, the tests of `apps/api/test/integration/{registration-start,registration-submit,registration-approval,password,auth}.test.ts` and `apps/api/src/auth/auth.spec.ts`
- **Approach:** `packages/shared/src/auth/password.ts`; existing tests `password.test.ts`, `registration-submit.test.ts` (covered; updated).
- **Tests:** unit: 7 characters refused, 8 accepted; no upper-case letter refused; no digit refused; a password holding the mobile or the email accepted; "Password1" accepted; the 12-character floor for a GLOBAL role; a Bengali letter is not an upper-case letter. Integration: a volunteer submit without type, reference and bank creates a `general` volunteer with no reference; a submit with `type`, `referenceNid`, `bank` or `homeProgramId` answers 422; an official submit with name, designation and photo only creates the account with no home program or division; approval of a volunteer grants `volunteer_general`; the reset and the change use the new rule; the verify answer has no `programs`; the reference lookup route answers 404; an approved official with no program and no division is refused every scoped read and write; the lockout after repeated wrong passwords and the length cap of 128 still hold; the drift test.
- **Done when:** shared, api and api-db suites and the drift test pass. **Depends on:** U1 · **Size:** M · **Risk area:** auth · **Status:** done

### U3. Bank branch
- **Goal:** The bank details have a branch, protected like the rest of the bank class.
- **Requirements:** R3, R4
- **Files:** `apps/api/prisma/migrations/20261013100000_volunteer_bank_branch/{migration.sql,down.sql}`, `apps/api/prisma/schema.prisma`, `packages/shared/src/registration/index.ts`, `apps/api/src/services/{registrations,volunteers}.ts`, `apps/api/src/routes/{registrations,volunteers}.ts`, `docs/api/openapi.yaml`, `docs/database/DATABASE_SCHEMA.md`, `docs/security/permissions.yaml`, `apps/api/test/integration/{registration-approval,edit-requests,constraints,field-mask}.test.ts`
- **Approach:** the bank columns of the init migration; existing tests of the bank edit request (covered; extended).
- **Tests:** integration: an approved volunteer asks to set the bank details with a branch, the RPM approves and `bank_branch_name` holds it; an official without the bank class gets no branch in the detail or the edit list; the migration and its down.sql step test and the Prisma drift check.
- **Done when:** the suites pass. **Depends on:** U2 · **Size:** S · **Risk area:** migration · **Status:** done

### U4. The registration page
- **Goal:** The form asks only the decided things and checks the password while it is typed.
- **Requirements:** R1, R2, R3, R5
- **Files:** `apps/web/src/features/registration/{form-state.ts,FormSteps.tsx,RegisterPage.tsx,registration-api.ts}`, `apps/web/src/components/PasswordRules.tsx`, `packages/shared/src/i18n/messages/{bn,en}/{registration,auth}.json`, `apps/web/src/features/registration/registration.test.tsx`, `apps/web/e2e/registration.spec.ts`
- **Approach:** the T1.9b page; `PasswordRules` of the reset form.
- **Tests:** unit (RTL, MSW): a volunteer's steps are contact, identity and address, work, account, photos, with no type, reference or bank field; an official's steps are contact (with the designation), account, photos with no program or division; the checklist "8 characters, one upper-case letter, one digit" ticks while typing and the next step stays closed until all three hold; a password with the mobile number is accepted; the submit body has no `type`, `bank`, `homeProgramId`; axe in bn and en. E2E: the volunteer journey and the approval journey pass without the type and bank steps.
- **Done when:** web tests and the registration e2e pass on both projects, also with `--repeat-each 3`. **Depends on:** U2 · **Size:** M · **Risk area:** none · **Status:** done

### U5. Profile and approver view: bank with branch, no workplace
- **Goal:** The bank section shows and edits the branch; the approver's detail drops the program line.
- **Requirements:** R3, R4
- **Files:** `apps/web/src/features/account/{ProfileView,ValueEditor,profile-api}.tsx`, `apps/web/src/admin/registrations/{RegistrationDetail,registrations-api}.tsx`, `packages/shared/src/i18n/messages/{bn,en}/registration.json`, `apps/web/src/features/account/profile.test.tsx`, `apps/web/src/admin/registrations/registrations.test.tsx`
- **Tests:** unit: the bank editor has the branch field and sends it; the profile shows the bank with its branch; an official's detail shows the designation without a workplace row.
- **Done when:** the tests pass. **Depends on:** U3, U4 · **Size:** S · **Risk area:** none · **Status:** done

### U6. The language toggle in the bar
- **Goal:** The language is a compact toggle in the top bar or at the bottom of the sidebar.
- **Requirements:** R7
- **Files:** `packages/ui/src/components/SegmentedControl/` (new, + test, css), `packages/ui/src/index.ts`, `apps/web/src/components/{LanguageSwitch,TopBar,AuthShell,AccountPage}.tsx`, `apps/web/src/admin/{AdminLayout.tsx,admin.css}`, `apps/web/src/features/registration/RegisterPage.tsx`, `apps/web/src/components/LanguageSwitch.test.tsx`, `apps/web/e2e/{auth,admin,home}.spec.ts`
- **Approach:** the admin bar and sidebar of U11 of the stack plan; React Aria `ToggleButtonGroup`.
- **Tests:** unit: the toggle shows both languages, the current one pressed; choosing the other stores the cookie and the account language and re-renders; keyboard arrows move; axe in both languages. E2E: the toggle is in the top bar on login and the registration, at the bottom of the sidebar in `/admin`, and switching changes the heading.
- **Done when:** ui and web tests and the e2e specs pass. **Depends on:** U1 · **Size:** M · **Risk area:** none · **Status:** todo

### U7. Documents and status
- **Goal:** The documents describe the new registration, the password rule and the toggle.
- **Requirements:** R1 to R7
- **Files:** `docs/ui/SCREENS.md`, `docs/ui/DESIGN_SYSTEM.md`, `docs/database/DATABASE_SCHEMA.md`, `CLAUDE.md`, `docs/STATUS.md`
- **Tests:** existing: `pnpm docs:check`, `pnpm lint`
- **Done when:** checks pass; STATUS names T1.10 next. **Depends on:** U2 to U6 · **Size:** S · **Risk area:** none · **Status:** todo

## Checkpoints
- **Mode:** grouped
- **C1** after U3: auth, migration and the password rule
- **C2** after U7: end (covers U4 to U7)

## Verification
- `pnpm typecheck`, `pnpm lint`, `pnpm docs:check`
- `pnpm test` (with the `api-db` project)
- `pnpm --filter @css/api authz:matrix`
- `pnpm e2e`, `pnpm build`

## Risks and rollback
- **Migration** (U3): one nullable column; `down.sql` drops it.
- **Password rule** (U2): weaker than O-05 (no common-password and no identity check); the 12 characters of the global roles stay. Rolling back means restoring the earlier `checkPassword` and error codes from git.
- **Registration contract** (U2): the submit schemas are strict, so a client still sending `type` gets 422; the PWA is the only client and changes in the same branch.

## Definition of done
- All units done and their tests pass
- Verification commands pass
- `ae-review` has run, with no open P0 or P1
- The owner checked the registration, the profile and the toggle in the browser

## Progress
- **Branch:** feat/registration-simplify
- **Next:** U6: the language toggle (`packages/ui` `SegmentedControl`, `TopBar`, the admin sidebar); first `LanguageSwitch.test.tsx`; the registration e2e spec still needs the removed steps taken out
- **Reviewed through:** none
- **Updated:** 2026-10-13
- **Uncommitted:** none
- **Notes:** the owner's message of 2026-10-13 was the start; the designation of an official stays (not named in the message) and moves to step 1; the first bank details go through the existing edit request (approver) until the owner says otherwise. U2 and U3 are one commit (the shared schemas change both). `checkPassword` keeps its signature but takes only `minLength`; `hasUppercase` and `hasDigit` are exported so the PWA ticks the two conditions on their own; the common-password list (`@css/shared/auth/common-passwords`) is deleted with its export. The reference lookup route, its service path, its rate class, its event and the audit action are removed; the column `registration_drafts.reference_lookups` and its CHECK stay (unused; dropping it is a later migration). A volunteer submit is always `general` with no reference and no bank; an official's has no home program or division (columns stay nullable). While testing the bank edit request a bug showed: the field mask emptied an object under `z.unknown()`, so an approver saw `{}` as the new value of an address or bank edit (the web page showed nothing); `maskData` now keeps a leaf value whole (a unit test and the new bank test cover it). C1 review fixes (logic, security, standards): a rejected account that registers again now has its home program, home division, bank details and reference cleared (the update path had kept them; a test starts from filled columns); a registration password with the own mobile or email is accepted and the two refusal codes are tested on the submit; a branch name is checked not to reach the logs; test names carry no decision ids; a comment at `newValue` says the service enforces the bank and identity class (the mask keeps a leaf whole). Left as notes: the unused column `registration_drafts.reference_lookups` (its own migration later); an old cached PWA still sends the removed fields and gets 422, so the web and the API are deployed together. U4: an official's designation moved into step 1 (three steps: contact, account, photos); the volunteer's work step has only the optional texts; `PasswordRules` shows the three conditions with a check or an empty circle while typing and the account step also names the rule when it is pressed incomplete; the registration detail of an approver drops the bank, reference and workplace rows. U5: the bank editor and the profile show the branch.
