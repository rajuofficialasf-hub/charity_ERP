---
title: Ready forms and the question library built by the Monitoring Team (T2.4c)
type: feat
status: in-progress
source: plan
date: 2026-10-24
doc_review: 2026-10-24
---

# Ready forms and the question library built by the Monitoring Team (T2.4c)

## Goal
The Monitoring Team and the Department Head build the department's forms and its question library in the system, writing every question themselves; a PM picks a ready form and places it on the project without changing it, and takes a newer version when he wants.

## Problem
Today a PM builds each project's form from a seeded library (10 sections, 85 questions, 2 templates) and the engine pre-places an identity core in every form. The owner wants the forms and the library made by one team (D-125), nothing pre-placed (D-126) and the seeded library gone (D-127); a PM should only choose (D-129).

## Requirements
- **R1** The Monitoring Team and the Department Head create a ready form (empty, or a copy of another ready form), build it in the builder and publish its versions; a PM, an RPM or a volunteer cannot build or publish one.
- **R2** A ready form has a kind, "উপকারভোগীর আবেদন" or "অন্যান্য", chosen when it is created.
- **R3** A ready form of the kind "উপকারভোগীর আবেদন" cannot be published until one question is marked for each identity role (NID or birth registration, name, father's or husband's name, mobile, gender, address, village), each with its fixed answer type, required and seen by everyone; a draft may lack them, and a form of the kind "অন্যান্য" needs none.
- **R4** No question is pre-placed: a new ready form starts with one empty section.
- **R5** The question library is one library form that the Monitoring Team and the Department Head edit in the same builder; publishing it makes its sections and questions the library every builder sees on the left, and its earlier versions are kept.
- **R6** A PM sees the published ready forms and places one on his project: the project gets a published copy that names its source, and the PM cannot change it.
- **R7** When the ready form has a newer published version, the PM sees "এই ফর্মের নতুন সংস্করণ আছে" and takes it with one press; the project gets its next version and earlier applications keep theirs.
- **R8** The seeded library and the two seeded form templates are retired, not deleted; the base seed no longer writes them; forms built from them keep their questions.
- **R9** Project forms built before this task keep working (versions, the public link, applications); the public link stays the PM's and may be switched on only for a form of the kind "উপকারভোগীর আবেদন".
- **R10** Every create, change, publish, placement and version take of a ready form or the library is audited.

## Scope
- In: ready forms with versions; the library form; identity role marks and the publish check; placement and version take; permissions; the retirement of the seeded library and templates; the web screens for both audiences; the journey and the accessibility sweep.
- Out (not now): the Kobo-like logic of D-128 (T2.4d); a row count that follows another answer (D-124 (3)); editing a placed form inside a project; deleting anything.

