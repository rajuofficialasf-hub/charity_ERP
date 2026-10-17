---
title: Templates and copies, rules and consent, volunteer assignment, teams (T1.12)
type: feat
status: in-progress
source: brainstorm
date: 2026-10-17
doc_review: 2026-10-17
---

# Templates and copies, rules and consent, volunteer assignment, teams (T1.12)

## Goal
A PM starts a project from a master template or from a previous project and gets an independent copy of exactly the BD-10 parts; an RPM assigns the approved volunteers of their own project areas; each assigned volunteer (and each team member) reads and accepts the project's rules before the project appears for them; a main volunteer builds the project's team from those who registered under their NID.

## Problem
T1.11 creates projects only from a workflow, with no rules texts and no volunteers. Projects cannot be staffed in the field, activation does not yet check the rules texts, and the T1.11 wizard leaves `source.kind` template and copy open. Phase 2 (applications) needs assigned, consenting volunteers with their permission sets and a limit counter.

## Requirements

### Templates and copies (BD-10, BR-064, BR-065)
- **R1** A new project's first step offers three starting points: a workflow (as today), a master template, or a previous project.
- **R2** A copy, from a template or a previous project, takes exactly: the component list and every component's settings, the workflow stages, the photo rule and photo sources, rating criteria, issue types, expense categories, the dawah syllabus and the four rules texts. The form (as version 1), the document checklist and the scoring criteria join this list in their own tasks (T2.4, the documentation module, Phase 2 scoring), since none of them has storage yet. "Workflow stages" are the stages component's settings.
- **R3** A copy never takes: applications, beneficiaries, budget amounts (cost, target, fund sources), dates (window), volunteer assignments, staff access, areas, ratings, categories, logs, quota targets. A test checks both lists against BD-10.
- **R4** A copy is an independent snapshot: later changes to the template or the source project do not change it, and changes to it do not change them.
- **R5** "Save as template" works from any project (draft, active, closing, closed) and stores the same copied parts as a new master template with a name.
- **R6** A template library screen lists the templates (name, workflow, who changed it last and when); anyone with project-creation rights sees, uses, renames, edits, deactivates and activates every template in the organisation. Templates are never deleted.
- **R7** Creating, editing, deactivating and using a template, and copying a project, are audited.

### Rules and consent (BR-039)
- **R8** A setup step "নিয়মাবলি" edits the four rules texts in Bangla and English: volunteer duties, implementation process, Local দায়ী duties, consequences of misconduct.
- **R9** Activation needs the volunteer duties, the implementation process and the consequences of misconduct; the Local দায়ী duties are needed only while dawah is on. The activation check and the wizard's review list the missing texts.
- **R10** Every saved change of the rules texts makes a new rules version; the project keeps all versions.
- **R11** An assigned volunteer (and a team member) sees a pending project, reads each rules part, accepts it, moves to the next, and finally confirms "আমি রাজি এবং এই প্রকল্পে কাজ করতে আগ্রহী". The Local দায়ী part appears only while dawah is on.
- **R12** Refusing leaves the assignment pending; the volunteer has no access to the project until they accept.
- **R13** Who accepted which rules version when is logged; after the rules change, everyone who accepted an older version must accept again before working, and stays pending until then.
- **R14** The server refuses every project action of a volunteer whose consent for the current rules version is missing.

### Volunteer assignment (A5, BD-07 scope)
- **R15** An RPM sees, for assignment, the approved and not-blocked volunteers whose address lies in the RPM's own areas of this project (a division, or the RPM's districts when the division is split), filterable by district, upazila and union, with search by name or mobile.
- **R16** The RPM selects several volunteers and assigns them in one action, each with a permission set and a paid flag.
- **R17** The permission set starts from the volunteer's type (general → application and distribution; Local দায়ী (`local_daee`) and দাঈ-স্বেচ্ছাসেবক (`both`) → application, distribution and dawah; paid → work progress) and the RPM may change it per assignment.
- **R18** The same volunteer may be on several projects with different permission sets; one active assignment per project and volunteer.
- **R19** A Project Executive assigns only when an RPM of the project has granted them that permission; the PM and the global roles may assign in any area of the project.
- **R20** An assignment can be ended with a reason (the volunteer loses access to the project; the record stays); assigning, changing and ending are audited.
- **R21** An official sees a project's assigned volunteers with their permission set, paid flag and consent state.

