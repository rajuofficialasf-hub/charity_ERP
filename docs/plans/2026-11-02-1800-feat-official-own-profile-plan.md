---
title: An official's own profile, their change requests, their projects with the work figures, and photos everywhere
type: feat
status: in-progress
source: plan
date: 2026-11-02
---

# An official's own profile, their change requests, their projects with the work figures, and photos everywhere

## Goal
An official opens "আমার প্রোফাইল" and sees who they are, where they work, how to reach them, and the projects they work on by year with the figures of their own work there. They ask for a change of their details, and the Department Head or the Monitoring Team decides. Every person who has an uploaded photo shows it, everywhere, and the others show their initial.

## Requirements
- **R1** `/account/profile` serves an official: identity and workplace (name, job ID, designation, roles, affiliation and unit, program, division, supervisor), contact and account (mobile, email, state, last login, the password and devices links).
- **R2** "আমার প্রকল্প": the projects the official works on (a PM through their program, an RPM through their areas, an Executive, Official দায়ী or Implementer through their project access), grouped by year, newest first, cancelled drafts left out; each card shows the code, name, program, state, application window, the official's role and areas.
- **R3** Each project card carries the official's work figures: in their area the applications received, waiting now, approved, rejected and waitlisted, and the volunteers assigned; by them the reviews, approvals, rejections and send-backs, and the median days from submission to their decision.
- **R4** The figures are seen by the official, the Department Head, the Monitoring Team, and the Program Manager of the official's program for that program's projects; nobody else.
- **R5** A global role (Head, Monitoring, Finance, Media) sees one line that every project is open to them and a link to the project list instead of a list.
- **R6** An official asks to change their name, designation, mobile, email, photo, affiliation and unit, program or division (not the supervisor: D-148); mobile and email need the code sent to the new value; a photo is uploaded with the request.
- **R7** Only the Department Head and the Monitoring Team decide an official's request; an approval writes the change, a contact change ends the person's sessions, a program or division change bumps their permission version; every decision is audited.
- **R8** A volunteer's own profile and change requests work as before.
- **R9** A person's uploaded photo shows wherever the person is shown (the staff list and profile, the organogram, the app bar chip and the sidebar, the beneficiary list, the volunteer lists and profiles); without one, the initial.
- **R10** The admin's official profile shows the same projects and figures section to the Head, the Monitoring Team and the official's PM.
- **R11** Every text is in Bengali and English with English digits; the pages work at 360 px and pass axe.

## Scope
- In: the above.
- Out: a table comparing officials side by side, exports of the figures, and the distribution, photo and class figures (the Phase 5 work summary, BD-41, T5.2); a rename of `volunteer_change_requests`; any change to the volunteer's own flow beyond sharing the table.

## Key decisions
- D-147 (owner in chat, 2026-11-02): the sections, the change requests and their fields, photos everywhere, my projects by year with the work figures, who sees them, the comparison table left to T5.2; the first slice of BD-41 brought forward.
- One change-request table for both kinds of person: `user_id` (the person) added, `volunteer_id` nullable with a check.
- An official's photo stays a `file_links` row (entity `user`, slot `photo`), as the self-registration already stores it.

## Technical decisions
- Stack unchanged (CLAUDE.md stack profile).
- Permissions in `docs/security/permissions.yaml`: `staff_edit_request.submit` (staff roles, SELF), `staff_edit_request.approve` (no default grant; the global roles hold it through `global_scope`), `staff.work.view` (PM at PROGRAM; the global roles through `global_scope`); the own reads need no grant beyond authentication.
- Every route through `defineRoute` with its permission and scope, the OpenAPI document and the drift test; the authorization matrix regenerated.
- The work figures read the application stamps (`submitted_*`, `reviewed_*`, `approved_*`) and the application audit actions by the person, in one bounded read (`core/bounded-read.ts`); the union of a person's projects follows `apps/api/src/handover/providers.ts`.

## Implementation units

