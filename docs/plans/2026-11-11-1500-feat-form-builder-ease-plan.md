---
title: An easier form builder
type: feat
status: ready
source: plan
date: 2026-11-11
doc_review: 2026-11-11
---

# An easier form builder

## Goal
A person with little technical skill builds and updates a form without getting stuck: a question is added where they work without a dialog, a mistake is undone, a save or publish problem says what to fix and where, the identity questions come in one click, and the form itself has the most room on the screen.

## Problem
The builder of T2.4b (D-122) is sound underneath (pure tested edits, one change funnel, real inputs on the canvas, rules as sentences), but a review of the code and a walk through it on 2026-11-11 found where people stop:
- every question is added through a dialog that demands Bengali and English at once, every option too, and lands at the end of the part;
- "add a question to this part" adds nothing; a new library question is neither selected nor shown;
- a part is deleted in one click with no way back; undo covers only the last removed question; a row question of a repeat group cannot be removed alone; deleting a question silently breaks the rules that used it;
- a label emptied for retyping, a new empty option or a help text in one language stops the whole draft from saving, shown only as a small grey "not saved"; a failed save is never tried again;
- publish asks for confirmation first and refuses afterwards; a question's problem shows only inside that question and is wiped by the next edit;
- a new beneficiary application form opens empty, yet cannot be published before seven identity questions are built and marked one by one;
- the canvas is the narrowest column; at 1024 px the question bar overlaps; drag shows no landing line; several words are hard ("লেবেল", "পরিচয়-চিহ্ন", "ডিফল্ট মান").

