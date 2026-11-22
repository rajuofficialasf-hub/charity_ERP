---
title: Who sees which volunteers and beneficiaries: by the areas of the projects a person works on
type: feat
status: in-progress
source: brainstorm
date: 2026-11-19
doc_review: 2026-11-19
---

# Who sees which volunteers and beneficiaries: by the areas of the projects a person works on

## Goal

An official sees the volunteers of the areas they are responsible for and the beneficiaries of the projects they work or worked on, and nothing else. The area is never written on the account: it comes from the project, because a person who works in Dhaka today may work in Barishal tomorrow.

## Problem

The owner, in chat on 2026-11-19: "বর্তমান ওয়েবসাইটে স্বেচ্ছাসেবক ও উপকারভোগী ট্যাব থেকে সবাই সব দেখতে পারে।" The catalogue gives `volunteer.view_all` and `beneficiary.view_all` at GLOBAL to the Program Manager, the RPM, the Project Executive and the Official দায়ী (`docs/security/permissions.yaml`), so each of them reads every volunteer and every beneficiary of the country in the two tabs.

The account of an official also carries a "home division" (`users.home_division_id`), chosen when the account is made. It decides no work: the areas a person works in are set on the project (`project_areas.rpm_user_id`, `project_staff.area_location_id`). The owner, the same day: "আমি চাচ্ছি শুধু কোন প্রোগ্রাম এর আওতায় ত থাকবে। কোন এলাকায় কাজ করবে টা প্রকল্পে ঠিক করে দেওয়া হবে।"

## Requirements

### A. The area comes from the project

- **R1.** An official's account names the program they belong to and no area. The home division is no longer asked for when an account is made, and is no longer shown or changed anywhere (the new-official form, the profile, the organogram, the official's own request for a change of workplace). The stored values stay in the database.
- **R2.** A PM gives an RPM the responsibility of a division on a project. From then the RPM sees the volunteers whose address is in that division, and may add them to the project.
- **R3.** An RPM gives a Project Executive one or several districts of the RPM's division on a project, or none, which means the whole division. The Executive sees the volunteers whose address is in those districts, and may add only them to the project.
- **R4.** While a person chooses volunteers for a project, the list offers only the volunteers of the area that person holds on that project.
- **R5.** A PM sees the volunteers of every area of the own program's projects at work: everything the RPMs under them see.
- **R6.** An Official দায়ী is treated as a Project Executive is: the volunteers of the area they hold on a project, and the beneficiaries of the own projects (section C).
- **R7.** The areas of a project show a person its volunteers from the day the project is active. While it is a draft, they serve only the choice of volunteers for that project (R4). Once the project is closed, its areas no longer show a person any volunteer; a reopened project counts again.

### B. An extra area on a person's profile

- **R8.** A person may be given an extra area on their profile: one or several divisions or districts, or the whole country. They then see the volunteers of that area whether or not a project of theirs is at work there, and do there what their role lets them do with volunteers (the approval of a registration, for one), until the extra area is taken away. An extra area shows no beneficiary: beneficiaries always follow the projects (section C).
- **R9.** An extra area is given and taken away by the person above, inside what that person reaches themselves: an Admin and the Department Head for anyone and any area; a PM for the RPMs and Executives of the own program; an RPM for the own Executives, and only an area the RPM sees, an extra area the RPM was given among them. The whole country is an Admin's or the Department Head's to give. Nobody gives one to themselves.
- **R10.** The profile shows each extra area with who gave it, when and why, and it is audited.
- **R11.** Where no project is at work in a division, the registration of a new volunteer there is seen by the global roles and by whoever holds that area as an extra one, and by nobody else.

### C. Beneficiaries and applications follow the projects

- **R12.** An official sees a beneficiary only through an application in a project they work or worked on, inside their part of it:
  - a Project Executive: the applications placed in the districts they hold on the project, whoever added the volunteer who sent them;
  - an RPM: the applications of the division they hold on the project, which includes those of the Executives under them;
  - a PM: every application of the projects of the own program.
- **R13.** After a project is closed, the people who worked on it still see its beneficiaries and applications (to read, and for the follow-up). A responsibility that was handed over or ended no longer shows them.
- **R14.** An Admin, the Department Head and the Monitoring Team see every volunteer and every beneficiary, as now. The Media Team keeps its limited view of every beneficiary, and the Procurement and Finance Teams keep what they have.

### D. Nothing else changes by this work

- **R15.** What a person may do (approve, block, edit, export) stays as the catalogue gives it today; only whom they reach changes. The lookup of a person by NID while an application is written stays as it is, with its daily limit outside the own area.

## Scope

