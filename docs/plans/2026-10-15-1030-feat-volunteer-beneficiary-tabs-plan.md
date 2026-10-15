---
title: Volunteer tab and beneficiary tab (T1.10)
type: feat
status: in-progress
doc_review: 2026-10-15
source: brainstorm
date: 2026-10-15
---

# Volunteer tab and beneficiary tab (T1.10)

## Goal
An official opens one nationwide list of volunteers and one of beneficiaries, narrows them with filters and a search, sees the counts for what is shown, and opens a person's profile. Protected details (NID, bank, ratings and categories) appear only for those allowed to see them. Volunteers never reach either list.

## Problem
Today the officials have only the T1.9 registration queue: there is no place to see every volunteer or beneficiary, filter them by area, project or state, or open an official's view of a person (MASTER_SPEC A5 "volunteer tab", A7 "beneficiary 360° profile and beneficiary tab"; SCR-042, SCR-043, SCR-044, SCR-045 shell). Later modules (projects, applications, ratings, dawah) need these screens as their home.

## Requirements

### Volunteer tab (SCR-042)
- **R1** The volunteer tab lists every volunteer nationwide in every state (pending, active, blocked, deactivated), page by page, for each official holding `volunteer.view_all`: Department Head, Monitoring Team, PM, RPM, Project Executive, Official দায়ী, Implementer. It works on a 360 px phone (cards) and on a desktop (table).
- **R2** Filters: division → district → upazila → union, type, state, project, category, and blocklisted.
  - The category filter covers A/B/C/D and the inactive flag. It exists only for callers with `volunteer.rating.view`; anyone else sending it gets 403 on the list and on the statistics, and the screen does not offer it.
  - A filter on rating scores comes with the ratings in Phase 5.
  - The filters combine. The URL keeps them, so a reload or a shared link shows the same view. The search term is never written to the URL (owner decision).
- **R3** Search by name or mobile number is open to everyone with the tab. Search by NID works only for a caller holding `volunteer.view_sensitive`, and finds only volunteers inside that caller's sensitive scope; for anyone else an NID never matches (the list must not reveal whose NID it is).
- **R4** A statistics header shows volunteers and applications. Every number follows the filters in use.
  - Volunteers: total, active, pending, blocked, and deactivated (the account state).
  - Callers with `volunteer.rating.view` also see the inactive count (the category flag of BD-40).
  - Applications: total, approved, under review. These are 0 until applications exist in Phase 2.
- **R5** Each row shows the photo, the name, the type, the district and upazila, the projects and a state badge. Category and rating appear only for callers with `volunteer.rating.view`; for others the server does not send them at all.
- **R6** Pending registrations are part of the tab: the "pending" state filter (with a shortcut) shows them, and their profile offers the existing approve and request-correction actions. An action appears only when the caller may take it on that volunteer (in scope); the server refuses it otherwise.
- **R7** The volunteer part of the T1.9 registration page moves into the tab (owner decision). Staff registrations and edit requests keep their own small pages. An old link to the volunteer registration list or detail opens the matching place in the tab.

### Volunteer profile (SCR-043)
- **R8** The official's volunteer profile has these sections:
  - identity: name, parents, NID and both NID photos only with `volunteer.view_sensitive` in scope; date of birth and blood group under `volunteer.identity`; bank under `volunteer.bank`
  - address, education, profession and skills, read only, as on the own profile
  - projects and permission sets, read only, with "not in any project yet" when empty
  - team: the members registered with this volunteer's NID as reference, read only, showing only each member's name, type and state
  - work summary: a placeholder until Phase 5
  - ratings and category: only with `volunteer.rating.view`, read only, empty until Phase 5
  - blocklist: block and unblock with a reason, for callers with `volunteer.block` / `volunteer.unblock` in scope; the reason shows only under the blocklist field class
  - device sessions: the volunteer's sessions, seen and revoked by callers with `session.revoke_user` in its scope
  - the NID photos follow the same per-record rule when fetched directly through the file route: a Dhaka RPM gets 404 for a Rangpur volunteer's NID photo (owner decision; this closes a gap in today's file route)

### Beneficiary tab and 360° shell (SCR-044, SCR-045 shell)
- **R9** The beneficiary tab lists every beneficiary nationwide, page by page, for each holder of `beneficiary.view_all`, following its default scopes: the officials GLOBAL, the Media Team GLOBAL with a limited view (R18), the Procurement Team only the beneficiaries of house-construction projects in its scope.
- **R10** The same filter pattern applies: area cascade, beneficiary type, project, year, and blocklisted. Search by name for everyone. Search by mobile number needs the contact details (R18). Search by NID or birth-registration number needs `beneficiary.view_nid`, and works only inside that scope (as R3).
- **R11** A statistics header shows the total, those assisted this year, and the blocklisted, all following the filters.
- **R12** The 360° profile shell shows these sections:
  - basic data and address
  - projects by year
  - application history
  - distribution and implementation
  - dawah
  - follow-ups
  - activity history

  Each section shows real data where it exists and an empty state otherwise. The NID and birth registration appear only with `beneficiary.view_nid` in scope.

- **R18** The Media Team and the Procurement Team get a limited view of beneficiaries, and the server removes everything else (owner decision).
  - Media Team: the name, the area down to the upazila, the projects with their year, and distribution and implementation.
  - Procurement Team: for beneficiaries of its house-construction projects, the name, the address, and that project's sections.
  - Neither team receives the mobile number, the NID, the call log, the follow-ups, dawah or the activity history, in the list or in the 360° profile.

