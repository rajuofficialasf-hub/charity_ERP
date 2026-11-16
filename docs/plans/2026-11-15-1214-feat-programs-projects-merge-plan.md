---
title: Programs and projects in one tab, with permanent projects and yearly sessions
type: feat
status: ready
source: brainstorm
date: 2026-11-15
doc_review: 2026-11-15
---

# Programs and projects in one tab, with permanent projects and yearly sessions

## Goal

An official opens one tab, "প্রোগ্রাম ও প্রকল্প", sees every program as a card, opens a program to see its projects as cards, and opens a project to see its yearly sessions. A project keeps its name and history from year to year. Each year's work is a session that starts from a copy of the last one.

## Problem

- The admin area has two tabs, Programs (`/admin/programs`) and Projects (`/admin/projects`), that do not lead into each other. The programs page shows no projects. The projects page is a flat list.
- The RPM and the Project Executive never see a program's name. The web app reads the programs only for the Department Head, the Monitoring Team and the PM (`PROGRAM_ROLES`), although the server lets the RPM and the Executive read the programs of their projects. So the program column of the project list is empty for them, and the project page leaves the program out.
- Every project runs again each year: স্বাবলম্বী from January to December, or from June to the next July. The project stays the same; only that year's work ends and the next year's begins. Today each year is a separate project with no link to the year before. The project code may be used only once in the whole system, so next year's স্বাবলম্বী cannot keep `SWB`. Nothing can count a program's projects or a project's beneficiaries across the years.

## Requirements

### The tab and the addresses

- **R1** The sidebar has one destination, "প্রোগ্রাম ও প্রকল্প", at `/admin/projects` in place of "প্রকল্প" and "প্রোগ্রাম". The phone tab "প্রকল্প" leads to the same page, and "আরও" no longer lists "প্রোগ্রাম".
- **R2** `/admin/programs` redirects to `/admin/projects`. Every address of a session that exists today (`/admin/projects/:projectId` and the pages under it) keeps working unchanged.
- **R3** The page has a switch "কার্ড | তালিকা" and opens on the cards. An address that carries a list filter (`status`, `programId`, `year`, `endingSoon`) or `view=list` opens the list, so the home's attention items, the PM's widget and the notification links keep landing where they land today.

### Three levels

- **R4** A program holds permanent projects; a permanent project holds sessions. A session is what a project is today: its applications, budget, quotas, volunteers, forms, rules and its lifecycle from draft to closed stay on it unchanged.
- **R5** A permanent project has a program, a code, a name in both languages, an optional short description in both languages and an optional cover photo. A program also gets an optional short description in both languages and an optional cover photo.
- **R6** A session has a start month and an end month. Its label comes from them: "2026" when it starts and ends in one year, "2026-27" when it ends in the next. The label stands beside the project's name wherever a session is named (its page heading, the breadcrumb, the list, a picker).
- **R7** Every project that exists before this change becomes a session of its own new permanent project, with the same program, code and names, and a period read from its year (January to December of that year).

### Cards (all five official roles)

- **R8** The Department Head, the Monitoring Team, the PM, the RPM and the Project Executive see every program card and every project card. A card shows counts only: no person's name except the program's PM and the RPMs, no NID, no budget, unless R13 allows it.
- **R9** A program card's front shows the cover (the uploaded photo, else a calm illustration on the asf greens), the badge "প্রোগ্রাম", the name, and three figures: "মোট প্রকল্প", "চলমান প্রকল্প" (a project whose current session is active or closing) and "মোট উপকারভোগী" (people approved in any session of the program, each person counted once).
- **R10** A program card's back shows the PM or "PM দেওয়া হয়নি", the RPMs of its projects as small photos ("+n" after three), "চলমান সেশনে আবেদন", "স্বেচ্ছাসেবক", the short description, the button "সব প্রকল্প দেখুন", and "প্রোগ্রাম এডিট করুন" for the Department Head and the Monitoring Team. No figure of the front is repeated on the back.
- **R11** A project card's front shows the cover, the badge "প্রকল্প", the current session's state ("সেশন 2026-27 · সক্রিয়", or "চলমান সেশন নেই · শেষ 2025", or "সেশন 2027 · খসড়া"), the days left of the application window ("আবেদন আর 45 দিন"; with seven days or fewer, "শিগগির শেষ · আবেদন আর 5 দিন" in the warning tone), the name, a bar of approved against the session's target ("412 / 600 অনুমোদিত"), and "এই সেশনের আবেদন", "লক্ষ্য পূরণ" and "আবেদনের শেষ দিন".
- **R12** A project card's back shows the RPMs of the current session, "স্বেচ্ছাসেবক", "জেলায় কাজ চলছে", "মোট সেশন", "সব সেশনে উপকারভোগী", the button "প্রকল্প খুলুন", and "নতুন সেশন শুরু করুন" for whoever may create a project in that program.
- **R13** The box "আপনার করণীয়" shows on a card's back only to a caller whose scope reaches a session behind it; nobody else sees the box or its numbers. On a project card it holds the current session's reviews waiting, people on the waitlist, and the budget for a caller who may see the budget. On a program card, as in the approved mockup, it holds the reviews waiting and the waitlist summed over the program's current sessions that the caller's scope reaches, without a budget.
- **R14** On a computer the card turns over (a 3D turn of 180 degrees) when the pointer rests on it or the focus enters it, and turns back when they leave. On a touch screen the button "বিস্তারিত" turns it over and "ফিরুন" turns it back. A press on the card's title opens the program or the project. With reduced motion the card changes sides without the turn. Both sides keep one size, and no text shows mirrored.

### Pages inside the tab

- **R15** A program's page (breadcrumb "প্রোগ্রাম ও প্রকল্প / <program>") shows its projects as cards, with "নতুন প্রকল্প" for whoever may create a project in that program.
- **R16** A project's page (breadcrumb up to the program) shows the code, the program, "সব সেশনে উপকারভোগী" and its sessions newest first: label, period, state, applications, approved, and "খুলুন" to the session's page, or "অনুমতি নেই" where the caller's scope does not reach it. It offers "প্রকল্প এডিট করুন" and "নতুন সেশন শুরু করুন" to whoever may create a project in that program. On a phone the sessions are cards.
- **R17** "নতুন সেশন শুরু করুন" asks for the start month and the end month, shows the label they give, and the session it copies (the newest by default). It names what is copied (components and their settings, the application form, the rules, the dawah syllabus, the scoring rules) and what is given again (dates and the application window, budget amounts, areas and RPMs, volunteers, quota targets). "খসড়া তৈরি করুন" creates a draft session and opens its setup.
- **R18** A new project ("নতুন প্রকল্প") takes the code, the names, the description and the cover, and then opens the setup of its first session as the wizard does today.
- **R19** The list view keeps today's list (state chips, the program, year and "শিগগির শেষ" filters, keyset paging) with the session label and a project filter added.

### Who changes what

- **R20** Creating, editing and the cover of a program stay with the Department Head and the Monitoring Team. Creating and editing a permanent project, its cover and a new session belong to the PM of that program and the two global roles. Every such change is audited.
- **R21** A cover is a JPEG, PNG or WebP photo, stored on the organisation's server through the file service and streamed by the API like every other private photo.

## Scope

- In: the merged tab and its three pages, the permanent project and the session period, the cards with the figures above, the covers, the new-session flow, the redirect, the backfill of today's projects, the docs and tests of all of it.
- Out (not now): the program and project dashboards (SCR-050, SCR-101); program-level warnings on the card ("এ বছর এখনো শুরু হয়নি", not chosen by the owner); figures of later phases (distributed, spent, stock, monitoring alerts); any change inside a session (setup steps, applications, lifecycle); renaming the `projects` table or its API; legacy data (there is none).

