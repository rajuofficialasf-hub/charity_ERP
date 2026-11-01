---
title: Export service, Excel, CSV and PDF (T2.8)
type: feat
status: in-progress
source: brainstorm
date: 2026-11-01
doc_review: 2026-11-01
---

# Export service, Excel, CSV and PDF (T2.8)

## Goal
An official with an export permission can download the volunteer list, the beneficiary list or a project's applications as an Excel, CSV or PDF file holding exactly the rows of the current filter and exactly the columns they chose, and can download a beneficiary's 360° profile or one application's answers as a PDF that renders Bengali correctly. No file ever holds a field the person is not allowed to see.

## Problem
Every list of the ERP is filtered and paged on screen only, while the department works with spreadsheets for reporting, field checks and donors (BR-224: every filtered list exports to Excel/CSV, the beneficiary profile and form data to PDF). The export permissions, the job table, the file kind and the rules for language, masks and retention were designed in Phase 0 (API_STANDARDS §14, I18N §9, SECURITY_POLICY §9, FILES_AND_DOCUMENTS, `export_jobs`) but nothing produces a file yet. T2.8 is the last build task of Phase 2 before the test consolidation (T2.9) and the gate (T2.10).

## Requirements

### The lists, the columns and the formats
- **R1** The volunteer list (`/admin/volunteers`), the beneficiary list (`/admin/beneficiaries`) and a project's application list (`/admin/projects/:projectId/applications`) each show an "Export" button to a person who holds an export permission for that list; the export holds exactly the rows the list's current filters, search and sort select, in the same order.
- **R2** The export dialog asks for the format (Excel, CSV, PDF) and the columns. It lists only the columns the person may export; the first time, the columns the list shows on screen are ticked; after that, the person's last choice for that list on that device comes back; "select all" and "select none" are offered. An export with no column ticked cannot be started.
- **R3** On a project's application list the form questions are columns too: grouped by the form's sections, each group with "select the whole section", and a search box over the question texts. The questions of every version of the project's application forms appear once each, under the newest version's text; an application from an older version fills the questions its version had and leaves the others empty.
- **R4** The file's columns follow a fixed order whatever order they were ticked in: the list's own columns as on screen, then the record's further details, then the form questions in the form's order.
- **R5** A question that repeats inside one application (a group such as the family members) goes to a second sheet in Excel, one row per repeat with the application number; in CSV and PDF it is one cell with the repeats joined.
- **R6** Excel and CSV exports hold at most 100,000 rows; a request over that is refused before any work starts, with a message asking to narrow the filters (year, district, project). A list exported as PDF holds at most 1,000 rows; over that the person is asked to choose Excel or CSV.
- **R7** A list exported as PDF is a printable landscape table of the chosen columns with the list's name, the filters applied, the date and the row count in the heading.
- **R8** The beneficiary's 360° profile page has a "Download PDF" action for a holder of `report.beneficiary_journey` who may read that profile (and the global roles): the profile as the page shows it to that person (identity, contacts, address, family, the applications across projects with their states, the history), masked the same way, with the NID only for a holder of `export.beneficiaries`.
- **R9** The review page of one application (`/admin/applications/:applicationId`) has a "Download PDF" action for a holder of `export.list` who may read that application, producing its answers section by section as the page shows them to that person, with the number, the project, the state and the decisions; the official section only for a holder of `export.forms`.

### Who may export what
- **R10** A holder of `export.list` exports the lists they may read without any protected class; a holder of `export.volunteers`, `export.beneficiaries` or `export.forms` may also tick the protected columns of that list (NID and birth-registration numbers, bank details, the official section of the form answers), each within the permission's scope. Volunteers and team members have no export: the button is absent and the API answers 403.
- **R11** The protected columns are removed by the same field-mask code the API responses use (one implementation). A column of a class the person may not see is never offered in the dialog, and the server refuses a request that names one.
- **R12** An export carries the rows, the columns and the masks the person could read at the moment they asked; a permission or scope changed while the job runs neither widens nor narrows what the file holds.
- **R13** Every export that holds a protected class writes an audit entry with the list, the filters, the columns, the format and the row count; every download of such a file writes its own audit entry.

### Getting the file
- **R14** Every export runs as a background job. The dialog shows it waiting, then running with the rows done of the total, then a "Download" button; closing the dialog does not stop the job, and an in-app notification tells the person when it is ready. A failed job says why and can be started again; a job left waiting or running past its time limit becomes failed by itself and no longer counts against the person's running exports.
- **R15** "My exports" (a page reachable from the profile menu) lists the person's own exports of the last 30 days with their list, format, row count, state and a download button. Only the person who asked can download a file, and only while their account is active and they still hold the export permission of that list or record (for a file with protected fields, the permission of those fields too); the API streams it after its checks (no link that works on its own). After 30 days the file is deleted and the row stays, showing that the file has expired.
- **R16** The files are in the language the person used when they asked: headers, labels and the label beside every coded value (with the code in its own column in Excel and CSV), English digits, dates as dd-mm-yyyy, amounts as exact numbers. CSV opens with Bengali intact in Excel (UTF-8 with a byte-order mark), and a cell starting with `=`, `+`, `-` or `@` cannot run as a formula.
- **R17** PDFs embed UbuntuSans for Latin letters and digits and Bornomala for Bengali, with Bengali conjuncts and vowel signs shaped correctly.
- **R18** The export dialog, the progress and "My exports" work at 360 px on a phone, since officials work on phones as much as on desktops.

