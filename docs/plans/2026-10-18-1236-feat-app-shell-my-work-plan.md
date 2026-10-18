---
title: App shell and the My Work home per role (T1.15)
type: feat
status: in-progress
source: brainstorm
date: 2026-10-18
doc_review: 2026-10-18
---

# App shell and the My Work home per role (T1.15)

## Goal
Every demo account lands on its own My Work home after login. The home starts with what needs that person now and holds the widgets of their role. Every signed-in page shares one frame: the As-Sunnah Foundation logo and the system name, the bell, the language switch and a profile menu. Officials get a sidebar on a desktop, and everyone gets bottom tabs on a phone. The first load comes within the NFR-15 budget (at most 250 KB of compressed JavaScript for the first route).

## Problem
After login, people land on a placeholder page with a few buttons. Volunteers get operational messages in the app only (UX-12), so their home has to show what needs them. Officials use a separate `/admin` frame with its own top bar and a scrolling menu on phones. Phase 1 ends with T1.16 and the gate T1.17, and the field pilot needs one consistent frame on 360 px phones.

## Requirements

### Shell
- **R1** Every signed-in page, the `/admin` pages included, uses one app shell (docs/ui/DESIGN_SYSTEM.md §4.1). It has an app bar with the logo and the system name (UX-09), the notification bell with the unread count, the language switch (inside the profile menu on phones), and a profile menu: my profile, my devices, change password, log out.
- **R2** On a desktop (from 1024 px) officials see a sidebar. It holds My Work first, then the destinations of today's admin menu that their roles can use. Volunteers see no sidebar: from 640 px their four destinations (home, my projects, notifications, more) sit in a side rail with icons and labels. On a tablet (640 to 1023 px) the officials' destinations sit in a side rail too.
- **R3** On a phone (up to 639 px) everyone sees bottom tabs with an icon and a label each. A tab never leads to an empty page, and the tab bar respects the safe area.
  - Volunteers: home, my projects, notifications, more.
  - Officials: home, people (volunteers and beneficiaries), projects, notifications, more. A tab the person may not use is left out, and "more" offers the rest, so an official with neither people nor projects sees home, notifications and more.
  - "More" opens a sheet with the remaining destinations the person can use.
- **R4** Destinations are shown by the person's roles, as the admin menu does today. A destination the person cannot use is not shown. The server still checks every request.
- **R5** An offline banner sits between the app bar and the content while the browser reports no connection (`navigator.onLine` and its events), and it goes away when the connection returns. It only informs; offline work comes in Phase 2.
- **R6** The `/admin` addresses and their pages stay as they are inside the new shell. Today's admin top bar and the scrolling menu on phones are replaced by the shell.

### My Work home
- **R7** After login, and on `/`, every account opens its My Work home (BR-226). The home lists widgets in a fixed order, starting with "needs your attention". A person with several roles sees the union of their widgets.
- **R8** "Needs your attention" lists what exists in Phase 1. Each item links to its record, and the list shows a calm empty state when nothing is waiting.
  - Volunteer and team member:
    - project consent waiting;
    - corrections asked on a pending registration;
    - an edit request answered;
    - unread notifications.
  - Project Executive and RPM: pending volunteer registrations and edit requests in their scope.
  - PM:
    - draft projects not activated;
    - active projects whose application window ends within 7 days.
  - Department Head and Monitoring Team: handovers waiting (officials with pending work and no completed handover) and pending staff registrations. Since D-097 there are no new staff registrations, so only ones left from before count.
- **R9** The widgets per role that exist in Phase 1 (docs/ui/SCREENS.md §4):
  - Volunteer (General and Both): my projects, with the deadline; my team, for a main volunteer; latest notifications.
  - Team member: the main volunteer's projects.
  - Local দায়ী and Paid Volunteer: my projects; latest notifications.
  - Official দায়ী: latest notifications.
  - Project Executive and RPM: my projects; latest notifications.
  - PM: projects by state; templates.
  - Department Head and Monitoring Team: shortcuts to the permission panel, the audit log, the officials and the settings; latest notifications.
  - Implementer, Media, Finance and Procurement Teams: latest notifications.
