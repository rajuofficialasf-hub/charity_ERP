---
title: The owner's visual redesign, step 1 (the foundation and the 24 designed pages)
type: feat
status: in-progress
source: brainstorm
doc_review: 2026-11-01
date: 2026-11-01
---

# The owner's visual redesign, step 1 (the foundation and the 24 designed pages)

## Goal
An official who opens the ERP on a desktop or a phone sees the calm, premium look of the owner's own prototype: a dark green sidebar, a clear page header, soft white cards, readable tables and status pills, in the brand's colours and fonts. Every page the owner designed looks like its prototype screen, and every other page already shares the same foundation, with nothing a person can do today removed or moved.

## Problem
The owner finds the current app unpolished and disordered ("কোন প্রিমিয়াম ফিল নেই, সব কিছু অগোছাল") and drew the look they want in a clickable prototype (folder `C:\Users\ASUS\OneDrive - As-Sunnah Foundation\Desktop\assunnah-erp-complete-reference\assunnah-erp-reference`): `assunnah-erp-admin-prototype.html` with 21 internal screens, `assunnah-erp-prototype.html` (the dashboard), `assunnah-erp-beneficiaries.html`, `assunnah-erp-volunteers.html`, `assunnah-erp-volunteer-profile.html`, and the screenshots of each. The 24 designed pages are the admin prototype's 21 screens (`screenshots/01-my-work.png` to `21-password.png`, the My Work home included) plus the beneficiary list, the volunteer list and the volunteer profile. The app's structure already matches it (a grouped sidebar on a desktop, a rail on a tablet, bottom tabs on a phone, lists with counts and filters), so the gap is the look: the tokens, the shell and the shared components, then each designed page.

## Requirements

### The foundation (every page)
- **R1** The sidebar on a desktop is dark green, with the organisation's mark and name at the top, the destinations in their existing groups with a small group heading, the active destination clearly highlighted, a count beside a destination only where the app already knows that count, a short "সহায়তা প্রয়োজন?" card that says to contact the admin team (no link, since no help page exists), and the person's name and role at the bottom.
- **R2** The top bar carries the breadcrumb of the page, the language switch, the notification bell with its existing count, and the profile chip (initials, name, role) that opens the existing profile menu. There is no global search box.
- **R3** Every page opens with the same header: a small coloured label naming the area, the page title, one line saying what the page is for, and the page's actions on the right (wrapping under the title on a phone).
- **R4** A count or statistic is shown on a stat card: the label, the number in large type, a small icon on a soft tinted square, and one line of plain context where the app has it; a stat card that filters a list keeps its pressed state. No card shows a change against an earlier period, because the app does not compute one yet.
- **R5** Cards are white with rounded corners and a soft brand-tinted shadow on a light page background; a card has a title, an optional one-line description and an optional link or action on the right of its title.
- **R6** Tables have a quiet header row, row dividers, a person or record cell with an initials or icon tile beside the name and a muted second line (an id, a family size, a code), status pills with a dot and a word, and their existing search, filters and paging in the new look.
- **R7** Buttons, inputs, selects, badges, tabs, dialogs, drawers, alerts, empty states and progress bars take the new look from one place (the `packages/ui` set and its tokens), so a page built from the set changes without its own code.
- **R8** Every number stays in English digits (UX-05), in the stat cards, tables, badges and dates alike.

### The 24 designed pages
- **R9** The My Work home follows the prototype's dashboard: the greeting and the date, a dark green banner summing up the person's work from the data the home already loads, the stat cards, and the existing attention list and widgets in the prototype's card layout. Prototype blocks with no data behind them yet (the fund summary, the recent activity feed) are left out.
- **R10** The beneficiary list, the volunteer list and the volunteer profile follow their prototype pages: the page header, the stat cards, the list card with its search and filters, and the side cards the prototype shows where the app has their content.
- **R11** The 21 admin screens of the admin prototype follow their screens: projects, programs, templates, ready forms, registrations, duplicate review, staff, handover, permissions, settings, nisab, audit log, active sessions, system health, notifications, notification copy, delivery status, my profile, my devices and password change, and the My Work home (R9).
- **R12** No designed page loses a feature, a filter, an action, a field or a permission check it has today, and none gains a feature: the redesign changes how a page looks, not what it does.