In:
- the reach of the volunteer tab, the beneficiary tab, their profiles, their exports and the candidate list of a project's volunteers;
- the extra areas on an official's profile;
- the removal of the home division from the account.

Out:
- the role change on the staff page and the panel screens (the second part of `docs/plans/2026-11-19-1000-feat-admin-role-and-permissions-plan.md`);
- any new role or permission name beyond what the extra area needs;
- the volunteers' own screens.

## Key decisions

All by the owner, in chat, 2026-11-19:

- The area is set on the project, not on the account: "কোন এলাকায় কাজ করবে টা প্রকল্পে ঠিক করে দেওয়া হবে। কারণ আজ যে ঢাকায় কাজ করবে কাল সে বরিশাল এ কাজ করতে পারে।"
- "pm যখন একজন rpm কে ঢাকা বিভাগ এর দায়িত্ব দিবেন। তখন rpm ঢাকা বিভাগ এর স্বেচ্ছাসেবকদের দেখবেন।"
- The home division leaves every screen (asked: remove it everywhere? answered: "দাও").
- A closed project no longer shows volunteers; when someone needs them, a division or a district is added on the profile: "প্রকল্প ক্লজ হলে তিনি দেখিতে পাবেন না। আবার কোন প্রয়োজনে যদি দেখার প্রয়োজন হয় তাহলে তার প্রোফাইলে তখন বিভাগ বা জেলার নাম দিলে তখন সেই জেলা বা বিভাগ এর স্বেচ্ছাসেবক দেখা যাবে।"
- The extra area is given by the person above, inside the own area (the chosen option).
- An Executive sees every application of the own districts on the project, not only those of the volunteers they added themselves (the chosen option).
- The beneficiaries and applications of a closed project stay visible to the people who worked on it (the chosen option).
- A PM sees the volunteers of every area of the own program's projects at work (the chosen option).
- An Official দায়ী sees what an Executive sees, and the Media Team stays as it is (the chosen option).
- An extra area shows volunteers only (the chosen option).
- Told to the owner with the closed-project rule, and not objected to: a division without a project at work leaves its new registrations to the global roles and the holders of an extra area (R11).
- After the review of the plan (the chosen options): a draft project serves the choice of its volunteers only, and its areas show in the tab from the activation; an RPM may place an Executive without districts, who then holds the whole division; the whole country is given by an Admin or the Department Head alone, and a person may give an extra area they were given on to the person below them.
- Earlier the same day: an Executive sees the data of the own districts, an RPM the own and the Executives', a PM the whole project; the Department Head and the Monitoring Team see everything; "তার বস চাইলে তাকে অন্য জেলার দায়িত্ব দিয়ে সেই জেলার ডেটা নিয়ে কাজ করার অনুমতি দিতে পারে".

This changes the nationwide tabs of the blueprint for the roles below the global ones; the decision row in `docs/DECISION_LOG.md` is written before any code.

## Success criteria

- The Dhaka RPM of a draft project finds the Dhaka volunteers in that project's choice of volunteers and none in the volunteer tab.
- The Dhaka RPM of an active project opens the volunteer tab and finds the Dhaka volunteers and no Barishal one; after the project is closed the tab is empty, and after the Head adds "Barishal" on the profile it shows the Barishal volunteers.
- An Executive with Barguna and Bhola on a project adds a Bhola volunteer to it and cannot find a Patuakhali one.
- An Executive opens the beneficiary tab and finds the people with an application in the own districts of the own projects, also of a closed one, and nobody else.
- The new-official form asks for no division.
- An Admin, the Department Head and the Monitoring Team see what they see today.

## Open questions

None. "At work" means active or closing, by the owner's choice after the review of the plan (see the technical decisions).

## Technical decisions

