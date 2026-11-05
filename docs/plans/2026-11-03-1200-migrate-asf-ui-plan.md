---
title: The web app on the asf UI system, in light and dark
type: migrate
status: in-progress
source: plan
date: 2026-11-03
doc_review: 2026-11-03
---

# The web app on the asf UI system, in light and dark

## Goal
Every page of the web app is built from the organization's asf UI system (its component contract, template, shell, palette, fonts and Solar icons), looks like the asf design in light and in dark, and does everything it did before, on phones and computers, in Bengali and English with English digits.

## Problem
The owner decided on 2026-11-03 (D-150) to take the whole asf system of the assunnah-engineering kit, so this app looks and is built like the organization's other apps. Today the app has its own component set (`packages/ui`, D-103, ADR-015) with the brand of UX-01 and UX-13 and the look of D-145. This plan is the first part of D-150: the UI, inside this repository. The repository split and the shared package are their own plans afterwards.

## Requirements
- **R1** Every page and dialog of `apps/web` is built only from the asf contract (`apps/web/src/ui`); nothing imports `@css/ui` any more, and a lint rule refuses it.
- **R2** The look is the asf design: the asf palette (green #00A76F scale, dark primary buttons), Public Sans with Noto Sans Bengali, the asf shapes and shadows, Solar icons. Numbers stay in English digits in both languages (UX-05).
- **R3** Light and dark: the app follows the device until the person picks a mode; the choice stays on the device; every page passes axe in both modes and both languages.
- **R4** The phone layout keeps what it has: bottom tabs and the "more" sheet, the rail, the offline banner, the sync chip, the bell, the language switch, the profile menu; no page scrolls sideways at 360 px. On a computer the asf sidebar (folding to a rail) and header carry the same destinations.
- **R5** Every feature works as before: the existing unit, component, API and E2E tests pass, changed only where the markup changes.
- **R6** Every text comes from the bn and en catalogues; the asf pieces' own words (`UiLabels`) come from the catalogue too.
- **R7** The first route stays within the 250 KB gzip budget, or the owner approves a new budget (features are never cut for size).
- **R8** Each piece this app adds to the asf contract is recorded for the kit (`local.json` with a checked screenshot), so a person can bring it into the kit for every app.
- **R9** The design documents, the decision record, the constitution and the stack profile describe the new system; the old set, the Lucide icons, UbuntuSans, Bornomala, the old tokens and the old `ui` catalogue words are removed at the end.

## Scope
- In: `apps/web` (every page, the shell, the dev gallery, the tests and E2E), `packages/ui` (kept until the end, then removed), the design documents, `CLAUDE.md`, the constitution's design section, a new ADR.
- Out (their own plans): the split into a frontend and a backend repository; the shared code as a private package; changes in the plugin kit itself (the harvest of the new pieces is done by a person in the plugin repository); the API.

## Key decisions
- **The whole asf system** (D-150, owner 2026-11-03): its contract, template and shell, not only the look.
- **The asf palette and fonts** replace UX-01 and UX-13 and the look of D-145; English digits stay (UX-05).
- **Light and dark**, following the device until the person picks.
- **The UI first, inside this repository**, module by module; the split comes after.
- **The constitution's design section** (MASTER_PROMPT §12 and the typography line) is amended to the asf system: confirmed by the owner in chat on 2026-11-03.

## Technical decisions
- **Where it lives** (RE-UI-01, RE-UI-02, RE-UI-03): `apps/web/src/ui/` gets the kit's frontend layout: `contract.ts` and `tokens.ts` from `kit/fe/src/ui/`, `index.ts` with the one template line, and `templates/asf/` from `kit/templates/asf/src` (kit 0.29.0). Pages import from `@/ui` (the `@/` alias already exists in `apps/web/vite.config.ts` and `tsconfig.json`). So the frontend repository of the later split already has the kit's shape.
- **Libraries:** `@mui/material` 9.5.0, `@mui/x-date-pickers` 9.16.0, `@emotion/react` 11.14.0, `@emotion/styled` 11.14.1, `dayjs` 1.11.23 (the kit's `locks/fe/asf.json`) and the two fonts `@fontsource-variable/public-sans` and `@fontsource-variable/noto-sans-bengali` 5.3.0 (OFL) go into `apps/web/package.json`; `packages/ui` moves to the same MUI versions, so the app has one copy of each while both sets live.
- **Clean room:** the asf template is the organization's own code (NOTICE.md); nobody opens `kit/templates/minimal/` or any Minimal download while building or extending it.
- **Coexistence while the pages move:** `@css/ui` and `@/ui` live side by side on this branch. The asf `UiProvider` wraps the app; a page that has not moved yet keeps the old provider around it. The branch merges to `main` once, at the end (U20), so `main` never shows a mixed app; a draft pull request runs CI on the way.
- **Missing pieces** (RE-UI-04, the ae-ui build steps): asf has no phone card list, selection, sort or row actions in its table, and no Combobox, Checkbox, Radio, Switch, ConfirmDialog, generic menu, bottom sheet, FileUpload, Stepper, Timeline, progress bar, offline banner, bottom tabs or several display pieces. Each is added to the extended section of `apps/web/src/ui/contract.ts`, implemented in `templates/asf/components/` in the asf style (DESIGN.md: radius 8 and 16, the card shadow, the soft status style), test first in `ui.extended.test.tsx`, and recorded in `templates/asf/local.json` with its screenshot (R8).
- **Headings:** Public Sans everywhere in the app; Barlow is not loaded (asf DESIGN.md keeps it for the public site's display headings).
- **Texts** (I18N rules, `css/no-literal-ui-text`): the asf `UiLabels` come from a new key group `asf` inside the `ui` namespace (`packages/shared/src/i18n/messages/{bn,en}/ui.json`), passed to the asf `UiProvider`; the old groups of that file are removed in U19 with the old set. Counts go through `@css/shared/format`, so digits stay English.
- **Dark mode:** the asf theme's CSS variables (`data-color-scheme`, prefix `asf`, `defaultMode="system"`); the app's own CSS (22 files in `apps/web/src`) reads only asf variables or app variables defined for both schemes; the 16 `rgb()/rgba()` literals move to variables.
- **Dates:** asf date fields use ISO strings with `""` for empty; our forms convert to `null` at the request boundary, where the API expects it.
- **Icons:** Solar through the asf `Icon`; the Lucide names map to asf icon names, and icons the app needs beyond the 62 are added with the template's `scripts/build-icons.mjs` (CC BY 4.0 attribution kept in the generated file).
- **Bundle** (R7): `pnpm --filter @css/web bundle:report` is recorded at U2 (baseline), U8 (the shell) and U10 (the first pages), so a split, a lazy load or a budget question comes early, never at the end.
- **Each page unit ends** with no `@css/ui` import left in its folders (`grep -rl "@css/ui"` over them).
- **Stack profile** (ST-43): the UI line of `CLAUDE.md` becomes the asf system in U1 and is finished in U19.

## Implementation units

### U1. The decision record, the ADR, the constitution and the stack profile
- **Goal:** the documents say what the app moves to and why, before code.
- **Requirements:** R9
- **Files:** `docs/architecture/ADR/ADR-016-asf-ui-system.md` (new; supersedes the look of ADR-015), `docs/architecture/ADR/README.md` (index), `CLAUDE.md` (stack profile UI line; the UI rules section: the asf palette and fonts, light and dark), `docs/MASTER_PROMPT.md` (version note, §12 colours and typography, the typography line), `docs/DECISION_LOG.md` (D-150 is already written on this branch; U1 commits it and links the ADR).
- **Approach:** like ADR-015 (`docs/architecture/ADR/ADR-015-mui-core-component-set.md`); the constitution's own version notes at its top.
- **Tests:** `pnpm docs:check`.
- **Done when:** the documents name the asf system and pass the check.
- **Depends on:** none
- **Size:** S
- **Risk area:** none
- **Status:** done

### U2. The asf contract and template in the app, beside the old set
- **Goal:** `@/ui` works in the app with the asf template, the asf fonts and the catalogue's words, while every page still uses the old set.
- **Requirements:** R1, R2, R6, R7
- **Files:** `apps/web/src/ui/contract.ts`, `tokens.ts`, `index.ts`, `apps/web/src/ui/templates/asf/**` (from the kit), `apps/web/src/ui/templates/asf/local.json`, `apps/web/package.json` and `packages/ui/package.json` (the libraries above), `pnpm-lock.yaml`, `apps/web/src/app.tsx` and `components/AppProviders.tsx` (the asf `UiProvider` with labels and the router link), `packages/shared/src/i18n/messages/{bn,en}/ui.json` (the `asf` key group), `packages/config/eslint.config.mjs` (the boundary rule: MUI and Emotion also allowed in `apps/web/src/ui/templates/**`), `apps/web/test/template-boundary.test.ts`, `apps/web/test/class-names.test.ts` (the asf styles are MUI styles, not class names), `docs/testing/PERFORMANCE.md` (the baseline).
- **Approach:** the kit's frontend layout (`kit/fe/src/ui/`) and template (`kit/templates/asf/src`), copied unchanged; the providers follow `apps/web/src/app.tsx` today.
- **Tests:**
  - unit: the kit's `ui.contract.test.tsx` and `ui.extended.test.tsx` run green in the `web` Vitest project; the labels test: every `UiLabels` key has a bn and an en text.
  - existing: the whole web suite stays green (`pnpm vitest run --project web`).
- **Done when:** a test page renders asf pieces in both languages; the boundary and class-name tests pass; `pnpm vitest run --project web` is green; the bundle baseline is recorded.
- **Depends on:** U1
- **Size:** L
- **Risk area:** none
- **Status:** done

### U3. Light and dark mode and the token bridge
- **Goal:** the whole app follows the device's mode until the person picks one, also on pages not moved yet.
- **Requirements:** R3
- **Files:** `apps/web/src/ui/templates/asf/theme/*` (if a piece needs it), `packages/ui/src/styles/tokens.css` (the old token names point at asf variables in both schemes while the pages move), the 4 files with colour literals (`features/registration/register.css`, `features/home/home.css`, `components/auth-shell.css`, `components/shell/shell.css`), `apps/web/index.html` (the scheme attribute before paint, so there is no flash), `packages/ui/src/styles/styles.test.ts`, `docs/ui/DESIGN_SYSTEM.md` §2.9 (the token block the test reads), `apps/web/e2e/a11y.spec.ts` (the mode as a second axis of the sweep), `apps/web/e2e/theme.spec.ts` (new).
- **Approach:** the asf `ui-provider.tsx` and `theme.ts` (`cssVariables`, `colorSchemeSelector: 'data-color-scheme'`); the mode button is asf's `color-mode-button.tsx`.
- **Tests:**
  - unit: the token test reads the new block for both schemes; a dark-mode test renders a page with `data-color-scheme="dark"` and checks the surface and text variables.
  - e2e: `theme.spec.ts`: at `/` as `head@example.org` in a light browser, the app bar's "অন্ধকার মোডে যান" turns the page dark (`html[data-color-scheme="dark"]`, the body `rgb(20, 26, 33)`), a reload keeps it, "আলো মোডে যান" turns it back; a dark browser starts dark. (Corrected while building: the asf switch toggles light and dark, and the device's mode applies until the person picks, which is R3; there is no separate "like the device" choice.)
- **Done when:** the mode follows the device and the person's choice stays; the pages not moved yet are readable in dark through the bridge. (Corrected while building: the dark axis of `a11y.spec.ts` comes with each page unit from U10, since a dark sweep of the pages not moved yet would check the bridge, not the pages.)
- **Depends on:** U2
- **Size:** M
- **Risk area:** none
- **Status:** done

### U4. The table: phone cards, selection, sort, row actions, the toolbar
- **Goal:** the asf `DataTable` and `FilterBar` do everything our lists use.
- **Requirements:** R1, R4, R5, R8
- **Files:** `apps/web/src/ui/contract.ts` (extended `DataTable` and `FilterBar` props), `apps/web/src/ui/templates/asf/components/data-table.tsx`, `filter-bar.tsx`, `ui.extended.test.tsx`, `local.json`.
- **Approach:** the behaviour of our `packages/ui/src/templates/mui/Table.tsx` (cards below 768 px through a `cardRenderer`, row selection with a bulk bar, sort, `rowActions` with the named actions header, column `priority`, cursor and page pagination, the toolbar's search, chips and active filters), drawn in the asf style (grey header row, dashed dividers).
- **Tests:**
  - unit: a phone width shows cards with their actions; selection reports the ids; sort calls back; the actions header is named; the empty, loading and error states; axe in bn and en, light and dark.
- **Done when:** the scenarios pass and the piece is in `local.json` with its screenshot.
- **Depends on:** U2
- **Size:** L
- **Risk area:** none
- **Status:** done

### U5. Fields, choices and dialogs
- **Goal:** every form control and overlay the pages use exists in asf.
- **Requirements:** R1, R5, R8
- **Files:** `apps/web/src/ui/contract.ts`, `apps/web/src/ui/templates/asf/components/` (Combobox, SelectField with search and "other", Checkbox, CheckboxGroup, RadioGroup, Switch, number, phone and password handling in `TextField`, the field states locked and request-correction, ConfirmDialog with reason and pending, a generic Menu, Dialog `dismissible` and full screen on phones, the bottom sheet of `Drawer`, FileUpload with preview and progress, ErrorSummary, FormSection), `ui.extended.test.tsx`, `local.json`.
- **Approach:** our pieces in `packages/ui/src/components/{Field,FileUpload,Modal,Menu}` and `templates/mui/{Select,Combobox,Overlay,Menu}.tsx` for behaviour and accessibility; the asf `form-fields.tsx` and `dialog.tsx` for the look.
- **Tests:**
  - unit: each piece's label, keyboard use, error and disabled states; the confirm dialog needs its reason; axe in both languages and modes.
- **Done when:** the scenarios pass and every piece is in `local.json`.
- **Depends on:** U2
- **Size:** L
- **Risk area:** none
- **Status:** done

### U6. The display pieces
- **Goal:** the remaining pieces of our pages exist in asf.
- **Requirements:** R1, R4, R5, R8
- **Files:** `apps/web/src/ui/contract.ts`, `apps/web/src/ui/templates/asf/components/` (Stepper, Timeline, ProgressBar, StatFilterBar, IconTile, PersonCell, the profile banner with its sections and contact list, a status `Chip` map, OfflineBanner, Disclosure, ChoiceTiles, BulkRow, Skeleton, CopyButton, AttentionCard, `Button` icon-only and ghost), `ui.extended.test.tsx`, `local.json`.
- **Approach:** our pieces in `packages/ui/src/components/*` for behaviour; the asf `card.tsx`, `stat-card.tsx` and `chip.tsx` for the look.
- **Tests:**
  - unit: names and roles of each piece, the status chip always with its words, the offline banner's live region; axe in both languages and modes.
- **Done when:** the scenarios pass and every piece is in `local.json`.
- **Depends on:** U2
- **Size:** L
- **Risk area:** none
- **Status:** done

### U7. The icons
- **Goal:** every icon of the app is a Solar icon through the asf `Icon`.
- **Requirements:** R2
- **Files:** `apps/web/src/ui/templates/asf/scripts/build-icons.mjs` (the icon list), `apps/web/src/ui/templates/asf/components/icon-data.ts` (generated), `apps/web/src/ui/contract.ts` (`ExtendedIconName`), `apps/web/src/ui/icon-map.md` (Lucide name to asf name, for the moving pages).
- **Approach:** the template's own script and its attribution header.
- **Tests:**
  - unit: every icon name of the map renders; the generated file carries the attribution.
- **Done when:** the map covers every Lucide icon the app imports (96 files in `apps/web/src`).
- **Depends on:** U2
- **Size:** M
- **Risk area:** none
- **Status:** done

### U8. The shell, the shared pieces and the phone layout on asf
- **Goal:** the signed-in shell, the sign-in pages and every shared component are asf, and the phone keeps its tabs, sheet, banner and chips.
- **Requirements:** R1, R3, R4, R7
- **Files:** `apps/web/src/components/shell/{AppShell,AppBar,BottomTabs,MoreSheet,NavLinks,ProfileMenu,UpdateReady,breadcrumb,use-online}.tsx|ts` (AppShell on the asf `AppShell` with the header actions: bell, sync chip, language switch, mode, account menu; the bottom tabs and "more" sheet as a new asf piece `BottomNav`; the rail; breadcrumbs through `Page`), `apps/web/src/components/{AccountPage,AppProviders,AuthShell,FileImage,LanguageSwitch,PasswordRules,PersonPhoto,RouteError}.tsx`, `apps/web/src/lib/{auth.tsx,use-file-upload.ts}`, `apps/web/src/admin/{AdminLayout,StatisticsBar,UserSearch}.tsx`, `apps/web/src/admin/{area-chips,list-paging,navigation}.ts`, `apps/web/src/ui/contract.ts` (`BottomNav`, header slots), `shell.test.tsx`, `docs/testing/PERFORMANCE.md` (the bundle after the shell).
- **Approach:** the asf `shell/app-shell.tsx` and `account-menu`; our `components/shell/AppShell.tsx` for the widths (640 and 1024 px) and the destinations of `admin/navigation.ts`.
- **Tests:**
  - unit: the existing `shell.test.tsx` scenarios on the new markup (official's sidebar, volunteer's rail and tabs, more sheet, counts, crumbs, offline banner, sync chip, update ready, logout warning).
  - e2e: `shell.spec.ts` and `home.spec.ts` on the mobile, desktop and iphone projects, updated for the new markup: the tabs "হোম", "আমার প্রকল্প", the "আরও" sheet, the sidebar's group titles, the account menu's "আমার প্রোফাইল", "লগআউট".
- **Done when:** the shell tests and specs pass in both modes; nothing scrolls sideways at 360 px; no `@css/ui` import left in the files listed.
- **Depends on:** U3, U4, U5, U6, U7
- **Size:** L
- **Risk area:** none
- **Status:** done

### U9. The gallery and the shared test helpers
- **Goal:** the dev gallery shows the asf pieces, and the test helpers render with the asf provider.
- **Requirements:** R5, R8
- **Files:** `apps/web/src/dev/Gallery.tsx`, `apps/web/e2e/gallery.spec.ts`, `apps/web/test/auth.tsx` and the render helpers, `apps/web/src/ui/testing.tsx` (an asf `renderWithUi`; `packages/ui/src/testing/*` stays until U19).
- **Approach:** the present gallery's sections, one per piece.
- **Tests:**
  - e2e: `/dev/components` shows every piece in both languages and modes; `gallery.spec.ts` axe passes.
- **Done when:** the gallery spec passes.
- **Depends on:** U4, U5, U6, U7
- **Size:** M
- **Risk area:** none
- **Status:** done

### U10. Sign-in, registration and the home
- **Goal:** the first pages every person sees are on asf.
- **Requirements:** R1, R2, R4, R5, R6, R7
- **Files:** `apps/web/src/features/{auth,registration,home}/**` (14 component files) and their tests, `docs/testing/PERFORMANCE.md` (the bundle with the first pages).
- **Approach:** each page swaps `@css/ui` for `@/ui` with the icon map; markup-bound test queries are updated, never their meaning.
- **Tests:**
  - existing: covered by the features' component tests and the `auth`, `registration`, `home` specs; updated for the markup only.
  - e2e: the same specs on mobile, desktop and iphone, and the a11y sweep of these pages in light and dark.
- **Done when:** the tests and specs pass; no `@css/ui` import left in these folders; the bundle is recorded.
- **Depends on:** U8
- **Size:** L
- **Risk area:** none
- **Status:** done

### U11. Account, notifications, sync and the volunteer's projects
- **Goal:** the rest of the phone-first pages are on asf.
- **Requirements:** R1, R4, R5
- **Files:** `apps/web/src/features/{account,notifications,sync,projects}/**` (25 component files) and their tests.
- **Approach:** as U10.
- **Tests:**
  - existing: their component tests; the `profile`, `official-profile`, `notifications`, `offline`, `assignment` specs.
  - e2e: the same specs and the a11y sweep of these pages in light and dark.
- **Done when:** as U10 (without the bundle line).
- **Depends on:** U8
- **Size:** L
- **Risk area:** none
- **Status:** done

### U12. Applications, the form renderer and the lookup
- **Goal:** the application pages are on asf.
- **Requirements:** R1, R5
- **Files:** `apps/web/src/features/{applications,forms,beneficiaries}/**` (15 component files) and their tests.
- **Approach:** as U10.
- **Tests:**
  - existing: their component tests; the `applications`, `application-rules`, `form-logic` specs.
  - e2e: the same specs and the a11y sweep in light and dark.
- **Done when:** as U11.
- **Depends on:** U8
- **Size:** L
- **Risk area:** none
- **Status:** done

### U13. Exports and the Media Team
- **Goal:** the export and media pages are on asf.
- **Requirements:** R1, R5
- **Files:** `apps/web/src/features/{exports,media}/**` (18 component files) and their tests.
- **Approach:** as U10.
- **Tests:**
  - existing: their component tests; the `exports`, `media` specs.
  - e2e: the same specs and the a11y sweep in light and dark.
- **Done when:** as U11.
- **Depends on:** U8
- **Size:** L
- **Risk area:** none
- **Status:** done

### U14. The system admin pages
- **Goal:** audit, handover, nisab, notification texts and deliveries, permissions, programs, settings, sessions and health are on asf.
- **Requirements:** R1, R5
- **Files:** `apps/web/src/admin/{audit,handover,nisab,notifications,permissions,programs,settings,system}/**` (19 component files) and their tests.
- **Approach:** as U10.
- **Tests:**
  - existing: their component tests; the `admin`, `admin-permissions`, `admin-settings`, `handover` specs.
  - e2e: the same specs and the a11y sweep in light and dark.
- **Done when:** as U11.
- **Depends on:** U8
- **Size:** L
- **Risk area:** none
- **Status:** done

### U15. Templates, volunteers, staff and registrations
- **Goal:** the people and registration pages are on asf.
- **Requirements:** R1, R5
- **Files:** `apps/web/src/admin/{templates,volunteers,staff,registrations}/**` (21 component files) and their tests.
- **Approach:** as U10.
- **Tests:**
  - existing: their component tests; the `staff-accounts`, `volunteers`, `roles` specs.
  - e2e: the same specs and the a11y sweep in light and dark.
- **Done when:** as U11.
- **Depends on:** U8
- **Size:** L
- **Risk area:** none
- **Status:** done

### U16. The beneficiary tab and the applications office
- **Goal:** the beneficiary and application admin pages are on asf.
- **Requirements:** R1, R5
- **Files:** `apps/web/src/admin/{beneficiaries,applications}/**` (21 component files) and their tests.
- **Approach:** as U10.
- **Tests:**
  - existing: their component tests; the `beneficiaries`, `beneficiary-merge`, `applications`, `application-rules` specs.
  - e2e: the same specs and the a11y sweep in light and dark.
- **Done when:** as U11.
- **Depends on:** U8
- **Size:** L
- **Risk area:** none
- **Status:** done

### U17. The projects
- **Goal:** the project list, overview, setup and volunteers pages are on asf.
- **Requirements:** R1, R5
- **Files:** `apps/web/src/admin/projects/**` (26 component files, one area with its setup sections; kept together because the setup screen shares its drawer and summary) and their tests.
- **Approach:** as U10.
- **Tests:**
  - existing: their component tests; the `projects`, `assignment` specs.
  - e2e: the same specs and the a11y sweep in light and dark.
- **Done when:** as U11.
- **Depends on:** U8
- **Size:** L
- **Risk area:** none
- **Status:** done

### U18. The form builder
- **Goal:** the form builder (three panes, drag and drop with its keyboard path) is on asf.
- **Requirements:** R1, R5
- **Files:** `apps/web/src/admin/forms/**` (26 component files, one screen whose panes share one drag-and-drop context, so kept together) and its tests.
- **Approach:** as U10; `@dnd-kit` stays (D-122), only the pieces around it change.
- **Tests:**
  - existing: the builder's component tests; the `form-builder` and `form-logic` specs.
  - e2e: the same specs at 1280 and 360 px.
- **Done when:** as U11.
- **Depends on:** U8
- **Size:** L
- **Risk area:** none
- **Status:** done

### U19. The old set out, the documents in
- **Goal:** only the asf system is left, and the documents describe it.
- **Requirements:** R1, R7, R8, R9
- **Files:** `packages/ui` (removed, with its tests and fonts; the `@css/ui` workspace entry out of `pnpm-workspace.yaml` and every `package.json`), `pnpm-lock.yaml` (regenerated), `apps/web/package.json` (`lucide-react` out; the `dev` script without `node scripts/fonts.mjs`), `apps/web/scripts/fonts.mjs` (out; `scripts/icons.mjs`, the app icons from the logo, stays), `packages/config/eslint.config.mjs` (`@css/ui` refused), `apps/web/src/sw.ts` (the precached fonts), `packages/shared/src/i18n/messages/{bn,en}/ui.json` (the old groups out), `docs/ui/DESIGN_SYSTEM.md`, `docs/ui/DESIGN_BRIEF.md`, `docs/ui/brand/colors.md`, `docs/ui/SCREENS.md` (the look notes), `docs/testing/PERFORMANCE.md`, `CLAUDE.md` (the stack profile and the repository map), `apps/web/src/ui/templates/asf/local.json` (every added piece with its screenshot).
- **Approach:** the removal after the last page moved; then the first route is measured again and the owner sets the lasting budget in place of the move's 400 KB (D-152), with the measurement and what could still be split or loaded later laid out for the choice; never cut a feature.
- **Tests:**
  - unit: the lint rule refuses `@css/ui`; `pnpm --filter @css/web bundle:report`; `pnpm i18n:check` (no unused keys).
- **Done when:** no `@css/ui`, `lucide-react`, UbuntuSans or Bornomala left; the owner has set the lasting first-route budget and `bundle:report` passes it; `pnpm docs:check` passes.
- **Depends on:** U9, U10, U11, U12, U13, U14, U15, U16, U17, U18
- **Size:** M
- **Risk area:** none
- **Status:** todo

### U20. The full run and the screenshots
- **Goal:** the whole app is checked end to end in both modes and both languages, and the owner gets the screenshots.
- **Requirements:** R3, R4, R5
- **Files:** `apps/web/e2e/screens.spec.ts` (each page at 1280, 768 and 360 px in light and dark), `docs/STATUS.md`.
- **Approach:** the present screenshot spec, with the mode as a second axis.
- **Tests:**
  - e2e: every spec on every project; the a11y sweep in light and dark; the screens spec in both modes.
- **Done when:** `pnpm test` and `pnpm e2e` are green; the screenshots are in `apps/web/test-results/screens/` for the owner.
- **Depends on:** U19
- **Size:** L
- **Risk area:** none
- **Status:** todo

## Checkpoints
- **Mode:** grouped (one by one 7, grouped 13, all at once 2; with 20 units one by one is not used, so its 7 went to grouped). Each page unit is 14 to 26 component files plus their tests, over 25 files on its own, so the size rule puts a checkpoint after every page unit.
- **Signals:** N 20, L 6,650, R 0, Fd 6, C 7, P 2
- **C1** after U2: foundation for every later unit and a new pattern (the kit layout in the app)
- **C2** after U3: a new pattern (dark mode and the token bridge)
- **C3** after U5: foundations (the table, the fields and dialogs; U4 and U5 together stay under the limits)
- **C4** after U7: foundations (the display pieces and the icons; U6 and U7 together stay under the limits)
- **C5** after U8: foundation (the shell and the shared pieces) for every page unit
- **C6** after U9: the size limit (U10 alone passes 25 files)
- **C7** to **C15** after U10, U11, U12, U13, U14, U15, U16, U17 and U18: the size limit, one page unit each
- **C16** after U19: the size limit (the removal of `packages/ui` touches more than 25 files)
- **C17** after U20: end, with the whole branch's scripted checks

## Verification
- `pnpm typecheck`, `npx eslint . --ignore-pattern ".claude/**"`, `npx prettier --check apps packages docs`, `pnpm i18n:check`, `pnpm docs:check`
- `pnpm vitest run --project web`, then `pnpm test`
- `pnpm --filter @css/web build` and `pnpm --filter @css/web bundle:report`
- `pnpm e2e` (Playwright on the mobile, desktop and iphone projects; on this machine `--workers 2`), with `a11y.spec.ts` and `screens.spec.ts` in light and dark

## Risks and rollback
- The table and the shell are the largest pieces; every page depends on them, so they are reviewed before any page moves (C3, C5).
- Many asf pieces are new here; each is built test first and checked in both modes before a page uses it.
- Playwright queries bound to the old markup change with the pages; a spec changes only its locators, never what it proves.
- The bundle carries both sets until U19; it is measured at U2, U8 and U10, so a split, a lazy load or a budget question comes early (R7).
- Rollback: the branch merges once at the end; until U19 the old set stays in place, so any unit can be reverted on the branch, and after the merge a revert of the merge commit restores the old app.

## Definition of done
- All units done and their tests pass
- Verification commands pass
- `ae-review` has run at every checkpoint, with no open P0 or P1
- Code from abandoned attempts is removed

## Progress
- **Branch:** `feat/asf-ui` (from `main` at eb66be05, after PR #38)
- **Updated:** 2026-11-04
- **Next:** C15: the review of U18
- **Reviewed through:** C14 at 8e1038bd (fixes in the next commit)
- **Uncommitted:** none
- **Notes:** the owner confirmed in chat on 2026-11-03: the whole asf system (UI and the later repo split), the asf colours and fonts, light and dark, the UI first, the shared code as a private package later, and the constitution amendment of the design section. U2: the kit is version 0.7.0 inside plugin 0.29.0; the asf form pieces are built on `react-hook-form` (7.91.0, with `@hookform/resolvers` 5.9.2), which came with the system (its resolver's optional ajv peer is unmet and unused); the asf files keep the kit's formatting (`.prettierignore`), so a harvest shows only real changes; the template's two Node scripts live in `apps/web/scripts/asf/` with corrected paths; the kit's contract test uses two small local helpers instead of the kit app's API client; Barlow is not loaded and `tokens.ts` sets Public Sans for headings; `APP_NAME` is the manifest's short name "ASF Charity" (page titles get settled with the shell in U8); MUI's colour scheme calls the older `matchMedia(...).addListener`, so the five test stubs of `matchMedia` got the two older methods; the first route is 284.8 KB on the branch (the asf provider beside the earlier set), recorded in PERFORMANCE.md and measured again at U8 and U10. C1 (T2, three reviewers): the asf baseline is unlayered and styles the body of the pages not moved yet, so a device in dark mode would have shown dark text on dark until U3 (P1): the asf provider starts in light with its own storage keys (`asf-mode`, `asf-color-scheme`) until U3's bridge; the stack profile names `react-hook-form` and the earlier set's MUI 9.5 and 9.16; the registry script's run check works on Windows (`pathToFileURL`); the scripts' comments name repo paths; one `stubMatchMedia` helper in `apps/web/test/match-media.ts`; a test that the root hands asf its words. For U7: check that the generated icon bodies hold only drawing elements (no `on*`, no `script`), and pin the Solar version the script reads. Left as P3: the public shell's footer links take any address (the app has no public shell). U3: the earlier set's MUI theme reads the token values as colours, so the old tokens cannot point at asf variables; instead `apps/web/src/styles/scheme-bridge.css` gives the old colour names asf dark values under `html[data-color-scheme='dark']`, unlayered like the old tokens (a layered rule loses to them); `--color-brand-ink` stays dark there, being both the sidebar's surface and a text colour, so some labels on soft green read dim in dark on the pages not moved yet (branch only); the old app bar gets `--color-app-bar`; the asf switch became the contract piece `ColorModeButton` (exported, in `local.json` with `docs/ui/asf-pieces/color-mode-button.png`) and sits in the old app bar until U8; `tokens.css` and DESIGN_SYSTEM §2.9 stay as they are until U19. C2 (U3) taught: MUI makes `Channel` variables only for the palette's main, light, dark and contrast shades, the text, background, divider and action colours, never for `grey`, so the bridge uses the asf CssBaseline's `--asf-neutral-500-channel` and `background-defaultChannel`; the asf variables exist only once React has started, so `public/color-scheme.js` (a file, for the content security policy) marks the page before the first paint and the bridge's page, card and text colours carry the asf dark values as fallbacks; the colour-mode test moved to `ui.local.test.tsx`. The owner had the Phase 0 HTML mockups removed (D-151, commit 889825e0); the earlier set itself goes in U19. U4 built the table on asf with these choices: the rows become cards below the asf md breakpoint (900 px, not 768), so a tablet held upright gets cards; the earlier set's keyboard grid (one tab stop, arrow keys between cells) is not carried over: the table is a native table, a row that opens takes focus and opens with Enter, and every control in it is in the tab order; column priority 4 (the split view) is gone, the two columns that used it take 3; the filters' panel on a phone is the asf side drawer until U5 adds the bottom sheet. Screenshots for a piece are taken from a throwaway Vite page outside the app (an untracked `apps/web/.shot/` was left from U4: delete it). U5 was built in four committed steps (choices; text kinds, field states, error summary and form section; overlays; file upload), each with its own test file `ui.local.<area>.test.tsx` over the helpers in `local-test-support.ts`. Choices: the select becomes a combobox above 10 options, as the earlier set did. MUI 9 has no `disableEscapeKeyDown`: a dialog that is not dismissible gets no `onClose`, and a drawer's side is a class on its root (`MuiDrawer-anchorBottom`). Icons U7 must add: a lock (the locked field uses the shield for now) and a crossed eye (the password button shows the eye both ways). The U5 pieces have no screenshot yet; the gallery step U9 takes them for local.json. C3 (U4, U5) taught: a table's selection outlives its page, so the bulk bar counts every chosen row and "select all" adds or removes only the rows shown; an error summary takes focus when errors appear or when the caller's `focusKey` (the submit count) changes, never on each correction; a server-search combobox keeps the option chosen while the next answer lacks it (MUI empties the text on leaving the field otherwise), and `valueLabel` names a saved value before any search; the filter bar sends a search only when its term changes, and `initialSearch` starts it from the address; files past the limit are refused with a reason; the type check takes extensions and any case, and only spares a wasted upload (the API reads the real type). The scanner's "password" finding on the show and hide password labels is a false positive; the duplicate-code finding against `packages/ui/src/provider/messages.ts` (`fill`) goes with the earlier set in U19. U6 was built in three committed steps (progress: stepper, timeline, progress bar, skeleton; people: tile, person cell, copy, profile banner, sections, contacts; states: status chip, counts that filter, offline banner, disclosure, choice tiles, bulk rows, attention card, icon button, small button), each with its `ui.local.<area>.test.tsx`. The text button is the ghost button of the earlier set. Icons U7 must add or swap: copy (the copy button shows the document icon), lock (locked field and closed state use the shield), eye-off (the password button), and a better match for submitted, draft and blocklisted in the status map. U7: the 140 Lucide icons the app imports map to 141 asf names (79 new) in `apps/web/src/ui/icon-map.md`; the Solar set is pinned at @iconify-json/solar 1.2.13 (fetched with `npm pack` into the scratchpad, never into the repository), whose bodies for the kit's 62 icons are byte for byte the kit's; the build script now refuses a body with anything but drawing elements, and the icon test fails when a page imports a Lucide icon the map lacks. The placeholders of U5 and U6 now use lock, eye-off, copy, send, rejected, block, cloud-upload, offline and camera. C4 (U6, U7) taught: a page's data must never become a link or an image source by itself, so `components/shared.ts` lets through only http, https, mail, phone and the app's own paths for links (`safeHref`, `appPath` for the router) and only the app's paths, local previews and embedded images for pictures (`safeImageSrc`); a timer that calls the page back keeps the latest callback in a ref, so a page that renders again does not restart it; a menu trigger whose label replaces its visible text must carry that text in its name, and each row's menu is named with its row; keys built from names take the index too. One registrations page test timed out once while three reviewers ran and passed three times alone (load, not a defect). U8 so far: the asf shell takes `compactNav` (the phone's tabs below sm, the rail up to lg and for a person without sidebar groups), counts and the app's own current on the links, the header's left slot, the banner slot and the sidebar's foot; the shell moved onto it with asf's breakpoints (tabs below 600 px, sidebar from 1200 px, where the earlier set used 640 and 1024), so an official between 1024 and 1199 px now gets the rail. The asf breadcrumb is a piece of its own and, on a phone, shows only the way back to the nearest page above, as the earlier one did. jsdom answers no media query, which MUI reads as a small screen and the earlier shell read as a desktop: the tests that read the sidebar stub a screen (`stubScreen` in `test/match-media.ts`); the kit's own tests rely on the small screen, so the setup keeps no default. The sidebar is named, so a page's own side column stays a separate landmark. A look at the running app showed the asf pieces drawn with the earlier set's theme: MUI pieces take the nearest theme, and the earlier provider sat inside the asf one. Now the asf provider is innermost and keeps its own light and dark mode (`disableNestedContext`), and each MUI component of the earlier set takes its own theme back (`inSetTheme` in `packages/ui/src/templates/mui/provider.tsx`), so pages not yet moved keep their look and routed links; the unit tests could not show this, as they render one provider at a time. U8 step c moved the shared components to asf (the account frame, the sign-in card, the error page with its own h1, the loading screen, the password rules, the person's photo pieces, the admin frame, the user search, the language switch as asf's group of pressed buttons with its tests and specs, and the types of the filter chips and upload items). The asf page takes `eyebrow` and `documentTitle={false}` (the app sets its own bilingual title through `DocumentTitle`; the kit writes its fixed English name). Two helpers stay on the earlier set on purpose and move with their lists in U14 to U16: `admin/list-paging.ts` (the old table's numbered-plus-cursor paging) and `admin/StatisticsBar.tsx` (Lucide icons from six pages). U8 step d: the E2E of the shell, the home, the light and dark switch, the admin area and the registration pass on the mobile, desktop and iphone projects (72). They first failed on colour contrast: the asf main green (#00A76F) as text on white reads 3.1:1 and its disabled grey 2.6:1, below the 4.5:1 the axe checks ask; text in green now takes the dark shade (the light one in dark mode, `brandInk` in `components/shared.ts`), quiet text takes the secondary grey, and the primary actions the dark button of the asf admin look (`darkButton`, `dangerButton`); the kit itself carries this weakness, a point for the harvest. The offline spec now checks the asf fonts offline, each with a letter it draws, and finds the banner by its region. The icon drawings (141 icons, 54 KB) load in a chunk of their own after the page appears (`loadIcons`); the first route is 376.4 KB against the 250 KB budget (284.8 KB at U2), the earlier set's provider alone 65.4 KB of it: the owner decides a budget for the move before the merge. C5 (U8) taught: the app had two asf providers (the root's and the shell's), each with its own light and dark state on the same storage key; now the asf provider is the root's alone, and an inner provider of the earlier set opens no MUI theme of its own but hands its routed theme to the set's components (`TemplateProvider` reads `SetThemeContext`), tested in `packages/ui/src/templates/mui/theme.test.tsx`; the folded sidebar follows the app's own current page and shows the counts like the full one. U9: the asf pieces have a gallery of their own at `/dev/asf` (`src/dev/AsfGallery.tsx`), beside the earlier set's at `/dev/components`, which goes in U19; `e2e/asf-gallery.spec.ts` checks it in both languages and modes at 360 and 1280 px with the full axe run and names each failing element with its markup and axe's reason. It found what the unit tests could not: the asf theme's unfilled field labels (the disabled grey, 2.7:1) and its error texts (the main red, 3.2:1), the kit's danger button, the status chips' dark shade on their tint, the field marks, secondary text on a chosen card's tint (4.47:1), and the profile banner and the screen-reader text widening a phone's page; all fixed (the theme's labels and error texts in `theme/overrides.ts`, the darkest shade on tints, `srOnly` pinned to the top left). The desktop run's pictures of each piece are in `docs/ui/asf-pieces/gallery-*.png`, named in `local.json`. The asf test helpers are `src/ui/testing.tsx` (`renderWithUi`, `expectNoAxeViolations`); the shell test uses them, the other tests move with their pages. C6 (U9): the gallery spec also opens the dialog and the drawer in both languages and modes, waiting for the panel's own finite animations before axe measures colours (a spinner or a pulse never ends, so waiting for every animation of the page hangs); the gallery's sections are found by test id; a normal `pnpm build` drops `VITE_DEV_GALLERY` and `VITE_OTP_DUMMY` from the caller's environment, so neither the galleries nor the dummy-code hint can reach a production build by accident. The owner raised the first-route budget to 400 KB for the move (D-152, 2026-11-04); U19 measures the route again once the earlier set has left, and the owner sets the lasting budget then. U10: the sign-in, the registration and the home are on asf in three committed steps; the owner had the photo of the Foundation's building removed from the sign-in and registration pages (D-153, with the component and the photos). The asf select is a combobox (a searchable one above 10 options), so the tests and the E2E helpers that pick an address or a profession ask for that role; the helpers of the renderer's form take either role while its other selects are still the earlier set's. New asf additions, in `local.json`: the button's end icon, a small named spinner, a figure card that links to the list it counts (`StatCard to`), and the summary banner's figures as a valid list of terms and values (the kit put boxes between them, an axe failure; the names wrap on a phone). The asf system has no error state: `components/LoadError.tsx` is the app's (an asf alert with the request id and a retry), for every page that moves. The home and the registration carry their own screen-reader class instead of the earlier set's `ui-sr-only`. The E2E of U10 found more than the unit tests could: the kit's soft chips, navigation counts and red text read 3.2 to 3.6:1 (now the darker shades), the registration's page colour was the earlier set's grey under asf labels (now the asf page colour), the earlier set's dialogs opened under the asf bar and tabs (its MUI theme now takes MUI's own layers, 1100 to 1400), and the E2E language helper still looked for the old radio group (the switch is a group of pressed buttons since U8). The a11y sweep now runs the sign-in, registration and home pages in dark mode too. U10's specs pass on the three projects (auth, registration, home, a11y, shell, theme, the asf gallery: 109), and so do the specs of the pages that share the address fields (projects, applications, offline, the form builder and its logic, application rules, beneficiaries, assignment, profile); the first route is 385.4 KB. C7 (U10, three reviewers; no security or logic finding) taught: a new shared component gets its own test even when a page's test reaches it (`components/LoadError.test.tsx`: the request id, the offline words, the retry); a budget's number lives in one place, so the CI comment, the test and CLAUDE.md point at `BUDGET_KB` instead of repeating it; the renderer's select helper of the E2E is one (`pickByLabel` in `e2e/support/forms.ts`). Left as P3: the E2E helpers' comments name both kinds of select until U19 removes the earlier one. U11 moved the sync centre, the inbox, the volunteer's projects and the account pages in four committed steps. New asf additions, in `local.json`: a close button on the alert, the icon button as a link (its tip opens inside its own bar, so it stays in a landmark while the page changes), and a longer name on a short button. The shared load error can carry the words of the server. The asf empty state's title is a paragraph, not a heading, and an asf alert has no class of its own, so tests find them by their words and their role. The earlier set's brand ink stays dark in dark mode (U3), so a page's own CSS takes the text colour for words on a soft green. The a11y sweep runs the account pages, the inbox, the volunteer's projects and the sync centre in dark mode too; U11's specs pass (profile, official profile, notifications, offline, assignment, shell, home, auth, a11y). Under a full parallel unit run a few long tests of pages not moved yet (registrations, permissions, handover) pass their time limit now and then and pass alone; the registration decisions now wait three seconds for their list as their own list wait does. C8 (U11, three reviewers; no security or logic finding; the scanner's javascript-url lead on the official's photo was a false positive, since the photo is a data URL the app makes from an image it fetched) taught: the asf avatar now takes only a source the app made or serves, as the tile and the person cell already did; a moved file's comments lose their plan and decision IDs in the same change (words and a document path instead); one tooltip with the portal flag rather than two branches. Left: the shared edit form of the volunteer's and the official's profile sections repeats a block (it did before the move; a refactor of its own). U12 moved the form renderer with its question fields and the public page, the NID lookup and the volunteer's applications in three committed steps (the earlier badge tone of a state moved to the office's pages). New asf additions, in `local.json`: a field's marks (locked, changed, officials only) are in its description, so a known person's locked name is read out as locked (the earlier field put it in the name, and the specs now check the description); tabs show a count; the date field shows DD-MM-YYYY and the picker's own words come from the labels (the kit showed "04 Nov 2026" with English part names on a Bengali page). The outlined asf field draws its label twice (once in its border), so a test finds a question by its role and name, and an item's text runs over lines. In dark mode the top bar's system name and the bell's and sync chip's counts took the earlier colours (the brand ink stays dark); they take the page's text colour and the darker shades now. The offline spec's address step waited on a list the phone had not cached yet twice in a long parallel run and passed in each rerun. The owner asked that a volunteer on no project see a calm note with a link to My projects instead of the load error on My applications (the own list answers 403 until the volunteer works on a project; a blocked volunteer gets an empty list, so a 403 there means no project). C9 (U12, three reviewers; no security finding) taught: one rule per meaning, so the office's badge tone is built from `stateTone` (`admin/applications/state-tone.ts` imports nothing of the earlier set) and both are tested; a page that reads two things names the one that failed and asks both again; the bold question name is one `QuestionTitle`. Checked against the earlier fields and kept: integers drop a minus sign, decimals keep two places and a phone keeps digits and a plus, as before. U13 moved the exports (dialog, column picker, progress, My exports, the PDF button) and the Media Team's pages (home, works list on the asf table with its row cards, the work page's panels, the member page) in two committed steps. The earlier dialog's primary and secondary actions become the asf dialog's one set of actions; each checkbox of an asf group now carries its option as its value (the export tests read the ticked columns from it, as a native form would send them). An asf field's name no longer carries the required mark, so a spec names a field by its label alone. The a11y sweep runs My exports and the Media Team's home in dark mode too; U13's specs pass (exports, media, a11y). C10 (U13, three reviewers; no security or logic finding) taught: a dialog that does one thing ends with the shared `components/DialogButtons.tsx` (cancel, then the named action; cancel waits while the action runs, as the dialog cannot close then either), in place of the pair each media dialog wrote; a spinner beside the same words keeps its name for the screen reader and the words for the eye only. U14 moved the permission panel, the nisab and the programs, then the audit viewer, the active sessions, the system health and the notification texts and deliveries, then the settings and the handover, in three committed steps. The asf table stands while its rows load, so the tests wait for the rows; the page header's extra line (the audit range) moves below the asf page by hand. New asf additions, in `local.json`: a loading button gives the focus back when its work ends (the button is disabled while it loads, which dropped the focus to the page, out of the dialog, so Escape no longer closed the notification text editor), and a table wider than its box becomes a named region in the tab order (axe asks that a scrolling region be reachable by keyboard; the effective permissions table). On a phone, the asf table with no rows shows only its empty state, unnamed, so the settings spec checks the storage table's name on the desktop only. The a11y sweep runs the ten system admin pages in dark mode in a test of their own (they did not fit the time of the sign-in and home test); U14's specs pass (admin, admin-permissions, admin-settings, handover, notifications, roles, a11y). The handover page's long first test got 15 seconds, as its neighbour has, since it ran out of time once in a full parallel run. C11 (U14, three reviewers; no security finding) taught: a page that reads several things hands the load error the one that failed, with the server's words, as the earlier error state did (the handover and the permission panel had passed only the first read); the asf table's empty text came as an English literal for a page that named none, so its default is now the `tableEmpty` label in both languages; a loading button counts as holding the focus from its focus on, so a browser that sends no blur when it is disabled gets the focus back too. Kept as before: the asf empty state's title is a paragraph (so the handover page's "pick an official" is no longer a heading, as on the pages moved earlier), and the notification texts' empty state reads the table's name, as it did. U15 moved the template library, the volunteer tab and profile, the officials with their profile and organogram, and the registrations with the edit requests in one committed step, then their specs; the counts above a list (`admin/StatisticsBar.tsx`) moved with them. New asf additions, in `local.json`: the cursor pager shows the counted page numbers between its own previous and next (the volunteer tab counts its first 10000 rows and goes by cursor past them), and the table's phone cards stay in one column inside the screen with a long word broken (a template key had widened the notification texts page at 360 px by 4 px; the screens spec, not in U14's set, found it). `components/PersonPhoto.tsx` has `PersonBanner`, the asf profile banner with the person's streamed photo, for the volunteer's and the official's profile. The asf table draws a row's actions on its phone card itself, so a card that drew them too showed two menus. The converter turned `Grid` openers into `Stack` without their closers (`pair_tags` in the scratchpad pairs them), renamed `id` to `value` in crumbs, facts and document slots that keep `id`, dropped a call's `shown`, and wrote a dialog's two ternary actions as text inside the fragment (the official dialog showed all four buttons and the words; the create test now checks each step's own buttons): a converted dialog's actions are read by eye. The asf stat bar shows every count unless told otherwise, so the volunteer tab passes the earlier five; its hidden counts are named "label value". The column helper of the export tests waits for a loaded body row, since the asf table draws its headers before its rows. The a11y sweep runs the people and registration pages in dark mode with a volunteer's and an official's profile; the organogram's program cards keep the dark green under white words in dark mode. U15's specs pass (staff-accounts, volunteers, roles, official-profile, registration, a11y, screens). C12 (U15, three reviewers; no security finding) taught: the asf table puts a row's actions on its phone card itself, and the earlier table did not, so every moved page whose card drew its own buttons showed them twice on a phone (the officials, their requests, the templates, and U14's audit, nisab, notification texts, programs, lists, sessions and effective permissions); the cards now draw none, the templates test counts a card's buttons at 360 px, and U16 to U18 leave the actions out of their cards (the beneficiary list and the duplicates page still draw them, on the earlier table); `PersonBanner` has its own test; the specs count the NID twice (the banner's fact and the details) instead of taking the first. Left for U16: `admin/list-paging.ts` still types its answer with the earlier set's pager, which the volunteer tab's asf cursor pager accepts as it is the same shape; it moves with the beneficiary and application lists. Kept: the staff edit requests' count takes the same icon as the volunteers' edit requests, as the icon map gives both. U16 moved the beneficiary tab with its 360° profile, history, contact and correction dialogs, the duplicates and merge pages, and the applications office (list with its bulk review, the review page, quotas and pulls, score, signals, unlocks, verification, decisions and the media referral) in one committed step, then their specs. The list pager (`admin/list-paging.ts`) now answers the asf cursor pager's type; the office's bulk review uses the asf table's own bar (its count in the asf words, so the page's own count word went); the earlier badge tone of a state (`state-tone.ts`) went, the chips take `stateTone`. New asf additions, in `local.json`: the counts of the stat bar, the offline banner and the progress bar follow the app's number grouping (`numberLocale`, which the app sets from its formatter's locale; asf wrote 2,000,000 beside the app's 20,00,000), and the link button takes the extended icons as the button does. A second pass after the converter (`asf_post.py` in the scratchpad) moves a card's subtitle into a quiet line, drops the description list's label width, names a confirm dialog's consequences and keeps the crumbs' ids; `list_page.py` moves a list page's filter groups, row menu, stat bar and selects as the volunteer tab was moved by hand. The pull bar of the quotas is outlined instead of tinted, so its quiet words keep their contrast. The a11y sweep runs the beneficiary pages in dark mode. U16's specs pass (beneficiaries, beneficiary-merge, applications, application-rules, media, exports, roles, screens, a11y); a long run with two workers lost the local preview server (port 3100) partway three times in a row, each time with no error of its own while the API answered, so the a11y spec ran with one worker (32 passed in 9.3 minutes) and the rest in smaller groups. C13 (U16, three reviewers; no security finding) taught: the asf table's bulk bar counts the selection it is given, so the office's list hands it only the chosen rows still on the page (a row another official moved stayed counted); the converter dropped a `Stack`'s element (`as="li"`), which left a list without items on the beneficiary profile, so every dropped `as` was looked up (the rest sat in table cells and cards, where a box is valid); the asf stat bar holds its cards' places while the first counts load, and the progress bar calls a figure against a target of 0 all of it, not a share of one; the export tests' wait for loaded rows takes up to 5 seconds, as a list page reads several things at once. Kept: a page past the counted range opens the last numbered page, as before and as its test says; the correction dialog's silence on a failure that is not the server's, as before. U17 moved the project list, the overview with its lifecycle actions, the setup screen with every section, its component drawer, wizard and review step, the volunteers of a project with the assign and change dialogs, and the transfer page in one committed step, then their specs. The earlier number field is the asf text field's `integer`, `decimal` and `money` kinds (the same cleaning and taka sign); the earlier row toggle is the asf switch with its lock reason as the hint; the project state's icons and tones (`state-look.ts`) are asf names; the page header's state chip (`project-state`, read by the specs) stands under the asf page title on the overview and the wizard; a select or date field that only shows a value is disabled, as the asf ones have no read-only; the setup's step warnings are asf warnings, read out politely (the earlier set made them assertive). The converter wrote a dialog's action that was an expression (`readOnly ? undefined : <Button>`) as text inside the fragment again (the component drawer; the lint rule against literal text found it): it now wraps such an action in braces. `u17_fix.py` in the scratchpad moves number fields, nullable selects named by the typecheck, checkbox labels and icon-button links. The a11y sweep runs the project pages in dark mode; U17's specs pass (projects, assignment, registration, application-rules, form-builder, screens, roles; the a11y spec with one worker, 36). C14 (U17, three reviewers; no security finding) taught: the earlier table wrote a cursor list's count line itself from `shown` and `total`, the asf cursor pager only shows the `summary` a page gives it, so the converter's drop of the two lost the line on five lists (the audit viewer, the deliveries and the sessions of U14, and the project list here; the duplicates page had its own words); `useCountLine` in `admin/list-paging.ts` writes it again in the common words (`list.result_count`, "25+" while another page follows a list without a total), the project list's test reads it, and the spec that a review found loosened checks it again, as a weakened check is not a fix; a project picker is searchable, so its clear button takes the filter back to every project, and it hands on null for an emptied choice; the basics section reads the program list for a viewer too, as its disabled select names the program from it. U18 moved the form builder (the three panes with `@dnd-kit` as it was, the editors of options, conditions and calculations, the versions, the public link, the preview, the ready forms and the question library) in one committed step; the page code outside `apps/web/src/admin/forms` and the dev galleries no longer imports the earlier set, which now stands only in `components/AppProviders.tsx` for U19. The converter's tag matcher took the first closing tag of a name, so a `Stack` inside a `Stack` came out with crossed closers; `stack_pre.py` in the scratchpad runs before the converter with a matcher that counts nesting and turns a `Stack` with its own element (`as="section"`, `"li"`, `"ul"`), class, role, name or key into that element (or a div) around a plain `Stack`. The builder's question types (`type-meta.ts`) carry asf icon names; its segmented choices are radio groups, as on the earlier pages; the header's chips and save state stand under the asf page title, the save state in a live paragraph (asf's text passes no `aria-live`). The asf disclosure is a named region itself, so a part inside a disclosure of the same name (the versions, the public link, the options) keeps no landmark of its own, as two landmarks of one name fail axe. The legend of a radio or checkbox group took the main green while focused (3.1:1), now the text colour, as a field's label (`theme/overrides.ts`, in `local.json`). `app-sr-only` in `styles/globals.css` is the app's screen-reader-only class (the home and the registration still carry their own). U18's specs pass (form-builder, form-logic, screens, the asf gallery; the a11y spec with one worker, 34 of 36 and then the Department Head's 4 after the legend's fix; one run lost the preview server again).