### Both tabs
- **R19** The list, statistics and profile calls are limited per user (60 a minute, then 429), and every query of them stops after 5 seconds (owner decision).
- **R13** Volunteers, team members and paid volunteers never see the tabs: no menu entry, and every list, statistics and profile endpoint answers 403 to them. The authorization matrix covers every new endpoint.
- **R14** Field protection is applied by the server in lists, profiles and statistics alike, never only hidden in the screen.
- **R15** The admin area opens for every official role holding one of the two permissions; each role sees only the entries it may use. This includes Official দায়ী, Implementer, Media Team and Procurement Team.
- **R16** A separate test database is filled with 50,000 volunteers and 2,000,000 beneficiaries (owner decision). There, every list page and statistics call, unfiltered and with each filter, is measured and the numbers are reported. Target: 300 ms on the server for one page. The demo seed stays unchanged.
- **R17** All text is in bn and en, digits are English, and both tabs and both profiles work at 360 px without sideways scroll.

## Scope
- In: the two lists with filters, search and statistics; the volunteer profile for officials; the beneficiary 360° shell; moving the volunteer registration queue into the tab; the admin entries for the extra official roles; the performance measurement with the large data set.
- Out (not now):
  - exports (T2.8)
  - assigning volunteers to projects and permission sets (T1.12)
  - application transfer (T2.6; no button until then)
  - rating and category editing and the real work summary (Phase 5)
  - beneficiary creation, NID lookup and profile merge (T2.2)
  - the volunteer activity history

## Key decisions
- **The tab takes over the volunteer registrations** (owner, 2026-10-15): pending registrations live in the volunteer tab under the "pending" state; staff registrations and edit requests keep their own pages. Governs R6, R7.
- **Statistics now show today's data plus the application counts** (owner): people counts now, application counts 0 until Phase 2, all following the filters. Governs R4, R11.
- **Rating filter in Phase 5** (owner): ratings are per project and per kind of work and do not exist before T5.3; the category filter is built now. Governs R2.
- **NID search only with the NID permission, inside its scope** (owner): name and mobile search for everyone with the tab. Governs R3, R10.
- **Performance measured on 50,000 volunteers and 2,000,000 beneficiaries** (owner; the recommendation was 20,000 and 200,000), in a separate test database, never the demo seed. Governs R16.
- **Visibility follows `permissions.yaml` as it stands**: `volunteer.view_all` and `beneficiary.view_all` give the lists; `volunteer.view_sensitive`, `beneficiary.view_nid`, `volunteer.rating.view` and the field classes give the protected parts. No permission or default changes. Governs R1, R5, R8, R9, R14.
- **Doc review answers** (owner, 2026-10-15):
  - NID photos follow the per-record rule in the file route too (R8).
  - The Media and Procurement Teams get a limited beneficiary view (R18).
  - A category filter without the rating permission is refused (R2).
  - The search term stays out of the URL (R2).
  - "Deactivated" and "inactive" are counted separately (R4).
  - Lists, statistics and profiles get a request limit and a query time limit (R19).
- These decisions are recorded in DECISION_LOG as O-67 before implementation starts.

## Open questions
- **Base branch:** PR rajuofficialasf-hub/charity_ERP#1 (T1.9f) is not merged into `main` yet. T1.10 starts from `main` once it is merged, otherwise from `feat/volunteer-form-refine`.

<!-- How (ae-plan) -->

## Technical decisions
- **Stack profile unchanged** (ST-40…ST-45, CLAUDE.md "Stack profile"): Express 5 `defineRoute`, Prisma 7 on PostgreSQL 17, the React 19 SPA with `packages/ui`. Nothing is added to the stack; the large data set uses plain SQL (`generate_series`) through the existing Prisma client.
- **Contract first, then code** (NFR-54, API_STANDARDS §16): the routes implement operations already in `docs/api/openapi.yaml` (`volunteers.volunteer.list`, `volunteers.volunteer.get`, `beneficiaries.beneficiary.list`, `beneficiaries.beneficiary.get`) and add two (`volunteers.volunteer.statistics`, `beneficiaries.beneficiary.statistics`). The beneficiary list gains the query parameters `divisionId`, `type` and `year`. All changes are additive. The drift test proves code and contract are equal.
- **Two answers per tab, a page and its counts.** The list stays a keyset page (`core/pagination.ts`, totals capped at 10,000 per API_STANDARDS). The statistics endpoint takes the same filters and answers exact counts. Both use one shared `where` builder per entity, so a filter can never mean two things.
- **Counts are live, with no counter table** (constitution: simplest adequate architecture): `count(*) FILTER (WHERE …)` in one aggregate query per tab. Application counts read `applications`, which stays empty until Phase 2. U9 measures this. A counter table is planned only if a count misses the target, and then as a recorded decision.
- **Protected details are decided per record, from `permissions.yaml` as it stands** (O-62, RBAC.md 6 and 8):
  - The list routes are GLOBAL through `*.view_all`.
  - NID, the NID photos, date of birth, blood group and bank leave the server only when two things hold:
    - the field class is visible to the caller (`field-mask.ts`)
    - the record lies inside the caller's scope for `volunteer.view_sensitive` (or `beneficiary.view_nid`)

    A global role holds both.
  - Which fields count:
    - The identity fields (NID, both NID photos, date of birth, blood group) need the `volunteer.identity` class and the `volunteer.view_sensitive` scope.
    - Bank needs the `volunteer.bank` class and the same scope.
    - The category and the inactive flag (BD-40) need the `volunteer.rating` class.
  - The list never carries NID or bank. The profile asks the scope handle of the sensitive permission for that one record.
  - `FilesService.mayView` (`apps/api/src/services/files.ts`) decides `nid_photo` the same way, so a file id alone opens nothing outside that scope.
  - This is recorded as D-094. It is the existing yaml rule applied to a GLOBAL list. The T1.9 registration detail did not need it because that route was already limited by scope.
- **Search** (owner decision O-67):
  - A term of digits only matches the exact mobile number. For callers holding `volunteer.view_sensitive` / `beneficiary.view_nid` it also matches the exact NID or birth registration, filtered by that sensitive scope.
  - Any other term is a case-insensitive name match. Names use pg_trgm: beneficiaries already have the GIN index, and U9 adds one on `users.display_name`.
  - Terms under 2 characters are ignored (`searchWhere`).
