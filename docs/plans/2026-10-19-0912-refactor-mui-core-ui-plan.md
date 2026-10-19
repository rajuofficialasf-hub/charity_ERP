---
title: The component set on MUI core
type: refactor
status: in-progress
source: plan
date: 2026-10-19
doc_review: 2026-10-19
---

# The component set on MUI core

## Goal
Every screen of the ERP looks and works as it does today, but the component set `@css/ui` is built on MUI core instead of React Aria and Tailwind, so the app follows the organization's UI rule (pages use the set; the template library stays inside it) and the paid Minimal template can be swapped in later without touching a page.

## Problem
The organization's standard (ae-standards `RE-UI-*`) puts every app's UI on MUI behind an org component set. CSS ERP chose React Aria and Tailwind (D-064, D-066, UX-15) because the Minimal licence could not be confirmed. The owner decided on 2026-10-19 to return to the standard and start with MUI core (`@mui/material`, MIT), which needs no licence; Minimal follows once its licence is confirmed. Doing it before the Phase 1 gate keeps the gate's visual baselines and UAT on the final design.

## Requirements
- **R1** Every component exported by `@css/ui` renders with MUI core; `react-aria-components` and `@internationalized/date` are no longer dependencies.
- **R2** Pages and features keep importing only `@css/ui`; `@mui/*` and `@emotion/*` are imported only inside `packages/ui/src/templates/mui/`, and a lint rule fails anything else.
- **R3** The look follows the approved brand: the tokens of `docs/ui/DESIGN_SYSTEM.md` section 2.9 and `docs/ui/brand/colors.md` (colours, UbuntuSans and Bornomala at 400 and 700, radius 6/8/16, the 4 px spacing scale, breakpoints 640/1024/1280), English digits everywhere and dates as dd-mm-yyyy.
- **R4** Behaviour and accessibility stay: keyboard use, focus, roles and accessible names; the ui and web component tests with axe, the API suites, the three Playwright projects and the axe sweep pass in Bengali and English.
- **R5** Phones keep working at 360 px: drawers, the date picker and the filter sheet open as bottom sheets, and no page scrolls sideways.
- **R6** The first route stays within the 250 KB compressed JavaScript budget.
- **R7** Tailwind is gone: no `tailwindcss` dependency, no utility classes; layout comes from set components and page CSS on the design tokens.
- **R8** The template is replaceable: one export line in the set selects `templates/mui`, so a Minimal template can replace it later.
- **R9** The decision and every affected document are updated: DECISION_LOG, an ADR, the CLAUDE.md stack profile, DESIGN_SYSTEM.
- **R10** The app loads only the device language's message catalogue at start and the other language when the person switches, so the first route has room for MUI (owner, 2026-10-19).

