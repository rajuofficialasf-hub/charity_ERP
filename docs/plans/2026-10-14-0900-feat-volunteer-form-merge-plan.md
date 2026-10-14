---
title: One volunteer form: the registration and the profile with the personal, profession and skills data (T1.9e)
type: feat
status: in-progress
doc_review: 2026-10-14
source: plan
date: 2026-10-14
---

# One volunteer form: the registration and the profile with the personal, profession and skills data (T1.9e)

## Goal
A volunteer registers, and later sees and changes the own profile, with one set of data: the earlier fields plus the personal data, a profession with its own fields, the skills and an emergency contact. The registration stays in small steps (the first step, the contacts, is unchanged), and the profile shows the same data in its sections.

## Problem
Owner message of 2026-10-14 with a pasted form specification: the registration and the profile should become one "beautiful form". The specification adds the blood group, the date of birth, the T-shirt size, a preferred volunteering area, a dynamic profession section (six professions with their own fields), the areas of interest, a vehicle, swimming, availability and an emergency contact. Today the form has only the name, the parents, the NID, the address, five optional work texts and the photos.

## Requirements
### Data and API
- **R1** `volunteers` keeps the new data: the blood group, the date of birth, the T-shirt size, the volunteering area, the profession and its details (one object), the areas of interest (a list), the vehicle, swimming (yes or no), the availability, and the emergency contact (name and mobile). All are optional in the database; fixed lists have check constraints.
- **R2** The volunteer submit takes the new fields and no longer takes `experience` and `workDescription` (their columns and data stay). Mandatory are the name, the mobile, the NID, the address down to the union and the profession, and, as before, the father's and mother's name (the form of BD-44; the specification pasted by the owner does not list them, so the owner is asked to confirm); the fields inside a profession and all other new fields are optional. A profession's details are validated by the schema of that profession only (an unknown field is refused); a profession without details is allowed. The profession is checked against the fixed list first and the schema is picked only then (`__proto__` and `constructor` are refused as unknown professions).
- **R3** The details of the profession and the emergency contact are one value each; the interest areas are a list of the five fixed options. The lists are fixed in `@css/shared` with a bilingual label per option. The skills are one group: the interest areas, the vehicle, swimming and the availability, sent as one value. Every text has a maximum length (names and short texts 200, addresses 300 to 400), the interest areas are unique, and the strict schema bounds the whole object, so no value can be larger than its schema; an approved request is validated again with the same schema before it is written.
- **R4** The blood group, the date of birth and the emergency contact are in the field class `volunteer.identity`: the volunteer sees the own values; an approver sees them only with that class; the response mask and the edit-request values follow it. The other new fields are not protected.

