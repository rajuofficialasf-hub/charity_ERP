---
title: Form builder for PMs, the runtime form renderer and the public application page
type: feat
status: in-progress
doc_review: 2026-10-22
source: brainstorm
date: 2026-10-22
---

# Form builder for PMs, the runtime form renderer and the public application page

T2.4 of `docs/PLAN.md` (P6.5, part 2). Builds on the form engine and API of T2.3 (`docs/plans/2026-10-21-1135-feat-form-engine-plan.md`, decision D-119); no implementation starts before that pull request is merged into `main`.

## Goal
A PM builds a project's application form from the section and field libraries, adds the project's own questions, sets their conditions and calculations without writing code, previews it as a volunteer and an official would see it on a phone or a desktop in Bengali or English, and publishes it; a later change becomes version 2 while what was submitted on version 1 stays on version 1. The same renderer runs the form on a 360 px phone, and the public application page lets anyone with the link apply through it.

## Problem
T2.3 left the forms reachable only through the API: the activation checklist asks for a published form, and the E2E and test helpers publish a library template by API because no screen exists. The public link works but has no page an applicant can open. Officials and volunteers cannot see a form as it will be filled.

## Requirements

### The builder (SCR-061, desktop-first)
- **R1** A holder of `form.build` on the project opens the builder from the project's setup and sees three panes: the section and field libraries with search on the left, the form outline in the middle, the settings of the chosen section or field on the right; the live preview is a tab, or a fourth pane from 1280 px.
- **R2** Sections and library fields are added by a tick and ordered with move-up and move-down buttons; there is no drag and drop. Every action works with the keyboard alone.
- **R3** The mandatory core fields (identity number, name, father or husband name, mobile, gender, the four-level address, village) are marked and cannot be removed, made optional, hidden by a condition or moved into an official-only section; the builder never offers those actions.
- **R4** A PM adds the project's own question inside the form: picks a field type the engine knows, writes the label in Bengali and English (both required), and for a choice field the options in both languages, the "other" option that opens a text box, and options that depend on an earlier answer (branching). The question belongs to this form only; the libraries stay read-only.
- **R5** For each field the settings show: the labels and help text in both languages, required, the section's visibility (everyone or official only), the named validation pattern (a fixed list, never a free expression), the length, number or row limits, and for a repeat group its member fields and its minimum and maximum rows.
- **R6** A condition editor sets "show this field (or section) when" and "required when" as a list of rows (field · comparison · value) joined by "all of these" or "any of these", one level deep. A condition from the seed or an earlier version that is deeper than one level is shown read-only with a note, and can only be removed and rewritten.
- **R7** A calculation editor builds a calculated field as a row of terms joined by plus and minus, or two terms joined by times or divided by, where a term is a number field, a money field, another calculation, or the sum of a field over the rows of a repeat group; and offers ready rules: age from a date of birth, and net assets compared with the nisab in force. Every calculation of the two seeded templates can be built and edited this way.
- **R8** The draft saves itself to the server while the PM works, with the version check of T2.3; a save the server refuses shows the engine's message beside the named field; a version changed elsewhere shows a notice and reloads the draft; leaving with an unsaved change warns.
- **R9** The version list shows every version (draft, published, retired) with who changed it and when, and a change summary the system writes by comparing it with the previous version: sections and questions added, removed, moved or changed, options added or removed, conditions and calculations changed. A published or retired version opens read-only with a "make a new version" action on the published one.
- **R10** Publishing asks for confirmation, shows the change summary and says that earlier applications keep their version; the engine's refusals (a core field missing, a broken condition or calculation) are shown on the fields they name. Publishing needs `form.publish`.
- **R11** A builder without the official-section class (`application.view_official_section` on the project) sees the volunteer-visible part only and cannot save (as the API already refuses), with a notice saying why.
- **R12** On a phone the builder opens read-mostly: the outline and the preview, and the label and option texts are editable; adding, ordering, conditions, calculations and publishing say "do this on a computer".
- **R13** The preview runs the renderer of R14 to R22 on the current draft, switching between phone and desktop width, Bengali and English, and the volunteer's and the official's view; its answers are not saved anywhere.