- **Stack profile:** unchanged, as in `CLAUDE.md` (Express 5 with `defineRoute`, Prisma 7 with hand-written `down.sql`, own authentication of AUTH.md, the asf UI system). No new library.
- **"At work" reads the project's state** (`PROJECT_STATUSES` of `packages/shared/src/projects/lifecycle.ts`): `active` and `closing` count; `draft`, `closed` and `cancelled` do not; a reopened project is `active` again. A draft is left out on the owner's word: a draft is cheap to make, and its areas would otherwise open any division's volunteers to whoever sets it up. The candidate list of a project's volunteers (`services/project-volunteers.ts`, `callerAreas`) reads the areas of that one project whatever its state, so volunteers are still chosen while it is a draft (R4).
- **Volunteers are reached by their address, as today** (`volunteerWhere` of `apps/api/src/access/scope.ts`); what changes is where the areas come from. For the entity `volunteer`, and for the volunteer-only areas of the entity `user`, `ownAreas` and the program path of `volunteerWhere` read only projects at work. The other entities keep reading every project a person is on, so R13 holds without a second rule.
- **The catalogue stops giving the two tabs at GLOBAL** (`docs/security/permissions.yaml`): `volunteer.view_all` and `beneficiary.view_all` become `PROGRAM` for the Program Manager and `REGION` for the RPM, the Project Executive and the Official দায়ী (resolved from their project areas, as `application.view` is today). The Media roles and the Procurement Team keep their lines. The global roles are untouched.
- **`GET /volunteers` filters by the caller's scope.** Its route scope moves from `global` to `volunteer`, and the list and its counts take `volunteerWhere(scope)`. `GET /beneficiaries` is already scoped (`beneficiary`), so it narrows with the catalogue.
- **A beneficiary is reached through an application, not through the address, where the area belongs to a project.** In `beneficiaryWhere` and `beneficiaryScopeSql` an area with a project becomes "has an application of that project placed in that location", read with the one helper the application filter uses (`applicationsIn` of `scope.ts`): a division matches `applications.region_location_id`, a district `district_id`, a union `union_id`, and an upazila the parent of the application's union. An area without a project (a panel grant on a location) keeps today's address rule. A test holds the Prisma filter and the SQL form to the same people, as one does today.
- **Several districts for one staff place** live in a new table `project_staff_districts` (`project_staff_id`, `location_id`), because `project_staff` allows one live row per person and project (`@@unique([projectId, userId])`) and holds one `area_location_id`. The place keeps its `area_location_id` (the RPM's division); the districts must lie inside it. A place without district rows means the whole area (the owner's choice), so the rows of today keep working and no data is rewritten. A change of a place's districts raises the person's permission version and is audited, as the giving of the place is.
- **Extra areas live in their own table** `user_extra_areas` (`user_id`, `location_id` or the whole country, `reason`, `granted_by`, `granted_at`, `ended_at`, `ended_by`), not as panel rows: one extra area must reach every volunteer permission the role holds, must show no beneficiary (R8), and is given by people who do not hold the panel (R9). `resolveInstances` adds them for the entity `volunteer` (and the volunteer-only areas of `user`) when the person is an official who holds the route's permission; the whole country sets `global` for that entity only.
- **One new permission, `user.extra_area.manage`** (module M02, not sensitive, not a key permission): `PROGRAM` for the Program Manager, `REGION` for the RPM, and the global roles by their role. The service adds the rules no catalogue line can say: the target is an official the actor reaches, never the actor; the location lies inside what the actor reaches for volunteers, the actor's own extra areas among them (any for a global role; the areas of the own program's projects at work for a PM; the own division for an RPM); the whole country is refused to everyone but an Admin and the Department Head. An extra area that was given on stays when the one it came from is ended: each row stands on its own, and the profile names who gave it.
- **The home division leaves the API and the screens, the column stays.** `users.home_division_id` is no longer read or written by any service, request schema, answer or screen; no migration drops it, so nothing is lost (constitution §2, no data loss). The fallback of `userWhere` that reached officials by their home division goes with it.
- **The nationwide lists are measured again.** The beneficiary list of a scoped caller asks "has an application in these projects and places"; `pnpm --filter @css/api perf:lists` runs as an RPM and as an Executive on `css_erp_perf`, and an index is added only where the plan of the query asks for one (`docs/testing/PERFORMANCE.md`).
- **What this amends.** Q-20 of `docs/DECISION_LOG.md` ("Tabs nationwide; assignment and applications by region") and the rules BR-020, BR-036 and BR-185 of `docs/BUSINESS_RULES.md`; the blueprint's nationwide tabs (`docs/source/ERP_BLUEPRINT_BN.md`, principle 5 and the tab table) now differ from the system, which the new decision row names (the owner's latest instruction comes first, constitution §0).

## Implementation units

Every unit keeps the existing tests and E2E specs green: where a narrower reach breaks a test or a demo journey, that unit updates the test or the demo seed in the same commit.

### U1. The decision and the rules
- **Goal:** the new reach is decided in writing before any code.
- **Requirements:** R1–R15 (as decisions)
- **Files:** `docs/DECISION_LOG.md` (the next free id), `docs/BUSINESS_RULES.md` (BR-020, BR-036, BR-185 rewritten; new rules for the areas of a project, the extra areas and the home division), `docs/security/RBAC.md` (the scope table, "Data scopes and their resolution", the tabs), `docs/MASTER_SPEC.md` where it names the nationwide tabs
- **Approach:** as D-188 was written: the decision row quotes the owner's words of 2026-11-19, names what it amends (Q-20) and the passages of the blueprint that now differ.
- **Tests:** `pnpm docs:check`.
- **Done when:** the decision row carries the owner's answers and the documents say the same thing.
- **Depends on:** none
- **Size:** S
- **Risk area:** none
- **Status:** done