### Teams (BR-040, BR-041)
- **R22** A main volunteer (type General or Both) assigned to a project sees the volunteers who registered with their NID as reference and adds or removes them in this project's team.
- **R23** A team member works on the project only after their own consent (R11–R13); their capabilities follow the A5 table: create applications, edit own drafts, never submit; the API enforces it once applications exist (Phase 2), and the capability check exists now as a shared rule with tests.
- **R24** Applications created by a team member count against the main volunteer's application limit.

### Limit counters and the volunteer side
- **R25** A per-project, per-volunteer application counter (the BR-059 counted states) exists and is read by the volunteer's project view; Phase 2 updates it when applications are created.
- **R26** The volunteer's "আমার প্রকল্প" shows active projects only after consent; a pending project shows the consent flow instead.

### Contract and tests
- **R27** `docs/api/openapi.yaml` covers every new operation; the drift and authorization matrix tests pass.
- **R28** Tests cover the copy and not-copy lists, the consent gating (no consent, old version, team member), the RPM's region scope and the executive grant; E2E covers assign → consent → the project appears for the volunteer.

## Scope
- In: master templates and copies (R1–R7), the rules texts and the consent flow (R8–R14), assignment by RPM (R15–R21), teams (R22–R24), the limit counter and "my projects" (R25, R26), openapi and tests.
- Out (not now): copying the form and the document checklist (their own tasks); applications themselves and the limit enforcement on creation (Phase 2, T2.x); application transfer to another volunteer (T2.6); notifications of assignment and consent (with the notification work); offline caching of "my projects" (T2.7); quotas and scoring editing screens (Phase 2).

## Key decisions
- **Rules change → consent again** (owner, 2026-10-17): every rules version is kept; a volunteer who accepted an older version stays pending until they accept the new one. Governs R10, R13.
- **Team members consent themselves; their applications count against the main volunteer's limit** (owner, 2026-10-17). Governs R11, R23, R24.
- **Templates are organisation-wide** (owner, 2026-10-17): everyone with project-creation rights sees, uses and edits every template (BD-10); every change audited. Governs R6, R7.
- **Local দায়ী duties only while dawah is on** (owner, 2026-10-17): required for activation and shown in the consent flow only then. Governs R9, R11.
- **Permission set from the volunteer type, changeable by the RPM** (owner, 2026-10-17). Governs R17.
- **RPM sees volunteers of their own areas on this project** (owner, 2026-10-17): a division, or their districts when split. Governs R15.
- **Copy what exists now; the form, the document checklist and the scoring criteria join later** (owner, 2026-10-17; scoring confirmed at doc review): recorded in DECISION_LOG. Governs R2.
- **Reuse the existing tables**: `project_templates`, `project_volunteers` (permission set, paid flag, consent state), `volunteer_teams` and `projects.rules` are in the schema since T1.2; new columns or tables only where a requirement needs them (the rules versions, the consent log, the counter).
- **Template writes by the project creators, organisation-wide** (owner, doc review 2026-10-17): writes need `project.template.manage`; its default moves to the project-creating roles at GLOBAL scope (a template belongs to no program); the permission panel can still revoke it. Governs R6.
- **Template editing** (owner, 2026-10-17): the library renames, describes, deactivates and activates a template; its setup changes by "save as template" from a project onto the existing template (no separate template setup screen). Governs R5, R6.

<!-- ae-plan adds everything below -->