- **R10** A widget whose module comes in a later phase shows a calm "coming later" card on the homes that will have it. The card has no button and no zero counts. Examples:
  - volunteer: my applications, new application, today's distribution;
  - Local দায়ী: today's class;
  - Paid Volunteer: today's work;
  - Official দায়ী: Local দায়ী tracking, exam schedule;
  - Executive and RPM: review queue;
  - PM: program dashboard;
  - Department Head and Monitoring: work progress, alerts;
  - Media, Finance and Procurement: their main widget.

  Volunteers never see ratings or categories (BD-40).
- **R11** The home is one column of cards on a phone, two columns on a tablet, and a grid on a desktop, with the attention list first. Every official's home and the shell work at 360 px without sideways scrolling (UX-03).

### Quality
- **R12** All texts are bn and en catalogue keys, and every number uses English digits.
- **R13** axe reports no violations on the home of each role and on the shell, on a phone and a desktop. A Lighthouse run on the mobile viewport is reported.
- **R14** The first route's compressed JavaScript is measured and reported against NFR-15 (at most 250 KB). If it is over, the shell and the homes load their parts on demand until it fits.

## Scope
- In: the shell, the homes, the attention list and the widgets above, the offline banner, the profile menu, the API the homes need, tests (RTL and an E2E per role home), the bundle report, and updates to docs (SCREENS §4 and DESIGN_SYSTEM §4.1 and §4.5).
- Out (not now):
  - offline work, the outbox, sync status and unsynced items (Phase 2; the attention list gets them then);
  - the project switcher at the top of the home (comes with the application screens);
  - the dashboards and their stat cards (Phase 3 and 6);
  - the update-available, iOS storage and install banners (PWA work in Phase 2);
  - the desktop dropdown of the bell;
  - a new design of the admin pages themselves.

## Key decisions
- **One shell for everyone** (owner, 2026-10-18): the `/admin` pages move into the shell with the logo, bell, language and profile menu. Officials get a sidebar on a desktop and bottom tabs on a phone, with the rest under "more". The admin addresses stay. Governs R1 to R6.
- **"Coming later" cards** (owner, 2026-10-18): later-phase widgets show a quiet card with no action. This replaces SCREENS.md §4's rule "not shown before that phase", which is updated in this task. Governs R10.
- **Volunteers on larger screens** (owner, 2026-10-18): from 640 px a volunteer's four destinations sit in a side rail, so the frame looks the same on every width. Governs R2.
- **Officials' tabs by permission** (owner, 2026-10-18): a tab the official may not use is hidden and never opens an empty page; the rest stays under "more". Governs R3.
- **Phone tabs with what exists now** (owner, 2026-10-18): volunteers get home, my projects, notifications and more; officials get home, people, projects, notifications and more. "Applications", "today's work" and "review" join with their modules, and no tab opens an empty page. This is a Phase 1 subset of DESIGN_SYSTEM §4.1. Governs R3.

## Success criteria
- Every account in docs/testing/DEMO_ACCOUNTS.md opens its own home after login, checked in E2E per role on a phone and a desktop.
- The report gives the first route's compressed JavaScript in KB against the 250 KB target, and the Lighthouse scores of the mobile run.

