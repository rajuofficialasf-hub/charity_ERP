---
title: The application rules — score, quotas, waitlist, field unlock, transfer and the verification queue (T2.6)
type: feat
status: in-progress
source: brainstorm
date: 2026-10-25
doc_review: 2026-10-25
---

# The application rules — score, quotas, waitlist, field unlock, transfer and the verification queue (T2.6)

## Goal
When more people apply than a project can serve, officials sort the applications by a transparent score with the area quotas in view, approve, waitlist or reject with the reasons on record, and pull the next person from the waitlist in one click. After approval a single answer can still be corrected through a logged unlock, a volunteer's applications can be handed to another volunteer without losing their history, and public-link entries are checked and either matched to a person or refused.

## Problem
T2.5 built the cycle up to approval, but the office still decides in arrival order with no score or quota, the waitlist and the field unlock are declared in the templates but refused by the engine, a blocked or absent volunteer's applications have nobody to carry them, and a public-link entry can only be refused, never accepted. Blueprint A7 (priority score, quotas and waitlist; field unlock and change control; application transfer) and BD-07, BD-16, BD-17, BD-18 and BD-48 ask for all of these before the Phase 3 pilot.

## What already exists (verify and test, do not rebuild)
- The per-volunteer limit and the application window are enforced by the guards `limit.not_exceeded` and `deadline.open` (T2.5); the PM's deadline extension with a reason exists in `ProjectLifecycleService.extendDeadline` (T1.11).
- One live application per person per project is a unique index (BR-016); the beneficiary and volunteer blocklist checks run at create and submit (T2.5).
- The family-duplicate warning is shown on the office's record (`familyDuplicateWarnings`, T2.5) from the matches of T2.2.
- The tables `application_scores`, `project_quotas`, `field_changes` (with `unlock_state`, `requested_by`, `approved_by`) and `application_transfers` exist from T0.13; the template actions `waitlist`, `pull_from_waitlist`, `verify_link` and the field-unlock transitions are declared in `_common.yaml` and refused by the engine as later actions.

## Requirements

### Limit, deadline, duplicates and blocks (already built; prove and document)
- **R1** The server refuses a new application or a submission when the volunteer's limit is reached or the application window is closed, and accepts again after the PM extends the deadline with a reason; every refusal and extension is tested and BR-058 and BR-059 record it.
- **R2** A second live application of the same person in the same project, and an application for a blocked person or by a blocked volunteer, are refused at entry, each tested through the API.
- **R3** The family-duplicate warning appears on the office's review page for the officials only, with the matched person and the rule that matched.

### Priority score
- **R4** Scoring is optional per form: the Monitoring Team may give points to questions of a ready form in the form builder (points per option of a choice question, points per range of a number question), plus the built-in criterion "আগে সহায়তা পাননি"; a form without points gives no score.
- **R5** The points belong to the form version: changing them makes a new version, a project that places the form uses its points, and the PM cannot change them.
- **R6** The score is computed out of 100 when the application is sent to the office and again on every answer change until the decision, and the score and the criteria used are snapshotted at the decision (O-21).
- **R7** "আগে সহায়তা পাননি" holds when the person has no application in an earlier project of the same program that reached approved or a later state.
- **R8** The score and its breakdown are shown to officials only; volunteers and team members never see them, on screens or in any response.
- **R9** The score never approves, waitlists or rejects by itself; it only sorts the office's list (highest first when the project's form has points) and is shown beside each application.

### Quotas
- **R10** The PM sets optional targets per district or per union in the project setup, also on an active project, every change audited.
- **R11** The office's review screen shows, for each quota area, the target, the number received and the number approved; an area over its target is marked with a warning tone.
- **R12** A quota never blocks an approval; approving in an area that has reached its target asks for a comment.

### Decisions and the waitlist
- **R13** The three outcomes of a reviewed application are approve, waitlist with a reason, and reject with the two texts of D-131.
- **R14** A decision against the score order needs a comment: approving while a higher-scored application in the same quota area is still reviewed or waitlisted, or waitlisting or rejecting while a lower-scored one in that area is approved. The quota area is the union when union quotas exist, else the district, else the whole project; a project without points has no score order.
- **R15** "পরেরজনকে আনুন" pulls the highest-scored waitlisted application of a quota area into approved in one click (the earliest waitlisted when the form has no points); pulling any other waitlisted application is allowed with a comment.
- **R16** A waitlisted application can also be rejected with its two texts; the volunteer sees the state "অপেক্ষমাণ তালিকায়" and is notified of the move and of a later pull or rejection.

### Field unlock
- **R17** An official opens one answer of an approved application with a reason; the answer becomes editable for the main volunteer, or, when the application has no volunteer, for an official.
- **R18** The new value is verified by an official, who approves it (the answer changes and locks again) or refuses it with a reason (the old value stays and the answer locks again); the person who entered the value cannot verify it.
- **R19** The old and new value, the requester, the person who entered, the verifier, the reason and every time are logged on the application's change log and in the audit log.
- **R20** The identity number, the name and the father's or husband's name cannot be unlocked; they change only through the beneficiary profile correction request (BD-02). A mobile or address change made through an unlock goes through the contact service with its own change log.
- **R21** No unlock can be opened, filled or verified on a project that is closed (BD-20); only one unlock per answer is open at a time.
- **R33** Text, number, choice, date and address answers can be unlocked; photo and file answers cannot for now, and an answer of the official section is filled by an official, never by the volunteer. An open unlock has no time limit: an official can cancel it with a reason (the old value stays), a transfer hands it to the new volunteer, and a blocked volunteer can no longer fill it.

### Application transfer
- **R22** An RPM, or a Project Executive the RPM has granted it, transfers all or selected applications of one volunteer to another volunteer assigned to the same project, with a reason; a volunteer not yet assigned can be assigned in the same flow.
- **R23** The new volunteer gets the full access the old one had, by state; the old one no longer sees the transferred applications anywhere, including those they created themselves.
- **R24** The transfer decides whether the old volunteer's team members on the project move under the new volunteer (the RPM chooses, as blueprint A5 says).
- **R25** The transferred applications count toward the new volunteer's limit; a transfer that takes the new volunteer over the limit is allowed with a warning, and the new volunteer cannot create new applications until back under the limit.
- **R26** Who, from whom, to whom, when, on whose authority and why is logged on each application (its timeline) and in the audit log; the beneficiary's history stays intact.

### The verification queue
- **R27** The office has a "যাচাইয়ের অপেক্ষায়" queue of the project's needs-verification applications with their flags (public entry, existing identity, blocked identity, repeated identity).
- **R28** For each entry an official links it to the existing profile (when the identity exists), creates a new profile (when it does not), or refuses it with a reason; link and create move it to submitted with a number.
- **R29** At verification the official may choose a volunteer of the project to own the application; without one the application stays the office's, and a later transfer can give it a volunteer.
- **R30** An entry whose identity belongs to a blocked person cannot be linked or created; it can only be refused.

### Proof
- **R31** Each rule above is a BR in `docs/BUSINESS_RULES.md` with its tests in the register; `openapi.yaml` describes every new or changed operation.
- **R32** End-to-end journeys: score → waitlist → pull from the waitlist; a field unlock from opening to verification; a transfer after which the old volunteer sees nothing.