## Technical decisions
- **Stack profile unchanged** (ST-40 to ST-44): the CLAUDE.md profile (Express 5, Prisma 7 on PostgreSQL 17, React 19 + Vite, pnpm workspaces) covers every requirement; nothing is added.
- **One migration, reversible** (DB-MIG-*, ADR-003): `projects.rules_version` (int, 0 = no rules yet); `project_rules_versions` (project, version, texts jsonb, author, time; unique project+version) keeps every saved version (R10); `project_consents` (project, volunteer, rules_version, accepted or refused, time, the accepted parts) is the consent log (R13); `volunteer_teams.consent_status` and `consent_at` (the same check as `project_volunteers`) give team members their own consent (R11, R23); `project_volunteers.applications_counted` (int, ≥ 0, default 0) is the limit counter of the main volunteer (R24, R25; Phase 2 increments it in the application transaction). Hand-written `down.sql`.
- **Consent gate in the access layer** (RE-SEC-05, default deny): `loadAccessFacts` (`apps/api/src/access/effective.ts:246`) and the own-projects branch of `resolveInstances` (`apps/api/src/access/scope.ts:218`) read only assignments and team memberships with `consent_status = 'accepted'`, so a volunteer without consent holds no project permission and reaches no project (R14). A rules change resets `accepted` to `pending` for that project in the same transaction (R13). The volunteer's own "my projects" and consent routes are SELF routes that read pending assignments too.
- **Team members reach the project through their team** (owner, doc review 2026-10-17): an accepted, not removed `volunteer_teams` row gives the team member the main volunteer's project at the team-member role's own permissions (`own_created` condition, BR-041), only while the main volunteer's assignment is active and accepted and the member's user is active and not blocked; no `project_volunteers` row for them. Ending the main assignment removes its team rows in the same transaction. A volunteer assigned to the project cannot join a team on it, and a team member cannot be assigned to it (409 both ways).
- **Copy as one pure function** (`@css/shared/projects/templates.ts`): `TEMPLATE_PARTS` (copied) and `NOT_COPIED` lists, `templateDefinitionSchema` (workflow key, components with settings, syllabus titles, rules texts), and the server builds the definition from a project or reads it from a template, then creates the new draft like `ProjectsService.create` does (`apps/api/src/services/projects.ts:208`). Issue types, expense categories, rating criteria, stages and the photo rule live in the component settings, so copying the components copies them; scoring has no storage until Phase 2 and the form and document checklist come with their tasks (Key decisions).
- **Templates are organisation-wide**: `GET /templates` reads every active template for anyone with `project.create`; writes (create, `PATCH`, save as template) need `project.template.manage`, whose default in `permissions.yaml` becomes `program_manager` at GLOBAL (the global roles hold it already); save as template also needs the caller to reach the source project; templates are updated in place (copies are already snapshots), deactivated never deleted, every change audited with before and after (§13).
- **Assignment reuses the scope of the volunteer tab**: the candidate list follows `apps/api/src/services/volunteer-list.ts` (area filters, blocklist exclusion, approved only) but narrows to the caller's own areas of this project (`ownAreas` of `project-setup.ts`); PM and global roles see all areas of the project.
- **The RPM's grant to an executive** uses the existing project-staff extras (`project_staff.extra_permissions`, already honoured by `effective.ts:167` for `if_rpm_grants` permissions): the staff access gains "may assign volunteers" (`volunteer.assign_project`), set by the RPM in their areas or the PM; changing it bumps the person's permission version (`PermissionVersionService.bump`).
- **Shared rules for the screens and the API**: `@css/shared/projects/rules.ts` (`projectRulesSchema`, `RULES_PARTS`, `requiredRuleParts(dawahEnabled)`), `setupCheck` gains the missing `rules:<part>` items (R9), `defaultPermissionSet(type, paid)` (R17) and `teamCapabilities` (R23) in `@css/shared/projects/assignment.ts`.
- **Contract first**: the drafted operations in `docs/api/openapi.yaml` (`volunteers.assignment.*`, `volunteers.team.*`, `templates.template.*`) are aligned with the implementation; the missing ones (rules, my projects, consent, candidates, template update) are added; the drift and authorization matrix tests stay green (R27).

## Implementation units

