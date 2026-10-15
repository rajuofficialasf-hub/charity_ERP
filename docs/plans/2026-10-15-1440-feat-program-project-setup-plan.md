---
title: Program and project setup, core (T1.11)
type: feat
status: in-progress
source: brainstorm
date: 2026-10-15
doc_review: 2026-10-15
---

# Program and project setup, core (T1.11)

## Goal
The Department Head keeps the programs and their PMs. A PM creates a project in their program, fills its setup over several sittings as a draft, and activates it when the setup is complete. The project then moves through closing and closed, with a controlled reopen. The server refuses every change the project's state or the caller's permission does not allow, and every change is in the audit log.

## Problem
There is no way to create a program or a project today. The three SOP programs and one draft project exist only from the seed. Everything after Phase 1 needs real projects with real settings:
- volunteer assignment and consent (T1.12)
- the forms (T2.4)
- applications (Phase 2)
- distribution (Phase 3)

The project setup screen is the key configuration screen of the blueprint (MASTER_SPEC A6; BD-09, BD-13, BD-14, BD-16, BD-20; SCR-060). The API contract was written in T0.18 but has no code behind it yet.

## Requirements

### Programs
- **R1** The Department Head (and the Monitoring Team through its global access, BR-053) can:
  - create a program with a unique code and a bilingual name;
  - rename it;
  - assign or change its PM.
- **R2** A program is never deleted (owner decision).
  - The Department Head can deactivate it, and activate it again.
  - Deactivation is refused while the program has a draft, active or closing project.
  - A deactivated program offers no new project, but its projects and data stay readable.
- **R3** Only officials holding `program.view` see the program list and a program's details; volunteers get 403. Every program change (create, rename, PM, deactivate, activate) is audited.

### Creating a project
- **R4** A PM creates a project in their own program; the Department Head and the Monitoring Team can create one in any program. The new project is a draft and needs:
  - a unique project code of 2 to 8 capital letters (O-03; the code is later used in the application ids);
  - the year, the program and a bilingual name;
  - one of the seeded workflow definitions: distribution, construction, advance + voucher, implementation + evidence, open application + visit, or Qurbani.
- **R5** A new project starts from its workflow's defaults (owner decision):
  - the components that workflow uses, switched on;
  - the photo rule and the photo source (UX-11: camera only for distribution and construction proof, gallery allowed for vouchers and paper documents);
  - the stages of a stage-based workflow;
  - the beneficiary type options of BD-14.
  
  Creating from a master template or by copying a project comes in T1.12. The contract gains this third way of creating a project, "from a workflow".
- **R6** A draft that was never activated can be cancelled by the PM with a reason (owner decision).
  - A cancelled draft leaves the project list but stays in the database (soft delete) and in the audit log.
  - Its code stays taken.
  - A project that was ever activated cannot be cancelled, only closed.