## Technical decisions
- **Stack profile unchanged** (CLAUDE.md "Stack profile"; ST-40 to ST-44): React 19 + Vite PWA with TanStack Query and use-intl, Express 5 with `defineRoute`, Prisma on PostgreSQL. No new runtime library. Lighthouse runs once for the report with `npx --yes lighthouse@12` against `vite preview`; it is not added as a dependency.
- **One layout route** (RE-CMP-02, RE-CMP-03): a new `AppShell` layout route wraps every signed-in route: `/`, `/account/*`, `/notifications`, `/my-projects*` and `/admin/*`. It holds `RequireAuth`, the app bar, the navigation for the width and the offline banner, and renders `<Outlet/>` under the existing route error boundary. `AdminLayout` shrinks to the admin audience gate and the phone notice of the setup screens. `AccountPage` shrinks to the page heading and content, and its link row moves into the profile menu. Login, reset, invite and register keep `AuthShell`.
- **Navigation from one model** (RE-SEC-05): `admin/navigation.ts` becomes the app's navigation. It gains My Work first, the sidebar groups, the phone tab sets per audience (R3) and the "more" sheet. Every item keeps its role list, and the server still checks every call.
- **The attention list from one call** (RE-FX-02; NFR-15 and 2G): a new `GET /me/attention` (permission `authenticated`, scope self) returns counted items for the caller's roles and scopes in one request: unread notifications (the count `/notifications/unread-count` gives), consent waiting, corrections, an answered edit request, pending registrations and edit requests in scope, PM drafts and windows ending within 7 days, handovers waiting, and pending staff registrations. Each item carries a kind, a count and a fixed route. An item appears only when the caller holds its permission, and the counts reuse the scope filters of the lists they open. The existing endpoints feed the other widgets: `/me/projects`, `/projects`, `/templates`, `/notifications?limit=5`.
- **Profile menu** (RE-UI-04, RE-A11Y-02): a `MenuButton` built on React Aria `Menu` is added to `packages/ui` first, with its test and axe check. It holds my profile, my devices, change password, the language (on phones) and log out.
- **Offline** (RE-FX-01): a `useOnline` hook reads `navigator.onLine` and subscribes to the `online` and `offline` events with a cleanup. It drives the existing `OfflineBanner`.
- **Bundle** (NFR-15): measured from the build. The first route's JavaScript is the entry plus its `modulepreload` chunks, gzip, in KB. Today that is about 391 KB gzip, over the 250 KB target. U5 measures what fills it and splits in this order until it fits: lazy routes for the eager pages, the message catalogue loaded per language and namespace instead of both languages whole, and heavy components out of the first route. The report gives the numbers before and after.
- **Plan IDs stay in the plan** (ORG-CMT-50): R, U, D-100, BR and UX codes stay in this plan and the docs; code, comments, test names and catalogue keys carry the meaning in words.
- **Decision record:** D-100 in DECISION_LOG records the three owner decisions of 2026-10-18 before the code (one shell, "coming later" cards, Phase 1 tab sets), with the SCREENS §4 rule change.

## Implementation units

### U1. Decision record and the menu component
- **Goal:** D-100 is recorded, SCREENS §4 and DESIGN_SYSTEM §4.1 and §4.5 match the owner's decisions, and `packages/ui` has a `MenuButton` for the profile menu.
- **Requirements:** R1, R10, R12
- **Files:** `docs/DECISION_LOG.md`, `docs/ui/SCREENS.md` (§4 rules, the Phase 1 lines of SCR-010 to SCR-021), `docs/ui/DESIGN_SYSTEM.md` (§4.1 Phase 1 tab sets, §4.5 replaced by the shell), `packages/ui/src/components/Menu/{MenuButton.tsx,MenuButton.test.tsx,Menu.css}`, `packages/ui/src/index.ts`, `packages/ui/src/provider/messages.ts` (if the menu needs a text), `apps/web/src/dev/Gallery.tsx` (one entry)
- **Approach:** follow `packages/ui/src/components/Tabs` and `Field/Select.tsx` (React Aria components with CSS on the tokens; tests with `renderWithUi` and `expectNoAxeViolations`).
- **Tests:**
  - unit (ui): the button opens the menu with Enter and with a click; arrow keys move between items; Escape closes it and returns focus to the button; an item with `href` is a link, and an item with an action calls it; no axe violations.
- **Done when:** the menu works by keyboard and pointer in the gallery, and the docs say what the owner decided.
- **Depends on:** none · **Size:** M · **Risk area:** none
- **Status:** done

### U2. The attention API
- **Goal:** `GET /me/attention` returns the counted items for the caller's roles and scopes.
- **Requirements:** R8
- **Files:** `apps/api/src/services/attention.ts`, `apps/api/src/routes/me.ts`, `apps/api/src/container.ts`, `packages/shared/src/attention.ts` (item kinds and the response schema), `docs/api/openapi.yaml`, `docs/security/AUTHORIZATION_MATRIX.md`, `apps/api/test/integration/attention.test.ts`
- **Approach:** like `GET /notifications/unread-count` (`routes/notifications.ts`, `services/inbox.ts`), whose count is also the unread item. Counts reuse the scope filters of the lists they open: the registration list (`services/registrations.ts`), the edit requests (`services/change-requests.ts`), the project list (`services/projects.ts`), the handover (`services/handover.ts`) and the volunteer's projects (`services/my-projects.ts`). Permissions are checked with `AccessService` as the routes do.
- **Tests:**
  - integration:
    - a volunteer with a pending consent, an open correction and an unread notification gets those three items;
    - volunteer B on the same project gets none of volunteer A's consent, correction or edit-answer items, and a volunteer gets no registration, draft or handover counts even when such data exists;
    - the Dhaka RPM counts only Dhaka registrations, and the Rangpur RPM gets none for the same data;
    - a PM gets the drafts of their program and the active projects whose window ends within 7 days, none of another program;
    - the Department Head gets the handovers waiting;
    - an item the caller has no permission for is absent;
    - 401 without a session;
    - the drift test and the authorization matrix pass.