## Scope
- In: the three lists, the application list's form answers across versions, the 360° profile PDF, one application's PDF, the column picker, the background jobs with progress, notifications and "My exports", the audit, the 30-day deletion, the language and spreadsheet rules.
- Out (not now): exports of the other lists (projects, officials, the audit log, notification deliveries, a record's files, donors, the document register, finance, the work summary and the exam comparison), which later tasks add through the same service; photos or other files inside an export; scheduled, emailed or shared exports; saving named column sets across devices; reordering columns by hand; importing from Excel.

## Key decisions
- **The three lists plus two PDFs in this task**: the volunteer, beneficiary and application lists, the 360° profile and one application as PDF; the other lists follow in their own tasks through the same service. Owner, 2026-11-01. Governs R1, R8, R9.
- **The person picks the columns**: a column picker in the export dialog, the on-screen columns ticked the first time, the last choice remembered per list on the device; form questions grouped by section with "select the whole section" and a search; a fixed column order in the file. Owner, 2026-11-01. Governs R2 to R4.
- **Every export is a background job**: one path for every size, with progress in the dialog, a notification and "My exports". Owner, 2026-11-01. Governs R14, R15.
- **No volunteer export**: volunteers and team members hold no export permission (as `permissions.yaml` already says); the test that a volunteer-role export never holds protected fields becomes a refusal test plus a masked export by an official without the protected classes. Owner, 2026-11-01. Governs R10.
- **Limits**: 100,000 rows for Excel and CSV, 1,000 rows for a list as PDF. Owner, 2026-11-01. Governs R6.
- **Repeated questions on a second Excel sheet**, one row per repeat; joined in one cell in CSV and PDF. Owner, 2026-11-01. Governs R5.
- **Headless Chromium renders the PDFs** in the worker from HTML styled with the design tokens, as I18N.md §9 recommends, for correct Bengali shaping; it adds about 170 MB to the server image. A new dependency and an architectural choice, so it goes to DECISION_LOG before the code. Owner, 2026-11-01. Governs R7 to R9, R17.
- **The download checks the person again** (plan review): at each download the requester's account must be active and still hold the export permission the file was made under (and the protected classes' permissions for a sensitive file); otherwise 404. The file's content stays what was frozen at the request. Owner, 2026-11-01. Governs R15.
- **The record PDFs' permissions** (plan review): the 360° profile needs `report.beneficiary_journey` and the profile's read; one application needs `export.list` and the application's read; the NID needs `export.beneficiaries` and the official section `export.forms`; all frozen at the request, audited as sensitive when they carry a protected class; following a job and "My exports" are open to the requester whatever permission started it. Owner, 2026-11-01. Governs R8, R9, R13, R15.
- **Chromium always sandboxed** (plan review): never `--no-sandbox`; Chromium runs as a non-root user with JavaScript and the network off; a host that cannot give the sandbox keeps PDF off while Excel and CSV work. Owner, 2026-11-01. Governs R7 to R9, R17.
- **A stuck job fails by itself** (plan review): a job waiting or running longer than the queue's 30-minute expiry is marked failed and leaves the running limit; only the last attempt writes failed and sends the notice; a retry first removes the earlier attempt's object. Owner, 2026-11-01. Governs R14.
- **The job's existing `kind` names the list or record** (plan review): no new `list` column; `kind` takes `volunteers`, `beneficiaries`, `applications`, `beneficiary_profile` or `application`, the record's id goes in `filters`, and the OpenAPI `ExportCreate` and `ExportJob` follow. Owner, 2026-11-01. Governs R1, R8, R9.
- **No signed download link**: the task prompt's "signed download link" is superseded by D-074 (files streamed by the API after its checks, no signed URLs) and API_STANDARDS §14 (`GET /files/{fileId}/content`); only the requester downloads. Already decided; recorded here because the prompt says otherwise. Governs R15.
- **Already designed and kept**: the job pattern of API_STANDARDS §14 (`POST /exports`, `GET /exports/{jobId}`, the worker with the requester's permissions, scope and masks frozen at request time), the permissions `export.list`, `export.volunteers`, `export.beneficiaries`, `export.forms` and `report.beneficiary_journey`, the `export_jobs` table and the `exports` bucket, the 30-day deletion (O-30), the CSV, XLSX and PDF rules of I18N.md §9, the formula-injection rule of SECURITY_POLICY, and the audit events `export.requested` and `file.download_sensitive`. Governs R11 to R17.

## Success criteria
- An export by an official without the protected classes holds no NID, birth-registration number, bank detail or official-section answer, and a volunteer's request is refused (automated).
- The columns of an Excel and a CSV export equal the ticked columns in the fixed order, and their rows equal the list's rows for the same filters (automated).
- A Bengali PDF matches its approved snapshot, conjuncts included (automated).
- An export of 100,000 rows finishes in the worker without exhausting its memory; the time is measured on the measurement database (`css_erp_perf`) and recorded in docs/testing/PERFORMANCE.md.

## Open questions
- None blocking. Non-blocking: the deployment server's details are still open (O-34), so the size and the sandbox of Chromium on the organisation's server are confirmed with the IT team before production; development and CI install it like Playwright's browser.

## Technical decisions
- **Stack profile**: kept as in `CLAUDE.md`, with two added lines written by U1 after their decision in DECISION_LOG (`ST-40`, `ST-43`): XLSX through `exceljs` (MIT, its streaming `WorkbookWriter`), and PDF through `playwright-core` (Apache-2.0) driving the Chromium that `playwright install chromium` puts on the machine (already installed in CI for the web E2E; the dev image and the worker get the same step). Both checked on npm before installing (`ST-30`, `ST-34`); no other PDF or spreadsheet library.
- **The job pattern as designed**: API_STANDARDS §14 and the `exports` queue already in `apps/api/src/jobs/queues.ts` (2 retries, 30-minute expiry); the consumer joins `JobConsumers` like the photo processor (`apps/api/src/jobs/file-process.ts`), so `JOBS_INLINE` runs it in the dev API and the worker runs it in production (ADR-004).
- **What the person could read, frozen at the request** (R12): the request stores on the job the scope instances of the list's read permission, the export permission's instances and the field classes the person may export, from `AccessService.load` and `scopeFor`; the worker rebuilds the scope handle from that snapshot with one function beside `makeScope` in `apps/api/src/access/scope.ts` and never loads the person's access again. The scope's brand is a symbol, so the snapshot stores plain ids and the rebuild is the only way back.
- **One mask** (R11, `NE-SEC-03`): every exported row is built by a row schema that marks its protected fields with the same `sensitive(...)` and `officialRows(...)` as the API's list schemas, and passes through `maskData` from `apps/api/src/access/field-mask.ts` with the frozen classes; the classes an export may carry are those the person sees and that their export permission adds (`export.list` none of NID, birth registration, bank and official section; `export.volunteers`, `export.beneficiaries`, `export.forms` that list's). A column whose class is not in that set is never offered and is refused with 403 at the request.
- **The rows are the list's rows**: each list service exposes the `where` and the order its own `list()` uses (`services/volunteer-list.ts`, `services/beneficiaries.ts`, `applications/service.ts`), so the screen and the file can never select different rows. The worker reads in id-keyset batches of 1,000 (`core/pagination.ts` `keysetWhere`) in short transactions with their own statement timeout, not through `boundedRead`, whose 5-second cap is for the screens.
- **Streams to storage** (`NS-04`, `NS-06`, `DB-TX-02`): CSV and XLSX are written to a stream that `StorageDriver.put` takes into the `exports` bucket (already in `apps/api/src/storage/types.ts`); the `files` row (kind `export`) and the job's `done` are written after the object, and a failed row removes the object. No storage call inside a transaction.
- **PDF rendering** (`NE-SEC-06`, I18N.md §9): HTML built on the server by a small template helper that escapes every value, styled with the design tokens and the two fonts embedded as data, printed by Chromium with JavaScript disabled and every network request refused; no user value reaches a command line. Chromium is never launched with `--no-sandbox` and runs as a non-root user; when the sandbox cannot start, the renderer reports that PDF is unavailable and PDF jobs fail with that code, while Excel and CSV keep working.
- **Download** (D-074, `NS-10`, `NS-11`, `NS-41`): the job's file streams through `GET /files/{fileId}/content`; the kind `export` is readable by its requester only (everyone else 404), and only while the requester's account is active and their current access still holds the job's export permission (and, for a sensitive job, the permissions of its protected classes), checked from the live access at each download; served as an attachment; a sensitive export's download writes `file.download_sensitive`; after the 30-day sweep the route answers 410 `export.expired`.
- **Request checks**: the row count is taken at the request with the list's `where`; over 100,000 (Excel, CSV) or 1,000 (a list as PDF) answers 422 with the limit; a person holds at most 3 waiting or running exports (409), counting only jobs younger than the queue's 30-minute expiry; a new rate-limit class `export` in `apps/api/src/rate-limit/rate-limit.ts` (30 an hour per person).
- **Language and spreadsheets** (I18N.md §9, SECURITY_POLICY "formula injection"): the job's `locale` is the request's; a coded value gets a code column and a label column in CSV and XLSX; CSV is UTF-8 with a byte-order mark and CRLF lines, a cell starting with `=`, `+`, `-` or `@` gets a leading apostrophe; amounts and dates as numbers and date cells in XLSX; English digits through `@css/shared/format`.
- **Columns** (R2 to R4): one catalogue per list in `@css/shared/exports` (id, header key, group, protected class, on-screen flag); the form questions come from the API (`GET /exports/columns`) because they depend on the project's form versions; the last choice is kept in the device's local storage per list, read and written inside try/catch.
- **Repeats across versions** (R3, R5): questions are keyed by `fieldKey` across the project's application form versions, under the newest version's text and section order; an answer comes from `readAnswers` with the application's own version; a repeat group's rows go to a second sheet keyed by the application number.
- **Job kinds and the contract**: `export_jobs.kind` (existing, NOT NULL) takes the five kinds under a CHECK; the record's id of a PDF job is in `filters`; `ExportCreate` and `ExportJob` in `docs/api/openapi.yaml` are rewritten to the built shape, and the `/exports` routes declare the `export` rate-limit class. `GET /exports` and `GET /exports/{jobId}` are open to any signed-in person and answer only their own jobs, so a job started by `report.beneficiary_journey` is followed like any other.
- **Stuck and retried jobs**: the daily export sweep also marks jobs `queued` or `running` for longer than 30 minutes as `failed` (`export.timed_out`); the consumer writes `failed` and sends `export_failed` only on the last attempt (pg-boss's retry count against the queue's limit); an attempt first removes any object an earlier attempt of the job left, and a failed write removes its own partial object.
- **Notices and audit**: two in-app events, `export_ready` and `export_failed`, in `notifications/catalogue.ts` with templates through `notifications:sync`; `export.requested` (list, filters, columns, format, row count, `sensitive`) in the request transaction; the job's own changes need no audit.
- **No IDs in code** (`ORG-CMT-10`, `ORG-CMT-50`): the plan's R, U and decision ids stay here; code, comments and test names say what they mean in words.

