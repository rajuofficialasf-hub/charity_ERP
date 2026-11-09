---
title: The web app on the asf UI system, in light and dark
type: migrate
status: done
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
- **Status:** done

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
- **Status:** done

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