- **Done when:** the contract is in `openapi.yaml`, and each role's counts match its scope.
- **Depends on:** none · **Size:** M · **Risk area:** auth
- **Status:** done

### U3. The app shell
- **Goal:** every signed-in page sits in one shell: the app bar, the sidebar on a desktop, the rail on a tablet, the bottom tabs with "more" on a phone, the profile menu and the offline banner.
- **Requirements:** R1 to R6, R11, R12
- **Files:**
  - new: `apps/web/src/components/shell/{AppShell.tsx,AppBar.tsx,ProfileMenu.tsx,BottomTabs.tsx,MoreSheet.tsx,shell.css,use-online.ts}`
  - changed:
    - `apps/web/src/admin/navigation.ts` (My Work, groups, the tab sets)
    - `apps/web/src/admin/AdminLayout.tsx` (gate and phone notice only)
    - `apps/web/src/components/AccountPage.tsx` (heading and content only)
    - `apps/web/src/components/TopBar.tsx` (sign-in pages only)
    - `apps/web/src/routes/index.tsx` (the layout route)
    - the i18n `common` and `admin` keys
  - tests:
    - new: `apps/web/src/components/shell/shell.test.tsx`
    - updated: `apps/web/src/admin/admin.test.tsx`, `apps/web/src/components/TopBar.test.tsx`, `apps/web/src/features/account/HomeView.test.tsx`, `apps/web/src/admin/permissions/permissions.test.tsx`, `apps/web/src/admin/handover/handover.test.tsx`
    - e2e: new `apps/web/e2e/shell.spec.ts`; the helpers in `apps/web/e2e/support/admin.ts`, and the selectors in `admin.spec.ts`, `admin-permissions.spec.ts`, `handover.spec.ts`, `registration.spec.ts`, `projects.spec.ts`, `volunteers.spec.ts`
- **Approach:**
  - a layout route in the way of `admin/AdminLayout.tsx`;
  - `NavItem` with its existing `sidebar`, `rail`, `tab-bar` and `sheet` variants, and the existing `Drawer side="bottom"` for "more" (both in `packages/ui` already; no change there);
  - logout and a session change already clear the query cache (`apps/web/src/lib/auth.tsx`, `queryClient.clear()` when the user changes); the shell keeps that;
  - the existing `OfflineBanner` and `NotificationBell`, and `MenuButton` from U1;
  - widths from `BREAKPOINTS` in `@css/ui`.
- **Tests:**
  - component:
    - an official on a desktop sees the sidebar with My Work first and only the destinations of their roles;
    - a volunteer sees no sidebar, and their phone tabs are হোম, আমার প্রকল্প, নোটিফিকেশন and আরও;
    - an official's phone tabs are হোম, মানুষ, প্রকল্প, নোটিফিকেশন and আরও, and the Official দায়ী, who may use neither people nor projects, sees হোম, নোটিফিকেশন and আরও;
    - a volunteer from 640 px sees the rail with হোম, আমার প্রকল্প, নোটিফিকেশন and আরও;
    - "আরও" opens the sheet with the remaining destinations;
    - the profile menu offers আমার প্রোফাইল, আমার ডিভাইস, পাসওয়ার্ড পরিবর্তন and লগআউট, and logout ends the session;
    - after A logs out and B signs in on the same device, B's home never shows A's projects, counts or notifications;
    - the offline banner shows on an `offline` event and goes away on `online`;
    - the app bar shows the logo and the system name;
    - no axe violations at 360 px and at 1280 px.
  - existing: covered by `apps/web/src/admin/admin.test.tsx` (the admin bar, menu and language toggle), `TopBar.test.tsx`, `HomeView.test.tsx`, and e2e `admin.spec.ts` and `auth.spec.ts` (logout); update these, don't duplicate.
  - e2e (`e2e/shell.spec.ts`, mobile and desktop):
    - a volunteer on a phone sees the tabs হোম, আমার প্রকল্প, নোটিফিকেশন and আরও, and opens আমার প্রকল্প from them;
    - the Department Head on a desktop opens "অডিট লগ" from the sidebar;
    - the profile menu leads to "আমার ডিভাইস";
    - with the browser context offline, the offline banner shows.