## Requirements
- **R1** The decisions are in the decision log before the code: the owner's two (English texts are due at publish, not while building; a draft saves with incomplete texts and every check runs at publish) with the owner's words, and the team's design decisions of this plan.
- **R2** A draft saves with a text missing in one or both languages (a question's label, a help text, an option, a part's title, a table's row or column); publishing refuses a form with any text missing in either language, naming each place; a draft shown in the preview falls back to the other language.
- **R3** Every change to a draft can be undone and redone (buttons and Ctrl+Z / Ctrl+Y outside a text field), typing in one field counting as one step.
- **R4** Deleting is safe: a deleted part comes back with undo; a row question of a repeat group is removed or copied on its own; deleting a question that a condition, a calculation, a default, a count or an inserted answer uses names those uses first and removes them with it.
- **R5** A failed save is tried again by itself and when the network returns, shows a visible status with a retry button, and leaving the page saves first instead of discarding.
- **R6** What stands between the draft and publishing is listed beside the Publish button at all times, each line leading to its question; Publish does not ask for confirmation while the list has entries; a refusal of the server lands in the same list.
- **R7** Adding a question needs no dialog: it lands after the selected question (or at the end of the chosen part), is selected, scrolled into view and its Bengali text field focused; "add a question here" opens the question types at that place; a question moves to another part by a button.
- **R8** A beneficiary application form gets its identity questions, marked, in one click.
- **R9** Options are quick to write: one row per option, Enter makes the next, several pasted lines become several options, and "yes / no" is one click.
- **R10** One view lists every text of the form in both languages and shows what is missing.
- **R11** The canvas has the most room; the side panes can be folded; under 1024 px the settings open as a drawer; no control overlaps at 1024 px.
- **R12** A drag shows where the question will land, and its announcements are in the user's language.
- **R13** The builder's words are ones a non-technical person understands, one word per idea, in both languages.
- **R14** A keystroke in a long form (100 questions) re-renders one question, not the canvas.

## Scope
- In: the builder in `apps/web/src/admin/forms/` (project forms, ready forms, the question library), the draft and publish checks of `packages/shared/src/forms/`, the draft save and publish of the API, their documents.
- Out (the owner said not needed, 2026-11-11): a tracking code and public status page, save and resume of a public form, form analytics, a page break, a "contains" operator.
- Out (not now): the phone builder stays text-only (setup screens are desktop first); the choice between "mine" and "latest" on a stale version (the reload stays); dragging parts and options; a control for `placeholder`; renaming a form inside the builder; the answering side (`FormRenderer`) beyond the fallback of R2.

## Key decisions
- **English at publish, not while building** (owner, 2026-11-11: "তোমার সিধান্ত মেনে নিলাম", on the proposal "বানানোর সময় শুধু বাংলা দিলেই চলবে, publish-এর আগে ইংরেজি পূরণ করতে হবে"): both languages stay first-class (constitution section 11); only the moment the second one is demanded moves.
- **A draft saves incomplete** (owner, same message, on "draft-এ ফাঁকা লেখা মেনে নেওয়া হোক, আর সব পরীক্ষা হোক publish-এর সময়"): a change of the draft save's contract.
- **Steps 1 and 2 first, then the design** (owner: "১ আর ২ একসাথে, তারপর ৩"): units U1 to U10 are one pull request, U11 to U14 a second.

## Technical decisions
- **Stack profile** (ST-40 to ST-45): unchanged. No new dependency: `@dnd-kit` (already in the builder's chunk), react-hook-form and zod are in place. The builder stays a lazy chunk; the first route's budget (400 KB, D-154) is checked, not expected to move.
- **One validator, one stored shape**: `packages/shared/src/forms/definition.ts` validates the draft save and the publish; `packages/shared/src/jsonb/form-logic.ts` holds the looser shape of the stored columns (its table and result labels are optional already). U2 confirms which schema reads a stored definition back and pins the two together with a test, so a draft the save accepted is always readable.
- **Leniency lives in the shared engine** (ST-07: the backend's schema is the source of truth): `label()` of `packages/shared/src/forms/definition.ts` accepts empty strings; `checkDefinition(..., { publishing: true })` reports `form.label_language` (the existing code and message) for every text missing a language, with the path of its place. Reference checks, cycles and key rules stay strict in drafts. Published versions are complete already and immutable, so no migration and no change to stored data.
- **Fallback when reading a draft**: no applicant path reads a draft: the public link, the creation of an application, the exports and the answer list take published (or retired) versions only, whose texts are complete. A draft is drawn only in the builder (the canvas, the preview, the sentences, the change summary, the lists), and those print a text with `localized()` of `@css/shared/i18n`, which already falls back to the other language. The answering screens need no change.
- **History without an API change**: the draft is one immutable object and every edit goes through `change()` of `FormBuilderPage.tsx`, and a save sends the whole definition, so undo is "set the earlier draft and schedule a save". A new hook `use-draft-history.ts` keeps past and future stacks of `{ definition, selection }` (capped at 100), merges changes under a second apart with the same selection, ignores the server's echo after a save, and empties on a version switch or a stale reload.
- **A key never comes from a text**: today a question's key is a slug of its English label (`draft.ts`), and an option's code is made beside it; with English optional at creation a key would become `q`, `q_2`. From U7 a new or copied question takes `q_` plus six random letters and digits, from U9 a new option takes its code the same way: unique in the form, never shown, never reused for another question in a later version (exports match questions across versions by key). Existing keys stay as they are.
- **Uses of a question are pure data**: `usesOf(definition, fieldKey)` and `removeFieldWithUses` join the pure edits of `draft.ts`, tested like the rest.
- **Identity questions come from the library** (`GET /form-library`, seeded in `apps/api/seed/sets/base/forms.ts`): the one click adds the library's question of each missing identity role, so their texts are the department's own and bilingual; a role the library lacks is added as an empty question of the right type with its mark, to be worded by the user.
- **Problems are computed, not remembered**: the publish list is `checkDefinition(draft, { publishing: true, kind })`, memoised on the draft object (pure, shared with the server), joined with the last refusal of the server; nothing is wiped by an edit, an entry leaves when its cause does.
- **Design inside the asf system** (D-150, RE-UI-01 to RE-UI-05): pages import only `@/ui`; layout in `builder.css` on the page tokens; no new colour; the axe sweep and the 360 px rule keep passing. Bengali and English copy goes through `ae-bangla-copy`.
- **Tests first where behaviour changes** (TS-24): `draft.test.ts`, `builder.test.tsx`, `settings.test.tsx`, `versions.test.tsx` and the E2E helper `apps/web/e2e/support/forms.ts` (`ownQuestion`) cover today's flows; they are updated, not duplicated.

## Implementation units

### U1. The decision and the rules
- **Goal:** the decisions and the changed rules are written down before code.
- **Requirements:** R1
- **Files:** `docs/DECISION_LOG.md` (D-171), `docs/BUSINESS_RULES.md` (the form rules on bilingual texts and draft checks), `docs/ui/SCREENS.md` (the form builder section)
- **Approach:** as D-169 was recorded: the owner's words quoted, the team's decisions with reasons.
- **Tests:**
  - existing: `pnpm docs:check`.
- **Done when:** D-171 names the two owner decisions and the scope; the rule register says texts are due at publish.
- **Depends on:** none
- **Size:** S
- **Risk area:** none
- **Status:** done

### U2. Drafts save incomplete; publishing demands every text
- **Goal:** the engine and the API accept a draft with missing texts and refuse a publish with any.
- **Requirements:** R2
- **Files:** `packages/shared/src/forms/definition.ts` (+ `definition.test.ts`), `packages/shared/src/jsonb/` (the stored definition's schema, if it repeats the rule), `apps/api/src/services/forms.ts`, `ready-forms.ts`, `form-library.ts` (draft save and publish paths), `apps/api/test/integration/forms*.test.ts`, the readers of form texts on the API side (`apps/api/src/exports/{questions.ts,service.ts,pdf/application.ts}`, `apps/api/src/jobs/export-run.ts`, `apps/api/src/applications/{submission.ts,service.ts}`: read only, see the test below), `packages/shared/src/i18n/messages/{bn,en}/errors.json` (the message of `form.label_language` no longer says "label"), `docs/api/openapi.yaml` and the route schemas of `apps/api/src/routes/forms.ts` if they state a minimum length, `apps/web/src/admin/forms/{sentences.ts,diff.ts,form-summary.ts,candidates.ts}` and `apps/web/src/features/forms/` where a text is printed without `localized()`, `docs/architecture/` or `docs/api/API_STANDARDS.md` where the draft rule is described
- **Approach:** `calculation_missing` is already a publish-only check in `checkDefinition`; texts follow it. Example of the fallback: `localized()` in `packages/shared/src/i18n/bilingual.ts`.
- **Tests:**
  - unit: a draft with an empty English label, an empty option, a one-language help text and an empty part title passes `formDefinitionSchema`; `checkDefinition(publishing)` reports `form.label_language` with the path of each (label, help, option, part title, table row and column, calculation result); a text of only spaces counts as missing; a dangling reference is still refused in a draft.
  - integration: `PATCH /form-versions/{id}` with an empty English label answers 200 and stores it; `POST …/publish` answers 422 with a detail per missing text; a complete form publishes as before; another program's PM is still refused (403) on both; a draft version is offered to no applicant path (the public link, the creation of an application and the export of questions answer as today for a form whose only version is a draft with missing texts); the OpenAPI drift test and the contract recorder pass.
  - existing: covered by `definition.test.ts`, the forms integration tests; updated, not duplicated.
- **Done when:** the tests above pass; `pnpm --filter @css/api contract:coverage --no-run` stays complete.
- **Depends on:** U1
- **Size:** M
- **Risk area:** API contract
- **Status:** done

### U3. Undo and redo of every change
- **Goal:** a history of the draft with buttons and keys.
- **Requirements:** R3
- **Files:** `apps/web/src/admin/forms/use-draft-history.ts` (new, + test), `FormBuilderPage.tsx`, `builder.test.tsx`, `packages/shared/src/i18n/messages/{bn,en}/forms.json`
- **Approach:** no existing example in the repo (a new pattern); replaces the one-step undo of a removal in `FormBuilderPage.tsx`. Buttons in the header: "ফিরিয়ে আনুন" and "আবার করুন".
- **Tests:**
  - unit: undo then redo returns the same definition and selection; typing three letters within a second is one step; a new change clears the redo stack; the server's echo adds no step; the stack is capped; a version switch empties it.
  - component: remove a question, add another, press "ফিরিয়ে আনুন" twice: both are back and a save is scheduled; Ctrl+Z inside a text field leaves the field's own undo alone; the buttons are disabled with nothing to undo or redo.
  - e2e: `apps/web/e2e/form-builder.spec.ts`: on `/admin/ready-forms/:id`, delete a question, press "ফিরিয়ে আনুন", the question is back and the status reads "সংরক্ষিত".
  - existing: the removal-undo cases of `builder.test.tsx`; updated.
- **Done when:** the tests pass; no change is left outside the history.
- **Depends on:** none
- **Size:** M
- **Risk area:** none
- **Status:** todo

### U4. Safe deleting
- **Goal:** parts, row questions and used questions are deleted without surprises.
- **Requirements:** R4
- **Files:** `apps/web/src/admin/forms/{draft.ts,draft.test.ts,candidates.ts,FormCanvas.tsx,RepeatSettings.tsx,FormBuilderPage.tsx}`, a small `UsesDialog.tsx` (new: the contract's `Dialog` with the list of uses in its body), `builder.test.tsx`, `forms.json`
- **Approach:** the question bar of a head row (`FormCanvas.tsx`) is the example for the row question's bar; the dialogs of `admin/forms` (the contract's `Dialog` with its actions) are the example for `UsesDialog.tsx`.
- **Tests:**
  - unit: `usesOf` finds a question used by a show condition, a required condition, a calculation, a count source, an options dependency and an inserted answer; `removeFieldWithUses` leaves a definition that passes the draft schema; removing a row question keeps the group.
  - component: deleting a part then "ফিরিয়ে আনুন" restores it with its questions; a row question has "সরান" and "কপি"; deleting a used question opens a dialog listing "যেখানে ব্যবহার হচ্ছে" with each question's name, and confirming removes both.
  - existing: `draft.test.ts`; extended.
- **Done when:** no delete leaves a dangling reference; every delete is one undo away.
- **Depends on:** U3
- **Size:** M
- **Risk area:** none
- **Status:** todo

### U5. A save that tries again and says so
- **Goal:** saving survives a bad network and never loses work silently.
- **Requirements:** R5
- **Files:** `apps/web/src/admin/forms/{use-draft-save.ts,FormBuilderPage.tsx}`, `versions.test.tsx` or a new `use-draft-save.test.tsx`, `forms.json`
- **Approach:** the retry with backoff of `apps/web/src/lib/uploads.ts` is the example; the status sits in the form head as today, in the error tone with a "আবার চেষ্টা করুন" button.
- **Tests:**
  - component (fake timers, MSW): a failed save is retried after its backoff and succeeds; an `online` event retries at once; the status shows "সংরক্ষণ হয়নি" with "আবার চেষ্টা করুন", and the button saves; leaving with a pending change sends the save before the route changes, and asks only when that save fails; a 412 still reloads with its message.
  - existing: the save cases of `versions.test.tsx` and `builder.test.tsx`; updated.
- **Done when:** the tests pass.
- **Depends on:** none
- **Size:** M
- **Risk area:** none
- **Status:** todo

### U6. The list of what to fix before publishing
- **Goal:** publishing problems are visible while building and lead to their place.
- **Requirements:** R6
- **Files:** `apps/web/src/admin/forms/PublishChecklist.tsx` (new), `FormBuilderPage.tsx`, `FormCanvas.tsx` (scroll to and select a question), `use-draft-save.ts` (`detailsOf` keeps every message of a path), `builder.test.tsx`, `forms.json`
- **Approach:** `checkDefinition` is pure and exported; the messages are the errors catalogue's (`useTranslations('errors')`), as `lib/form-schema.ts` words them. The list is a popover under a button "প্রকাশের আগে ঠিক করুন (n)" beside Publish.
- **Tests:**
  - component: a form with a question without an English text and without its identity questions shows the button with its count; the list names each problem with its question and words it by its place ("প্রশ্নের ইংরেজি লেখা বাকি", "অপশনের ইংরেজি লেখা বাকি", "অংশের নাম বাকি"), not with the catalogue's one sentence; a click selects the question and scrolls it into view; fixing one lowers the count without pressing Publish; Publish with entries opens the list instead of the confirmation; with none it confirms and publishes; a refusal of the server not in the local list appears in it.
  - e2e: `form-builder.spec.ts`: a new beneficiary form with one question typed in Bengali only shows "প্রকাশের আগে ঠিক করুন" with its count, the list names the missing identity questions and the missing English text, and a click on that line selects the question. (The journey goes on to add the identity questions in U8 and to fill the texts and publish in U10.)
  - existing: the publish cases of `builder.test.tsx` and `versions.test.tsx`; updated.
- **Done when:** no publish refusal is shown only inside a question; the tests pass.
- **Depends on:** U2, U5
- **Size:** M
- **Risk area:** none
- **Status:** todo

### U7. Adding and moving without detours
- **Goal:** a question is added in place with one click and moved by a button.
- **Requirements:** R7
- **Files:** `apps/web/src/admin/forms/{AddPane.tsx,FormCanvas.tsx,FormBuilderPage.tsx,SettingsPane.tsx,draft.ts,draft.test.ts,OwnQuestionDialog.tsx (removed),RowButtons.tsx}`, `builder.test.tsx`, `ready-forms.test.tsx`, `apps/web/e2e/support/forms.ts` (`ownQuestion`), `apps/web/e2e/{form-builder,form-logic}.spec.ts`, `forms.json`
- **Approach:** `addOwnQuestion` of `draft.ts` gains "after this question" and makes the key without the text (Technical decisions); the type tiles of `AddPane.tsx` are reused in a menu (`@/ui` `Menu`) for "এখানে প্রশ্ন যোগ করুন"; the new question's Bengali text field takes focus (a ref handed to `SettingsPane`). The empty library says it is empty, not "no question by this name".
- **Tests:**
  - unit: a question added with another selected lands right after it; with a part selected, at its end; into a repeat group's rows when a row is selected; a new and a copied question take a key of the form `q_` plus six letters or digits, different each time and never a slug of the text.
  - component: a click on "ছোট লেখা" adds a question with no dialog, selected, with focus in "প্রশ্নের লেখা (বাংলা)"; "এখানে প্রশ্ন যোগ করুন" opens the types and adds there; a library question added is selected; "অন্য অংশে নিন" lists the other parts and moves the question; an empty library says "লাইব্রেরিতে এখনো কোনো প্রশ্ন নেই".
  - e2e: `form-builder.spec.ts` at 1280 px: on a ready form, click "ছোট লেখা", type the Bengali text, the canvas shows it; click "অন্য অংশে নিন" → "অংশ 2", the question is under "অংশ 2". The existing journeys (build, publish, public link at 360 px; the demo form's logic) pass through the changed helper.
  - existing: the add cases of `builder.test.tsx`; the dialog's cases move to the inline flow.
- **Done when:** `OwnQuestionDialog.tsx` is gone and nothing imports it; the tests pass.
- **Depends on:** U2, U4
- **Size:** L
- **Risk area:** none
- **Status:** todo

### U8. The identity questions in one click
- **Goal:** a beneficiary application form gets its seven identity questions without building them.
- **Requirements:** R8
- **Files:** `apps/web/src/admin/forms/{draft.ts,draft.test.ts,PublishChecklist.tsx,FormCanvas.tsx (the start card),FormBuilderPage.tsx}`, `builder.test.tsx`, `forms.json`
- **Approach:** `addLibrarySection`/the library add of `draft.ts` are the example; the roles are `CORE_FIELDS` of `packages/shared/src/forms/core.ts`. The button "পরিচয়ের প্রশ্নগুলো যোগ করুন" sits on the empty form's start card and on the list's identity line.
- **Tests:**
  - unit: on an empty beneficiary form the edit adds one question per identity role, marked, from the library where it has one; roles already marked are not added twice; a form of the kind "other" gets nothing.
  - component: the button adds the questions, the list's identity line disappears, and one undo takes them all away.
  - e2e: `form-builder.spec.ts`, the journey of U6 goes on: "পরিচয়ের প্রশ্নগুলো যোগ করুন" adds the questions and the identity line leaves the list.
  - existing: the identity cases of `settings.test.tsx`; kept.
- **Done when:** a new beneficiary form reaches "no identity problem" in one click.
- **Depends on:** U6
- **Size:** S
- **Risk area:** none
- **Status:** todo

### U9. Quick options
- **Goal:** writing a list of options takes one line each.
- **Requirements:** R9
- **Files:** `apps/web/src/admin/forms/{OptionsEditor.tsx,RowButtons.tsx,builder.css}`, `settings.test.tsx`, `forms.json`
- **Approach:** the rows of `ConditionEditor.tsx` (one line, icon buttons with names) are the example; "other text" and "depends on" move into a row menu.
- **Tests:**
  - component: each option is one row with Bengali and English side by side; Enter in a row adds the next and focuses it; pasting three lines makes three options; "হ্যাঁ / না বসান" fills an empty list with the two in both languages; the icon buttons carry the option's name ("অপশন 2 সরান"); an option with only Bengali saves in a draft; a new option's code does not come from its text.
  - existing: the options cases of `settings.test.tsx`; updated.
- **Done when:** eight options fit one screen of the settings pane at 1280 px; the tests pass.
- **Depends on:** U2
- **Size:** M
- **Risk area:** none
- **Status:** todo

### U10. The translations view
- **Goal:** every text pair of the form in one table.
- **Requirements:** R10
- **Files:** `apps/web/src/admin/forms/TranslationsDialog.tsx` (new, + cases in `builder.test.tsx`), `draft.ts` (a pure `textsOf(definition)` and `setText`), `draft.test.ts`, `FormBuilderPage.tsx`, `PublishChecklist.tsx`, `forms.json`
- **Approach:** the contract's `Dialog` and `Table`; rows grouped by part; a filter "শুধু বাকি".
- **Tests:**
  - unit: `textsOf` lists part titles, question texts, help texts, options, table rows and columns and calculation results with their paths; `setText` changes exactly one.
  - component: the header button "অনুবাদ" opens the table; the count of missing texts matches the list of U6; typing an English text fills it in the draft (one undo step per field); "শুধু বাকি" hides the complete rows; the list's "ইংরেজি লেখা বাকি" line opens the dialog.
  - e2e: `form-builder.spec.ts`, the journey ends here: "অনুবাদ" opens the table, the missing English texts are typed, the button "প্রকাশের আগে ঠিক করুন" is gone and "প্রকাশ করুন" publishes version 1.
- **Done when:** a form built in Bengali only becomes publishable from this one view.
- **Depends on:** U2, U6
- **Size:** M
- **Risk area:** none
- **Status:** todo

### U11. Room for the form
- **Goal:** the canvas is the widest column and nothing overlaps.
- **Requirements:** R11
- **Files:** `apps/web/src/admin/forms/{builder.css,FormBuilderPage.tsx,AddPane.tsx,SettingsPane.tsx,FormCanvas.tsx}`, `apps/web/e2e/screens.spec.ts` (the builder's pictures), `builder.test.tsx`, `docs/ui/SCREENS.md`, `forms.json`
- **Approach:** the page tokens of `apps/web/src/styles/tokens.css`; the contract's `Drawer` for the settings under 1024 px, as `admin/projects/setup/ComponentDrawer.tsx` uses it; fold buttons on both side panes, the choice kept per device in `localStorage` (a convenience only).
- **Tests:**
  - component: each side pane folds and opens, the choice survives a remount; under 1024 px selecting a question opens the settings as a drawer.
  - e2e: `screens.spec.ts` takes the builder at 1280, 1024 and 768 px in light and dark; `a11y.spec.ts` passes on the builder; at 1024 px the question bar's buttons do not overlap its type name (their boxes do not intersect).
  - existing: the layout cases of `builder.test.tsx`.
- **Done when:** at 1280 px the canvas is wider than either side pane; the pictures are checked by eye.
- **Depends on:** none
- **Size:** M
- **Risk area:** none
- **Status:** todo

### U12. A drag that shows its landing
- **Goal:** the person sees and hears where a question will land.
- **Requirements:** R12
- **Files:** `apps/web/src/admin/forms/{FormCanvas.tsx,drop-target.ts,drop-target.test.ts,builder.css}`, `builder.test.tsx`, `forms.json`
- **Approach:** dnd-kit's own `DndContext` `accessibility.announcements` and a line drawn from the `over` item and the pointer's half, in `FormCanvas.tsx` where `CanvasDnd` lives.
- **Tests:**
  - unit: a drop on the lower half of a question lands after it, on the upper half before it, on a part's empty end at its end.
  - component: while a question is dragged over another, a line marks the landing place; the announcements use the questions' names in the active language ("… অংশ 1-এ তৃতীয় স্থানে বসবে").
  - existing: `drop-target.test.ts`, the keyboard move cases; kept.
- **Done when:** the tests pass; the keyboard alternative still works.
- **Depends on:** none
- **Size:** M
- **Risk area:** none
- **Status:** todo

### U13. Plain words
- **Goal:** the builder's texts are simple and consistent in both languages.
- **Requirements:** R13
- **Files:** `packages/shared/src/i18n/messages/{bn,en}/forms.json`, the tests and E2E specs that name the changed labels, `docs/ui/SCREENS.md`
- **Approach:** `ae-bangla-copy`; the word list of the review: "লেবেল" → "প্রশ্নের লেখা", "পরিচয়-চিহ্ন" → a plain phrase, "ডিফল্ট মান" → "আগে থেকে বসানো উত্তর", one word for the score, "অপশন" everywhere, "হয়ে গেছে" → "ঠিক আছে", the condition editor's field names as a sentence.
- **Tests:**
  - existing: `pnpm i18n:check` (parity, unused keys); the component tests and E2E specs follow the new labels.
- **Done when:** no key of the review's word list keeps its old text; the checks pass.
- **Depends on:** none
- **Size:** S
- **Risk area:** none
- **Status:** todo

### U14. A long form stays quick
- **Goal:** typing in one question does not redraw the others (the review found no `memo` in the builder: a keystroke redraws every part, every question row and every real input of the canvas).
- **Requirements:** R14
- **Files:** `apps/web/src/admin/forms/{FormCanvas.tsx,FormBuilderPage.tsx}`, a render-count case in `builder.test.tsx`
- **Approach:** `memo` on the part card and the question row with callbacks that take keys (the draft already shares structure and keys are stable).
- **Tests:**
  - component: in a form of 100 questions, typing in one question's text renders that question's row once per keystroke and no other row (a render counter in the test).
  - existing: every canvas case of `builder.test.tsx` stays green.
- **Done when:** the test passes.
- **Depends on:** U7, U12
- **Size:** S
- **Risk area:** none
- **Status:** todo

## Checkpoints
- **Mode:** grouped (one by one 0, grouped 14, all at once 0; one by one scored 3, moved to grouped since N is over 4)
- **Signals:** N 14, L 1950, R 1, Fd 2, C 4, P 1
- **C1** after U2: the contract change (risk), and the foundation of U6, U7, U9 and U10
- **C2** after U3: a new pattern (the history) that U4 builds on
- **C3** after U6: foundation of U8 and U10
- **C4** after U10: the end of the first pull request (the owner asked for steps 1 and 2 before the design); 750 lines since C3
- **C5** after U14: end

## Verification
- `pnpm typecheck`, `pnpm lint`, `pnpm docs:check`
- `pnpm test` (shared, API unit, database project with a SeaweedFS for the storage test, web)
- `pnpm --filter @css/api contract:coverage --no-run`; the OpenAPI drift test
- `pnpm e2e` (at least `form-builder.spec.ts`, `form-logic.spec.ts`, `a11y.spec.ts`, `screens.spec.ts`, `exports.spec.ts`), and the web contract test
- `pnpm --filter @css/web build` and `pnpm --filter @css/web bundle:report`
- by eye: the builder at 1280, 1024 and 768 px, light and dark, in the review database

## Risks and rollback
- **The draft contract** (U2): an older web build sends complete texts, which the new API accepts, so the API deploys first or together; rolling back the API with incomplete drafts stored would make those drafts unreadable to the old strict schema, so a rollback of U2 after use needs the drafts completed first (the translations view) or the lenient read kept.
- **The helper of the E2E journeys** (U7): `ownQuestion` is used by the form journeys; it changes with the flow in the same unit, and the full E2E runs before each pull request.
- **Copy changes** (U13) rename visible labels the tests name; they change together.

## Definition of done
- All units done and their tests pass
- Verification commands pass
- `ae-review` has run, with no open P0 or P1
- Code from abandoned attempts is removed

## Progress
- **Branch:** `feat/form-builder-ease`
- **Updated:** 2026-11-11 11:50
- **Next:** checkpoint C1 (U2), then U3
- **Reviewed through:** C1 at the commit after 25aaffcb (T2, three reviewers: no draft reaches an applicant, an export or a published version by any path; fixed: an inserted answer in a draft's preview now falls back to the other language like every other text, the length refusal's test names its code, a test draws one-language options and table names; left: a publisher without the official view is told the keys of an official-only part's missing texts (the path named them before; the two global roles hold the publish), and a help text emptied in both languages is stored as an empty pair)
- **Uncommitted:** none
- **Notes:** The plan review asked for: the real name of the add function, the statement that no applicant path reads a draft, the API-side readers of form texts named in U2 with a test, the E2E journey split across U6, U8 and U10 instead of U6 waiting for U8, a key that never comes from a text, the missing dependencies (U6 on U5, U7 on U4, U14 on U7 and U12), the publish list worded by place and memoised, and the one validator named; all are in the plan. Kept against its advice: U14 (the code review found the cause) and U10 (the owner accepted the translations view). U1: the rule register already let a draft wait for its translations (BR-245, O-43); the form engine was stricter than the rule, so U2 brings the engine to the rule rather than changing it; the screen inventory is updated with the units that change the screen (U11, U13). U2: a stored definition is read back by the engine's own schemas (`fieldSettingsSchema` and `fieldLogicSchema` of `packages/shared/src/forms/definition.ts`, in `readDefinition` of `apps/api/src/services/forms.ts`), the same that check the save, so `label()` was the one place to relax and a test pins the two; `packages/shared/src/jsonb/form-logic.ts` only mirrors the column's JSON Schema, reads nothing, and its settings shape does not know `score` (an older gap, left as it is). A 422 detail carries only a path, a code and a sentence, so the publish refusal keeps the question's key as its path and sends the place of each missing text in `params` (`text`, `language`, and the option, row, column or result), which made `form.label_language` a code with public parameters (API_STANDARDS section 8). One issue per text and language, as the schema gave before; a help text or placeholder empty in both languages counts as none; a text over its length still answers `form.label_language`, because zod puts the string's one message on every issue of that string.
