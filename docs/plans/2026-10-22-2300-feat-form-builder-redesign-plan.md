---
title: A clean, guided form builder (T2.4b redesign)
type: feat
status: in-progress
source: plan
date: 2026-10-22
---

# A clean, guided form builder (T2.4b redesign)

Decision D-122. The owner tried the T2.4 builder (PR #22) and found it messy and hard for a person with little technical knowledge; the approved mockup `docs/ui/mockups/13b-form-builder-v2.html` (approved in chat on 2026-10-22, "শুরু কর") is what this plan builds.

## Goal
A PM with no training builds a project's application form on one calm page: the form drawn in the middle as it will be filled, question types and the library on the left, the chosen question's settings in short groups on the right, conditions and calculations shown as plain sentences, drag and drop with a keyboard alternative.

## What stays as it is
The engine (`@css/shared/forms`), the API (one additive order column aside), the renderer, the public page, the draft save, the version list's data, the change summary and every test of those.

## Units
1. **Library order** — migration `sort_order` on `form_library_sections` and `form_library_fields` (hand-written `down.sql`), the seed fills it in file order, `form-library.ts` orders by it; API test that the library read follows the seed order. Size S. Risk: migration.
2. **`packages/ui`: `ChoiceTiles` and `Disclosure`** — tiles with icon, title and description under radio semantics with arrow keys; a collapsible group after `ProfileSection`'s toggle. Tests with axe; in the dev gallery. Size M.
3. **Builder page layout** — `FormBuilderPage.tsx`, `builder.css`: three panes (sticky sides), the header with the count line, the save state, "প্রিভিউ" (Modal with the renderer, size and audience switches) and "প্রকাশ করুন"; the right pane's tabs "প্রশ্নের সেটিং" and "ফর্মের সেটিং" (name, `VersionList`, `PublicLinkPanel`). Size M.
4. **Canvas** — `FormCanvas.tsx` replaces `OutlinePane`: section headers with a ⋮ menu (`MenuButton`), question rows drawn through `FieldInput` in a read-only, inert way, a selected bar (type, up, down, copy, remove), tags (lock, condition, calculation), "+ এই অংশে প্রশ্ন যোগ করুন", empty state; `type-meta.ts` (icon, plain name, group, example per `FieldType`); drag with `@dnd-kit/sortable` inside and across sections (a repeat group with its members; a core question stays in its section), `moveFieldTo` in `draft.ts`; undo of a removal. Size L.
5. **Left pane** — `AddPane.tsx` with tabs "প্রশ্ন যোগ" (the type list in six groups, "+" adds to the chosen section, draggable onto the canvas) and "লাইব্রেরি" (fields grouped by `fieldKeys` with search, "পুরো অংশটি যোগ করুন"); the own-question dialog keeps only labels, options and the section, the type chosen on the left. Size M.
6. **Settings** — `SettingsPane.tsx` regrouped in `Disclosure` groups per type; `ConditionEditor` and `CalculationEditor` in Modals behind `conditionSentence` and `calcSentence` (`sentences.ts`); the getting-started card. Size M.
7. **Words** — `forms.json` bn and en rewritten with `ae-bangla-copy` ("প্রশ্ন" everywhere, the plain type names). Size S.
8. **Tests, journey and documents** — `builder.test.tsx`, `settings.test.tsx`, `versions.test.tsx`, `draft.test.ts`; `e2e/form-builder.spec.ts` to the new labels (drag through the keyboard alternative); SCREENS SCR-061, STATUS, CLAUDE.md map, DESIGN_SYSTEM 4.4 (done with D-122). Size M.

## Checkpoints
- C1 after U2 (the migration and the shared components), C2 after U5 (the screens), C3 after U8 (the end, with the full run).

## Verification
`pnpm typecheck`; `npx eslint . --ignore-pattern ".claude/**"`, Prettier, `pnpm i18n:check`; the web, ui, shared, api-db forms tests and the drift test; `pnpm --filter @css/web build` with `bundle:report` (nothing cut to fit); `pnpm e2e` and the journey with `--repeat-each 3 --workers 1`; a hands-on walk in the dev app as `pm.ucd@example.org`.

## Progress
- **Branch:** `feat/form-builder-redesign` (from `main` at 163194f, the T2.4 merge)
- **Updated:** 2026-10-22 23:10
- **Next:** U2 `ChoiceTiles` and `Disclosure` in `packages/ui`
- **Uncommitted:** none
- **Reviewed through:** nothing yet
- **Notes:** U1: `sort_order` on both library tables, filled by the seed in file order and read first by the service (`key` breaks ties); the dev database refreshed with `pnpm db:seed --set base`. The mockup is committed (d858c61); DESIGN_SYSTEM 4.4 and D-122 are written.