### U1. Migration, decisions and shared rules
- **Goal:** the data and the pure rules every later unit builds on.
- **Requirements:** R2, R3, R9, R10, R13, R17, R23, R24, R25
- **Files:** `apps/api/prisma/migrations/20261017000000_rules_consent_teams/{migration.sql,down.sql}`, `apps/api/prisma/schema.prisma`, `packages/shared/src/projects/{rules,templates,assignment}.ts`, `packages/shared/src/projects/{setup-check,index}.ts`, `packages/shared/test/projects.test.ts`, `docs/DECISION_LOG.md` (D-096 with the owner decisions of this plan), `docs/BUSINESS_RULES.md` (BR-039, BR-041, BR-059, BR-064, BR-065 amended), `docs/database/DATABASE_SCHEMA.md`, `docs/database/ERD.md` (the two new tables, the new columns, the template definition without scoring and form)
- **Approach:** the migration follows `20261016000000_project_cancelled`; the shared files follow `packages/shared/src/projects/setup.ts` and `setup-check.ts`.
- **Tests:**
  - unit: `projectRulesSchema` (bilingual, bounded, strict); `requiredRuleParts` with and without dawah; `setupCheck` lists `rules:volunteer_duties` and the others, `rules:daee_duties` only with dawah; `templateDefinitionSchema` round trip; `TEMPLATE_PARTS` and `NOT_COPIED` equal the BD-10 lists; `defaultPermissionSet` per type and paid; `teamCapabilities` per the A5 table (main volunteer and team member).
  - integration: the migration applies on the template database and `down.sql` restores the T1.11 schema (constraints test); the consent check refuses an unknown status; the counter refuses a negative value.
  - existing: `packages/shared/test/projects.test.ts` covers `setupCheck` (updated, not duplicated).
- **Done when:** `pnpm --filter @css/shared test` and the db constraints tests pass; D-096 is in DECISION_LOG.
- **Depends on:** none
- **Size:** L
- **Risk area:** database
- **Status:** done

### U2. Rules, consent and the access gate (API)
- **Goal:** rules are edited and versioned, a volunteer accepts them, and nobody works on a project without consent.
- **Requirements:** R8, R9, R10, R11, R12, R13, R14, R25, R26
- **Files:** `apps/api/src/services/project-rules.ts`, `apps/api/src/services/my-projects.ts`, `apps/api/src/routes/project-setup.ts` (rules), `apps/api/src/routes/my-projects.ts`, `apps/api/src/access/{effective,scope}.ts`, `apps/api/src/services/project-lifecycle.ts` (activation reads the rules), `apps/api/src/container.ts`, `apps/api/src/app.ts`, `docs/api/openapi.yaml`, `apps/api/test/integration/{project-rules,my-projects}.test.ts`, `apps/api/test/integration/support/access-fixtures.ts`, `apps/api/seed/sets/demo/` (the demo project gets rules version 1, its assignments and team rows accepted)
- **Approach:** rules routes follow the syllabus routes in `routes/project-setup.ts` (`GET/PUT /projects/{projectId}/rules`, `project.configure`, row lock, `editableIn`, audit `project.configure`); a save writes `project_rules_versions`, raises `rules_version`, and resets accepted consents of the project to pending in both `project_volunteers` and `volunteer_teams`. `GET /me/projects` (SELF) lists the caller's assignments and team memberships with consent state, the current rules and `applicationsCounted` (R25); `POST /me/projects/{projectId}/consent` (`volunteer.consent.accept`, SELF, audit `volunteer.consent`; locks the project row and re-reads `rules_version`; the server checks that every required part is accepted) takes `{ rulesVersion, decision: accepted | refused, parts }`, resolves the caller's own active `project_volunteers` row or not-removed `volunteer_teams` row for the project (404 if neither), refuses a stale version (409) or missing parts (422), writes `project_consents` and the status. The gate: the two access reads filter `consent_status = 'accepted'`; the fixture assignments become accepted where a test relies on project access.
- **Tests:**
  - integration: PUT rules creates version 1 then 2 and keeps both; a PM of another program 404, a volunteer 403; activation refuses a draft without the rules (409 with `rules:` items) and needs the dawah duties only when dawah is on; consent accept moves pending → accepted with the log row; refuse keeps pending and logs; a stale `rulesVersion` 409; missing parts 422; a rules change makes accepted volunteers and accepted team members pending again; `GET /me/projects` returns `applicationsCounted`; the demo seed's volunteers still reach the demo project; a volunteer without consent gets 404 on the project and no project in `GET /projects`; with consent the project appears; another volunteer cannot consent for someone else's assignment (404); consent on an ended assignment or a removed membership 404; a team member consents on their membership.
  - existing: `access-effective`, `access-scope`, `access-idor`, `projects`, `volunteer-list` integration tests use assigned volunteers; their fixtures set `consent_status = 'accepted'` (update, not duplicate); `effective.spec.ts` gains the pending case.