### U2. Several districts for a staff place
- **Goal:** an RPM gives an Executive or an Official দায়ী one or several districts of the own division on a project.
- **Requirements:** R3, R6
- **Files:** `apps/api/prisma/schema.prisma`, a new migration with `down.sql`, `packages/shared/src/projects/setup.ts` (the staff request schemas gain `districtIds`), `apps/api/src/services/project-setup.ts` (`addStaff`, the staff read, a change of the districts), `apps/api/src/routes/project-setup.ts`, `apps/api/src/access/scope.ts` (`ownAreas`), `apps/api/src/handover/providers.ts` (a place moves with its districts), `docs/api/openapi.yaml`, `docs/database/{DATABASE_SCHEMA,ERD}.md`, `apps/api/test/integration/{project-setup,access-scope,handover,migrations}.test.ts`, `apps/api/src/access/scope.spec.ts`
- **Approach:** follow `addStaff` of `services/project-setup.ts` (the area must be an area of the project; an RPM gives only inside the own areas). Each district must be a location of the level `district` whose parent is the place's `area_location_id`. `ownAreas` returns the districts of a place that has them, else its area.
- **Tests:**
  - integration (`access-scope.test.ts`, through `AccessService.scopeOfUser`, since the areas are read from the database): a place with two districts gives two areas; without districts, its division.
  - integration: an RPM gives two districts of the own division → 201 and both stored; no district → 201 and the whole division; a change of the districts raises the Executive's permission version, is audited, and the next request no longer reaches the district that was taken away; a district of another division → 422; a PM gives them too; an Executive with Barguna and Bhola reaches the applications of those two districts and not of Patuakhali; an RPM of another region → 403 or 404; the handover carries the districts; the migration round trip.
  - existing: covered by `apps/api/test/integration/project-setup.test.ts` and `handover.test.ts`.
- **Done when:** the cases pass and the OpenAPI drift test is green.
- **Depends on:** U1
- **Size:** M
- **Risk area:** migrations, auth and permissions
- **Status:** done

### U3. The reach of the volunteer tab
- **Goal:** an official sees the volunteers of the areas of their projects at work, and the registration of a new volunteer follows the same reach.
- **Requirements:** R2, R4, R5, R6, R7, R11, R14, R15
- **Files:** `docs/security/permissions.yaml`, `apps/api/src/access/scope.ts` (`resolveInstances`, `ownAreas`, `volunteerWhere`), `apps/api/src/routes/volunteers.ts`, `apps/api/src/services/{volunteer-list,volunteer-profile,registrations,project-volunteers}.ts`, `apps/api/src/exports/rows.ts` (to confirm it follows), `docs/security/AUTHORIZATION_MATRIX.md` (regenerated), `docs/api/openapi.yaml` (the scope annotation), `apps/api/src/access/scope.spec.ts`, `apps/api/test/integration/{volunteer-list,volunteer-profile,registration-approval,project-volunteers,export-rows,access-records,authorization-matrix}.test.ts`, `apps/api/seed/sets/demo/index.ts` and the E2E specs the narrower reach breaks
- **Approach:** the status filter is one condition on the project in `ownAreas` and in the program path of `volunteerWhere`, taken only for the entity `volunteer` and the volunteer-only areas of `user`. The list route takes its scope as the beneficiary list does.
- **Tests:**
  - integration (`access-scope.test.ts`): the areas of a draft, a closed or a cancelled project give no volunteer area; an active and a closing one do; the entity `application` still gets the areas of a closed project.
  - integration: the Dhaka RPM lists the Dhaka volunteers and no Rangpur one; an Executive with two districts lists those districts only; a PM lists every area of the own program's projects at work; while the project is a draft the RPM's tab is empty and the project's candidate list still offers the Dhaka volunteers; after the close the RPM's list is empty and the counts are zero, after the reopen it is back; the Monitoring Team, the Head and an Admin list everyone; a volunteer's profile outside the reach → 404; a pending registration of Dhaka is listed and approved by the Dhaka RPM and not seen by the Rangpur RPM; the candidates of a project hold only volunteers of the caller's area there; an export of the list holds the same people as the list.
  - e2e: `apps/web/e2e/volunteers.spec.ts`: as `rpm.dhaka@example.org` at `/admin/volunteers` the list shows a Dhaka volunteer of the demo seed and no Rangpur one; as `head@example.org` both.
  - existing: covered by `volunteer-profile.test.ts`, `registration-approval.test.ts`, `access-records.test.ts`, `scope.spec.ts`; the cases that pin the nationwide reach are rewritten, not duplicated.