## Scope
- In: the requirements above; the screens they need (the scoring points in the form builder, the quota targets in the project setup, the score, quota bars, waitlist actions and the unlock on the office's review screen, the unlock answer on the volunteer's record, the transfer screen, the verification queue); the notifications of the waitlist, the pull and the unlock.
- Out (not now): the offline-conflict entries of the verification queue (the queue shows them once T2.7's sync creates them); free scoring formulas (T2.4d's formula work may add them later); the split view of the review screen (the list and the record stay two pages); score-based automatic decisions of any kind; the "not distributed" and "shortage" edge states of distribution (Phase 3); next year's "not previously assisted" for approved-but-not-served people (they count as assisted until Phase 3 records what was delivered).

## Key decisions
- **Scoring is optional and set by the Monitoring Team in the form builder**, not by the PM in the project setup: the Monitoring Team builds the forms, so the points travel with the ready form and its versions. This changes the "PM-defined criteria" of BD-17 and BR-097 and goes into DECISION_LOG before implementation. Governs R4, R5.
- **Points per question**: options and number ranges carry points, plus the built-in "আগে সহায়তা পাননি" criterion; total out of 100. Governs R4, R6.
- **"Not previously assisted" means never approved in the same program**: help from another program (winter clothing versus house construction) does not remove the points. Governs R7.
- **Quotas warn, never block**: a full area is marked and an approval there asks for a comment; the decision stays with people. Governs R11, R12.
- **"Against the score" is judged inside the quota area** (union, else district, else project), in both directions. Governs R14.
- **The score is for officials only**, like ratings and categories, so nobody changes answers to raise it. Governs R8.
- **The PM sets the quotas** in the project setup, also on an active project, audited. Governs R10.
- **Field unlock goes to the volunteer, or to the office when there is none**; a second person verifies. Governs R17, R18.
- **Transferred applications count toward the new volunteer's limit**, and a transfer may exceed it with a warning. Governs R25.
- **A verified public entry may get a volunteer, or stay the office's**. Governs R29.
- **Only text, number, choice, date and address answers unlock for now**; photos and files wait for the photo rules of Phase 3 (owner at the doc review, 2026-10-25). Governs R33.
- **An open unlock never expires; the office cancels it with a reason**, a transfer moves it to the new volunteer and a block stops the old one (owner at the doc review, 2026-10-25). Governs R33.

## Open questions
None blocking. Assumptions the plan works from (the owner may correct them at plan review): the score is shown with one decimal; the volunteer's record shows "অপেক্ষমাণ তালিকায়" without a position number.

## Technical decisions
- **Stack profile unchanged** (ST-40, ST-43): React 19 + Vite, Express 5, PostgreSQL 17 through Prisma 7, the own auth and the storage adapter, as in `CLAUDE.md`; this task adds no piece of the stack and no dependency (ST-30).
- **The score is a pure function in the shared package** (`packages/shared/src/forms/score.ts`, next to `evaluate.ts`): the definition and the answers in, the breakdown and the total out, so the API, the builder and the tests use one calculation (constitution §13, no duplicated calculations).
- **The points live in the form definition**: `settings.score` on a question (`options`: points per option code; `ranges`: `[{ min?, max?, points }]`, the first match wins) and an optional top-level `scoring: { not_previously_assisted: points }`. Choice questions (single select, radio, multi select, checkbox; a multi select adds its chosen options) and number, decimal, money and calculated number questions may carry points; the publish check refuses points on any other type and a maximum total above 100. The zod schema and the JSON schemas in `docs/database/json-schemas/` change together (ST-07, ST-12).
- **The total is kept on the application as well** (`applications.total_score`, numeric, nullable, with an index on `(project_id, total_score DESC, id)`), so the office's list can page by score with the keyset cursor the other lists use; `application_scores` keeps the breakdown, the criteria used and `snapshot_at` (O-21). Both are written in the same transaction.
- **"Not previously assisted" is read at each computation**: the person has no application in another project of the same program with `approved_at` set and a state other than deleted (merged profiles already carry their moved applications, BD-05).
- **The score is masked like the official section** (`sensitive(..., OFFICIAL_SECTION)` in `apps/api/src/applications/view.ts`), so a volunteer's response never carries it; `sort=score` is accepted only from a caller whose field classes include the official section (others get 422 `validation.failed` on `sort`), and the keyset cursor of a list sorted any other way never holds the score.
- **The score is written inside the move's transaction**: the engine gets an effect runner that takes the transaction (`apply()` in `apps/api/src/workflow/engine.ts`), and `score.compute`, `score.snapshot`, `waitlist.enqueue`, `waitlist.dequeue` and `needs_verification.link` move from declared to built in `apps/api/src/workflow/registry.ts`; `readEffects` stays the pure reader of the outcome.
- **The waitlist order has its own column**: `applications.waitlisted_at`, stamped by `waitlist.enqueue` and cleared by `waitlist.dequeue`, in U3's migration, so the pull orders by score then by `waitlisted_at` without reading the append-only transitions.
- **Quota progress is counted live**, not from `project_quotas.approved_count`: received = applications sent to the office (not draft, deleted or needs verification), approved = `approved_at` set; the counter column stays unwritten and DATABASE_SCHEMA says so, so nothing can drift from the truth. The `quota.increment` effect becomes a no-op the engine accepts.
- **The comment rules are guards that ask for a comment** (`workflow.comment_required`, 422, the reason in the error details: against the score order, a full quota area, a pull that is not the next in order). A guard may now return a refusal with a code and details instead of `false`; the engine maps `comment_required` to 422 when the request carries no comment and lets the move pass when it does, and `decisionHints` calls the same guard functions, so the rule lives in one place. An area without a target row is never full but still has a score order: `score.comment_if_against_order` gets its real body and a new `quota.comment_if_full` sits on approve and pull; `_common.yaml` and the other templates go to version 3, with the waitlist, the pull and the two verification actions no longer "later". The record read gives the office `decisionHints` (which actions would ask for a comment now), so the screen asks before sending.
- **A bulk approval never gives a comment**, so a row that would need one fails with `workflow.comment_required` on its own and the official decides it alone (the bulk pattern of T2.5).
- **"পরেরজনকে আনুন" is its own operation** (`POST /projects/:projectId/waitlist/pull-next` with the quota area, under an `Idempotency-Key`; permission `application.waitlist`, the permission of the pull transition, with the caller's scope reaching the area; the area must be one of the project's quota or project areas, else 422): it locks the waitlisted rows of the area (`FOR UPDATE SKIP LOCKED`), takes the first by score then by waitlist time, and moves it through the engine, so two officials pulling at once get two different people.
- **The unlocked value is validated like any answer**: the value of `PUT /application-unlocks/:unlockId/value` goes through the answer validation of `writeAnswers` for that question of the application's form version (type, options, ranges, length); photo, file and identity questions cannot be opened (422); an answer of the official section is filled by an official only. The audit entry of each step follows the contact service's shape (`apps/api/src/services/beneficiary-contact.ts`), the values never go to the request log, and the volunteer's notification names the question, never the office's reason. A partial unique index on `field_changes (entity_id, field)` where `kind = 'unlock'` and `unlock_state IN ('open', 'updated')` keeps one open unlock per answer under concurrency (DB-TX-03).
- **The field unlock is its own small service, not an engine sub-workflow**, following the two-person correction of `apps/api/src/services/beneficiary-corrections.ts`: a `field_changes` row of kind `unlock` moves `open → updated → relocked` with who opened, who entered, who decided, the decision and the reason; a migration adds the columns and widens the status-log trigger's allowed columns (DB-MIG-*, with `down.sql`). The `field_unlock` block of `_common.yaml` stays as the documented shape.
- **A creator keeps access to an application only while they are its owner's user or an active team member of its owner on that project**: `applicationWhere` (SELF) in `apps/api/src/access/scope.ts` and `listMine` change together, so a transfer cuts the old volunteer and their team (unless the team moves) without rewriting `created_by_user_id`. The same test decides the recipients of the owner events in `apps/api/src/notifications/application-events.ts`, and every other reader of `createdByUserId` (the earlier-applications read in `apps/api/src/applications/service.ts`, `apps/api/src/services/beneficiary-contact.ts`) is checked against it.
- **A transfer's target must be fit for the work**: an active volunteer, not on the blocklist (BD-06), assigned to the project, or assigned in the same request, which then also needs `volunteer.assign_project` and passes the assignment service's own checks; a project that is not active refuses a transfer, as it refuses an unlock (BD-20).
- **Verification is scoped like the rest of the application**: `verify_link`, `verify_create` and the refusal need `application.verify_needs_verification` with the caller's scope reaching the application; the profile to link must be reachable through the beneficiary lookup (`BeneficiaryIdentityService.lookup`, its scope, daily limit and audit), and the dialog shows only what the lookup shows of it.
- **A transfer writes one `application_transfers` row per application under one batch id**, changes `owner_volunteer_id`, records a timeline step on each application and one audit entry for the batch, following `apps/api/src/services/handover.ts`; moving the team ends the old `volunteer_teams` rows and opens new ones under the new lead with the members' consent carried over (the consent is to the project's rules, not to the lead).
- **The limit counts by owner, live** (`limit.not_exceeded` in `apps/api/src/workflow/guards.ts`), so transferred applications count for the new volunteer without extra writes; the volunteer's screens read the same live count instead of `project_volunteers.applications_counted`, which nothing writes today.
- **Verification uses the engine's two actions**: `verify_link` (with the profile id, `beneficiary.not_blocked`) and a new `verify_create` (the profile created through `BeneficiaryIdentityService.createProfile` in the `beforeApply` hook, as the submission does), both numbering the application, with an optional owner volunteer who must be assigned to the project.
- **Waiting work appears on the My Work home**: two attention kinds, unlocks waiting for a decision and entries waiting for verification, through `ATTENTION_ROUTES` in `packages/shared/src/attention.ts` and `apps/api/src/services/attention.ts`.
- **IDs stay in the plan** (ORG-CMT-10, ORG-CMT-40, ORG-CMT-50): the code, its comments and its test names say what each rule means in words.