- **Done when:** every signed-in page has the shell, no page scrolls sideways at 360 px, and the existing component and e2e suites pass with updated selectors.
- **Depends on:** U1 · **Size:** L · **Risk area:** none
- **Status:** done

### U4. The My Work homes
- **Goal:** `/` shows each person's My Work home: "needs your attention" first, the Phase 1 widgets of their roles, the "coming later" cards and the latest notifications.
- **Requirements:** R7 to R11, R12
- **Files:** `apps/web/src/features/home/{MyWorkPage.tsx,AttentionList.tsx,widgets.tsx,home-api.ts,home.css,MyWorkPage.test.tsx}`, `apps/web/src/features/account/HomeView.tsx` (replaced), `apps/web/src/admin/DashboardPage.tsx` (the `/admin` index leads to `/`), `apps/web/src/routes/index.tsx`, a new i18n `home` namespace (bn and en), `apps/web/test/msw/handlers.ts` (a default empty attention answer)
- **Approach:**
  - cards from `@css/ui`: `Card`, `AttentionCard`, `EmptyState`, `StatCard`;
  - data through TanStack Query over `/me/attention`, `/me/projects`, `/projects`, `/templates` and `/notifications?limit=5`;
  - the widget set per role comes from one table keyed by role, which the tests also read;
  - the heading stays "স্বাগতম, {name}", as the e2e helpers expect.
- **Tests:**
  - component:
    - a volunteer sees "এখন আপনার কাজ" with the consent item linking to the project, then "আমার প্রকল্প", and "আমার আবেদন" as a "শিগগিরই আসছে" card;
    - a Local দায়ী sees "আজকের ক্লাস" as a coming-later card;
    - the Dhaka RPM sees the pending registrations count linking to `/admin/registrations`;
    - a PM sees projects by state and "টেমপ্লেট";
    - the Department Head sees the shortcuts "পারমিশন প্যানেল" and "অডিট লগ";
    - a person with two roles sees the union of their widgets;
    - an empty attention list shows "এখন অপেক্ষায় কিছু নেই";
    - a failed attention call shows the error with retry while the other widgets still render;
    - a volunteer home never shows ratings or categories;
    - no axe violations.
  - e2e: in U6.
- **Done when:** every demo role opens its own home, and it reads well at 360 px.
- **Depends on:** U2, U3 · **Size:** L · **Risk area:** none
- **Status:** done

### U5. The first load within NFR-15
- **Goal:** the first route's compressed JavaScript is measured, brought to 250 KB or less, and reported with a Lighthouse and axe run on the mobile viewport.
- **Requirements:** R13, R14
- **Files:**
  - `apps/web/scripts/bundle-report.mjs`: the entry plus the `modulepreload` chunks of `dist/index.html`, gzip, in KB; exits non-zero over the budget;
  - `apps/web/package.json`: `bundle:report`;
  - `apps/web/src/routes/index.tsx`: the eager pages become lazy;
  - `apps/web/src/i18n/*` and `packages/shared/src/i18n/catalogue.ts`: load the active language, and the admin namespace with the admin chunk; only if the measurement shows they fill the first load;
  - `apps/web/vite.config.ts`: only if a chunk rule is needed;
  - `docs/testing/PERFORMANCE.md`: the numbers;
  - `.github/workflows/ci.yml`: the report after the build.
- **Approach:** measure first (the built chunks and their sizes), then split in the order of the technical decision, and stop once under the budget. Lighthouse runs once by hand, `npx --yes lighthouse@12 http://127.0.0.1:3100/login --form-factor=mobile`, and axe runs through the e2e scans.
- **Tests:**
  - unit: the report script counts the entry and its preloads and fails over the budget (a fixture `index.html` and fixture files).
  - existing: the language switch tests (`apps/web/src/i18n/*.test.tsx`, the e2e language step in `registration.spec.ts`) must still pass if the catalogue loading changes.