- **Done when:** the cases pass, the matrix is regenerated and `perf:lists` shows the scoped volunteer list inside its limit.
- **Depends on:** U1, U2
- **Size:** L
- **Risk area:** auth and permissions, personal data
- **Status:** done

### U4. Extra areas on a person's profile (API)
- **Goal:** the person above gives an official a division, a district or the whole country for volunteers, and takes it away.
- **Requirements:** R8, R9, R10, R11
- **Files:** `apps/api/prisma/schema.prisma`, a new migration with `down.sql`, `docs/security/permissions.yaml` (`user.extra_area.manage`), `packages/shared/src/access/index.ts` (request and answer schemas), `apps/api/src/services/extra-areas.ts` (new), `apps/api/src/routes/users.ts`, `apps/api/src/container.ts`, `apps/api/src/access/{effective,scope,hard-rules}.ts`, `apps/api/src/notifications/account-events.ts`, `docs/api/openapi.yaml`, `docs/api/API_STANDARDS.md` (new codes, if any), `docs/database/{DATABASE_SCHEMA,ERD}.md`, `docs/security/AUTHORIZATION_MATRIX.md`, `apps/api/test/integration/{extra-areas,migrations,authorization-matrix}.test.ts`, `apps/api/src/access/{scope,hard-rules}.spec.ts`
- **Approach:** written as `services/role-changes.ts`: lock the target, find it inside the caller's scope, ask the rule, write, audit (`user.extra_area_given`, `user.extra_area_ended`), raise the permission version, `settled` after the commit, tell the person (`permission_changed`). `GET /users/{userId}/extra-areas` (the live ones and the ended ones, with who and why), `POST /users/{userId}/extra-areas` (`{ locationId | wholeCountry, reason }`), `POST /users/{userId}/extra-areas/{areaId}/end` (`{ reason }`). The "inside the actor's reach" rule has no example in the repository: it reads the actor's volunteer scope and the location's parents.
- **Tests:**
  - unit: the reach rule: a location, its parent and the whole country against a global role, a PM's program areas and an RPM's division.
  - integration: the Head gives Barishal to an RPM with no project there → 201, the RPM lists the Barishal volunteers and approves a Barishal registration, and sees no Barishal beneficiary; ended → the list is empty again; the whole country by an Admin → 201, by a PM or an RPM → 403; an RPM gives an own Executive the extra district the Head gave the RPM → 201, and it stays after the RPM's own is ended; with an extra area and no project there, the volunteer's profile, the export of the list and the registration's detail carry no beneficiary's name, identity number or contact, and `GET /users` lists no official through it; an RPM gives an own district to an own Executive → 201, a district of another division → 403, to an Executive of another region → 404; a PM to an RPM of the own program → 201, of another program → 404; to oneself → 403 `self_change`; to a volunteer → 404; the same live area twice → 409; a Monitoring Team member and an Executive → 403; the next request of the target after a change uses the new version; audited both ways.
  - existing: none, characterize first is not needed (a new feature).
- **Done when:** the cases pass, the drift test is green and the matrix is regenerated.
- **Depends on:** U3
- **Size:** L
- **Risk area:** auth and permissions, migrations, personal data
- **Status:** todo

### U5. The reach of beneficiaries by project
- **Goal:** an official sees a beneficiary only through an application of an own project, inside the own part of it, also after the project is closed.
- **Requirements:** R12, R13, R14, R15
- **Files:** `docs/security/permissions.yaml`, `apps/api/src/access/scope.ts` (`beneficiaryWhere`, `beneficiaryScopeSql`, `beneficiaryRowsProjectWhere`), `apps/api/src/services/{beneficiaries,beneficiary-contact,beneficiary-corrections,beneficiary-merges,beneficiary-merge-candidates,beneficiary-family}.ts` (to confirm each follows the scope), `apps/api/src/exports/{rows,records}.ts`, `docs/security/AUTHORIZATION_MATRIX.md`, `docs/testing/PERFORMANCE.md`, `apps/api/src/access/scope.spec.ts`, `apps/api/test/integration/{beneficiary-tab,beneficiary-merge-candidates,beneficiary-family,family-profile,person-signals,export-rows,export-records,access-project-revoke,access-area-revoke}.test.ts`, the demo seed and the E2E specs the narrower reach breaks
- **Approach:** the two forms of the beneficiary filter change together, as `access-project-revoke.test.ts` already compares them. The lookup by an identity number (`services/beneficiary-identity.ts`) keeps what it returns and its daily limit; the unit confirms that its "outside the own area" still reads the caller's areas against the person's address and not the tab's new rule, and pins it with a test. The rows inside a profile (`beneficiaryRowsProjectWhere`) show only the projects of the caller's scope for an area of a project.
- **Tests:**
  - unit: `scope.spec.ts`: an area of a project gives "an application of that project placed there"; an area without a project keeps the address rule; a revoked project and a revoked location still leave their people out.
  - integration: an Executive with two districts lists the people with an application there in the own project, also one sent by a volunteer the RPM added, and nobody of a third district; an RPM lists the division's; a PM the whole program's; a person who only lives in the division, with no application in an own project, is not listed; after the close the same people are still listed; after the handover of the place they are not; the Media Team lists as before; the profile of a person outside the reach → 404; the duplicates and an export hold the same people as the list; the Prisma filter and the SQL form select the same profiles; the lookup of a person outside the caller's areas answers what it answers today and counts toward the daily limit.
  - e2e: `apps/web/e2e/beneficiaries.spec.ts`: as `executive@example.org` at `/admin/beneficiaries` a person with an application in the Executive's district is listed and a person of another district is not.
  - existing: covered by `beneficiary-tab.test.ts`, `beneficiary-merge-candidates.test.ts`, `export-rows.test.ts`; the nationwide cases are rewritten.