## Key decisions

- **Three levels: program, permanent project, session** (owner, 2026-11-15, the first of three options): today's project becomes the session and keeps everything it holds; a light permanent project sits above it. Governs R4 to R7.
- **The yearly part is called "সেশন"** (owner, 2026-11-15). Governs R6, R11, R16, R17.
- **Cards turn on hover on a computer and by a button on a phone** (owner, 2026-11-15: "কম্পিউটারে মাউস রাখলেই উল্টাবে কিন্তু মোবাইলে বাটন থাকবে"). Governs R14.
- **Cover photo: uploaded, else an illustration** (owner, 2026-11-15). Governs R9, R11, R21.
- **"মোট উপকারভোগী" counts approved people, each once by BEN-ID** (owner, 2026-11-15). Governs R9, R12.
- **The flat list stays as a second view** (owner, 2026-11-15). Governs R3, R19.
- **All five official roles see every program and project; details stay with those who hold the permission** (owner, 2026-11-15: "pm head monitoring regional executive সবাই সব প্রোগ্রাম প্রজেক্ট দেখতে পারবে। বিস্তারিত যাদের অনুমতি আছে তারাই দেখবে"). Governs R8, R13, R16.
- **Added to the cards: target progress and time, who is working, your to-do by permission** (owner, 2026-11-15; program warnings not chosen). Governs R10 to R13.
- **The card brief is adapted to the system** (owner: "সব এমনই হতে হবে তা নয়। আমার সিস্টেম এর উপর ডিপেন্ড করে করতে হবে"): asf tokens, fonts and Solar icons in place of the brief's colours, Inter and Lucide; no figure repeated on both sides. Governs R9 to R14.
- **The design and the defaults are approved** (owner, 2026-11-15, after the mockup `docs/ui/mockups/programs-projects.html`: "ঠিক আছে, এগোও"): the redirect, the descriptions, the derived label, the backfill and counts-only cards for everyone.

## Success criteria

- The mockup `docs/ui/mockups/programs-projects.html` and the built pages match in structure and words at 1280 px and 360 px.

<!-- ae-plan adds everything below -->

## Technical decisions

- **Names in code and docs.** The permanent project is a **project series**: table `project_series`, model `ProjectSeries`, API `/project-series`. The session stays the `projects` row, model `Project`, API `/projects`, so the 34 tables that point at `projects.id` and every address under `/admin/projects/:projectId` stay as they are. The screens say "প্রকল্প" for a series and "সেশন" for a session. MASTER_SPEC, ERD and the glossary get this mapping. The blueprint's "প্রকল্প = one year's work" stays true of the data; only the screen word moves (D-176).
- **The session keeps `program_id`, tied to its series by the database.** `project_series` has a unique `(id, program_id)`. `projects` gets `series_id` with a composite foreign key `(series_id, program_id)` to it. A session cannot sit in another program than its series, and the scope filters (`projectWhere`, `programWhere`) keep working unchanged.
- **Period and label.** `projects` gets `period_from` and `period_to` (dates: the first day of the start month and the last day of the end month). Two checks hold:
  - `period_to >= period_from`, at most 24 months apart;
  - `year = extract(year from period_from)`.

  The label is computed, never stored, by one pure function `sessionLabel(periodFrom, periodTo)` in `@css/shared/projects`: "2026", or "2026-27" when the end month falls in the next year. The API returns it as `sessionLabel` beside the period.
- **One session per series per start year.** `projects.code` loses its global unique and gets a unique `(series_id, year)` and a unique `(code, year)`. A session's code is always its series' code: the service sets it and never takes it from the body. The unique on `(code, year)` repeats what the series' unique code gives; it stays as the database's own guard that application numbers stay unique even if a code ever drifted. The application number `<code>-<year>-<5 digits>` (`apps/api/src/applications/submission.ts`) therefore stays unique without change. A second session that starts in the same year is refused with 409 `project.session_year_taken`.
- **A session's name follows its series.** A new session copies the series' names. Renaming a series renames all its sessions in the same transaction, in one audit entry. Program and code are fixed on a session, and the setup's basic step shows them read-only (the program select of `BasicsSection.tsx` goes away). A draft's period may change while it stays a draft.
- **The current session of a series** is its newest active or closing session, else its newest session that is not cancelled. "Running" means the current session is active or closing. Cards and counts read this one definition, kept in one place in the series service.
- **Counts.** One grouped SQL read per request over the programs or series on the screen, never a query per card. It follows `apps/api/src/services/projects-work.ts` (its received, waiting, approved and waitlisted counts and `count(DISTINCT volunteer_id)`), inside `boundedRead` (`apps/api/src/core/bounded-read.ts`). The figures:
  - beneficiaries: `count(DISTINCT beneficiary_id)` over the applications in `HELPED_STATES` (`packages/shared/src/workflow/actions.ts`), across all sessions of the series or program;
  - reviews waiting: the `WAITING` states of `projects-work.ts`;
  - waitlist: `status = 'waitlisted'`;
  - volunteers: distinct `project_volunteers.volunteer_id`;
  - districts: the distinct districts of `project_areas`, through the location's parent chain;
  - RPMs: the distinct `project_areas.rpm_user_id` with their photo file id, at most three returned plus a count;
  - target: `targetBeneficiaries`;
  - days left: `applyTo` minus today in Asia/Dhaka.

  The time is measured on `css_erp_perf` (2,000,000 beneficiaries) with a new `perf:lists` entry. An index is added only if the measure asks for one.
- **Who reads the cards.** A new permission, `project.overview.view` ("see every program and project with counts only"), default GLOBAL for `program_manager`, `regional_program_manager` and `project_executive`; the two global roles already hold every permission.
  - The card reads (`GET /program-cards`, `GET /project-series`, `GET /project-series/:seriesId`) declare it. They return counts and the names of the PM and the RPMs only.
  - The "আপনার করণীয়" block (`todo`) and each session's `canOpen` come from the caller's own `project.view` scope (`AccessService.findProject`, `projectWhere`).
  - The budget inside `todo` comes only with `budget.view`, as `ProjectsService.view` decides today.
  - Finance and the Media Team are not given the new permission (default deny) and keep today's reads.

  Rules NE-SEC-03 and RE-SEC-05.
- **Writes.**
  - `POST /project-series`, `PATCH /project-series/:seriesId` (with If-Match) and `POST /project-series/:seriesId/sessions` (with an Idempotency-Key, `RE-FX-03`) declare `project.create` at PROGRAM scope: the PM of that program and the global roles (R20).
  - `PATCH /programs/:programId` gains the description, under `program.update`.
  - Every write is audited with its before and after.
  - **The program is read from the database, never from the body** (NE-SEC-03). `project.create` on `POST /projects`, `POST /project-series/:seriesId/sessions`, `PATCH /project-series/:seriesId`, the series cover and a draft's period edit is checked at PROGRAM scope against `project_series.program_id` as stored. A PM of another program gets 403.
  - **A series' program and code never change after it is created.** `projectSeriesUpdateSchema` is strict and carries only the names and the description (the cover has its own route); a body with `programId` or `code` answers 400 and changes nothing.
  - **The reads say what the caller may create.** Each program card and each series carries `canCreate`, computed in the service from the caller's `project.create` scope, as `canOpen` is. The web shows "নতুন প্রকল্প" and "নতুন সেশন শুরু করুন" from that flag, never from the role alone (RE-SEC-05).
  - **The card reads have a rate limit.** `GET /program-cards`, `GET /project-series` and `GET /project-series/:seriesId` use the existing `list` rate-limit class of the nationwide lists (NE-SEC-04).