- **Actions as server-decided flags.** The volunteer profile answers `actions: { approve, requestCorrection, block, unblock, viewSessions, revokeSessions }`. Each flag is true only when the caller holds the permission with this volunteer inside its scope, computed with the same scope handles the action routes use. The screen shows a button only for a true flag; the routes still enforce. This is a new pattern: no per-record capability exists yet.
- **Limited beneficiary view through field classes** (R18):
  - `permissions.yaml` gains three classes, each with its exact fields:
    - `beneficiary.contact`: the mobile and the family members. Visible to PM, RPM, Project Executive, Implementer and Official দায়ী.
    - `beneficiary.address_detail`: the union, the village, the post office and post code, the landmark and the GPS position. Visible to the same officials and to the Procurement Team.
    - `beneficiary.care`: call logs, follow-up evaluations, dawah attendance, progress and exams, the activity history, and the blocklist status (`is_blocked`, its filter and its count). Visible to the same officials as `beneficiary.contact`.
  - What each team receives follows from these classes:
    - The Media Team holds none of them, so it gets the name, the division, district and upazila, the projects with their year, and distribution and implementation.
    - The Procurement Team holds only `beneficiary.address_detail`, so it gets the name, the full address and its projects' sections.
  - The response schemas mark those fields and sections, and the field mask removes them. No role check sits in the service.
  - This is a permissions.yaml change, recorded with O-67; the yaml checks of `pnpm docs:check` validate it.
  - The search and the filters never reveal a masked field:
    - Exact mobile search needs `beneficiary.contact`, as NID search needs `beneficiary.view_nid`.
    - The blocked filter and the blocked count need `beneficiary.care`.
    - Union and village filters need `beneficiary.address_detail`.
    - A filter outside the caller's classes answers 403, as the volunteer category filter does.
- **Rate limit and query time:**
  - A new limiter class `list` (60 calls a minute per user) in `apps/api/src/rate-limit/` for the list, statistics and profile routes.
  - Their queries run in a transaction with `SET LOCAL statement_timeout = '5s'`. A timeout answers 503 `server.busy` with the localized message.
  - The limit is per user, and the route keeps the existing per-IP `default` chain as well. Only officials reach these routes, and accounts are created only by approval. The store is the existing in-process store, because there is one API process (NE-SEC-04 reason).
- **Beneficiary scope helper:** `beneficiaryWhere(scope)` in `access/scope.ts`, next to `volunteerWhere`.
  - GLOBAL gives `{}`.
  - PROJECT (Procurement Team) gives the beneficiaries with an application in a project of the scope. The condition `house_construction_project` is part of this branch: a project of another type inside the scope does not count.
  - The area scopes use the address columns, as D-084 does for volunteers.
- **The volunteer registrations move into the tab** (O-67):
  - `/admin/registrations` keeps only the staff registrations; the edit requests and the handover page stay where they are.
  - The old volunteer links redirect:
    - `?kind=volunteer` goes to `/admin/volunteers?state=pending`
    - `/admin/registrations/:userId` of a volunteer goes to `/admin/volunteers/:volunteerId`, using a `volunteerId` field on the pending detail answer (added if missing)
  - The approve, correction and block dialogs of T1.9 are moved and reused, not rebuilt.
- **The search term in the API request:** the list calls are GETs with the term in the query string. The pino request serializer already logs the path without the query (`core/logging.ts`). A test pins that no logged line holds the term. DEPLOYMENT.md gains the rule that the reverse proxy logs paths without query strings (the Caddy config of T3.0).
- **Filters live in the URL, the search does not:** `useSearchParams` of React Router 8 for the filters; the search term stays in component state. This is the first admin page to do so (react.md: server state in TanStack Query, view state in the URL).
- **Plain `CREATE INDEX`, not CONCURRENTLY** (DB-MIG-06 is a SHOULD): Prisma runs migrations in a transaction, and production has a few thousand users. The lock lasts seconds, so the reason is recorded here instead of a hand-split migration.
- **Large data in its own database** (owner decision O-67; production data never in tests):
  - The database is `css_erp_perf`, which `config/db-guard.ts` allows next to `css_erp_dev` and `css_erp_test`.
  - `scripts/perf-seed.ts` fills it with fake values only: the `@css/shared` fakes and the free NID range. The users have no password hash and no session, so none can sign in.
  - The guard refuses `css_erp_perf` when `NODE_ENV=production`; the database exists only on a developer machine or in CI.
  - `scripts/perf-lists.ts` measures it through the real services.
  - The demo seed and the test template are untouched.

## Implementation units

### U1. Decisions, rules and contract
- **Goal:** the decisions and the contract exist before any code.
- **Requirements:** R1–R17 (documents)
- **Files:**
  - `docs/DECISION_LOG.md`: O-67 for the owner's answers, D-094 for the protected details per record
  - `docs/BUSINESS_RULES.md`:
    - BR-250: search by NID only inside the sensitive scope
    - BR-251: protected details decided per record in nationwide lists
    - BR-252: volunteers never reach the tabs
  - `docs/api/openapi.yaml`:
    - the two new statistics operations
    - the beneficiary list parameters `divisionId`, `type` and `year`
    - the response schemas of the four existing operations (VolunteerRow, VolunteerList, VolunteerStatistics, VolunteerProfile with `actions`, BeneficiaryRow, BeneficiaryList, BeneficiaryStatistics, BeneficiaryProfile)
    - `server.busy` (503), with the error code also added to API_STANDARDS and both catalogues
  - `docs/security/permissions.yaml`: the classes `beneficiary.contact` and `beneficiary.care`; `docs/security/RBAC.md`: the per-record rule and the two classes
  - `docs/ui/SCREENS.md`: SCR-042, SCR-043, SCR-044, the SCR-045 shell, and SCR-040 narrowed to staff
- **Approach:** the new O-67 and D-094 entries follow the format of the existing O-66 and D-093 entries (which stay untouched). The schemas follow `OwnVolunteerProfile` and the registration detail in openapi.yaml.
- **Tests:** none (documents); `pnpm docs:check` passes.
- **Done when:** docs:check passes and the owner's answers are in the log.
- **Depends on:** none · **Size:** S · **Risk area:** none · **Status:** done