- **Done when:** `pnpm --filter @css/web bundle:report` prints 250 KB or less, it runs in CI, and PERFORMANCE.md has the numbers before and after and the Lighthouse scores.
- **Depends on:** U3, U4 · **Size:** M · **Risk area:** none
- **Status:** done

### U6. E2E per role home and the documents
- **Goal:** every demo account's home is checked in the browser, and the docs match the code.
- **Requirements:** R7 to R11, R13
- **Files:** `apps/web/e2e/home.spec.ts` (replaces the old home spec), `docs/ui/SCREENS.md` (Built lines), `CLAUDE.md` (map: shell, home), `docs/STATUS.md`
- **Approach:** like `e2e/notifications.spec.ts` and `e2e/support/admin.ts` (`signIn`, `scan`); read-only accounts per role and project, so it runs in parallel with the other specs.
- **Tests:**
  - e2e (mobile and desktop):
    - the volunteer 01700000101 sees "এখন আপনার কাজ" and "আমার প্রকল্প";
    - the team member 01700000119 sees the main volunteer's projects;
    - the Local দায়ী 01700000118 sees "আজকের ক্লাস" coming later;
    - the Paid Volunteer 01700000120 sees "আজকের কাজ" coming later;
    - the Official দায়ী `daee@example.org`, the executive `executive@example.org`, the RPM `rpm.rangpur@example.org`, the PM `pm.hum@example.org`, the Department Head `head@example.org` and Finance `finance@example.org` each see the widgets of SCREENS §4;
    - axe passes on each home;
    - on a phone, no home scrolls sideways.
- **Done when:** `home.spec.ts` passes with --repeat-each 3 --workers 1, and `pnpm docs:check` passes.
- **Depends on:** U4 · **Size:** M · **Risk area:** none
- **Status:** todo