## Key decisions
- **D-125**: the Monitoring Team and the Department Head build the forms and the library; a PM only places. Governs R1, R5, R6.
- **D-126**: nothing pre-placed; a beneficiary application form marks its identity questions before publishing; it supersedes BD-13 and BR-078 ("mandatory in every project") for forms of the kind "অন্যান্য" and for the pre-placed core. Governs R2, R3, R4.
- **D-127**: the seeded library and templates retired with this task, the library starting empty. Governs R8.
- **D-129** (owner in chat, 2026-10-24; recorded in the log with U1): ready forms form a catalogue outside the projects and one form may be placed on many projects; a newer version reaches a project only when its PM takes it; the library is edited in the same builder as a library form with versions. The public link stays the PM's because it belongs to the project, not to the form's questions (Claude's reading of D-125; the owner confirms it in the report). Governs R5–R7, R9. Also in D-129 (owner in chat, 2026-10-24): a public link only for a form of the kind "উপকারভোগীর আবেদন", so every public entry carries the identity the checks need.
- D-126, D-127 and D-128 are in the log through PR #24 (merged before U1 starts).

<!-- ae-plan adds everything below -->

## Technical decisions
- **A ready form is a `forms` row without a project** (DB-MIG-01, -02, -05 with `down.sql`): `forms.project_id` becomes nullable, a new `kind` column (`beneficiary_application`, `other`, `library`) with a CHECK, `source_form_id` and `source_version_no` on a placed project form, a partial unique index on `key` among the forms without a project and one on `kind = 'library'` (a single library form). The versions, sections, fields, options, drafts, publishing and audit of `form_versions` are reused unchanged, so the builder works on ready forms and the library as it does today.
- **The identity role is the question's standard column** (the core columns `nid_or_birth_reg`, `name`, `father_or_husband_name`, `mobile`, `gender_code`, the four address ids, `village`): `CORE_FIELDS` in `@css/shared/forms/core.ts` becomes a table keyed by role with its fixed type; the core checks of `definition.ts` look up the field by its standard column instead of its field key and run only when `checkDefinition(definition, { publishing: true, kind: 'beneficiary_application' })`; field keys become free. `public-forms.ts` reads the identity answers by `standard_column`, not by `field_key`. Forms built before keep passing, since their core questions already carry those columns.
- **Permissions** (`docs/security/permissions.yaml`, RBAC.md, the authorization matrix): `form.build`, `form.publish`, `form.library.view` and `form.library.manage` lose their default grants (the two global roles hold every permission at GLOBAL); a new `form.place` goes to the PM at PROGRAM scope; `form.public_link.manage` stays the PM's. The web gate `canBuildForms` follows (`apps/web/src/admin/roles.ts`).
- **The library comes from the library form**: `GET /form-library` keeps its response shape but reads the library form's published version (its sections, and their questions as ready-to-place fields); its `templates` list is empty and the seeded `form_library_*` tables are no longer read. They stay in the schema (no drop), so the retirement is reversible.
- **Placement copies a published version into the project** in one transaction, published at once, with the source named; a take of a newer version is the same copy as the project form's next version, retiring the one before (the existing version life cycle and the BR-077 trigger keep applications on their version). Only a ready form (no project, kind `beneficiary_application` or `other`, never `library`) with a published version may be placed, and its latest published version is copied; anything else answers 404 (another project's form, the library form, an unknown id) or 422 (a ready form without a published version). A take needs a placed copy (`source_form_id` set) whose source has a newer published version, and is checked against the placed form's project like any project write. The copy follows the "copy another project's form" path of `FormsService.create` (`apps/api/src/services/forms.ts`).
- **Access to a form without a project** (NE-SEC-03): reached only by the two global roles, through `form.build`, `form.publish` or `form.library.manage` at GLOBAL scope; the one exception is the list of published ready forms and their published versions for a holder of `form.place`. The library form is never listed among the ready forms. Every other caller gets 404 for a ready form or the library form by id.
- **Identity questions in the builder**: a question marked with an identity role keeps its required switch on and its audience "সবাই" (both locked), but can be moved, renamed or removed like any other; the core locks of `draft.ts` (`coreLocks`, `hasCore`), `SettingsPane.tsx` and `FormCanvas.tsx` read the mark (the standard column), not the field key, so a question keyed `mobile` without the mark is a plain question. The address role is the composite column `division_id,district_id,upazila_id,union_id` of a `bd_address` question.
- **Stack profile** unchanged (CLAUDE.md "Stack profile"); no new dependency.

## Implementation units
### U1. Ready forms in the schema, and D-129 in the log
- **Goal:** a form can exist without a project, with a kind and the source of a placed copy.
- **Requirements:** R1, R2, R5, R6, R9
- **Files:** `apps/api/prisma/migrations/20261024100000_ready_forms/{migration.sql,down.sql}`, `apps/api/prisma/schema.prisma`, `docs/database/DATABASE_SCHEMA.md`, `docs/database/ERD.md`, `docs/DECISION_LOG.md` (D-129), `apps/api/test/integration/triggers.test.ts` or a new `ready-forms-schema.test.ts`
- **Approach:** the hand-written CHECK and partial-index pattern of `20261021140000_form_version_rules`; existing rows get `kind = 'beneficiary_application'`; an index on `forms(source_form_id)` (DB-MIG-07); the migration inserts the one empty library form (an empty draft version) so a database that is not reseeded has it, and `down.sql` removes it only while it holds no published version, refusing otherwise; D-129 written to `docs/DECISION_LOG.md`.
- **Tests:**
  - integration: a form without a project is stored with a unique key; two ready forms with one key are refused; a second library form is refused; a library form with a project is refused; an existing project form reads back with its kind; `down.sql` returns the schema (the migration test pattern).
  - existing: covered by `apps/api/test/integration/forms.test.ts` (project forms unchanged).
- **Done when:** the migration applies and reverts on the test database, and the forms tests still pass.
- **Depends on:** none
- **Size:** M
- **Risk area:** migration
- **Status:** done