- **A new session reuses the existing copy.** `POST /project-series/:seriesId/sessions` takes `{ periodFrom, periodTo, sourceProjectId? }`. The source is the newest session when absent, and must be a session of this series, else 422 `project.session_source_foreign`. The draft is created through `ProjectsService.create` and `applyDefinition` (`apps/api/src/services/project-definition.ts`). That copy already carries the components with their settings, the syllabus, the rules texts and the published form. The form's scoring points (`scoring` in `packages/shared/src/forms/definition.ts`) live inside the form definition, so they travel with the form. The copy never carries the dates, areas, volunteers, budget or quota targets (BD-10). `copiedFromProjectId` records the source.
- **The wizard's first step.** `POST /projects` takes `{ seriesId, periodFrom, periodTo, start }` in place of `{ code, programId, year, name }`; the code, program, names and year come from the series. This breaking change reaches only our own web app and the E2E helpers. Both change in the same unit, with the OpenAPI document and the tests.
- **Covers.** A new file kind, `cover_photo` (JPEG, PNG or WebP up to 5 MB, in the `photos` bucket), uploads through the existing chunked upload. It is linked through `file_links` with `entity_type` `program` or `project_series` and slot `cover`, after `apps/api/src/services/staff-photos.ts`: a new cover moves the link, and the old file stays.
  - `PUT /programs/:programId/cover` declares `program.update`, and `PUT /project-series/:seriesId/cover` declares `project.create`. Both are audited.
  - `apps/api/src/files/records.ts` lets a holder of `project.overview.view` read a cover's content and thumbnail. Nothing else in the file service changes.
  - **Who may upload a cover.** The upload session already checks `file.upload` and the scope of the record a file is for. An upload of kind `cover_photo` reaches its program or series only for a caller who holds `program.update` (a program) or `project.create` in that program (a series). A volunteer, an RPM and an Executive are refused.
  - **Which file may become a cover.** The PUT accepts only a finished upload of kind `cover_photo` that the caller uploaded and that no other record links. Anything else answers 422.
- **The flip card is a new asf piece** (`RE-UI-04`): `FlipCard` in `apps/web/src/ui/contract.ts`, with the asf template's implementation, a `local.json` entry, `ui.local.flip-card.test.tsx`, a picture in `docs/ui/asf-pieces/` and a gallery entry. The turn is CSS, as in the mockup:
  - `perspective: 1200px`, `preserve-3d` and `backface-visibility: hidden`, over 0.7 s;
  - the pointer turns it only under `(hover: hover) and (pointer: fine)`, and the focus under `:focus-within`;
  - the touch buttons show under `(hover: none)`;
  - under `prefers-reduced-motion` there is no transition.

  Without a photo, the cover is an inline SVG drawn from the asf greens and seeded by the record's id (`apps/web/src/components/CoverArt.tsx`), never a canvas.
- **Addresses.**
  - `/admin/projects` is the merged page. Its view comes from the address: `?view=list`, or any list filter.
  - `/admin/projects/programs/:programId` is a program, and `/admin/projects/series/:seriesId` is a project. React Router ranks these static segments above `:projectId`.
  - `/admin/programs` is a `<Navigate replace>` to `/admin/projects`.
  - The two attention items that open the bare list, `unlocks_to_verify` and `verifications_pending` in `packages/shared/src/attention.ts`, point to `/admin/projects?view=list`.
- **The RPM sees the program's name.** `ProjectFacts.tsx` and the list's program column read the program cards, which every holder of the overview permission may read. `GET /programs` stays as it is, for the pickers and the program dialog.
- **Stack profile (ST-40 to ST-45): unchanged.** PostgreSQL through Prisma, the storage adapter and the own auth are already in `CLAUDE.md`. No library is added: the turn is CSS, and the cover upload uses the existing upload client and FileImage.
- **Every step through the assunnah-engineering skills** (owner, 2026-11-15: "সব গুলো কাজ assunnah স্কিল দিয়ে করবে"; D-167): `ae-work` builds unit by unit, `ae-test` tests, `ae-review` reviews at each checkpoint, `ae-commit` commits, `ae-ship` opens the pull request into `develop`. The code starts from `develop` after `feat/beneficiary-help-history` is merged, and only when the owner says so.
- **IDs stay in the plan.** The plan's IDs (R, U, D, BR) stay in the plan and the documents, and the code gets their meaning in words (`ORG-CMT-10`, `ORG-CMT-50`).

## Implementation units

### U1. Shared rules: the session period, its label, the series and session schemas
- **Goal:** One pure place holds the label, the period checks and the request schemas that the API and the web both read.
- **Requirements:** R5, R6, R17
- **Files:** `packages/shared/src/projects/session.ts` (new: `sessionLabel`, the `sessionPeriod` zod schema, `MAX_SESSION_MONTHS`), `packages/shared/src/projects/requests.ts` (`projectSeriesCreateSchema`, `projectSeriesUpdateSchema`, `sessionCreateSchema`, the new `projectCreateSchema`, the program `description`), `packages/shared/src/projects/index.ts`, `packages/shared/src/projects/session.spec.ts`
- **Approach:** follow `packages/shared/src/projects/requests.ts` and its spec. The description is an optional pair in both languages, like the names.
- **Tests:**
  - unit:
    - the label is "2026" for Jan–Dec 2026, "2026-27" for Jun 2026–Jul 2027, and "2026" for a period that starts and ends in March of one year;
    - refused: an end before its start, more than 24 months, a month that is not `yyyy-mm`, a description over 500 characters;
    - the series update schema refuses `programId` and `code`;
    - the series code keeps `/^[A-Z]{2,8}$/`.
- **Done when:** `pnpm --filter @css/shared test` passes with the new spec and `pnpm typecheck` is green.
- **Depends on:** none
- **Size:** S
- **Risk area:** none
- **Status:** done

### U2. Migration: project series, session period, program description, backfill
- **Goal:** The database holds the three levels, and every existing project is a session of its own series.
- **Requirements:** R4, R5, R6, R7
- **Files:** `apps/api/prisma/schema.prisma`, `apps/api/prisma/migrations/<timestamp>_project_series/{migration.sql,down.sql}`, `apps/api/seed/sets/demo/index.ts` and the base seed where it creates projects, `apps/api/scripts/perf-seed.ts`, `docs/database/ERD.md`, `docs/database/DATABASE_SCHEMA.md`, `apps/api/test/integration/project-series-schema.test.ts`
- **Approach:** hand-write the migration after `prisma migrate dev --create-only` (`DB-MIG-01`), in the shape of `apps/api/prisma/migrations/20261020160000_beneficiary_master`. The steps, in order (`DB-MIG-04`):
  1. Create `project_series` with the audit columns, a unique `code`, a unique `(id, program_id)`, and `description_bn` and `description_en`.
  2. Add `programs.description_bn` and `programs.description_en`.
  3. Add `projects.series_id`, `period_from` and `period_to`, all nullable.
  4. Backfill one series per project with the same code, names and program, and the period 1 January to 31 December of `year`.
  5. Set `NOT NULL` on the three new columns.
  6. Add the composite FK and the two checks.
  7. Replace the global unique on `code` with the uniques on `(code, year)` and `(series_id, year)`.
  8. Index `projects(series_id)`.
- **Tests:**
  - integration (api-db):
    - after the migration, a seeded project has a series with its code, names and program;
    - the FK refuses a session whose `program_id` differs from its series';
    - two sessions of one series in one year are refused, and one code in two years is accepted;
    - the check refuses a period whose end is before its start.