## Checkpoints
- **Mode:** grouped (one by one 1, grouped 11, all at once 2; N is over 4, so one by one's point goes to grouped)
- **Signals:** N 6, L 1,400, R 1, Fd 2, C 4, P 0
- **C1** after U2: risk (auth, scoped counts); U1 and U2 feed the shell and the homes
- **C2** after U3: foundation for U4 and U5, and the largest change to the existing frames and tests
- **C3** after U4: foundation for U5 and U6
- **C4** after U6: end; scripted checks on the whole branch

## Verification
- `pnpm typecheck` · `pnpm lint` (incl. `pnpm i18n:check`) · `pnpm test`
- `pnpm --filter @css/api exec vitest run --config vitest.db.config.mts` (needs `docker compose up -d`)
- `pnpm docs:check` · `pnpm --filter @css/api authz:matrix`
- `pnpm e2e`, and from `apps/web`: `npx playwright test e2e/home.spec.ts e2e/shell.spec.ts --repeat-each 3 --workers 1`
- `pnpm --filter @css/web bundle:report` after `pnpm --filter @css/web build:e2e`
- Lighthouse once: `npx --yes lighthouse@12 http://127.0.0.1:3100/login --form-factor=mobile` against the e2e preview

## Risks and rollback
- **Frames and selectors:** the shell changes the frame of every signed-in page, and many e2e selectors read the old admin bar and menu. U3 updates them in the same unit. The old layouts are replaced, not kept side by side, so a revert of U3 restores them.
- **Catalogue split:** loading the message catalogue per language must not change any text. The language switch tests and the e2e language step guard it, and the split is reverted if they cannot pass.
- **The attention API:** it is read-only and reuses the list filters. A wrong scope would only show a count that the opened list still refuses, and the scope tests per role catch it.

## Definition of done
- All units done and their tests pass
- Verification commands pass
- `ae-review` has run, with no open P0 or P1
- Code from abandoned attempts is removed

## Progress
- **Branch:** `feat/app-shell-my-work` (stacked on `feat/notifications`)
- **Updated:** 2026-10-18 13:25
- **Next:** U6: `e2e/home.spec.ts` per role home (mobile and desktop), then the docs (SCREENS Built lines, CLAUDE.md map, STATUS)
- **Reviewed through:** C3 at 108261b
- **Uncommitted:** none
- **Notes:** doc review on 2026-10-18 (two reviewers): the owner chose a side rail for volunteers from 640 px and hiding an official's tabs they may not use. FYI items not taken into the plan: no stop rule if the first load cannot reach 250 KB (then report the measured size to the owner and ask), no rate limit on `/me/attention`, Lighthouse version not pinned, no direct-URL test of `/admin/*` for a volunteer, a few shortcut and coming-later cards without their own test. U2: `GET /me/attention` in `routes/me.ts` (allowed for a pending registrant), `services/attention.ts` composing the inbox count, the volunteer's own projects, own corrections and recently answered edit requests, and the scoped counts through `RegistrationsService.waitingCount` and `ChangeRequestsService.waitingCount` (the same filters as their lists), `projectWhere` for drafts and windows, and open handovers through `userFilter`; C1 review (security, logic, standards; no P0/P1): official registrations became their own item `staff_registrations_pending` because `/admin/registrations` lists officials only and volunteers wait in `/admin/volunteers?state=pending`; the edit-request item opens `?tab=edits`; the project list gained the `endingSoon` filter so the deadline item opens the same projects it counts, and project counts also stay inside the `project.view` scope (`ProjectsService.listWhere`); the consent count keeps `myProjects.list` (a direct count would copy its assignment and team logic); U3: `components/shell/` (AppShell layout route around every signed-in route, AppBar, ProfileMenu, BottomTabs for both the phone tabs and the rail, MoreSheet, `use-online.ts` with `useOnline` and `useShellWidth`), navigation model in `admin/navigation.ts` (`sidebarFor`, `tabsFor`, `moreFor`, `isCurrent`), nav labels moved from `admin.nav` to the `nav` namespace so the first route needs no admin texts; the rail on a tablet holds the phone tab set plus "more" for officials too; the Official দায়ী holds `volunteer.view_all`, so the official with neither people nor projects in the tests is the Finance Team; "more" also lists the beneficiary list when the people tab opens the volunteers, and the account pages; the admin dashboard left the menu (My Work replaces it; U4 sends `/admin` to `/`); the shell gives the design system the router's `navigate`, so menu links no longer reload the page; e2e helpers `mainMenu`, `openDestination`, `openTab` (menu, else "more", else the people tab) and `fromProfileMenu` in `e2e/support/admin.ts`; the handover spec timed out once under the full parallel run and passed in the rerun and alone (5 s); C2 review (logic, security, standards): the More sheet reopened when the person came back to the page it was opened on (fixed: any page change closes it, and its links close it in the capture phase because React Aria links stop their own click), a failed logout no longer leaves an unhandled rejection, one `NavLinks` list for the three menus, the betterleaks hit on the test login password is a false positive; U4: `features/home/` (`MyWorkPage` at `/`, `AttentionList`, `HomeWidgets` with the live widgets and the "coming later" card, `widgets.ts` with the role table `ROLE_WIDGETS` and `widgetsFor`, `home-api.ts`), the `home` message namespace with ICU plurals in English; `HomeView` and the admin `DashboardPage` are gone, `/admin` sends to `/`; a pending registrant sees the notice and the attention list only, because `/me/projects` and `/notifications` refuse pending accounts; the PM's project counts are four small `include=total` calls; the default MSW handlers answer `/me/attention` and `/notifications` empty; the e2e steps that opened the profile from the old home buttons use the profile menu; C3 review (no P0/P1): failed counts showed 0 (now the error with retry), the attention list could stay stale for 30 s after the person acted (now asked again on each visit), a pending registrant was offered unread notifications whose page refuses pending accounts (now left out on the server), one `Loaded` helper for the widgets; the registrations test "sends an older link ... to the volunteer tab" timed out once at the 1 s default under the full suite and passed on the rerun (now waits 3 s); U5: the first route was 390.0 KB gzip; with every page except the login lazy (the shell too) it is 216.6 KB, so the catalogue split was not needed; the home with the shell adds 76.0 KB when not yet cached; Lighthouse 12 mobile on `/login`: Performance 78, Accessibility 100, Best Practices 100 (Lighthouse 12 has no PWA category); numbers in docs/testing/PERFORMANCE.md section 6; `bundle:report` runs in CI after the build; a `vite preview` left running on port 3100 is reused by Playwright and points it at the dev API, so stop it before `pnpm e2e`; kinds and routes in `@css/shared` (`ATTENTION_ROUTES`); the container builds it after the services it reads.