### U1. The decision, the rules and the permissions
- **Files:** `docs/DECISION_LOG.md` (D-147), `docs/BUSINESS_RULES.md` (the rules of R2 to R7 and R9), `docs/security/permissions.yaml`, `docs/ui/SCREENS.md` (SCR-006, SCR-063, SCR-076), `docs/MODULE_CATALOG.md` and `docs/PLAN.md` (T5.2 notes the slice brought forward).
- **Tests:** `pnpm docs:check` (the permissions file and the rule register).
- **Depends on:** none · **Size:** S · **Risk area:** permissions · **Status:** done

### U2. The shared change-request table
- **Files:** `apps/api/prisma/schema.prisma`, a migration with `down.sql`, `apps/api/src/services/change-requests.ts` and `registrations.ts` (write `user_id`), their tests.
- **Tests:** integration: the migration's up and down keep every existing request with its person; a volunteer's request flow unchanged (the existing tests); the check refuses a volunteer kind without a volunteer.
- **Depends on:** U1 · **Size:** M · **Risk area:** migration · **Status:** done

### U3. The own profile read and the photos out
- **Files:** `apps/api/src/services/users.ts` (or a new `own-profile.ts`), `routes/me.ts`, `services/auth.ts` (`Me.photoFileId`), `services/files.ts` (an official's photo readable by those who see the staff list), the staff list and detail, the beneficiary list row, `@css/shared/auth`, `docs/api/openapi.yaml`.
- **Tests:** integration: an official reads only their own profile; `GET /auth/me` carries the photo id; the staff list carries it; a person outside the staff list cannot read an official's photo; the beneficiary row carries its photo id.
- **Depends on:** U1 · **Size:** M · **Risk area:** personal data, file access · **Status:** done

### U4. The projects and the work figures
- **Files:** a new `apps/api/src/services/projects-work.ts`, routes `GET /me/projects-work` and `GET /users/{userId}/projects-work`, `@css/shared` response schema, `docs/api/openapi.yaml`.
- **Tests:** integration: an RPM counts only their areas and their own decisions; a PM sees an official of their program on their program's projects and nothing of another program; an Executive or a volunteer is refused another official's figures; a global role's own call has no list; years newest first; cancelled drafts left out; the median days.
- **Depends on:** U1 · **Size:** L · **Risk area:** permissions, personal data · **Status:** done

### U5. An official's change requests and their decision
- **Files:** `change-requests.ts` (staff fields, the code check, the photo slot by user), `registrations.ts` (apply to `users` and `file_links`, the permission version, the sessions), `routes/registrations.ts`, `routes/files.ts`, `notifications/recipients.ts`, `@css/shared/registration`, `docs/api/openapi.yaml`.
- **Tests:** integration: create, code (mobile), photo; decided by the Head; refused to an RPM and an Executive; the program move bumps the permission version; the contact change ends the sessions; audited.
- **Depends on:** U2, U3 · **Size:** L · **Risk area:** auth, permissions, personal data · **Status:** done

### U6. The official's own profile page
- **Files:** `apps/web/src/features/account/ProfileView.tsx`, new `OfficialProfile.tsx` and `ProjectsWork.tsx`, `profile-api.ts`, `profile.css`, i18n `registration.json` or `account.json`.
- **Tests:** component: the sections, the projects by year with the figures, the global role's line, axe in both languages.
- **Depends on:** U3, U4 · **Size:** M · **Risk area:** none · **Status:** done

### U7. The edit mode of an official and the approvers' tab
- **Files:** `OfficialProfile.tsx` with `EditSection`/`ValueEditor` reuse, the pickers of the admin's official dialog, `admin/registrations/EditRequests.tsx`, i18n.
- **Tests:** component: a request for the designation and the photo; the waiting marks; the Head sees and decides a staff request in the tab.
- **Depends on:** U5, U6 · **Size:** M · **Risk area:** none · **Status:** done

### U8. Photos everywhere and the admin's official profile section
- **Files:** `admin/staff/StaffPage.tsx`, `StaffProfilePage.tsx` (photo and the projects section), `OrganogramPage.tsx`, `components/shell/ProfileMenu.tsx`, `AppShell.tsx`, `admin/beneficiaries/BeneficiariesPage.tsx`.
- **Tests:** component: the photo in the staff list, the chip and the beneficiary list; the initial without one; the projects section for the Head and the PM, not for an Executive.
- **Depends on:** U3, U4, U6 · **Size:** M · **Risk area:** none · **Status:** done

### U9. The journey, the screenshots and the documents
- **Files:** `apps/web/e2e/official-profile.spec.ts` (new), `screens.spec.ts`, `docs/STATUS.md`, `CLAUDE.md` map, the rule register.
- **Tests:** e2e: an RPM opens their own profile at 360 and 1280 px and sees the project figures; asks to change the designation and the photo; the Head approves; the photo shows in the staff list and the RPM's chip.
- **Depends on:** U5 to U8 · **Size:** M · **Risk area:** none · **Status:** todo

## Checkpoints
- **Mode:** grouped (risk areas in U1 to U5).
- **C1** after U2: the decision, the permissions and the migration.
- **C2** after U5: the API (the own reads, the figures, the change requests).
- **C3** after U8: the web.
- **C4** after U9: end, with the whole branch's scripted checks.

## Verification
- `pnpm typecheck`, `npx eslint apps packages scripts`, `npx prettier --check apps packages docs`, `pnpm i18n:check`, `pnpm docs:check`, `pnpm --filter @css/api authz:matrix`.
- `pnpm test` (the API database tests included), `pnpm --filter @css/web bundle:report` under 250 KB.
- `pnpm e2e --workers 2` with `official-profile.spec.ts`, `staff-accounts`, `registration`, `a11y`, `screens`.

## Risks and rollback
- The migration touches the volunteers' request table: the backfill is checked by a test, and `down.sql` restores the required `volunteer_id`.
- The work figures read the audit log: one bounded read with the actor index; if it is slow on the measurement database, the figures move to a nightly table (a later decision).
- Rollback: revert the merge and run the `down.sql`.

## Progress
- **Branch:** `feat/official-own-profile` (from `main` after PR #37)
- **Updated:** 2026-11-02
- **Next:** C3 (review of U6 to U8, range 1b1d24bb^..HEAD for the web), then U9: the E2E journey, the screenshots and the documents
- **Reviewed through:** C2 at fb1a66ad (fixes in the next commit)
- **Uncommitted:** none
- **Notes:** the owner's answers of 2026-11-02 are in the Goal and the Key decisions. U1: the work summary is T5.2 in PLAN.md (not T5.3); `work_summary.view` (T5.2) also grants an RPM in their own region, which the owner did not choose for these figures, so `staff.work.view` is its own permission. The seed test compared the permission names in two orders (Postgres vs `localeCompare`); `staff.` and `staff_` exposed it, and both sides now sort by code point. U2: `volunteer_change_requests.user_id` (backfilled from the volunteer) and a nullable `volunteer_id` with the person check; every volunteer path keeps working on volunteer requests only (a request without a volunteer is an official's and is not found there; its notice is skipped) until U5 gives officials their own path. The database tests ran 96 of 96 with `--maxWorkers=2`; the default run lost one worker to the machine's Node crash. C1 (T2, two reviewers; no P0 or P1): an official's waiting request reached a global role's volunteer list (an empty scope filter does not keep out a null relation) and broke it with a 500; the list, the count and the decision now ask for `volunteerId: { not: null }`, with a test. For U5: the `ChangeRequest` schema in openapi.yaml makes `volunteerId` nullable and adds `userId` when the officials' requests are returned; the notice of an official's request is its own. U3: `GET /me/profile` in `services/own-profile.ts`, the photo ids from `services/staff-photos.ts` (the `file_links` row of the user) in `/auth/me`, the users list and detail; the beneficiary row carries `photoFileId` under the profile-detail class (the Media Team gets no key). Every official already reads another official's photo through `volunteer.view_all` at GLOBAL, so BR-290 says so, and a volunteer is refused; C2 took `permission.view` back out of the photo reach, as it only widened it to every user a panel grant of it reaches. U4: `services/projects-work.ts` reads the ties as the handover does and the figures in five grouped queries inside one bounded read (no query per project); "received" counts every application past the draft (a public-link entry waiting for verification came in too); the rejections and waitlistings by the person come from the engine's audit entries (`new.status`); a role holding `project.view` at GLOBAL (Head, Monitoring, Finance, Media) gets `everyProject` and no list; a PM reaches an official whose home program is theirs or who works on one of their projects, and sees only those projects. Send-backs are not counted: BR-292 names reviewed, approved, rejected and waitlisted. The audit partitions start in October 2026, so test dates stay after it. The matrix of U3 had missed `/me/profile`; it is regenerated here. U5: a new `services/staff-change-requests.ts` keeps an official's request in the shared table without a volunteer; its own routes (`/me/staff-change-requests` with the code routes, `/staff-edit-requests` and its decision at GLOBAL) carry the staff permissions, because the volunteer routes' permissions stay unchanged; the code send and check, the own list (`GET /me/change-requests`) and the photo upload now find a request by its person (`user_id`), which serves both kinds; the admin's reference check became `assertStaffRefs` and the staff photo link `linkStaffPhoto`, shared with the self-registration; the deciders' list carries the person's current value and the names of a program, division or supervisor; the person who asked gets 403 on their own decision; a contact approval ends the sessions and moves the version on, a program or division approval moves the version on. `ChangeRequest` now has `userId` and a nullable `volunteerId`. Not done here: a count of the officials' waiting requests on the deciders' My Work home (the service has `waitingCount`; the web units decide whether the home shows it). C2 (T2, three reviewers; no P0 or P1): the photo reach of `permission.view` taken back out (it only widened the reach); an official's photo is fixed once uploaded (a second upload would have changed what the decider saw) and a new photo request closes one still waiting for its upload; the IDs in the new comments replaced by the document and its heading. Left as P3: the volunteer's photo request may still be replaced while it waits (the earlier behaviour). For U6: "rejected" and "waitlisted" by the official count the decisions they made, also ones reversed later; the labels say "decisions". U6: `ProfileView` gives a staff person `OfficialProfile` (three sections in the profile's own navigation: identity and workplace, contact and account with the password and devices links, my projects) and never reads the volunteer profile; `ProjectsWork` draws the projects by year with the area and the own figures, a project linked only for a viewer who may open projects, and is ready for the admin's official profile; the role names come from the API now (`roles` of the own profile and of each project are `{ key, name }`), because `/roles` is open to the global roles only; the labels reuse the official dialog's texts; checked in the browser against the running stack as rpm.dhaka at 375 px (no sideways scroll). U7: the owner decided on 2026-11-03 (D-148) that the supervisor is not requested; the program list for a request comes from `GET /me/staff-change-requests/choices` (every active program), the division from the public locations; `OfficialDetails.tsx` holds the official's rows, values, inputs and edit section (the volunteer's `EditSection` stays the volunteer's); `RequestState` sends an official's code through the staff routes; the deciders' requests are a third tab `StaffEditRequests` on the registrations page for the two global roles, with the value now beside the new one and no buttons on the decider's own request. The dev database needed `pnpm db:migrate` for this branch's migration; its next step `jobs:install` stops without `DATABASE_URL` in the shell (the migration itself applied). U8: `components/PersonPhoto.tsx` (`PersonAvatar`, `PhotoPersonCell`, `PersonTile`) streams a person's photo where the person is shown: the staff list, the official's profile, the organogram (its nodes now carry `photoFileId`), the app bar chip and the sidebar (`Me.photoFileId`), the beneficiary list; the volunteer list already had it. The admin's official profile has the section "প্রকল্প ও কাজ" for the two global roles and the PM (`canSeeStaffWork`), left out on the server's 404 for a PM outside the official's programs.