### Setup groups (saved as a draft, partially, in any order)
- **R7 Basic data.** Name, description, year (draft only), program (draft only), workflow (draft only).
- **R8 Budget.** Cost per beneficiary and target beneficiaries.
  - The planned budget is their product (BR-069), computed by the system and shown, never typed.
  - Fund sources: one or more tags (zakat, sadaqah, general donation, specific donor with the donor's name), each with an amount (BR-071).
- **R9 Application window.** From and to dates; "from" is not after "to".
  - While the project is a draft, the dates are part of the setup.
  - Once it is active, the end date changes only through "extend deadline": the PM (and the global roles through BR-053), a later date, a required reason, audited (BD-16, BR-058).
- **R10 Areas.** A division, or one or more districts, each with an RPM (BR-060).
  - Several RPMs may share one division equally.
  - The PM may split the districts of a division among its RPMs.
  - An area's RPM must hold the RPM role. An area and its RPM can be removed again.
- **R11 Staff.** View, edit and delete access on the project for staff working under the RPM, given by the PM or the area's RPM (BR-061), and ended again. The RPM has full access in their own area.
- **R12 Components.**
  - Every component of BR-063 appears as a row that can be switched on or off.
  - A component's settings are stored as JSON and validated on the server against that component's JSON Schema (`project-component-settings.schema.json`). Invalid settings are refused with the field that failed.
  - Settings are saved even while the component is off.
- **R13 Component settings in this task:**
  - photo rule (group / individual / both, or per application kind for tree planting) and photo source per kind of photo (UX-11);
  - rating criteria: at most 5, each scored 1–5;
  - stage names and order for stage-based workflows;
  - application kinds for the tree-planting workflow;
  - dawah enabled, with the syllabus topic list (kept as its own ordered list, which classes and progress will reference);
  - beneficiary type options, defaulting to the BD-14 list and editable per project;
  - team members allowed.
  
  Components whose screens come later keep their stored settings without a settings editor yet: issue types, expense categories, follow-up questions, scoring, document checklist.
- **R14 Limits.** The per-volunteer application limit (a whole number of at least 1; BR-059 counts it from Phase 2).

### Lifecycle
- **R15 Activation.** The PM (and the global roles through BR-053) activates a draft explicitly. Activation is refused with the list of what is missing unless all of these are set (owner decision):
  - name, year and workflow;
  - the application window;
  - the per-volunteer limit;
  - the cost per beneficiary and the target;
  - fund sources whose amounts add up to the planned budget;
  - at least one area with an RPM;
  - valid settings for every enabled component.
  
  Two further checks join the activation rule in their own tasks, and DECISION_LOG records this: the published form (T2.4) and the four rules texts (T1.12). Activation stores a snapshot of the workflow and the project's settings, which later work reads.
- **R16 Editing while active** (owner decision).
  - Everything in R7 to R14 can still change, except the code, program, year and workflow.
  - The application end date changes only through R9's extension.
  - Each change is audited with its old and new values.
- **R17 Closing.**
  - "Start closing" (PM, with a reason) moves an active project to closing. New applications stop and the remaining work can still be finished.
  - "Close" (PM, with a reason) moves closing to closed. It first warns about unfinished applications (none exist yet; O-49) and runs the workflow's close checks (none can fail yet).
- **R18 Closed is read-only.** No setup change, no new application, edit, delete, distribution or progress update. Only follow-up evaluations remain allowed (BR-056, BR-070); they arrive in Phase 5.
  - In closing and closed, the setup is read-only too.
  - The server refuses each such change with a clear error, whatever the screen shows.
- **R19 Reopen.** The PM, with a reason, moves a closing or closed project back to active (BD-20, BR-057). Applications closed by the close are restored to their prior state (O-49; nothing to restore yet).
- **R20 Who may act.** Start closing, close and reopen are PM actions of the project's program, and the Department Head and the Monitoring Team hold them through their global roles (BR-053). Everyone else gets 403.
- **R21 Audit.** Every change writes an audit entry: create, setup changes, component changes, areas, staff, fund sources, the deadline extension, activate, start closing, close, reopen and cancel. Each entry records the actor, the old and new values and the reason where one is required.

### Visibility
- **R22 Who sees projects.**
  - Officials see the projects in their scope (`project.view`: the PM their program, the RPM and the area staff their areas, the global roles all).
  - Volunteers see only active projects they are assigned to (BR-054; the assignment itself comes in T1.12).
  - Draft and cancelled projects are never shown to volunteers.
  - A volunteer sees only the work facts of a project (owner decision in the plan review): name, year, the application window, the per-volunteer limit, the photo rule and the enabled components. The server never sends a volunteer the budget, the fund sources (donor names included), the staff or the areas of other RPMs.

### Screens
- **R23 Project list (admin).** Code, name, program, year, a status badge and progress placeholders.
  - Filters: program, year and status.
  - A "new project" action for those who may create one.
  - Works at 360 px.
- **R24 Project setup.** The key screen, SCR-060 and mockup `12-project-setup.html`:
  - a section index on the left, the editor in the middle, a summary of the selected components on the right;
  - the components as toggle rows with their settings in a drawer;
  - each section saves as a draft;
  - "activate" lists what is missing;
  - a lifecycle badge;
  - read-only with a lock note in closing and closed.
  
  It is desktop-first. On a phone it shows the "best on a larger screen" alert, and only the name, the dates and the component toggles can be edited there.
- **R25 Project overview.** Status, basics, budget and fund sources, application window, areas with RPMs, staff, enabled components. It also offers the lifecycle actions (activate, extend deadline, start closing, close, reopen, cancel draft) to those allowed, each with a reason dialog where a reason is required.
- **R26 Program screens.** A program list and a program form (code, name, PM, active) for the Department Head; other officials see the list read-only.
- **R27 Project filter of the T1.10 tabs.** The project filter of the volunteer and beneficiary tabs gets its project picker. It was left as a URL filter until this list existed.

### Contract and tests
- **R28 Contract.** `docs/api/openapi.yaml` is updated for every operation built (the drift test compares it with the code), including:
  - the new "from a workflow" creation;
  - editing an active project;
  - the two closing steps;
  - cancelling a draft;
  - program deactivation.
- **R29 Tests.** Every rule above has a test:
  - unit tests for the settings validation and the activation check;
  - integration tests for each endpoint, including the other-program PM, the volunteer and the refused lifecycle states;
  - E2E for create → save draft → activate → start closing → close → reopen.

## Scope
- In: R1–R29.
- Out (not now):
  - master templates, copying a project and "save as template" (T1.12);
  - the four rules texts and the volunteer consent (T1.12);
  - volunteer assignment to projects and teams (T1.12);
  - the form builder and the published-form activation check (T2.4);
  - quotas and scoring criteria screens (Phase 2);
  - applications and their limit counting (Phase 2);
  - the project dashboard with real progress (T3.3);
  - follow-up evaluations (Phase 5);
  - the document checklist (documentation module);
  - budget ledger and payments (Phase 3).

## Key decisions
- **Create "from a workflow" now; templates and copy in T1.12**: the six seeded workflows give real defaults without waiting for the template library. Governs R4, R5, R28.
- **Activation checks what exists now**: the published form and the rules texts join the check in T2.4 and T1.12, recorded in DECISION_LOG, so the E2E can activate and close a project in this task. Governs R15.
- **Fund sources must add up to the planned budget before activation**: the budget is fully tagged by source (BD-30). Governs R8, R15.
- **Active projects stay editable except their identity**: code, program, year and workflow are fixed after activation; the end date moves only by the reasoned extension; everything is audited. Replaces the T0.18 contract's draft-only update. Governs R16.
- **Two-step close and reopen from closing or closed**: follows the blueprint lifecycle (O-12, O-49); the PM, and the global roles through BR-053. Governs R17–R20.
- **Programs are deactivated, never deleted; drafts are cancelled, never deleted**: no hard delete of business data. Governs R2, R6.

## Open questions
None. The technical points (where the application kinds and the syllabus live, how cancelled is stored, the contract changes) are settled under Technical decisions.

## Technical decisions
- **Stack profile unchanged** (ST-40…ST-45, CLAUDE.md "Stack profile"): Express 5 `defineRoute`, Prisma 7 on PostgreSQL 17, the React 19 SPA on `packages/ui`. Nothing is added.
- **The contract changes in the unit that builds each operation** (NFR-54, API_STANDARDS §16; the drift test compares `docs/api/openapi.yaml` with the code key by key). The T0.18 contract changes where the owner's decisions differ:
  - `ProjectCreate.source.kind` becomes `workflow` with a `workflowKey`; `template` and `copy` come back in T1.12.
  - `ProjectUpdate` drops the "draft only" description. It carries `programId`, `year` and `workflowKey`, accepted only on a draft, and `rules` leaves it until T1.12.
  - Closing becomes two operations, `POST /projects/{projectId}/start-closing` and `/close`, both with a reason. `/reopen` accepts a closing or a closed project.
  - New operations:
    - `POST /projects/{projectId}/cancel` (reason)
    - `PATCH /programs/{programId}` (name, active)
    - `POST /project-areas/{areaId}/remove`
    - `GET` and `PUT /projects/{projectId}/syllabus`
  - `Project.status` gains `cancelled`. `Project` gains `etag` and the summaries the overview needs.
- **The workflow decides the starting components.** `packages/shared/src/projects/workflow-defaults.ts` holds one table, workflow key → the components switched on, taken from the "used today in" column of MASTER_SPEC A6:
  - distribution: application_form, volunteer_assignment, dispatch_receive, distribution, volunteer_expenses, rating_criteria (the demo project WNT already has this set)
  - construction: application_form, volunteer_assignment, site_verification, stages, issue_log, follow_up, rating_criteria
  - advance_voucher (safe water): application_form, volunteer_assignment, stages, beneficiary_payment, vouchers, rating_criteria
  - implementation_evidence (self-reliance): application_form, volunteer_assignment, site_verification, dawah, exams, beneficiary_payment, materials_placard, vouchers, follow_up, rating_criteria
  - open_application_visit (tree planting): application_form, public_link, volunteer_assignment, dispatch_receive, site_verification, volunteer_expenses, rating_criteria
  - qurbani: application_form, volunteer_assignment, dispatch_receive, vouchers, volunteer_expenses, donors_animals, rating_criteria

  The other starting settings come from the definition stored in `workflow_definitions.definition` (the seed merges each yaml file with `_common`):
  - the photo rule: `group`, `individual`, `both` and `per_application_type` are copied into the `distribution` settings. `per_project` (distribution, Qurbani) means the PM must choose: the settings start without a rule, so the activation check reports the missing photo rule until the PM picks group, individual or both.
  - the photo source (UX-11): the workflow's single `defaults.photo_source` applies to the proof photos (`distribution_proof`, `construction_proof`, `evidence`); `voucher` and `payment_copy` start as `camera_or_gallery`, because UX-11 allows the gallery for vouchers and paper documents.
  - the stages: each `stages.list` item `{key, label_en, label_bn, activity, photo_required}` becomes `{key, label: {bn, en}, photo_required}`; `activity` stays in the workflow snapshot only.
  - `defaults.dawah` switches `dawah` on.
  - the beneficiary types (BD-14): the reference list `beneficiary_class_default` (table `reference_lists`, codes with Bengali and English labels, seeded by the base seed) becomes `application_form.beneficiary_class_options`.
  - the application kinds of tree planting: the codes of `defaults.application_types` in `open-application-visit.yaml` with their labels from a new base-seed reference list `application_kind_default` become `application_form.application_kinds`. Labels live in seed data, not in code, because the i18n check allows Bengali text only in the catalogue and the seed.

  This is recorded as D-095.
- **Settings are validated by the shared zod schemas** (`componentSettingsSchema(key)`, D-062). They mirror `docs/database/json-schemas/project-component-settings.schema.json`, and the conformance test (`packages/shared/test/jsonb-conformance.test.ts`) keeps the two equal. Two additions:
  - `application_form.application_kinds`: a list of codes with bilingual labels, for the tree-planting application kinds (BR-068).
  - The dawah syllabus stays in its table `dawah_syllabus_topics`, which classes and progress will reference. It is replaced as one list by `PUT /projects/{projectId}/syllabus`.
  - Every settings object, request body and list is strict and bounded: unknown keys are refused (422), and each list has a maximum (stages 30, application kinds 20, beneficiary types 30, rating criteria 5, syllabus topics 100, fund sources 10), each label 200 characters. The existing JSON body limit of the API applies.
  - The `scoring` comment in `packages/shared/src/jsonb/component-settings.ts` changes to say scoring is configured with the quotas in Phase 2.
- **One state rule, used everywhere** (BR-055, BR-056). `packages/shared/src/projects/lifecycle.ts` holds two pieces:
  - `PROJECT_TRANSITIONS`:
    - draft → active (activate)
    - draft → cancelled (cancel)
    - active → closing (start-closing)
    - closing → closed (close)
    - closing or closed → active (reopen)
  - `editableIn(status, field)`:
    - draft: every setup field may change;
    - active: everything but code, program, year and workflow; the end date only through the extension;
    - closing, closed or cancelled: nothing.

  The API refuses with 409: `workflow.transition_not_allowed` for a wrong transition, and the new `project.read_only` for a refused setup change. The screen asks the same functions which controls to show.
- **The activation check is a pure function** (`packages/shared/src/projects/setup-check.ts`). It takes the project, its components, its fund sources and its areas, and returns the missing items as keys with i18n labels. The API answers 409 `workflow.guard.project_setup_complete` with the list in `details`; the screen shows the same list before the button is pressed. Money is summed in integer paisa, so 0.10 + 0.20 never fails the fund-source check.
- **Cancelled is a status.** Migration `<ts>_project_cancelled` adds `cancelled` to the status check, with `cancelled_at` and `cancelled_by` (and an index on `cancelled_by`, as on the other user columns). It is not a deleted flag, so every query that lists projects keeps one filter. `projectWhere` and the list leave cancelled projects out unless a filter asks for them. The reason lives in the audit entry.
- **Permissions** (`permissions.yaml`, RBAC.md). Two new names:
  - `program.update` covers rename, activate and deactivate. Its default grants nobody, so only the global roles hold it.
  - `project.cancel` belongs to the PM in PROGRAM scope.

  Everything else uses names that already exist. Route by route (scope in brackets; the global roles hold every one):

  | Routes | Permission | Default holders |
  |---|---|---|
  | program list and get | `program.view` | officials (PROGRAM, finance and media GLOBAL) |
  | program create, PATCH | `program.create`, `program.update` | global roles only |
  | program PM | `program.assign_pm` | global roles only |
  | project create | `project.create` | PM (PROGRAM) |
  | project PATCH, components, syllabus | `project.configure` | PM (PROGRAM) |
  | fund sources PUT | `fund_source.manage` | PM (PROGRAM) |
  | areas add and remove | `project.area.assign` | PM (PROGRAM) |
  | staff add and end | `project.staff_access.manage` | PM (PROGRAM), RPM (REGION) |
  | activate | `project.activate` | PM (PROGRAM) |
  | extend deadline | `project.deadline.extend` | PM (PROGRAM) |
  | start-closing, close | `project.close` | PM (PROGRAM) |
  | reopen | `project.reopen` | PM (PROGRAM) |
  | cancel | `project.cancel` | PM (PROGRAM) |
  | project list, get and every setup GET | `project.view` | officials by scope, volunteers PROJECT |

  The authorization matrix is regenerated.
- **Every project sub-resource route loads its parent project inside the caller's scope** (NE-SEC-03, O-62). The id-only routes (`/project-areas/{areaId}/remove`, `/project-staff/{assignmentId}/end`) first load the area or assignment, then its project through `projectWhere` of the caller's scope handle; outside the scope the answer is 404, as for every scoped record. The setup GETs do the same. What a volunteer may read follows the owner's decision (work facts only):
  - fund sources, staff and areas: official-only reads, a volunteer gets 403;
  - components: a volunteer receives only the enabled component keys and the photo rule (the other settings, such as scoring, follow-up questions, expense categories and the document checklist, stay with the officials);
  - syllabus: readable, because local দায়ীs teach from it;
  - the project answer leaves out budget, fund sources, staff and areas for a volunteer. Donor names never enter log lines; the audit entry of a fund-source change keeps them, readable by those who read the audit log.
- **Staff access goes to field officials, by role** (BR-061 "staff under the RPM"; owner decision in the plan review: by role, not by home area):
  - The grantee must be an active official holding Project Executive, Official দায়ী or Implementer; anyone else (a volunteer, Finance, Media, another PM) is refused with 422.
  - An RPM gives and ends access only with an `areaLocationId` inside their own areas on that project (403 otherwise), so one RPM cannot end what another RPM or the PM gave in another area. The PM may give and end access in any area of the project.
  - Delete access is given only by the PM; an RPM may give view and edit.
- **Every setup write locks the project row** (`SELECT … FOR UPDATE`) and checks `editableIn` inside that lock, like the lifecycle actions. A setup write therefore never lands on a project that a concurrent start-closing has made read-only, nor between the activation check and the snapshot.
- **Close guards fail closed.** The guard registry lists each guard key with its check; the keys of modules not built yet (`stock.balanced`, `animal_photos.complete`) are on an explicit "not built yet" list and pass, recorded in D-095. Any other unknown key fails the close with 409, so a misspelled or forgotten guard can never pass silently.
- **Plan ids stay in this plan**: code, comments and test names describe the meaning in words; DECISION_LOG and BR references in comments follow the repository convention (O-68).
- **Optimistic concurrency and audit follow the existing routes:**
  - the state change in `apps/api/src/routes/users.ts`: `etagOf`/`assertIfMatch` from `core/etag.ts`, and `reasonRequestSchema`;
  - `AuditWriter` with the before and after state, written in the same transaction as the change (`services/access.ts`).

  Every write route declares its `x-audit` action; `assertAudited` already refuses a write route without one.
- **Project scope** (`access/scope.ts` `projectWhere`):
  - the PM sees their program;
  - the RPM and area staff see their areas;
  - project staff see their projects through `project_staff`;
  - the global roles see everything.

  Volunteers see only active projects they are assigned to (BR-054): the project service adds `status = 'active'` for a caller whose kind is volunteer.
- **The application id sequence** (O-03): creating a project also creates its `id_sequences` row `app:<projectId>`, as the demo seed does (`apps/api/seed/sets/demo/index.ts`).
- **Web.**
  - Admin pages follow `admin/volunteers/` (a list with its filters in the URL through `use-tab-view.ts`) and `admin/registrations/` (reason dialogs).
  - The setup screen follows the mockup `docs/ui/mockups/12-project-setup.html` and SCR-060:
    - the section index is a list of links to anchored sections;
    - each section has its own form and save button, so saving one part never sends another;
    - component settings open in the `Drawer` of `packages/ui`.
  - The setup screen is a new pattern: no screen yet edits one record in many independent sections.

## Implementation units

### U1. Decisions, permissions and shared project rules
- **Goal:** the decisions, the permission names, the error codes and every pure project rule exist before any route.
- **Requirements:** R2, R5, R6, R8, R12, R13, R15–R20, R28
- **Files:**
  - `docs/DECISION_LOG.md`: D-095, covering:
    - creation from a workflow and its component table;
    - the T1.11 activation check, and the two checks added later;
    - active projects editable except their identity;
    - the two-step close, and reopen from closing;
    - the cancelled status;
    - program deactivation;
    - area removal
  - `docs/BUSINESS_RULES.md`: BR-053, BR-055 and BR-057 amended; new BR-255 to BR-259 for cancel, deactivation, editing while active, the activation check and the workflow defaults
  - `docs/security/permissions.yaml`, `docs/security/RBAC.md`: `program.update`, `project.cancel`
  - `packages/shared/src/i18n/messages/{bn,en}/errors.json`: `project.read_only`, `project.code_taken`, `project.deadline_not_later`, `program.inactive`, `program.has_open_projects`, `program.pm_role_required`, `project.rpm_role_required`; also `docs/api/API_STANDARDS.md` (error list)
  - `packages/shared/src/projects/{workflow-defaults,lifecycle,setup-check,budget}.ts` with an `index.ts` and the package export `@css/shared/projects`, plus `packages/shared/src/projects/*.test.ts`
  - `packages/shared/src/jsonb/component-settings.ts` and `docs/database/json-schemas/project-component-settings.schema.json`: `application_kinds`, the list maximums, the corrected `scoring` comment
  - `apps/api/seed/sets/base/` (reference list `application_kind_default`: educational institution, personal garden) and `packages/shared/test/seed-data.test.ts` if it counts the lists
- **Approach:** the shared modules follow `packages/shared/src/volunteers/index.ts`: constants plus zod, with no Node imports. The budget is computed in integer paisa.
- **Tests:**
  - unit:
    - every workflow key gives its component set, and each set's settings pass `componentSettingsSchema`;
    - `per_project` starts without a photo rule, and the activation check reports it missing;
    - a workflow's single photo source fills the three proof kinds, and voucher and payment copy start as camera or gallery;
    - each stage of the six workflows maps to `{key, label: {bn, en}, photo_required}` and passes the stages schema;
    - a settings object with an unknown key and a list over its maximum are refused;
    - the transition table allows exactly the five transitions;
    - `editableIn` refuses code, program, year and workflow when active, and everything when closing, closed or cancelled;
    - the setup check lists each missing item, and nothing for a complete project;
    - fund sources of 1,000.10 + 499.90 equal a planned budget of 1,500.00;
    - the planned budget is cost × target, and null when either is missing.
  - integration: the conformance test still passes with `application_kinds`.
- **Done when:** `pnpm --filter @css/shared test`, `pnpm docs:check` and `pnpm i18n:check` pass, and the new permission names are in the YAML.
- **Depends on:** none
- **Size:** M
- **Risk area:** auth
- **Status:** done

### U2. Programs API
- **Goal:** the Department Head keeps programs; officials read them.
- **Requirements:** R1, R2, R3, R21, R28
- **Files:**
  - `apps/api/src/routes/programs.ts`, `apps/api/src/services/programs.ts`, `apps/api/src/container.ts`, `apps/api/src/app.ts`
  - `packages/shared/src/projects/programs.ts` (request schemas)
  - `docs/api/openapi.yaml`: `/programs`, `/programs/{programId}` GET and the new PATCH, `/programs/{programId}/pm`
  - `apps/api/test/integration/programs.test.ts`
  - `docs/security/AUTHORIZATION_MATRIX.md` (regenerated)
- **Approach:** follows `apps/api/src/routes/users.ts` and `services/users.ts` (etag, audit in the transaction).
  - A PM must hold the `program_manager` role; otherwise 422 `program.pm_role_required`.
  - Deactivation counts the program's draft, active and closing projects in the same transaction; if any exist, it is refused with 409 `program.has_open_projects`.
- **Tests:**
  - integration:
    - the Department Head creates a program, renames it and assigns a PM; each write has an audit entry with before and after;
    - a duplicate code answers 409, and a bad code 422;
    - assigning a user without the PM role answers 422;
    - deactivation with a draft project answers 409; without one it succeeds, and activation brings the program back;
    - a stale `If-Match` answers 412;
    - a PM, an RPM and the Finance Team can read the list; a PM cannot create or rename (403); a volunteer gets 403 on the list; no sign-in gets 401.
- **Done when:** the programs tests, the drift test and the matrix test pass.
- **Depends on:** U1
- **Size:** M
- **Risk area:** auth
- **Status:** done

### U3. Projects core API and the cancelled status
- **Goal:** a PM creates a draft from a workflow, reads and updates it, and cancels a draft.
- **Requirements:** R4, R5, R6, R7, R8, R9, R14, R16, R18, R21, R22, R28
- **Files:**
  - `apps/api/prisma/migrations/<ts>_project_cancelled/{migration.sql,down.sql}`, `apps/api/prisma/schema.prisma`, `docs/database/DATABASE_SCHEMA.md` (projects, L-project-status)
  - `apps/api/src/routes/projects.ts`, `apps/api/src/services/projects.ts`, `apps/api/src/access/scope.ts` (cancelled left out), `container.ts`, `app.ts`
  - `docs/api/openapi.yaml`: `/projects` GET and POST, `/projects/{projectId}` GET and PATCH, `/projects/{projectId}/cancel`; the schemas `Project`, `ProjectCreate`, `ProjectUpdate`
  - `apps/api/test/integration/projects.test.ts`, `apps/api/test/integration/migrations.test.ts` (the round trip is generic)
- **Approach:**
  - Creation runs in one transaction:
    - the project row;
    - its components, from `workflow-defaults.ts` and the workflow definition;
    - the `id_sequences` row;
    - the audit entry.
  - The code must be unique (409 `project.code_taken`), and the program must be active (409 `program.inactive`).
  - Updates check `editableIn` per field and return the new etag.
  - Moving a draft to another program (`programId`) needs the caller's `project.configure` in the target program too (403 otherwise), and the target program must be active (409 `program.inactive`).
  - The list filters by program, year and status inside `projectWhere`; volunteers see only active projects (BR-054). It pages by id, like `services/volunteer-list.ts`.
- **Tests:**
  - integration:
    - creation:
      - a PM creates a draft in their program, with the workflow's components switched on and the distribution photo source "camera only";
      - a PM of another program gets 403, and an RPM gets 403 on create;
      - a duplicate code answers 409, a missing workflow 422, and an inactive program 409.
    - updates:
      - PATCH on a draft changes name, year and limit, with audit before and after;
      - PATCH of the year on an active project answers 409 `project.read_only`, and any PATCH on a closing or a closed project 409;
      - a PATCH body with an unknown key answers 422;
      - a PM moving their draft into another program gets 403, and into an inactive program 409;
      - a stale `If-Match` answers 412.
    - cancel:
      - cancelling a draft with a reason sets status cancelled, removes it from the list, and the audit entry holds the reason;
      - cancelling an active project answers 409, and a cancel without a reason 422.
    - the list:
      - the PM sees their program's projects, an RPM the projects of their areas, and the Department Head all;
      - a volunteer sees none of the drafts, and `GET /projects/{id}` of a draft answers 404 to a volunteer;
      - a volunteer assigned to an active project receives no budget, fund sources, staff or areas in its answer.
  - integration (migration): the round trip of the new migration with a cancelled project present.
- **Done when:** the projects, migrations, drift and matrix tests pass.
- **Depends on:** U1
- **Size:** L
- **Risk area:** migration
- **Status:** todo

### U4. Setup parts: components, fund sources, areas, staff, syllabus
- **Goal:** every setup group of R8 to R13 can be saved on its own.
- **Requirements:** R8, R10, R11, R12, R13, R16, R18, R21, R28
- **Files:**
  - `apps/api/src/routes/project-setup.ts`, `apps/api/src/services/project-setup.ts`
  - `docs/api/openapi.yaml`:
    - `/projects/{projectId}/components` GET, `/components/{componentKey}` PATCH
    - `/fund-sources` GET and PUT
    - `/areas` GET and POST, `/project-areas/{areaId}/remove`
    - `/staff` GET and POST, `/project-staff/{assignmentId}/end`
    - `/syllabus` GET and PUT
  - `apps/api/test/integration/project-setup.test.ts`
- **Approach:**
  - Each write loads the project inside the caller's scope, locks its row (`SELECT … FOR UPDATE`), checks `editableIn`, writes, and audits, in one transaction.
  - Component settings are parsed with `componentSettingsSchema(key)`; a failure answers 422 with the field path.
  - An area's location must be a division, or a district of a division. Its RPM must hold the RPM role (422 `project.rpm_role_required`). A duplicate answers 409.
  - Staff access is given by the PM, or by the RPM inside their own area (`project.staff_access.manage`, scope REGION), and only to officials (see Technical decisions). The staff writes follow the project grants in `services/access.ts`.
  - Fund sources are replaced as one list; the donor name is required for `donor`.
- **Tests:**
  - integration:
    - components:
      - a component switched on with valid settings saves;
      - rating criteria of 6 items answer 422 naming the field;
      - an unknown component key answers 404.
    - fund sources:
      - fund sources replace the list and are audited;
      - a negative amount answers 422, and `donor` without a label 422.
    - areas:
      - an area with an RPM saves;
      - a user without the RPM role answers 422, and an upazila 422;
      - the same area and RPM twice answer 409;
      - removing an area works and is audited.
    - staff:
      - the RPM gives a staff member of their area view and edit access;
      - giving access to a volunteer, to the Finance Team or to another PM answers 422; an RPM giving access for an area outside their own gets 403;
      - an RPM giving delete access gets 403; the PM may;
      - a second RPM of the same project ending an access given in the first RPM's area gets 403;
      - an RPM of another region gets 403 (another user refused);
      - the PM ends the access.
    - syllabus: the new list replaces the old one, in order.
    - every write on a closing and on a closed project answers 409 `project.read_only`, and a volunteer gets 403 on every write;
    - another program's PM gets 404 on every setup GET and write, and an RPM of another region 404 on area remove and staff end (another user refused);
    - a volunteer gets 403 on the fund-source, staff and areas GETs, and receives only the enabled keys and the photo rule from the components GET;
    - settings with an unknown key and a stage list of 31 answer 422;
    - a fund-source write racing a start-closing: the write either lands before the status change or gets 409, never after it.
- **Done when:** the project-setup, drift and matrix tests pass.
- **Depends on:** U3
- **Size:** L
- **Risk area:** auth
- **Status:** todo

### U5. Lifecycle API: activate, extend, start closing, close, reopen
- **Goal:** the project moves through its life only as the rules allow.
- **Requirements:** R9, R15, R17, R18, R19, R20, R21, R28
- **Files:**
  - `apps/api/src/routes/projects.ts` (lifecycle routes), `apps/api/src/services/project-lifecycle.ts`
  - `docs/api/openapi.yaml`: `/activate`, `/extend-deadline`, `/start-closing`, `/close`, `/reopen`
  - `apps/api/test/integration/project-lifecycle.test.ts`
- **Approach:**
  - Every action, in one transaction:
    1. takes a row lock on the project (`SELECT … FOR UPDATE`);
    2. checks the transition with `PROJECT_TRANSITIONS`;
    3. runs its check;
    4. writes the status and its timestamps;
    5. audits with the reason.
  - Activation runs `setup-check.ts` on the loaded data. On success it stores `workflow_snapshot` (the workflow definition plus the project's component settings) and `activated_at`.
  - The extension is allowed only while the project is active, and takes a date later than the current end date (otherwise 409 `project.deadline_not_later`).
  - Close runs the snapshot's `project_close_guards` through the guard registry: the keys on the "not built yet" list pass, any other unknown key fails the close with 409 (see Technical decisions). The warning list of unfinished applications stays empty until Phase 2.
- **Tests:**
  - integration:
    - activate:
      - activating an incomplete draft answers 409 with the list of missing items;
      - a complete draft activates and stores the snapshot;
      - fund sources one taka short of the budget block activation.
    - extend:
      - a later date with a reason works;
      - an earlier date answers 409, a missing reason 422, and extending a draft 409.
    - close and reopen:
      - start closing and close each need a reason;
      - close from active, skipping closing, answers 409;
      - reopen from closing and from closed returns the project to active;
      - reopening a draft answers 409.
    - who may act: a PM of another program gets 404 and an RPM 403 on every action; the Department Head and the Monitoring Team may act.
    - two activations at once: one wins, the other gets 409;
    - a close whose snapshot lists an unknown guard key answers 409.
- **Done when:** the lifecycle, drift and matrix tests pass.
- **Depends on:** U3, U4
- **Size:** M
- **Risk area:** auth
- **Status:** todo

### U6. Web: programs, project list and the tabs' project picker
- **Goal:** officials find programs and projects, and the T1.10 tabs pick a project by name.
- **Requirements:** R22, R23, R26, R27
- **Files:**
  - `apps/web/src/admin/programs/{ProgramsPage,ProgramDialog,programs-api}.tsx`
  - `apps/web/src/admin/projects/{ProjectsPage,NewProjectDialog,projects-api,ProjectPicker}.tsx`
  - `apps/web/src/admin/{navigation,roles}.ts`, `apps/web/src/routes/index.tsx`
  - `apps/web/src/admin/volunteers/VolunteersPage.tsx`, `apps/web/src/admin/beneficiaries/BeneficiariesPage.tsx`
  - the bn and en `admin.json` catalogues, and tests next to each page
- **Approach:**
  - The list follows `admin/volunteers/VolunteersPage.tsx`: Table and TableToolbar, with the filters in the URL through `use-tab-view.ts`.
  - The dialogs follow `admin/registrations/StaffDecisionDialog.tsx` (a dialog with a form).
  - The new-project dialog asks for code, name, year, program and workflow, creates the draft and opens `/admin/projects/:projectId`. In U6 that route is a small placeholder page (name, code, status badge, a link "সেটআপ" to `/admin/projects/:projectId/setup`); U7 adds the setup screen and U8 replaces the placeholder with the overview. So U6 does not wait for U7.
- **Tests:**
  - unit (component):
    - the program list shows code, name, PM and active state; only the Department Head sees "নতুন প্রোগ্রাম" and the edit action;
    - the project list shows status badges and keeps the program, year and status filters in the URL;
    - the new-project dialog refuses a lower-case code before sending, and shows the server's "code taken" message;
    - the volunteer tab's project filter offers the projects by name and sends `projectId`;
    - a volunteer gets the forbidden page;
    - no accessibility violations.
- **Done when:** the web tests pass, and the pages work at 360 px.
- **Depends on:** U2, U3
- **Size:** M
- **Risk area:** none
- **Status:** todo

### U7. Web: the project setup screen (SCR-060)
- **Goal:** the PM fills the setup section by section and sees what is missing.
- **Requirements:** R7–R16, R24
- **Files:**
  - `apps/web/src/admin/projects/setup/{ProjectSetupPage,BasicsSection,BudgetSection,WindowSection (the application window and the per-volunteer limit),AreasSection,StaffSection,ComponentsSection,ComponentDrawer,SyllabusSection,SetupSummary}.tsx`
  - `apps/web/src/admin/projects/setup/setup.test.tsx`, `apps/web/src/admin/admin.css`, the `admin.json` catalogues
- **Approach:**
  - The layout follows the mockup `docs/ui/mockups/12-project-setup.html`: the section index on the left (links to anchors), the editor in the centre, and the summary on the right (the missing items from `setup-check.ts`).
  - Each section loads from its GET and saves with its own PATCH or PUT and the etag. A 412 reloads the section with a message.
  - Component rows use `RowToggle`. Settings open in the `Drawer`, with fields per settings schema:
    - photo rule and photo sources;
    - rating criteria, up to five;
    - stages, with their order;
    - application kinds;
    - beneficiary types, with the BD-14 defaults;
    - team members allowed.
  - `editableIn` decides which fields are read-only while active, and locks everything in closing and closed (an `Alert` with the reason).
  - On a phone an `Alert` says "এই পর্দা বড় স্ক্রিনে ভালো চলে।", and only the name, the dates and the toggles stay editable.
- **Tests:**
  - unit (component):
    - each section saves only its own data, and the summary updates its missing list;
    - the component drawer refuses a sixth rating criterion and shows the server's 422 field error;
    - the year field is read-only on an active project, and every field on a closed one;
    - a stale etag shows the reload message;
    - at phone width the alert shows and only the allowed fields stay editable;
    - no accessibility violations.
- **Done when:** the web tests pass; the screen matches the mockup's layout at 1280 px and works at 360 px.
- **Depends on:** U4, U6
- **Size:** L
- **Risk area:** none
- **Status:** todo

### U8. Web: the project overview and lifecycle actions
- **Goal:** the PM sees the project at a glance and moves it through its life.
- **Requirements:** R6, R9, R15, R17, R19, R20, R25
- **Files:** `apps/web/src/admin/projects/{ProjectOverviewPage,LifecycleActions,ReasonDialog}.tsx`, `apps/web/src/admin/projects/overview.test.tsx`, the `admin.json` catalogues
- **Approach:**
  - The reason dialog follows `admin/registrations/CorrectionDialog.tsx`.
  - Buttons show by the caller's roles and the project's status (`PROJECT_TRANSITIONS`); the server still decides.
  - A refused activation shows the missing list from the 409 answer.
- **Tests:**
  - unit (component):
    - the buttons follow the status:
      - a draft shows "সক্রিয় করুন" and "বাতিল করুন";
      - an active project shows "সময়সীমা বাড়ান" and "বন্ধ শুরু করুন";
      - a closing project shows "বন্ধ করুন" and "আবার খুলুন";
      - a closed project shows "আবার খুলুন".
    - each action asks for a reason where one is required, and refuses an empty one;
    - an activation refused by the server lists the missing items;
    - an RPM sees the overview without the lifecycle buttons;
    - no accessibility violations.
- **Done when:** the web tests pass.
- **Depends on:** U5, U7
- **Size:** M
- **Risk area:** none
- **Status:** todo

### U9. E2E, status and the repository map
- **Goal:** the journey runs in a browser and the documents follow.
- **Requirements:** R29, and R1–R28 through the journey
- **Files:** `apps/web/e2e/projects.spec.ts`, `apps/web/e2e/support/admin.ts` (reused), `docs/STATUS.md`, `CLAUDE.md` (map), `docs/ui/SCREENS.md` (SCR-060, the list and the overview), and `docs/testing/DEMO_ACCOUNTS.md` if the demo data changes
- **Approach:** follows `apps/web/e2e/volunteers.spec.ts` and `support/admin.ts`.
  - `volunteers.spec.ts` uses `pm.hum@example.org` on phones, so this spec uses `pm.ucd@example.org` on the desktop only.
  - Each run creates its own code (`E` plus random letters), so runs do not collide.
- **Tests:**
  - e2e (desktop):
    1. Signed in as `pm.ucd@example.org`, open "প্রকল্প" in the admin menu and press "নতুন প্রকল্প". Fill the code, the name, the year 2026 and the workflow "বিতরণ". The setup screen opens with the badge "খসড়া".
    2. "সক্রিয় করুন" lists the missing items.
    3. Fill and save each section: the budget (cost 1000, target 100, fund source যাকাত 100000), the window with the per-volunteer limit 50, one area (ঢাকা with আরপিএম ঢাকা (নমুনা)), and the photo rule "দলগত" in the distribution component's drawer. A reload keeps them.
    4. "সক্রিয় করুন" → the badge "সক্রিয়", and the year field is read-only.
    5. "বন্ধ শুরু করুন" with a reason → "বন্ধ হচ্ছে". Then "বন্ধ করুন" with a reason → "বন্ধ", and every field is read-only.
    6. "আবার খুলুন" with a reason → "সক্রিয়".
    7. A second draft is cancelled with "বাতিল করুন" and leaves the list.
  - e2e (both projects):
    - a volunteer has no "প্রকল্প" menu, and `/admin/projects` shows the forbidden page;
    - the list and the overview do not scroll sideways at 360 px.
- **Done when:** `pnpm e2e` passes twice, and STATUS names T1.11 done and T1.12 next.
- **Depends on:** U8
- **Size:** M
- **Risk area:** none
- **Status:** todo

## Checkpoints
- **Mode:** grouped (one by one 10, grouped 17, all at once 0). N is over 4, so one by one's score goes to grouped.
- **Signals:** N 9, L 2,100, R 5, Fd 4, C 7, P 1
- **C1** after U1: foundation for U2 and U3, and the permission names (auth)
- **C2** after U2: the programs API with new permissions (auth)
- **C3** after U3: foundation for U4–U6, and a migration
- **C4** after U4: the setup writes with area and staff scope (auth), foundation for U5 and U7
- **C5** after U5: the lifecycle (auth), which the overview builds on
- **C6** after U7: the setup screen, a new pattern
- **C7** after U9: end (full-branch scripted checks)

## Verification
- `pnpm typecheck`, `pnpm lint` (includes `i18n:check`), `pnpm docs:check`
- `pnpm test` (projects shared, ui, web, api and api-db; per project with `--maxWorkers=2` if the Windows worker crashes)
- `pnpm --filter @css/api authz:matrix`: the report changes with the new routes, so commit it
- `pnpm build`, then `pnpm e2e` twice. A later `pnpm build` replaces the E2E build, so run `pnpm e2e` last.
- A look at `/admin/projects`, the setup screen and the overview at 1280 px and at 360 px, signed in as `pm.ucd@example.org` and as `head@example.org`

## Risks and rollback
- **Migration:** U3 widens the status check and adds two nullable columns with an index.
  - `down.sql` turns cancelled projects back into drafts and restores the check. Only the cancel is lost, and the audit log still records it.
  - Nothing else in the schema changes.
- **Contract:** the T0.18 operations change shape (the create source, the update rules, the split close). No client uses them yet, so nothing breaks, and the drift test keeps the code and the contract equal.
- **Authorization:** the new routes use PROGRAM and REGION scope.
  - Guards: the matrix test, and a "another program's PM is refused" case per route.
  - Rollback: revert the route commits.
- **Seed:** the demo project WNT stays a draft, and no seed change is planned. If the E2E needs a known complete project, U9 adds one to the demo seed and updates DEMO_ACCOUNTS.

## Definition of done
- All units are done and their tests pass.
- The verification commands pass.
- `ae-review` has run at each checkpoint, with no open P0 or P1.
- Code from abandoned attempts is removed.

## Progress
- **Branch:** `feat/program-project-setup` (from `feat/volunteer-beneficiary-tabs`, because PR #1 and PR #2 were still open on 2026-10-15)
- **Updated:** 2026-10-15
- **Next:** U3 the projects core API and the cancelled status
- **Reviewed through:** C2 at c2079e7
- **Uncommitted:** none
- **Notes:** U1: `@css/shared/projects` (workflow defaults, lifecycle, setup check, budget in paisa); the shared tests live in `packages/shared/test/projects.test.ts` because they read the workflow yaml files with node:fs (the shared src stays free of Node imports). The application kinds of tree planting are workflow `overrides.application_types`, not `defaults`. Error codes `workflow.transition_not_allowed` and `workflow.guard.project_setup_complete` already existed; new: `project.read_only`, `project.code_taken`, `project.deadline_not_later`, `project.rpm_role_required`, `project.staff_role_required`, `program.inactive`, `program.has_open_projects`, `program.pm_role_required`, `program.code_taken`. Two new permissions raise the counts in `seed.test.ts`, `registry.spec.ts` and `effective.spec.ts` (143, Monitoring 142). C1 (no P0 or P1): money is BigInt paisa (a large cost times target lost precision as a number); the activation check tests the values (window order, limit a whole number of at least 1, cost and target above zero, unreadable amounts listed, never thrown); the photo rule is a project-wide setting on the `distribution` row and is checked whether that component is on or not (missing item `photo_rule`); a "per project" workflow keeps its photo source and leaves only the rule open; only the end date is fixed while active (the owner's answer said the end date; D-095 corrected); the photo enums and a bounded label are shared from `jsonb/component-settings.ts` and `jsonb/common.ts`. Left open (P3): `scoring.criteria[].rule` is an unbounded record; scoring is not wired to a component until Phase 2, which should type it. U2: `GET/POST /programs`, `GET/PATCH /programs/{programId}`, `POST /programs/{programId}/pm` (`routes/programs.ts`, `services/programs.ts`, request schemas in `@css/shared/projects`); `programWhere(scope)` in `access/scope.ts` (GLOBAL all, PROGRAM the PM's own, and the programs of the projects a project or area grant reaches). An RPM's PROGRAM grant of `program.view` resolves to the programs it is PM of, so an RPM sees no program in the list unless it also reaches a project; the project list (U3) gives RPMs their projects. Masked-entity routes need a response schema (`define-route.ts`), so every program response has one. The contract gains `BoundedLabel`, `ProgramUpdate` and a flat `Program` with `pmName`. C2 (no P0 or P1): a deactivated program takes no PM (409 `program.inactive`); the doc comments sit on their own functions; tests for creating with a PM, the audit of deactivate and activate, the PM route refusals and 401s, an RPM reading no program, and a unit test of `programWhere`. For U3: project creation must lock the program row and check it is active in its own transaction, so a deactivation running at the same moment cannot leave a draft under an inactive program. Kept: assigning a PM takes no If-Match (the row lock serialises it and the audit keeps the before state).
