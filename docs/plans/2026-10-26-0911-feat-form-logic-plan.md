---
title: Kobo-like form logic (T2.4d)
type: feat
status: in-progress
source: brainstorm
date: 2026-10-26
doc_review: 2026-10-26
---

# Kobo-like form logic (T2.4d)

## Goal
The Monitoring Team can build the department's real application forms, such as the self-reliance form (the owner's demo at https://rajuofficialasf-hub.github.io/self-reliance-demo-form/ and the Kobo XLSForm SRP-26), in the form builder without code. The forms work the same way for the volunteer on a phone and on the server: the gold price by karat, total assets, the poverty class, rows that follow the family size, a question that opens when spending is above income, and a table of livestock counts.

## Problem
Today the engine has conditions against a fixed value, sums and simple arithmetic shapes, and the builder edits only a few fixed calculation shapes. The department's forms (SRP-26, the demo) need if/then/else values, long formulas with brackets, defaults, read-only values, rows that follow a count, conditions comparing two answers, labels that repeat an earlier answer and a table of number cells. Without them these forms stay in Kobo and Google Forms.

## Requirements

### Calculations (D-128 item 1)
- **R1** A calculation can give a value by condition: "যদি <condition> তবে <value>, নইলে <value>", nested to any depth, where a value is a number, a formula or a bilingual text (e.g. "Above Poverty Line" / its Bengali). SRP-26's gold and silver price by karat, `zakat_status` and the two poverty statuses can be built this way.
- **R2** A formula can join any number of terms with + − × ÷ and brackets; a term is an answer, a number, another calculation, or the sum over a group's rows. An empty or hidden answer counts as 0 (as Kobo's `coalesce(…, 0)`); a division by 0 gives no value, shown as empty, never an error or an infinite number. SRP-26's `total_assets`, `equiv_adults`, `poverty_threshold`, `net_wealth` and `yearly_income` can be built this way.
- **R3** A calculation can be rounded to 0 to 4 decimals (SRP-26's `round(x, 2)`), set in the builder.
- **R4** The phone and the server compute the same values from the same definition; the server recomputes every calculation when it saves an application and never keeps a value the client sent for a calculated question.
- **R5** In the builder a calculation is made by clicking: rows read as a sentence (question, number, sign, a bracket group, a "যদি … তবে … নইলে" step), and the whole calculation reads back as one sentence in Bengali and in English. A "সূত্র লিখুন" mode takes a typed formula that names questions, shows it back as the same sentence, and refuses an unknown question or a malformed formula with a message saying where. A typed formula and a clicked one are the same calculation afterwards.

### Defaults and read-only questions (D-128 item 2)
- **R6** A question can have a default value: today's date (a date question), a fixed text (e.g. a number's prefix) or a number. The filler sees it filled in and may change it unless the question is read-only.
- **R7** A question can be read-only: its value comes only from its calculation or its default. The volunteer, the office and a public-link visitor cannot change it, and the server sets it itself whatever the client sent.

### Rows, counts, comparisons and labels (new, owner in chat 2026-10-26)
- **R8** A repeat group's number of rows can follow a number answer ("পরিবারের সদস্য সংখ্যা"): entering 5 gives 5 rows; lowering the number removes the extra rows, asking first when a removed row holds answers; the server refuses a group whose rows do not match the number.
- **R9** A calculation can count the rows of a group that meet a condition (e.g. the earners: members whose monthly income is above 0), beside the existing sum over rows.
- **R10** A condition (show, require) can compare an answer with another answer or a calculation (e.g. show "আয়ের চেয়ে ব্যয় বেশি হওয়ার কারণ" when the monthly spending is greater than the total family income), not only with a fixed value.
- **R11** A question's text or help can repeat an earlier answer (e.g. "কতটি {খামারের ধরন} পালন করতে চান?" reads "কতটি গরু পালন করতে চান?"), in the filler's language for a choice; while that answer is empty the text reads naturally without it (the builder sets the wording for that case).
- **R12** A number table question: bilingual row labels (e.g. গরু, ছাগল, মহিষ, ভেড়া) and column labels (e.g. নিজের, বর্গা), each cell a whole number of 0 or more; shown as a table on a desktop and readable without sideways scrolling at 360 px; each cell can be used in calculations and conditions (e.g. total cows = own + sharecropped).

### Everywhere
- **R13** Every new setting is checked when a form is published (unknown questions, a cycle between calculations, a type mismatch such as text in a sum, a row count that is not a number question) with a message naming the question; a published version never changes, and applications on an older version keep evaluating as before.
- **R14** The office's review shows calculated and read-only values as the filler saw them; the official section and the visibility rules of T2.3 apply to the new settings and question type as to the others.
- **R15** The owner's demo form can be built in the builder with all its behaviour (the show and hide rules, "অন্যান্য", the age, the family rows from the count with the earners and the total income, the deficit question, the house and toilet branches, the livestock table, the gold and silver price by karat, the project branches with the livestock count label, the loan part, the attestation) and filled at 360 px; an end-to-end test proves it.