### U2. Per-record access: sensitive scope, action flags, beneficiary scope
- **Goal:** one place answers "may this caller see the protected details of this record" and "may this caller do X to this record".
- **Requirements:** R3, R6, R8, R9, R10, R12, R14, R18, R19
- **Files:**
  - `apps/api/src/access/service.ts`:
    - `sensitiveScope(principal, permission, entity)` returns a scope handle or null
    - `allowedOn(principal, permissions, entity, recordWhere)` returns the flags
  - `apps/api/src/access/scope.ts`: `beneficiaryWhere`
  - `apps/api/src/services/files.ts`: `mayView` decides `nid_photo` through `sensitiveScope`
  - `apps/api/src/rate-limit/` (the `list` class) and `apps/api/src/core/` (a helper that runs a read inside a transaction with the 5 s statement timeout)
  - tests: `apps/api/src/access/scope.spec.ts`, the service spec, `apps/api/test/integration/access-scope.test.ts`
- **Approach:** `AccessService.scopeFor` and `findUser` in `apps/api/src/access/service.ts`; `volunteerWhere` in `scope.ts` for the area branches (D-084).
- **Tests:**
  - unit:
    - `beneficiaryWhere` for GLOBAL, REGION, DISTRICT, PROJECT (house construction only) and SELF (nothing)
    - the flags for a caller with and without each permission
  - integration:
    - the Dhaka RPM's sensitive scope includes a Dhaka volunteer and excludes a Rangpur one
    - a Project Executive without `if_rpm_grants` gets no extra flags
    - a volunteer gets no scope at all
    - the Procurement Team reaches only beneficiaries of a house-construction project
    - files: the Dhaka RPM gets 404 for a Rangpur volunteer's NID photo by id, 200 for a Dhaka one; an Official দায়ী gets 404 for every NID photo; the own photo still opens for its owner
    - the `list` limiter answers 429 after 60 calls in a minute; a query over 5 s answers 503 `server.busy` (a test-only route sleeping with `pg_sleep`)
  - existing: covered by `apps/api/src/access/scope.spec.ts` and `apps/api/test/integration/access-scope.test.ts` (extend them, do not duplicate).
- **Done when:** the tests pass and the authorization matrix is unchanged.
- **Note:** `registration-photos.test.ts` and `edit-requests.test.ts` cover the file route today (extend them, do not duplicate).
- **Depends on:** none · **Size:** L · **Risk area:** auth · **Status:** done

### U3. Volunteer list and statistics API
- **Goal:** `GET /volunteers` and `GET /volunteers/statistics` with the filters, the search and the counts of R2–R5.
- **Requirements:** R1, R2, R3, R4, R5, R13, R14
- **Files:**
  - `apps/api/src/routes/volunteers.ts`
  - `apps/api/src/services/volunteers.ts`: list, statistics and the shared `listWhere`
  - `packages/shared/src/volunteers/`: the query schema, the row and the statistics types
  - `docs/api/openapi.yaml`
  - `apps/api/test/integration/volunteer-list.test.ts`
  - `docs/security/AUTHORIZATION_MATRIX.md` (regenerated)
- **Approach:** `RegistrationsService.list` in `apps/api/src/services/registrations.ts` (keyset paging, `searchWhere`, the scope where). Its private `pendingWhere` is not shared: the volunteer `listWhere` is a new exported function in `services/volunteers.ts`, and the registration list keeps its own. The row schema marks `category` and `inactiveFlag` with `sensitive(…, 'volunteer.rating')`, as `routes/volunteer-details-schema.ts` does for the identity fields.
- **Tests:**
  - integration:
    - every filter alone and combined: the area cascade, type, state including pending, project, category, blocked
    - paging with the cursor; a limit over 100 is refused (422)
    - name search; mobile search on 11 digits
    - NID search:
      - finds a Dhaka volunteer for the Dhaka RPM, not a Rangpur one
      - finds nothing for an Official দায়ী, who has no `volunteer.view_sensitive`
    - `category` is absent for a role without the rating class and present for the Monitoring Team
    - a `category` filter from an Official দায়ী answers 403 on the list and on the statistics
    - the inactive count appears only with the rating class
    - the statistics follow each filter and count applications by status (none today; one inserted test application is counted)
    - a volunteer, a team member and a paid volunteer get 403 on both
    - both answer no-store and use the `list` limiter
  - unit: the query schema refuses a bad uuid and an unknown state.
- **Done when:** the tests and the drift test pass; the matrix lists both operations.
- **Depends on:** U2 · **Size:** L · **Risk area:** personal data · **Status:** todo

### U4. Volunteer profile API for officials
- **Goal:** `GET /volunteers/:volunteerId` with the sections of R8 and the action flags.
- **Requirements:** R6, R8, R13, R14
- **Files:**
  - `apps/api/src/routes/volunteers.ts`
  - `apps/api/src/services/volunteers.ts`: the profile
  - `apps/api/src/services/volunteer-details.ts`: reuse the view of the own profile
  - `apps/api/src/services/registrations.ts`: `volunteerId` on the pending detail if missing
  - `apps/api/test/integration/volunteer-profile.test.ts`
- **Approach:** `detailsView` and the own profile in `apps/api/src/services/volunteer-details.ts`.
  - Projects come from `project_volunteers`, with the permission set name.
  - The team comes from `volunteer_teams`: the lead's members not removed, with only name, type and state.
  - The blocklist comes from the active `blocklist` row, with the reason under its class.
  - Sessions are not embedded. The existing `GET /users/:userId/sessions` serves them, and a flag says whether the caller may call it.