## Implementation units

### U1. The decisions and the job columns
- **Goal:** record the export decisions and give `export_jobs` what the service needs.
- **Requirements:** R12, R14, R15
- **Files:** `docs/DECISION_LOG.md` (D-143: the owner's T2.8 answers of the brainstorm and the plan review, exceljs, playwright-core with a sandboxed Chromium, the frozen snapshot, the request limits), `CLAUDE.md` (stack profile lines, map), `apps/api/prisma/schema.prisma`, `apps/api/prisma/migrations/<ts>_export_jobs_detail/{migration.sql,down.sql}`, `docs/database/DATABASE_SCHEMA.md`, `docs/database/ERD.md`, `apps/api/test/integration/constraints.test.ts`
- **Approach:** add to `export_jobs`: `format` (CHECK csv, xlsx, pdf) and a CHECK on the existing `kind` (volunteers, beneficiaries, applications, beneficiary_profile, application), `columns text[]`, `access jsonb` (the frozen snapshot), `rows_done int`, `rows_total int`, `error_code text`, `finished_at timestamptz`, and an index on `(status, created_at)` for the sweep. The `files` table needs no change: the kind `export` and the rule that only an export file may be soft-deleted are already in the first migration (`files_kind_check`, `files_deleted_export_check`), and a new migration must not rewrite `files_kind_check`. Follow `20261101090000_application_applicant_name` for the migration pair.
- **Tests:**
  - integration: the CHECKs refuse an unknown kind or format; a job row with its access snapshot round-trips; the down migration leaves the table as before.
- **Done when:** `pnpm db:migrate` applies it, the down.sql reverses it, D-143 is in DECISION_LOG.
- **Depends on:** none
- **Size:** M
- **Risk area:** migration
- **Status:** done

### U2. The shared export rules and column catalogues
- **Goal:** one place for the export kinds, formats, limits, request schema and the columns of each list.
- **Requirements:** R2, R4, R6, R10
- **Files:** `packages/shared/src/exports/{index.ts,columns.ts,requests.ts}` (+ tests), `packages/shared/package.json` (export path `@css/shared/exports`), `packages/shared/src/i18n/messages/{bn,en}/exports.json`
- **Approach:** like `@css/shared/sync` (constants and zod schemas, no runtime dependencies): `EXPORT_LIMITS` (100,000; 1,000; 3 running), the list kinds, the formats, the request schema (list, format, columns, the list's own filter schema reused from `@css/shared` volunteers, beneficiaries and applications), and per list the column catalogue in screen order (id, header key, group `list` or `detail`, the protected class or none, `onScreen`). Column headers reuse the list pages' keys where they exist.
- **Tests:**
  - unit: a request with no column, an unknown column or an over-limit format is refused; the catalogue's on-screen columns equal the list page's columns in order; the column order function sorts list, detail, then questions whatever order they were given in.
- **Done when:** the package builds and its tests pass.
- **Depends on:** none
- **Size:** M
- **Risk area:** none
- **Status:** done

### U3. The list rows, frozen access and the one mask
- **Goal:** the export reads exactly the list's rows with the person's frozen access and masks them with the API's mask.
- **Requirements:** R1, R10, R11, R12
- **Files:** `apps/api/src/applications/service.ts` (`listQuery`, and `page` sharing its filter), `apps/api/src/exports/access.ts` (the classes an export may carry, the exportable columns), `apps/api/src/exports/rows.ts` (`ExportRows`: freeze, count, batch), `apps/api/src/container.ts`, `apps/api/test/integration/export-rows.test.ts`
- **Approach:** as built: the request computes each list's Prisma `where` (the volunteer and beneficiary services' `where`, the application service's new `listQuery` with the same reach, filter and order as `list`) with the person's access of that moment and stores it on the job with the export's field classes; the job replays it in id-keyset batches (score order for the office's application list). The mask is a schema made from the column catalogue, each protected column marked with `sensitive(...)`, passed through `maskData` (`access/field-mask.ts`), the API's own mask function. Cells keep codes as `{ code, source }` for the writers to label.
- **Tests:**
  - integration: for each list, the export rows for a filter equal the list endpoint's rows, in the same order (the beneficiary tab is nationwide for an RPM, as the list is); an RPM of another region exports none of the region's applications of a project; a holder of `export.list` without `export.beneficiaries` gets no NID or birth-registration field although they see it on screen; a role revoked after the request does not change the rows; a volunteer is refused with 403, a project out of reach with 404, an unknown filter with 422.
  - existing: covered by `apps/api/test/integration/volunteer-list.test.ts`, `beneficiary-tab.test.ts`, `applications.test.ts` and `field-mask.test.ts`; green after the filter move.
- **Done when:** the three lists' tests and the new row tests pass.
- **Depends on:** U2
- **Size:** L
- **Risk area:** personal data
- **Status:** done

### U4. The form questions as columns across versions
- **Goal:** a project's application export offers and fills every question of every version of its application forms.
- **Requirements:** R3, R5
- **Files:** `apps/api/src/exports/questions.ts` (`ExportQuestions`: `catalogue(projectId, includeOfficial)` and `values(ids, columns, locale, officialFor)`), `apps/api/src/container.ts`, `apps/api/test/integration/export-questions.test.ts`
- **Approach:** read the project's application forms' versions (`services/forms.ts` `readDefinition` at 659, `versionView` at 973), key questions by `fieldKey` under the newest version's text and section order, mark official-only rows with `officialRows`; fill a row from `readAnswers` (`applications/answers.ts:186`) with the application's own version; repeat groups as their own row set keyed by the application number.
- **Tests:**
  - integration: a question added in version 2 is empty for a version-1 application and filled for a version-2 one; a renamed question shows the newest text; an official-only question is absent for a holder of `export.list` alone; a family-members group yields one repeat row per member with the application number.
- **Done when:** the catalogue and the values match the record's answers for the seeded demo form.
- **Depends on:** U3
- **Size:** L
- **Risk area:** personal data
- **Status:** done

### U5. The CSV and Excel writers
- **Goal:** rows become a CSV or an XLSX stream that opens correctly in Excel in both languages.
- **Requirements:** R5, R16
- **Files:** `apps/api/src/exports/file.ts` (columns, words, labels, cell text, the formula guard), `apps/api/src/exports/csv.ts`, `apps/api/src/exports/xlsx.ts`, their `.spec.ts`, `apps/api/package.json` (`exceljs`), `packages/shared/src/exports/columns.ts` (each column's kind), `packages/shared/src/i18n/messages/{bn,en}/exports.json` (the file's words)
- **Approach:** CSV extends the quoting of `apps/api/src/locations/csv.ts:40` with the byte-order mark, CRLF, the formula guard and the code-and-label pairs (the labels in the job's language come from the message catalogue for states, types and stages through `translate` of `@css/shared/i18n`, and from `reference_lists` and the form's options for the coded answers, read once per job); XLSX uses `exceljs`'s streaming `WorkbookWriter`, header row in the request's language, numeric amounts with the lakh-grouped format, date cells shown dd-mm-yyyy, a second sheet for repeat rows.
- **Tests:**
  - unit (as built, `csv.spec.ts`, `xlsx.spec.ts`): a Bengali header and value survive a round trip through the CSV text with its byte-order mark and CRLF lines; a comma, a quote or a line break is quoted; `=SUM(A1)`, `+1`, `-1`, `@x` and a value starting with a tab or a carriage return start with an apostrophe in CSV; a coded value writes its words and a column of its code; dates are dd-mm-yyyy, numbers plain, yes or no in words, lists joined; an Excel file read back (exceljs reader) has the headers in the file's language, number and date cells, the code column, a formula-looking value as a plain string cell (no formula, no link), the repeated answers on a second sheet with the application number, and twenty thousand rows whole. The Excel writer keeps the compressed sheets in memory until the end (about 10 MB per 100,000 rows, measured with a probe), so the 100,000-row figure is taken in U12's measurement, not in a unit test.
- **Done when:** both writers' tests pass.
- **Depends on:** U2
- **Size:** M
- **Risk area:** none
- **Status:** done

### U6. The PDF renderer with Chromium
- **Goal:** HTML styled with the design tokens prints to a PDF with Bengali shaped correctly.
- **Requirements:** R7, R17
- **Files:** `apps/api/src/exports/pdf/{renderer.ts,html.ts,fonts.ts,list-table.ts}`, `apps/api/src/exports/pdf/renderer.spec.ts`, `apps/api/package.json` (`playwright-core` 1.64.0), `.github/workflows/ci.yml` (the browser and the sandbox's user namespaces before `pnpm test`), `README.md` (where PDFs print), `packages/shared/src/i18n/messages/{bn,en}/{errors,exports}.json`
- **Approach:** as built: one browser per process, launched with `chromiumSandbox: true` and never `--no-sandbox`; a fresh context per document with JavaScript off and every request routed to abort; the fonts from `packages/ui/fonts` inlined as data; a content policy in the page that allows nothing to load; `html.ts` is the only way values enter HTML and escapes them all; a browser that cannot start answers `export.pdf_unavailable` (503) with no fallback. The Docker dev setup runs as root, where Chromium refuses its sandbox, so PDFs stay unavailable there (README); the host and a non-root worker print them.
- **Tests:**
  - unit (as built): a value with `<script>` and quotes is printed as text; the PDF embeds Bornomala and UbuntuSans; a shaped conjunct (ক্ষ) measures narrower than the same letters forced apart with a zero-width non-joiner, in the same Chromium with the same fonts (instead of a pixel baseline, which would differ between Windows and the Linux runner); a page referencing an image, a stylesheet and a frame on a local server prints with no request reaching it; the launch options keep the sandbox; an unstartable browser answers "PDF unavailable".
- **Done when:** the renderer's tests pass on this machine and in CI with the browser installed.
- **Depends on:** U2
- **Size:** L
- **Risk area:** none
- **Status:** done

### U7. The export API and the job
- **Goal:** a person asks for an export, follows its progress and sees their own exports.
- **Requirements:** R1, R6, R10, R11, R12, R13, R14
- **Files:** `apps/api/src/routes/exports.ts`, `apps/api/src/exports/service.ts`, `apps/api/src/jobs/export-run.ts`, `apps/api/src/jobs/consumers.ts`, `apps/api/src/container.ts`, `apps/api/src/rate-limit/rate-limit.ts`, `docs/api/openapi.yaml` (`ExportCreate`, `ExportJob`, the `/exports` paths with their permissions and the `export` rate-limit class), `docs/security/AUTHORIZATION_MATRIX.md` (regenerated), `apps/api/test/integration/exports.test.ts`
- **Approach:** routes through `defineRoute` like `routes/uploads.ts`: `GET /exports/columns?list=&projectId=`, `POST /exports` (202 with the job), `GET /exports` (own, last 30 days) and `GET /exports/{jobId}` (own only, else 404), both open to any signed-in person. The service checks `export.list` and the list's read permission with its scope, the export permission of each protected column, the count against the limits and the running limit, writes the job with its frozen access and `export.requested` in one transaction, then enqueues on `exports`. The consumer reads batches (U3, U4), writes through U5 or U6, updates `rows_done`, stores the object, then the `files` row and `done`; on failure `failed` with an error code. The `files` row of an export is written with `source` `system`, `virus_scan` `clean` (the server made the file from its own data, so there is nothing to scan; the rule lives beside `refuseQuarantined` in `services/files.ts`), the real `sha256` and size, `uploaded_by` the requester, bucket `exports`; an export with no rows still holds its header row, so its size is never 0.
- **Tests:**
  - integration: an RPM exports the beneficiaries of the region as CSV and the job ends `done` with the row count and a file; the progress grows batch by batch; a volunteer is refused with 403; a person without `export.beneficiaries` asking for the NID column is refused with 403; another official asking for someone else's job gets 404; 100,001 rows is 422 and a 1,001-row PDF list is 422; a fourth running export is 409, while a job stuck past 30 minutes does not count; a failed first attempt leaves the job `running` and its retry removes the partial object, and only the last failed attempt writes `failed`; a sensitive export writes `export.requested` with filters, columns and row count, a plain one is also recorded; a failing storage write ends `failed` and leaves no file row; the job stops at the row limit even when rows were added after the count (it asks each batch for no more than the rows left) and the audited row count is the rows written; in the score order a row re-scored during the job is written once (the writer skips an id it has written); the column catalogue lists only the columns the caller may export; an RPM asking for `GET /exports/columns` or `POST /exports` on a project outside the region gets 404, as for a missing project, and no job row is written; a finished job's file streams (not 423) and an export of no rows holds the header.
- **Done when:** the tests, the OpenAPI drift test and the authorization matrix pass.
- **Depends on:** U1, U3, U4, U5, U6
- **Size:** L
- **Risk area:** personal data
- **Status:** done

### U8. The download, the expiry and the notices
- **Goal:** only the requester downloads the file, it expires after 30 days, and a notice says when it is ready.
- **Requirements:** R13, R14, R15
- **Files:** `apps/api/src/services/files.ts`, `apps/api/src/jobs/export-sweep.ts`, `apps/api/src/jobs/consumers.ts` (a daily schedule on the `exports` queue, whose 30-minute expiry fits a sweep in batches; the maintenance queue expires a job after 120 seconds), `apps/api/src/notifications/catalogue.ts`, `apps/api/src/notifications/export-events.ts`, `packages/shared/src/i18n/messages/{bn,en}/common.json` (notice texts), `docs/architecture/NOTIFICATIONS.md`, tests in `apps/api/test/integration/{files,exports,jobs}.test.ts`
- **Approach:** the kind `export` in `FilesService.viewer` (`services/files.ts:161`) reaches only the job's requester, whose account is active and whose live access still holds the job's export permission (and the protected classes' permissions for a sensitive job), else 404; attachment disposition; `file.download_sensitive` for a sensitive job; the sweep deletes the object, then marks the file deleted (the job row stays); `findFile` (`services/files.ts:395`) hides deleted files from everyone, so `streamContent` gains one path: a deleted file of kind `export` whose requester is the caller answers 410 `export.expired`, everyone else still 404; the consumer publishes `export_ready` or `export_failed` in the transaction that ends the job, like `notifications/media-events.ts`; the same daily sweep marks jobs stuck in `queued` or `running` past 30 minutes as `failed` (`export.timed_out`) and removes their objects; it works in batches and is safe to run again.
- **Tests:**
  - integration: the requester downloads the CSV with attachment disposition; another official with every permission gets 404; the requester gets 404 once blocked or deactivated, and once their `export.beneficiaries` is revoked for a file holding NID; a job stuck in `running` for 31 minutes is failed by the sweep and its partial object removed; the sweep run twice changes nothing more; a sensitive download writes `file.download_sensitive`; after the sweep (injected clock past 30 days) the object is gone, the job row stays and the requester's download answers 410 while another official's answers 404; the requester gets one in-app `export_ready` notice linking to "My exports", and `export_failed` on a failure.
  - existing: covered by `apps/api/test/integration/files.test.ts` (file access) and `jobs.test.ts` (schedules); extended, not duplicated.
- **Done when:** the tests pass and `notifications:sync` adds the two templates.
- **Depends on:** U7
- **Size:** M
- **Risk area:** file storage
- **Status:** done

### U9. The 360° profile and the application as PDF
- **Goal:** a beneficiary's profile and one application print as PDFs showing what the person may see.
- **Requirements:** R8, R9, R11, R13
- **Files:** `apps/api/src/exports/pdf/{profile.ts,application.ts}`, `apps/api/src/exports/service.ts`, `apps/api/src/routes/exports.ts` (`POST /beneficiaries/{beneficiaryId}/pdf`, `POST /applications/{applicationId}/pdf`), `docs/api/openapi.yaml`, `apps/api/test/integration/export-records.test.ts`
- **Approach:** the request checks `report.beneficiary_journey` and the profile's read (360°), or `export.list` and the application's read (one application), each with its scope, and freezes the access as for a list; the job reads the profile through `BeneficiariesService.profile` and the record through the application service's `get` with a viewer rebuilt from the frozen snapshot (never the live access), masks them with their response schemas and the frozen classes (NID only with `export.beneficiaries`, the official section only with `export.forms`), marks the job sensitive when a protected class is present, and renders sections like the pages (`admin/beneficiaries/BeneficiaryProfilePage.tsx`, `admin/applications/ApplicationReviewPage.tsx`).
- **Tests:**
  - integration: a PM's profile PDF names the person and lists their applications across projects; a reader of the application without `export.list` gets 403, and a reader of the profile without `report.beneficiary_journey` gets 403; a PDF holding the NID writes `export.requested` with `sensitive` true; an official without `beneficiary.view_nid` gets a PDF without the NID; an application PDF of a holder of `export.list` alone has no official section; an official outside the region gets 404 for both; the PDF text (extracted from the bytes) holds the application number and the project's name.
- **Done when:** both PDFs come out of the job and the tests pass.
- **Depends on:** U6, U7
- **Size:** L
- **Risk area:** personal data
- **Status:** todo

### U10. The export dialog on the three lists
- **Goal:** officials start an export from a list, choose columns and format, follow its progress and download it.
- **Requirements:** R1, R2, R3, R4, R6, R14, R16, R18
- **Files:** `apps/web/src/features/exports/{ExportDialog.tsx,ColumnPicker.tsx,ExportProgress.tsx,exports-api.ts,use-export-job.ts,remembered-columns.ts,download.ts}` with tests, `apps/web/src/admin/volunteers/VolunteersPage.tsx`, `apps/web/src/admin/beneficiaries/BeneficiariesPage.tsx`, `apps/web/src/admin/applications/ApplicationsPage.tsx`, `apps/web/test/msw/` handlers, `packages/shared/src/i18n/messages/{bn,en}/exports.json` (copy with `ae-bangla-copy`)
- **Approach:** a `Modal` from `@css/ui` with the format as a `RadioGroup`, the columns as `CheckboxGroup`s per group (questions per section with "পুরো অংশ বাছুন" and a search), "সব বাছুন" and "কোনোটিই না"; the export button shows only for the permission (`RE-SEC-05`); progress polls `GET /exports/{jobId}` with TanStack Query while waiting or running (`RE-FX-02`); the download fetches the content with the token and saves it through an object URL; the current filters come from each page's `list-query.ts` state.
- **Tests:**
  - unit: the remembered choice comes back and drops a column the person can no longer export; the column order is the fixed one.
  - component: the dialog shows the on-screen columns ticked the first time, and for each of the three pages those ticks name the same columns, in the same order, as the table the page draws (the catalogue's ids map to the page's: `ben_no` is the page's `ben`, and `app_no` sits inside the page's `person` cell); "সব বাছুন" ticks all; the start button is disabled with nothing ticked; a 422 limit answer shows the narrowing message; a volunteer sees no export button; axe passes in both languages at 360 px.
  - existing: covered by `admin/volunteers/volunteers.test.tsx`, `admin/beneficiaries/beneficiaries.test.tsx`, `admin/applications/applications.test.tsx`; the new button is added to them.
- **Done when:** the component tests pass and the first route stays under 250 KB (`bundle:report`), the dialog in a lazy chunk.
- **Depends on:** U7, U8
- **Size:** L
- **Risk area:** none
- **Status:** todo

### U11. My exports and the PDF buttons
- **Goal:** a person finds their exports again and downloads the two record PDFs from their pages.
- **Requirements:** R8, R9, R15, R18
- **Files:** `apps/web/src/features/exports/MyExportsPage.tsx` with its test, `apps/web/src/routes/index.tsx` (`/account/exports`), `apps/web/src/components/shell/ProfileMenu.tsx`, `apps/web/src/admin/beneficiaries/BeneficiaryProfilePage.tsx`, `apps/web/src/admin/applications/ApplicationReviewPage.tsx`, i18n `exports.json` and `nav.json`
- **Approach:** the page lists `GET /exports` with state badges and download buttons, the expired ones without; the profile menu gets "আমার এক্সপোর্ট" for officials; "PDF নামান" on the two pages starts the job and opens the same progress dialog.
- **Tests:**
  - component: the list shows a done export with its download button, a running one with its progress and an expired one marked expired; the profile menu shows the link to an official and not to a volunteer; the PDF button appears only with its permission.
- **Done when:** the component tests pass.
- **Depends on:** U8, U9, U10
- **Size:** M
- **Risk area:** none
- **Status:** todo

### U12. The journeys, the measurement and the documents
- **Goal:** the export works end to end on a phone and a desktop, is measured, and every document says what was built.
- **Requirements:** R1 to R18 (end to end)
- **Files:** `apps/web/e2e/exports.spec.ts`, `apps/web/e2e/a11y.spec.ts` (the dialog and "My exports"), `apps/web/e2e/roles.spec.ts`, `apps/api/scripts/perf-exports.ts`, `docs/testing/PERFORMANCE.md`, `docs/api/API_STANDARDS.md` §14, `docs/ui/SCREENS.md`, `docs/BUSINESS_RULES.md` (BR-183, BR-224 register), `docs/security/SECURITY_POLICY.md`, `docs/architecture/FILES_AND_DOCUMENTS.md`, `docs/ui/I18N.md` §9, `docs/testing/TEST_STRATEGY.md`, `docs/STATUS.md`, `CLAUDE.md`
- **Approach:** follow `e2e/support/admin.ts` sign-in and the download events of Playwright.
- **Tests:**
  - e2e: as `rpm.dhaka@example.org` at `/admin/beneficiaries`, click "এক্সপোর্ট", the dialog "এক্সপোর্ট করুন" shows the on-screen columns ticked, choose "Excel", untick "মোবাইল", click "এক্সপোর্ট শুরু করুন", wait for "ডাউনলোড করুন", the downloaded file's name ends `.xlsx`; at `/admin/projects/:projectId/applications` choose "CSV" and the section "পরিবার ও আয়" with "পুরো অংশ বাছুন", download, the CSV starts with the byte-order mark and has the question headers; at `/account/exports` both rows show "তৈরি"; on a beneficiary's profile "PDF নামান" ends in a `.pdf` download; a volunteer (`01700000106`) sees no "এক্সপোর্ট" on any page and `POST /exports` answers 403; on the mobile project the dialog fits 360 px.
  - existing: the a11y sweep and `roles.spec.ts` extended.
- **Done when:** `exports.spec.ts` passes three times with `--repeat-each 3 --workers 1`, a 100,000-row export is measured on `css_erp_perf` and recorded, and every listed document is updated.
- **Depends on:** U10, U11
- **Size:** M
- **Risk area:** none
- **Status:** todo

## Checkpoints
- **Mode:** grouped (one by one 10, grouped 7, all at once 0; N is over 4, so one by one's points go to grouped: 17)
- **Signals:** N 12, L 3,300, R 6, Fd 6, C 8, P 2
- **C1** after U1: a migration, and the decisions the rest follow
- **C2** after U2: foundation for U3, U5 and U6
- **C3** after U3: foundation and personal data (the mask and the frozen access)
- **C4** after U4: personal data (the official section across versions)
- **C5** after U5: a new pattern (the XLSX writer)
- **C6** after U6: foundation and a new pattern (Chromium in the worker)
- **C7** after U7: foundation and personal data (the API and the job)
- **C8** after U8: foundation and file storage (download and expiry)
- **C9** after U9: personal data (the record PDFs)
- **C10** after U10: foundation for U11 and U12
- **C11** after U12: end (U11 is reviewed here)

## Verification
- `pnpm typecheck`, `pnpm lint` (or `npx eslint . --ignore-pattern ".claude/**"`), `pnpm i18n:check`, `pnpm docs:check`
- `pnpm test`; the database project for the export files: `pnpm --filter @css/api exec vitest run --config vitest.db.config.mts test/integration/export*.test.ts test/integration/files.test.ts test/integration/jobs.test.ts`
- `pnpm --filter @css/api contract:coverage`, `pnpm --filter @css/api authz:matrix`, the OpenAPI drift test
- `pnpm db:migrate` and the down.sql against a scratch database
- `pnpm --filter @css/web build` and `pnpm --filter @css/web bundle:report`
- `pnpm e2e`, with the export journeys repeated: `pnpm --filter @css/web exec playwright test e2e/exports.spec.ts --repeat-each 3 --workers 1`
- `pnpm --filter @css/api perf:seed` (if css_erp_perf is missing) and the export measurement script
- `pnpm audit --audit-level high` and gitleaks (the D-138 merge checks)

## Risks and rollback
- **Migration** (`DB-MIG-05`): only added columns, a CHECK and an index; `down.sql` drops them. No existing row changes.
- **Personal data**: a mistake in the mask or the frozen access would put NID or bank data into a file that leaves the system. Mitigated by the single mask, the refusal of unallowed columns at the request, the tests per class and per role, and the audit of every sensitive export and download.
- **Chromium on the server**: about 170 MB and a sandbox the production host must allow (never `--no-sandbox`); until the IT team confirms the host (O-34), PDF jobs fail with a clear error while Excel and CSV keep working. Rollback: switch the PDF format off in the shared limits.
- **Memory and load**: 100,000-row exports run in the worker in batches and streams; the measurement in U12 is the evidence, and the running limit per person caps the load.

## Definition of done
- All units done and their tests pass
- Verification commands pass
- `ae-review` has run, with no open P0 or P1
- Code from abandoned attempts is removed

## Progress
- **Branch:** `feat/export-service` (cut from `feat/offline-sync` while PR #34 waited for CI; merge `main` in once PR #34 is merged)
- **Updated:** 2026-11-01 13:11
- **Next:** C8: the review of the download, the expiry and the notices
- **Reviewed through:** C7 at 673411fe
- **Uncommitted:** none
- **Notes:** the owner said "শুরু কর" while PR #34's CI was still running, so the branch starts from `feat/offline-sync` instead of `main`. U1: the migrations test round-trips every down.sql on a seeded database, so a new migration needs no test of its own for that; the fixtures' user() returns the id, not the row. C1: a migration's defaults that only serve the step of adding the column are dropped in the same migration, so a later insert cannot store an empty snapshot; refusal tests name their constraint. The dev database had the first version of the migration: reversed with its down.sql and the history row removed, then deployed again (never on a shared database). U2: the API validates a list's filters with that list's own schema (the application filter schema lives in apps/api/src/applications/view.ts), so the shared request carries the filters as a plain record; orderColumns drops ids the list does not know. C2: one P3 (the on-screen columns test is a snapshot of the catalogue, not of the pages), tied to the pages by a U10 component test. U3 design, decided while reading the code: the three list services already build their Prisma `where` from the caller's live scope at that moment (volunteers and beneficiaries expose `where`, the applications' is `filterOf` plus `applicationWhere(scope)`), and their NID searches load live access; so the request computes the where and the sort once with the access of that moment and stores them on the job (in `access`, with the field classes), and the job replays them in id batches. That freezes the rows exactly and needs no scope rebuild for the lists; the snapshot-and-rebuild of the scope handle stays for the record PDFs (U9) if they need it. U3: an RPM's beneficiary tab is nationwide (beneficiary.view_all is GLOBAL for the RPM, O-67), so the region limit shows on the application list, not on beneficiaries; the plan's first test line assumed otherwise and was corrected. C3 (security P0, fixed): a protected class must also follow the on-screen per-record reach (volunteer.view_sensitive, beneficiary.view_nid) intersected with the export permission's scope; the nationwide lists made a class-level check leak other regions' NIDs. The frozen list carries `reach` per class, checked per batch. Left for U7: the row budget per batch, the audited count from the rows written, and skipping an id already written in the score order. U4: a placed project form takes a new version only from its ready form (draft and publish the ready form, then take-version on the project's form); the fixture project already holds a form keyed default, so the test makes its project through the API; photos, files, signatures and the repeat group itself are no columns. C4 (security P0, fixed): a form answer's class is per answer, from its own version's section and standard column (official-only, or the identity column as the NID); a question protected in any version and not carried is left out of every version. The application list carries a reach rule for the NID (export.beneficiaries scope), and each ExportRow names its allowed classes, which the job passes to ExportQuestions.values. Published versions are trigger-protected, so a test changes a question across versions by making a new version through the API (ready form draft, publish, take-version). Left as P3: an unreadable stored answer becomes an empty cell without a log line; the joined-cell text duplicates a little of the web's answer formatting. U5: exceljs 4.4.0 pulls uuid below 11.1.1 (a moderate advisory for buffer-taking v3/v5/v6 calls the export never makes; under the CI's high threshold); the streaming WorkbookWriter holds the zip until commit (about 10 MB per 100,000 rows). Coded labels come from the screens' own catalogue keys (admin.volunteers.state, admin.projects.volunteers.type, admin.beneficiaries.status/types/gender, applications.status). Prettier writes a BOM escape as the invisible character, so the CSV writer builds it with String.fromCharCode. C5: the formula guard is for free text only (a negative number is the server's value); both writers share an OutputGuard that throws a stream's error or early close at the next write and ends a drain wait with it. The exceljs reader returns a number format without its backslash escapes. The Excel writer cannot wait for the output to drain per row (exceljs holds the parts until commit). U6: Chromium refuses its sandbox to root, so the Docker dev setup (root) cannot print PDFs; the host can. GitHub's Ubuntu runners need kernel.apparmor_restrict_unprivileged_userns=0 for the sandbox. Shaping is proven by measuring the conjunct against the letters forced apart with ZWNJ (built with String.fromCharCode, never a literal invisible character). C6: the renderer drops a disconnected browser and maps every failure to export.pdf_unavailable (no browser, no fonts) or export.pdf_failed (printing broke), logging the cause; the job must store only these codes. The renderer takes a logger, which the container passes in U7. The fonts live in packages/ui/fonts, so a production image must ship them (U12: DEPLOYMENT). U7: the request writes export.requested with the row count at the request; the job's own changes carry no audit (as the plan's notice-and-audit decision says), and the job row's row_count is the rows written. An application export with form questions counts as sensitive whenever the export carries the official section or the NID, since a question's class can differ between versions. A question withheld from the person answers 403, not 422, because the service also reads the full question catalogue. The running limit is held by a per-person advisory lock inside the request transaction. The file stream test of a finished job moves to U8, where the file service learns the kind export. The renderer spec's browser tests need 30 seconds when the whole suite runs at once (Chromium starts slowly under load); alone they take under 3. C7 (security P1, fixed): the job's file row made the export downloadable through the uploader branch of the file route with no live check and no audit, so the file route now refuses the kind export (404) until U8 gives it the job's own checks; U8 replaces that refusal. C7 fixes: the job stores and audits the filters as the list's schema read them, and the PDF heading prints every filter, a project or volunteer by name only when it reached rows (the application list's own project always), from exports/heading.ts; each attempt writes its own object key (an attempt number in the path), claims the job with a conditional update, stops at the next batch when pg-boss aborts it, and finishes only while the job is still running, so two attempts at once leave one file; after success the other attempts' keys are removed. A stored export that does not parse fails at once without retries. closeContainer always disconnects Prisma. Left for U8: the daily sweep must also fail a job whose last attempt died (no catch ran) and remove every attempt key 0 to the queue's retry limit. Left as P3: a file can hold fewer rows than rows_total when rows were added past the limit (the job stops at the limit, as decided). One full API unit run lost a test worker (Chromium under load); three reruns were clean. U8: the download check lives in exports/download.ts and the file service calls it first for any file id, so a deleted export reaches its requester as 410 and everyone else as 404; it needs an active account, export.list and, for a sensitive job, the export permissions of the classes sensitiveClasses names (the same function marks the job sensitive at the request). The download name is <kind>-<yyyy-mm-dd>.<format>. The sweep shares the exports queue (data kind export-sweep) and runs daily at 03:30 Dhaka time; it removes every attempt key of a stuck job and publishes export_failed. The notices carry list_name and jobId (both added to the in-app params) and link to /account/exports, which U10 builds. The runner's options object now holds the logger, the events and the limits. Two runs on this machine lost a Vitest worker without an error (once with Chromium, once without); every rerun was clean.