- **Done when:** the rules and consent tests and every existing access test pass; drift and matrix tests green.
- **Depends on:** U1
- **Size:** L
- **Risk area:** auth
- **Status:** done

### U3. Volunteer assignment and the executive grant (API)
- **Goal:** an RPM assigns the approved volunteers of their areas with a permission set and a paid flag.
- **Requirements:** R15, R16, R17, R18, R19, R20, R21
- **Files:** `apps/api/src/services/project-volunteers.ts`, `apps/api/src/routes/project-volunteers.ts`, `apps/api/src/services/project-setup.ts` (staff extras), `packages/shared/src/projects/setup.ts` (staff body flag), `docs/api/openapi.yaml`, `docs/security/permissions.yaml` (only if a name is missing), `apps/api/test/integration/project-volunteers.test.ts`
- **Approach:** `GET /projects/{projectId}/volunteer-candidates` follows `volunteer-list.ts` (approved, user active, not on the blocklist, address in the caller's areas of the project; district, upazila, union and `q` filters; keyset paging); `GET /projects/{projectId}/volunteers` lists assignments for officials (`volunteer.assign_project` or an official project read, limited to the caller's areas; page size capped); `POST /projects/{projectId}/volunteers` assigns several (`volunteer.assign_project`; at most 100 per call, rate-limited; each volunteer checked in scope; the set is a strict enum, from `defaultPermissionSet` unless given, the dawah set only for a dawah type or while dawah is on; `is_paid` needs `volunteer.mark_paid`; region = the area location; one active assignment per volunteer, 409 otherwise); `PATCH /project-volunteers/{assignmentId}` changes set and paid (the same enum, dawah and `volunteer.mark_paid` checks); `POST /project-volunteers/{assignmentId}/end` with a reason (also ends its team rows); both only inside the caller's areas of the project. The candidates route needs `volunteer.assign_project`. Each write locks the project, bumps the volunteer's permission version and is audited (`volunteer.assigned`, `volunteer.assignment_change`, `volunteer.assignment_end`). Staff access gains a `canAssignVolunteers` boolean only (create and `PATCH /project-staff/{assignmentId}`; no free permission list in the body), stored as the `volunteer.assign_project` extra and limited to the granting RPM's areas.
- **Tests:**
  - integration: the Dhaka RPM sees Dhaka volunteers and not Rangpur ones, a split district limits further; blocked, pending and team-member-type volunteers are not candidates; bulk assign with default sets per type and a changed set; paid needs the RPM; the same volunteer on two projects with different sets; a second active assignment 409; an executive without the grant 403, with the grant from the RPM 201, outside the RPM's areas 403; end with a reason, then the volunteer and their team have no access; an RPM changing or ending an assignment outside their areas 404; an unknown set 422; the dawah set on a non-dawah volunteer of a project without dawah 422; paid by PATCH without `volunteer.mark_paid` 403; 101 volunteers in one call 422; a PM of another program 404; a volunteer 403; audit rows written.
- **Done when:** the assignment tests pass; drift and matrix tests green.
- **Depends on:** U1
- **Size:** L
- **Risk area:** auth
- **Status:** todo

### U4. Teams (API)
- **Goal:** a main volunteer builds the project's team from those registered under their NID.
- **Requirements:** R22, R23, R24
- **Files:** `apps/api/src/services/volunteer-teams.ts`, `apps/api/src/routes/my-projects.ts` (team routes), `docs/api/openapi.yaml`, `apps/api/test/integration/volunteer-teams.test.ts`
- **Approach:** `GET /me/projects/{projectId}/team` returns the members and the candidates (`volunteers.reference_volunteer_id` = the caller, approved, not blocked; only name, volunteer number and type; re-checked on add); `POST /me/projects/{projectId}/team` adds (`volunteer.team.manage`, SELF; the caller assigned with consent and of type General or Both); `POST /me/projects/{projectId}/team/{memberId}/remove`. A new member starts with consent pending. Audit `volunteer.team_change`. Follows the T1.10 volunteer routes for SELF access.
- **Tests:**
  - integration: a General and a Both main volunteer add a member registered under their NID; someone registered under another NID 422; a Local দায়ী main volunteer 403; a main volunteer without consent 403; a member on another main volunteer's team for the same project 409; a volunteer assigned to the project 409, and assigning a team member of the project 409; the member loses access when the main assignment ends or the member is blocked; candidates carry no mobile, NID or address; remove ends the membership; the member reaches the project only after their own consent; another volunteer cannot see this team (404).
  - unit: `teamCapabilities` (U1) used by the service.