- **Tests:**
  - integration:
    - NID, the NID photo ids, date of birth, blood group and bank:
      - present for the Dhaka RPM on a Dhaka volunteer, absent for the same RPM on a Rangpur volunteer
      - present for the Monitoring Team everywhere
      - absent for an Official দায়ী
    - category only with the rating class; the blocklist reason only with its class
    - the flags:
      - approve and request correction true only on a pending volunteer in scope
      - block in scope; unblock only when blocked
      - view and revoke sessions only where `session.revoke_user` reaches (the Dhaka RPM on a Dhaka volunteer, the Monitoring Team everywhere); the flag and `GET /users/:userId/sessions` agree
    - the team section carries no NID, mobile or bank of a member
    - an unknown id gives 404; a volunteer asking for another volunteer gets 403; no-store
- **Done when:** the tests pass.
- **Depends on:** U2 · **Size:** L · **Risk area:** personal data · **Status:** done

### U5. Beneficiary list, statistics and 360° API
- **Goal:** `GET /beneficiaries`, `GET /beneficiaries/statistics` and `GET /beneficiaries/:beneficiaryId` (R9–R12).
- **Requirements:** R9, R10, R11, R12, R13, R14, R18, R19 (the files list adds `docs/security/permissions.yaml` and `docs/ops/DEPLOYMENT.md` through U1)
- **Files:**
  - `apps/api/src/routes/beneficiaries.ts` (a new router, registered in `apps/api/src/app.ts`), `apps/api/src/services/beneficiaries.ts`, `apps/api/src/container.ts`
  - `packages/shared/src/beneficiaries/`: the query schema and the types
  - `docs/api/openapi.yaml`
  - `apps/api/test/integration/beneficiary-list.test.ts`, `apps/api/test/integration/beneficiary-profile.test.ts`
- **Approach:** the volunteer list of U3.
  - The filters:
    - type is `class_code`
    - the project and the year come through `applications` and the project's `year`
    - blocked is `is_blocked`
  - The 360° sections and their sources, each a short list (the latest 20), an empty array when nothing exists:
    - projects by year: `applications` with project and year
    - application history: `applications` and `workflow_transitions`
    - distribution and implementation: `distributions`, construction stages, site verifications
    - dawah (`beneficiary.care`): `class_attendance`, `learning_progress`, `exam_results`
    - follow-ups (`beneficiary.care`): `call_logs`, `followup_evaluations`
    - activity history (`beneficiary.care`): `activities`
  - Every section query also goes through `beneficiaryWhere`.
  - For a PROJECT-scoped caller, the section rows themselves are also filtered by the projects of the scope, so the Procurement Team sees only the rows of its house-construction projects, never the beneficiary's other projects.
  - NID and birth registration fall under `beneficiary.nid`, decided per record through the sensitive scope of U2.
- **Tests:**
  - integration:
    - the filters and the cascade
    - name search through trigram; exact mobile search
    - NID and birth-registration search only inside the `beneficiary.view_nid` scope
    - the Media Team sees the list and the profile without NID, mobile, address line, family, dawah, follow-ups and activity history, but with the name, the area to the upazila, the projects and distribution
    - the Procurement Team sees the name and the full address of its house-construction beneficiaries, and no `beneficiary.care` section or mobile
    - a beneficiary with a house-construction application and an application in another project: the Procurement Team sees only the first in every section
    - a non-house project inside the Procurement Team's scope does not reach its beneficiaries
    - the Media Team gets no union, village or mobile; its mobile search finds nothing; its blocked filter answers 403
    - the statistics of the Procurement Team count only its house-construction beneficiaries; the Media Team's statistics have no blocked count
    - the request log of a search holds no search term
    - the Procurement Team sees only the beneficiaries of a house-construction project in its scope, and gets 404 for the others
    - the statistics follow the filters; "assisted this year" counts an application at approved or later in a project of the current year
    - every 360° section is an empty array for a new beneficiary and lists a seeded application
    - volunteers get 403; no-store
- **Done when:** the tests and the drift test pass; the matrix lists the three operations.
- **Depends on:** U2 · **Size:** L · **Risk area:** personal data · **Status:** done

### U6. Admin access and the volunteer tab screen
- **Goal:** every official role with a view permission reaches the admin area, and `/admin/volunteers` shows the list, the filters (kept in the URL), the search and the statistics.
- **Requirements:** R1, R2, R3, R4, R5, R6, R13, R15, R17
- **Files:**
  - `apps/web/src/admin/roles.ts`: `VOLUNTEER_TAB_ROLES`, `BENEFICIARY_TAB_ROLES`, `canOpenAdmin` from both
  - `apps/web/src/admin/navigation.ts`
  - `apps/web/src/routes/index.tsx`: lazy routes
  - `apps/web/src/admin/volunteers/`: `VolunteersPage.tsx`, `VolunteerFilters.tsx`, `StatisticsBar.tsx`, `volunteers-api.ts`, `volunteers.test.tsx`
  - `apps/web/src/admin/AreaFilter.tsx`: the division → union cascade, shared with U8
  - the catalogue `packages/shared/src/i18n/messages/{bn,en}/admin.json`; MSW handlers in `apps/web/test/msw/`
- **Approach:** `apps/web/src/admin/registrations/RegistrationsPage.tsx` (Table, TanStack Query, `registrations-api.ts`); `Table`, `TableToolbar`, `FilterChip` and `TablePagination` of `packages/ui`, with cards on phones; the location cascade of `features/registration/AddressFields.tsx`.
- **Tests:**
  - component (MSW):
    - each filter changes the request and the URL, and a reload with that URL restores the filters
    - a typed search goes into the request but never into the URL
    - the category filter is offered only to a role with the rating permission
    - the "Pending" shortcut sets `state=pending`; the search sends the term
    - the statistics show the counts of the answer in English digits
    - no category column when the answer has no category
    - cards at phone width; axe passes
    - the admin menu shows "Volunteers" for an Official দায়ী and an Implementer, and "Beneficiaries" for the Media Team
    - a volunteer opening `/admin/volunteers` sees the forbidden content
  - existing: covered by `apps/web/src/admin/admin.test.tsx` and `roles.test.ts` (update them for the new roles).