- **Done when:** the cases pass and `perf:lists` as an RPM and as an Executive stays inside its limit, with an index added if the measurement asks for one.
- **Depends on:** U1, U2
- **Size:** L
- **Risk area:** auth and permissions, personal data
- **Status:** todo

### U6. The home division leaves the account
- **Goal:** no screen and no request asks for, shows or changes an official's home division.
- **Requirements:** R1
- **Files:** `packages/shared/src/auth/staff.ts`, `packages/shared/src/registration/index.ts`, `apps/api/src/services/{staff-accounts,staff-change-requests,own-profile,organogram,users,registrations,registration}.ts`, `apps/api/src/routes/{registrations,users}.ts`, `apps/api/src/access/scope.ts` (`userWhere`, `userOutsideRevoked`), `apps/api/seed/sets/demo/index.ts`, `docs/api/openapi.yaml`, `docs/security/RBAC.md`, `apps/web/src/api/schemas/{staff,registrations}.ts`, `apps/web/src/admin/staff/{OfficialDialog,StaffProfilePage,StaffEditRequests,OrganogramPage}.tsx`, `apps/web/src/features/account/OfficialDetails.tsx`, `packages/shared/src/i18n/messages/{bn,en}/*.json` (the keys that fall away), their tests (`staff-accounts`, `staff-directory`, `own-profile`, `registration-submit`, `staff-edit-requests`, `access-area-revoke`, `scope.spec.ts`; web `staff.test.tsx`, `organogram.test.tsx`, `registrations.test.tsx`, `OfficialProfile.test.tsx`; `apps/web/tests/contract/people.contract.test.ts`)
- **Approach:** the field goes from the request schemas (a strict schema then refuses it), the answers and the screens in one commit, so the web and the API never disagree. The official's own request for a change of workplace keeps the program and loses the division. The column and its stored values stay.
- **Tests:**
  - unit: the request schemas refuse `homeDivisionId`.
  - integration: a new account, a profile update and an own change request without a division → as before; with one → 422; a user's answer carries no home division; an area grant on the entity `user` no longer reaches an official by a home division.
  - component: the new-official form and the profile show no division field; the form sends none.
  - e2e: `apps/web/e2e/staff-accounts.spec.ts` still creates an official through the form, which has no "নিজ বিভাগ" field.
  - existing: covered by the files above; their division cases are removed or turned into the refusal.
- **Done when:** a search for `homeDivisionId` finds it only in the Prisma schema, the generated client and the seed's history.
- **Depends on:** U1, U3
- **Size:** M
- **Risk area:** none
- **Status:** todo