### Phones and tablets
- **R13** The phone keeps its bottom tabs, the "more" sheet, the app bar and the 360 px rule (UX-03, UX-04), in the new look: the dark green colour, the cards, the stat cards (two per row), the page header and the tables as stacked rows; the tablet keeps its rail, restyled.

### Quality
- **R14** Every page keeps passing the accessibility sweep in both languages (contrast, focus, names), with the white text on the dark sidebar and banner at 4.5:1 or better.
- **R15** The first page a visitor loads stays within the 250 KB budget; the new look adds no web font and no image beyond the existing logo.

## Scope
- In: the tokens, the `packages/ui` components, the app shell (sidebar, rail, top bar, bottom tabs, more sheet), the page header, and the 24 pages of the prototype (R9 to R11), on desktop, tablet and phone.
- Out (not now):
  - A global search in the top bar, a workspace switcher, comparisons with an earlier period on stat cards, a fund summary and a recent-activity feed on the home: each needs work on the server first and becomes its own task when the owner asks.
  - The pages the owner did not design (the form builder, the projects' setup and applications, the review page, the beneficiary profile, media, the sync centre, exports, registration and sign-in; the notifications inbox is a designed page, `16-notifications.png`): step 2, each starting from an HTML mockup the owner approves before any code. Their shared parts change in step 1 with every page: the page header (R3), the top-bar breadcrumb (R2) and the set's components (R7); their own layout and content wait for step 2.
  - Any change to what a page does, its data, its API or its permissions.
  - Bengali digits and a dark theme.

## Key decisions
- **The prototype's layout, the brand's colours and fonts**: the owner chose the prototype's layout, cards, shadows, radii, spacing and dark sidebar, with the colours of `docs/ui/brand/colors.md` and the self-hosted UbuntuSans and Bornomala (the prototype's Noto Sans Bengali and its own hex values are not used). Governs R1 to R7, R15.
- **English digits stay** (UX-05), although the prototype shows Bengali digits. Governs R8.
- **Step by step, as needed**: step 1 is the foundation and the 24 designed pages; step 2 covers the other pages, each from a mockup first. Governs Scope.
- **The phone layout stays** (bottom tabs, more sheet, rail on a tablet) with the new look. Governs R13.
- **Prototype parts with no feature behind them are left out for now** (global search, workspace switcher, period comparisons); the sidebar help card stays, without a link. Governs R1, R2, R4, R9.
- **The shared parts reach every page in step 1**: the page header and the top-bar breadcrumb replace the old title row and the in-page breadcrumb on the undesigned pages too, so the app never shows two styles or two breadcrumbs; only those pages' content waits for step 2 (owner in chat, 2026-11-01, after the plan review). Governs R2, R3, Scope.
- **The page titles and labels people know stay as they are**; the prototype's short area label and one-line description are added in its words (with ae-bangla-copy), so nothing a person learned moves. Governs R3, R12.
- All of the above were given by the owner in chat on 2026-11-01 and are recorded as one decision in DECISION_LOG before the work starts.

## Success criteria
- Side by side, each of the 24 pages and its prototype screenshot read as the same design, in the brand's colours.
- The existing component tests and E2E journeys pass with no change to what they assert, except where a page's structure moves an element (a heading level, a card title).

<!-- ae-plan adds everything below -->

## Technical decisions
- **The stack profile stays as it is.**
  - The look lives in the existing `packages/ui` set on MUI core (D-103, ADR-015) and in the app's CSS on its tokens.
  - Nothing new is added: no dependency, no web font, no image (R15).