- **Done when:** the tests pass.
- **Depends on:** U3 · **Size:** L · **Risk area:** none · **Status:** done

### U7. Volunteer profile screen and the registration move
- **Goal:** `/admin/volunteers/:volunteerId` with the sections of R8 and the actions its flags allow; the volunteer part of `/admin/registrations` moves to the tab.
- **Requirements:** R6, R7, R8, R17
- **Files:**
  - `apps/web/src/admin/volunteers/`: `VolunteerProfilePage.tsx`, `ProfileSections.tsx`, `VolunteerSessions.tsx`, `volunteer-profile.test.tsx`
  - `apps/web/src/admin/registrations/`: `RegistrationsPage.tsx` and `RegistrationDetail.tsx` (staff only, plus the redirects), `registrations.test.tsx`
  - the catalogue files
- **Approach:** the read-only values reuse `features/account/DetailValues.tsx` (ProfessionText, SkillsText, EducationText, PermanentAddressText) and `components/FileImage.tsx`. The approve, correction and block dialogs move from `admin/registrations/` (`CorrectionDialog.tsx`, `Blocklist.tsx`). Sessions use the existing `GET /users/:userId/sessions` and its revoke.
- **Tests:**
  - component:
    - each section renders from the answer; NID and bank are absent when the answer has none
    - the "not in any project yet" empty state
    - a button only for a true flag: approve and correction on a pending volunteer, block or unblock, revoke a session
    - approve and the correction dialog send the existing requests
    - `/admin/registrations?kind=volunteer` and an old volunteer detail link land in the tab and the profile
    - the staff list still works; axe passes
  - existing: covered by `apps/web/src/admin/registrations/registrations.test.tsx` (the volunteer cases move to the new file; the staff and edit-request cases stay).
- **Done when:** the tests pass.
- **Depends on:** U4, U6 · **Size:** L · **Risk area:** none · **Status:** done

### U8. Beneficiary tab and 360° shell screens
- **Goal:** `/admin/beneficiaries` and `/admin/beneficiaries/:beneficiaryId`.
- **Requirements:** R9, R10, R11, R12, R17
- **Files:** `apps/web/src/admin/beneficiaries/` (`BeneficiariesPage.tsx`, `BeneficiaryProfilePage.tsx`, `beneficiaries-api.ts`, `beneficiaries.test.tsx`), `apps/web/src/routes/index.tsx`, the catalogue files
- **Approach:** the volunteer tab of U6 (the shared `AreaFilter` and `StatisticsBar`); the 360° sections as cards with `EmptyState` of `packages/ui`.
- **Tests:**
  - component:
    - the filters and the URL; the type, year and project filters send their parameters
    - the statistics; no NID when the answer has none
    - each 360° section shows its empty state, and the application history lists rows
    - cards on a phone; axe passes
- **Done when:** the tests pass.
- **Depends on:** U5, U6 · **Size:** L · **Risk area:** none · **Status:** done

### U9. Large data set, measurement and indexes
- **Goal:** the measurements of R16, and the indexes they show are needed.
- **Requirements:** R16
- **Files:**
  - `apps/api/src/config/db-guard.ts` (allow `css_erp_perf`) and its spec
  - `apps/api/scripts/perf-seed.ts`, `apps/api/scripts/perf-lists.ts`, and the scripts `perf:seed` and `perf:lists` in `apps/api/package.json`
  - a migration `apps/api/prisma/migrations/<timestamp>_list_indexes/` with `migration.sql` and `down.sql`:
    - at least a GIN trigram index on `users.display_name`
    - others only where EXPLAIN shows a sequential scan under a filter
  - `apps/api/prisma/schema.prisma`
  - `docs/testing/PERFORMANCE.md` (new: method, data set, results per call), `docs/database/DATABASE_SCHEMA.md` (the indexes)
- **Approach:** no bulk-load script exists yet, so this is a new pattern.
  - One SQL statement per table with `generate_series` and the fake ranges.
  - Users and volunteers are spread over every union of the locations table, and so are the beneficiaries.
  - A few hundred projects and applications give the project and year filters work.
  - The measurement calls the services of U3 and U5 with a GLOBAL scope and with an RPM scope, 20 runs per case, and reports p50 and p95 with EXPLAIN (ANALYZE) of the slowest.
- **Tests:**
  - unit: the guard allows `css_erp_perf`, refuses it under `NODE_ENV=production`, and still refuses other names.
  - integration: the migration round trip in `migrations.test.ts`.
  - measurement: p95 under 300 ms for every list page and statistics call, or the miss is reported with its plan and a proposal (never a silent pass).
- **Done when:** PERFORMANCE.md holds the numbers; the migration is reversible; the demo seed and the tests are unchanged.
- **Depends on:** U3, U5 · **Size:** L · **Risk area:** migration · **Status:** done

### U10. E2E, documents, status
- **Goal:** the journeys run in a browser and the documents follow.
- **Requirements:** R1–R17
- **Files:** `apps/web/e2e/volunteers.spec.ts`, `apps/web/e2e/beneficiaries.spec.ts`, `apps/web/e2e/registration.spec.ts` (the approval journey now goes through the tab), `docs/STATUS.md`, `CLAUDE.md` (the repository map: `admin/volunteers`, `admin/beneficiaries`, `routes/beneficiaries.ts`, the perf scripts), `README.md` if commands change
- **Approach:** `apps/web/e2e/admin.spec.ts` and `registration.spec.ts`.
- **Tests:**
  - e2e:
    - signed in as `rpm.dhaka@example.org` (demo password), open "স্বেচ্ছাসেবক" in the admin menu; the heading "স্বেচ্ছাসেবক" and the statistics label "মোট" are visible
    - choose the district "ঢাকা" in the filter; the URL holds `districtId` and every row shows ঢাকা
    - the "অপেক্ষমাণ" shortcut lists the pending registration, and its profile shows "অনুমোদন করুন"
    - a Rangpur volunteer's profile shows no NID
    - the beneficiary tab filters by district and opens a 360° profile with its sections
    - a volunteer (`01700000111`) has no admin menu, and `/admin/volunteers` shows the forbidden page
    - no sideways scroll at 360 px; the whole suite twice