## Scope
- In: `packages/ui` (all 26 component folders and `VisuallyHidden`, 28 exported component families, provider, styles, tests), `apps/web` (pages' class names and CSS, the shell, the gallery, component tests and E2E specs where they read implementation details), lint, docs.
- Out (not now): the paid Minimal template and its parts library (after the licence is confirmed); the move to two repos (ST-20); MUI X paid editions; any change of behaviour, text or layout of a screen.

## Key decisions
- **MUI core first, Minimal later** (owner, 2026-10-19: "তুমি mui core দিয়ে শুরু কর"): no licence needed now; the set keeps pages independent of the template. Governs R1, R8.
- **The approved brand look stays** (UX-01, UX-13, UX-14, O-40 are unchanged): only the implementation moves. Governs R3.
- **Tailwind leaves at the end** (recommended in chat, no objection): one styling system, as the standard has. Governs R7.
- **Before the Phase 1 gate** (recommended in chat): the gate's baselines and UAT run on the final design.
- **One language at start** (owner, 2026-10-19, after the U1 bundle gate showed 250.4 KB with only the MUI theme): the catalogue is split by language instead of raising the 250 KB budget (D-104). Governs R6, R10.

## Technical decisions
- **Versions** (ST-34): `@mui/material` 9.4.0 (the version the ae kit's Minimal template is tested on, 2026-08-27, MIT), `@emotion/react` 11.14.0 and `@emotion/styled` 11.14.1 (MIT); for the date field `@mui/x-date-pickers` 9.x community (MIT; peer `@mui/material ^9.0.0`), the newest 9.x released at least two weeks before the install, with `dayjs` as its adapter. No `@mui/lab`, no paid MUI X. Icons stay `lucide-react` through the set's `Icon`.
- **The set keeps its API** (RE-UI-01, RE-UI-04): the exported names and prop types of `packages/ui/src/index.ts` stay, including the React-Aria-flavoured props pages use (`onPress`, `isSelected`, `isOpen`, `Set<string>` selections), so the 102 page files do not change while the components move. Renaming props is a later, separate change.
- **Template folder and contract** (RE-UI-02, RE-UI-03): every file that imports MUI or Emotion lives in `packages/ui/src/templates/mui/`, which exports every component from its own `index.ts`. The prop types move unchanged from the component files into `packages/ui/src/contract.ts` (the set's contract, as `src/ui/contract.ts` of the ae kit); the template imports them with `import type` and checks itself with `satisfies UiTemplate`. `packages/ui/src/template.ts` is the only file that names the template (`export * from './templates/mui/index.js'`); `packages/ui/src/index.ts` exports the components from `template.ts` and the types from `contract.ts` under the same names as today. The component folders keep their tests and their CSS until their unit moves them; a component whose unit is not done yet is exported from its old folder through `template.ts`. `packages/ui` stays the set (the monorepo of D-050); `src/ui/` of a two-repo app is out of scope.
- **Theme from tokens** (R3): a new `packages/ui/src/tokens.ts` mirrors DESIGN_SYSTEM 2.9 as data; `templates/mui/theme.ts` builds the MUI theme from it (palette, `typography.fontFamily`, weights 400/700, `shape.borderRadius` 8, spacing 4 px, breakpoints 640/1024/1280) and enables MUI CSS variables; `tokens.css` stays for page CSS. The drift test checks both `tokens.ts` and `tokens.css` against the doc.
- **CSS order**: an Emotion cache with `prepend: true` inside `UiProvider`, so the base and page CSS keep their precedence; no `CssBaseline` (the existing `base.css` stays).
- **Client navigation and the two provider stacks**: a theme default `LinkComponent` built from `UiProvider`'s `navigate` gives MUI links and menu items client-side navigation. Until U7, `UiProvider` keeps the React Aria `RouterProvider` and `I18nProvider` beside the MUI `ThemeProvider` and the Emotion cache, so the components not moved yet keep working; U7 removes the React Aria providers.
- **The one deliberate API change**: `ARIA_LOCALE` becomes `FORMAT_LOCALE` in U7 (no page uses it; only the set's provider does).
- **Digits and locale**: numbers go through `@css/shared/format` as today; the date adapter formats `DD-MM-YYYY` with Latin digits; set components pass their own bilingual labels (`UiMessages`) to MUI wherever MUI has built-in text.
- **Roles and keyboard kept** (R4): SegmentedControl stays a `radiogroup`; ConfirmDialog keeps `role="alertdialog"`; the desktop table stays a `grid` on the MUI `Table` (`role="grid"`, rows and cells with `role="row"`/`gridcell`, arrow keys between rows and cells, Enter for the row action, Space for selection), so no test changes its role and the keyboard model React Aria gave stays.
- **Lint** (RE-UI-05): `no-restricted-imports` in `packages/config` blocks `@mui/*`, `@emotion/*` and `react-aria-components` outside `packages/ui/src/templates/mui/**`.
- **Stack profile** (ST-43): the CLAUDE.md "UI" line changes to "`packages/ui` on MUI core (`@mui/material`, MIT) behind the set, template in `src/templates/mui`; Minimal after its licence is confirmed"; the Tailwind mention leaves with U9.

## Implementation units
### U1. The decision and the MUI foundation
- **Goal:** the decision is recorded and the set renders inside a MUI theme built from the brand tokens.
- **Requirements:** R3, R8, R9
- **Files:** `docs/DECISION_LOG.md` (D-103, superseding the library part of D-064 and UX-15), `docs/architecture/ADR/ADR-015-mui-core-component-set.md` and `ADR/README.md` (ADR-012 superseded), `CLAUDE.md` (stack profile), `packages/ui/package.json`, `pnpm-lock.yaml`, `packages/ui/src/tokens.ts`, `packages/ui/src/contract.ts` (the prop types moved from the component files), `packages/ui/src/templates/mui/{index.ts,theme.ts,provider.tsx}`, `packages/ui/src/template.ts`, `packages/ui/src/index.ts`, `packages/ui/src/provider/UiProvider.tsx`, `packages/ui/src/styles/styles.test.ts`, `packages/ui/src/templates/mui/theme.test.ts`
- **Approach:** the ae kit's `templates/minimal/src/theme/` (palette and fonts from tokens, `create-theme.ts`) for the theme shape; `packages/ui/src/provider/UiProvider.tsx` keeps its props and context.
- **Tests:**
  - unit: the theme's primary is #008E48 with the dark #007B3E, the font stack is `UbuntuSans, Bornomala, sans-serif` with weights 400 and 700, radius 8 and spacing 4 px, breakpoints 640/1024/1280; `tokens.ts` equals the token block of DESIGN_SYSTEM 2.9; a set link navigates through `navigate` without a page load; `useUi()` still throws without the provider; `templates/mui/index.ts` satisfies `UiTemplate`.
  - existing: covered by `packages/ui/src/styles/styles.test.ts` (token drift) and every component test (they render through `renderWithUi`).
- **Done when:** `pnpm --filter @css/ui test`, `pnpm --filter @css/web test` and `pnpm typecheck` pass with both provider stacks and no component changed yet, and `pnpm --filter @css/web build` then `bundle:report` prints the first route with the MUI provider (the budget gate for every later unit).
- **Depends on:** none
- **Size:** M
- **Risk area:** none
- **Status:** done

### U11. The message catalogue by language
- **Goal:** the first route carries one language's texts; switching the language loads the other once.
- **Requirements:** R6, R10
- **Files:** `docs/DECISION_LOG.md` (D-104), `docs/ui/I18N.md`, `packages/shared/src/i18n/{catalogue.ts,catalogue-bn.ts,catalogue-en.ts,bn.ts,en.ts}`, `packages/shared/package.json` (exports `./i18n/bn`, `./i18n/en`), `apps/web/src/i18n/{locale.ts,LocaleProvider.tsx,locale.test.ts,LocaleProvider.test.tsx}`, `apps/web/src/main.tsx`, `apps/web/test/` setup (both catalogues primed), `apps/web/scripts/bundle-report.mjs` (the first route counts the default language's catalogue chunk)
- **Approach:** the existing `messagesFor` in `apps/web/src/i18n/locale.ts` becomes `loadMessages` with a cache; `main.tsx` renders after the device language's catalogue is loaded; the server and tests keep `bn` and `en` from `@css/shared/i18n`.
- **Tests:**
  - unit: `loadMessages('en')` gives the English catalogue and caches it; the pseudo-locale still works in development; a primed catalogue is used without a load.
  - existing: covered by `apps/web/src/i18n/{locale.test.ts,LocaleProvider.test.tsx}` (the switch re-renders in the other language), `apps/web/e2e/registration.spec.ts` and `gallery.spec.ts` (the language switch persists), the whole web suite.
- **Done when:** the web suite and the language-switch specs pass, and `bundle:report` counts the first route with one language at about 25 KB less than with both.
- **Depends on:** U1
- **Size:** M
- **Risk area:** none
- **Status:** done

### U2. Actions, feedback and display on MUI
- **Goal:** the simple components are MUI-based with the same props and look.
- **Requirements:** R1, R3, R4
- **Files:** `packages/ui/src/templates/mui/{Button,Alert,Badge,Avatar,Card,Spinner,Skeleton,ProgressBar,States,OfflineBanner,PageBand,Breadcrumb,NavItem,Timeline,Stepper}.tsx`, the matching `packages/ui/src/components/<Name>/<Name>.tsx` (re-export), `<Name>.css` (removed or reduced), `<Name>.test.tsx`
- **Approach:** U1's theme; each component keeps its prop type from `packages/ui/src/index.ts`; `Button`'s `onPress`/`loading`/`href` map to MUI `Button` `onClick`/`loading`/`href` with the theme `LinkComponent`.
- **Tests:**
  - unit: each existing component test passes unchanged except where it reads a class name; Button keeps its pending state (`aria-busy`, disabled while loading) and the icon-only accessible name; Stepper's step buttons keep their names on phones.
  - existing: covered by `packages/ui/src/components/{Alert,Badge,Button,Card,OfflineBanner,PageBand,States,Stepper,Timeline}/*.test.tsx`; Avatar, Breadcrumb, NavItem, ProgressBar, Skeleton, Spinner have no test: characterize first (render, name, axe).
- **Done when:** the ui suite and `pnpm --filter @css/web test` pass; the gallery shows the same components at 360 and 1280 px; `bundle:report` keeps the first route within 250 KB with the MUI Button on the login page.
- **Depends on:** U1
- **Size:** L
- **Risk area:** none
- **Status:** done

### U3. Form fields on MUI
- **Goal:** every field keeps its label, helper, error, locked and official-only states, its digit normalising and its keyboard behaviour on MUI.
- **Requirements:** R1, R3, R4, R5
- **Files:** `packages/ui/src/templates/mui/{TextField,Choice,Switch,SegmentedControl,Form,Select,FileUpload}.tsx`, `packages/ui/src/components/Field/{TextField,Choice,Select,FieldParts}.tsx`, `Field.css`, `Choice.css`, `components/{RowToggle,SegmentedControl,Form,FileUpload}/*`, their tests
- **Approach:** MUI `TextField`/`OutlinedInput`, `Checkbox`, `Radio`, `Switch`, `Select` and `Autocomplete`; SegmentedControl on `RadioGroup` with the pill look (keeps `radiogroup`); FileUpload on a hidden `input type="file"` with `capture` for the camera and `onDragOver`/`onDrop` on the drop area; the shared parts of `FieldParts.tsx` become one MUI `FormControl` wrapper.
- **Tests:**
  - unit: TextField turns Bengali digits into English digits and keeps the NID keypad; Select searches past 10 options and opens the "other" text box; Combobox with `serverSearch` shows the server's options unfiltered and its empty state; CheckboxGroup and RadioGroup keep the "other" option; SegmentedControl moves and selects with the arrow keys; FileUpload refuses a wrong type or size with the reason and offers camera, gallery and file by `source`; every field passes axe in bn and en.
  - existing: covered by `packages/ui/src/components/Field/{TextField,Choice,Select}.test.tsx`, `SegmentedControl.test.tsx`, `FileUpload.test.tsx`; the web suites that fill forms (`registration.test.tsx`, `profile.test.tsx`, `setup.test.tsx`, `LoginForm.test.tsx`); Form and RowToggle have no test: characterize first.
- **Done when:** the ui and web suites pass and `registration.spec.ts`, `auth.spec.ts`, `profile.spec.ts` pass on the three Playwright projects.
- **Depends on:** U1
- **Size:** L
- **Risk area:** none
- **Status:** done

### U4. The date field on MUI X pickers
- **Goal:** DateField keeps its ISO value, its dd-mm-yyyy display in English digits, its min and max, and the bottom sheet on phones.
- **Requirements:** R1, R3, R4, R5
- **Files:** `packages/ui/package.json`, `pnpm-lock.yaml`, `packages/ui/src/templates/mui/DateField.tsx`, `packages/ui/src/components/Field/DateField.tsx`, new `packages/ui/src/components/Field/DateField.test.tsx`
- **Approach:** `@mui/x-date-pickers` `DatePicker` with `AdapterDayjs`, format `DD-MM-YYYY`, the field's sections typed with the numeric keypad; below 640 px (`useMediaQuery` at the theme's `sm` breakpoint) the picker's `slots.dialog` is a bottom-anchored MUI `Drawer` (the pattern U5 reuses for the set's Drawer), so the calendar opens as a bottom sheet; on wider screens the default popper.
- **Tests:**
  - unit (characterize first on the current DateField, then keep): shows a stored `2026-11-01` as `01-11-2026`; typing `31122026` gives `2026-12-31`; a date before `min` shows the error; axe in bn and en.
  - e2e: in `apps/web/e2e/gallery.spec.ts` on the `mobile` project (360 px): the date field's calendar button opens a dialog anchored to the bottom of the viewport, and picking a day closes it with the value shown as dd-mm-yyyy.
  - existing: covered by `apps/web/src/admin/projects/setup/setup.test.tsx` (the window dates), `nisab.test.tsx`, `profile.test.tsx` (date of birth) and the E2E `typeDate` helper in `apps/web/e2e/support/projects.ts`.
- **Done when:** the new test, the ui and web suites, `projects.spec.ts` and `admin-settings.spec.ts` pass.
- **Depends on:** U1, U3
- **Size:** M
- **Risk area:** none
- **Status:** todo

### U5. Overlays, menus and tabs on MUI
- **Goal:** Modal, Drawer, ConfirmDialog, MenuButton, BulkRow and Tabs keep focus trapping, Escape, the alertdialog with a reason, menu links and the phone bottom sheets.
- **Requirements:** R1, R4, R5
- **Files:** `packages/ui/src/templates/mui/{Modal,Menu,BulkRow,Tabs}.tsx`, `packages/ui/src/components/{Modal,Menu,BulkRow,Tabs}/*`
- **Approach:** MUI `Dialog`, `Drawer` (anchor right, bottom on phones), `Menu` with `MenuItem component={LinkComponent}`, `Tabs`/`Tab` with panels; `dismissible` and `pending` map to `disableEscapeKeyDown` and the backdrop click.
- **Tests:**
  - unit: Modal traps focus, closes on Escape and returns focus; ConfirmDialog keeps Cancel focused for the danger tone and needs the reason before confirming; MenuButton opens with the keyboard and its link item navigates through `navigate`; Tabs move with the arrow keys; BulkRow's menu acts on the row.
  - existing: covered by `packages/ui/src/components/{Modal,Menu,Tabs}/*.test.tsx`, `apps/web/e2e/gallery.spec.ts` (focus trap, confirm reason, tabs), `shell.test.tsx` (the More sheet and profile menu); BulkRow has no test: characterize first.
- **Done when:** the ui and web suites, `gallery.spec.ts`, `shell.spec.ts` and `admin-permissions.spec.ts` pass.
- **Depends on:** U1
- **Size:** L
- **Risk area:** none
- **Status:** todo

### U6. The table on MUI
- **Goal:** Table and TableToolbar keep sorting, single and multiple selection, the row action, column priorities, the phone card list, paging and the filter sheet.
- **Requirements:** R1, R4, R5
- **Files:** `packages/ui/src/templates/mui/Table.tsx`, `packages/ui/src/components/Table/{Table.tsx,Table.css,Table.test.tsx}`
- **Approach:** MUI `Table` with `role="grid"` and the grid keyboard model of the Technical decisions (a roving focus over rows and cells), `TableSortLabel`, `Checkbox` in the header and rows (`Set<string>` and `'all'` kept), the existing `ul.ui-row-card` list for phones, the toolbar's 300 ms debounced search and filter chips with the U5 Drawer.
- **Tests:**
  - unit: the table is a `grid`; arrow keys move between rows and cells; Enter on a row runs the row action; Space selects a row; sorts by a header; selects one and all rows and reports the `Set`; priority-4 columns hide in split view; the count is announced; the phone list selects and opens; axe in bn and en.
  - existing: covered by `packages/ui/src/components/Table/Table.test.tsx`, `gallery.spec.ts` (sort and selection, phone cards and filter sheet), the volunteer, beneficiary, audit, session and assignment tests and specs; their `grid` queries stay as they are.
- **Done when:** the ui and web suites and the full `pnpm e2e` pass.
- **Depends on:** U1, U3, U5
- **Size:** L
- **Risk area:** none
- **Status:** todo

### U7. React Aria out, the lint guard in
- **Goal:** no React Aria remains, MUI is reachable only inside the template folder, and the bundle is measured.
- **Requirements:** R1, R2, R6
- **Files:** `packages/ui/package.json`, `pnpm-lock.yaml`, `packages/ui/src/provider/UiProvider.tsx` (the React Aria `RouterProvider` and `I18nProvider` removed, `ARIA_LOCALE` renamed `FORMAT_LOCALE`), `packages/ui/src/index.ts`, `packages/config` ESLint config (`no-restricted-imports`), `apps/web/e2e/{admin-permissions,admin,auth,handover,profile,registration}.spec.ts` and `apps/web/e2e/support/admin.ts` (the `[data-live-announcer]` exclusion goes), `apps/web/e2e/gallery.spec.ts`, `docs/testing/PERFORMANCE.md`
- **Approach:** the ae kit's `fe/eslint.config.js` restricted-imports rule and `dependency-cruiser.config.cjs` pattern.
- **Tests:**
  - unit: a lint fixture importing `@mui/material` from a page fails; one from `packages/ui/src/templates/mui` passes.
  - existing: the whole suite (`pnpm test`), `pnpm lint`, `pnpm e2e`.
- **Done when:** `pnpm why react-aria-components` is empty, `pnpm lint` passes, and `pnpm --filter @css/web bundle:report` prints the first route within 250 KB (or the overrun with its cause, for a decision).
- **Depends on:** U2, U3, U4, U5, U6
- **Size:** M
- **Risk area:** none
- **Status:** todo

### U8. Layout components and the admin pages without Tailwind
- **Goal:** the set offers the layout pages need, and the admin area uses it instead of utility classes.
- **Requirements:** R2, R7
- **Files:** `packages/ui/src/templates/mui/Layout.tsx`, `packages/ui/src/contract.ts`, `packages/ui/src/components/Layout/Layout.test.tsx` (`Stack` and `Grid`, as the ae kit's contract has `Stack`, on MUI `Stack` and `Grid` with token gaps), `packages/ui/src/index.ts`, `apps/web/src/admin/**/*.tsx`, `apps/web/src/admin/**/*.css`
- **Approach:** RE-UI-04 (add the piece to the set first); the most used utilities (`m-0`, `grid`, `gap-2`, `flex`, `flex-wrap`, `items-center`, `font-bold`) map to `Stack`/`Grid` props (`direction`, `gap` in token steps, `wrap`, `align`) or to the page's own CSS class on the tokens where a page already has its CSS file.
- **Tests:**
  - unit: `Stack` and `Grid` apply the token gaps, `Stack` lays out a row or a column and wraps, `Grid` changes its columns at the breakpoints.
  - existing: covered by the admin component tests (`apps/web/src/admin/**/*.test.tsx`) and the admin E2E specs.
- **Done when:** no Tailwind utility remains under `apps/web/src/admin` and its tests and specs pass.
- **Depends on:** U7
- **Size:** L
- **Risk area:** none
- **Status:** todo

### U9. The rest of the app without Tailwind, and Tailwind removed
- **Goal:** no utility class remains anywhere and Tailwind leaves the build.
- **Requirements:** R7, R9
- **Files:** `apps/web/src/{components,features,dev}/**/*.tsx`, their CSS files, `apps/web/src/styles/globals.css`, `apps/web/postcss.config.mjs`, `apps/web/package.json`, `packages/ui/src/styles/tailwind.css` (removed), `packages/ui/package.json` (`./tailwind.css` export and dev dependencies), `packages/ui/src/styles/styles.test.ts` (the preset and breakpoint checks move to the theme), `docs/ui/DESIGN_SYSTEM.md`, `docs/DECISION_LOG.md` (D-066 superseded), `CLAUDE.md`
- **Approach:** as U8.
- **Tests:**
  - unit: the drift test checks the theme's breakpoints instead of the preset; a test in `apps/web/test/` reads every literal `className` token of `apps/web/src/**/*.tsx` and fails on a token that no CSS file of `apps/web/src` or `packages/ui/src` defines as a class selector (a leftover utility class, which only Tailwind defined, fails).
  - existing: the whole suite and `pnpm e2e` with the axe sweep.
- **Done when:** `pnpm why tailwindcss` is empty and every suite passes.
- **Depends on:** U8
- **Size:** L
- **Risk area:** none
- **Status:** todo

### U10. The final run and the documents
- **Goal:** the documents say what was built and every check runs green on the final state.
- **Requirements:** R4, R6, R9
- **Files:** `docs/ui/DESIGN_SYSTEM.md` (component notes per MUI piece), `docs/testing/TEST_STRATEGY.md` section 9.1 (the new numbers), `docs/testing/PERFORMANCE.md`, `docs/STATUS.md`, `CLAUDE.md` (repository map)
- **Approach:** the T1.16 report in TEST_STRATEGY 9.1.
- **Tests:**
  - none to write: `pnpm typecheck`, `pnpm lint`, `pnpm docs:check`, `pnpm test`, `contract:coverage --no-run`, `pnpm e2e` (three projects), `a11y.spec.ts`, `bundle:report`, all on the final state.
- **Done when:** every command above passes and its output is in the documents.
- **Depends on:** U9
- **Size:** S
- **Risk area:** none
- **Status:** todo

## Checkpoints
- **Mode:** grouped, split at every unit by the size limit and the foundation and new-pattern rules (one by one 7, grouped 13, all at once 2; N is over 4, so one by one's points go to grouped)
- **Signals:** N 11, L 3,050, R 0, Fd 3 (U1, U3, U5), C 7 (U1 → U3 → U6 → U7 → U8 → U9 → U10), P 2 (U1 the MUI theme and template folder, U4 the MUI X picker)
- **C1** after U11 (U1 and U11): U1 is the foundation for every later unit and a new pattern, U11 a new pattern of loading; two checkpoints in a row kept as one
- **C2** after U2: the size limit (about 45 files before U3)
- **C3** after U3: foundation for U4 and U6
- **C4** after U4: new pattern (MUI X picker)
- **C5** after U5: foundation for U6 and U7
- **C6** after U6: the size limit (U6 and U7 together pass 25 files); `bundle:report` again
- **C7** after U7: the size limit before the page work, and the lint guard every later unit relies on
- **C8** after U8: the size limit (the admin pages)
- **C9** after U9: the size limit
- **C10** after U10: end; scripted checks on the whole branch

## Verification
- `pnpm typecheck` · `pnpm lint` · `pnpm docs:check`
- `pnpm test` (ui, web, shared, api, api-db) · `pnpm --filter @css/api contract:coverage --no-run`
- `pnpm e2e` (mobile, desktop, iphone) and from `apps/web`: `npx playwright test e2e/gallery.spec.ts e2e/a11y.spec.ts`
- `pnpm --filter @css/web build` then `pnpm --filter @css/web bundle:report`
- Manual: the component gallery at http://127.0.0.1:3000/dev/components (`pnpm --filter @css/web dev`) in bn and en at 360 and 1280 px, shown to the owner after U6

## Risks and rollback
- **Bundle:** MUI and Emotion add weight to the eager login route; measured at U7. If the budget is passed, the options (a lighter login page, a budget change) go to the owner as a decision; nothing ships over budget silently.
- **Accessibility:** React Aria's combobox, date picker and table keyboard support is stronger than MUI core's defaults; every component keeps its keyboard tests and axe, and the axe sweep runs at U7 and U10.
- **Rollback:** each unit is its own commits on the branch. U1 to U7 keep the set's public API (except the `FORMAT_LOCALE` rename in U7), so any of them reverts without touching pages; U8 and U9 change page files and revert as whole units. Nothing touches the database or the API.

## Definition of done
- All units done and their tests pass
- Verification commands pass
- `ae-review` has run, with no open P0 or P1
- Code from abandoned attempts is removed

## Progress
- **Branch:** `refactor/mui-core-ui` (from `chore/phase1-test-consolidation`, which is not pushed yet)
- **Updated:** 2026-10-19 19:00
- **Next:** checkpoint C3 over U3 (ae-review on 31abc34..HEAD), then U4 (the date field on MUI X pickers)
- **Reviewed through:** C2 at 82fc814
- **Uncommitted:** none
- **Notes:** the owner chose MUI core in chat on 2026-10-19 after the licence question (Minimal needs a paid licence per end product; MUI core is MIT); the plan review (2026-10-19) kept the table a `grid` with its keyboard model. Prop types move into `contract.ts` unit by unit: until a component's unit, `contract.ts` re-exports its type from the component file, so the template never imports from a component file it replaces. U1 bundle gate: the first route grew from 216.6 KB to 250.4 KB gzip (budget 250) with only the MUI theme, Emotion and the provider (about 31 KB, as an esbuild probe confirms). Probes: the React Aria pieces of the login route are about 21 KB gzip; MUI's theme plus the login components (Button, TextField, Alert, RadioGroup, Radio, FormControlLabel, InputAdornment, IconButton) about 74 KB. After the whole migration the login route lands near 260 to 270 KB without another change. The message catalogue (both languages, bn 29.3 KB and en 24.0 KB gzip) sits in the eager LanguageSwitch chunk (51.3 KB); loading only the device language at start would save about 24 to 29 KB. MUI's `theme.spacing()` answers `calc(n * var(--mui-spacing, 4px))` with `cssVariables: true`. U11: the first route is 229.7 KB gzip with the bn catalogue (27.1 KB) counted, 20 KB under the budget with the MUI theme in; the owner chose this over a budget change (D-104). Tests prime both catalogues in `apps/web/test/setup.ts`. Docker Desktop had stopped between sessions; after a restart Postgres recovered its data directory and the first E2E server start failed on a seed parent while it was still settling, a second start passed. C1 review (logic, security, standards; no P0): a failed first catalogue load left the page empty (now retried with a growing pause and on `online`); the theme was rebuilt and every link remounted whenever `navigate` changed identity, as `AppShell` passes an inline arrow (now one `RouterLink` type reading the router from context; refs read during render are refused by the React lint); decision ids left the new comments. Both language chunks are in the service worker's precache list. U2 (decided while building, for R6): the display components without behaviour (Alert, Avatar, Badge, Card's body, Skeleton, Spinner, States, OfflineBanner, PageBand, Stepper, Timeline) never used React Aria; they stay semantic markup with their CSS on the tokens, because MUI's display components would add weight to the eager login route (8.4 KB of headroom after MUI's Button). U2 moved what used React Aria: Button onto MUI's button (+11.9 KB, first route 241.6 KB), the links of Card, NavItem and Breadcrumb onto the template's router-aware anchor (the contract's `Link`), and ProgressBar to plain ARIA; their CSS reads `:hover`, `:focus-visible` and `aria-current` instead of React Aria's data attributes. A Minimal template later replaces all of them through the contract. MUI's Emotion styles have no cascade layer and so beat every rule of the set, which is all inside `@layer` (the gallery's axe check caught a ghost button losing its ink colour on the danger banner): MUI now writes into `@layer mui` (`StyledEngineProvider enableCssLayer`), and `apps/web/index.html` declares `theme, base, mui, components, utilities` before Emotion's insertion point, so MUI sits above the base resets (`button { color: inherit }`) and under the set's components and the pages' CSS. First route after U2: 239.3 KB gzip. C2 review (logic, standards; no P0 to P2): the progress bar now clamps at zero too; a finding that the emotion insertion point is dead was checked against MUI's `StyledEngineProvider`, which looks the meta up when CSS layers are on, so it stays. U3 plan for the bundle (R6): the text fields, checkboxes, radios, switch, segmented control, form and file upload become native elements with ids wiring label, helper and error, their CSS reading native states; MUI's Autocomplete only where a listbox behaviour is needed (Select, Combobox), which are not on the login route. U3 so far (commits 0b99d0b, 7d36695, d359c93): the five text fields, Form, SegmentedControl, Checkbox, CheckboxGroup, RadioGroup, Switch and RowToggle are native; the field parts gained `useFieldIds`, `controlProps`, `NativeFieldLabel` and `NativeFieldFooter` beside the React Aria ones; the CSS reads data attributes the components set (`data-selected`, `data-indeterminate`, `data-disabled`, `data-invalid`) and native `:hover`, `:focus-visible`, `:has(input:focus-visible)`. The desktop table uses a private React Aria `SelectionCheckbox` (`Table/SelectionCheckbox.tsx`) until U6. With the login's fields off React Aria the first route is 215.4 KB gzip; React Aria's core moved to the signed-in chunk (the home adds 94.8 KB, from 76 KB) until the last fields move. Form lost the unused `validationErrors` prop. U3 finished: Select keeps its button trigger and opens MUI's `Popover` with a `MenuList` as the listbox (role `listbox`, items `option`, search box past 10 options); Combobox is MUI's `Autocomplete` around the set's own input (`renderInput` in MUI 9 takes `params.slotProps.input` and `params.slotProps.htmlInput`); inside a dialog both render their list in it (the Popover's `container` is the closest dialog, the Autocomplete uses `disablePortal`), because a React Aria modal hid MUI's body-level portal from assistive technology and from 7 web tests. FileUpload uses hidden file inputs per button and native drag events. Full E2E after U3: 154 passed, 21 skipped, 0 failed; first route 216.0 KB gzip.