## Scope
- In: the engine (`@css/shared/forms`), its schemas and checks, the server's recompute and checks, the renderer, the builder's settings and the new calculation editor, the new number table question, the documents.
- Out (not now): the names and mobiles of the assigned people placed by the system (D-128 item 3, withdrawn by the owner: who sent, approved or paid an application is already traced in its steps and the audit log); an own regular expression or error message per question; images in a note; an "English only" text check; a unit after a shown value ("টাকা", "জন"); gold and silver prices from an admin setting (they stay numbers in the form's calculation, so a price change is a new version of the form); a clickable mockup before the code (the owner chose to go straight to code); Kobo import.

## Key decisions
- **D-128 item 3 withdrawn**: the system traces who sent, approved and paid an application, so no assigned names are placed in the form. Removes the planned assignment lookup.
- **The demo's extras join T2.4d** (owner, 2026-10-26): rows from a count (D-124 (3) approved), a count of rows by condition, comparing two answers, an earlier answer in a question's text, and the number table. Governs R8 to R12.
- **Click to build, type if wanted**: the calculation editor builds sentences by clicking, with a typed-formula mode for experienced builders, both giving the same calculation. Governs R5.
- **No mockup**: the owner reviews the real screens at the end instead of a mockup first.
- **Prices stay in the formula**: the gold and silver prices by karat are numbers in the calculation, as in Kobo and the demo. Governs R1.
- **Empty counts as 0, a division by 0 gives empty**: matches Kobo's `coalesce` habit and never shows an error or infinity to the filler. Governs R2.

## Technical decisions
- **Stack profile unchanged** (ST-40 to ST-44): React 19 + Vite PWA, Express 5 + TypeScript, PostgreSQL 17 through Prisma 7, as in CLAUDE.md. Nothing is added: the formula parser is a small hand-written module, no parsing library.
- **One evaluator stays the source of truth**: every new expression, condition and setting lives in `@css/shared/forms` (`jsonb/form-logic.ts` schemas, `evaluate.ts`, `validate.ts`, `definition.ts`). The phone and the server run the same code, as T2.3 decided. `validate()` already drops a client's calculated value and returns the recomputed one (`validate.ts:135`, `:363-373`). Read-only questions and defaults join that same path, so every intake (the volunteer's save and submit, the office's edit, the public link, an unlock) gets them without route changes.
- **Expression additions** (`exprSchema`):
  - `{ if: [{ when: Condition, then: Expr }, …], else: Expr }` for "যদি … তবে … নইলে", nested by putting an `if` in a `then` or `else`.
  - `{ result: <code> }`, a text result that names one of the question's `settings.results` (code plus bilingual label). A text result is shown and stored as its code and read in the reader's language, like a choice.
  - `{ count_rows: { group, where?: Condition } }`, where the condition is read inside each row.
  - `{ cell: { field, row, col } }` for a cell of a number table.
  - Division by zero already gives an empty value (`evaluate.ts:422-426`), and empty inputs already count as 0.
- **Comparing two answers**: a simple condition's `value` may also be `{ field: <key> }`, read like the left side, so a calculation or another answer can be compared with no hidden helper question.
- **Defaults**: `settings.default` becomes typed as `{ today: true } | { text: string } | { number: number }`. On an editable question only the renderer fills it, once, into an empty answer when the form opens; `today` is then the device's date in Asia/Dhaka. The server keeps what the filler sends, including a cleared answer. `validate()` applies a default only to a read-only question, with the server's date in Asia/Dhaka at the first save (`docs/ui/I18N.md` time zone).
- **Read-only**: `settings.read_only: true` is allowed only on a question with a calculation or a default (a definition check). The server writes the default or the computed value itself and ignores what was sent (no 422, so an old draft or an offline copy is not refused). The renderer shows the value without an input.
- **Rows from a count**: `settings.repeat.count_from: <number question key>` must name a whole-number question outside the group and before it. The renderer keeps the rows equal to that answer, capped at `max_rows` or the existing limit of 50. A draft may hold any number of rows. At submission (and on the office's edit of a submitted application) a mismatch is refused with `validation.repeat_rows_mismatch`, which replaces `rows_too_few` for a group driven by a count.
- **Piping**: a label or help text may hold `{{field_key}}` or `{{field_key|fallback}}` in each language. The token is replaced by the answer's text in the reader's language (a choice by its label), and by the fallback, or nothing, while the answer is empty. One shared function `pipeText` is used by the renderer, the office's answer list and the preview. It returns plain text, and every consumer renders it as a React text node, never as HTML or inside a link or image address. Definition checks: the key exists, comes before the question, and is not inside a different group's rows.
- **Number table**: a new field type `number_table`.
  - Settings: `table: { rows: [{ key, label }], cols: [{ key, label }] }`. Fixed system limits: a cell is a whole number from 0 to 1,000,000, and a table has at most 200 cells.
  - Answer value: `{ t: 'number_table', v: { [row]: { [col]: int ≥ 0 } } }`. The validator walks the definition's declared row and column keys, never the sent object's keys, reads only own properties and refuses any extra key; `__proto__`, `constructor` and `prototype` are refused as row or column keys at publish.
  - Its answers go to the custom answers (`split.ts`), never to a standard column. It is not unlockable and gets no score points, both left for later.
  - The field type is a CHECK list in the database (`form_fields_type_check` and `form_library_fields_type_check`, init migration `:4279`, `:4281`), so a migration widens both. Its `down.sql` narrows them again and refuses while any row uses the new type (DB-MIG-05).
- **What a reference may reveal**: a question, text, condition or calculation shown to an audience may name only answers that the same audience can see. A label, a comparison, a `count_rows` condition or a `cell` in a volunteer-visible or public place that names an official-section or office-only answer is refused at publish. The calculated values `validate()` returns to a client are filtered by the same audience rule.
- **Size of an expression**: an expression is at most 20 levels deep and 500 parts, checked by the schema and at publish; the evaluator gives an empty value instead of throwing when a stored tree is out of bounds. The public-link intake keeps its `public-form` rate-limit class.
- **Typed formula**: the "সূত্র লিখুন" mode parses in the builder only (`apps/web/src/admin/forms/formula.ts`). The server never parses text; it stores and checks the expression tree as today.
  - Syntax: question keys, numbers, `+ - * / ( )`, `if(condition, then, else)`, `sum(group.field)`, `count(group)`, `count(group, condition)`, `cell(table, row, col)`. Comparisons are `= != > >= < <=`, joined by `and` and `or`. Text results go in quotes and must be one of the question's results.
  - A parse error names the column it is at. The parsed tree goes through the same definition checks as a clicked one, and printing a tree back gives the formula text, so the two modes are one calculation.
- **Builder editor**: `CalculationEditor` becomes a tree of sentence rows: a term row; a "বন্ধনী" group holding rows; a "যদি … তবে … নইলে" step holding a condition (the existing `ConditionEditor` rows) and two branches. It replaces the fixed shapes of `calc-terms.ts`. The old shapes still open, since they are trees too.
- **Schemas and contract**: the zod schemas, `docs/database/json-schemas/form-field-logic.schema.json` and `application-answer-value.schema.json` change together, held by `packages/shared/test/jsonb-conformance.test.ts`. `docs/api/openapi.yaml` follows wherever the definition or the answer value is spelled out.
- **Tests by layer** (TS-01): the engine as unit tests with the SRP-26 and demo numbers; the intake through the real app as integration tests (TS-02); a new endpoint is not planned, so TS-13 applies to the existing routes' refusals only; one Playwright journey at 360 px. Existing tests are updated where the behaviour changes (TS-24).

## Implementation units

### U1. Record the decision and the rules
- **Goal:** the owner's decisions of 2026-10-26 and the new behaviour are written down before any code.
- **Requirements:** R1–R15 (the decision behind them)
- **Files:** `docs/DECISION_LOG.md` (D-133: D-128 item 3 withdrawn, the demo's extras with D-124 (3) approved, the click-and-type editor, no mockup, prices in the formula), `docs/BUSINESS_RULES.md` (new rules for conditional results, read-only, defaults, rows from a count, row counts, answer comparison, piping, the number table; test status untested), `docs/PLAN.md` (T2.4d's prompt names D-133); D-124 (3) changes from proposed to approved, citing D-133
- **Approach:** as D-132 and BR-270 to BR-272 were added for T2.6 (`docs/DECISION_LOG.md:319`, `docs/BUSINESS_RULES.md:136-139`).
- **Tests:** none (documents); `pnpm docs:check` passes.
- **Done when:** D-133 is in DECISION_LOG, D-124 (3) reads approved, and the new rules are in the register.
- **Depends on:** none
- **Size:** S
- **Risk area:** none
- **Status:** done

### U2. The engine: conditional results, comparisons, row counts and cells
- **Goal:** the shared engine evaluates if/then/else with number and text results, compares two answers and counts rows by a condition, with the same results on both sides.
- **Requirements:** R1, R2, R3, R9, R10, R13
- **Files:** `packages/shared/src/jsonb/form-logic.ts`, `packages/shared/src/forms/evaluate.ts`, `packages/shared/src/forms/definition.ts`, `packages/shared/src/forms/index.ts`, `docs/database/json-schemas/form-field-logic.schema.json`, `packages/shared/test/jsonb-conformance.test.ts`, `packages/shared/src/forms/evaluate.test.ts`, `packages/shared/src/forms/definition.test.ts`, `packages/shared/test/forms-srp26.ts` (new fixture: the SRP-26 calculations as definitions), `packages/shared/src/forms/srp26.test.ts` (new), `packages/shared/src/i18n/messages/{bn,en}/errors.json` (the new definition refusals)
- **Approach:** extend `exprSchema` and the evaluator's `fold`/`computed` (`evaluate.ts:297-316`, `:410-430`), and the condition switch (`evaluate.ts:254-290`) for a `{ field }` value. The definition checks follow `exprReferences` and the cycle check (`definition.ts:425-470`): references in conditions inside calculations, `results` codes, `count_rows` group, the audience of each reference, and the depth and size limits.
- **Tests:**
  - unit:
    - nested if gives 16236 for 24 karat, 14883 for 22, 0 for none;
    - a text result reads "Severe Poverty" in English and its Bengali label;
    - `total_assets` with gold weight × price and empty inputs as 0;
    - `round(daily_income, 2)`;
    - a division by zero gives empty;
    - expense > total income is true, and false at equal;
    - the earners counted among rows with income above 0;
    - definition checks refuse an unknown key, an unknown result code, a comparison of text with a number, and a cycle through an `if`;
    - SRP-26's `net_wealth`, `zakat_status`, `equiv_adults`, `poverty_status` and the international status match hand-computed values for two households;
    - a comparison or count naming an official-section answer from a volunteer-visible question is refused at publish;
    - a tree 21 levels deep or of 501 parts is refused, and an out-of-bounds stored tree evaluates to empty;
    - an unchanged older definition evaluates as before.
  - existing: covered by `packages/shared/src/forms/evaluate.test.ts`, `definition.test.ts` and `packages/shared/test/jsonb-conformance.test.ts`; update rather than duplicate.
- **Done when:** the shared tests pass, and the JSON Schema and zod agree in the conformance test.
- **Depends on:** U1
- **Size:** L
- **Risk area:** none
- **Status:** done

### U3. The engine: defaults, read-only, rows from a count and piping
- **Goal:** the intake applies defaults and read-only values, keeps a group's rows equal to its count, and texts can repeat an earlier answer.
- **Requirements:** R4, R6, R7, R8, R11, R13
- **Files:** `packages/shared/src/jsonb/form-logic.ts` (settings), `packages/shared/src/forms/definition.ts`, `packages/shared/src/forms/validate.ts`, `packages/shared/src/forms/evaluate.ts`, `packages/shared/src/forms/pipe.ts` (new), `packages/shared/src/forms/unlock.ts` (a read-only answer is never unlockable), `packages/shared/src/forms/index.ts`, `docs/database/json-schemas/form-field-logic.schema.json`, `packages/shared/src/i18n/messages/{bn,en}/errors.json` (`validation.repeat_rows_mismatch` and the new definition refusals), `packages/shared/src/forms/validate.test.ts`, `packages/shared/src/forms/pipe.test.ts` (new), `packages/shared/src/forms/definition.test.ts`
- **Approach:**
  - Read-only and defaults go in `validate()` beside the calculated-value skip (`validate.ts:126-150`).
  - The row check follows `checkRows` (`validate.ts:238-253`).
  - `pipeText(text, evaluation, locale)` is a pure function next to `evaluate.ts`, reading answers as `plainOf` does (`evaluate.ts:65-91`).
- **Tests:**
  - unit:
    - a read-only default overrides a sent value;
    - a read-only calculation is never taken from the client;
    - an editable default is kept as sent, and a cleared one stays cleared;
    - `today` uses the Asia/Dhaka date at 23:30 UTC;
    - at submission rows equal to the count pass, while one more or one fewer gives `validation.repeat_rows_mismatch`; a draft with a mismatch passes;
    - a count over 50 is refused at publish;
    - `{{q_farm}}` reads "গরু" in bn and "Cow" in en, and its fallback when empty;
    - an answer `<img src=x onerror=alert(1)>` comes out of `pipeText` as the same plain text;
    - a pipe to an official-section answer in a volunteer-visible label is refused at publish, and the computed values returned for a volunteer leave out office-only calculations;
    - an unchanged older definition validates and stores as before;
    - definition checks refuse read-only without a source, `count_from` naming a text question or a later question, and a pipe to a later question.
  - existing: covered by `packages/shared/src/forms/validate.test.ts` (rows at `:305`) and `definition.test.ts`; update rather than duplicate.
- **Done when:** the shared tests pass.
- **Depends on:** U2
- **Size:** L
- **Risk area:** none
- **Status:** done

### U4. The number table question type
- **Goal:** a form can hold a number table whose cells are stored, validated and usable in calculations.
- **Requirements:** R12, R13
- **Files:**
  - Shared: `packages/shared/src/forms/library.ts` (`FIELD_TYPES`), `packages/shared/src/jsonb/answer-value.ts`, `packages/shared/src/forms/validate.ts`, `packages/shared/src/forms/split.ts`, `packages/shared/src/forms/evaluate.ts` (`plainOf` and the `cell` term), `packages/shared/src/jsonb/form-logic.ts` (the `cell` term), `packages/shared/src/forms/definition.ts` (the `table` settings check), `packages/shared/src/i18n/messages/{bn,en}/errors.json`.
  - Migration: `apps/api/prisma/migrations/<ts>_number_table/{migration.sql,down.sql}`.
  - API: `apps/api/src/services/forms.ts` (`writeDefinitionRows`) and `apps/api/src/services/form-library.ts` (`fieldTypeOf`).
  - Documents: `docs/database/json-schemas/application-answer-value.schema.json`, `docs/database/json-schemas/form-field-logic.schema.json`, `docs/database/DATABASE_SCHEMA.md`, `docs/api/openapi.yaml`.
  - i18n: `packages/shared/src/i18n/messages/{bn,en}/forms.json` (type name and hint).
  - Tests: `packages/shared/src/forms/validate.test.ts`, `split.test.ts`, `apps/api/test/integration/forms.test.ts`.
- **Approach:** copy the composite `bd_address` path (answer `answer-value.ts:41-48`, validation `validate.ts:155-157`, split `split.ts:55-58`) for a new shape, and add the `cell` term to the expression schema and the evaluator; the migration drops and re-adds the two CHECK constraints, as the init migration declares them.
- **Tests:**
  - unit:
    - a table answer with whole numbers passes;
    - a negative, a fraction, an unknown row or column is refused;
    - an empty table on a required question is refused;
    - a definition refuses a table with no rows or columns, with duplicate keys, with `__proto__` as a key, or with more than 200 cells;
    - a sent `__proto__` key and a cell above 1,000,000 are refused, and no extra key is kept;
    - a cell term reads its value, and an unknown row or column in a `cell` is refused at publish;
    - the answer goes to the custom answers;
    - an unchanged older definition evaluates as before.
  - integration: a draft with a number table saves and publishes through `PATCH /form-versions/:id` and `POST …/publish`; the read returns its settings; an application stores a table answer and a calculation over its cells; the migration's down refuses while a row uses the type and passes on an empty database.
  - existing: covered by `apps/api/test/integration/forms.test.ts`, `packages/shared/src/forms/validate.test.ts`, `split.test.ts`.
- **Done when:** the shared and database tests pass, and the migration applies and reverses on a fresh test database.
- **Depends on:** U2
- **Size:** M
- **Risk area:** migration
- **Status:** done

### U5. The intake through the real app
- **Goal:** every way an answer comes in keeps the new rules: the volunteer's save and submit, the office's edit, the public link and an unlock.
- **Requirements:** R4, R7, R8, R14
- **Files:** `apps/api/src/applications/answers.ts`, `apps/api/src/applications/service.ts` (only if the intake needs the date or the stored rows), `apps/api/src/services/public-forms.ts`, `apps/api/src/applications/unlocks.ts` (it validates through `validate()`), `apps/api/test/integration/applications.test.ts`, `apps/api/test/integration/public-forms.test.ts`, `apps/api/test/integration/field-unlocks.test.ts`
- **Approach:** the routes keep calling `checkAnswers` (`answers.ts:81`), so the work is mostly tests through the real app, plus passing "today" from the server clock.
- **Tests:**
  - integration:
    - a volunteer's draft with a sent value on a read-only question stores the default instead;
    - a sent calculation result is replaced by the server's;
    - a draft with 4 family rows and a count of 5 saves; its submit answers 422 `validation.repeat_rows_mismatch`, naming the group;
    - a public entry keeps the same rules;
    - an unlock of a read-only answer is refused as not unlockable;
    - the office's record shows a text result's label in the request language;
    - a public entry's answer to the volunteer never carries an office-only calculation;
    - an application on an unchanged older version saves and submits as before;
    - another volunteer cannot read or change the application (unchanged 404).
  - existing: covered by `apps/api/test/integration/applications.test.ts`, `public-forms.test.ts`, `field-unlocks.test.ts`; add cases rather than new files.
- **Done when:** the database tests of those files pass.
- **Depends on:** U3, U4
- **Size:** M
- **Risk area:** none
- **Status:** todo

### U6. The renderer and the answer list
- **Goal:** the filler and the office see defaults, read-only values, text results, piped texts, rows that follow the count, and the number table, at 360 px and on a desktop.
- **Requirements:** R6, R7, R8, R11, R12, R14
- **Files:**
  - Renderer: `apps/web/src/features/forms/FieldInput.tsx`, `FormRenderer.tsx`, `RepeatGroup.tsx`, `NumberTableInput.tsx` (new), `use-form-answers.ts`.
  - Answer list: `apps/web/src/features/applications/AnswerList.tsx` (`answerText` for a table and a text result).
  - i18n: `packages/shared/src/i18n/messages/{bn,en}/forms.json`.
  - Tests: `apps/web/src/features/forms/renderer.test.tsx`, `apps/web/src/features/applications/*.test.tsx`.
- **Approach:** `FieldInput`'s calculation branch (`FieldInput.tsx:201-210`) for read-only display; the repeat rows in `FormRenderer.tsx:284-304`; the address input as the composite-input example (`FieldInput.tsx:180`, `:246-266`); `pipeText` from the shared package for every label and help. The table is laid out with the set's `Grid` and native number fields; if the set lacks a piece, it is added to `packages/ui` first (RE-UI-04).
- **Tests:**
  - unit (component, MSW):
    - a date default shows today and can be changed;
    - a read-only text shows "ASF-CBSRP-" with no textbox;
    - entering 3 for the family size gives 3 rows;
    - lowering it to 2 asks "বাড়তি সারির উত্তর মুছে যাবে। তবু কমাবেন?" and keeps 3 rows on "বাতিল";
    - the label reads "কতটি গরু পালন করতে চান?" after choosing গরু;
    - the deficit question appears when spending is above income;
    - the livestock table takes numbers per cell and shows the cow total;
    - axe has no violations in bn and en;
    - the answer list shows the table and a text result's label.
  - existing: covered by `apps/web/src/features/forms/renderer.test.tsx` (repeat groups `:261`, `:463`); update rather than duplicate.
- **Done when:** the web tests pass and the renderer at 360 px has no sideways scroll in the component test's check.
- **Depends on:** U3, U4
- **Size:** L
- **Risk area:** none
- **Status:** todo

### U7. The calculation editor: click to build, type if wanted
- **Goal:** a builder makes any calculation of R1 to R3 and R9 by clicking sentence rows or by typing a formula, and both read back as the same sentence.
- **Requirements:** R1, R2, R3, R5, R9
- **Files:** `apps/web/src/admin/forms/CalculationEditor.tsx`, `apps/web/src/admin/forms/formula.ts` (new parser and printer), `apps/web/src/admin/forms/calc-tree.ts` (new, replacing the shapes of `calc-terms.ts`), `apps/web/src/admin/forms/calc-terms.ts` and `calc-terms.test.ts` (removed; `CalculationEditor.tsx` and `sentences.ts` stop importing them), `apps/web/src/admin/forms/sentences.ts`, `apps/web/src/admin/forms/RuleGroups.tsx` (the sentence summary), `packages/shared/src/i18n/messages/{bn,en}/forms.json`, `apps/web/src/admin/forms/formula.test.ts` (new), `calc-tree.test.ts` (new), `sentences.test.ts`, `settings.test.tsx`
- **Approach:**
  - The tree editor follows the existing editor and `ConditionEditor` rows (`logic-rows.ts`).
  - The parser is a small hand-written module: a tokenizer and recursive descent with operator precedence. No repo example exists; it is a new pattern.
  - `calc-terms.ts` and its test are removed once the tree covers every old shape.
- **Tests:**
  - unit:
    - the parser reads `if(gold_karat = '24', 16236, if(gold_karat = '22', 14883, 0))`, `cash + bank + gold_weight * gold_price`, `count(members, income > 0)`, `sum(members.income)` and `cell(livestock, cow, own)`;
    - printing gives the same text back;
    - errors name the column for an unknown key, a missing bracket and a text result that is not in the list;
    - each old shape opens as a tree.
  - unit (component):
    - clicking "যদি … তবে" adds a step that reads "যদি সোনার ক্যারেট = 24 হয় তবে 16236, নইলে …";
    - "বন্ধনী" adds a group;
    - "সূত্র লিখুন" shows the typed text, its sentence below, and an error "অজানা প্রশ্ন: gold_karats (ঘর 4)";
    - rounding "দশমিকের পর ঘর" sets 2;
    - axe passes.
  - existing: covered by `apps/web/src/admin/forms/calc-terms.test.ts`, `sentences.test.ts`, `settings.test.tsx`; the calc-terms cases move into `calc-tree.test.ts`.
- **Done when:** every SRP-26 calculation of U2's fixture can be entered by typing and by clicking in the component tests, and the web tests pass.
- **Depends on:** U2, U4
- **Size:** L
- **Risk area:** none
- **Status:** todo

### U8. The builder's new settings and the number table editor
- **Goal:** a builder sets defaults, read-only, rows from a count, comparisons with another answer, piped texts and number tables without code.
- **Requirements:** R6, R7, R8, R10, R11, R12
- **Files:** `apps/web/src/admin/forms/SettingsPane.tsx`, `RepeatSettings.tsx`, `ConditionEditor.tsx`, `logic-rows.ts`, `sentences.ts`, `type-meta.ts`, `AddPane.tsx`, `TableSettings.tsx` (new), `DefaultSettings.tsx` (new), `draft.ts`, `packages/shared/src/i18n/messages/{bn,en}/forms.json`, `apps/web/src/admin/forms/{settings,builder,logic-rows,draft}.test.ts(x)`
- **Approach:** the settings pane's `Disclosure` groups and editors of T2.4b (`SettingsPane.tsx`, `RepeatSettings.tsx`, `OptionsEditor.tsx` for the row and column lists). The comparison is a value-kind switch in the condition row ("একটি মান" / "অন্য প্রশ্নের উত্তর"). Piping is an "উত্তর বসান" menu beside the question text that inserts `{{key}}`.
- **Tests:**
  - unit (component):
    - "ডিফল্ট মান" offers "আজকের তারিখ" on a date question and "লেখা" on a text question;
    - "শুধু দেখা যাবে, বদলানো যাবে না" is disabled without a default or calculation;
    - "সারির সংখ্যা যে প্রশ্ন থেকে" lists only earlier whole-number questions;
    - a condition with "অন্য প্রশ্নের উত্তর" reads "দেখাবে যখন ‘মাসিক ব্যয়’ ‘মোট আয়’-এর বেশি";
    - "উত্তর বসান" inserts the token and the preview reads the answer;
    - the tile "সংখ্যার ছক" adds a table with "সারি যোগ করুন" and "কলাম যোগ করুন";
    - axe passes.
  - existing: covered by `apps/web/src/admin/forms/settings.test.tsx`, `builder.test.tsx`, `logic-rows.test.ts`, `draft.test.ts`.
- **Done when:** the web tests pass and the builder saves each setting in a draft that publishes.
- **Depends on:** U3, U4, U7
- **Size:** L
- **Risk area:** none
- **Status:** todo

### U9. The demo journey, the sweep and the documents
- **Goal:** the owner's demo form is built and filled end to end, and the documents describe what was built.
- **Requirements:** R15, R5, R14
- **Files:** `apps/web/e2e/form-logic.spec.ts` (new), `apps/web/e2e/support/demo-form.ts` (the rest of the demo's definition, sent through the API), `apps/web/e2e/a11y.spec.ts`, `docs/BUSINESS_RULES.md` (test status), `docs/ui/SCREENS.md` (SCR-061, the renderer of SCR-031), `docs/testing/TEST_STRATEGY.md`, `docs/architecture/WORKFLOW_ENGINE.md` only if a reference moves, `docs/STATUS.md`, `CLAUDE.md` (the map)
- **Approach:** follow the existing `apps/web/e2e/form-builder.spec.ts` for the setup (a ready form built as the Monitoring Team, placed by the PM, the public link at 360 px); the journey goes in the new `apps/web/e2e/form-logic.spec.ts`.
- **Tests:**
  - e2e:
    - As `monitoring@example.org` at `/admin/ready-forms`, a new ready form is created and the demo's body is added through the API. In the builder:
      - the gold price is added by clicks with "যদি … তবে";
      - total assets is added with "সূত্র লিখুন";
      - the livestock "সংখ্যার ছক" is added with গরু, ছাগল and নিজের, বর্গা;
      - "সারির সংখ্যা যে প্রশ্ন থেকে" is set on the family rows;
      - then "প্রকাশ করুন".
    - The PM places it on a project of the run and turns on the public link.
    - At 360 px on the link:
      - entering 3 family members shows 3 rows;
      - a spending above income shows "আয়ের চেয়ে ব্যয় বেশি হওয়ার কারণ";
      - choosing গরু reads "কতটি গরু পালন করতে চান?";
      - 22 karat shows 14883;
      - the date shows today;
      - the read-only number prefix cannot be typed into;
      - "জমা দিন" ends with the existing confirmation.
    - Axe passes in bn and en.
  - e2e: the axe run in `apps/web/e2e/a11y.spec.ts` adds the builder with a number table and a formula open.
- **Done when:**
  - the journey passes 3 of 3 with `--repeat-each 3 --workers 1` on desktop and mobile;
  - `pnpm rules:status --phase 2 --report-only` lists every new rule as tested;
  - the documents are updated.
- **Depends on:** U5, U6, U8
- **Size:** M
- **Risk area:** none
- **Status:** todo

## Checkpoints
- **Mode:** grouped (one by one 7, grouped 15 with one by one's points added since N is over 4, all at once 0)
- **Signals:** N 9, L 2,500, R 1, Fd 3, C 5, P 1
- **C1** after U2: foundation for U3, U4 and U7
- **C2** after U3: foundation for U5, U6 and U8
- **C3** after U4: foundation, and a migration
- **C4** after U7: a new pattern (the formula parser); U5 to U7 stay under 1,000 lines
- **C5** after U9: end

## Verification
- `pnpm typecheck`, `pnpm lint` (incl. `pnpm i18n:check`), `pnpm docs:check`
- `pnpm test` (shared, ui, web, API unit); the database project `npx vitest run --config vitest.db.config.mts` in `apps/api`
- `pnpm db:migrate` and the migration's down on the test database; `pnpm --filter @css/api contract:coverage`
- `pnpm --filter @css/web build` and `pnpm --filter @css/web bundle:report` (the builder stays in its lazy chunk)
- `pnpm e2e`; `cd apps/web && npx playwright test e2e/form-logic.spec.ts --repeat-each 3 --workers 1`
- `pnpm rules:status --phase 2 --report-only`
- The plan's IDs stay in the plan: code, comments and test names state the behaviour in words (ORG-CMT-10).

## Risks and rollback
- **Migration (U4)**: `down.sql` narrows the CHECK lists again and refuses while any form or library row uses `number_table` (DB-MIG-05). To roll back after use, the forms holding a table must first be retired or their drafts edited.
- **Old versions**: every addition is optional in the schemas, so published versions and stored answers read as before. Each unit's tests include an unchanged older definition.

## Progress
- **Branch:** `feat/form-logic` (from `docs/plan-form-tasks` at 3a64c1c, PR #29, which merges into `main` first)
- **Updated:** 2026-10-26 14:30
- **Next:** C3 (test and review of `5090ea8..HEAD`), then U5 the intake through the real app
- **Reviewed through:** C2 at 7b73164 (logic and standards reviewers on `71e9e51..6be27c6`); C1 at 2794653
- **Uncommitted:** none
- **Notes:** the owner chose at the brainstorm and the doc review: D-128 item 3 withdrawn; the demo's extras (rows from a count, row counts by condition, comparing two answers, piping, the number table) joined; click-and-type editor; no mockup; prices stay in the formula; all four security points of the plan security review; a draft may hold rows that do not match the count, the submission refuses the mismatch. U1: D-133 also notes on BR-082 that the officials are read from the steps and the audit; the new rules are BR-273 to BR-280 (module M07 only, so the Phase 1 documents check stays green). U2 found and fixed: a condition on a calculation compared its value as text (the field's type was `calculation`), so `10.50 > 5` was false; it now compares by what the calculation gave (`comparedType` in `evaluate.ts`). The size limits live in `jsonb/form-logic.ts` (`EXPRESSION_LIMITS`, `logicSize`, `withinLimits`); the audience check is part of `checkReference` in `definition.ts` and reports once per referring question. C1 taught: a calculation's amount can be negative, and the shared amount parser refuses a minus sign, so comparisons parse signed amounts (`signedPaisa`); a number rounds a half away from zero like money; the audience check runs at publish only (a draft keeps autosaving); a comparison value is a fixed value or exactly `{ field }`; a comparison with another answer counts as two parts. Left: the two settings schemas (`jsonb/form-logic.ts` loose, `definition.ts` strict) stay separate by design. U3 built: `settings.default` is typed (`{ today }`, `{ text }`, `{ number }`) and `settings.read_only`; `validate()` skips a read-only answer on intake and writes a read-only default outside a group itself (`applyReadOnlyDefaults`); a read-only default inside a group is refused at the definition; `repeat.count_from` needs an earlier `number` question with a `validation.max` of 50 or less, a draft may hold any rows and a submission must match (`validation.repeat_rows_mismatch`, with the expected count); `pipe.ts` holds only the token functions (no imports, so `definition.ts` can read them) and `answerTexts` sits in `evaluate.ts`; `unlockRefusal` refuses a read-only answer with the existing `type` reason. The check that a volunteer never gets an office-only calculation back belongs to the record's mask of T2.5 and is proved in U5, not in `validate()`, which only the server reads. C2 taught: a read-only `today` keeps the date it was first given when the service passes the stored answers as `previous` (U5 must pass them on every save, the guards and unlocks included), and an office-only read-only default is written only for an official; a default must keep its question's own rules (`defaultFits` in `definition.ts`: a whole number, an amount of at most two decimals not below 0, a text on a plain text question within its length and pattern, within the least and most), else a read-only answer could fail every submission; a counted group's rows come from the engine (`rowCount` takes the count, 0 to 50), so a blank row is a row whose required answers are asked, and only rows beyond the count are refused; a draft is still capped at 50 rows; a count question needs a least of 0 or more. Dismissed: decision ids in the JSON Schema descriptions (documents under `docs/`, as the older entries). U4 built: `number_table` in `FIELD_TYPES`, the answer `{ t: 'number_table', v: { row: { col: n } } }` (the schema takes any keys and numbers; `tableCells` in `validate.ts` rebuilds the cells from the question's own rows and columns, whole numbers 0 to 1,000,000, and refuses anything else with `validation.table_cell`); `settings.table` with at most 200 cells, unique keys, never `constructor`, `prototype` or `__proto__`, outside any group (`form.table_invalid`); the `cell` term; a table reads as its total in a condition (`tableTotal`); the migration `20261026120000_number_table` widens both type CHECKs and its down refuses while a table exists. The builder only knows the type's icon so far (`type-meta.ts`); its editor is U8. The development database had not had T2.6's three migrations either; `pnpm db:migrate` applied all four.