- **Tokens first, in one place** (RE-UI-01 to RE-UI-05; DESIGN_SYSTEM 2.9).
  - Every colour, shadow, radius and space comes from `packages/ui/src/styles/tokens.css`. Its mirror `src/tokens.ts` is read by `templates/mui/theme.ts`.
  - `styles.test.ts` keeps both files equal to DESIGN_SYSTEM 2.9. A token change therefore edits all three files and the document together.
- **Colours come from colors.md, with derived tints where the prototype needs one** (the owner's choice, D-145).
  - The dark sidebar and the banner use brand ink `#0F2920`. Brand primary-dark `#007B3E` marks the active item and runs through the banner's gradient.
  - The page background, the soft icon squares and the status pill fills are tints mixed from brand tokens. They are written into `docs/ui/brand/colors.md` §2 as derived tokens with their contrast checks, as the four derived status tints already are. None is a free hex.
- **Radii and shadows:**
  - Cards and dialogs keep `--radius-lg` 16 px; the prototype's 15 px rounds to it. Controls keep `--radius-md` 8 px.
  - The card shadow becomes the prototype's single soft, ink-tinted shadow through `--elevation-1` (UX-02: no heavy shadows).
- **A page header component.**
  - `PageHeader` goes in `packages/ui/src/components/PageHeader/`, with an eyebrow, title, description and actions. It follows the pattern of `Card` and `ProfileHeader`.
  - It replaces the `admin-title`, `admin-title-row` and `admin-title-actions` classes of `apps/web/src/admin/admin.css` on every page that uses them.
- **Stat cards with an icon.**
  - `StatCard` and the items of `StatFilterBar` take an optional `icon`, using the existing `Icon` component and lucide icons, and a `tone` for the soft square.
  - They keep their pressed state, and their `delta` prop stays unused for now (R4).
- **The breadcrumb moves into the top bar.** This is the plan's one new pattern.
  - The shell renders it from the navigation's group and destination (`admin/navigation.ts`).
  - A detail page adds its own last crumbs through a small context (`useBreadcrumb`).
  - This replaces the in-page `Breadcrumb` of the profile, staff, duplicates, organogram and media pages.
- **Sidebar counts come from the attention list.** The shell reads the cached `GET /me/attention` (the home's query, `ATTENTION_KEY`) and shows each kind's count beside the destination `ATTENTION_ROUTES` names. Nothing changes on the server.
- **Words:**
  - The page titles and labels stay.
  - An undesigned page gets the new header with its current title and no eyebrow or description until its step-2 mockup.
  - Each designed page gains the prototype's area label and one-line description, as i18n keys in both languages (ae-bangla-copy).
  - The sidebar help card gains its two lines.
- **The existing pieces are reused.**
  - `PageBand` stays the title band of the public pages (UX-16), with one centred title for a visitor. `PageHeader` is the signed-in page's header, with an eyebrow, a description and actions.
  - The top bar draws its breadcrumb with the set's existing `Breadcrumb`, restyled in U2.
- **The plan's IDs stay in the plan.** The R-IDs and U-IDs of this plan stay here. Code, comments and test names state the meaning in words (ORG-CMT-50, ORG-CMT-10).
- **Branch:** `feat/visual-redesign`, cut from `feat/export-service`, which carries T2.7 and T2.8: the export button and My exports sit on the lists this redesign touches. It merges after PR #34 and the export PR.

## Implementation units

### U1. The decision and the design documents
- **Goal:** the redesign's rules are written down before any code.
- **Requirements:** all (the record), R8, R14
- **Files:**
  - `docs/DECISION_LOG.md`: D-145, the owner's answers of 2026-11-01 and this plan.
  - `docs/ui/DESIGN_BRIEF.md`: UX-25, the owner's prototype as the reference look.
  - `docs/ui/brand/colors.md` §2 and §3: the derived tints (page background, sidebar ink surfaces, icon squares, status pill fills), each with the contrast ratio of its text.
  - `docs/ui/DESIGN_SYSTEM.md`:
    - 2.1, 2.6 and the 2.9 token block;
    - 4.1, the app shell with the dark sidebar and the top-bar breadcrumb, which resolves the conflict with 4.5's admin top bar;
    - 5.3, Card and Stat with the icon square;
    - a new 5.x, Page header.
- **Approach:** one D-row in the format of the existing rows of `docs/DECISION_LOG.md`, numbered D-145 (the next free number). The UX-14 refresh (`docs/STATUS.md`, O-54; DESIGN_SYSTEM "Premium finish") is the precedent for the design-document changes. Contrast is measured as in colors.md §3.
- **Tests:** `pnpm docs:check`; `packages/ui` `styles.test.ts` (the token block, `tokens.css` and `tokens.ts` stay equal).
- **Also:** the new tokens went into `packages/ui/src/styles/tokens.css`, `packages/ui/src/tokens.ts` and DESIGN_SYSTEM §2.9 here, not in U2, because `styles.test.ts` keeps the three equal in every commit.
- **Done when:** the documents name every token U2 adds, with its value and contrast, and D-145 is recorded.
- **Depends on:** none
- **Size:** M
- **Risk area:** none
- **Status:** done

### U2. The tokens and the set's components
- **Goal:** every component of `packages/ui` has the new look, so any page built from the set changes.
- **Requirements:** R4, R5, R6, R7, R8, R14, R15
- **Files:**
  - `packages/ui/src/styles/tokens.css`, `packages/ui/src/tokens.ts` and `packages/ui/src/templates/mui/theme.ts`.
  - `packages/ui/src/components/{Card,StatFilter,Badge,Button,Field,Table,States,Modal,Tabs,Alert,ProgressBar,NavItem,Avatar,Breadcrumb}/`: the CSS, the `.tsx` where a prop is added, and the tests.
  - `packages/ui/src/components/PersonCell/{PersonCell.tsx,PersonCell.css,PersonCell.test.tsx}` (new) and `packages/ui/src/index.ts`.
  - `packages/ui/src/templates/mui/{Table,Button,Overlay}.tsx`, where the look sits in the template.
  - `apps/web/src/dev/Gallery.tsx`.
- **Approach:**
  - Tokens first (DESIGN_SYSTEM 2.9 and `styles.test.ts`), then each component's CSS on them.
  - `StatCard` and the `StatFilterBar` items gain `icon` and `tone`, like `AttentionCard`.
  - `StatusBadge` becomes a pill with a dot.
  - Tables get the quiet header and the dividers, plus a `PersonCell` beside the existing `Avatar`: an initials or icon tile, the name, and a muted second line.
  - The gallery shows each component in both languages.
- **Tests:**
  - unit:
    - `styles.test.ts`: the tokens equal the document.
    - The Card tests: title, description and action.
    - The StatFilter tests: icon, tone, the pressed state kept, English digits.
    - The Badge tests: the pill keeps its icon and its word.
    - A new `PersonCell` test.
    - axe on each changed component with `expectNoAxeViolations`.
  - existing: covered by the tests of `packages/ui/src/components/*`, which are updated rather than duplicated.
- **Done when:** the gallery at `/dev/components` shows every component in the new look, and the set's tests and axe pass.
- **Depends on:** U1
- **Size:** L
- **Risk area:** none
- **Status:** done

### U3. The page header on every page
- **Goal:** every page opens with the same header (R3).
- **Requirements:** R3, R12
- **Files:**
  - `packages/ui/src/components/PageHeader/{PageHeader.tsx,PageHeader.css,PageHeader.test.tsx}` and `packages/ui/src/index.ts`.
  - Every page under `apps/web/src/` that renders `admin-title`: 30 pages and `AdminLayout.tsx`, found with a search for `admin-title`, the undesigned pages included (only their header changes).
  - `apps/web/src/admin/admin.css`: the three classes removed.
  - `packages/shared/src/i18n/messages/{bn,en}/*.json`: the area labels and descriptions of the 24 designed pages.
- **Approach:**
  - `PageHeader` follows `ProfileHeader`. The title is the page's only `h1`, the eyebrow is text before it, and the actions sit in a wrapping row.
  - Each page swaps its title row for `PageHeader`, keeping its title and actions.
- **Tests:**
  - unit: `PageHeader.test.tsx`: one `h1`; eyebrow and description read in order; actions wrap; axe in both languages.
  - existing:
    - The page tests that find a heading by level and name keep passing unchanged.
    - `apps/web/test/class-names.test.ts` proves that no removed class is still used.
- **Done when:** no page uses `admin-title`, and the web tests pass.
- **Depends on:** U2
- **Size:** L
- **Risk area:** none
- **Status:** done

### U4. The app shell
- **Goal:** the dark sidebar, the top bar with its breadcrumb, and the restyled rail, bottom tabs and more sheet.
- **Requirements:** R1, R2, R13, R14
- **Files:**
  - Shell components and styles: `apps/web/src/components/shell/{AppShell,AppBar,BottomTabs,MoreSheet,NavLinks,ProfileMenu}.tsx` and `shell.css`.
  - Breadcrumb context: a new `apps/web/src/components/shell/breadcrumb.tsx`, holding the context and `useBreadcrumb`.
  - Navigation: `apps/web/src/admin/navigation.ts`, with the group labels and the crumb of each destination.
  - Pages that drop their in-page `Breadcrumb`:
    - `admin/beneficiaries/BeneficiaryProfilePage.tsx`
    - `admin/beneficiaries/duplicates/`
    - `admin/staff/`
    - `admin/volunteers/VolunteerProfilePage.tsx`
    - `features/media/{MemberPage,WorkPage}.tsx`
    - (the beneficiary profile, the staff profile, the organogram, the compare page and the media pages are undesigned: only their breadcrumb moves)
  - Shell tests: `apps/web/src/components/shell/*.test.tsx`.
  - i18n: `nav.json`, for the help card.
- **Approach:**
  - The sidebar in `AppShell.tsx` is restyled on the new ink tokens, with:
    - the brand mark and the organisation's name at the top;
    - the groups with their headings;
    - the attention counts beside their destinations, from the cached `ATTENTION_KEY` query;
    - the help card and the person's chip at the bottom.
  - The top bar keeps its parts. It gains the breadcrumb and a profile chip with initials, name and role.
- **Tests:**
  - existing: the shell tests (the destinations per role, the more sheet, the unread count, the logout warning) are updated for the new structure. New cases:
    - a destination shows its attention count;
    - the breadcrumb names the group and the page, and a profile page's own crumb;
    - the help card shows on a desktop;
    - axe on the shell in both languages.
  - e2e: no new journey. `shell.spec.ts`, `roles.spec.ts` and `a11y.spec.ts` pass unchanged on the mobile, desktop and iphone projects.
- **Done when:**
  - The shell matches the prototype's frame on a desktop.
  - The rail on a tablet and the tabs on a phone keep working.
  - The tests pass.
  - The owner then sees screenshots of the shell before any page is restyled.
- **Depends on:** U2, U3
- **Size:** L
- **Risk area:** none
- **Status:** todo

### U5. The My Work home
- **Goal:** the home follows the prototype's dashboard, using the data it already loads.
- **Requirements:** R9, R4, R13
- **Files:** `apps/web/src/features/home/{MyWorkPage,HomeWidgets,AttentionList,Loaded}.tsx`, `home.css`, `MyWorkPage.test.tsx`, and the i18n file `home.json`.
- **Approach:**
  - The greeting and the date go in the `PageHeader`.
  - A banner in the brand ink gradient shows the person's two leading figures from the attention list and the widgets.
  - The stat cards of `widgets.ts` get icons.
  - The attention list becomes the prototype's "approvals" card.
- **Tests:**
  - existing: `MyWorkPage.test.tsx` is updated for the layout. New cases:
    - the banner shows the person's counts in English digits;
    - a role without widgets sees only the attention list;
    - axe in both languages.
- **Done when:** the home matches its prototype on a desktop and stacks on a phone.
- **Depends on:** U3, U4
- **Size:** M
- **Risk area:** none
- **Status:** todo

### U6. The beneficiary list, the volunteer list and the volunteer profile
- **Goal:** the three most used official pages follow their prototype pages.
- **Requirements:** R10, R6, R12, R13
- **Files:**
  - `apps/web/src/admin/beneficiaries/BeneficiariesPage.tsx`, `apps/web/src/admin/volunteers/{VolunteersPage,VolunteerProfilePage}.tsx`, `apps/web/src/admin/StatisticsBar.tsx` and `apps/web/src/admin/admin.css`.
  - Their test files.
  - The i18n file `admin.json`.
- **Approach:**
  - `StatisticsBar` shows the stat cards with icons.
  - Each list sits in one card with its toolbar and the `PersonCell`.
  - The prototype's side cards appear only where the page has their content: the lookup and the duplicates link.
  - The profile's sections become the prototype's cards.
- **Tests:**
  - existing: the pages' test files are updated where a heading or a card title moves. The export tests of T2.8 keep passing. axe runs in both languages.
- **Done when:** the three pages match their prototype pages, and every filter, action and export still works.
- **Depends on:** U3, U4
- **Size:** L
- **Risk area:** none
- **Status:** todo

### U7. The admin screens, part one
- **Goal:** projects, programs, templates, ready forms, registrations, duplicate review, staff and handover follow their prototype screens.
- **Requirements:** R11, R12, R13
- **Files:**
  - Pages:
    - `apps/web/src/admin/projects/ProjectsPage.tsx`
    - `admin/programs/ProgramsPage.tsx`
    - `admin/templates/TemplatesPage.tsx`
    - `admin/forms/ReadyFormsPage.tsx`
    - `admin/registrations/RegistrationsPage.tsx`
    - `admin/beneficiaries/duplicates/DuplicatesPage.tsx`
    - `admin/staff/StaffPage.tsx`
    - `admin/handover/HandoverPage.tsx`
  - Their test files.
  - `admin.css`.
  - i18n: `admin.json`, `projects.json` and `forms.json`.
- **Approach:** each page is rebuilt to its prototype screen (`screenshots/02-*.png` to `09-*.png`) on the U2 components and the U3 header. Only the layout and the cards move.
- **Tests:**
  - existing: each page's test file is updated where its structure moves. axe runs in both languages.
- **Done when:** the eight pages match their screenshots.
- **Depends on:** U3, U4
- **Size:** L
- **Risk area:** none
- **Status:** todo

### U8. The admin screens, part two
- **Goal:** permissions, settings, nisab, audit log, active sessions, system health, notification copy and delivery status follow their prototype screens.
- **Requirements:** R11, R12, R13
- **Files:**
  - Pages:
    - `apps/web/src/admin/permissions/PermissionsPage.tsx`
    - `admin/settings/SettingsPage.tsx`
    - `admin/nisab/NisabPage.tsx`
    - `admin/audit/AuditPage.tsx`
    - `admin/system/{SessionsPage,HealthPage}.tsx`
    - `admin/notifications/{NotificationTemplatesPage,DeliveriesPage}.tsx`
  - Tests: `system.test.tsx`, `notifications-admin.test.tsx` and the other pages' test files.
  - `admin.css`.
  - i18n: `admin.json`.
- **Approach:** as in U7, from `screenshots/10-permissions.png` to `15-system-health.png`, and `17-notification-copy.png` and `18-delivery-status.png`.
- **Tests:**
  - existing: each page's test file is updated where its structure moves. axe runs in both languages.
- **Done when:** the eight pages match their screenshots.
- **Depends on:** U3, U4
- **Size:** L
- **Risk area:** none
- **Status:** todo

### U9. The notifications page and the account pages
- **Goal:** the notifications page, my profile, my devices and the password change follow their prototype screens.
- **Requirements:** R11, R12, R13
- **Files:**
  - Pages:
    - `apps/web/src/features/notifications/`, the notifications page.
    - `apps/web/src/features/account/{ProfileView,SessionsView,ChangePasswordView}.tsx` and `profile.css`.
    - `apps/web/src/components/AccountPage.tsx`.
  - Tests: `profile.test.tsx`, `SessionsView.test.tsx`, `ChangePasswordView.test.tsx` and the notifications tests.
  - i18n: `auth.json` and `notifications.json`.
- **Approach:** as in U7, from `screenshots/16-notifications.png`, `19-my-profile.png`, `20-my-devices.png` and `21-password.png`.
- **Tests:**
  - existing: the four pages' tests are updated where their structure moves. axe runs in both languages.
- **Done when:** the four pages match their screenshots.
- **Depends on:** U3, U4
- **Size:** M
- **Risk area:** none
- **Status:** todo

### U10. The phone and tablet pass, the screenshots and the documents
- **Goal:** the redesign is checked on every width, shown to the owner side by side with the prototype, and documented.
- **Requirements:** R13, R14, R15, and all requirements end to end
- **Files:**
  - `apps/web/e2e/screens.spec.ts` (new): screenshots of the 24 pages at 1280, 768 and 360 px into `test-results/screens/`. It asserts only that each page loaded with its heading.
  - `apps/web/e2e/a11y.spec.ts`: re-run with its page list unchanged.
  - Documents:
    - `docs/ui/SCREENS.md`, the look of each designed page;
    - `docs/testing/PERFORMANCE.md`, the first-route measurement;
    - `docs/STATUS.md`;
    - `CLAUDE.md`, the map entries for `PageHeader`, `PersonCell` and the breadcrumb context.
- **Approach:**
  - The a11y sweep and every existing journey prove that nothing moved.
  - The screenshots show the owner the new look.
  - `bundle:report` checks R15.
- **Tests:**
  - e2e: `screens.spec.ts` signs in as the Department Head and opens each designed page at the three widths, waiting for its `h1`.
  - The full `pnpm e2e`, including `a11y.spec.ts`, passes.
- **Done when:** the owner has the screenshots, every suite passes, and the first route stays under 250 KB.
- **Depends on:** U5, U6, U7, U8, U9
- **Size:** M
- **Risk area:** none
- **Status:** todo

## Checkpoints
- **Mode:** grouped. Scores: one by one 7, grouped 13 (6 plus one by one's 7, which moves to grouped because N is over 4), all at once 2.
- **Signals:**
  - N 10
  - L 3,000
  - R 0
  - Fd 3 (U2, U3, U4)
  - C 6 (U1, U2, U3, U4, U5, U10)
  - P 1 (the breadcrumb context in U4)
- **C1** after U2: the foundation of every later unit, together with U1's documents.
- **C2** after U3: the foundation of the pages (the header on every page).
- **C3** after U4: a foundation unit and the new pattern (the breadcrumb context). The owner sees the shell's screenshots before the pages go on.
- **C4** after U6: U7 would take the change since C3 over 25 files.
- **C5** after U7: the same size limit before U8.
- **C6** after U8: the same size limit before U9.
- **C7** after U10: end.

## Verification
- `pnpm typecheck`, `npx eslint apps packages scripts`, `npx prettier --check apps packages docs`, `pnpm i18n:check` and `pnpm docs:check`.
- `pnpm test`: the ui, web and shared projects carry the change; the API is untouched.
- `pnpm --filter @css/web build`, then `pnpm --filter @css/web bundle:report`.
- `pnpm e2e`: `a11y.spec.ts`, `shell.spec.ts` and `roles.spec.ts` on the three projects, plus `screens.spec.ts` for the owner's screenshots.
- The component gallery at `/dev/components`, after `pnpm --filter @css/web dev`.

## Risks and rollback
- **A page could lose something when restyled** (R12).
  - Each page unit keeps its component tests, the E2E journeys and the a11y sweep as proof.
  - A review checkpoint follows every group.
- **Contrast on the dark surfaces** (R14).
  - The derived tokens are measured in U1, before use.
  - The a11y sweep runs on every page.
- **Rollback:** the work is presentation only, with no migration and no API change. Reverting the branch's merge restores the old look.

## Definition of done
- All units are done and their tests pass.
- The verification commands pass.
- `ae-review` has run, with no open P0 or P1.
- Code from abandoned attempts is removed.

## Progress
- **Branch:** `feat/visual-redesign` (from `main` after PRs #34, #35 and #36 were merged)
- **Updated:** 2026-11-02 (U3 done)
- **Next:** with Docker running: `projects.spec.ts` (the state badge helper changed in C2) with `--repeat-each 3 --workers 1`, then U4: the app shell
- **Reviewed through:** C2 at dc3a833e
- **Uncommitted:** none
- **Notes:** C2 (T2, three reviewers; no P0 or P1): the E2E helper `state()` looked for the removed `.admin-title-row`; the project's state badge in the page header now carries `data-testid="project-state"` on the overview and setup pages and the helper finds it there; a search for removed classes must also cover `apps/web/e2e`. The page header test checks absence by role and text, not by class. Left as is: comments in `packages/ui` cite the design system as "DESIGN_SYSTEM 5.3a" like every other file of the set. The seven duplicate-code leads were import lists and the moved registration badges. `projects.spec.ts` not yet run (Docker was off). U3: `PageHeader` has a `meta` slot (a status badge beside the title: project overview, project setup, registration detail); an intro line a page already had is its description (deliveries, notification texts, sessions, audit range, transfer help); the form builder keeps its `form-head` wrapper for the E2E specs, its counts and save state as the description; the organogram's zoom row is `.org-actions`; the gallery's own heading is a `PageHeader`. The area labels and descriptions of the designed pages move to the page units (U5 to U9), where each page's prototype screen gives the words. C1 (T2, three reviewers; no P0, P1 or P2): direct tests for `initials` (a Bengali vowel sign or conjunct stays with its letter: "খাতুন" gives "খা") and for the tile of a filtering count; `StatFilterItem.tone` is `IconTileTone`. Left as it was: two-letter Latin initials keep the name's case (unchanged behaviour moved from Avatar). semgrep, the secret scan, duplication, dead-code and architecture checks were skipped because Docker was not running. U2: one `IconTile` (icon, letter or photo on a soft square) serves the stat card, the counts that filter and `PersonCell`; the initials helper moved to `packages/ui/src/utils/initials.ts`. The table's header row is now quiet (`--color-bg-subtle`, secondary text) instead of the brand-soft green the owner chose on 2026-10-20: the owner's prototype (D-145) shows it quiet; told to the owner in the U2 report. The badge's dot form is a soft pill. The sidebar's `NavItem` look moves to U4, where it is checked with the shell. U1: the prototype's 7 to 11 px text is not used (DESIGN_SYSTEM §2.4 stays, R14); the prototype's status dot is the badge's icon (a status keeps its icon and ink label); the sidebar's active item must be white on #007B3E (its grey text is 3.44:1). The owner said on 2026-11-02 "ধাপে ধাপে অল্প অল্প করে কর। যেন খুবই প্রিমিয়াম ফিল হয়। আর কোন ভুল ও না হয়": small steps, a report after each unit, and the shell's screenshots shown after U4 before any page is restyled.