### U2. Identity roles instead of a pre-placed core
- **Goal:** the engine checks the identity by the questions' marks at publish of an application form, and starts a form empty.
- **Requirements:** R3, R4, R9
- **Files:** `packages/shared/src/forms/{core.ts,definition.ts,template.ts,requests.ts}`, their tests `definition.test.ts`, `template.test.ts`, `apps/api/src/services/public-forms.ts`, `apps/api/test/integration/public-forms.test.ts`, `packages/shared/src/i18n/messages/{bn,en}/errors.json`, `docs/BUSINESS_RULES.md` (BR-078 rewritten for D-126, with its tests)
- **Approach:** extend the D-123 `publishing` option of `checkDefinition` with the form's kind; `blankDefinition` gives one empty section; the core table keyed by role.
- **Tests:**
  - unit: a draft without identity questions passes; publishing an application form without the mobile mark is refused naming the role; a role with the wrong type, optional or official-only is refused; a form of the kind other publishes without any; identity questions with free field keys pass; a T2.4-era definition with the old core passes.
  - integration: a public submission to a form whose identity questions have new keys stores the NID, the mobile and the address on the entry.
  - existing: covered by `packages/shared/src/forms/definition.test.ts`, `template.test.ts`, `apps/api/test/integration/public-forms.test.ts`.
- **Done when:** the shared tests and the public-form tests pass with renamed identity keys.
- **Depends on:** none
- **Size:** M
- **Risk area:** personal data
- **Status:** done

### U3. Who builds and who places
- **Goal:** the build, publish and library permissions belong to the two global roles, and the PM gets "place".
- **Requirements:** R1, R6, R9
- **Files:** `docs/security/permissions.yaml`, `docs/security/RBAC.md`, `docs/security/AUTHORIZATION_MATRIX.md` (regenerated), `apps/web/src/admin/roles.ts`, the permission registry tests
- **Approach:** the registry's default grants and `global_scope` rule (`apps/api/src/access/registry.ts`); `pnpm --filter @css/api authz:matrix`.
- **Tests:**
  - unit: the registry loads `form.place` with the PM at PROGRAM; `form.build` has no default grant.
  - integration: a PM is refused `PATCH /form-versions/{id}` and `POST …/publish` (403); a Monitoring Team member is allowed.
  - existing: covered by the authorization matrix test.
- **Done when:** the matrix is current and its test passes.
- **Depends on:** none
- **Size:** S
- **Risk area:** auth
- **Status:** done