## Implementation units

### U1. The entry rules proven, and the live limit on the volunteer's screens
- **Goal:** the limit, the window, the extension, the duplicate and the blocklist checks are each proven through the API, and the volunteer sees the real number of applications left.
- **Requirements:** R1, R2, R3, R25 (the live count)
- **Files:** `apps/api/test/integration/applications.test.ts`, `apps/api/test/integration/workflow-engine.test.ts`, `apps/api/src/services/my-projects.ts`, `apps/api/test/integration/my-projects.test.ts`, `docs/BUSINESS_RULES.md`
- **Approach:** the guard tests of `workflow-engine.test.ts` ("the guards"); the counter reads the same live count as `limit.not_exceeded` (owner volunteer, every state but rejected and deleted).
- **Tests:**
  - integration: a submission after the window is refused, the PM extends the deadline with a reason, the same submission then passes; the volunteer's project shows the applications left from the live count, a team member's draft counting for the lead; a second live application of one person in the project is refused with its code; a blocked person and a blocked volunteer are refused at create.
  - existing: the window, limit and blocklist refusals are covered by `workflow-engine.test.ts` ("refuse a submission on a project that is not active, outside the window, over the limit") and `applications.test.ts`; the family warning by `applications.test.ts` ("shows the official section to the office only, and the family warning at review"); the extension by `project-lifecycle.test.ts`; the counter of `my-projects.ts` has no test reading a non-zero count, characterize first.
- **Done when:** the new tests pass and the register of BUSINESS_RULES names them for BR-010, BR-016, BR-047, BR-058 and BR-059.
- **Depends on:** none
- **Size:** S
- **Risk area:** none
- **Status:** done