- **Done when:** `pnpm test` and `pnpm e2e` pass; STATUS names T1.10 done and T1.11 next.
- **Depends on:** U7, U8, U9 · **Size:** M · **Risk area:** none · **Status:** done

## Checkpoints
- **Mode:** grouped, with eight checkpoints. Scores: one by one 10, grouped 7, all at once 0. N is over 4, so one by one's points move to grouped (17).
- **Signals:** N 10, L 3,400, R 5, Fd 4, C 5, P 2
- **C1** after U2: the foundation of U3–U5, auth, and a new pattern (action flags)
- **C2** after U3: personal data, and the foundation of U6 and U9
- **C3** after U4: personal data
- **C4** after U5: personal data, and the foundation of U8 and U9
- **C5** after U6: the foundation of U7 and U8
- **C6** after U8: the size limit (U7 and U8 make 800 lines; U9 would pass 1,000)
- **C7** after U9: a migration and a new pattern (bulk data)
- **C8** after U10: end

## Verification
- `pnpm typecheck`, `pnpm lint`, `pnpm test --maxWorkers=3` (needs `docker compose up -d postgres minio mailpit`), `pnpm build`, `pnpm e2e`, `pnpm docs:check`, `pnpm --filter @css/api authz:matrix`
- `pnpm --filter @css/api perf:seed` and `perf:lists` (new in U9)
- A look at `/admin/volunteers`, a volunteer profile, `/admin/beneficiaries` and a 360° profile at desktop and 360 px, signed in as the Department Head, the Dhaka RPM, an Official দায়ী and the Media Team

## Risks and rollback
- **Data exposure:** the lists are nationwide, so a missed mask would leak NID or bank data across regions.
  - Guards: the per-record rule (D-094), field-mask tests per role and record, the authorization matrix, and the security reviewer at C2–C4.
  - Rollback: revert the route commits; nothing stored changes.
- **Migration:** U9 adds indexes only, and `down.sql` drops them. Building a GIN index locks the `users` table for a moment; production has few users.
- **Registration move:** reverting U7 brings the old page back; the T1.9 API routes stay as they are.
- **Performance:** if a count misses 300 ms on 2,000,000 rows, U9 reports it with the plan. A counter table or a capped count then becomes a new decision for the owner; neither is done silently.