- **Done when:** `pnpm db:migrate` succeeds on a fresh and on a seeded database, `down.sql` returns the seeded database to its old shape, and the api-db project passes.
- **Depends on:** none
- **Size:** M
- **Risk area:** migration
- **Status:** done

### U3. The permission to see every program and project with counts
- **Goal:** `project.overview.view` exists, the registry checks it, and the matrix shows it.
- **Requirements:** R8
- **Files:** `docs/security/permissions.yaml`, `docs/security/RBAC.md`, `docs/security/AUTHORIZATION_MATRIX.md` (regenerated), `apps/api/src/access/registry.ts` (only if a list of known names must grow)
- **Approach:** add the entry next to `project.view`, in the shape of `program.view`, with the defaults `program_manager`, `regional_program_manager` and `project_executive` at GLOBAL. Then run `pnpm --filter @css/api authz:matrix`.
- **Tests:**
  - unit: the registry loads the new name with its three defaults.
  - existing: the matrix test fails while the report is stale and passes after the regeneration.
- **Done when:** `pnpm docs:check` and the matrix test pass.
- **Depends on:** none
- **Size:** S
- **Risk area:** auth
- **Status:** done

### U4. API: program cards and project series (read, create, edit)
- **Goal:** The five roles read the program and project cards with their counts, and the PM of a program and the global roles create and edit a project.
- **Requirements:** R5, R8 to R13, R16, R20
- **Files:**
  - new services: `apps/api/src/services/project-series.ts` (the list with counts, the read with the sessions and `canOpen`, create, the update that renames its sessions, the current-session rule) and `apps/api/src/services/program-cards.ts`;
  - changed: `apps/api/src/services/programs.ts` (the description) and `apps/api/src/routes/programs.ts` (`GET /program-cards`, the description on PATCH);
  - new route file: `apps/api/src/routes/project-series.ts`, wired in `apps/api/src/container.ts` and `apps/api/src/app.ts`;
  - contract and messages: `docs/api/openapi.yaml`, and `packages/shared/src/i18n/messages/{bn,en}/errors.json` (`project.session_year_taken`, `project.series_code_taken`, `project.session_source_foreign`);
  - tests: `apps/api/test/integration/project-series.test.ts` (new) and `apps/api/test/integration/programs.test.ts` (extended);
  - measurement: `apps/api/scripts/perf-lists.ts` (cases named "series" and "program cards") and `apps/api/scripts/perf-seed.ts` where the measurement data needs series and several sessions.
- **Approach:**
  - routes with `defineRoute` as in `apps/api/src/routes/programs.ts`;
  - the service in the shape of `apps/api/src/services/programs.ts`, with `ApiError`;
  - the counts SQL after `apps/api/src/services/projects-work.ts`, inside `boundedRead`;
  - the reach of each session through `AccessService.findProject` and `projectWhere`;
  - the audit written as `programs.ts` writes it.
- **Tests:**
  - integration:
    - reads and counts:
      - an RPM reads every program card, including a program without a project in the RPM's region, with total projects, running projects and beneficiaries;
      - the beneficiaries count a person approved in two sessions once, and leave out a rejected or waitlisted person;
      - a program's series list returns the current session's state, apply-to date, target, approved, applications, RPMs (at most three and a count), volunteers and districts;
      - the current session is the active one when a newer draft exists;
      - `todo` is present for the RPM's own region and absent for a session outside it, and the budget inside it is absent without `budget.view`;
      - a program card's `todo` sums the reviews waiting and the waitlist of only the current sessions the caller reaches, and is absent when the caller reaches none;
      - `GET /project-series/:seriesId` marks each session `canOpen` by the caller's `project.view` scope.
    - writes:
      - a PM creates a series in the own program (201, audited) and is refused in another program (403);
      - an RPM is refused to create (403);
      - a duplicate code answers 409 `project.series_code_taken`;
      - a rename with a stale If-Match answers 412;
      - a rename renames the sessions in one audit entry;
      - a PATCH carrying `programId` or `code` answers 400 and changes nothing;
      - a PM of program A is refused (403) a PATCH of a series of program B;
      - each program card and series carries `canCreate`: true for the PM of that program and the global roles, false for a PM of another program, an RPM and an Executive.
    - rate limit: the card reads answer 429 past the `list` class's limit.
    - refusals:
      - the Finance Team and a volunteer are refused the card reads (403);
      - a caller who is not signed in gets 401;
      - an unknown series gets 404.
  - existing: `apps/api/test/integration/programs.test.ts` covers the program reads and writes; extend it for the description.
- **Done when:**
  - the integration tests, the OpenAPI drift test and `pnpm --filter @css/api contract:coverage` pass;
  - the counts read stays within the list budget of `docs/testing/PERFORMANCE.md` on `css_erp_perf`.
- **Depends on:** U1, U2, U3
- **Size:** L
- **Risk area:** auth
- **Status:** done

### U5. API: sessions: the new session, the wizard's create, the period on a draft
- **Goal:** A session starts from a copy of the previous one, the wizard creates a session of a series, and the session list knows each session's series and label.
- **Requirements:** R6, R17, R18, R19
- **Files:**
  - routes: `apps/api/src/routes/project-series.ts` (`POST /project-series/:seriesId/sessions`) and `apps/api/src/routes/projects.ts`;
  - service: `apps/api/src/services/projects.ts`:
    - create from a series;
    - `seriesId`, `periodFrom`, `periodTo` and `sessionLabel` in the view;
    - the `seriesId` filter in `listWhere`;
    - the period edit while a draft;
    - program and code no longer writable;
  - shared and contract: `packages/shared/src/projects/requests.ts` (the filter) and `docs/api/openapi.yaml`;
  - tests: `apps/api/test/integration/projects.test.ts`, `project-setup.test.ts` and `project-series.test.ts`, and the E2E helper `apps/web/e2e/support/projects.ts`.
- **Approach:** the new session calls `ProjectsService.create` with the copy as its starting source (the start-source resolution in `projects.ts`, and `copiedFromProjectId`). It runs under an Idempotency-Key, as the upload sessions do: the route declares it as `apps/api/src/routes/uploads.ts` does, and `apps/api/src/idempotency/idempotency.service.ts` answers a replay with `Idempotent-Replay`.
- **Tests:**
  - integration:
    - the new session:
      - a session of স্বাবলম্বী for Jun 2027–Jul 2028 is a draft with the series' code and names, year 2027 and label "2027-28";
      - it carries the components, form, rules and syllabus of the newest session, and no areas, volunteers, dates, budget or quota targets;
      - a session made from an older source copies that source;
      - a source of another series answers 422;
      - a second session starting in 2027 answers 409 `project.session_year_taken`;
      - the same Idempotency-Key answers 200 with `Idempotent-Replay` and creates one session;
      - an RPM is refused (403);
      - a PM of program A is refused (403) a new session of a series of program B.
    - the wizard and the period:
      - `POST /projects` with `seriesId` and a period creates the first session;
      - a PM of program A is refused (403) `POST /projects` with a series of program B;
      - the old body with `code` answers 400;
      - a `PATCH` of a draft's period to a year already taken answers 409;
      - a `PATCH` of an active session's period is refused, as today's other fields of a running session are.
    - the list and the numbering:
      - `GET /projects?seriesId=` returns only that series' sessions, each with its `sessionLabel`;
      - an application in a 2027 session is numbered `SWB-2027-00001` while `SWB-2026-…` exists.
  - existing: `apps/api/test/integration/projects.test.ts` and `project-setup.test.ts` cover create and the basic step; update them to the series body rather than add parallel tests.
- **Done when:** the API and integration tests, the drift test and the contract coverage pass.
- **Depends on:** U1, U2, U4
- **Size:** L
- **Risk area:** none
- **Status:** done