### The renderer (phone-first)
- **R14** One renderer component draws any published or draft version: one section per screen on a phone with a step indicator ("অংশ 2 / 5") and previous and next, all sections on one page from tablet width; it runs at 360 × 640 without sideways scrolling and works with the keyboard alone.
- **R15** It shows each field in the device language with its label, help text, required mark and the engine's localized validation message under the field; numbers, dates and amounts in English digits through the shared formatter.
- **R16** Conditions and calculations run live through the shared engine as the person types: hidden fields and sections disappear and their answers stop counting; calculated values update; branching options follow the earlier answer; "other" opens its text box.
- **R17** The address field cascades division → district → upazila → union from the locations list, each level waiting for the one above.
- **R18** A repeat group adds and removes rows within its minimum and maximum, each row with its member fields and its own messages.
- **R19** An official-only section is never drawn for a volunteer or the public; the renderer takes the version as the API returns it for the caller and never filters by itself alone.
- **R20** A GPS field takes the position from the device on a tap, shows it with its accuracy, and says what to do when the permission is refused.
- **R21** Photo, file and signature fields use the upload component of T2.1 through an upload adapter the screen passes in (a signature is a photo or scan of the signature on paper, taken or chosen like a photo; no drawing on the screen); a note field shows its text read-only and takes no answer: the public page's photo route now, the signed-in application of T2.5 later; in the builder's preview they are shown but take nothing.
- **R22** The answers are kept while the browser tab is open (they survive a reload) and are cleared when the tab closes or the form is sent; nothing personal is stored on the device beyond the tab until the encrypted offline store of T2.7.

### The public application page (SCR-111, phone-first) and the link
- **R23** In the builder, a holder of `form.public_link.manage` switches the project's public link on with the one form it opens, sees and copies the URL, and switches it off; switching it on again shows a new URL and the old one stops working.
- **R24** Anyone opens `/apply/{token}` without signing in and sees the project's name and closing date and the form through the renderer, with a language switch; a closed link shows one plain "this link is not taking applications" page, whatever the reason.
- **R25** Photo fields on the public page upload one photo at a time before sending, with the limits of T2.3 shown in words (five per application, the size and types); a refused photo says why.
- **R26** Sending shows only that the application was received and will be checked by an official, never whether the person is already known or blocked; a second press of send (or a resend after a lost answer) does not create a second application.

### Proof
- **R27** An E2E journey: a PM builds a form from library sections plus one own question with a condition and a calculation, publishes version 1, switches the link on; on a 360 px phone an applicant fills and sends it through the link; the PM changes the form and publishes version 2; the public entry stays on version 1 and the link now opens version 2.

## Scope
- In: the builder screen and its preview; the renderer component with every field type the engine knows; the public application page; the link settings inside the builder; the change summary; the tab-only autosave of answers; the activation checklist's link from "a published form" to the builder; the new journey builds its form on the screen, while the specs that are not about forms keep publishing a library form by API (`publishLibraryForm`).
- Out (not now): the signed-in new application, drafts on the server and submit (T2.5); the review screen and the verification of public entries (T2.5, T2.6); the encrypted offline store and the form cache (T2.7); editing the section and field libraries (`form.library.manage` keeps no holder); drag and drop; nested condition groups in the editor; free formulas with brackets, minimum, maximum or rounding in the editor (the engine keeps them for seeded fields); a CAPTCHA on the public page (O-08).

## Key decisions
- **Tick and move buttons, no drag** (owner, 2026-10-22): as the approved mockup `docs/ui/mockups/13-form-builder.html` and SCREENS SCR-061 say; the task text's "drag or tick" is settled to tick only. Governs R2.
- **The public application page and the link settings are part of this task** (owner, 2026-10-22): the renderer's first real use, and the only way today to prove "old application keeps v1". Governs R23 to R27.
- **The PM adds the project's own questions inside the form** (owner, 2026-10-22); the libraries stay read-only (D-119). Governs R4.
- **One level of conditions** (owner, 2026-10-22): rows joined by "all" or "any"; deeper conditions from the seed are read-only in the editor. Governs R6.
- **Calculations as a row of terms plus ready rules** (owner, 2026-10-22): plus and minus over many terms, times or divided by over two, the repeat-group sum, age from date of birth, the nisab comparison. Governs R7.
- **Answers autosave only inside the open tab** (owner, 2026-10-22): nothing personal stays on the device after the tab closes until T2.7's encrypted store; the builder's draft saves to the server. Governs R8, R22.
- **The system writes the change summary** (owner, 2026-10-22) from a comparison with the previous version; no PM note and no new column. Governs R9, R10.
- **A signature is a photo of the signature on paper** (owner, 2026-10-22, at the plan review): taken or chosen like a photo through the same upload component; no drawing pad. The public page never has one (D-119). Governs R21.