### U4. The ready form, library and placement API
- **Goal:** the API serves ready forms, the library form, placement and the take of a newer version.
- **Requirements:** R1, R2, R5, R6, R7, R10
- **Files:** `apps/api/src/services/forms.ts` (a ready branch of reach, audience and create; the publish step passes the form's kind to `checkDefinition` through the publish schema), `apps/api/src/services/public-link.ts` (the link only on an application form), a new `apps/api/src/services/ready-forms.ts` (list, create, place, take), `apps/api/src/services/form-library.ts` (the library from the library form), `apps/api/src/routes/forms.ts`, `docs/api/openapi.yaml`, `apps/api/test/integration/ready-forms.test.ts`, `apps/api/test/integration/forms.test.ts`
- **Approach:** `defineRoute` operations like `routes/forms.ts`; the copy path of `FormsService.create`; If-Match on writes; audit actions `form.ready_create`, `form.place`, `form.take_version`; `GET /ready-forms` (Monitoring Team and Department Head: every ready form; PM with `form.place`: the published ones), `POST /ready-forms`, `POST /projects/{projectId}/forms/place`, `POST /forms/{formId}/take-version`.
- **Tests:**
  - integration: a PM, an RPM and a volunteer get 404 for `GET /form-versions/{id}`, the versions list and `PATCH /form-versions/{id}` of a ready form and of the library form; the list of ready forms never shows the library form; placing a ready form without a published version answers 422, the library form or another project's form 404; a PM of another program gets 404 and an RPM or a volunteer 403 on `POST /forms/{formId}/take-version`; the public link of a placed form of the kind other is refused (422); the ready-form create, the library publish, the place and the take each write one audit row (`form.ready_create`, `form.publish`, `form.place`, `form.take_version`) with no token or secret in it; the Monitoring Team creates an empty application ready form, saves a draft, cannot publish it without the identity marks (422 naming the role), publishes it after; a PM lists only published ready forms, places one on his project (201, published, source named) and cannot place on another program's project (404) or edit the placed form (403); a volunteer and an RPM are refused (403); after the ready form's version 2 is published the project form reports a newer version and the take gives version 2 while an application keeps version 1; the library form is edited and published and `GET /form-library` returns its sections; the contract recorder validates every response.
  - existing: covered by `apps/api/test/integration/forms.test.ts` and the drift test.
- **Done when:** the integration tests, the drift test and the contract coverage pass.
- **Depends on:** U1, U2, U3
- **Size:** L
- **Risk area:** auth
- **Status:** done

### U5. The seeded library and templates retired, and the fixtures that replace them
- **Goal:** nothing seeded remains in the library and the tests build their own ready forms.
- **Requirements:** R8, R9
- **Files:** `apps/api/prisma/migrations/20261024110000_retire_seeded_forms/{migration.sql,down.sql}` (the seeded form templates inactive), `apps/api/seed/sets/base/forms.ts`, `apps/api/test/integration/support/forms.ts` (a ready-form fixture with the identity marks, placed through the API), the tests that use it (`project-lifecycle.test.ts`, `public-forms.test.ts`, `templates.test.ts`, found with `grep -rln "publishedForm\|support/forms" apps/api/test/integration`), `seed.test.ts`, `apps/api/src/services/form-templates.spec.ts`, `apps/web/e2e/support/projects.ts`
- **Approach:** a data migration with a reversing `down.sql` (DB-MIG-05); the base seed no longer writes the library rows or the form templates (the empty library form comes from U1's migration).
- **Tests:**
  - integration: after the base seed the library has no section and `GET /form-library` lists none; the seeded templates are inactive; a project form built from them still reads and accepts applications.
  - existing: covered by `apps/api/test/integration/seed.test.ts` and the tests named in Files (updated to the fixture).
- **Done when:** the whole database suite passes on a fresh template database.
- **Depends on:** U4
- **Size:** M
- **Risk area:** migration
- **Status:** done

### U6. The Monitoring Team's screens
- **Goal:** the ready forms page, the library in the builder and the identity marks.
- **Requirements:** R1, R2, R3, R4, R5
- **Files:** `apps/web/src/admin/forms/` (`draft.ts` core locks by mark, `ReadyFormsPage.tsx`, `NewReadyFormDialog.tsx`, `FormBuilderPage.tsx` for a form without a project, `SettingsPane.tsx` with the identity mark, `FormCanvas.tsx` tag, `AddPane.tsx` library source, `forms-api.ts`), `apps/web/src/routes/index.tsx`, `apps/web/src/admin/navigation.ts`, `packages/shared/src/i18n/messages/{bn,en}/forms.json`, tests `ready-forms.test.tsx`, `builder.test.tsx`, `settings.test.tsx`
- **Approach:** `FormsPage` and `NewFormDialog` for the list and the dialog; the builder unchanged except the identity mark Select and the kind shown in the header.
- **Tests:**
  - unit/component: a question keyed `mobile` without the mark is not locked, and a marked question keeps required on; the page lists the ready forms with their kind and state; a new application form opens empty in the builder; the identity mark Select offers the seven roles and sets the fixed type; a publish refused for a missing role names it; the library opens in the builder from "প্রশ্ন-লাইব্রেরি বদলান"; axe in bn.
  - e2e: as the Monitoring Team, `/admin/ready-forms` → "নতুন তৈরি ফর্ম" → name "স্বাবলম্বী আবেদন", kind "উপকারভোগীর আবেদন" → "তৈরি করুন" → the builder with one empty section; add a short text, set "পরিচয়-চিহ্ন" to "নাম"; "প্রকাশ করুন" shows "উপকারভোগীর আবেদন-ফর্মে পরিচয়ের সব প্রশ্ন চিহ্নিত করুন"; after marking the seven roles the form publishes ("সংস্করণ 1: প্রকাশিত").
- **Done when:** the component tests pass and the screen works by hand at 1440 px.
- **Depends on:** U4
- **Size:** L
- **Risk area:** none
- **Status:** todo

### U7. The PM places a ready form
- **Goal:** the PM's project forms page places a ready form and takes a newer version.
- **Requirements:** R6, R7, R9
- **Files:** `apps/web/src/admin/forms/FormsPage.tsx`, a new `PlaceFormDialog.tsx`, the builder's read-only view for a placed form, `apps/web/src/admin/projects/setup/` (the form component's link), `forms.json`, tests `forms-page.test.tsx` or `builder.test.tsx`
- **Approach:** the dialog pattern of `NewFormDialog`; the placed form opens read-only like a published version today.
- **Tests:**
  - component: a PM sees "তৈরি ফর্ম বসান" and no "নতুন ফর্ম"; the dialog lists published ready forms; placing opens the placed form read-only; "এই ফর্মের নতুন সংস্করণ আছে" with "নতুন সংস্করণ নিন" appears when the source is newer.
  - e2e: as the PM, `/admin/projects/{id}/forms` → "তৈরি ফর্ম বসান" → choose "স্বাবলম্বী আবেদন" → "বসান" → the form shows "সংস্করণ 1: প্রকাশিত" and no "প্রকাশ করুন".
- **Done when:** the component tests pass and the flow works by hand.
- **Depends on:** U4
- **Size:** M
- **Risk area:** none
- **Status:** todo

### U8. The journey, the sweep and the documents
- **Goal:** the end-to-end journey follows the new roles, and the documents describe them.
- **Requirements:** R1–R10
- **Files:** `apps/web/e2e/form-builder.spec.ts`, `apps/web/e2e/a11y.spec.ts`, `docs/ui/SCREENS.md` (SCR-061 and a new ready-forms screen), `docs/testing/TEST_STRATEGY.md`, `docs/STATUS.md`, `CLAUDE.md` (the map)
- **Approach:** the T2.4b journey, split into the Monitoring Team's part and the PM's part.
- **Tests:**
  - e2e: the Monitoring Team builds and publishes "স্বাবলম্বী আবেদন" with the seven marks and a calculated question; the PM places it, switches the public link on, an applicant sends it on a phone at 360 px; the Monitoring Team publishes version 2; the PM sees "এই ফর্মের নতুন সংস্করণ আছে", takes it, and the earlier entry keeps version 1. The a11y sweep covers the ready forms page and the placement dialog in both languages.
- **Done when:** `form-builder.spec.ts` passes three times with `--repeat-each 3 --workers 1` and the sweep passes.
- **Depends on:** U5, U6, U7
- **Size:** M
- **Risk area:** none
- **Status:** todo

## Checkpoints
- **Mode:** grouped (one by one 4, grouped 13, all at once 2; N is over 4, so one by one's 4 goes to grouped)
- **Signals:** N 8, L 1,600, R 5, Fd 1, C 4, P 0
- **C1** after U1: a migration
- **C2** after U2: personal data (the identity rules)
- **C3** after U3: auth (the permissions)
- **C4** after U4: foundation for U5–U7, and auth
- **C5** after U5: a migration
- **C6** after U8: end

## Verification
- `pnpm typecheck`, `npx eslint . --ignore-pattern ".claude/**" --quiet`, `pnpm i18n:check`, `pnpm docs:check`
- `pnpm test` per project (`packages/shared`, `packages/ui`, `apps/web`, `apps/api`), and `npx vitest run --config vitest.db.config.mts` in `apps/api`
- `pnpm --filter @css/api contract:coverage`, `pnpm --filter @css/api authz:matrix`
- `pnpm --filter @css/web build` and `pnpm --filter @css/web bundle:report`
- `pnpm e2e`, and `npx playwright test e2e/form-builder.spec.ts --repeat-each 3 --workers 1` in `apps/web`

## Risks and rollback
- **Migrations:** both ship a hand-written `down.sql`; U1's down restores `project_id NOT NULL` only when no ready form exists (it refuses otherwise, rather than deleting forms), U5's down reactivates the seeded templates.
- **Auth:** a PM loses the builder; the matrix test and the 403 cases of U3 and U4 prove it before the web changes.
- **Identity:** a beneficiary form without its marks could reach applications if the publish check had a gap; U2's unit cases and U4's 422 case cover it, and forms built before keep their core columns.

## Definition of done
- All units done and their tests pass
- Verification commands pass
- `ae-review` has run, with no open P0 or P1
- Code from abandoned attempts is removed

## Progress
- **Branch:** `feat/ready-forms` (from `docs/form-decisions-d126` at 7e0eb17, with `fix/deps-audit-2026-10-24` merged in; both PRs (#24, #25) wait for CI and merge into `main` before this branch's PR)
- **Updated:** 2026-10-24 18:10
- **Next:** checkpoint C5 (U5, migration), then U6 the Monitoring Team's screens (first step: read `apps/web/src/admin/forms/` and `navigation.ts` for where the ready forms page goes)
- **Reviewed through:** C4 (U4 at 2c40380, fixes committed after it)
- **Uncommitted:** none
- **Notes:** U5: the base seed no longer calls `seedFormTemplates`; the data file stays, marked retired, and the tests that build forms the way earlier forms were built (forms, public forms, public photos) still seed it, which keeps R9 covered. The data migration `20261024110000_retire_seeded_forms` makes the two templates inactive and its reverse active again; it starts with `-- Data only:`, and the migration round-trip test now requires such a migration to leave the schema unchanged. `test/integration/support/forms.ts` `publishedForm` builds a ready form with the identity marks and places it (it also exports `question`, `IDENTITY`, `section`); the e2e helper `placeReadyForm` does the same through the Monitoring Team's demo account. The seed test's permission count was still 153 from before U3 (now 154). Full database suite: 827 of 827 with one worker (a first run lost one worker, as on main). C4 (T2, three reviewers): a project form copied from a form of the kind other, or carried by a project copy or template, became an application form; the kind now travels with every copy (`FormToCreate.kind`, the template form's optional `kind`). A lost key race on create and place answers 409 through `createUnlessKeyTaken`. The published read of a ready form shows the official-only sections only to a caller who holds `application.view_official_section` somewhere, in one query. Tests added for the read-only project on place and take, the kept kind, and the published read; unit tests for `libraryOf` and the new request schemas. No security defect. U4: `FormsService` reaches a form outside the projects only for a holder of `form.build` (a ready form) or `form.library.manage` (the library) at GLOBAL scope, otherwise 404; its audience is official and no project lock applies; a placed copy refuses a new draft (409 `form.placed_copy`). `ReadyFormsService` (list, create, published read, place, take) with the routes `GET/POST /ready-forms`, `GET /ready-forms/{formId}/published`, `POST /projects/{projectId}/forms/place`, `POST /forms/{formId}/take-version` (`form.place` at project scope, the create `form.build` at global); a placement and a take copy the published version as a draft, then stamp it and retire the one before. `GET /form-library` reads the library form's published version (`libraryOf` in `form-library.ts`; the container passes `readDefinition` in to avoid an import cycle) and adds `libraryFormId`; `templates` is empty. The public link refuses a form of the kind other (422 `public.form_not_application`). The form view carries `kind`, `sourceFormId`, `sourceVersionNo`, `newerVersionNo`. A PM, an RPM and a volunteer get 404 on the version read of a ready form and 403 on the versions list and the draft write (they hold no `form.build`), where the plan's test list said 404 for all three. The seeded-library tests of `forms.test.ts` moved to `ready-forms.test.ts` as the library form's tests. C3 (T2, three reviewers): the builder page tied the public-link switch to the builder role, so the PM lost it; the switch now has its own gate (`canManagePublicLink`: the PM and the two global roles), and the page asks for the versions and the library only for a builder, since both answer 403 to a PM; the role test, two API test names and the kind helper's note were fixed. No security defect; the public-link kind gate stays in U4. U3: `form.build`, `form.publish`, `form.library.view` without default grants (the two global roles hold them), `form.place` for the PM at PROGRAM, `form.public_link.manage` unchanged; the web's `FORM_BUILDER_ROLES` are the two global roles; the tests that build a project form act as the Monitoring Team (the PM keeps creating projects and switching the link); the old "another program's PM gets 404" cases are 403 now (no permission at all), and the copy-out-of-reach case left (a global role reaches every project); the e2e journey still builds as the PM and is rewritten in U8. U2: `identityRoleOf` reads a question's role from its standard column outside repeat groups; `checkDefinition(def, { publishing, kind })` checks the seven roles only at the publish of a beneficiary application, and `publishDefinitionSchema(kind)` is a function the publish calls with the form's kind; `blankDefinition()` gives one empty section titled from the catalogue (`forms.builder.first_section`); the public repeat check reads `standard_column`; `isCoreFieldKey` stays for the builder until U6 switches it to the marks; the refusal texts say identity questions; BR-078 rewritten. C1 (T2, two reviewers): decision numbers left code comments; the reverse's refusal and the 404 of a form outside projects got tests; the kinds are read back; U4 owns the check that a placed copy's source is a ready form (a CHECK cannot read another row). U1: `forms.project_id` nullable with `kind`, `source_form_id`, `source_version_no`, the CHECKs and partial uniques, the empty library form `01a16a00-0000-7000-8000-00000000f001` with its draft inserted by the migration; `down.sql` refuses while ready forms, copies or library content exist; `FormsService` reaches a form through its project with `projectOf`, a form without a project answering 404 until U4 adds the ready branch. The owner allowed the start on 2026-10-24 ("তোমাকে অনুমতি দিলাম। শেষ হলে t2.4c শুরু করে দিবা"); D-129 (ready forms catalogue, take on demand, the library in the builder, the public link only on an application form) is written with U1.