### U6. API: covers of programs and projects
- **Goal:** A program's or a project's cover photo is uploaded, linked, audited, and streamed to every reader of the cards.
- **Requirements:** R9, R11, R21
- **Files:**
  - shared: `packages/shared/src/files/index.ts` (`cover_photo` in `FILE_KINDS` and `KIND_TYPES`, its storage key from codes and ids only, and the records a cover links to);
  - uploads: `apps/api/src/services/uploads.ts` only if the record reach of a new kind is not read from `records.ts`;
  - API: `apps/api/src/files/policy.ts` (the bucket), `apps/api/src/files/records.ts` (the record a cover links to, readable with `project.overview.view`), `apps/api/src/services/covers.ts` (new, after `staff-photos.ts`), `apps/api/src/routes/programs.ts`, `apps/api/src/routes/project-series.ts`;
  - contract and documents: `docs/api/openapi.yaml`, `docs/architecture/FILES_AND_DOCUMENTS.md`;
  - tests: `apps/api/src/files/policy.spec.ts`, `apps/api/test/integration/covers.test.ts`.
- **Approach:** follow `apps/api/src/services/staff-photos.ts` (`file_links`, where a new link moves and the old file stays) and the upload session flow of `apps/api/src/services/uploads.ts`.
- **Tests:**
  - unit: `cover_photo` accepts JPEG, PNG and WebP up to 5 MB, refuses a PDF, and goes to the `photos` bucket.
  - integration:
    - program covers: the Head sets one (200, audited with the old and new file ids), and a PM is refused (403);
    - series covers: a PM sets one on a series of the own program and is refused on another program's series (403);
    - reading: an RPM and an Executive read a cover's content and thumbnail (200), and a volunteer and the Finance Team are refused (403);
    - a file of another kind cannot be set as a cover (422);
    - a replaced cover keeps the old file;
    - uploads: a volunteer, an RPM and an Executive are refused to start a `cover_photo` upload for a program or a series (403), and a PM is refused one for a series of another program;
    - linking: a PM cannot set as a cover a file another user uploaded, an unfinished upload, or a file already linked to another record (422).
- **Done when:** the tests pass and FILES_AND_DOCUMENTS lists the kind.
- **Depends on:** U4
- **Size:** M
- **Risk area:** file storage
- **Status:** todo

### U7. Web: the flip card piece and the cover art
- **Goal:** The asf set has a `FlipCard` that turns on hover and focus on a computer and by buttons on a touch screen, and a cover illustration.
- **Requirements:** R9, R11, R14
- **Files:** `apps/web/src/ui/contract.ts`, `apps/web/src/ui/templates/asf/components/FlipCard.tsx` (new), `apps/web/src/ui/templates/asf/local.json`, `apps/web/src/ui/index.ts`, `apps/web/src/ui/ui.local.flip-card.test.tsx`, `apps/web/src/components/CoverArt.tsx` (new), `apps/web/src/dev/AsfGallery.tsx`, `apps/web/e2e/asf-gallery.spec.ts`, `docs/ui/asf-pieces/flip-card.png`, `docs/ui/DESIGN_SYSTEM.md`
- **Approach:** add the piece as the app's other additions to the kit are added: an entry in `apps/web/src/ui/templates/asf/local.json` and its `ui.local.*.test.tsx`. The CSS is the approved mockup's (`docs/ui/mockups/programs-projects.html`: `.flip`, `.flip-inner`, `.face`), on the asf tokens only. The repo has no example of a 3D turn to copy.
- **Tests:**
  - unit (component):
    - the front is shown, and the back stays out of the accessibility tree until the card turns;
    - on a touch screen (matchMedia `hover: none`), "বিস্তারিত" turns the card and "ফিরুন" turns it back, each with its accessible name;
    - the focus entering a back button turns the card;
    - reduced motion sets no transition;
    - a long title stays within the card;
    - CoverArt draws the same picture for the same seed.
  - e2e:
    - `/dev/asf` shows "FlipCard";
    - at 1280 px, hovering the sample card shows its back;
    - at 360 px (mobile project), "বিস্তারিত" turns it and "ফিরুন" turns it back.
- **Done when:** `pnpm --filter @css/web test`, the gallery spec and the template-boundary test pass.
- **Depends on:** none
- **Size:** M
- **Risk area:** none
- **Status:** todo

### U8. Web: the merged tab with the program cards and the list view
- **Goal:** `/admin/projects` shows the program cards to the five roles with a switch to the list, the sidebar has one destination, and `/admin/programs` redirects.
- **Requirements:** R1, R2, R3, R8, R9, R10, R13, R19
- **Files:**
  - pages and data:
    - `apps/web/src/admin/projects/ProgramsProjectsPage.tsx` (new; replaces the body of `ProjectsPage.tsx`);
    - `apps/web/src/admin/projects/ProjectList.tsx` (the list moved out of `ProjectsPage.tsx`, with the session label column and the project filter);
    - `ProgramCard.tsx` and `cards-api.ts` (new, in `apps/web/src/admin/projects/`);
    - `apps/web/src/api/schemas.ts`;
  - routes and navigation: `apps/web/src/routes/index.tsx` (the redirect), `apps/web/src/admin/navigation.ts` (`programs` removed), `apps/web/src/admin/roles.ts` (`canSeeProjectOverview`); `apps/web/src/admin/programs/ProgramsPage.tsx` is removed;
  - shared links and messages: `packages/shared/src/attention.ts` and `packages/shared/src/i18n/messages/{bn,en}/{nav,admin}.json`;
  - tests:
    - `apps/web/src/admin/projects/projects.test.tsx`;
    - `apps/web/src/admin/programs/programs.test.tsx` (its cases move to the dialog);
    - `apps/web/src/admin/navigation.test.ts`;
    - the MSW handlers in `apps/web/test/msw/`.
- **Approach:**
  - the page frame of `ProjectsPage.tsx` (`Page`, `DocumentTitle`, and `useTabView` for the state in the address);
  - `SegmentedControl` for "কার্ড | তালিকা";
  - `ProgramDialog.tsx` stays for "নতুন প্রোগ্রাম" and "প্রোগ্রাম এডিট করুন".
- **Tests:**
  - unit (component):
    - an RPM sees three program cards with "মোট প্রকল্প", "চলমান প্রকল্প" and "মোট উপকারভোগী", and no "নতুন প্রোগ্রাম";
    - the Head sees "নতুন প্রোগ্রাম" and "প্রোগ্রাম এডিট করুন";
    - a program without a PM shows "PM দেওয়া হয়নি";
    - "আপনার করণীয়" shows only when the read returns `todo`;
    - `?status=draft` opens the list with the draft chip chosen;
    - "তালিকা" keeps the filters in the address;
    - the list shows "সেশন 2026-27" beside the name.
  - unit (navigation):
    - no role sees "প্রোগ্রাম" in the sidebar;
    - `placeOf` gives "প্রোগ্রাম ও প্রকল্প" for `/admin/projects/series/x` and `/admin/projects/programs/x`;
    - the attention counts of `/admin/projects?view=list` add to it.
  - e2e (desktop, demo RPM):
    1. Open `/admin/programs`. The address becomes `/admin/projects`, and the heading reads "প্রোগ্রাম ও প্রকল্প".
    2. Hover the card "আন্ডারপ্রিভিলেজড কমিউনিটি ডেভেলপমেন্ট প্রোগ্রাম" and see "সব প্রকল্প দেখুন".
    3. Press "তালিকা" and see the column "সেশন".
  - e2e (mobile, demo PM): the tab "প্রকল্প" opens the cards; "বিস্তারিত" on a program card shows "সব প্রকল্প দেখুন"; "আরও" has no "প্রোগ্রাম".
  - existing: `apps/web/src/admin/projects/projects.test.tsx`, `apps/web/src/admin/programs/programs.test.tsx`, `apps/web/src/admin/navigation.test.ts` and `apps/web/e2e/projects.spec.ts` cover this; update them rather than add copies.