## Progress
- **Branch:** `feat/volunteer-beneficiary-tabs` (from `feat/volunteer-form-refine`, because PR #1 with T1.9f was still open on 2026-10-15; rebase is not needed if PR #1 merges first)
- **Updated:** 2026-10-15
- **Next:** checkpoint C8 (U10, plus the whole-branch scripted checks), then finish (plan done, push, pull request)
- **Reviewed through:** C7 at cfd3e40
- **Uncommitted:** none
- **Notes:** U1: the openapi.yaml edits move to U3, U4 and U5, because the drift test compares each implemented operation with the code's zod schemas key by key; writing the schemas before the code would only be rewritten. O-67, D-094, BR-250 to BR-254, the three beneficiary field classes, `volunteers.inactive_flag` in `volunteer.rating`, `server.busy` and the Caddy log rule are in. U2: `AccessService.sensitiveScope`, `reaches`, `allowedOn`; `beneficiaryWhere` and `beneficiaryRowsProjectWhere` in scope.ts; the `house_construction_project` condition now resolves for the beneficiary entity (attached `project_staff` rows of projects whose workflow key is `construction`); `boundedRead` in `core/bounded-read.ts` (SET LOCAL statement_timeout, 57014 → `server.busy`); the `list` rate class (per IP 600, per user 60 a minute). The file route now refuses an NID photo outside the `volunteer.view_sensitive` scope; the earlier photo tests used an RPM without a region and were changed to a regional RPM. The 429 test of the `list` class moves to U3, the first route that uses it. C1 (logic, security, standards; no P0 or P1): the `list` class now shares one budget across its routes (`shared` windows), `reaches` refuses an entity without a rule, a transaction that cannot start in time (P2028) is `server.busy`, the timeout is set with `set_config` (bound parameter), and the file route checks an NID photo with one count. Kept: decision ids in comments follow the repo's `DECISION_LOG <id>` convention (the plugin's ORG-CMT-10 says no ids; CLAUDE.md and the existing code win, reported to the owner); `allowedOn` and `beneficiaryRowsProjectWhere` get their production callers in U4 and U5. U4 must take the user id of the action flags from the loaded volunteer row. C2 (no P0 or P1): the list pages by id (UUID v7) because a `created_at` cursor is cut to milliseconds and skips rows of one transaction (the registration list still sorts by `created_at`: a remaining issue for the shared pagination helper); the filter, the blocklist read and the NID scope run inside `boundedRead`; LIKE wildcards are escaped; a 401 test. The rate-limit test uses the real one-minute window (61 calls take about 2 seconds). U4: `GET /volunteers/:volunteerId` (`services/volunteer-profile.ts`); the team is the volunteers registered with this one as reference (`reference_volunteer_id`, as R8 says), not `volunteer_teams`; identity and bank leave out of the response outside the sensitive scope (optional schema fields); the action flags take the user id from the loaded row; the profile route must be registered after `/volunteers/me` and `/volunteers/statistics` (the matrix test caught `me` read as an id). The pending registration answer already carries `volunteer.id`, so U7's redirect needs no API change. C3 (no P0 or P1): the approve flag follows the approve route (not blocklisted, no correction pending), the correction flag needs no correction pending; the blocklist read is inside `boundedRead`; the team is filtered by the caller's scope and capped at 200, the ratings at 100. Kept outside the time limit: the access lookups (`load`, `sensitiveScope`, `reaches`), which are keyed reads of the caller's grants and one record. The distributions hang on `activities` (no beneficiary column): the beneficiary profile reads them through the application. U5: `GET /beneficiaries`, `/beneficiaries/statistics`, `/beneficiaries/:beneficiaryId` (`routes/beneficiaries.ts`, `services/beneficiaries.ts`, `@css/shared/beneficiaries`); the route scope is the entity `beneficiary` (the contract said `global`, which would refuse the Procurement Team's project grant); merged profiles are left out of the list; the tests are in one file `beneficiary-tab.test.ts` (not two) so the Procurement Team's projects are built once; distributions are the activities with a `distributions` row. The `/beneficiaries/:beneficiaryId` route will shadow `/beneficiaries/lookup` of T2.2 unless that one is registered first. C4 (security found two P1s, both fixed): the project and year filters of a project-scoped caller stay inside its own projects (they leaked who applied elsewhere); R18 is an allow-list, so two more classes hold back everything else: `beneficiary.profile_detail` (parents' names, gender, age, type, occupation, photo; the type filter needs it) and `beneficiary.application_history` (application numbers and dates; officials and the Procurement Team for its projects). Also: distributions in their own query, masked sections not read at all, merged profiles answer 404 until T2.2. Open for the owner: an audit entry for each profile read that sends an NID or a mobile (not in the audit list of the constitution §13). U6: `/admin/volunteers` (`admin/volunteers/VolunteersPage.tsx`, `volunteers-api.ts`, `admin/StatisticsBar.tsx`); the area filter reuses `AddressFields` (optional) instead of a new `AreaFilter`; there is no project list API yet (T1.11), so the project filter works through the URL and gets its picker with T1.11; the admin area opens for every role with a destination (`canOpenAdmin` now covers the beneficiary tab roles), so the registration pages check `canApproveRegistrations` instead. C5 (no P0 or P1): the page cursor belongs to the filters and search it was made for (a URL change from outside the tab used to keep it); a failed count shows an error with retry; each row shows the photo (R5); more tests for the filters, the clear action and the errors (429 in tests, because the query client retries 5xx with backoff). The beneficiary link in the sidebar leads nowhere until U8 adds its route (nothing is released between units). U7: `/admin/volunteers/:volunteerId` (`VolunteerProfilePage.tsx`, `VolunteerSessions.tsx`); a pending volunteer the caller may decide on opens as the existing review (the body of `RegistrationDetail` is now `RegistrationReview`, used by both), every other volunteer as the profile by section; `/admin/registrations` keeps the staff registrations (for staff approvers) and the edit requests (for edit approvers), so a PM no longer has that page (volunteers are reviewed in the tab); `?kind=volunteer` and an older volunteer detail link redirect into the tab; a decision returns to the tab with its message. U8: `/admin/beneficiaries` and `/admin/beneficiaries/:beneficiaryId` (`admin/beneficiaries/*`); the type filter offers the default list of BD-14 (labels in the catalogue, codes from the seed) until a reference-list API exists; `AddressFields` gained `levels` so the Media Team gets no union filter; the query-string helper of both tabs is shared (`admin/list-query.ts`); sections the server leaves out are not shown. C6 (no P0 or P1): both tabs share `admin/use-tab-view.ts` (filters in the URL, the search in state, the cursor tied to its view); the review inside the volunteer profile shows only the actions the server's flags allow, and a decision also refreshes the volunteer tab's cached lists; the profile queries do not run for a caller without the tab; the beneficiary tab never reads a filter from the URL that the role may not use (type and blocklist without the detail classes, union without the address class); more tests: the beneficiary profile's 404, error with retry and refusal without a request, a fixed clock for the year options, and the volunteer tab refreshed after an approval. U9: `perf:seed` builds `css_erp_perf` (migrations, locations, base and demo seed, then 50,000 volunteers, 2,000,000 beneficiaries, 300 projects and 500,000 applications by `generate_series`, about 6.5 minutes, ending with VACUUM ANALYZE); `perf:lists` calls the services directly (no HTTP, so the per-user rate limit does not interfere) with a Prisma client that logs the SQL, and explains the slowest statement of slow cases. The first run had three cases over 300 ms (both statistics calls); the volunteer counts became three grouped queries, the three beneficiary counts run in parallel bounded reads, and the migration `20261015000000_list_indexes` adds the trigram index on `users.display_name` plus two partial indexes on `beneficiaries` (live ids, blocked ids). All 68 cases are now under 300 ms at p95 (docs/testing/PERFORMANCE.md). The perf database address is derived from DATABASE_URL, so `.env` needs no change; the guard allows `css_erp_perf` and the seed refuses any other database. C7 (no P0 or P1): the parallel beneficiary counts held three pool connections per request and gave the counts different snapshots, so they went back to one bounded read and a fourth index (`applications (status, project_id, beneficiary_id)`, partial) makes the slow count read an index (p95 about 185 ms on one connection); the perf guard moved into `checkPerfDbAccess` (src/config/db-guard.ts, unit-tested): only a `css_erp_perf` database on this machine or the compose service, its name taken from the URL; a settings row written last marks the data set complete, so a run that stopped halfway is refused instead of being measured; the migration explains its write lock (small tables at deployment). Kept: the scripts read `process.env` like the other database scripts (`db-reset.ts`, `load-locations.ts`), not through the API's env schema; the `BR-`/`BD-` ids already in `db-guard.ts` follow the repo convention. U10: `e2e/volunteers.spec.ts` and `e2e/beneficiaries.spec.ts`; the approval journey of `registration.spec.ts` goes through the volunteer tab's pending chip. The E2E run found an app defect: after a correction request the server's approve and correction flags were both false, so the profile left the review and the confirmation vanished; the profile actions gained `review` (the caller decides on this pending registration even while a correction holds it), and the review shows approval and correction disabled in that state (web test added). `auth.spec.ts` now resets the Implementer's password, because the Media Team must sign in with the demo password for the limited view. On a desktop the area filters sit beside the list; on a phone they are in the filter sheet. The Bengali sample names of the measurement moved to `apps/api/seed/perf-data.ts` (the i18n check allows Bengali only in seed data).