- **Done when:** the team tests pass.
- **Depends on:** U1, U3
- **Size:** M
- **Risk area:** auth
- **Status:** todo

### U5. Templates and copies (API)
- **Goal:** a project starts from a template or a previous project with exactly the BD-10 parts.
- **Requirements:** R1, R2, R3, R4, R5, R6, R7
- **Files:** `apps/api/src/services/templates.ts`, `apps/api/src/routes/templates.ts`, `apps/api/src/services/projects.ts` (create from template or copy), `packages/shared/src/projects/requests.ts` (`source.kind` template and copy), `docs/api/openapi.yaml`, `docs/security/permissions.yaml` (`project.template.manage` at GLOBAL), `apps/api/test/integration/templates.test.ts`
- **Approach:** `GET /templates` (every active template, `?include=inactive` for the library), `GET /templates/{templateId}`, `PATCH /templates/{templateId}` (name, description, active; If-Match; `project.template.manage`), `POST /projects/{projectId}/save-as-template` (`{ name } | { templateId }` to replace an existing template's contents). Project creation with `source.kind = template | copy` builds the components, the syllabus and the rules (version 1) from the definition, sets `source_template_id` or `copied_from_project_id`, and never copies the NOT_COPIED parts. Audit `template.create`, `template.update`, `project.create` with the source.
- **Tests:**
  - integration: a copy of a project with budget, window, areas, staff, fund sources, assignments and rules has the components, settings, syllabus and rules and none of the rest (both lists asserted); a template made from a project, then changed, leaves earlier copies unchanged; a copy changed leaves the source unchanged; save-as-template onto an existing template replaces its contents; a deactivated template cannot start a project (409) and stays in the library; another program's PM sees, uses, renames and replaces the template; save as template from a project the caller cannot reach 404; a volunteer 403; copying a project outside the caller's reach 404.
- **Done when:** the template tests pass; drift and matrix tests green.
- **Depends on:** U1
- **Size:** L
- **Risk area:** none
- **Status:** todo

### U6. Web: template library, starting points, rules step
- **Goal:** officials use templates and copies, and edit the rules in the setup wizard.
- **Requirements:** R1, R5, R6, R8, R9
- **Files:** `apps/web/src/admin/templates/{TemplatesPage,templates-api}.tsx`, `apps/web/src/admin/projects/setup/{CreateStep,RulesSection,wizard-steps,ProjectSetupPage,ReviewStep}.tsx`, `apps/web/src/admin/projects/ProjectOverviewPage.tsx` (save as template), `apps/web/src/admin/{navigation,roles}.ts`, `apps/web/src/routes/index.tsx`, bn/en `admin.json`, tests next to each page
- **Approach:** the library follows `admin/programs/ProgramsPage.tsx` and `ProgramDialog.tsx`; the starting point is a `RadioGroup` in `CreateStep` (workflow, template, previous project) with the matching `Select`; the rules step follows `SyllabusSection.tsx` with `useStepSave` and sits before the review; the review lists `rules:` items.
- **Tests:**
  - unit (component): the library lists, renames and deactivates; only project-creation roles see it; the new project from a template sends `source.kind template`; the copy picker offers projects by name and year; the rules step saves both languages, refuses an empty required part, and hides the Local দায়ী part without dawah; the review lists missing rules; save as template from the overview; no accessibility violations.
  - e2e (desktop, in `apps/web/e2e/projects.spec.ts`): as `pm.ucd@example.org`, "নতুন প্রকল্প" → "আগের প্রকল্প থেকে কপি" → pick the journey's project → the copy opens at the components step with the same photo rule and an empty budget.
- **Done when:** the web tests pass; the screens work at 1280 and 360 px.
- **Depends on:** U2, U5
- **Size:** L
- **Risk area:** none
- **Status:** todo

### U7. Web: assignment page and the executive grant
- **Goal:** an RPM assigns volunteers of their areas in one action.
- **Requirements:** R15, R16, R17, R19, R20, R21
- **Files:** `apps/web/src/admin/projects/volunteers/{ProjectVolunteersPage,AssignDialog,project-volunteers-api}.tsx`, `apps/web/src/admin/projects/setup/StaffSection.tsx` (the grant switch), `apps/web/src/admin/projects/ProjectOverviewPage.tsx` (link), `apps/web/src/routes/index.tsx`, bn/en `admin.json`, tests
- **Approach:** the list and filters follow `admin/volunteers/VolunteersPage.tsx` (`use-tab-view`, `AddressFields`, `Table` with selection via `BulkRow`); the dialog follows `StaffDecisionDialog.tsx`.
- **Tests:**
  - unit (component): candidates filtered by district, upazila, union; several selected and assigned with the default set and a changed one; paid only for the RPM; the assigned list shows set, paid and consent; end with a reason; the executive grant switch; at 360 px no sideways scroll; no accessibility violations.
- **Done when:** the web tests pass.
- **Depends on:** U3
- **Size:** L
- **Risk area:** none
- **Status:** todo

### U8. Web: my projects, the consent flow and the team
- **Goal:** a volunteer sees their projects, accepts the rules part by part, and builds a team.
- **Requirements:** R11, R12, R22, R26
- **Files:** `apps/web/src/features/projects/{MyProjectsPage,ConsentPage,TeamPage,my-projects-api}.tsx`, `apps/web/src/features/account/HomeView.tsx` (the entry), `apps/web/src/routes/index.tsx`, bn/en catalogues, tests
- **Approach:** phone-first like `features/registration/RegisterPage.tsx` (`PageBand`, `Stepper`, Back and Next); the consent flow shows one part per step and the final confirmation "আমি রাজি এবং এই প্রকল্পে কাজ করতে আগ্রহী"; "প্রত্যাখ্যান করুন" keeps it pending.
- **Tests:**
  - unit (component): a pending project shows "নিয়মাবলি পড়ুন"; the flow walks the parts (the Local দায়ী part only with dawah) and sends the version and the parts; refuse keeps it pending; an accepted project shows its facts and the application limit with the count; the team page adds and removes a member; at 360 px no sideways scroll; no accessibility violations.
- **Done when:** the web tests pass.
- **Depends on:** U2, U4
- **Size:** L
- **Risk area:** none
- **Status:** todo

### U9. E2E journey, status and documents
- **Goal:** assign → consent → the project appears, end to end; the documents follow.
- **Requirements:** R27, R28
- **Files:** `apps/web/e2e/assignment.spec.ts`, `docs/STATUS.md`, `CLAUDE.md` (map), `docs/ui/SCREENS.md`, `docs/testing/DEMO_ACCOUNTS.md` (if the demo data changes)
- **Approach:** follows `apps/web/e2e/projects.spec.ts` and `support/admin.ts`.
- **Tests:**
  - e2e (desktop): `pm.err@example.org` creates and activates a project with rules (Dhaka area with `rpm.dhaka`); `rpm.dhaka@example.org` opens "স্বেচ্ছাসেবক" on it, filters the district, selects volunteer 5 and assigns; volunteer `01700000105` sees the project under "আমার প্রকল্প" as pending, opens "নিয়মাবলি পড়ুন", accepts each part and "আমি রাজি এবং এই প্রকল্পে কাজ করতে আগ্রহী", and the project shows as active; a volunteer not assigned does not see it.
  - e2e (mobile): the consent flow at phone width without sideways scroll.
- **Done when:** `pnpm e2e` passes twice; STATUS names T1.12 done and the next task.
- **Depends on:** U6, U7, U8
- **Size:** M
- **Risk area:** none
- **Status:** todo

## Checkpoints
- **Mode:** grouped (one by one 10, grouped 7 + 10 = 17, all at once 0; N is over 4, so one by one's score goes to grouped)
- **Signals:** N 9, L 3,100, R 4, Fd 3, C 5, P 1
- **C1** after U1: foundation for U2–U5, and the migration
- **C2** after U2: the access gate (auth), foundation for U6 and U8, a new pattern (versioned consent)
- **C3** after U3: assignment (auth), foundation for U4 and U7
- **C4** after U4: teams (auth)
- **C5** after U6: the code since C4 would pass 1,000 estimated lines with U7
- **C6** after U9: end, with the whole-branch check

## Verification
- `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm --filter @css/api exec vitest run --config vitest.db.config.mts`, `pnpm docs:check`, `pnpm --filter @css/api authz:matrix`, `pnpm e2e`; the dev DB gets the migration with `pnpm db:migrate`.

## Risks and rollback
- **Migration:** additive (one column on projects, two on volunteer_teams, one on project_volunteers, two tables); `down.sql` drops them. No data rewrite.
- **Access gate:** filtering on consent removes project access from every assigned volunteer without consent, also demo and test data. The demo seed marks its assignments accepted (version 1 rules on the demo project) so dev and E2E keep working; a rollback is the filter's removal.

## Definition of done
- All units done and their tests pass
- Verification commands pass
- `ae-review` has run at each checkpoint, with no open P0 or P1
- Code from abandoned attempts is removed

## Progress
- **Branch:** `feat/templates-consent-assignment` (from `feat/program-project-setup`, stacked on PR #3)
- **Updated:** 2026-10-17 10:20
- **Next:** U3, tests first in `apps/api/test/integration/project-volunteers.test.ts` (candidates, bulk assign, change, end, the executive grant)
- **Reviewed through:** C2 at 8d73ee0
- **Uncommitted:** none
- **Notes:** the branch starts from `feat/program-project-setup` (not develop): the project stacks its PRs #1 → #2 → #3 and this one follows. U1: the rules join setupCheck in U2 (with the activation change and its tests), so every U1 commit keeps activation unchanged; the shared module adds definitionOf (strips the source's form ids and public-link token), permissionSetAllowed and applicationsLeft; project_templates gained a description column; roles.sql revokes UPDATE on the two new logs. C1 (logic, security, standards; no P0, one P1 fixed): a trigger refuses a consent row whose project and volunteer are not those of its assignment or membership, or whose version was never saved; the two logs refuse TRUNCATE; a template definition takes only settings that fit their component or none, and every settings key is listed as copied or bound to the source (test); the consent body uses `accepted` / `refused` like the log, while a refusal leaves the assignment `pending`. Kept: rule ids in comments (repo convention); the permission to give the dawah set on a dawah project to any type is the owner's security answer at doc review. U2 must reset `accepted` to `pending` in both tables in the rules-save transaction and take version, volunteer and assignment from the server, never from the body. U2: `GET/PUT /projects/{id}/rules` (officials; the same texts again make no new version but are audited, because every write route must audit), `GET /me/projects`, `GET /me/projects/{id}` (the rules parts to read) and `POST /me/projects/{id}/consent` (`volunteer.consent.accept`, now also for `volunteer_paid`: every assigned volunteer consents); the drafted `/project-volunteers/{id}/consent` of the contract is replaced by the own-project route. The consent body uses `accepted`/`refused`. The access gate is `WORKING_ASSIGNMENT` and `workingTeamProjects` in `access/effective.ts`, used by `scope.ts` too; access is computed per request, so a consent or a rules change needs no permission-version bump. A volunteer without any accepted project gets 403 on `GET /projects`. The demo seed has no assignments, so it needed no change. Found while building: a permission set gives nothing to a role outside its `for` list in permissions.yaml, so `permissionSetAllowed` follows the type only (`PERMISSION_SET_TYPES`, checked against the registry in `effective.spec.ts`); the paid flag no longer picks `work_progress`; D-096 item 5 amended (stricter than, and inside, the owner's answer). The wizard reads the rules and lists missing rules on the review until U6 adds the rules step; the E2E journey of `projects.spec.ts` cannot activate until then (U6 adds the rules step to it). C2 (logic found one P1, fixed): switching dawah on in a running project adds the Local দায়ী part, so it needs that text (409 with `rules:daee_duties`) and writes a new rules version that sets every acceptance back to pending (`writeRulesVersion` in `services/project-rules.ts`, shared with the rules save); a running project's rules save refuses a missing required text; an acceptance of rules with a text never written answers 409 `project.rules_incomplete`. The test helper `reaches` fails on anything but 200, 403 or 404. U3/U4 must refuse the overlap of an assignment and a team membership on one project (both reviewers noted that `consent` takes the first link).
