---
title: The project decides the identity and contact an application asks, and a person's help shows on one profile
type: feat
status: in-progress
source: plan
date: 2026-11-12
doc_review: 2026-11-12
---

# The project decides the identity and contact an application asks, and a person's help shows on one profile

## Goal

A volunteer can take an application from a person who has no identity document at hand or no phone of their own, where the project allows it, and an official sees on one profile how often that person and that family were helped, in which years and projects.

## Problem

Every beneficiary application needs an NID or a birth registration number and a mobile number today (BR-001, BR-078, the database check `beneficiaries_identity_check` and `beneficiaries.mobile NOT NULL`). The department's distributions (winter clothing, iftar, Qurbani, flood relief) never asked for a document, many people have no phone, and volunteers wrote their own number, which the system refuses (BR-008). So the field cannot enter these people at all. The owner decided the new rules on 2026-11-12 (D-172).

## Requirements

- **R1** A project says whether the identity document is required or asked "if you have it"; a project that says nothing behaves as today (required).
- **R2** A project says whether a mobile number is required or may be left out; a number left out reads "contact through the volunteer" everywhere the number shows.
- **R3** A volunteer's own number is still never stored as a beneficiary's.
- **R4** A given number can say whose it is (own, a family member's, a neighbour's) and that person's name.
- **R5** A person without a document gets a profile from the name, the father's or husband's name, the gender, the address and the village, marked as without a document; an official who has compared the two adds a document later to the same profile, and its history stays.
- **R6** A project that requires the document refuses an application without a valid one, exactly as today.
- **R7** Names compare without honorifics and with near spellings folded, the same way in the database and on the phone.
- **R8** Profiles that look like one person are paired by name with father's or husband's name and village, next to the three rules of today.
- **R9** At entry, a volunteer who starts without a document is shown the people already there under that name, father's or husband's name and village, and picks one or says it is a new person.
- **R10** A volunteer sees of such a person only the name, the father's or husband's name, the village and the years of earlier help (a project's name only when the volunteer works on it); never a number or a contact, never more than five exact matches, only inside the area of a project the volunteer works on, and every such look is counted and recorded.
- **R11** The family members a submitted application carries are kept on the profile.
- **R12** An applicant who matches a member of an earlier beneficiary's family is shown at review as probably that member.
- **R13** A project says, for the same person and for the same family, whether a second appearance is only told or needs the official's written reason before approval; the system never rejects by itself.
- **R14** An official's "not the same person" is remembered and the pair is not raised again.
- **R15** The profile shows how often the person was helped: the total, since which year, this year, the list by year, a mark for more than once in a year and for twice in one project.
- **R16** The beneficiary list shows the times helped and filters on "more than once in a year"; the review page shows the earlier help; the exports carry both; each only for a role that may see a person's application history.
- **R17** The profile shows the family members, links a member who has a profile the viewer may open, and shows what the family received from the profiles the viewer may open; the others are a bare count.
- **R18** A person on the block list does not come back as a new profile, with a document or without: every new profile a send would make is compared first, and a new person whose name, father's or husband's name and village match a blocked profile goes to an official's verification.
- **R19** Every change of a project's switches and every profile made without a document is recorded with who did it, on which project and under which rule.

## Scope

- In: the project switches and their setup screen; the database and engine changes for a missing document and a missing number; the entry screen without a document, online and offline; the name key; the new pair and family rules; the decision reason; the family members on the profile; an official adding a document to a light profile; the help history on the profile, the list, the review page and the exports; the documents and rules that state all of this.
- Out (not now): a household record (BD-04 stays); the monitoring alerts on a volunteer's unusual share of such entries (the monitoring centre, Phase 5); "received" as the count (the distribution module, Phase 3; approved applications count until then); a recommendation as anything but form questions (the builder already makes them; a ready library part can follow); face matching; a guardian's document as an identity; changing who may merge profiles; a daily cap on profiles without a document per volunteer (the owner decided against one).

## Key decisions

- **The project decides, with today's behaviour as the default** (D-172): an existing project changes nothing until its PM changes the switch; the starting values of a workflow apply only when a project is created and are never written back into existing projects. Governs R1, R2, R6, R13.
- **No number is stored for "contact through the volunteer"** (D-172): the application already names its volunteer, so the contact follows a transfer and one number never sits on hundreds of profiles. Governs R2, R3.
- **A light profile is a real profile** (D-172): the same table, the same BEN number, the same history, with no document. Governs R5.
- **A volunteer never writes a document onto an existing profile** (the plan's security review): the number a later application carries stays in that application; an official attaches it after comparing. Otherwise a volunteer could give one person's history to another person's NID. Governs R5.
- **Showing always, holding by the project's choice** (D-172, the owner: "লক্ষ আটকানো এটাও ঠিক আছে কিন্তু সেটা আমাদের ইচ্ছা"): the hold is the written reason the approval already asks for a family match. Governs R13.
- **The family is recognised from the members list, not from a household record** (D-172, BD-04); a family link is always "probably" and never the ground of a refusal. Governs R11, R12, R17.
- **Claude's reading, stated to the owner**: the history across years is wanted for people without a document too; a public entry (no volunteer) always needs a mobile number, because nobody stands between the office and the person, while its document follows the project's switch; safe water and tree planting keep "required" until their PM changes it.

## Open questions

- The list of honorifics and near spellings the name key folds (U8 proposes one from the department's own forms; the owner confirms it before U8 is merged).
- ~~A daily cap on profiles without a document per volunteer~~ (decided 2026-11-12: none; the owner: "দৈনিক সীমা লাগবে না"; the project's per-volunteer limit bounds them and every such profile is recorded with its maker, R19).

<!-- ae-plan adds everything below -->

## Technical decisions

- **Stack profile**: unchanged (`CLAUDE.md`, "Stack profile"): Express 5 with `defineRoute`, Prisma 7 on PostgreSQL 17 with hand-written `down.sql`, React 19 with the asf contract, the shared form engine. Nothing is added to the stack (ST-40 to ST-44).
- **The switches live in the `application_form` component's settings** (`packages/shared/src/jsonb/component-settings.ts`), the strict JSONB the photo rule already uses, so they are saved by the existing component route, copied by the templates and carried by a project copy with no new table. One reader, `identityRules(settings)` in `@css/shared/projects`, gives the defaults (required, required, hold, hold) for empty settings and for a project with no such row, so the API, the phone and the tests never read the raw keys; a save into a missing row creates it as `nameFormOnComponent` of `apps/api/src/services/forms.ts` does, and a disabled component keeps its switches (a project without applications never reads them).
- **The starting value comes from the workflow template** (`docs/architecture/workflow-templates/*.yaml`, `defaults`), as the photo rule does (`workflow-defaults.ts`): distribution and Qurbani start with the document and the number optional and repeats only told; every other workflow starts as today. Only at creation.
- **The form keeps its seven identity questions** (BR-078 unchanged): whether the two number questions must be answered is decided when the answers are checked, from the project, because one ready form is placed on many projects. `validate` of `packages/shared/src/forms/validate.ts` takes the two flags from `identityRules`; its callers are the API's submit and save (`apps/api/src/applications/service.ts`), the public entry (`apps/api/src/services/public-forms.ts`, which always requires the mobile), the renderer (`FormRenderer`, from the project read of `my-projects.ts` or the public form's read) and the offline store (from the snapshot of `apps/api/src/sync/snapshot.ts`, which carries the four switches). The publish check passes no flags and does not change. The server reads the rule from the project at every submit and never from the client or a stored draft.
- **Whose number it is are two ordinary standard-column questions** (`mobile_owner` from a reference list, `mobile_owner_name`), with ordinary conditions, so the engine's answer shapes do not change and the phone's stored drafts stay valid. A published form without them keeps working with its seven questions; the two are optional everywhere. Dropped: a composite phone answer (it changes the answer schema of every stored draft and export).
- **Expand without contract** (DB-MIG-03, DB-MIG-04): `mobile` becomes nullable and the identity check is dropped; nothing is backfilled and no column is removed, so the migration is safe under the old code. Its `down.sql` cannot set `NOT NULL` back while rows without a mobile exist (PostgreSQL has no `NOT VALID` for it), so where such rows exist it restores the rules as CHECK constraints `NOT VALID` (`mobile IS NOT NULL`, the identity check, the earlier kind check), which hold every new and every changed row and leave the existing ones; on a database without such rows it restores the earlier schema exactly, which the step test of `migrations.test.ts` asks of every migration (DB-MIG-05, and this repository's rule of a hand-written `down.sql`).
- **One name key in two languages**: `person_match_key(text)` in SQL (immutable, with expression indexes, as `person_name_key` of `20261020160000_beneficiary_master` has) and the same function in `packages/shared/src/beneficiaries/`, held together by one table of pairs that a unit test and an integration test both read. The existing `person_name_key` stays for the search; the pair rules move to the new key in U10.
- **The name lookup for a volunteer is an exact-key lookup, not a search** (RBAC "field-level protection"): a permission of its own (`beneficiary.match`), the keys of the name, the father's or husband's name and the village must all match inside a union of a project area the caller works in, at most five rows and their count, no number, no contact and no document flag in the answer, the years of help with a project's name only where the caller works on it, a blocked person shown as "cannot be picked" in the words the number lookup uses today. Every call is audited (`beneficiary.matched`) and counted per caller and day against a setting (found or not; over it 429, also audited). Each row carries a short-lived signed token, and an application is started for a picked person only with that token, so no other call can ask "does this person exist". Picking returns nothing more than the row; the phone keeps the rows in memory only and the draft only the token and the typed answers, in the sealed store.
- **The hold reuses the decision comment** (`COMMENT_REASONS` of `apps/api/src/applications/decision-rules.ts`): `same_person` joins `family_match`, and both are asked only where the project says "hold"; the guard of the move to approved (`apps/api/src/workflow/guards.ts`, which calls `familyMatch` too) reads the same rule. No new state.
- **Times helped are kept on the profile row** (`help_count`, `max_helps_in_year`), because the list filters two million rows on it (`docs/testing/PERFORMANCE.md`). The states that count are named once in `@css/shared/workflow` (the approved state and the states after it: implementation, distribution, completed, closed, as the templates name them), and a test walks every seeded workflow so a new state must be classified. The engine recounts the one person after every move whose two states differ in counting, whatever the transition (approval, the pull from the waitlist, the reopen, the close), and the bulk paths that move states outside it (`applications.restore_prior_state` of a project's reopen, a project's close) recount the people they touched; a nightly recount repairs what is missed. The profile's own summary is read live and never from the counters.
- **Diagram:** none; no diagram in `docs/diagrams/` shows these flows.

## Implementation units

Build order: U1 to U7 (the first pull request), then U8, U9, U10, U11, U12, U16 (the second), then U13, U14, U15 (the third).

### U1. The rules in the register

- **Goal:** the business rules and the specification say what D-172 decided before the code that follows them is merged.
- **Requirements:** R1 to R19
- **Files:** `docs/BUSINESS_RULES.md` (BR-001, BR-008, BR-009, BR-011, BR-012, BR-078 reworded where they change; new rules from BR-297 for the project switches, the light profile, the name key, the new pair rule, the name lookup and its limits, the family from the members list, the hold, the times helped, the document added by an official), `docs/MASTER_SPEC.md`, `docs/MODULE_CATALOG.md` where it names the mandatory identity, `docs/security/RBAC.md` (the name lookup)
- **Approach:** the rows of D-171 and BR-245 in the register are the example; each new rule names D-172 and its test layer, with status "approved" and the test still "planned".
- **Tests:** none (documents); `pnpm docs:check` and `pnpm rules:status --phase 2 --report-only` run.
- **Done when:** `pnpm docs:check` passes and no rule in the register contradicts D-172.
- **Depends on:** none
- **Size:** S
- **Risk area:** none
- **Status:** done

### U2. The project's switches

- **Goal:** a PM sets, per project, what the application asks and what a repeat does, every reader gets one answer, and every change is recorded.
- **Requirements:** R1, R2, R13, R19
- **Files:** `packages/shared/src/jsonb/component-settings.ts` (the `application_form` settings gain `identity_document`, `mobile`, `repeat_person`, `repeat_family`), `packages/shared/src/projects/identity-rules.ts` (new: `identityRules(settings)` with the defaults) and its test, `packages/shared/src/projects/workflow-defaults.ts`, `docs/architecture/workflow-templates/{distribution,qurbani}.yaml` and `schema.json`, `apps/api/src/services/project-setup.ts` (the audit `project.identity_rules_changed` with the values before and after), `apps/api/src/services/my-projects.ts` (the volunteer's project read carries the rules), `apps/api/src/sync/snapshot.ts` (the snapshot carries them), `apps/web/src/admin/projects/setup/ComponentDrawer.tsx`, `setup.test.tsx`, `apps/web/src/features/projects/` and `apps/web/src/offline/snapshot.ts` (the reads' schemas), `packages/shared/src/i18n/messages/{bn,en}/`, `docs/api/openapi.yaml`, `apps/api/seed/sets/` (the seeded workflows)
- **Approach:** the photo rule end to end: `photoRuleSettings` of `workflow-defaults.ts`, the `photo_rule` schema of `component-settings.ts`, its part of `ComponentDrawer.tsx`.
- **Tests:**
  - unit: `identityRules` gives required, required, hold, hold for empty settings and for no settings at all, and the stored values otherwise; an unknown value is refused by the schema.
  - integration: the PM saves the four switches on the component, also on a project whose row does not exist yet, and the audit row holds the values before and after; a PM of another program is answered 404 (the project is hidden from a scope that does not reach it) and a role without project setup is refused (403); a project made from the distribution workflow starts optional, one made from construction starts required; a copy of a project carries the switches; an existing project's read gives the defaults.
  - e2e: covered by U7's journey (the setup step).
  - existing: covered by `apps/api/test/integration/project-setup.test.ts` and `apps/web/src/admin/projects/setup/setup.test.tsx`; updated, not duplicated.
- **Done when:** the drawer of "আবেদন ফর্ম" shows the four choices, saves them, and a volunteer's project read and the snapshot return them.
- **Depends on:** none
- **Size:** M
- **Risk area:** none
- **Status:** done

### U3. A profile may lack a document and a number

- **Goal:** the database takes a beneficiary with no document and no mobile, and still refuses what it refused before.
- **Requirements:** R3, R4, R5
- **Files:** `apps/api/prisma/schema.prisma`, `apps/api/prisma/migrations/<new>/{migration.sql,down.sql}` (drop `beneficiaries_identity_check`; `mobile` nullable; `mobile_owner`, `mobile_owner_name`; `applications_identity_kind_check` dropped and added again with `none`; the own-mobile trigger read for a null; `down.sql` restores the two rules as CHECK `NOT VALID` and the old kind check), `apps/api/prisma/sql/roles.sql` if grants change, `apps/api/test/integration/triggers.test.ts`, `apps/api/seed/sets/base/reference-lists.ts` (the list `mobile_owner`), `docs/database/DATABASE_SCHEMA.md`, `docs/database/ERD.md`
- **Approach:** `20261013000000_registration_draft_channels` relaxes a NOT NULL with its `down.sql`; `20261025090000_application_decisions` holds the kind check; the trigger tests of `triggers.test.ts` are the shape of the new cases.
- **Tests:**
  - integration: a profile with neither number saves; a null mobile passes the own-mobile trigger; a volunteer's number is still refused; a document number is still unique and still checked for its format; an application takes the kind `none`; `down.sql` applies on a database that holds a profile without a document and a mobile, after which a new such row is refused and the old one stays.
  - existing: covered by `apps/api/test/integration/triggers.test.ts` (the four own-mobile cases); kept.
- **Done when:** the migration and its `down.sql` run on the test template, and `pnpm --filter @css/api test` is green.
- **Depends on:** none
- **Size:** M
- **Risk area:** migration
- **Status:** done

### U4. The answers follow the project

- **Goal:** the form engine and its screens treat the document question and the mobile question as required only where the project requires them. The server does not change in this unit: its own checks keep asking the document and the mobile until U5 makes the profile without them, so there is no state in which the server accepts an application it cannot give a person to.
- **Requirements:** R1, R2, R6
- **Files:** `packages/shared/src/forms/validate.ts` (the option `optionalIdentity` beside `draft`, `optionalIdentityQuestion`, `optionalIdentityOf`) and its test, `packages/shared/src/projects/identity-rules.ts` (`carriedIdentityRules`: the rules a read or a stored project carries, or the defaults) and its test, `apps/web/src/features/forms/FormRenderer.tsx` and `FieldInput.tsx` (the required mark and the line under the two questions follow the option), `apps/web/src/features/forms/renderer.test.tsx`, `apps/web/src/features/applications/ApplicationFormPage.tsx` (a new application and a draft opened again read the project's rules, online from the project read and offline from the project the phone holds) with `applications.test.tsx` and `offline.test.tsx`, `apps/web/src/offline/snapshot.ts` (the stored project read through `carriedIdentityRules`), `apps/web/src/features/forms/PublicApplyPage.tsx` with `public.test.tsx` (the mobile always asked, the document by the project), `apps/api/src/services/public-link-rules.ts`, `public-forms.ts` and `apps/api/src/routes/public.ts` (the public form read says `project.identityDocument`; a read-only addition), `apps/web/src/api/schemas/forms.ts`, `docs/api/openapi.yaml`, `packages/shared/src/i18n/messages/{bn,en}/forms.json` (the two lines), `docs/ui/SCREENS.md`
- **Approach:** the `draft` option of `validate.ts` already relaxes "required"; the option sits beside it and touches only the questions whose standard column is the identity number or the mobile, outside a repeat group. The offline store itself checks no answers: the renderer's check before a part is done and before the send is the phone's own check, and it reads the rules of the cached project.
- **Tests:**
  - unit: with the option, an empty document answer and an empty mobile answer pass, each by its own flag; a malformed number or mobile still fails with the same code; without the option both are required as today; every other required question stays required; the helper gives the option for each combination of the project's rules and always asks the mobile of a public entry.
  - component: with a project that asks the document "if they have one" the question has no required mark, shows its line and the next part opens with it empty; with a project that requires it, as today; the public page keeps the mobile required whatever the read says; a project read without rules, or with rules that are not whole, behaves as required; offline, the send of a draft without a mobile is queued only where the cached project lets the mobile stay empty.
  - integration: the public form read says whether the project requires the document, for a project that does and one that does not, and a submit without a number is refused by the server in both (unchanged behaviour, pinned).
  - existing: covered by `packages/shared/src/forms/validate.test.ts`, `apps/api/test/integration/applications.test.ts`, `public-forms.test.ts`; kept.
- **Done when:** the cases pass and no existing application test changes its expectation.
- **Depends on:** U2
- **Size:** M
- **Risk area:** none
- **Status:** done

### U5. A light profile at submission

- **Goal:** an application without a document gets its person: a profile without a document, with the mobile empty when none was given, and never a second chance for a blocked person, whether the new profile would have a number or not.
- **Requirements:** R2, R3, R5, R6, R18, R19
- **Files:** `apps/api/src/applications/service.ts` and `apps/api/src/services/public-forms.ts` (the API's callers of `validate` pass `optionalIdentityOf` of the project's rules, read at every save and submit through `identityRulesOf` and never from the client or a stored draft; a public entry always requires the mobile, its document follows the project: `OpenLink.identityRules` already carries the rules), `apps/api/src/workflow/guards.ts` (`identity.present` follows the project's rule; a number given is still checked), `apps/api/src/applications/submission.ts` (`bindPerson`: no number in an optional project makes the profile; `mobile ?? ''` gives way to null), `apps/api/src/services/beneficiary-identity.ts` (`createProfile`, `NewProfile`, `sharedMobile`, the block check by name for a new person), `apps/api/src/services/beneficiary-merge-candidates.ts` (a null mobile pairs nobody), `apps/api/src/applications/` verification code (an entry without a number makes the light profile), `apps/api/src/services/beneficiaries.ts` and the volunteer-side views (a null mobile; "without a document"), `apps/api/src/services/beneficiary-merges.ts`, `apps/api/src/services/beneficiary-family.ts` (`b.mobile = me.mobile AS same_mobile` gives NULL where its type says boolean: `COALESCE(…, false)`), `apps/api/src/routes/beneficiaries.ts` (the `z.string()` mobile of the list row, the profile, the lookup's autofill and the contact view takes a missing number), `apps/api/src/services/media-referrals.ts` (the stopgap `b.mobile ?? ''` and its `mobile: z.string()` give way to the same), `apps/api/src/exports/rows.ts`, `apps/api/src/exports/pdf/profile.ts` (a missing mobile never prints "null"), `apps/web/src/admin/beneficiaries/` (the chips "পরিচয়পত্র নেই" and "স্বেচ্ছাসেবকের মাধ্যমে যোগাযোগ"), `apps/web/src/admin/applications/`, `apps/web/src/api/schemas/`, `docs/api/openapi.yaml`, `docs/architecture/WORKFLOW_ENGINE.md` (the guard catalogue), tests beside each
- **Approach:** `bindPerson` creates a profile from the answers today; the new branch is the same call with no number, `identityKind: 'none'`, and the audit `beneficiary.create` extended with the project, the rule in force and the maker. The block check runs for every new profile, with or without a number, inside the move's transaction right before the profile is made: it compares the new person's name, father's or husband's name and village with the blocked profiles through `person_name_key` (U10 moves it to the match key); a hit makes no profile, abandons the send and holds the application in the state the offline known-number entry goes to (`needs_verification`) with a flag. A number a live profile already holds binds that profile and is not compared, and an official who verifies the held entry is not compared again.
- **Tests:**
  - integration (moved here from U4, with the API's callers): in a project that asks the document "if they have one", a save and a submit without a number pass the answers' check; in a project that requires it the submit is refused with the same error as today; a public entry without a mobile is refused in both, and one without a number is taken where the project asks it "if they have one" (the pin of U4 in `public-forms.test.ts`, "refuses an entry without a number either way", changes with it).
  - integration: in an optional project a submit without a number creates one light profile with a BEN number and binds it, and the audit row names the project, the rule and the maker; in a project that requires the document the same submit is refused as today; the volunteer's own number is refused; a second submit of the same draft creates no second profile; a new person matching a blocked profile by name, father and village gets no profile and waits for verification, with an unused number too and in a project that requires the document too, also when the block arrives after the draft was made; the official's "another person" makes the profile and the entry does not return; two profiles with no mobile are not paired by the mobile rule and raise no shared-mobile warning; a merge of a light profile into a full one keeps the document, and the other direction is refused (the profile with the document is the kept one); another volunteer cannot read the profile (403/404 as today); the export of the list prints the chip's text and no number; the family matches of an application whose person has no mobile answer `sameMobile: false`, never null; the profile PDF of a person without a mobile prints the chip's text and never "null"; the list row, the profile, the lookup and the contact view of such a person pass the response contract; the person of a media referral without a mobile answers no number instead of an empty string.
  - existing: covered by `apps/api/test/integration/applications.test.ts` ("refuses a blocked person, the volunteer's own mobile and a second draft for the same new number"), `application-verification.test.ts`, `beneficiary-tab.test.ts`, `beneficiary-merge-candidates.test.ts`, `export-rows.test.ts`; updated.
- **Done when:** the office's list shows the application with its person and the two chips.
- **Depends on:** U3, U4
- **Size:** L
- **Risk area:** personal data
- **Status:** done

### U6. Whose number it is

- **Goal:** a given number can say whose it is, and the profile keeps it.
- **Requirements:** R4
- **Files:** `packages/shared/src/forms/core.ts` (the two standard columns; `mobile_owner` takes its options from its list), `packages/shared/src/forms/split.ts` and its test, `apps/api/src/services/beneficiary-contact.ts` (the change log names them), `docs/security/permissions.yaml` (both join the sensitive class `beneficiary.contact`), `apps/api/seed/sets/base/forms.ts` (the two library questions with their conditions), `apps/web/src/admin/forms/draft.ts` (`addIdentityQuestions` adds the two after the mobile question) and its tests, `apps/web/src/admin/beneficiaries/` (the profile line "কার নম্বর"), catalogues
- **Approach:** the gender question: a standard column backed by a reference list (`PROFILE_COLUMN_LISTS` of `core.ts`), filled by the server at every save.
- **Tests:**
  - unit: `split` maps the two answers to their columns; the owner's name shows only when the number is not the person's own (the seeded condition).
  - integration: a submit writes both to the profile; a later application changes them with a change-log row; a role that may not see a person's contact gets neither; a form published before this, with seven questions, still submits.
  - component: the identity press adds nine questions, the two new ones after the mobile.
  - existing: covered by `packages/shared/src/forms/split.test.ts`, `apps/web/src/admin/forms/draft.test.ts`; updated.
- **Done when:** the profile of a person whose number is a neighbour's says so with the neighbour's name.
- **Depends on:** U3
- **Size:** M
- **Risk area:** none
- **Status:** todo

### U7. Starting without a document

- **Goal:** on the phone, a volunteer starts an application without a number where the project allows it, online and offline.
- **Requirements:** R1, R2, R5, R6
- **Files:** `apps/web/src/features/applications/ApplicationFormPage.tsx`, `applications-api.ts`, `apps/web/src/offline/applications-store.ts`, `apps/web/src/features/applications/*.test.tsx`, `apps/web/e2e/identity-rules.spec.ts` (new), `apps/web/e2e/support/projects.ts`, `docs/ui/SCREENS.md`, `docs/architecture/OFFLINE_SYNC.md`, `docs/testing/uat/PHASE_2_UAT_BN.md`
- **Approach:** the identity card of `ApplicationFormPage.tsx` with its `known` and `new` starts gains a third; the offline store already holds a draft whose number is unknown until the sync.
- **Tests:**
  - component: the button shows only when the project's rule is "if you have it"; the form then draws the document question without its required mark.
  - e2e: `identity-rules.spec.ts` at 360 px. The PM opens `/admin/projects/:projectId/setup`, the component "আবেদন ফর্ম", sets "পরিচয়পত্র" to "থাকলে দিন" and "মোবাইল" to "না থাকলে স্বেচ্ছাসেবকের মাধ্যমে", saves. The volunteer opens `/my-projects/:projectId/apply`, presses "পরিচয়পত্র নেই, নাম দিয়ে শুরু করুন", fills the name, the father's name, the gender, the address and the village, leaves the mobile empty, and sends: "আবেদন জমা হয়েছে". The office's list shows the row with "পরিচয়পত্র নেই" and "স্বেচ্ছাসেবকের মাধ্যমে যোগাযোগ". In a project that requires the document the button is not there. Taken offline, the same entry syncs to the same result.
- **Done when:** the journey passes on the mobile project.
- **Depends on:** U5
- **Size:** M
- **Risk area:** none
- **Status:** todo

### U8. One name key

- **Goal:** two spellings of one name compare equal in the database and on the phone.
- **Requirements:** R7
- **Files:** `apps/api/prisma/migrations/<new>/{migration.sql,down.sql}` (`person_match_key(text)`, expression indexes on the profile's name, father's or husband's name and village with the union, and on the family member's name), `packages/shared/src/beneficiaries/match-key.ts` (new) with `match-key.pairs.ts` (the table of pairs) and its test, `apps/api/test/integration/match-key.test.ts` (new, the same table through SQL), `docs/BUSINESS_RULES.md` (the list of what is dropped and folded), `docs/database/DATABASE_SCHEMA.md`
- **Approach:** `person_name_key` and its indexes in `20261020160000_beneficiary_master/migration.sql` lines 36 to 40; no existing example for one rule kept equal in SQL and TypeScript, so the shared table of pairs is the contract.
- **Tests:**
  - unit: every pair of the table (মোঃ করিম / মোহাম্মদ করিম / করিম; মোছাঃ রহিমা বেগম / রহিমা খাতুন / রহিমা; আক্তার / আকতার; near letters; spaces and marks) gives one key, and every "must differ" pair gives two.
  - integration: the SQL function gives the same key as the TypeScript one for every row of the table; the indexes are used by the pair query (`EXPLAIN` names them).
- **Done when:** both tests read the one table and pass, and the owner has confirmed the list.
- **Depends on:** none
- **Size:** M
- **Risk area:** migration
- **Status:** todo

### U9. The family members on the profile

- **Goal:** the family members an application carries are kept on the person's profile.
- **Requirements:** R11
- **Files:** `apps/api/src/applications/submission.ts` (the rows `split` gives are written), `apps/api/src/services/beneficiaries.ts` (the profile's family read, masked as the contact class), `apps/api/test/integration/applications.test.ts`, `beneficiary-merges.test.ts`, `apps/web/src/offline/` (the sealed store already holds the group's answers: a test pins it), `docs/database/DATABASE_SCHEMA.md`
- **Approach:** `split()` of `packages/shared/src/forms/split.ts` already returns `familyMembers`; no service writes them today (the table is only read and moved by a merge). The list of the latest submitted application that carries the group replaces the active rows; earlier rows stay with `active = false`.
- **Tests:**
  - integration: a submit with three members writes three active rows; a later application with two replaces them and keeps the three inactive; an application without the group changes nothing; a merge still moves the rows; a volunteer never reads another volunteer's person's family; a role outside the contact class (Media, Procurement) gets no member's income.
  - existing: none for the write (nothing writes the table), characterize first: one test that pins today's read of the table through the profile.
- **Done when:** the profile of a self-reliance applicant lists the family from the application.
- **Depends on:** U5
- **Size:** M
- **Risk area:** personal data
- **Status:** todo

### U10. The same person and the same family, recognised

- **Goal:** profiles of one person are paired by name, father's or husband's name and village, and an applicant is recognised as a member of an earlier beneficiary's family.
- **Requirements:** R8, R12, R14, R18
- **Files:** `apps/api/src/services/beneficiary-merge-candidates.ts` (`DUPLICATE_RULES` gains `name_father_village`; the rules compare through the match key), `apps/api/src/jobs/duplicates.ts`, `apps/api/src/services/beneficiary-family.ts` (`FamilyRule` gains `family_member`; the same-person signal for a light profile in the same project), `apps/api/src/services/beneficiary-identity.ts` (the block check of U5 moves to the match key), `apps/api/src/applications/view.ts` and `decision-rules.ts` (the record's signals), `apps/web/src/admin/applications/Signals.tsx`, `apps/web/src/admin/beneficiaries/duplicates/`, catalogues, tests beside each, `docs/api/openapi.yaml`
- **Approach:** the three pair queries of `beneficiary-merge-candidates.ts` lines 49 to 65 and `matches` of `beneficiary-family.ts`; the dismissal of a pair (`MergeDismissal`) already keeps "not the same person".
- **Tests:**
  - integration: two profiles with one name key, father key, union and village key are paired with the new rule, and not when the village differs; a dismissed pair does not return; an applicant whose name and father match a member and the head of an earlier family in the same village gets `family_member` with the relationship, marked as probable; a shared phone above the group limit still pairs nobody by itself; the nightly job and the on-change refresh give the same pairs; the block check now catches a blocked person written with another honorific; an official outside both profiles' reach sees no pair.
  - component: `Signals` names the new reasons.
  - existing: covered by `apps/api/test/integration/beneficiary-merge-candidates.test.ts`, `beneficiary-family.test.ts`; updated for the key.
- **Done when:** the review page of a second application by a light profile's person shows the pair with its reason.
- **Depends on:** U8, U9
- **Size:** L
- **Risk area:** personal data
- **Status:** todo

### U11. The people already here, at entry

- **Goal:** a volunteer who starts without a document sees the people already there under that name and village, and picks one or says it is a new person.
- **Requirements:** R9, R10
- **Files:** `apps/api/src/services/beneficiary-identity.ts` (`matchByName`, the signed token), `apps/api/src/routes/beneficiaries.ts` (`POST /beneficiaries/match`), `docs/security/permissions.yaml` (the permission `beneficiary.match` with its grants), `docs/security/AUTHORIZATION_MATRIX.md`, `packages/shared/src/settings/` (the daily number of looks), `apps/api/src/rate-limit/`, `apps/api/src/applications/service.ts` (an application is started for a picked person only with a valid token of this caller and project), `docs/api/openapi.yaml`, `apps/web/src/features/applications/ApplicationFormPage.tsx` (the step "এই নামে আগে আছেন"), `applications-api.ts`, `apps/web/src/offline/applications-store.ts` (an offline entry is marked unchecked; the draft keeps the token, never the rows), tests beside each, `apps/web/e2e/identity-rules.spec.ts`, `docs/architecture/OFFLINE_SYNC.md`
- **Approach:** the number lookup of `beneficiary-identity.ts` (`lookup`, lines 156 to 233) for the audit row and the block gate, and `LookupField` on the web. No existing example for a lookup by name or for a pick token, so the answer's fields and limits are the ones R10 and the technical decision name; the token is an HMAC over the caller, the project, the person and an expiry with the server's existing signing secret.
- **Tests:**
  - integration: an exact key match of name, father and village in a union of the caller's project area returns the person with name, father's or husband's name, village and the years of help, and no number, contact or document flag; a project's name shows only when the caller works on it; a union outside the caller's project areas is refused (403); a near name in another village returns nothing; more than five matches return five and the count; a blocked person is marked as not to be picked and its token is refused; every call writes `beneficiary.matched`, also when nothing is found, and the call over the day's setting answers 429 and is audited; a caller without `beneficiary.match` is refused (403); an application started with a forged, expired or another caller's token is refused (422) and with a valid one binds the person; after the pick, the owner volunteer reads of the person exactly what the own-application view gives today.
  - e2e: in `identity-rules.spec.ts`, the second application for the same person: the volunteer types the same name, father's name, union and village, the list "এই নামে আগে আছেন" shows the person with the earlier year, "ইনিই" starts the form with the name locked, and the office's profile then shows two applications.
- **Done when:** the journey's second application lands on the first one's profile.
- **Depends on:** U5, U7, U8
- **Size:** L
- **Risk area:** personal data
- **Status:** todo

### U12. Tell or hold

- **Goal:** where the project says "hold", an approval of a repeated person or family asks the official's reason; where it says "tell", it does not.
- **Requirements:** R13, R14
- **Files:** `apps/api/src/applications/decision-rules.ts` (`COMMENT_REASONS` gains `same_person`; both reasons read the project's rule), `apps/api/src/workflow/guards.ts` (the guard of the move to approved reads the same rule), `apps/api/src/applications/view.ts` (`decisionHints`), `apps/web/src/admin/applications/DecisionDialog.tsx`, `Signals.tsx`, catalogues, `apps/api/test/integration/application-decisions.test.ts`, `apps/web/src/admin/applications/applications.test.tsx`, `docs/architecture/WORKFLOW_ENGINE.md`
- **Approach:** `family_match` of `decision-rules.ts`: the reason is computed in the move and the dialog asks the comment.
- **Tests:**
  - integration: with "hold", approving a person with an open same-person pair in the project is refused without a comment and accepted with one, and the comment is on the transition; with "tell" it is accepted without; a dismissed pair asks nothing; the family rule follows `repeat_family` the same way, in the guard and in the hints alike; a project with no setting behaves as today (the family match asks).
  - component: the dialog asks the reason and names why.
  - existing: covered by `apps/api/test/integration/application-decisions.test.ts`; updated.
- **Done when:** the same application is approved in one click in a "tell" project and asks its reason in a "hold" project.
- **Depends on:** U2, U10
- **Size:** M
- **Risk area:** none
- **Status:** todo

### U13. How often a person was helped

- **Goal:** the profile says how often the person was helped, by year, with the repeats marked.
- **Requirements:** R15
- **Files:** `packages/shared/src/workflow/` (the states that count, with the test over every seeded workflow), `apps/api/src/services/help-history.ts` (new: a person's counted applications by year and project), `apps/api/src/services/beneficiaries.ts` (the profile answers `help`, masked as the class `beneficiary.application_history`; the year list no longer stops at the first 20 applications), `docs/security/permissions.yaml`, `apps/web/src/admin/beneficiaries/` (the summary card and the marks), `apps/web/src/api/schemas/`, `docs/api/openapi.yaml`, catalogues, tests beside each
- **Approach:** `projectsByYear` of `beneficiaries.ts` (around line 255) is the list to extend.
- **Tests:**
  - unit: the summary of a list of applications: total, first year, this year, the years with more than one, the projects with more than one; a rejected, a waitlisted or a draft application counts nothing; every state of every seeded workflow is classified.
  - integration: a person with 25 approved applications over three years gets all of them; a viewer outside the person's reach is refused as today; a role outside the application-history class (Media) gets no `help`; a project the viewer cannot see is counted but not named.
  - component: the card reads "মোট 5 বার সাহায্য পেয়েছেন", the year with two shows "2 বার".
  - existing: covered by `apps/api/test/integration/beneficiary-tab.test.ts` (the profile), `apps/web/src/admin/beneficiaries/beneficiaries.test.tsx`; updated.
- **Done when:** a demo person helped twice in one year shows the mark on the profile.
- **Depends on:** none
- **Size:** M
- **Risk area:** none
- **Status:** todo

### U14. The times helped in the list, at review and in the exports

- **Goal:** the beneficiary list shows and filters the times helped, the review page shows the earlier help, and the exports carry both.
- **Requirements:** R16
- **Files:** `apps/api/prisma/migrations/<new>/{migration.sql,down.sql}` (`help_count`, `max_helps_in_year` with their backfill and index), `apps/api/src/workflow/engine.ts` (the recount of the one person after a move whose states differ in counting), `apps/api/src/services/project-lifecycle.ts` (the close and the reopen's `applications.restore_prior_state` recount the people they touched), `apps/api/src/jobs/` (the nightly recount, registered like `jobs/storage-stats.ts`), `apps/api/src/services/beneficiaries.ts` (the column, the filter and the order, each only for the application-history class), `apps/api/src/applications/view.ts` (the record's `helpedBefore`), `apps/api/src/exports/rows.ts` and `service.ts` (the columns, under the same class), `apps/web/src/admin/beneficiaries/` (the column and the filter in the address), `apps/web/src/admin/applications/ApplicationReviewPage.tsx`, `docs/database/DATABASE_SCHEMA.md`, `docs/testing/PERFORMANCE.md`, tests beside each
- **Approach:** the score written inside the move (`applications/scoring.ts`, `side-effects.ts`) is the example of a value kept by the engine; the storage figures job (`jobs/storage-stats.ts`) is the example of a nightly recount.
- **Tests:**
  - integration: an approval, a pull from the waitlist, a reopen from approved, a project's close and a project's reopen each leave the counters equal to a fresh count; the recount repairs a wrong counter; the list filters "more than once in a year" and orders by the count inside the caller's scope only; a role outside the application-history class can neither see, filter nor order by it (the filter is refused, not ignored); the record of a second application names the earlier project and year; the export prints the two columns only for a role that may see them.
  - e2e: none new; `beneficiaries.spec.ts` keeps passing, and the list measurement (`pnpm --filter @css/api perf:lists --only beneficiaries`) is recorded.
  - existing: covered by `apps/api/test/integration/beneficiary-tab.test.ts`, `export-rows.test.ts`, `application-decisions.test.ts`; updated.
- **Done when:** the filter returns the demo person helped twice, and the p95 of the list stays inside its budget.
- **Depends on:** U13
- **Size:** L
- **Risk area:** migration
- **Status:** todo

### U15. The family on the profile

- **Goal:** the profile shows the family members, links the ones who have a profile, and shows what the family received.
- **Requirements:** R17
- **Files:** `apps/api/src/services/beneficiary-family.ts` (the members with the profile each one matches, both ways), `apps/api/src/services/beneficiaries.ts`, `apps/web/src/admin/beneficiaries/` (the section "পরিবার"), `apps/api/src/exports/pdf/profile.ts`, catalogues, `docs/ui/SCREENS.md`, `docs/testing/uat/PHASE_2_UAT_BN.md`, `docs/STATUS.md`, tests beside each
- **Approach:** the profile's sections of `beneficiaries.ts` with their bounded reads; the media works on the profile (`publishedWorksOf`) is the example of a section that names only what the viewer may see.
- **Tests:**
  - integration: a member whose name key, with the head's name as father or husband and the same village, matches a profile the viewer reaches is linked to it as "probably"; that profile names the head only for a viewer who reaches the head; the family's help sums only the profiles the viewer reaches, and the others are "N more not shown" with no year, project or amount; a member with no match is listed without a link; a member's income is masked for a role outside the contact class.
  - component: the section lists name, relationship, age and monthly income, and the family's help by year.
  - e2e: `identity-rules.spec.ts`, last leg: the head's profile lists the son, the link opens the son's profile, and "এই পরিবার যা পেয়েছে" shows both projects.
  - existing: covered by `apps/web/src/admin/beneficiaries/beneficiaries.test.tsx`; updated.
- **Done when:** the journey's last leg passes and the UAT script has the new cases.
- **Depends on:** U9, U10, U13
- **Size:** M
- **Risk area:** personal data
- **Status:** todo

### U16. An official completes a light profile with its document

- **Goal:** an official who has compared the two adds an NID or a birth registration number to a profile that has none.
- **Requirements:** R5
- **Files:** `apps/api/src/services/beneficiary-corrections.ts` or `beneficiary-identity.ts` (`addIdentity`), `apps/api/src/routes/beneficiaries.ts` (`POST /beneficiaries/{beneficiaryId}/identity`, the permission `beneficiary.correction.approve` with a scope that reaches the profile), `docs/api/openapi.yaml`, `docs/security/AUTHORIZATION_MATRIX.md`, `apps/web/src/admin/beneficiaries/` (the action "পরিচয়পত্র যোগ করুন" on a profile without one), `apps/web/src/admin/applications/ApplicationReviewPage.tsx` (the line "এই আবেদনে পরিচয়পত্রের নম্বর আছে, প্রোফাইলে নেই" with the same action), catalogues, tests beside each
- **Approach:** the decision of a correction request (`beneficiary-corrections.ts`) writes a locked field with its audit; this is the same write for an empty field, audited as `beneficiary.identity_added` with the application it came from.
- **Tests:**
  - integration: an official in scope adds a free number to a light profile, the profile is no longer "without a document", and the audit row names the actor and the application; a number another profile holds is refused with the existing error and points at the merge; a profile that has a document is refused (that is a correction); a volunteer and an official out of scope are refused (403/404); a volunteer's later application with a number for a picked light profile leaves the profile's document empty.
  - component: the action shows only on a profile without a document, for a role that may use it.
- **Done when:** the review page of such an application offers the action and the profile shows the number afterwards.
- **Depends on:** U5, U11
- **Size:** M
- **Risk area:** personal data
- **Status:** todo

## Checkpoints

- **Mode:** grouped (one by one 10, grouped 7, all at once 0; N is over 4, so one by one's 10 goes to grouped: 17)
- **Signals:** N 16, L 3300, R 9, Fd 7, C 6, P 2
- **C1** after U2: the switches U4 and U12 read
- **C2** after U3: a migration that relaxes two constraints, and the foundation of U5 and U6
- **C3** after U5: personal data, and the foundation of U7, U9, U11 and U16
- **C4** after U7: end of the first part (the first pull request)
- **C5** after U8: a migration and a new pattern (one rule in SQL and TypeScript), and the foundation of U10 and U11
- **C6** after U9: personal data, and the foundation of U10 and U15
- **C7** after U10: personal data, and the foundation of U12 and U15
- **C8** after U11: personal data and a new lookup a volunteer can call
- **C9** after U16 (built after U12): personal data, and the end of the second part (the second pull request)
- **C10** after U13: the foundation of U14 and U15
- **C11** after U14: a migration with a backfill
- **C12** after U15: personal data, and the end (the third pull request)

## Verification

`pnpm lint`, `pnpm typecheck`, `pnpm docs:check`, `pnpm rules:status --phase 2 --report-only`, `pnpm test`, `pnpm --filter @css/api contract:coverage`, `pnpm --filter @css/api authz:matrix` (the committed matrix stays current), `pnpm e2e` (with `identity-rules.spec.ts`, `application-rules.spec.ts`, `offline.spec.ts`, `beneficiaries.spec.ts`, `a11y.spec.ts`), the web contract test against the E2E server, `pnpm --filter @css/web build` with `bundle:report` (400 KB), `pnpm --filter @css/api perf:lists --only beneficiaries` after U14. Each migration: `pnpm db:migrate` on a fresh database, then its `down.sql`, then `pnpm db:migrate` again.

## Risks and rollback

- **The relaxed constraints (U3).** After light profiles exist, the old code could meet a profile with no mobile; the migration ships in the same release as U4 and U5. `down.sql` restores the rules as CHECK constraints `NOT VALID` where such rows exist, so it runs with them present, refuses new ones and leaves the old ones (an old one can then be changed only into a row that has both); the column itself stays nullable after such a rollback, which the schema document says. Without such rows the rollback is exact.
- **A volunteer learning who was helped (U11).** The lookup is exact on three keys, inside the caller's project area, bounded to five rows, counted and audited on every call, answers no number or contact, and a person is picked only with the token the lookup gave; the security reviewer reads the code at C8 before it merges.
- **A document on the wrong profile (U16).** Only an official in scope adds it, after the review page showed both; the write is audited with the application it came from, and a number already held points at the merge.
- **The name key (U8).** A key that folds too much pairs different people; it only ever suggests, an official decides, and a dismissal is remembered. The owner confirms the list.
- **The counters (U14).** A missed update shows a wrong count; the nightly recount repairs it, and the profile's own summary never reads the counters.
- **A blocked name told by the waiting state (U5).** A volunteer can tell from the waiting state of an entry that the name matched a blocked person, as the number lookup already tells a volunteer that a number is blocked (BR-010). Every such entry shows the office its flag and its maker, so guessing names is visible.
- **Invented people (U5).** A profile without a document has no unique key; each is recorded with its maker, project and rule, the project's per-volunteer limit bounds them, and the alerts come with the monitoring centre. The owner decided against a daily cap.
- **Existing projects.** Every default is today's behaviour; only a PM's change of a switch changes a project, and that change is recorded.

## Definition of done

- All units done and their tests pass
- Verification commands pass
- `ae-review` has run, with no open P0 or P1
- Code from abandoned attempts is removed

## Progress

- **Branch:** `feat/beneficiary-identity-by-project`
- **Updated:** 2026-11-12 19:00
- **Next:** U6: whose number it is; first step: read `PROFILE_COLUMN_LISTS` in `packages/shared/src/forms/core.ts`
- **Reviewed through:** C3 at the fixes commit that follows 07aae201
- **Uncommitted:** none
- **Notes:** U1: the register already held BR-287 to BR-296 (the official's offline app, the official's own profile, the post codes, the stale reference answer), so the new rules are BR-297 to BR-309: BR-297 the project's four settings (section 4), BR-298 to BR-305, BR-307 and BR-308 in section 1, BR-306 in section 6, BR-309 the audit (section 13). Each has a register line `deferred to U<n> of the D-172 plan`, the form `pnpm rules:status` reads as answered; the unit that builds a rule replaces its line with the passing tests, and a rule built in parts keeps the open parts in the note. BR-001 keeps "DB + service" and its register line (`constraints.test.ts`, "NID or birth registration is mandatory") until U3 drops the database check: U3 changes both. The public entry that always needs a mobile is written into BR-299 as the plan's reading. RBAC.md describes the name lookup's permission as "a permission of its own" without its name, because that document lists only names `permissions.yaml` holds; U11 adds `beneficiary.match` to both. Found and left: BR-296's register line has no `— passing (date)` ending, so `pnpm rules:status --phase 2` counts it untested, as it did before this work.
  U2: every reader goes through `identityRules(settings)` of `@css/shared/projects` (camel-case view `document`, `mobile`, `repeatPerson`, `repeatFamily`; `identityRulesSchema` is its shape, `IDENTITY_RULE_SETTINGS` maps each to its settings key); a stored value outside the lists reads as the default, never as the looser choice. On the API, `services/project-identity-rules.ts` holds the project select (`IDENTITY_RULES_SELECT`, `identityRulesOf`), with which U4 and U12 can read the rule at a submit or an approval, and the one audit writer `auditIdentityRulesChange`. The reads carry `identityRules` on every item of `/me/projects` (list, one project, the consent answer), and the snapshot gets it from the same list; a project cached on a phone before this version has no `identityRules` until its next pull, so U4 and U7 must read a missing one as the defaults. Decided here, not in the plan: (1) the workflow templates stay at version 5: the four `defaults` are read only by `startingComponents` when a project is created, no transition changes, and the seed updates the stored definition in place; WORKFLOW_ENGINE.md section 12 says a template change is a new version, so the owner may still ask for version 6 of `distribution` and `qurbani`. (2) The audit `project.identity_rules_changed` is written beside `project.component_change`, only when the four values read differently before and after, and also when a draft changes its workflow (its components start again, `ProjectsService.update`); the starting values of a new project, a copy or a template's project are part of `project.create` and audit nothing more. (3) A save into a missing `application_form` row creates it switched off unless the save says otherwise (naming a form creates it switched on), skips the `If-Match` comparison because there is no stored version, and only this component is created that way; the list of components still shows no entry for a missing row, so the setup screen cannot open its dialog for such a project (none is made by the API: `startingComponents` writes every row). (4) The PM of another program gets 404 on the save, as on every project write (the project is outside its scope), and 403 goes to a role in scope without `project.configure` (an RPM, an Executive, a volunteer); the plan's "403" for the other PM is not what the access layer answers. (5) A copy or a template's project takes the source's settings whole, so a copy of a project that never set the four keys reads required and held even in the distribution workflow. (6) The drawer writes a key only when the PM touches that choice. For U4 on: a project made through the API from the distribution or the Qurbani workflow now starts optional, optional, tell, tell, so the integration and E2E helpers that make such projects (`draft('distribution')`, `e2e/support/projects.ts`) will stop requiring the two numbers once the answers follow the project; the demo seed's projects store `application_form: {}` and keep asking both. Not done: the drawer was not looked at in a browser (component tests only), and the web contract test against the E2E server was not run.
  C1 (the review after U2) found six things, fixed in one commit: (1) the audit entry `project.create` now carries `identityRules`, read from the stored `application_form` settings after the workflow's components and a template's or a copy's definition were applied, so the starting rules of every new project are on record; (2) the web schema `myProjectSchema` reads a missing `identityRules` as `DEFAULT_IDENTITY_RULES`, and `cachedProjects()` of `apps/web/src/offline/snapshot.ts` does the same for a stored project (a missing or malformed value reads as the defaults); the web app does not parse an API answer at run time (`api<T>()` only types it), so a screen of U4 or U7 that reads `identityRules` straight from `/me/projects` must fall back the same way when it reads it; (3) BR-297 and SCREENS say that a draft which changes its workflow starts its four choices again; (4) `distribution` and `qurbani` are at version 6 (decision (1) of U2 above is superseded), the other templates and `_common` stay at 5, and `engine.spec.ts` pins each template's version; a database seeded before keeps the version 5 rows beside the new ones, and a new project binds the highest version; (5) a test name; (6) the 404 of another program's PM in U2's test line.
  U3: the migration is `20261112160000_beneficiary_optional_identity`, written by hand (`db:migrate:dev` connects to the development database, which this work must not touch). What the NULLs meet: the own-mobile function `check_beneficiary_mobile_not_volunteer` and its three triggers are unchanged, because `b.mobile = users.mobile` is never true for a NULL on either side (tests in `triggers.test.ts`, also for a number given later and taken away again); the format CHECKs of `mobile`, `nid` and `birth_reg` pass a NULL; the two partial unique indexes cover only the rows that have a number; `beneficiaries_mobile_idx` and `beneficiaries_dup_name_father_mobile_idx` hold NULLs; no trigger refreshes the duplicate pairs (the service does). The duplicate and family SQL already pairs nobody on a missing mobile: `PAIRS_BY_MOBILE` of `beneficiary-merge-candidates.ts` groups all NULL mobiles into one group of `GROUP BY mobile` but joins back with `=`, `refreshFor` counts 0 profiles for a NULL and compares with `=`, and `same_mobile` of `beneficiary-family.ts` is NULL (read as false), so U5 needs tests there, not new logic (it may leave the NULL group out of the `GROUP BY` for its cost). Decided here, not in the plan or the brief: (1) `down.sql` has two outcomes, because the step test of `migrations.test.ts` asks every `down.sql` to restore the earlier schema exactly on an empty database: each rule comes back NOT VALID and is validated (or `mobile` set NOT NULL) when no row breaks it; where a row does, the CHECK stays NOT VALID and `mobile` stays nullable under the stand-in CHECK `beneficiaries_mobile_required`, which `migration.sql` drops `IF EXISTS` so that it applies again after either outcome; a kept row without a document or a mobile then refuses every update that does not give it both. (2) `mobile_owner_list` is a stored generated column, as `gender_list` is (DATABASE_SCHEMA 5.2), not a column with a default, so no writer can point the code at another list; adding it rewrites the table once, also on css_erp_perf at the next `perf:seed`. (3) `mobile_owner_name` is 1 to 200 characters after trimming (the length of `users.display_name`; the profile's own name columns have no length check). (4) No database rule ties the two owner columns to a mobile: whether an owner without a number is refused is U6's, in the service. (5) The list `mobile_owner` (own, family, neighbour, other) is in the base seed like `gender`, not in the migration and not among the editable lists; a deployed database gets it from `pnpm db:seed --set base`, which U6 needs before it writes a code. `PROFILE_COLUMN_LISTS` of `packages/shared/src/forms/core.ts` is untouched (U6). (6) BR-001 is now "workflow guard + service" and its register line names the guard's tests; `constraints.test.ts` no longer has "NID or birth registration is mandatory". For U5, the places whose contract still says the mobile is a string, kept as they were: the API schemas of `apps/api/src/routes/beneficiaries.ts` (the list row and the profile `mobile: contact(z.string())`, the lookup's `autofill.mobile`, `contactView.mobile`), the person of a media referral in `apps/api/src/services/media-referrals.ts` (`mobile: z.string()`; its read is the one place the compiler stopped and now answers `b.mobile ?? ''`), `NewProfile.mobile` and `sharedMobile` of `beneficiary-identity.ts`, the export shapes (`exports/pdf/profile.ts` `mobile?: string`, `exports/records.ts`, `exports/rows.ts`), the same fields in `docs/api/openapi.yaml`, and the web schemas `apps/web/src/api/schemas/beneficiaries.ts` (list row, profile, lookup autofill, contact view) and `media.ts` (the referral's person). Every other read of `beneficiary.mobile` compiles because the value goes untyped into its answer, so the compiler will not point U5 at them.
  C2 (the review after U3) found that a rollback which keeps rows freezes them, and nothing said so: PostgreSQL holds a NOT VALID check against every new version of a row, so a kept profile or application refuses every update. The design stays (a rollback deletes and invents nothing); `down.sql` now says it in its header with the three constraints to drop by hand, ends with a WARNING that counts the kept rows, and states that it must run in one transaction (no `down.sql` of the repository wraps itself, and the test harness sends each file as one implicit transaction); the tests cover each rule on its own, a second run in a row, the two ways out of the freeze, and that the owner columns, their index, foreign key and check are gone; the inserts that were only checked for success are read back; ERD and DEPLOYMENT follow, and the review's four places for U5 are in its Files and Tests. Found and left: `pnpm db:seed` refuses every database but a development or test one, so nothing yet brings the base lists (`gender`, `mobile_owner`) to staging or production; DEPLOYMENT section 5 names it for T3.0.
  U4: narrowed by one decision taken before it was built: the server does not change in this unit, so the API's callers of `validate` and U4's integration cases moved to U5 (its Files and Tests name them). Built: `optionalIdentity` of `ValidateOptions` (`{ document?, mobile? }`), which lets the question marked with the standard column `nid_or_birth_reg` or `mobile` (found through `identityRoleOf`, so under any key and never inside a repeat group) pass empty; `optionalIdentityQuestion(field, option)` says which of the two a question is where it may stay empty, and `optionalIdentityOf(rules, audience)` builds the option the same way for every caller, with the mobile always asked for the audience `public`. The renderer takes the option as a prop, draws the two questions without the required mark and adds a line under each through `FieldInput`'s new `hint`, joined after the question's own help with a space; a locked answer (a known person's number) shows no line. Decided here, not in the brief: (1) the two lines end with a full stop ("থাকলে দিন।", "If they have one.") because they follow a help text; (2) the public read carries one field, `project.identityDocument` (`required` or `optional`), not the four rules, and `resolveOpenLink` reads the rules with the link in its one query (`OpenLink.identityRules`), which U5 uses at the submit; (3) `carriedIdentityRules` of `@css/shared/projects` is the one reading of rules that arrive in an answer or sit in the phone's store (whole and well-formed, or the defaults), used by the application page and by `cachedProjects()`; (4) a draft opened again reads its project's rules too (`EditDraft` asks the project, online or from the phone), and asks both while that read is on its way or has failed; (5) `applications-store.ts` did not change: it validates nothing, the renderer's check is the phone's own, and offline it gets the rules of the cached project through `projectOf`. Known and wanted until U5: where a project lets an answer stay empty, the screen now lets the form through and the server refuses it (a volunteer's submit without a mobile, a public entry without a number, each with `validation.required` on the question); the demo seed's projects ask both, and a project made from the distribution or the Qurbani workflow starts optional, so those two workflows show this between U4 and U5 (same pull request). The first route measured 398.1 KB gzip of the 400 KB budget after this unit (two catalogue lines; 1.9 KB left). Not done: no screen was looked at in a browser (component tests only); the E2E suite and the web contract test were not run (the web schema of the public read changed).
  U5: the server follows the project's rule at every check, read from the project's stored settings in the same request or transaction (`identityRulesOf` in the engine's application select, in `bindPerson`, in the application service's `PROJECT_SELECT`, in the unlock's target, and `OpenLink.identityRules` for the public entry). Built: `EngineApplication.project.identityRules`; `identity.present` passes an empty answer where the document is optional; every caller of `validate` on an application's answers passes `optionalIdentityOf` (the service's `checked`, the guard context, the public entry, the unlock's whole-application check); `bindPerson` makes the profile without a document (`identity_kind` `none`, mobile NULL where the project lets it be left out, else 422 `validation.mobile_format` as before) and audits `beneficiary.create` with `projectId`, `identityDocument`, `mobileRule`, `document`, `hasMobile`, `madeBy`; `createProfile` takes no number only with `documentOptional`; `NewProfile.mobile` is optional. The block match: `BeneficiaryIdentityService.blockedNamesake(db, personKeysOf(standard))` is the one comparison (U10 swaps the key there). How the match reaches the verification state: no new transition and no new effect. `ApplicationsService.holdForVerification`, which a late offline send already used to move a draft to `needs_verification` under the submit move's own permission and guards (audit `application.held_for_verification`), is now a thin wrapper around a private `hold`; `act('submit')` first asks `looksBlocked` (a draft without a person and without a number, in a project whose document is optional, whose person matches) and then calls `hold`, which compares again inside its transaction and writes the flag and `candidate_beneficiary_id`; the window guard is skipped only for a late send. The same comparison runs when an entry is held for another reason (a late or stale sync at creation or at the send) and at a public entry without a number. Decided here, not in the brief: (1) a new flag `blocked_name_match` and its migration `20261112180000_application_blocked_match_flag` (the check constraint `applications_flags_check` lists the flags; `down.sql` strips the flag from the rows and keeps them waiting with their candidate), because the existing `identity_blocked` says "the profile of this number is blocked" and its text would be wrong here. (2) The flag, the candidate of such an entry and a list filter by the flag are answered to the office only (`OFFICE_FLAGS` in the application service); the sync result of such a record carries no reason code. (3) `verify_link` on an entry without a number links to its candidate only (the same identity-scope check as a link by number); while the block stands it answers 409 `beneficiary.blocked`; the web dialog offers no link button for such an entry (it shows the line, a link to the blocked person's profile and "তৈরি করুন"; the record's own button rejects), so linking after a block is lifted is an API call only until U11 gives the dialog a pick. (4) The application summary and record answer `hasDocument` and `hasMobile` (`boolean | null`, of the bound profile): in a list to a holder of the class `beneficiary.nid` or `beneficiary.contact`, on the record also to the volunteer who brings the application; `identityKind` takes `none`, answered as `null` to a reader who may not know (a paid volunteer of the project). (5) On the beneficiary list and profile `hasDocument` is marked with the class `beneficiary.nid` alone (not the `beneficiary.view_nid` scope), stated in `permissions.yaml`; the list route declares the class. The Media and Procurement Teams get neither it nor the mobile. (6) An application bound to a profile without a document stays editable in its states: its name and father's or husband's name are locked to the profile, and a number added by an edit is refused as a locked field (U16 adds it). (7) The unlock of an answer checks the whole application with the project's rule too, so a correction may clear a mobile the project lets stay empty; the profile's stored mobile is not cleared by it. (8) The exports print the two texts from `common.person.*` (the screens' own keys) through `personCells` of `exports/file.ts`: the mobile cell, and both identity cells of a person without any document; a person with one number leaves the other cell empty. (9) A merge moves no identity number, as it never did for a profile holding one of the two: a profile without a document that is kept stays without one of its own (`hasDocument` false) while the retired profile's number still leads to it in a search; pinned by a test and left for the owner, U16's "add a document" is the way to carry it over. Not done: no screen was looked at in a browser (component tests only); the E2E suite, the web contract test and `contract:coverage` were not run; `apps/web/e2e/support` and the demo seed are untouched (the demo projects still require both).
  C3 (the review after U5) found five things, fixed in one commit: (1) a merge could keep the profile without a document and retire the one that has it (decision (9) of U5, which pinned that and left it for the owner, is superseded): where only one of the two has an NID or a birth registration number, that one is the kept profile, and the other choice answers 422 `validation.failed` with the detail `beneficiary.merge_keep_document` on `keptId` at a proposal, at a direct merge and when a proposal is carried out; the compare page chooses that profile, switches the other radio off and says why. (2) The guard trimmed the identity number and the binding did not; the engine already stores no answer of only spaces and trims a number at every save (pinned in `validate.test.ts`), so only a row written past it could differ, and every server reader now takes the number through `identityNumber`, `identityNumberIn` or `identityOf` of `apps/api/src/applications/answers.ts`. (3) The comparison with the block list ran before the transaction and only for an entry without a number: it now runs in `bindPerson`, right before any new profile is made, with a number or without, in every project; a match raises `BlockedNamesakeMatch` out of the move, and `act` holds the draft after the rollback with the flag and the matched profile. The pre-check before the transaction is gone (one comparison, inside the move); `hold` reads whether the person was compared from the flag, not from a candidate; `verify_create` and `verify_link` pass `compared`; an entry held for another reason and a public entry carry the flag whenever a verification would make a new profile for a matching person. Left as it is: an entry with a number nobody holds has no profile to link to, so the official makes the profile as another person or refuses the entry; and a block that arrives after an entry was held for another reason is not seen at its verification (the comparison is skipped there by design). (4) The tests a reader could not find by name now stand under their own names (a second send, the family match beside a missing mobile, the reads of a person without a mobile and a document, the media referral's null mobile, the verification of an entry without a number, the public page's mobile). (5) The English help of the verification dialog says "refuse", the word of its button. Not done: no screen was looked at in a browser; the E2E suite, the web contract test and `contract:coverage` were not run.