- **Done when:** the component and navigation tests and the two E2E lines pass, and `pnpm --filter @css/web bundle:report` keeps the first route under 400 KB.
- **Depends on:** U4, U5, U7
- **Size:** L
- **Risk area:** none
- **Status:** todo

### U9. Web: the program page, the project cards, the project page and its dialogs
- **Goal:** From a program card an official reaches the program's projects and each project's sessions. The PM of the program creates and edits a project, sets the covers and starts a new session.
- **Requirements:** R10 to R18, R20, R21
- **Files:**
  - new pages and parts, in `apps/web/src/admin/projects/`: `ProgramPage.tsx`, `ProjectSeriesCard.tsx`, `ProjectSeriesPage.tsx`, `SeriesDialog.tsx` (a new project and its edit), `NewSessionDialog.tsx` and `CoverField.tsx`;
  - changed: `apps/web/src/admin/programs/ProgramDialog.tsx` (the description and the cover), `apps/web/src/routes/index.tsx` and `apps/web/src/admin/projects/cards-api.ts`;
  - messages: `packages/shared/src/i18n/messages/{bn,en}/admin.json`;
  - tests: `apps/web/src/admin/projects/series.test.tsx` (new).
- **Approach:**
  - `PageCrumbs` as `apps/web/src/admin/beneficiaries/BeneficiaryProfilePage.tsx` uses it;
  - the session table with `DataTable` and its `cardRenderer`, as in `ProjectsPage.tsx`;
  - the dialogs on the contract's `Form` with react-hook-form, as in `ProgramDialog.tsx`;
  - the cover upload through `apps/web/src/lib/use-file-upload.ts` and `FileImage`;
  - the RPM photos through `PersonAvatar`.
- **Tests:**
  - unit (component):
    - a project card shows "সেশন 2026-27 · সক্রিয়", "আবেদন আর 45 দিন", "412 / 600 অনুমোদিত" and "লক্ষ্য পূরণ";
    - with five days left it shows "শিগগির শেষ · আবেদন আর 5 দিন";
    - a project without a running session shows "চলমান সেশন নেই · শেষ 2025";
    - an RPM sees "অনুমতি নেই" on a session outside the region and "খুলুন" on one inside, and no "নতুন সেশন শুরু করুন";
    - the new-session dialog shows the label "2027-28" for Jun 2027–Jul 2028, the source "সেশন 2026-27", and the lists "কপি হবে" and "নতুন করে দিতে হবে";
    - a 409 shows "এই বছরে এই প্রকল্পের একটি সেশন আগে থেকেই আছে।";
    - "খসড়া তৈরি করুন" is disabled while the request runs;
    - the program dialog saves the description.
  - e2e (desktop, demo PM):
    1. Open `/admin/projects` and press "সব প্রকল্প দেখুন" on the program card.
    2. Press "নতুন প্রকল্প" and fill "কোড" `E2ESR`, "নাম (বাংলা)" "ই২ই প্রকল্প" and "নাম (ইংরেজি)".
    3. Press "সেভ করুন". The setup wizard opens.
    4. Back on the project page, press "নতুন সেশন শুরু করুন", choose the start and end months, and see "সেশনের নাম" "2027-28".
    5. Press "খসড়া তৈরি করুন". The setup opens under the heading "ই২ই প্রকল্প · সেশন 2027-28".
    6. On the project page, the row "সেশন 2027-28" shows "খসড়া".
  - e2e (desktop, demo RPM): the project page of a project outside the region shows "অনুমতি নেই" on its sessions and no "নতুন সেশন শুরু করুন".
  - e2e (mobile, demo Head): on the program page, "বিস্তারিত" turns a project card and "ফিরুন" turns it back; the sessions show as cards.
- **Done when:** the component tests and the E2E lines pass on the desktop and mobile projects.
- **Depends on:** U5, U6, U8, U10
- **Size:** L
- **Risk area:** none
- **Status:** todo

### U10. Web: the session label everywhere, and the wizard on a series
- **Goal:** Every place that names a session says which session, and the setup's first step works from a series. Built before U9, which then fills the two pages U10 opens as bare routes.
- **Requirements:** R6, R18, and the RPM's program name (Problem)
- **Files:**
  - routes: `apps/web/src/routes/index.tsx` (`/admin/projects/programs/:programId` and `/admin/projects/series/:seriesId` as bare pages with their heading and breadcrumb, so the breadcrumb and the wizard have somewhere to lead; U9 fills them);
  - setup: `apps/web/src/admin/projects/setup/CreateStep.tsx` (opened from `?seriesId`, with the period in place of the year, code and program) and `apps/web/src/admin/projects/setup/BasicsSection.tsx` (program and code read-only, the period editable while a draft);
  - project pages:
    - `apps/web/src/admin/projects/ProjectOverviewPage.tsx`: the heading "<name> · সেশন <label>" and `PageCrumbs` up to the program and the project;
    - `apps/web/src/admin/projects/ProjectFacts.tsx`: the program from the cards read, and the period;
    - `apps/web/src/admin/projects/ProjectPicker.tsx`;
  - elsewhere: `apps/web/src/features/home/HomeWidgets.tsx`, and `apps/web/src/features/account/ProjectsWork.tsx` where a name needs the label;
  - tests: `apps/web/src/admin/projects/setup/setup.test.tsx`, `apps/web/src/admin/projects/overview.test.tsx`.
- **Approach:** read `sessionLabel` from the API view; the web holds no label logic.
- **Tests:**
  - unit (component):
    - an RPM's project page shows the program's name;
    - the heading shows "স্বাবলম্বী প্রকল্প · সেশন 2026-27", and the breadcrumb links to the program and the project;
    - the wizard opened with `seriesId` shows the series' code and name read-only and asks for "শুরুর মাস" and "শেষের মাস";
    - the basic step of an active session shows the period read-only;
    - the picker names "স্বাবলম্বী প্রকল্প · 2026-27".
  - e2e: `apps/web/e2e/projects.spec.ts`, updated to the new first step: open `/admin/projects/new?seriesId=<a demo series>`, see the code and name read-only, choose "শুরুর মাস" and "শেষের মাস", press "পরের ধাপ", and see the heading "<name> · সেশন <label>". U9's PM journey covers it again from the project page.
  - existing: `apps/web/src/admin/projects/setup/setup.test.tsx` and `overview.test.tsx` cover the wizard and the overview; update their cases.
- **Done when:** the component tests and `apps/web/e2e/projects.spec.ts` pass.
- **Depends on:** U5, U8
- **Size:** M
- **Risk area:** none
- **Status:** todo