### U7. The districts of a staff place in the project setup
- **Goal:** the RPM chooses an Executive's districts on the setup screen.
- **Requirements:** R3
- **Files:** `apps/web/src/admin/projects/setup/StaffSection.tsx`, `apps/web/src/api/schemas/` (the staff place), `packages/shared/src/i18n/messages/{bn,en}/admin.json`, `apps/web/src/admin/projects/setup/setup.test.tsx`, `apps/web/tests/contract/` (the changed call), `apps/web/e2e/projects.spec.ts`, `docs/ui/SCREENS.md`
- **Approach:** the existing staff row of `StaffSection.tsx` gains a choice of several districts by name, offered from the districts of the chosen area (the contract's `SelectField` in its several-choice form, or the piece the areas section already uses); "the whole area" is the empty choice.
- **Tests:**
  - component: choosing two districts sends both; no choice sends none and reads "পুরো এলাকা"; the districts offered are the chosen area's.
  - e2e: `projects.spec.ts`, on the desktop project: at `/admin/projects/:projectId/setup` the PM adds an Executive in the section "স্টাফ অ্যাক্সেস" with the area "ঢাকা" and the districts "গাজীপুর" and "নরসিংদী", saves, and the row shows both names.
  - existing: covered by `setup.test.tsx`.
- **Done when:** the cases pass at 1280 px (a setup screen, desktop first).
- **Depends on:** U2
- **Size:** M
- **Risk area:** none
- **Status:** todo

### U8. Extra areas on the staff profile, and the empty lists
- **Goal:** the person above gives and ends an extra area on the official's profile, and a person with no area understands an empty tab.
- **Requirements:** R7, R8, R9, R10
- **Files:** `apps/web/src/admin/staff/{StaffProfilePage,ExtraAreas}.tsx` (the second new), `apps/web/src/admin/staff/staff-api.ts`, `apps/web/src/api/schemas/staff.ts`, `apps/web/src/admin/roles.ts` (one check, who may manage extra areas; nothing of the role change), `apps/web/src/admin/volunteers/VolunteersPage.tsx`, `apps/web/src/admin/beneficiaries/BeneficiariesPage.tsx`, `packages/shared/src/i18n/messages/{bn,en}/admin.json`, `apps/web/src/admin/staff/staff.test.tsx`, `apps/web/tests/contract/people.contract.test.ts`, `apps/web/e2e/staff-accounts.spec.ts` or a new `extra-areas.spec.ts`, `docs/ui/SCREENS.md`
- **Approach:** a section "বাড়তি এলাকা" on the profile, built like its "ডিভাইস" section: each area with who gave it, when and why, a button to end it with a reason (the contract's confirm dialog), and "এলাকা যোগ করুন" with a location chosen by name and a reason. The empty state of the two tabs says why nothing shows and who can add an area. Texts through the `ae-bangla-copy` skill.
- **Tests:**
  - component: the section lists the areas, adds one and ends one; it is hidden from a role that may not manage them; the empty tab shows its explanation for a scoped person and the plain empty state for a global role.
  - e2e: as `head@example.org` at an RPM's profile under `/admin/staff`, press "এলাকা যোগ করুন", choose "বরিশাল", give a reason, save, and see "বরিশাল" in the section "বাড়তি এলাকা"; as that RPM at `/admin/volunteers` a Barishal volunteer is listed; the Head ends the area and the RPM's list no longer shows that volunteer. At 360 px the section reads without sideways scroll.
  - existing: covered by `staff.test.tsx`.
- **Done when:** the cases pass on the desktop and the mobile projects.
- **Depends on:** U3, U4
- **Size:** M
- **Risk area:** none
- **Status:** todo

### U9. The demo data, the UAT scripts and the sweep
- **Goal:** the owner can try every rule with the demo accounts, and the documents match the system.
- **Requirements:** all
- **Files:** `apps/api/seed/sets/demo/index.ts` (districts for the demo Executive, a closed project with its people, an extra area), `apps/api/test/integration/seed.test.ts`, `docs/testing/DEMO_ACCOUNTS.md`, `docs/testing/uat/{PHASE_1_UAT_BN,PHASE_2_UAT_BN}.md`, `docs/ui/SCREENS.md`, `docs/MODULE_CATALOG.md`, `docs/STATUS.md`, `CLAUDE.md` (the repository map)
- **Approach:** the demo seed is idempotent and changes no stored row an owner edited, as its role handover of 2026-11-19 does. The UAT steps are written with the `ae-bangla-copy` skill.
- **Tests:**
  - integration: `seed.test.ts`: the demo Executive holds districts, the demo set runs twice without a change.
  - e2e: the whole `pnpm e2e`.
  - existing: covered by `seed.test.ts`.
- **Done when:** `pnpm docs:check`, `pnpm rules:status --phase 2`, the contract coverage and the whole test run are green.
- **Depends on:** U3, U4, U5, U6, U7, U8
- **Size:** M
- **Risk area:** none
- **Status:** todo

## Checkpoints
- **Mode:** grouped, seven checkpoints (one by one 10, grouped 17, all at once 0; with more than four units the one-by-one points are added to grouped, whose own points are 7)
- **Signals:** N 9, L 2,000, R 4, Fd 3, C 6, P 1
- **C1** after U2 (reviews U1 and U2): a migration, and the foundation of U3, U5 and U7
- **C2** after U3: who sees which volunteer, and the foundation of U4, U6 and U8
- **C3** after U4: a migration, a new permission and a rule with no example in the repository
- **C4** after U5: who sees which beneficiary
- **C5** after U6: many files, before the screens are built on them
- **C6** after U8 (reviews U7 and U8): the screens
- **C7** after U9: end; the whole branch through `ae-check` and the full run

## Verification
- `pnpm lint`, `pnpm typecheck`, `pnpm docs:check`
- `pnpm test`
- `pnpm --filter @css/api authz:matrix`, then the matrix test
- `pnpm --filter @css/api contract:coverage`
- with `pnpm --filter @css/api e2e:server` running: `CONTRACT_API_URL=http://127.0.0.1:4100 pnpm --filter @css/web test:contract` (before every pull request; it was missed once on 2026-11-19)
- `pnpm --filter @css/api perf:lists` on `css_erp_perf` as an RPM and as an Executive
- `pnpm e2e`
- `pnpm rules:status --phase 2`

## Risks and rollback
- **People an official needs fall out of sight.** After the release an RPM or an Executive sees far fewer people than the day before, and nobody of a closed project's area. The extra area (U4, U8) is the answer the owner chose; the release note says so, and the Head can give a division in a minute. The two parts ship together for this reason (see below).
- **A reach too wide by mistake.** Every list is read through one scope function per entity; the tests list each role against people inside and outside its reach, and the authorization matrix is regenerated. Default deny holds: a person with no area gets an empty list, never the whole country.
- **Slow lists.** The scoped beneficiary list asks through applications; it is measured on two million profiles before the pull request, and an index is added only on evidence.
- **Migrations.** Two new tables, each with a `down.sql`; no existing row is changed and no column is dropped. A rollback of the code alone leaves two unused tables.
- **The catalogue.** `reference:sync` adds the new permission and changes no stored panel row; the changed defaults take effect at the next request. Reverting the catalogue restores the nationwide tabs.

## Shipping
One pull request into `develop` after C7, because the narrower reach (U3, U5) without the extra areas and their screen (U4, U8) would leave officials with no way to see people they need. The owner then runs `pnpm db:migrate` (two migrations) and `pnpm db:seed --set demo`.

## Definition of done
- R1 to R15 are met and each has a test at the layer named in its unit.
- The decision is in `docs/DECISION_LOG.md`; BR-020, BR-036 and BR-185 say what the system does; RBAC.md, the OpenAPI contract, the authorization matrix, the schema documents, SCREENS.md and the UAT scripts are updated in the same change.
- Every command under Verification was run and its result is in `docs/STATUS.md`.

## Progress
- **Branch:** `feat/area-scoped-people`
- **Updated:** 2026-11-22
- **Next:** checkpoint C2 over U3, then U4: the extra areas of a person (API), starting with its migration and `apps/api/test/integration/migrations.test.ts`
- **Reviewed through:** C1 at `0e8b8a5c`
- **Uncommitted:** none
- **Notes:** U3: for the entity `volunteer` the scope's resolution keeps only the areas of projects at work and turns a program or a project into those areas, so `volunteerWhere` compares address columns alone (the relation form took 695 ms at p95 for a PM's counts on css_erp_perf, the plain form 93 ms). The export of the volunteer list read no scope before and reads it now. An official's own photo is open to every official by its own rule (BR-290), since it used to ride on the tab's GLOBAL grant. The test world's projects are drafts unless `accessWorld(..., { atWork: true })`. The demo seed gained the active project IFT (areas for both RPMs, places for the Executive and the Official দায়ী), which U9 extends with districts and extra areas; `perf:seed` on a kept data set runs the seed again. `apps/api/.env` of this worktree still holds the earlier storage names, so `perf:lists` ran with `--env-file=.env.example`. The whole `pnpm e2e` after U3: 262 passed, 8 failed, of which 6 passed alone (waits under load), `projects.spec.ts` "a session opens in its frame" was fixed (the pointer rested on a card that turned over) and "a PM chooses the application form from the ready forms" is the known issue of a whole local run. C1: the people of a project stay placed by its areas. An area of the scope carries `within` for a district of a staff place; an assignment of a volunteer is always stored on the project's area (`assign` reads the project's areas, never the caller's), and `assignmentsIn` of `access/scope.ts` gives a district the assignments of its area whose volunteer lives there (the project's volunteer list, the user filter, the work figures). The answer of a change of a staff place is filtered as the staff list is. Left open for Phase 3: the files of an expense claim are placed by the assignment's region alone (`files/records.ts`), so a person with districts does not reach them yet. U2: a district that is taken from a place is ended (`ended_at`), never deleted; the districts are replaced with a new operation, `PUT /project-staff/{assignmentId}/districts`, since a staff place had no update before; the reach of a place is tested through `AccessService.scopeOfUser` in `project-setup.test.ts`. The decision is D-189; the new rules are BR-324 to BR-327. The second part of the Admin role plan (`docs/plans/2026-11-19-1000-feat-admin-role-and-permissions-plan.md`, units 7 to 10) waits for this plan, on the owner's word.