### U2. Points in the form definition and the score calculation
- **Goal:** a form definition can carry points, the publish check keeps them valid, and one shared function computes the score.
- **Requirements:** R4, R5, R6 (the calculation), R7 (the criterion's points), R9
- **Files:** `packages/shared/src/forms/definition.ts`, `packages/shared/src/forms/score.ts`, `packages/shared/src/forms/score.test.ts`, `packages/shared/src/forms/definition.test.ts`, `packages/shared/src/forms/index.ts`, `docs/database/json-schemas/` (the form definition parts and `application-score-criteria.schema.json`), `docs/DECISION_LOG.md` (the scoring decision of this brainstorm, before any code), `docs/BUSINESS_RULES.md` (BR-097 to BR-101 reworded, a rule for the Monitoring Team's optional points)
- **Approach:** `evaluate.ts` for a pure evaluator over the definition and the answers; `checkDefinition` in `definition.ts` for the publish checks with codes.
- **Tests:**
  - unit: points of a single choice, of a multi select (sum of the chosen), of a number by range (first match, open ends), of a calculated number; a hidden question gives no points; "not previously assisted" adds its points only when the input says so; the total never exceeds 100; a definition without points gives no score (null, not 0); the breakdown names each question, the answer read and the points.
  - unit: the publish check refuses points on a text question, a maximum total above 100, and an option code that does not exist; a draft keeps them.
- **Done when:** the shared tests pass and DECISION_LOG holds the decision with the owner's words.
- **Depends on:** none
- **Size:** M
- **Risk area:** none
- **Status:** done

### U3. The score on the application
- **Goal:** the API computes the score at submission, on every answer change until the decision and at verification, freezes it at the decision, sorts the office's list by it and never shows it to a volunteer.
- **Requirements:** R6, R7, R8, R9
- **Files:** `apps/api/prisma/schema.prisma`, `apps/api/prisma/migrations/<timestamp>_application_scores/{migration,down}.sql` (`total_score` with its index, `waitlisted_at`, and `form_versions.scoring` for the form-level criterion), `apps/api/src/services/forms.ts` (the form-level scoring read, written and copied with the definition: draft save, publish, place, take, copy), `docs/database/json-schemas/` (the form version's scoring), `apps/api/src/applications/scoring.ts`, `apps/api/src/applications/service.ts`, `apps/api/src/applications/view.ts`, `apps/api/src/workflow/engine.ts`, `apps/api/src/workflow/effects.ts`, `apps/api/src/workflow/registry.ts`, `apps/api/src/routes/applications.ts`, `apps/api/test/integration/application-scores.test.ts`, `docs/api/openapi.yaml`, `docs/database/DATABASE_SCHEMA.md`
- **Approach:** an effect runner in `engine.ts` that takes the move's transaction runs the built effects with side effects (`score.compute`, `score.snapshot`, and the waitlist stamps for U6), calling `scoring.ts`, which reads the definition of the application's version, the answers and the person's history; `update()` in `service.ts` recomputes after `writeAnswers` while the state is submitted or under review; the list's `LIST_SORT_FIELDS` gains `score` with the keyset cursor of `core/pagination.ts`.
- **Tests:**
  - integration: a submission of a form with points stores the total and the breakdown; an edit under review changes it; the approval freezes it (a later unlock does not change it); a person approved in another project of the same program loses "not previously assisted", one approved in another program keeps it; the office's list sorts by score, highest first, and pages by cursor; the volunteer's record, own list and the project list never carry `totalScore`; a volunteer's `sort=score` is refused (422) and no volunteer cursor decodes to a score; a form without points leaves the score null and the list in arrival order.
  - existing: the volunteer masks are covered by `applications.test.ts` ("shows the official section to the office only, and the family warning at review"), extended for the score.
- **Done when:** the migration applies and reverts on a test database, and the tests pass.
- **Depends on:** U2
- **Size:** L
- **Risk area:** migration, personal data
- **Status:** done

### U4. The points in the form builder
- **Goal:** the Monitoring Team gives points to the questions of a ready form and to "আগে সহায়তা পাননি", seeing the maximum total.
- **Requirements:** R4, R5
- **Files:** `apps/api/test/integration/ready-forms.test.ts`, `apps/web/src/admin/forms/SettingsPane.tsx`, `apps/web/src/admin/forms/ScoreSettings.tsx`, `apps/web/src/admin/forms/ScoringDialog.tsx`, `apps/web/src/admin/forms/FormBuilderPage.tsx`, `apps/web/src/admin/forms/draft.ts`, `apps/web/src/admin/forms/diff.ts`, `apps/web/src/admin/forms/settings.test.tsx`, `apps/web/src/admin/forms/draft.test.ts`, `packages/shared/src/i18n/messages/{bn,en}/forms.json`
- **Approach:** a `Disclosure` group "নম্বর" in `SettingsPane.tsx` like the rules group, with the option rows of `OptionsEditor.tsx`; a header button "স্কোর" opening a dialog with the form-level criterion and the maximum total, like `VersionList` in a Modal; `diff.ts` names a points change in the version's change summary.
- **Tests:**
  - integration (`apps/api/test/integration/ready-forms.test.ts`): a PM cannot save points into a ready form's draft (403), the Monitoring Team can.
  - component: a choice question's options take points and save into the draft; a number question takes ranges; a text question offers no "নম্বর" group; the dialog shows "সর্বোচ্চ মোট: 100" and the publish is refused above 100 with the publish check's message; a published version is read-only; axe in bn and en.
- **Done when:** the builder tests pass and a ready form with points publishes.
- **Depends on:** U2, U3 (the form-level points are stored by U3)
- **Size:** M
- **Risk area:** none
- **Status:** done

### U5. The quotas of a project
- **Goal:** the PM sets district or union targets in the setup, also on an active project, and the office reads each area's target, received and approved.
- **Requirements:** R10, R11 (the numbers)
- **Files:** `apps/api/src/services/project-quotas.ts`, `apps/api/src/routes/project-setup.ts`, `apps/api/src/container.ts`, `packages/shared/src/projects/requests.ts`, `packages/shared/src/projects/lifecycle.ts`, `apps/web/src/admin/projects/setup/QuotasSection.tsx`, `apps/web/src/admin/projects/setup/wizard-steps.ts`, `apps/web/src/admin/projects/setup/setup-api.ts`, `apps/web/src/admin/projects/setup/setup.test.tsx`, `apps/api/test/integration/project-quotas.test.ts`, `docs/api/openapi.yaml`, `packages/shared/src/i18n/messages/{bn,en}/admin.json`
- **Approach:** `replaceFundSources` in `apps/api/src/services/project-setup.ts` (a replace-all list with If-Match, `editableIn`, audit) and `AreasSection.tsx` for the section; `GET /projects/:projectId/quotas` (targets and live progress, officials with `application.view` on the project) and `PUT /projects/:projectId/quotas` (`project.quota.manage`).
- **Tests:**
  - integration: the PM of the program sets two union targets and one district target, each change audited with before and after; the progress counts received and approved live; a target below zero, a union outside the project's areas and a level other than district or union are refused (422); the PM of another program is refused (403) and a volunteer gets nothing (403); a closed project refuses the change.
  - component: the setup section adds, edits and removes targets and shows the save state; axe.
  - existing: the setup screens are covered by `setup.test.tsx`, extended with the section.
- **Done when:** the tests pass and the setup shows "কোটা" as its own section.
- **Depends on:** none
- **Size:** M
- **Risk area:** auth
- **Status:** done

### U6. The decisions against the score, the waitlist and the pull
- **Goal:** the engine asks for a comment when a decision goes against the score order or a full quota, waitlists with a reason, and pulls the next person in one click.
- **Requirements:** R12, R13, R14, R15, R16
- **Files:** `docs/architecture/workflow-templates/*.yaml` (version 3), `packages/shared/src/workflow/actions.ts`, `apps/api/src/workflow/guards.ts`, `apps/api/src/workflow/engine.ts`, `apps/api/src/workflow/effects.ts`, `apps/api/src/workflow/registry.ts`, `apps/api/src/applications/service.ts` (`decisionHints`), `apps/api/src/applications/waitlist.ts`, `apps/api/src/routes/applications.ts`, `apps/api/src/notifications/application-events.ts`, `apps/api/src/notifications/catalogue.ts`, `packages/shared/src/notifications/templates.ts`, `apps/api/test/integration/application-decisions.test.ts`, `apps/api/src/workflow/engine.spec.ts`, `docs/api/openapi.yaml`, `docs/architecture/WORKFLOW_ENGINE.md`, `docs/architecture/NOTIFICATIONS.md`
- **Approach:** the `actor.not_creator` guard of T2.5 for a guard reading other applications, with the guard contract widened to return a refusal with a code and details; the bulk review's per-row savepoint and idempotency (`apps/api/src/applications/bulk.ts`) for the pull; the area is the union when the project has union quotas, else the district when it has district quotas, else the project.
- **Tests:**
  - unit: the action table maps waitlist, pull, verify link and verify create; every template at version 3 names only built guards and effects.
  - integration: approving a lower-scored application while a higher one of the same union waits needs a comment (422 `workflow.comment_required`), passes with one, and the comment is in the timeline for the office only; rejecting or waitlisting while a lower-scored one is approved needs a comment; an application in another union does not count; approving in a full quota area needs a comment; waitlisting needs a reason; "pull next" takes the highest-scored waitlisted of the area, and the earliest waitlisted when the form has no points; two pulls at once take two different people; pulling a specific waitlisted application that is not next needs a comment; a waitlisted application is rejected with both texts; the volunteer is told of the waitlisting and of the pull without the office's reason; a bulk approval fails the row that needs a comment and passes the others; the creator still cannot decide; the pull is refused to a volunteer (403), to an official of another region (404) and for an area of another project (422); an application in a union without a target is never "full" but still sorted.
  - existing: the decision rules are covered by `workflow-engine.test.ts` and `application-cycle.test.ts`; their template version assertions move to 3.
- **Done when:** the tests pass and `WORKFLOW_ENGINE.md` lists the built guards and effects.
- **Depends on:** U3, U5
- **Size:** L
- **Risk area:** auth
- **Status:** done

### U7. The office's review screen with score, quotas and the waitlist
- **Goal:** the officials see the score, the quota bars and the waitlist on the review screens and decide with the comment asked when needed.
- **Requirements:** R3, R9, R11, R12, R14, R15, R16
- **Files:** `apps/web/src/admin/applications/ApplicationsPage.tsx`, `apps/web/src/admin/applications/ApplicationReviewPage.tsx`, `apps/web/src/admin/applications/QuotaBars.tsx`, `apps/web/src/admin/applications/ScoreBreakdown.tsx`, `apps/web/src/admin/applications/DecisionDialog.tsx`, `apps/web/src/admin/applications/applications-api.ts`, `apps/web/src/admin/applications/applications.test.tsx`, `packages/shared/src/i18n/messages/{bn,en}/applications.json`
- **Approach:** the list and review page of T2.5; the set's progress bar for the quotas and `apps/web/src/admin/StatisticsBar.tsx` for the area figures; `DecisionDialog` gains the comment box when `decisionHints` asks for it.
- **Tests:**
  - component: the list shows a "স্কোর" column sorted highest first and hides it for a form without points; the quota bars show "লক্ষ্য 50 · এসেছে 72 · অনুমোদিত 40" with the warning tone over target; the record shows the score breakdown; "অপেক্ষমাণ তালিকায় রাখুন" asks a reason; approving against the order asks "কেন স্কোরের ক্রম ভেঙে সিদ্ধান্ত নিচ্ছেন?" before sending; "পরেরজনকে আনুন" sends one request for the area and names who was pulled; a 422 `workflow.comment_required` from a race opens the comment box; axe in bn and en.
  - existing: the screens are covered by `apps/web/src/admin/applications/applications.test.tsx`, extended.
- **Done when:** the tests pass and the screens follow SCREENS SCR-041.
- **Depends on:** U6
- **Size:** L
- **Risk area:** none
- **Status:** done

### U8. The field unlock
- **Goal:** one answer of an approved application is opened, filled and decided by different people, logged at each step, never on a closed project.
- **Requirements:** R17, R18, R19, R20, R21, R33
- **Files:** `apps/api/prisma/schema.prisma`, `apps/api/prisma/migrations/<timestamp>_field_unlock/{migration,down}.sql` (the columns, the trigger's allowed columns and the one-open-unlock index), `apps/api/src/applications/unlocks.ts`, `apps/api/src/routes/applications.ts`, `apps/api/src/applications/service.ts` (the change log and the record's open unlocks), `apps/api/src/services/beneficiary-contact.ts` (the mobile and address path), `apps/api/src/notifications/application-events.ts`, `apps/api/src/services/attention.ts`, `packages/shared/src/attention.ts`, `packages/shared/src/notifications/templates.ts`, `apps/api/test/integration/field-unlocks.test.ts`, `docs/api/openapi.yaml`, `docs/database/DATABASE_SCHEMA.md`, `docs/architecture/NOTIFICATIONS.md`
- **Approach:** `apps/api/src/services/beneficiary-corrections.ts` (requested by one official, decided by another, the value checked unchanged at the decision, the log); routes `POST /applications/:applicationId/unlocks` (`application.unlock_field`), `PUT /application-unlocks/:unlockId/value` (`application.update_unlocked_field`: the owner volunteer, or an official when there is no volunteer), `POST /application-unlocks/:unlockId/decision` (`application.unlock_field`, accept or refuse with a reason), `POST /application-unlocks/:unlockId/cancel` (`application.unlock_field`, with a reason).
- **Tests:**
  - integration: an RPM opens the village of an approved application with a reason, the owner volunteer enters a new value, another official accepts and the answer changes with every step in the change log and the audit log; a refusal keeps the old value with its reason; the person who entered cannot decide; a second unlock of the same answer while one is open is refused (409); the identity number, the name and the father's name cannot be opened (422); a mobile change goes through the contact service and its change log; an application without a volunteer is filled by an official and decided by another; a closed project refuses opening, filling and deciding; another volunteer and an official outside the region are refused (404); the volunteer is notified when the answer opens, without the reason, and the office sees the entered value on the attention list; an invalid value (an option the question lacks, a number out of range) is refused (422); a photo, a file and an identity question cannot be opened (422); an official-section answer is filled by an official and refused to the volunteer (404); two opens at once leave one (the unique index); the office cancels an open unlock with a reason and the old value stays; a blocked volunteer cannot fill it.
- **Done when:** the migration applies and reverts and the tests pass.
- **Depends on:** none
- **Size:** L
- **Risk area:** auth, personal data
- **Status:** done

### U9. The field unlock on the screens
- **Goal:** the official opens and decides an answer from the review page, and the volunteer fills it from their application's page.
- **Requirements:** R17, R18, R19, R33
- **Files:** `apps/web/src/admin/applications/ApplicationReviewPage.tsx`, `apps/web/src/admin/applications/UnlockDialog.tsx`, `apps/web/src/admin/applications/UnlockReview.tsx`, `apps/web/src/features/applications/ApplicationDetailPage.tsx`, `apps/web/src/features/applications/UnlockedAnswer.tsx`, `apps/web/src/features/applications/AnswerList.tsx`, `apps/web/src/admin/applications/applications.test.tsx`, `apps/web/src/features/applications/applications.test.tsx`, `packages/shared/src/i18n/messages/{bn,en}/applications.json`
- **Approach:** `DecisionDialog.tsx` for the reason; the renderer's `FieldInput` for the one answer; `CorrectionDialog` of the beneficiary tab for the accept and refuse step.
- **Tests:**
  - component: on an approved record each answer but the identity offers "সংশোধনের জন্য খুলুন", which asks a reason; the volunteer's page shows the open answer with "নতুন উত্তর দিন" and "পাঠান", then "যাচাইয়ের অপেক্ষায়"; the office sees the old and the new value with "গ্রহণ করুন" and "ফেরত দিন" (a reason); the official who entered sees no decision buttons; "আনলক বাতিল করুন" asks a reason; photo and file answers offer no unlock; axe in bn and en.
- **Done when:** the tests pass.
- **Depends on:** U7, U8
- **Size:** M
- **Risk area:** none
- **Status:** done

### U10. The application transfer
- **Goal:** an RPM or a granted executive moves all or selected applications of a volunteer to another, the old volunteer sees none of them, and every move is logged.
- **Requirements:** R22, R23, R24, R25, R26, R33 (an open unlock moves)
- **Files:** `apps/api/src/access/scope.ts`, `apps/api/src/access/scope.spec.ts`, `apps/api/src/applications/service.ts` (`listMine`), `apps/api/src/applications/transfers.ts`, `apps/api/src/applications/history.ts` (the transfer step), `apps/api/src/routes/applications.ts`, `apps/api/src/services/project-volunteers.ts` (assign in the same flow), `apps/api/src/notifications/application-events.ts`, `packages/shared/src/notifications/templates.ts`, `apps/api/test/integration/application-transfers.test.ts`, `docs/api/openapi.yaml`, `docs/security/RBAC.md`
- **Approach:** `apps/api/src/services/handover.ts` for the batch with one audit entry and a row per item; `POST /projects/:projectId/transfers` (`application.transfer`; `volunteer.team.transfer` when the team moves) under an `Idempotency-Key`; `GET /projects/:projectId/volunteers/:volunteerId/applications` for the picker.
- **Tests:**
  - unit: `applicationWhere` for SELF gives a creator access only while they are the owner's user or the owner's active team member on that project.
  - integration: the Dhaka RPM moves two of three applications from volunteer A to volunteer B with a reason; B reads, edits by state and submits them; A's list, record, timeline and the number lookup no longer find them (404), the third stays A's; A's team member who created one loses it unless the team moves, and keeps it when it does; B's limit counts them, and a move over the limit passes with a warning while B's next new application is refused; each application's timeline shows the transfer with from, to, who and why for the office, while the volunteer sees only that it came to them; one audit entry names the batch; an RPM of another region (404 per application) and an executive without the grant (403) are refused; a volunteer not on the project is assigned in the same request; the old volunteer is told the count only, the new one the applications; after the move the old volunteer and their unmoved team member receive no event of those applications; a blocked or inactive target and a project that is not active are refused (422 and 409); an in-flow assignment without `volunteer.assign_project` is refused (403); an open unlock of a moved application is filled by the new volunteer, not the old one.
  - existing: the SELF scope is covered by `apps/api/src/access/scope.spec.ts` and `applications.test.ts` ("lets a team member create a draft under the lead, read it, but neither submit nor delete it"); both are extended, not duplicated.
- **Done when:** the tests pass and RBAC.md describes the creator rule.
- **Depends on:** none
- **Size:** L
- **Risk area:** auth, personal data
- **Status:** done

### U11. The transfer screen
- **Goal:** the RPM picks the old volunteer, ticks applications, picks or assigns the new volunteer, decides on the team and confirms with a reason.
- **Requirements:** R22, R24, R25
- **Files:** `apps/web/src/admin/projects/volunteers/TransferPage.tsx`, `apps/web/src/admin/projects/volunteers/transfer-api.ts`, `apps/web/src/admin/projects/volunteers/transfer.test.tsx`, the entry beside each volunteer in `apps/web/src/admin/projects/volunteers/` and on the volunteer profile in `apps/web/src/admin/volunteers/`, `apps/web/src/routes/index.tsx`, `packages/shared/src/i18n/messages/{bn,en}/admin.json`
- **Approach:** the project volunteers page of T1.12 and the handover page `apps/web/src/admin/handover/` (a list with ticks, a person picker, a reason); route `/admin/projects/:projectId/transfer?from=<volunteerId>`.
- **Tests:**
  - component: "আবেদন হস্তান্তর" beside a volunteer opens the page with their applications; "সব বাছুন" and single ticks; the new volunteer is picked from the project's volunteers or assigned; "টিমও নতুন স্বেচ্ছাসেবকের অধীনে যাবে" shows only with the team permission; over the limit shows the warning before confirming; the reason is required; the result names the moved count; axe in bn and en.
- **Done when:** the tests pass.
- **Depends on:** U10
- **Size:** M
- **Risk area:** none
- **Status:** todo

### U12. The verification queue
- **Goal:** the office links a public entry to its profile or creates one, optionally gives it a volunteer, or refuses it, from one queue.
- **Requirements:** R27, R28, R29, R30
- **Files:** `apps/api/src/applications/service.ts` (`act` takes the profile id or the create choice and the owner), `apps/api/src/applications/submission.ts`, `apps/api/src/routes/applications.ts`, `apps/api/src/services/attention.ts`, `packages/shared/src/attention.ts`, `apps/web/src/admin/applications/ApplicationsPage.tsx` (the "যাচাইয়ের অপেক্ষায়" tab), `apps/web/src/admin/applications/VerifyDialog.tsx`, `apps/web/src/admin/applications/applications.test.tsx`, `apps/api/test/integration/application-verification.test.ts`, `docs/api/openapi.yaml`, `packages/shared/src/i18n/messages/{bn,en}/applications.json`
- **Approach:** the submission's `bindPerson` and `number` of T2.5 for the person and the number; the lookup of `BeneficiaryIdentityService` for the existing profile; the office list's filter in the address for the tab.
- **Tests:**
  - integration: a public entry with an existing identity is linked to that profile and gets a number; an entry with a new identity creates the profile; an entry whose profile is blocked can only be refused; linking to a profile whose number differs is refused; a chosen volunteer must be on the project; without one the application stays the office's and a transfer can give it one; the queue lists the project's entries with their flags for the region's officials only, and an official of another region gets 404 on the queue and on each action; a profile id the caller's lookup does not reach is refused; the dialog shows the lookup's fields of the profile, not the whole profile; the attention list counts them.
  - component: the tab lists the entries; "প্রোফাইলের সঙ্গে যুক্ত করুন", "নতুন প্রোফাইল তৈরি করুন" and "এন্ট্রি বাতিল করুন" appear by the flags; the volunteer picker is optional; axe.
  - existing: the refusal of a public entry is covered by `application-cycle.test.ts` ("lets the region's executive refuse a public entry with a reason, and nobody else").
- **Done when:** the tests pass.
- **Depends on:** U3, U6 (the verification actions leave "later" there)
- **Size:** M
- **Risk area:** auth
- **Status:** todo

### U13. The journeys, the sweep, the matrix and the documents
- **Goal:** the three journeys run end to end, and the documents describe what was built.
- **Requirements:** R31, R32
- **Files:** `apps/web/e2e/application-rules.spec.ts`, `apps/web/e2e/support/projects.ts`, `apps/web/e2e/a11y.spec.ts`, `docs/security/AUTHORIZATION_MATRIX.md` (regenerated), `docs/BUSINESS_RULES.md`, `docs/ui/SCREENS.md` (SCR-031, SCR-032, SCR-041, SCR-042, SCR-061), `docs/architecture/WORKFLOW_ENGINE.md`, `docs/testing/TEST_STRATEGY.md`, `docs/STATUS.md`, `CLAUDE.md` (the map)
- **Approach:** `apps/web/e2e/applications.spec.ts` of T2.5 (a project of the run, the ready form placed through the API, here with points; officials on desktop pages that close whatever happens).
- **Tests:**
  - e2e: score → waitlist → pull: a project whose form gives "বিধবা" 20 points and a union quota of 1; two applications sent through the API; as `rpm.dhaka@example.org` at `/admin/projects/{id}/applications` the higher score is first; "অনুমোদন করুন" on the lower one asks "কেন স্কোরের ক্রম ভেঙে সিদ্ধান্ত নিচ্ছেন?"; the higher one is approved; the other is waitlisted with "অপেক্ষমাণ তালিকায় রাখুন" and a reason; the quota bar shows "লক্ষ্য 1 · অনুমোদিত 1"; "পরেরজনকে আনুন" asks the full-quota comment and pulls it; the badge reads "বাস্তবায়ন চলছে".
  - e2e: unlock: on an approved application the RPM opens "গ্রাম" with "সংশোধনের জন্য খুলুন"; volunteer `01700000115` at 360 px opens "আমার আবেদন", enters the new village and presses "পাঠান"; the executive sees the old and the new value and presses "গ্রহণ করুন"; the change log shows the step.
  - e2e: transfer: the RPM moves one application of volunteer `01700000115` to volunteer `01700000103` with a reason; `01700000115` no longer finds it under "আমার আবেদন"; `01700000103` finds it.
  - e2e: the sweep adds the quota section, the transfer page and the verification tab.
- **Done when:** the journeys pass 3 of 3 with `--repeat-each 3 --workers 1`, the matrix test is green and `pnpm rules:status --phase 2 --report-only` lists every rule of this task as tested.
- **Depends on:** U4, U7, U9, U11, U12
- **Size:** M
- **Risk area:** none
- **Status:** todo

## Checkpoints
- **Mode:** grouped (one by one 10, grouped 17, all at once 0; N is over 4, so one by one's 10 goes to grouped; scored again after the doc review moved U12 and U9 behind U6 and U7)
- **Signals:** N 13, L 3,150, R 6, Fd 3, C 6, P 1
- **C1** after U2: foundation for U3 and U4 (the shared score)
- **C2** after U3: foundation for U6 and U12, a migration and personal data
- **C3** after U5: auth (U4 joins this group)
- **C4** after U6: auth, the new comment-asking guards (the new pattern), and the base of U7 and U12
- **C5** after U8: auth, personal data and a migration (U7 joins this group)
- **C6** after U10: auth and personal data (U9 joins this group)
- **C7** after U12: auth (U11 joins this group)
- **C8** after U13: end

## Verification
- `pnpm typecheck`, `npx eslint . --ignore-pattern ".claude/**" --quiet`, `pnpm i18n:check`, `pnpm docs:check`
- `pnpm test` per project (`packages/shared`, `packages/ui`, `apps/web`, `apps/api`), and `npx vitest run --config vitest.db.config.mts --maxWorkers 1` in `apps/api`
- `pnpm --filter @css/api contract:coverage`, `pnpm --filter @css/api authz:matrix`, `pnpm rules:status --phase 2 --report-only`
- `pnpm --filter @css/web build` and `pnpm --filter @css/web bundle:report`
- `pnpm e2e`, and `npx playwright test e2e/application-rules.spec.ts --repeat-each 3 --workers 1` in `apps/web`

## Risks and rollback
- **Migrations:** two additive migrations, each with a hand-written `down.sql`: the score column and its index (the reverse drops them; `application_scores` keeps the breakdown), and the unlock columns with the widened status-log trigger (the reverse restores the trigger's column list and drops the columns, refusing while an unlock is open).
- **Templates at version 3:** `workflow_transitions` is append-only, so version 3 sits beside version 2; projects activated before keep their snapshot and offer no waitlist or verification until re-activated, which the lifecycle never does, so the dev and test databases are reseeded (`pnpm db:seed`) and the e2e server recreates its database.
- **Access:** the SELF change can hide applications a team member should still see; the scope spec and the transfer tests prove both sides (the team kept, the team moved) before the screens use it.
- **Personal data:** the score, the decision comments, the unlock reasons and the transfer reasons are office data; U3, U8 and U10 test each mask for the volunteer audience.
- **Form definitions:** the new `settings.score` and `scoring` are optional, so every published version stays valid; a published version keeps its points (versions are immutable).

## Definition of done
- All units done and their tests pass
- Verification commands pass
- `ae-review` has run at every checkpoint, with no open P0 or P1
- DECISION_LOG holds the scoring decision before U2's code, BUSINESS_RULES the rules and their test status
- Code from abandoned attempts is removed

<!-- ae-work adds this while status is in-progress, and removes it at done -->

## Progress
- **Branch:** `feat/application-rules` (from `main` at 3aaac17, after PR #27)
- **Updated:** 2026-10-25 19:00
- **Next:** checkpoint C6 on `574ff28..HEAD` (U9 and U10), then U11 the transfer screen
- **Reviewed through:** C5 at 3acfcc5 (logic, security and standards reviewers on `8412fe0..99ff257`); C4 at ae958a5 (logic, security and standards reviewers on `3dbe029..f14cc0e`); C3 at d2ccbf8 (logic, security and standards reviewers on `0bbdc0b..0777a22`); C2 at 4664680 (logic, security and standards reviewers on `f830251..35cf6c7`); C1 at 43f11b2 (logic and standards reviewers on `b9c2263..c8beb65`)
- **Uncommitted:** none
- **Notes:** the owner chose at the brainstorm and the doc review every Key decision above; the scoring decision goes into DECISION_LOG with U2 before any scoring code. U1 found the extension, the duplicate and both blocks already enforced (their new tests passed first time); a blocked volunteer is stopped at the session (401 `auth.token_stale`, then no login), before any guard. `project_volunteers.applications_counted` was never written, so the volunteer's "applications left" and the office's volunteer list showed 0: both now read the live count of `apps/api/src/applications/limit.ts`, the same rule the limit guard uses. U2: D-132 holds the owner's decisions; the points are whole numbers 0 to 100 in `settings.score` and the form-level `scoring`; the score module reads visibility and calculated values through `evaluate`, so `definition.ts` and `score.ts` import each other (the checks call the score helpers only at run time); the form definition is stored as rows with no place for a form-level setting, so U3 adds `form_versions.scoring` and carries it through every copy of a definition, and U4 now waits for U3. BR-270 and BR-272 are marked deferred in the register until their units, so the Phase 1 documents check stays green. C1 taught: the definition read now drops `settings.score` for every audience but the office (`readDefinition` in `apps/api/src/services/forms.ts`), so a volunteer or a public-link visitor never sees which answer raises the score; a points setting with nothing in it gives no score; an option the branching no longer offers earns nothing; a range that starts above its end is refused at publish (`form.score_range_invalid`); the form-level criterion is still not stored (U3 adds `form_versions.scoring`), which the logic reviewer raised as P1 and the plan already carries. U3 built: the engine takes a side-effect runner (`ScoringService` in `apps/api/src/applications/scoring.ts`, given by the container) that runs `score.compute` and `score.snapshot` inside the move's transaction after the state is written; an edit while submitted or under review recomputes; the record carries `scoreItems` for the office (masked like the official section) and the summary its `totalScore`; `sort=-score` is the office's only (422 otherwise) and pages with its own keyset in `service.ts` (`scoreOrder`, `scoreKeyset`: unscored last, since the shared keyset has no nullable column); `form_versions.scoring` is written by `writeDefinitionRows`, so every copy of a definition carries it; the migration's index is `total_score DESC` (Prisma cannot say NULLS LAST, and the drift test compares the two). C2 taught: a cursor is bound to the order it was made in (the sort joins the binding, and a score cursor is parsed before it is read), so a cursor of one order is refused by the other with 422, not 500; a score stays frozen only while its decision stands, and every decision recomputes before it freezes, so a rejection taken back and approved freezes the current score; "not previously assisted" reads earlier projects only (by the project's creation); a draft save without `scoring` keeps the stored form-level points and an explicit null clears them, and the save's audit entry records the form-level and per-question points; the engine's side-effect runner is required. Dismissed: the security reviewer's P1 that no test hides the score from a volunteer (the test exists; the pack was cut); left: answer edits while submitted write no change-log row (only the review's edits do), and the scoring service reads the definition and answers as the submission does (a shared reader may come later). U4 built: a "নম্বর" group in the settings pane for a choice or a number outside a group (`ScoreSettings.tsx`: a box per option, or ranges with their points), a "স্কোর" button in the builder's header opening `ScoringDialog.tsx` (the points of "আগে সহায়তা পাননি" and the highest total, with a warning above 100), the draft saved with `scoring` (null when the draft holds none, so the builder clears what it removed), the version summary naming a points change (`points` aspect, `scoring_changed`). U5 built: `ProjectQuotasService` (`apps/api/src/services/project-quotas.ts`) with `GET` and `PATCH /projects/:projectId/quotas` (the contract had planned the path as PATCH in T0; its unused T0 schemas were replaced), a place must be of its level and inside one of the project's areas, the counts are live (received: not draft, deleted or needs verification; approved: `approved_at` set), `quotas` is a setup field editable while draft or active; on the web the quotas sit under the areas in the setup's areas step (`QuotasSection.tsx`), and a step may now hold several parts' saves (the step runner keeps a set, `useStepSave` returns its own removal). C3 taught: a quota target is one or more (a target of none means no quota, and was "full" before any approval); a read that only brings new counts keeps the targets being typed, new targets replace them; decision ids stay out of code comments here too; the quota routes are tested for 401 and 404 and a foreign PM gets 404 (the project is outside their reach). Kept: "received" counts rejected applications too (they reached the office), "approved" reads `approved_at`, which no move clears (an approval is never reversed to a rejection), and every official who sees the project reads the counts (aggregates, no personal data). U6 built: a guard may answer "only with a comment" (`GuardResult` in `apps/api/src/workflow/guards.ts`); the engine collects the asked reasons and refuses a move without a comment with 422 `workflow.comment_required`, the details naming `against_score` or `quota_full`; the score and quota rules live in `apps/api/src/applications/decision-rules.ts` and the record's `decisionHints` tells the office which comments each decision would ask now; the waitlist stamps `waitlisted_at` through `WorkflowSideEffects` (`side-effects.ts`, which also runs the score effects); the pull is `POST /projects/:projectId/waitlist/pull-next` (`waitlist.ts`), locking one row at a time with SKIP LOCKED so two pulls never take one person; the templates went to version 3 and the demo seed now reads the template's version instead of a fixed number; `quota.increment` stays a pending note because the counts are live. The authorization matrix had missed the quota routes of U5; it is regenerated with U6. C4 taught: the pull is an approval, so its transition carries `application.approve` and every approval guard (zakat, the template's approval override such as the PM's final approval of house construction); a unit test holds every template's pull to its approval's permission and guards. `SKIP LOCKED` skips rows any write holds, not only other pulls, so the pull now takes a per-project advisory lock and locks its row with a plain `FOR UPDATE`, and the order guard reads without a lock. Any union or district of the level the project weighs by is a pull area, with or without its own target. A waitlist keeps its reason on the row; a guard's comment stays in the audit entry and is the row's note only when the decision has no reason. Kept as decided: the order is judged over the whole quota area (the project when it has no quotas), even where a regional official reaches only part of it, so such an official's pull may ask for a comment; the decision hints read the application and quotas once per action (small, left as is). U7 built: `QuotaBars.tsx` above the list (the quotas read through the setup's client, a pull per area of the weighing level, one for the whole project without quotas, each click its own idempotency key, a comment asked by the server reopening the pull in `DecisionDialog`), the score column and the score order in the address, `ScoreBreakdown.tsx` on the record, the waitlist and the pull as record actions, `DecisionDialog` taking an optional reason and the comment reasons; `canDecideApplications` in `roles.ts` shows the pulls to the roles that may decide. The i18n check found that the new quota guard's error code had no message; both languages now have one. The browser check of these screens waits for U13's seeded journey. U8 built: `UnlocksService` (`apps/api/src/applications/unlocks.ts`) with `POST /applications/:applicationId/unlocks`, `PUT /application-unlocks/:unlockId/value` (permission marker `workflow`: the owner volunteer with `application.update_unlocked_field`, an official with `application.unlock_field` only when there is no volunteer or the answer is the official section's, since no official role holds the fill permission), `POST .../decision` and `POST .../cancel`; migration `20261025160000_field_unlock` adds `entered_by`, `entered_at`, `decided_by`, `decided_at`, `decision`, `decision_reason`, the unique index of one waiting unlock per answer (`decided_at IS NULL`) and the widened status-log trigger; the unlock rules and request shapes live in `@css/shared/forms` (`unlock.ts`); the value is sent as any object and checked by the engine (the drift test cannot follow the answer-value schema's file reference, and the edit of answers does the same); an accepted value writes the whole answer set as the engine reads it, so calculations follow, and a mobile or address goes through `BeneficiaryContactService.apply`; the record carries `unlocks` and `mayUnlock`; the attention list has `unlocks_to_fill` (volunteer) and `unlocks_to_verify` (office, opening the oldest application); the notifications `field_unlocked` and `field_updated` reuse the bilingual `field_name` variable and link to the application. The design-phase unlock paths of the contract were replaced. Left: the application notifications of T2.5 (`application_approved` and the others) have no inbox link in `notification links`; reported, not fixed here. C5 taught: a decision locks the application row as well as the unlock, so two acceptances on one application rewrite its answers one after another; the attention counts read the caller's own waiting unlocks with a join and a cap, never on a closed project; a question writing several columns is locked when any of them is an identity column; a new value is refused only by its own answer's errors (the rest is read as a draft), since an official answer left empty elsewhere is not the correction's concern; an answer the profile keeps (mobile, address, village, post office, post code, landmark) cannot be cleared through an unlock, because the contact service cannot clear a profile field; the blocked and reach checks of the applications moved to `apps/api/src/applications/callers.ts`. Kept as decided: a cancel is refused on a closed project like every other step (the unlock waits until a reopening). U9 built: the office's record offers "সংশোধনের জন্য খুলুন" beside each answer that can open (the shared `unlockRefusal`; the question named in visually hidden text, since the set's button has no separate label) and asks the reason in `DecisionDialog`; `UnlockReview.tsx` lists the waiting unlocks with accept, send back and cancel; `features/applications/UnlockedAnswer.tsx` is the fill (the question through `FieldInput`, starting from the previous answer) on the volunteer's page and on the office's record when the office fills; `AnswerList` takes an `action` beside each answer and exports `answerText`. The plan's `UnlockDialog.tsx` became `DecisionDialog` reused. U10 built: the creator rule `ownApplicationsWhere` with the caller's active team places (`teamLeads`, filled for SELF on applications by `resolveInstances`), used by `applicationWhere`, `listMine`, the replay of a create and the owner notifications; `TransfersService` (`apps/api/src/applications/transfers.ts`) with `POST /projects/:projectId/transfers` under an Idempotency-Key (the owner moves with a guarded `updateMany`, a transfer row and an `application.transferred` audit entry per application, one `application.transfer` entry for the batch on the project, the team moved by ending and reopening its rows with the consent carried, the in-flow assignment through `ProjectVolunteersService.assign` before the move) and `GET /projects/:projectId/volunteers/:volunteerId/applications` for the picker; the timeline keeps the transfer step although the state stays; two messages, `application_transferred` (count) and `application_transferred_away` (count only). The design-phase transfer path and schemas of the contract were replaced; `GET /applications/:applicationId/transfers` stays unbuilt. A local দায়ী holds no application reading, so the tests hand the applications to a general volunteer.