### Registration form
- **R5** The volunteer registration has seven steps: contacts (unchanged), identity (the mother's name, NID, WhatsApp as today, date of birth, blood group, T-shirt size), address (the cascade, the village or house, the volunteering area), profession (the profession choice, its fields, then the education, the previous projects and the Facebook id), skills (areas of interest, vehicle, swimming, availability, the emergency contact), account, photos. The staff form is unchanged.
- **R6** The profession choice shows the fields of that profession only; changing it drops the fields of the old one, so nothing stale is sent. The submit has the profession details as one nested object.
- **R7** Each step checks its own fields and says what is wrong in Bengali or English; a refused submit goes back to the step of the field.

### Profile and approval
- **R8** The own profile has the sections personal (with the date of birth, blood group, T-shirt size), contact (with the emergency contact), address (with the volunteering area), work (the type, the profession with its details, the education, the previous projects and, only when filled, the old experience and work description), skills, bank, photos. The edit mode asks for one request per ticked detail; the profession, the skills and the emergency contact are edited as groups with the same inputs as the registration.
- **R9** The edit and the correction requests accept the new fields: `bloodGroup`, `dateOfBirth`, `tshirtSize`, `volunteeringArea` as values and `profession`, `skills`, `emergencyContact` as groups; approving writes them into the profile in one step.
- **R10** The registration detail of an approver shows the new data (the protected ones only with the class) and may ask for a correction of any of the new fields.

## Scope
- In: the shared schemas and lists, the migration, Prisma, the volunteer submit, the profile and detail views, the correction and edit fields with their apply step, the field class entry, the registration steps, the profile sections and the edit inputs, the approver's detail view, the catalogue texts in both languages, OpenAPI, DATABASE_SCHEMA, SCREENS, STATUS, tests and e2e.
- Out: the staff registration; a configurable list of professions or interests (an open question noted in D-092); searching or filtering volunteers by the new data (T1.10); using the blood group or the vehicle in assignments; an import of old data; the first page (contacts) of the registration.

## Key decisions
- **O-65** (owner, 2026-10-14): the answers to the four questions: the earlier work details are merged (education, previous projects and the Facebook id stay; the work description and the experience are covered by the profession and are not asked), the new personal data are protected like the NID, mandatory only the name, mobile, NID, address and the profession, every change from the profile is an edit request.
- **D-092** (implements O-65): the columns and the lists above; the profession details as one JSONB object with a strict schema per profession; the protected data stay in `volunteer.identity` (no new class); grouped edit values for the profession, the skills and the emergency contact; seven registration steps.
- Reuse: of `packages/ui`: `TextField`, `Select`, `RadioGroup`, `CheckboxGroup`; of the web features: `ValueEditor` and `EditSection` (`features/account`), `AddressFields` (`features/registration`) and the edit mode of T1.9d; of the API: the field mask of T1.8 (`sensitive(schema, class)`), `applyField` and the request views of T1.9. Comments that cite this plan's IDs also give its path `docs/plans/2026-10-14-0900-feat-volunteer-form-merge-plan.md`.

## Implementation units

### U1. Shared lists and schemas
- **Files:** `packages/shared/src/registration/{details.ts (new),index.ts}`, `packages/shared/src/registration/details.test.ts` (new), `packages/shared/src/i18n/messages/{bn,en}/registration.json` (option labels)
- **Approach:** `details.ts` holds the fixed lists (blood groups, T-shirt sizes, volunteering areas, vehicles, availability, interest areas, professions), the strict schema of each profession's details (`professionDetailsSchema` by profession), `professionValueSchema` (`{ profession, details }`), `skillsValueSchema`, `emergencyContactSchema`, the date of birth (an ISO date in the past) and the field value schemas that `index.ts` adds to `CORRECTION_FIELD_VALUES`; the submit schema of a volunteer drops `experience` and `workDescription` and takes the new fields; `changeRequestAnswerSchema` stays (string or object).
- **Tests:** unit: every profession accepts its own fields and refuses another profession's field; an empty details object and a missing profession detail pass; an unknown profession (also `__proto__`, `constructor` and `toString`), a text over its maximum, a repeated interest area, a blood group outside the list, a date of birth in the future or malformed, an emergency mobile that is not a Bangladeshi mobile and an interest area outside the five are refused; the submit schema refuses `experience` and `workDescription` and accepts the minimum (the old mandatory fields and the profession).
- **Done when:** the unit tests pass. **Size:** M · **Risk area:** personal data · **Status:** done

### U2. Database and API
- **Files:** `apps/api/prisma/schema.prisma`, `apps/api/prisma/migrations/20261014000000_volunteer_profile_details/{migration.sql,down.sql}`, `apps/api/src/services/{registration,registrations,volunteers,change-requests}.ts`, `apps/api/src/routes/{registrations,volunteers}.ts`, `apps/api/src/core/logging.ts`, `docs/security/permissions.yaml`, `docs/api/openapi.yaml`, `docs/database/DATABASE_SCHEMA.md`, `docs/security/AUTHORIZATION_MATRIX.md` (regenerated)
- **Approach:** the migration adds the columns (nullable; check constraints for the lists, the profession details an object and the interest areas an array); `volunteerColumns` takes the new fields (a reused rejected account clears them first, as for the bank); `applyField` gets the new cases (the date as a date, the three groups into their columns); the own profile view (`routes/volunteers.ts`, unmarked as for the NID today: it returns data of the signed-in volunteer only) returns them, and the approver's registration detail returns them with the protected ones marked `sensitive(..., 'volunteer.identity')` (the mask is where an approver is kept from them; any later list or export must be marked too); `CLASS_OF` of the change requests names `bloodGroup`, `dateOfBirth`, `emergencyContact` (spelled exactly as the edit field names); the log redaction list (`SENSITIVE_KEYS`) gets `dateOfBirth`, `bloodGroup`, `emergencyContact`, `emergencyContactName`, `emergencyContactMobile` and `professionDetails`; `permissions.yaml` lists `volunteers.blood_group`, `volunteers.date_of_birth`, `volunteers.emergency_contact_name` and `volunteers.emergency_contact_mobile` in the class; OpenAPI and the schema document follow.
- **Tests:** integration (`api-db`): a submit with the full form stores every column and the profession details as one object; a submit with the minimum works; a profession's foreign field gives 422; the own profile returns the data; the volunteer gets the own three protected values from the own profile; an approver without `volunteer.identity` sees no blood group, date of birth or emergency contact in the registration detail and in the edit-request values, an approver with it does; a unit test walks the protected edit fields and asserts that `CLASS_OF` has an entry for each; an edit request for each new field is created, approved and written (the groups as one); a second open request for a field gives 409; a request for another volunteer's data stays impossible; a correction asks for a new field and the answer is written; reuse of a rejected account clears the new columns; the migration applies and its down.sql reverts it. API/unit: the drift test (OpenAPI equals the registry), the authorization matrix is regenerated and the endpoint permissions in it do not change, the log redaction of the new keys at the top level and nested (`emergencyContact.name`, `professionDetails.*`).
- **Done when:** the unit, API and integration tests pass; `pnpm docs:check` passes. **Depends on:** U1 · **Size:** L · **Risk area:** migration, personal data, authorization · **Status:** todo

### U3. Registration form
- **Files:** `apps/web/src/features/registration/{form-state.ts,FormSteps.tsx,RegisterPage.tsx,ProfessionFields.tsx (new),SkillsFields.tsx (new),registration.test.tsx}`, `packages/shared/src/i18n/messages/{bn,en}/registration.json`
- **Approach:** `ProfessionFields` and `SkillsFields` are controlled inputs (value and onChange) used by the registration and, in U4, by the profile edit; the steps are contact, identity, address, profession, skills, account, photos; `checkStep` and `submitBody` follow the new schema; `stepOf` maps the new fields to their steps; a changed profession clears the details; no hard-coded text.
- **Tests:** component: the seven steps in order for a volunteer and three for an official; the first step is unchanged; the profession choice shows only its fields and a change drops the old values (the submit body has the new profession's details only); the minimum path submits; the mandatory fields are refused in their step; a refused submit shows its field in its step; the old type, bank and reference fields are still absent; axe in both languages on the profession and skills steps.
- **Done when:** the component tests pass. **Depends on:** U1 · **Size:** L · **Risk area:** none · **Status:** todo

### U4. Profile and approver views
- **Files:** `apps/web/src/features/account/{ProfileView.tsx,ProfileDetails.tsx,EditSection.tsx,ValueEditor.tsx,profile-api.ts,profile.test.tsx}`, `apps/web/src/admin/registrations/{RegistrationDetail.tsx,registrations-api.ts,registrations.test.tsx}`, the catalogue files
- **Approach:** the profile sections as in R8 (a skills section is added to the navigation); `Value` shows the profession with its details, the interests, the yes or no answers and the emergency contact; `ValueEditor` gets the new fields (single values, and `ProfessionFields`, `SkillsFields` and an emergency-contact pair for the groups); the approver's detail shows the new data and the correction dialog lists the new fields.
- **Tests:** component: each profile section shows its data; the old experience and work description show only when filled; the edit mode sends one request per ticked new field with the right value (the groups whole); a profession change in the edit mode sends the new profession and its details only; an approver's detail shows the new rows and hides the protected ones without the class (the mask), and the correction dialog offers the new fields.
- **Done when:** the web tests pass. **Depends on:** U2, U3 · **Size:** L · **Risk area:** personal data · **Status:** todo

### U5. E2E, documents, status
- **Files:** `apps/web/e2e/{registration,profile}.spec.ts`, `docs/ui/SCREENS.md`, `docs/STATUS.md`, `CLAUDE.md` (only if the layout changed)
- **Tests:** e2e: a volunteer registers through the seven steps on a phone with a profession and skills and reaches the confirmation; the RPM approval journey still works; the profile shows the new data and sends a request for a new field; no sideways scroll at 360 px; the registration spec with `--repeat-each 3` and `--workers 1`.
- **Done when:** `pnpm test` and `pnpm e2e` pass, the documents name the new fields. **Depends on:** U4 · **Size:** M · **Risk area:** none · **Status:** todo

## Checkpoints
- **Mode:** grouped
- **C1** after U2: the migration, the personal data and the authorization of the new fields
- **C2** after U5: the whole range (U3 to U5)

## Verification
`pnpm typecheck`, `pnpm lint`, `pnpm test` (needs `docker compose up -d postgres minio mailpit`), `pnpm build`, `pnpm e2e`, `pnpm docs:check`, `pnpm --filter @css/api authz:matrix`, and a look at `/register` and `/account/profile` at desktop and 360 px.

## Risks and rollback
- **Migration:** only additive columns with check constraints; `down.sql` drops them. A rejected account that registers again must not keep the earlier new values (tested).
- **Contract:** the volunteer submit becomes stricter for `experience` and `workDescription` (422); the web and the API are deployed together; an old cached PWA gets 422 until it updates.
- **Personal data:** the blood group, the date of birth and the emergency contact are new personal data; they ride the NID class and the log redaction, and the exports (none yet) must follow the class (BD field-level rule). The emergency contact is a third person's name and mobile: it is kept with the profile like the other data (no retention limit and no hard delete, BD-46), cleared only when a rejected registration is reused, and no export includes it except through the class.
- **Size:** about 40 new texts in two languages and two new input components; the units are tested one by one.

## Progress
- **Branch:** feat/volunteer-form-merge
- **Next:** U2: database and API (tests first: the integration tests of the submit with the new fields, the masks, the edit requests; then the migration, Prisma, services, routes, permissions.yaml, openapi, DATABASE_SCHEMA)
- **Reviewed through:** none
- **Updated:** 2026-10-14
- **Uncommitted:** none
- **Notes:** U1 is `packages/shared/src/registration/details.ts` (lists, per-profession strict schemas, grouped values, `parseProfessionDetails` with an own-key lookup) re-exported from `index.ts`; the submit takes `profession` (required), `professionDetails`, flat skills and `emergencyContact`; the edit and correction values are `bloodGroup`, `dateOfBirth`, `tshirtSize`, `volunteeringArea`, `profession` ({profession, details}), `skills`, `emergencyContact`; the correction list limit is now 40; new error codes `validation.date_format` and `validation.date_future`. The API does not compile until U2 (it still reads `experience` and `workDescription` from the submit).