## Success criteria
- The renderer's behaviours (each field type, conditions, calculations, branching, repeat rows, the address cascade, the localized messages, the official-only rule) are proven by React Testing Library tests, with an axe check in both languages.
- The E2E journey of R27 passes on the desktop project for the PM and on the mobile project at 360 px for the applicant.
- Every builder action works by keyboard alone; the renderer has no sideways scroll at 360 px.

## Technical decisions
- **Stack profile**: the one in `CLAUDE.md` (ST-43), unchanged: React 19 + Vite PWA, TanStack Query, use-intl, the `@css/ui` set on MUI core behind its template boundary; the engine of `@css/shared/forms`. Nothing is added: no drag-and-drop or form library (ST-40); the position comes from the browser's `navigator.geolocation`.
- **The engine runs unchanged in the browser** (BR-076): the renderer calls `evaluate()` on every change and `validate()` before a step is left and before sending, with the audience of the screen (`public`, `volunteer` or `official`) and `today` from `isoDateInDhaka`. The engine, the renderer and the builder load only in their lazy route chunks; `pnpm --filter @css/web bundle:report` keeps the first route under 250 KB.
- **Nisab on the public page**: the public form read carries no nisab value (T2.3), and the zakat section of the self-reliance template is volunteer-visible, so on the public page a nisab comparison shows no value and the helper "the office works this out"; the server computes it at submit. Signed-in screens (the builder's preview now, T2.5 later) read `GET /nisab-versions/in-force`. No change for the nisab.
- **One additive API change: the library read gives each field ready to place** (owner, 2026-10-22, found while building U1): `GET /form-library` also answers, for each library field, `formFields`, the field (and a repeat group's members) in the shape a version read gives it, with its options from the reference list and its calculation, as `fieldFromLibrary` of `@css/shared/forms` builds them on the server; without it the browser cannot place a choice field, whose options come from the reference lists. Nothing else changes in the API, the permissions or the database.
- **Where the code lives**: the renderer in `apps/web/src/features/forms/` (shared by the preview, the public page and the application screen of T2.5); the builder in `apps/web/src/admin/forms/` under `/admin/projects/:projectId/forms/:formId`; the public page at `/apply/:token`, a lazy route outside the app shell like `/invite`, using `AuthShell` and its language switch.
- **The builder edits a definition with pure functions** (`apps/web/src/admin/forms/draft.ts`): add a library section or field, add the project's own question, move up and down, remove, set a setting; each refuses what the core rules forbid, so the screen never offers it. Condition rows and calculation terms convert to and from the engine's JSON in `logic-rows.ts` and `calc-terms.ts`; anything they cannot express comes back as "not editable here" (the seed's deeper logic stays read-only). The change summary is `diff.ts`: a pure comparison of two definitions into a list of changes the screen turns into localized sentences. All three are tested as units (TS-01).
- **Own questions get a stable key**: generated from the English label (`q_<slug>`, de-duplicated in the form), never shown or edited, and kept by the next version so the field map of T2.3 follows the question across versions.
- **Draft autosave**: about 1.5 s after the last edit the whole draft is sent with `PATCH /form-versions/{id}` and If-Match; one save in flight at a time, the next queued; 422 details are placed on the fields they name; 412 shows "changed elsewhere" and reloads; while a save is pending or failed, leaving is held by React Router's `useBlocker` and `beforeunload` (a new pattern in this repo).
- **Answers in the tab only**: the renderer keeps its answers, the current step and the client id in `sessionStorage` under a key of the screen (the public page keys by a hash of the token, never the token itself); it is cleared on send and on logout (`lib/wipe.ts` already clears `sessionStorage`). The client id makes a second press or a resend of the public submission answer the same application (the idempotency on `clientUuid` of T2.3).
- **Uploads through an adapter**: the renderer's photo and file fields take `{ upload(file, fieldKey): Promise<fileId> }` from the screen; the public page's adapter compresses with `lib/compress.ts` and sends the raw body to `POST /public/forms/{token}/photos` as `registration-api.ts` `uploadDraftPhoto` does; the preview passes none and the fields show as inert. The chunked client of T2.1 is wired in T2.5 through the same interface.
- **The volunteer view of the preview** filters official-only sections in the browser for display only; every real screen shows the version the API returned for its caller (the server's filter is the rule).
- **Texts**: one new namespace `forms` in `packages/shared/src/i18n/messages/{bn,en}/forms.json`, added to `NAMESPACES`; Bengali written with `ae-bangla-copy`; engine codes already live in `errors.json` and are checked by `pnpm i18n:check`; English digits through `@css/shared/format` (UX-05).
- **Rules cited**: ST-07/ST-12 (zod at the boundary: the version and public responses parsed before use), RE-UI-01 to RE-UI-05 (only `@css/ui`, no MUI outside its template folder, no utility classes; `apps/web/test/class-names.test.ts`), the hard-coded text rule `css/no-literal-ui-text`, TS-01/TS-12/TS-30/TS-31 (behaviour tests by layer, role-based locators, no sleeps), ORG-CMT-10/40/50: plan, rule and decision IDs stay in this plan; code, comments and test names carry the meaning in words.

## Implementation units

Plan IDs (R, U, BD, BR, O, D and the standards rule IDs) stay in this plan. Code, comments, commit messages and test names carry the meaning in words.

### U1. The decision record and the builder's pure logic
- **Goal:** the owner's T2.4 decisions are logged, and the edit operations, the condition rows, the calculation terms and the change summary exist as tested pure functions.
- **Requirements:** R2, R3, R4, R6, R7, R9
- **Files:** `apps/api/src/services/form-library.ts`, `apps/api/src/routes/forms.ts`, `docs/api/openapi.yaml` (`FormLibrary.fields[].formFields`), `apps/api/test/integration/forms.test.ts`, `apps/web/test/forms.ts` (small definitions for the web tests), `docs/DECISION_LOG.md` (D-120: tick and move buttons, the public page in this task, own questions, one level of conditions, calculation terms and ready rules, the tab-only autosave, the system-written summary, the signature as a photo of the signature on paper), `apps/web/src/admin/forms/{draft,logic-rows,calc-terms,diff}.ts` with `*.test.ts` beside them.
- **Approach:** pure modules over `FormDefinition` of `@css/shared/forms`, in the style of `packages/shared/src/forms/template.ts` and `apps/web/src/features/registration/form-state.ts`; every result is checked with `formDefinitionSchema` in the tests.
- **Tests:**
  - unit: adding a library section brings its fields in library order; a core field cannot be removed, made optional, given a condition or moved into an official-only section; move up at the top and move down at the bottom change nothing; an own question gets a unique `q_` key and keeps it across a copy; branching options and "other" round-trip; condition rows and their JSON round-trip for every comparison, with "all" and "any"; a nested condition from the seed comes back as not editable; calculation terms and their JSON round-trip for plus and minus chains, times, divided by, the repeat-group sum, age and the nisab comparison; every calculation of both seeded templates converts; the diff names added, removed, moved and changed sections, questions and options, and changed conditions and calculations, and nothing for two equal definitions.
- **Done when:** the web unit tests pass and D-120 is in the log.
- **Depends on:** none
- **Size:** L
- **Risk area:** none
- **Status:** done

### U2. The renderer
- **Goal:** one component draws any version as a phone-first form with live logic, the address cascade, repeat rows, GPS, upload fields through an adapter and the tab-only answers.
- **Requirements:** R14, R15, R16, R17, R18, R19, R20, R21, R22
- **Files:** `apps/web/src/features/forms/{FormRenderer,FieldInput,RepeatGroup,GpsField,UploadField}.tsx`, `apps/web/src/features/forms/{use-form-answers,answers,upload-adapter}.ts`, `apps/web/src/features/forms/renderer.test.tsx`, `packages/shared/src/i18n/messages/{bn,en}/forms.json`, `packages/shared/src/i18n/catalogue.ts` (the namespace), `apps/web/src/i18n/types.d.ts` if needed.
- **Approach:** the stepped layout of `features/registration/RegisterPage.tsx` and `Stepper`; fields from `@css/ui` (TextField, Select with its other option, RadioGroup, CheckboxGroup, DateField, FileUpload); the address from `features/registration/AddressFields.tsx`; the answers as the engine's `Answer[]` in a reducer, mirrored to `sessionStorage` only when the screen passes a storage key (the preview passes none); `evaluate()` on each change; `validate()` per step and before sending, its errors placed by path (`key` or `key[row]`).
- **Tests:**
  - unit (React Testing Library with MSW): each field type renders with its bn and en label and takes an answer in the engine's shape; a show-if hides the field and its answer stops counting; required-if adds the required mark; the total updates as the two numbers are typed; branching options follow the earlier answer and "other" opens its text box; the address waits for each level; a repeat group adds rows up to its maximum and refuses removing below its minimum; the engine's message shows under the field in the device language; an official-only section is never drawn for the volunteer or the public audience; the answers survive a re-mount from `sessionStorage` and are gone after sending; a granted location shows the position and its accuracy, a refused permission shows its message; a photo or signature field with no adapter shows as inert; a note shows its text and takes no answer; without a storage key nothing is written to `sessionStorage`; no axe violation in bn and en on the phone layout.
- **Done when:** the renderer tests pass and the class-name and template-boundary tests stay green.
- **Depends on:** none
- **Size:** L
- **Risk area:** personal data
- **Status:** todo

### U3. The builder shell: open, create, outline, autosave
- **Goal:** a PM opens or starts the project's form and edits its outline with the library, the move buttons and the core locks, with the draft saved by itself.
- **Requirements:** R1, R2, R3, R8, R11, R12
- **Files:** `apps/web/src/admin/forms/{FormBuilderPage,LibraryPane,OutlinePane,NewFormDialog}.tsx`, `apps/web/src/admin/forms/{forms-api,use-draft-save}.ts`, `apps/web/src/admin/forms/builder.test.tsx`, `apps/web/src/routes/index.tsx`, `forms.json`.
- **Approach:** the setup screen's parts and save notices (`admin/projects/setup/setup-context.tsx`, `SaveNotice`), its API helpers (`setup-api.ts`, `projectWithEtag`), the move buttons of `SyllabusSection.tsx`; the new form from a template, blank or another project's form through `POST /projects/{id}/forms`, the copy picker listing only the forms of the projects `GET /projects` returns for the caller (the server refuses any other with 404); the layout: from 1280 px four panes (library, outline, settings, preview), from 1024 px three panes with the preview and the public link as tabs beside the settings, from 768 px the outline with the settings in a drawer, below 768 px one pane with tabs (outline, preview); `PublicLinkPanel` (U6) mounts in the "পাবলিক লিঙ্ক" tab.
- **Tests:**
  - unit (RTL with MSW): the library ticks add a section and its fields to the outline; move up and down reorder by keyboard; the core fields show the lock and offer no remove; the draft is sent once after typing stops, with If-Match; a 422 puts the engine's message on the named field; a 412 shows "changed elsewhere" and reloads; leaving with a failed save asks first; a builder without `application.view_official_section` sees the notice and no save; without `form.build` the editing controls are absent and the outline is read-only; a copy from a form outside the caller's projects shows the not-found message and creates nothing; at phone width only labels and option texts are editable; another program's PM gets the not-found page; no axe violation.
  - existing: the setup screen is covered by `apps/web/src/admin/projects/setup/setup.test.tsx`; this unit adds the builder route only.
- **Done when:** the builder tests pass and a draft edited in the dev app reloads unchanged.
- **Depends on:** U1, U2
- **Size:** L
- **Risk area:** none
- **Status:** todo

### U4. Field settings, own questions, the condition and calculation editors
- **Goal:** every setting of a field and section is editable in the settings pane, with the own question, the condition rows and the calculation terms.
- **Requirements:** R4, R5, R6, R7
- **Files:** `apps/web/src/admin/forms/{SettingsPane,OwnQuestionDialog,OptionsEditor,ConditionEditor,CalculationEditor,RepeatSettings}.tsx`, `apps/web/src/admin/forms/settings.test.tsx`, `forms.json`.
- **Approach:** the field rows of `admin/projects/setup/ComponentDrawer.tsx` (labels in both languages, lists with move buttons); the editors render the rows of `logic-rows.ts` and `calc-terms.ts` (U1) and write back through `draft.ts`.
- **Tests:**
  - unit (RTL with MSW): an own question needs both labels and, for a choice, at least one option in both languages; a branching option names its earlier answer; a pattern is picked from the seven names only; a condition built of two rows with "any" is saved as the engine's JSON and shown again; a seeded deeper condition shows as read-only with its note; a total of three numbers and a repeat-group sum are built and saved; the age and nisab rules are offered for the right field types; a repeat group's minimum cannot pass its maximum; no axe violation.
- **Done when:** the settings tests pass.
- **Depends on:** U1, U3
- **Size:** L
- **Risk area:** none
- **Status:** todo

### U5. Preview, versions and publishing
- **Goal:** the PM sees the draft as volunteers and officials will, reads every version with its change summary, publishes and starts the next version.
- **Requirements:** R9, R10, R13
- **Files:** `apps/web/src/admin/forms/{PreviewPane,VersionList,ChangeSummary,PublishDialog}.tsx`, `apps/web/src/admin/forms/versions.test.tsx`, `forms.json`.
- **Approach:** the renderer of U2 in a phone-width or desktop-width frame with the language and audience switches (`SegmentedControl`); the list from `GET /forms/{id}/versions`, adjacent versions compared by `diff.ts`; publish through `ConfirmDialog` with the summary as its consequences; "make a new version" through `POST /forms/{id}/versions`.
- **Tests:**
  - unit (RTL with MSW): the preview switches to English and to the volunteer view, which drops the official-only section, and its answers are written neither to `sessionStorage` nor to the server; the version list shows version 2 as draft with its summary sentence and version 1 as published; a published version opens read-only with "make a new version"; publishing shows the summary and the note that earlier applications keep their version; a refused publish puts the message on the named field; without `form.publish` the publish action is absent; a 403 or 404 from publish or "make a new version" shows its message and changes nothing on the screen; no axe violation.
- **Done when:** the version tests pass.
- **Depends on:** U1, U2, U3
- **Size:** M
- **Risk area:** none
- **Status:** todo

### U6. The public link settings and the public application page
- **Goal:** a PM switches the link on with the form and copies the URL; anyone opens it on a phone, fills the form with photos and sends it, learning only that it was received.
- **Requirements:** R23, R24, R25, R26
- **Files:** `apps/web/src/admin/forms/PublicLinkPanel.tsx`, `apps/web/src/features/forms/PublicApplyPage.tsx`, `apps/web/src/features/forms/{public-api,public-upload}.ts`, `apps/web/src/features/forms/public.test.tsx`, `apps/web/src/routes/index.tsx`, `forms.json`.
- **Approach:** `features/auth/InvitePage.tsx` for a signed-out page (`AuthShell`, `DocumentTitle`, `ApiFailure`); the renderer of U2 with the public audience and the public upload adapter (compress, raw POST as `registration-api.ts` `uploadDraftPhoto`); the link through `PATCH /projects/{id}/public-link` and the `CopyButton` of `@css/ui`.
- **Tests:**
  - unit (RTL with MSW): the panel switches the link on with the form and shows a URL to copy, and off again; without `form.public_link.manage` the panel shows the link's state with no toggle; a 403 or 404 from the toggle shows its message and changes nothing; the page shows the project's name and closing date and the form; a closed link shows one page whatever the reason; a sixth photo, a too-large file and a wrong type show their messages; sending shows "received, an official will check it" and nothing about the person; a resend after a lost answer sends the same client id; a 429 says to try again later; the language switch redraws the form in English and back; no axe violation in bn and en.
  - integration: none new (the routes are proven by `apps/api/test/integration/public-forms.test.ts` and `public-photos.test.ts`).
- **Done when:** the public tests pass and the page works at 360 px in the dev app.
- **Depends on:** U2, U3
- **Size:** L
- **Risk area:** public page, personal data, file upload
- **Status:** todo

### U7. The setup screen leads to the builder
- **Goal:** the activation checklist's "a published application form" and the components step open the builder; the specs that are not about forms keep publishing by API.
- **Requirements:** R1
- **Files:** `apps/web/src/admin/projects/setup/{ProjectSetupPage,ReviewStep}.tsx`, `apps/web/src/admin/projects/setup/wizard-steps.ts`, `apps/web/src/admin/projects/setup/setup.test.tsx`, `apps/web/e2e/support/projects.ts` (comment of `publishLibraryForm`).
- **Approach:** the missing item becomes a link to `/admin/projects/:projectId/forms/:formId` (or the new-form dialog when none exists), as the other missing items link to their steps.
- **Tests:**
  - unit (RTL with MSW): the missing form item links to the builder of the project's form, and to the new-form dialog without one.
  - existing: covered by `apps/web/src/admin/projects/setup/setup.test.tsx` (its forms handler); update that file, no second test file.
- **Done when:** the setup tests pass.
- **Depends on:** U3
- **Size:** S
- **Risk area:** none
- **Status:** todo

### U8. The journey, the sweep and the documents
- **Goal:** the full journey is proven in the browser, the new screens are in the accessibility sweep, and every document names what was built.
- **Requirements:** R27, and the documents of all
- **Files:** `apps/web/e2e/form-builder.spec.ts`, `apps/web/e2e/a11y.spec.ts`, `docs/ui/SCREENS.md` (SCR-061, SCR-111), `docs/testing/TEST_STRATEGY.md`, `docs/BUSINESS_RULES.md` (register lines: BR-072 to BR-080, BR-083 to BR-085 and BR-087 gain the renderer, builder and E2E tests; BR-086 stays deferred to T2.5, whose signed-in form runs the lookup), `docs/STATUS.md`, `CLAUDE.md` (map: `features/forms`, `admin/forms`, `/apply/:token`).
- **Approach:** the steps of `apps/web/e2e/projects.spec.ts` and its helpers (`support/projects.ts`, `support/admin.ts` `signIn`, `apiAs` for the version check); the applicant on a 360 × 640 page as `gallery.spec.ts` sets it.
- **Tests:**
  - e2e (desktop, `pm.ucd@example.org`): on `/admin/projects/{id}/setup` the missing item "প্রকাশিত আবেদন ফর্ম" opens the builder; "নতুন ফর্ম" from the template "বিতরণভিত্তিক আবেদন ফর্ম"; tick the section "আর্থিক অবস্থা"; add an own question "আপনার কি নিজের ঘর আছে?" with options হ্যাঁ and না and a condition on it; a calculation "মোট" of two number fields; "প্রকাশ করুন" then confirm, and the version list shows "সংস্করণ 1: প্রকাশিত"; in "পাবলিক লিঙ্ক" switch on and copy the URL; on a new 360 × 640 page open the URL, fill every section, see the total change, send, and see "আবেদন পেয়েছি"; back in the builder "নতুন সংস্করণ", change an option, publish, and see "সংস্করণ 2: প্রকাশিত" with its summary; through the API the public entry's `formVersionId` is version 1's and the link now opens version 2. The exact Bengali labels are fixed in U2 to U6 with `ae-bangla-copy`; the spec uses them as written there.
  - e2e (a11y sweep): the builder (desktop) and the public page (mobile, bn and en) have no axe violation.
- **Done when:** the journey passes with `--repeat-each 3 --workers 1`, `pnpm docs:check` passes and the map names every new module.
- **Depends on:** U4, U5, U6, U7
- **Size:** M
- **Risk area:** none
- **Status:** todo

## Checkpoints
- **Mode:** grouped (one by one 7, grouped 16, all at once 1; N is over 4, so the one-by-one score was added to grouped)
- **Signals:** N 8, L 2,350, R 2, Fd 3, C 4, P 2
- **C1** after U1: foundation for U3, U4 and U5
- **C2** after U2: personal data in the tab and a new pattern (geolocation, the tab autosave); foundation for U5 and U6
- **C3** after U3: foundation for U4, U5 and U7, and a new pattern (the leave blocker)
- **C4** after U5: the files of U4, U5 and U6 together would pass 25 files since C3
- **C5** after U6: the public page, personal data and file upload
- **C6** after U8: the end, with the journey and the documents

## Verification
- `pnpm typecheck` · `pnpm lint` (incl. `css/no-literal-ui-text` and `pnpm i18n:check`) · `pnpm test` (the web project for the new screens; `apps/web/test/class-names.test.ts` and `template-boundary.test.ts`)
- `pnpm --filter @css/web build` then `pnpm --filter @css/web bundle:report` (first route under 250 KB)
- `pnpm e2e`, and the new spec alone with `--repeat-each 3 --workers 1`
- `pnpm docs:check` · `pnpm rules:status --phase 2 --report-only`
- The one API change (the library read's `formFields`): the api-db `forms.test.ts`, the drift test (`test/api/openapi-drift.test.ts`) and `pnpm --filter @css/api contract:coverage`; no database change.

## Risks and rollback
- **No migration, one additive API field**: the work is screens over the T2.3 API plus `formFields` on the library read, which no other caller reads; a rollback is reverting the commits.
- **Personal data in the tab**: answers sit in `sessionStorage` of one tab until sent or the tab closes; the key never holds the token; `lib/wipe.ts` clears it on logout; a test proves the answers are gone after sending.
- **Public page abuse**: the limits are the server's (T2.3); the page shows them and never retries a refused photo by itself.
- **The builder can lose an edit**: the autosave queues one save at a time, a stale version reloads with a notice, and leaving with a pending or failed save is held.

## Definition of done
- All units done and their tests pass
- Verification commands pass
- `ae-review` has run, with no open P0 or P1
- Code from abandoned attempts is removed

## Progress
- **Branch:** `feat/form-builder` (from `main` at c1f82e6, the T2.3 merge)
- **Updated:** 2026-10-22 13:00
- **Next:** U2 the renderer: tests first in `apps/web/src/features/forms/renderer.test.tsx`, then `FormRenderer` and its fields
- **Uncommitted:** none
- **Reviewed through:** C1 at the commit after e4fc09c (U1 and its fixes)
- **Notes:** C1 (T2, three reviewers): the change summary matched questions only inside sections both versions hold and ran one order check across the whole form, so moving a section listed every question in it as moved and a question taken into a new section showed as removed; questions are now matched by key over the whole form and moves are counted inside each section among the questions that stayed there; changed option texts, flags and order are a field aspect (`options`); the nisab shape is read only from the `nisab_value` setting; a chain of only minus terms is written as zero minus them; `addOwnQuestion` names no key when the section is missing. The scripted duplicate-code lead (the library section type in `draft.ts`) is a two-line type literal and stays. U1: the library read had no options for its fields (they come from the reference lists on the server), so the builder could not place a choice field; the owner approved in chat an additive `formFields` on `GET /form-library` (D-120 item 9), built with `fieldFromLibrary` and filled to the version read's shape (`settings: {}`, options with `dependsOnOptionCode: null` and `allowsOtherText: false`, which the route's field view needs). The pure modules sit in `apps/web/src/admin/forms/`: `draft.ts` (edits; core locks; a repeat group moves with its members, a member only inside its group), `logic-rows.ts`, `calc-terms.ts` (a chain writes its pluses first and subtracts its minuses after them, as `sub` folds left), `diff.ts` (moves by the longest run kept in order, so a swap of two neighbours may name either). The owner started the implementation on 2026-10-22 after T2.3 merged ("শুরু করুন"); the owner asked that no next task (T2.5) starts without a new command.