### U11. The sweep: existing E2E, screens, accessibility and the documents
- **Goal:** Every spec that went through the old tab or the old first step passes, the screen and accessibility sweeps cover the new pages, and the documents say what was built.
- **Requirements:** R1 to R21 (documentation and regression)
- **Files:**
  - E2E: `apps/web/e2e/{a11y,screens,projects}.spec.ts`, and every spec whose helper creates a project through `apps/web/e2e/support/projects.ts`: application-rules, applications, assignment, exports, form-builder, form-logic, identity-rules, media, offline, registration;
  - screens and design: `docs/ui/SCREENS.md` (SCR-077 rewritten, SCR-112 merged into it, SCR-060's first step) and `docs/ui/DESIGN_SYSTEM.md` (the app shell, FlipCard);
  - specification and rules: `docs/MODULE_CATALOG.md`, `docs/MASTER_SPEC.md` (the glossary), and `docs/BUSINESS_RULES.md`, with new rules from BR-311:
    - one session per project per start year;
    - what a new session copies;
    - how the beneficiaries are counted;
    - the counts-only cards for the five roles;
  - performance and status: `docs/testing/PERFORMANCE.md` (the series read), `docs/STATUS.md`, and `CLAUDE.md` (the repository map lines for the new services, routes and pages).
- **Approach:**
  - update each spec's steps to the new labels rather than skip them (`TS-15`);
  - `screens.spec.ts` replaces "03-programs" with the program page and adds the project page;
  - `a11y.spec.ts` sweeps `/admin/projects`, the program page, the project page and the list view in both languages.
- **Tests:**
  - e2e: the full `pnpm e2e` on the three projects, with no accessibility violation on the four new views.
  - existing: `pnpm rules:status --phase 2` lists the new rules as tested.
- **Done when:** `pnpm e2e`, `pnpm docs:check` and `pnpm rules:status` pass, and the documents match the built screens.
- **Depends on:** U9, U10
- **Size:** M
- **Risk area:** none
- **Status:** todo

## Checkpoints
- **Build order:** U1 to U8, then U10, then U9, then U11 (U9 depends on U10).
- **Mode:** grouped (one by one 0, grouped 17, all at once 0)
- **Signals:** N 11, L 2450, R 4, Fd 6, C 7, P 1
- **Scoring:** one by one 10, grouped 7, all at once 0. N is over 4, so one by one's 10 points go to grouped.
- **C1** after U1: foundation (U4 and U5 read its schemas)
- **C2** after U2: the migration, and the foundation of U4 and U5
- **C3** after U3: a new permission (auth)
- **C4** after U4: auth reads and writes, and the foundation of U5, U6 and U8
- **C5** after U5: the foundation of U9 and U10, and the breaking change of `POST /projects`
- **C6** after U6: file storage
- **C7** after U7: a new pattern (the 3D flip piece)
- **C8** after U8: the foundation of U9 and U10
- **C9** after U10: the foundation of U9 and U11 (the wizard, the bare pages and the session label)
- **C10** after U11: the end; U9 and U11 are reviewed together, under the 1,000-line and 25-file limit

## Verification
- `pnpm install` · `docker compose up -d postgres minio mailpit`
- `pnpm db:migrate` · `pnpm db:seed --set all`
- `pnpm lint` · `pnpm typecheck` · `pnpm test`
- the api-db Vitest project (`apps/api/vitest.db.config.mts`)
- `pnpm --filter @css/api contract:coverage` · `pnpm --filter @css/api authz:matrix`
- `pnpm --filter @css/web build` · `pnpm --filter @css/web bundle:report`
- `pnpm e2e`
- `pnpm docs:check` · `pnpm rules:status --phase 2`
- `pnpm --filter @css/api perf:seed` · `pnpm --filter @css/api perf:lists --only series`

## Risks and rollback
- **Migration (U2).** `down.sql` drops the composite FK, the checks and the two uniques, restores the global unique on `projects.code`, and drops `series_id`, `period_from`, `period_to`, the program description columns and `project_series`.
  - Undoing it loses the series names, descriptions and covers.
  - It fails while two sessions share a code (any second session of a series). Cancelling them is not enough: a cancelled session keeps its row and its code, so each later session must first be given a code of its own, by the owner's decision (found in U2; `down.sql` stops with `project_series_in_use` and changes nothing). The PR says so (`DB-MIG-05`).
  - No production data exists yet, so the backfill touches only the development, test and measurement databases.
- **The breaking change of `POST /projects` (U5).** Only our own web app and the E2E helpers call it, and both change in the same unit. A rollback reverts U5 to U11 together.
- **Auth (U3, U4, U6).** The new permission reads counts and the names of officials only. Its defaults, its matrix line, and the per-session scope of `todo` and `canOpen` are each proven by a test in which another role is refused (`TS-13`).
- **Merge order.** The branch `feat/beneficiary-help-history` edits `admin.json`, `roles.ts`, `SCREENS.md`, `STATUS.md` and `DECISION_LOG.md`. The code starts from `develop` only after that branch is merged, and only when the owner says so. If that branch takes BR-311 or D-176 first, the numbers here move to the next free ones.

## Definition of done
- All units are done and their tests pass.
- The verification commands pass.
- `ae-review` has run, with no open P0 or P1.
- Code from abandoned attempts is removed.

## Progress
- **Branch:** `feat/programs-projects-sessions`
- **Updated:** 2026-11-16
- **Next:** the checkpoint C5, then U6
- **Reviewed through:** none yet
- **Uncommitted:** none
- **Notes:** U1: the spec is `packages/shared/src/projects/session.test.ts`, because the shared package runs `*.test.ts` only and a `.spec.ts` would never run. A request carries the period as two months (`periodFrom`, `periodTo`, each `yyyy-mm`); `sessionDates` gives the stored days, `sessionMonths` the months covered (both counted, at most `MAX_SESSION_MONTHS`), `sessionYear` the start year, which stays within 2020 to 2100 as a project's year always did. `sessionLabel` takes months or stored dates; a period that ends two years after it starts (possible within 24 months) is labelled the same way, "2026-28". Two schemas the running API reads were left as they are, so the contract does not move before the unit that serves it: the body of `POST /projects` is added beside the old one as `seriesSessionCreateSchema` (U5 puts it in the old one's place), and it keeps the field name `source` for the starting point, which this plan calls `start`; the program's description is ready as `shortDescription` (a pair, each language at most 500 characters) and joins `programCreateSchema` and `programUpdateSchema` in U4, with the service that stores it. The rule of the period and the label is BR-311, with its register line.
  U2: migration `20261116120000_project_series`, written by hand (`prisma migrate dev` connects to the development database, which this work never touches); the drift test compares it with `schema.prisma`. Decided beyond the plan: (1) the backfill gives each series the id of the project it was made from, so the ids stay UUID v7 in creation order without a v7 function in SQL, and it copies the project's audit columns; the project's update stamp is left as it was (the trigger is off during the backfill), so no ETag moves. (2) No separate index on `projects(series_id)` (step 8): the unique `(series_id, year)` of step 7 leads with that column and serves the same reads, as `project_components` has no index beside its unique. (3) The foreign keys follow the house style `ON DELETE RESTRICT ON UPDATE NO ACTION`; a series has the same code CHECK as a project. No CHECK holds a period to the first and last day of a month, and none bounds a description's length; the shared schemas do. (4) `ProjectsService` creates a series with every project (same code, names and program; January to December of its year), since the three new columns are NOT NULL and `POST /projects` keeps its body until U5. A draft's rename renames its series, a draft's new year moves its period, and a draft's move to another program moves the series and the session in one statement, because the pair is one foreign key; U5 removes the three when the program, the code and the names stop being writable on a session. `project.code_taken` now answers for a code a series holds. The API contract did not change. (5) The demo project's series carries the project's names as they are ("শীতবস্ত্র বিতরণ 2026"), as the backfill would give them; the names lose the year when the screens show the label (U10, U11). (6) The test fixture `projectRow` gives a project its own series unless the row names one, and inserts the project alone on a schema before the series (the backfill tests seed there). (7) The rule is BR-312; BR-311 gained the database checks. A deploy note is in `docs/ops/DEPLOYMENT.md`: the migration and the API go out together. `perf-seed.ts` gives its projects a series each; it was not run, and `css_erp_perf` was not touched (the plan measures in U4).
  U3: `project.overview.view` stands after `project.view` in `permissions.yaml` with the three GLOBAL defaults; `registry.ts` needed no change (it reads every name from the file). No endpoint declares it yet, so the regenerated matrix lists it under "Permissions no endpoint uses yet"; U4's card reads move it into the table. The Official দায়ী is not given it (R8 names five roles), nor are Finance, Media, Procurement and the volunteers. Beyond the registry test the plan names, a test of the effective grants proves that only the five roles hold it and that it leaves `project.view` and `project.create` as they were. RBAC.md has the row in sections 5.1 and 5.2, the permission table and a resolution rule. The rule is BR-313; its register line covers who holds the permission, and U4 adds what the reads return. The counts of permissions in the tests moved from 158 to 159.
  Review of U1 to U3 (one fix commit): the registry of bilingual columns (`packages/shared/src/i18n/bilingual-columns.ts`) names the series' and the program's names and descriptions, which a shared test compares with `schema.prisma`; the whole shared suite runs after every unit that touches the schema. In `ProjectsService.update`: a year sent back unchanged leaves the period alone, and a new year is refused (`project.read_only`) for a session that does not run the whole of its year, until U5 gives the period its own edit; a draft moves to another program only while it is the one session of its series (`project.read_only` otherwise), and the series' move is audited as `project_series.update`; a rename renames the series only while the session is alone; a year another session of the series starts in answers 409 `project.session_year_taken` (the code U4 listed, added here with its texts and its row in API_STANDARDS), also when the unique index decides. `sessionLabel` writes the whole end year when the century turns ("2099-2100"). The permission's description in `permissions.yaml` carries no decision id.
  U4: the reads are `GET /program-cards` (operation `programs.program.cards`), `GET /project-series` and `GET /project-series/{seriesId}`, all `project.overview.view` with the scope entity `program` and the rate-limit class `list`; the writes are `POST /project-series` and `PATCH /project-series/{seriesId}`, `project.create` at the program, audited as `project_series.create` and `project_series.update`. Decided beyond the plan: (1) The scope entity is `program`, not `global`: the five roles hold the permission at GLOBAL and see everything, and a grant or a revoke the permission panel makes for one program is honoured (`programWhere`). (2) "মোট উপকারভোগী" reads the whole shared rule of what counts as help (`helpedSql`, BR-307), not `HELPED_STATES` alone: a session's close turns every application into `closed`, so the three states alone would count nobody of an earlier year. (3) The people helped are not counted with `count(DISTINCT …)`: on the measurement set that alone took about 300 ms. A session's helped applications are its helped people (one application per person and session), so one read of the applications gives every session figure, and only the people whose kept counter `help_count` is above one are looked at to take off those helped in several sessions. A profile retired by a merge counts as itself. BR-314 states the counting. (4) A program card's applications and volunteers are those of its running sessions ("চলমান সেশনে আবেদন"), its RPMs those of its projects' current sessions; a project card's are those of its current session, whatever its state. (5) `todo` carries the whole session's reviews waiting and waitlist, shown where the caller's `project.view` scope reaches the session, as the plan says; an RPM therefore sees the count of the whole session, not of the own region alone. The budget inside it is `budgetPlanned`. (6) `canCreate` is true only for an active program, since an inactive one takes no project. (7) A body of `PATCH /project-series/{seriesId}` that names `programId` or `code` answers 422 with the detail `validation.unknown_parameter`, as every unknown body key of this API does; the plan said 400, which the API gives to an unknown query parameter only. (8) The period is returned as two months (`periodFrom`, `periodTo`, `yyyy-mm`) with `sessionLabel`; `daysLeft` is null without an end date and after it, 0 on the last day. (9) The series list is not paginated, like the program list; without `programId` it returns every series the scope reaches. (10) `project.session_source_foreign` has its texts and its row in API_STANDARDS already; U5 raises it. No web file changed (the web schemas are U8's). Measured on `css_erp_perf` after the migration: program cards 254 / 286 ms (Head) and 245 / 285 (RPM), every series 256 / 268 and 248 / 268, one program's series 107 / 123 and 113 / 122, one series 39 / 44 and 46 / 77 (p50 / p95); no index added; with one helped person in ten a repeat the program cards would be about 320 ms at p50 (docs/testing/PERFORMANCE.md, "The cards of programs and projects"). `perf-seed.ts` was left as it is: the measured set has one session per series, and several sessions per series need `--fresh`.
  Review of U4 (one fix commit): "আপনার করণীয়" counts within what the caller reaches of a session: the whole session through GLOBAL, the program or the project, and only the caller's areas for a caller who holds it by areas, with the area filter of an official's work figures (`inWorkAreasSql`, shared with `projects-work.ts`); this replaces decision (5) of U4. A rename of one session beside others is refused (`project.read_only`), the sessions being renamed together through the series; the series is locked before the session in every write of a session's name, program or year. The series rename answers 404 for a series outside the caller's programs as for one that does not exist. The unique violations are read by index (`isUniqueViolationOf`). The comment and the contract say that the people are counted by profile, so a merge's retired profile counts beside the kept one. The cards' two heavy reads stand at the 300 ms target (p50 about 250, p95 between 266 and 318 over five runs), and the area read grows with the square of the sessions a caller holds by areas (docs/testing/PERFORMANCE.md).
  U5: `POST /project-series/{seriesId}/sessions` (`project.create` at the program, audit `project.create`, Idempotency-Key header, rate-limit class default) makes the draft through `ProjectsService.createSession`, which `POST /projects` uses too; `POST /projects` takes `{ seriesId, periodFrom, periodTo, source }`; the project view carries `periodFrom`, `periodTo` and `sessionLabel` for every reader and `seriesId` for officials; `GET /projects` filters by `seriesId`; `PATCH /projects/{projectId}` takes the period (its two months together, a draft only) and no longer `programId` or `year`. Decided beyond the plan: (1) the starting point keeps its field name `source` (the plan wrote `start`). (2) An old body, or any body that names `code`, `programId` or `year`, answers 422 with the detail `validation.unknown_parameter`, as every unknown body key of this API does (the plan said 400). (3) The Idempotency-Key is the header mode of the bulk and transfer routes (`runWithKey`, the key stored with the session's id), not the `clientUuid` mode of the upload sessions the plan pointed at: a session has no client id of its own. A repeat answers 200 with `Idempotent-Replay` and the session as it stands now; the same key with another request, and a request without a key, answer 422. (4) A series with no session to copy answers `project.session_source_foreign` too; a named source may be a cancelled session of the series. (5) A cancelled session keeps its year, as the unique index says: a year whose session was cancelled cannot be started again. This is a gap for the owner (see the report): the two uniques would have to leave cancelled sessions out. (6) A session's name stays writable for the one session of a series (it renames the series) so the setup's basics step keeps working until U10; beside other sessions it answers `project.read_only`. (7) `project.read_only` no longer stands in for the program move and the year change, which are gone; removed with them: the program move in `ProjectsService.update` and its `project_series.update` audit entry, `wholeYear` and `runsWholeYear`, the fields `code`, `programId` and `year` of `SetupField` and `IDENTITY_FIELDS` (now `period` and `workflowKey`), and the error `project.code_taken` with its texts and its row in API_STANDARDS (`project.series_code_taken` answers for a taken code). (8) The rule of what a new session copies is BR-315. (9) The web keeps building with the smallest change: `createProject` in `projects-api.ts` makes the series and then its session for the whole year from the first step's fields, and `BasicsSection.tsx` shows the year and the program read-only and no longer sends them; two web unit tests and the web contract test's project helper (`tests/contract/support/world.ts`) follow. The E2E helper needed no change, because the wizard's fields are the same.
