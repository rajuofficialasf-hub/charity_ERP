---
title: A session's page as a project frame, with a header, tabs and a summary
type: feat
status: in-progress
source: brainstorm
date: 2026-11-18
doc_review: 2026-11-18
---

# A session's page as a project frame, with a header, tabs and a summary

## Goal

An official who opens a session from the programs and projects tab (`/admin/projects/:projectId`) sees a professional project page: a header with the project's cover, name, state and key facts, one row of tabs that stays on top while they move between the session's parts, and a summary tab with real figures and how far the session has come, on a computer and on a 360 px phone, in light and dark.

## Problem

The owner, in chat on 2026-11-18: "প্রকল্পে ঢুকলে পেইজটি কি বাজে দেখায় দেখ। আমি চাচ্ছি পেইজটি এমন প্রফেশনাল হোক। এবং অবশ্যই আমাদের স্কিল অনুযায়ী করতে হবে।" Today the page is a bare title, a state chip, loose lifecycle buttons and one card of label/value rows with four buttons in its corner (`apps/web/src/admin/projects/ProjectOverviewPage.tsx`). The sub-pages (setup, volunteers, applications) are separate pages with their own titles, so the session has no frame that holds them together. The owner shared a mockup they like (cover, meta line, tab bar, stat cards, a summary of counts, a progress strip). It is the direction, not the specification: it uses Bengali digits (the app uses English digits only, UX-05), fake figures, and names parts that are not built (distribution, reports, share).

## Requirements

### Header
- **R1** The session's page has a header with the project's cover (the uploaded cover of its project series, else the drawn `CoverArt` of the series), the project's name, the state chip, a meta line (session, code, program) and the series' short description (the session's own description for a caller without `project.overview.view`, for whom the series is not read).
- **R2** The header's actions: "সম্পাদনা" opens the setup (for whoever may open the setup, while the session is a draft or active); the main lifecycle move of the current state is the one dark main button (draft "সক্রিয় করুন", active "বন্ধ করা শুরু করুন", closing "প্রকল্প বন্ধ করুন", closed "আবার খুলুন") for the PM and the global roles; every other allowed move, and "টেমপ্লেট হিসেবে সংরক্ষণ", sit in a three-dot menu; a "লিংক কপি" button copies the session's in-app address. Every move keeps today's confirmation, reason dialog and server check.
- **R3** No share to the outside: the copied link opens the page only for a signed-in official who may open the session (files and records stay private, D-074, D-181).

### Tabs
- **R4** Below the header, one row of tabs: সারসংক্ষেপ, সেটআপ, স্বেচ্ছাসেবক, আবেদন, বিতরণ, রিপোর্ট, কার্যক্রম. Each tab is a link with its own address; the header and the tab row stay on top of every tab's page.
- **R5** A tab shows only to whoever may open its page today (setup and volunteers to the project managers, applications to everyone who opens the session, the summary to everyone); the three not yet built (বিতরণ, রিপোর্ট, কার্যক্রম) show to everyone who opens the session and open a "শীঘ্রই আসছে" page.
- **R6** The summary tab shows the full header (cover and description); the other tabs show a compact header (a small cover, the name, the state, the actions), so a list or the setup keeps its room.

### Summary tab
- **R7** Four stat cards: the session's period, the per-volunteer application limit, the planned budget (only when the caller may see the budget; else the target number of people) and the program.
- **R8** A facts card "প্রকল্পের মূল তথ্য" with the facts not already on the stat cards: code, session, workflow, application window, and when it was activated or closed.
- **R9** A card "প্রকল্পের সারসংক্ষেপ" with whole-session counts: total applications, approved, waiting for review, waitlisted, volunteers, districts. They are the same counts for every holder of `project.overview.view` (the Department Head, Monitoring, PM, RPM, Project Executive), as on the project cards; a caller without it (the Procurement Team) sees no counts card. A count of applications opens the applications tab with that filter.
- **R10** A card "বাস্তবায়ন অগ্রগতি": a strip of the session's real stages, খসড়া → আবেদন গ্রহণ → আবেদন শেষ → বন্ধ হচ্ছে → বন্ধ, with the dates the record keeps (the application window, the close date), the current stage marked; under it a bar of approved people against the target (when a target is set) and the days left to apply (while the window is open). A cancelled session shows a notice instead of the strip. The distribution stage joins the strip when distribution is built (Phase 3).
- **R11** No figure is invented: every number comes from the server's data, in English digits, through the shared formatter.

### Everywhere
- **R12** Works at 360 px (header stacks, the tab row scrolls sideways with the current tab in view, cards in one or two columns), in light and dark, in Bengali and English, with keyboard focus and screen-reader names (the tab row is a navigation landmark with the current page marked).

## Scope

- In: the session's page and its frame around the setup, volunteers and applications pages; the three "শীঘ্রই আসছে" pages; a read of a session's counts; two new pieces of the asf set (a record header, link tabs); tests and documents.
- Out (not now): the distribution, reports and activity features themselves; a share outside the app; editing the cover or the description here (they stay on the project's page, `ProjectSeriesPage`); the form builder (`/forms`, `/forms/:formId`) and the transfer page (`/transfer`), which stay full pages outside the frame; the new-project wizard (`/admin/projects/new`); the project series page and the program page; the volunteer's own project page.

## Key decisions

The owner's answers in chat on 2026-11-18 (AskUserQuestion):
- **All seven tabs, the unbuilt three as "শীঘ্রই আসছে"**: the owner chose the mockup's full row. Governs R4, R5.
- **Whole-session counts, as on the cards**: the same figures for every overview role; no per-region figures. Governs R9.
- **The session's real stages plus the target bar**: the mockup's stages and percentage were invented. Governs R10.
- **One main button and a menu; a link copy, no share**: governs R2, R3.
- **The stage follows the dates** (answered at the plan review): an active session before its window opens is already at "আবেদন গ্রহণ" with its start date shown; a reopened session takes its stage from its dates; five stages, no separate "সক্রিয়" step. Governs R10.
- **The header and the tabs stay on every tab's page**: the session feels like one place. Governs R4, R6.

Choices made in this plan (the owner may change them at plan review):
- **The stat cards and the facts card do not repeat each other** (the mockup repeats four facts): a professional page says a thing once. Governs R7, R8.
- **The summary has six counts, not the mockup's four**: "বিতরণ সম্পন্ন" does not exist yet; waiting and waitlisted are the figures an official acts on, and districts and volunteers are already on the card.
- **Stat card icons in four tones, plain cards** (as `NisabPage` does), not tinted fills: the asf brief keeps tinted status colours for status.
- **The forms and transfer pages stay outside the frame**: the builder needs the whole screen, the transfer is a task page opened from the volunteers tab.

## Technical decisions

- **Stack profile unchanged** (`CLAUDE.md` "Stack profile", ST-40 to ST-45): no new library; React Router's nested layout route with `<Outlet/>` (as `AdminLayout.tsx:60`), TanStack Query, the asf set.
- **One new read, `GET /projects/{projectId}/summary`** in `apps/api/src/routes/project-series.ts`, with the same access shape as the cards' reads (`routes/project-series.ts:110-117`: permission `project.overview.view`, scope `program`, audit `none`, rate class `list`), `operationId: projectSeries.session.summary`, its `projectId` checked by the zod params schema (`params: { projectId: uuid }`, as `seriesId` at line 155; NE-REQ-01). It returns counts only (no person, no budget, no identity number). This widens `project.overview.view`: its description in `docs/security/permissions.yaml:649` says "opening a session stays with project.view", so U2 rewrites it to name the one exception, a session's whole counts, while every detail of a session stays with `project.view`; the owner chose these counts for these roles in the brainstorm, and confirms the wording with the decision entry (U1). The response schema sits beside the route's other response schemas in `routes/project-series.ts` (as `seriesDetail`, line 73). The service reuses `sessionFigures`, `volunteerCounts` and `districtCounts` (`apps/api/src/services/project-series.ts:141, 222, 240`) and the private `daysLeft` (line 496), made a module function both callers use. A cancelled session answers its counts too (the page shows them under the notice only if non-zero; the counts are history). An unknown id answers 404; a caller without the permission 403 (API-STD error envelope, the drift test, `test/support/contract.ts`).
- **The cover and description come from `GET /project-series/{seriesId}`** (`seriesDetail`, already read by `ProjectSetupPage.tsx:167` under `[...CARDS_KEY, 'series-detail', seriesId]`), only for overview holders; streaming a cover needs `project.overview.view` anyway (`apps/api/src/services/files.ts:765-784`), so the Procurement Team gets the drawn cover and the session's own `description`. No change to `GET /projects/{projectId}`.
- **The frame is a layout route.** `projects/:projectId` becomes a parent with `ProjectFrame` (new, `apps/web/src/admin/projects/frame/`) rendering the header, the tab row and `<Outlet/>`; children: index (the summary), `setup`, `volunteers`, `applications`, `distribution`, `reports`, `activity`. `forms`, `forms/:formId` and `transfer` stay siblings outside it. The frame reads the session once (`[...PROJECTS_KEY, 'one', projectId]`, the key the overview uses today); the sub-pages keep their own reads (deduplicated by the key where it matches), so no sub-page data flow changes.
- **The page heading.** The frame's `h1` is the project's name; each tab's page starts with an `h2` of its tab name in `app-sr-only` (the tab row already shows it), and its own `<Page title>` and `PageCrumbs` go; `DocumentTitle` stays per tab ("আবেদন · শীতবস্ত্র বিতরণ 2025"). The trail (program → project → session) is drawn once by the frame.
- **Lifecycle moves are split from their buttons.** `LifecycleActions.tsx` becomes a hook `useLifecycleMoves(project, etag)` returning the allowed moves, the main move of the state, a `start(move)` and the dialogs and error alert to render; the header draws the main button and menu items from it. The move order and the guards stay as they are (`transitionFor` from `@css/shared/projects`).
- **The stage strip** is a pure function `sessionStage(status, applyFrom, applyTo, today)` in `apps/web/src/admin/projects/stage.ts` (today from `isoDateInDhaka`) with this mapping (the owner, at the plan review on 2026-11-18: the stage by the dates, five stages): `draft` → খসড়া; `active` with no `applyTo`, or today on or before `applyTo` → আবেদন গ্রহণ (before `applyFrom` the step reads "শুরু হবে <applyFrom>"); `active` with today after `applyTo` → আবেদন শেষ; `closing` → বন্ধ হচ্ছে; `closed` → বন্ধ; a reopened session is `active` again and takes its stage from its dates the same way (an extended window brings back আবেদন গ্রহণ); `cancelled` → no stage (the page shows the notice). It is drawn with the asf `Timeline` in its horizontal form (`contract.ts:1185`), and `ProgressBar` (`contract.ts:1197`) for approved against target.
- **Two new asf pieces through `ae-ui` build** (the app is on asf; neither exists in `REGISTRY.md` or `local.json`): `RecordHeader` (a light header for a record: a media slot, the title with its status, a fact line with icons, a two-line description, actions; `compact` for the small form; stacks under 600 px) following `ProfileBanner` in `components/people.tsx`; and `LinkTabs` (a `nav` of links styled as the underline tabs, `aria-current="page"`, icons, sideways scroll with the current tab scrolled into view) following `components/tabs.tsx`, because the existing `Tabs` renders panels and has no links (`tabs.tsx:98-108`). Each goes into `contract.ts`'s extended set, `ui.extended.test.tsx`, `local.json` with a screenshot, and the gallery `dev/AsfGallery.tsx`.
- **The link copy** uses the set's `CopyButton` (`contract.ts:1240`, as `PhotoViewerDialog.tsx:104` does) with the in-app address `${location.origin}/admin/projects/${id}`.
- **The budget card's source** is the session read the frame already makes (`[...PROJECTS_KEY, 'one', projectId]`): the server leaves `budgetPlanned` out for a caller without the budget permission (`services/projects.ts`, as `ProjectFacts.tsx:52` reads it with `'budgetPlanned' in p`); when the field is absent the card shows the target number of people (`targetBeneficiaries`), and when that is absent too, no fourth card.
- **Plan ids stay in the plan** (ORG-CMT-10, ORG-CMT-50): code, comments and test names say the meaning in words, never R, U, C or decision numbers.
- **Texts** go under `admin.projects.frame.*` and `admin.projects.summary.*` in `packages/shared/src/i18n/messages/{bn,en}/admin.json`, Bengali written with `ae-bangla-copy`; numbers through `@css/shared/format`.

## Implementation units

### U1. Record the decision
- **Goal:** The owner's answers and this plan's choices are in the decision log before code.
- **Requirements:** all (record)
- **Files:** `docs/DECISION_LOG.md` (D-185; PR #70 took D-184), `docs/STATUS.md` (in work).
- **Approach:** as D-176 and D-181: the owner's words, the five answers, the choices of this plan, affects-list (the new read, permissions.yaml description, the two asf pieces, SCREENS, DESIGN_SYSTEM, openapi.yaml, AUTHORIZATION_MATRIX).
- **Tests:** none (document); `pnpm docs:check` passes.
- **Done when:** the entry is in, its state "approved" only after the owner confirms the plan in chat.
- **Depends on:** none
- **Size:** S
- **Risk area:** none
- **Status:** done

### U2. A session's counts: `GET /projects/{projectId}/summary`
- **Goal:** One read gives the whole-session counts to the overview roles.
- **Requirements:** R9, R10, R11
- **Files:** `apps/api/src/services/project-series.ts` (a `summary(viewer, projectId)` method and `daysLeft` as a module function), `apps/api/src/routes/project-series.ts`, `docs/api/openapi.yaml`, `docs/security/permissions.yaml` (the description of `project.overview.view` names the session summary), `docs/security/AUTHORIZATION_MATRIX.md` (`pnpm --filter @css/api authz:matrix`), `apps/api/test/integration/project-series.test.ts`, `apps/web/src/api/schemas/program-cards.ts` (`sessionSummarySchema`), `apps/web/src/admin/projects/cards-api.ts` (`sessionSummary(projectId)` under `CARDS_KEY`).
- **Approach:** copy the `read` route shape and `cards()`'s assembly (`project-series.ts:507-565`) for one session: `sessionFigures`, `volunteerCounts`, `districtCounts`, the target from the session, `daysLeft(applyTo)`. Response `{ applications, approved, waiting, waitlisted, volunteers, districts, target, daysLeft }`.
- **Tests:**
  - unit: `daysLeft` at the window's last day (0), after it (null), with no window (null).
  - integration (the repo answers a malformed id with 422, as "answers 422 to a program that is no id" does; 422 replaces the 400 below): an RPM of another region gets the whole session's counts equal to the card's figures for the current session; a draft session answers zeros; a cancelled session answers its counts; 400 for a malformed `projectId`; 401 without a token; 403 for a Procurement Team member and a volunteer; 404 for an unknown id; the response carries no budget field; the contract recorder validates against `openapi.yaml`.
  - existing: the cards' figures covered by `apps/api/test/integration/project-series.test.ts` stay green after `daysLeft` moves.
- **Done when:** the route answers as above, the drift test, `contract:coverage` and the authorization matrix test pass.
- **Depends on:** none
- **Size:** M
- **Risk area:** auth
- **Status:** done

### U3. asf piece `RecordHeader`
- **Goal:** A light record header in the set, full and compact, light and dark, stacking on a phone.
- **Requirements:** R1, R2, R6, R12
- **Files:** `apps/web/src/ui/contract.ts` (`RecordHeaderProps`: `title`, `headingLevel`, `media?: ReactNode`, `status?: ReactNode`, `facts?: { id, label, value, icon? }[]`, `description?: string`, `actions?: ReactNode`, `compact?: boolean`), a new `apps/web/src/ui/templates/asf/components/record.tsx`, exported from `components/index.ts`, `ui.extended.test.tsx`, `local.json`, `docs/ui/asf-pieces/record-header.png`, `apps/web/src/dev/AsfGallery.tsx`.
- **Approach:** `ae-ui` build, following `ProfileBanner` (`people.tsx:126-230`) for the fact line and the actions that move under the title when they do not fit; paper background, the card's hairline, radius 16, media 160×120 (compact 48×48, radius 8); description clamped to two lines with the whole text in `title`.
- **Tests:**
  - unit (component): the heading level and name; facts read with their labels; compact hides the description; actions are reachable by keyboard; no media gives no empty box.
  - e2e: covered by the gallery check `e2e/asf-gallery.spec.ts` (the piece is listed and renders).
- **Done when:** the scenario passes, the piece is seen in Chrome at 1280 and 360 px in light and dark with real Bengali text, and `local.json` lists it.
- **Depends on:** none
- **Size:** M
- **Risk area:** none
- **Status:** done

### U4. asf piece `LinkTabs`
- **Goal:** Tabs that are links, for a frame whose tabs are pages.
- **Requirements:** R4, R12
- **Files:** `apps/web/src/ui/contract.ts` (`LinkTabsProps`: `label`, `items: { to, label, icon?, current?: boolean }[]`), `apps/web/src/ui/templates/asf/components/tabs.tsx`, `components/index.ts`, `ui.extended.test.tsx`, `local.json`, `docs/ui/asf-pieces/link-tabs.png`, `apps/web/src/dev/AsfGallery.tsx`.
- **Approach:** `ae-ui` build, the look of the underline `Tabs` (`tabs.tsx:17-60`) on a `nav` of router links; the current one has `aria-current="page"` and the indicator; sideways scroll on narrow screens, the current one scrolled into view on mount.
- **Tests:**
  - unit (component): a `navigation` landmark with the given name; each item is a link to its address; the current one has `aria-current="page"`; Tab moves through the links.
- **Done when:** as U3.
- **Depends on:** none
- **Size:** M
- **Risk area:** none
- **Status:** done

### U5. The project frame around the session's pages
- **Goal:** The header and the tab row hold the summary, setup, volunteers, applications and the three "শীঘ্রই আসছে" pages.
- **Requirements:** R1–R6, R12
- **Files:** `apps/web/src/routes/index.tsx` (the parent route and its children), `apps/web/src/admin/projects/frame/ProjectFrame.tsx`, `frame/ProjectHeader.tsx`, `frame/tabs.ts` (the tab list and who sees each, from `../../roles`), `frame/ComingSoonPage.tsx`, `apps/web/src/admin/projects/LifecycleActions.tsx` (→ `useLifecycleMoves`), `ProjectOverviewPage.tsx` (only the summary body stays), `setup/ProjectSetupPage.tsx`, `volunteers/ProjectVolunteersPage.tsx`, `../applications/ApplicationsPage.tsx` (their `Page` title and crumbs go, an `app-sr-only` `h2`), `packages/shared/src/i18n/messages/{bn,en}/admin.json`, `apps/web/src/admin/projects/overview.test.tsx`, `frame/frame.test.tsx`.
- **Approach:** the `<Outlet/>` layout of `AdminLayout.tsx:60`; the header from U3 with `CardCover` (`CardCover.tsx`) as media, `ProjectStatusBadge` as status, `CopyButton` and the asf `Menu` (`MenuItemSpec`: `onSelect`, `tone: "danger"` for cancel) as actions; the tab row from U4; the trail through `PageCrumbs`. The "শীঘ্রই আসছে" page is an asf `EmptyState` with the tab's own one-line description.
- **Tests:**
  - unit (component): a PM sees all seven tabs, the main button of each state (draft "সক্রিয় করুন", active "বন্ধ করা শুরু করুন", closing "প্রকল্প বন্ধ করুন", closed "আবার খুলুন") and the others in the menu; an RPM sees no lifecycle button; a Procurement Team member sees সারসংক্ষেপ, আবেদন, বিতরণ, রিপোর্ট, কার্যক্রম only and the drawn cover; "লিংক কপি" copies the in-app address; a move still asks its reason and refreshes the page; a refused activation lists what is missing; 404 shows "not found" inside the trail.
  - e2e: `e2e/projects.spec.ts`, desktop and mobile: the PM opens a session from `/admin/projects`, sees the heading with the project's name and the chip, the tab row "সারসংক্ষেপ, সেটআপ, স্বেচ্ছাসেবক, আবেদন, বিতরণ, রিপোর্ট, কার্যক্রম", taps "আবেদন" and the address becomes `/admin/projects/<id>/applications` with the header still there, taps "বিতরণ" and reads "শীঘ্রই আসছে", opens the three-dot menu and sees "টেমপ্লেট হিসেবে সংরক্ষণ".
  - existing: `apps/web/src/admin/projects/overview.test.tsx`, `projects.test.tsx`, `setup/setup.test.tsx`, `volunteers/volunteers.test.tsx`, `../applications/*.test.tsx` assert the old page titles and button rows; update them, not duplicate. E2E specs that open the sub-pages (`applications.spec.ts`, `application-rules.spec.ts`, `assignment.spec.ts`, `exports.spec.ts`, `form-builder.spec.ts`, `form-logic.spec.ts`, `identity-rules.spec.ts`, `offline.spec.ts`, `projects.spec.ts`) are checked for a heading they look for; `a11y.spec.ts:289-296` sweeps the framed pages and gains the three new addresses.
- **Done when:** every session address opens inside the frame, the forms and transfer pages are unchanged, the existing tests pass with their updated headings.
- **Depends on:** U3, U4
- **Size:** L
- **Risk area:** none
- **Status:** done

### U6. The summary tab
- **Goal:** Stat cards, the facts, the counts and the progress strip on the summary tab.
- **Requirements:** R7–R11, R12
- **Files:** `apps/web/src/admin/projects/ProjectOverviewPage.tsx` (the summary body), `apps/web/src/admin/projects/summary/SessionCounts.tsx`, `summary/SessionProgress.tsx`, `apps/web/src/admin/projects/stage.ts` with `stage.test.ts`, `ProjectFacts.tsx` (an optional list of facts to leave out; the setup review step keeps all), `packages/shared/src/i18n/messages/{bn,en}/admin.json`, `overview.test.tsx`.
- **Approach:** `StatCard` in a `Grid` (`columns={{ base: 2, lg: 4 }}`; one column if a value wraps at 360 px when checked in Chrome) with icon tones as `NisabPage.tsx:127`; the counts as `StatCard`s with `to` into the applications tab's existing status filter (the states listed at `apps/web/src/admin/applications/ApplicationsPage.tsx:48`; "approved" and "waiting" may span several states, so link only where the filter can say the same thing, else no link); `sessionSummary` queried only when `canSeeProjectOverview(me)`; `Timeline orientation="horizontal"` and `ProgressBar` for R10; `Alert` for a cancelled session.
- **Tests:**
  - unit: `sessionStage` for draft, active before and inside the window, active after the window, closing, closed, reopened (active again), cancelled (no stage).
  - unit (component): the four stat cards with the budget for a PM and the target in its place for a caller without the budget; the facts card leaves out what the stat cards show; the six counts from the read, in English digits; a count links to `applications?status=…`; no counts card for the Procurement Team; the strip marks the current stage and shows the window dates; the bar shows "approved / target" only with a target; the days-left line only while the window is open; the cancelled notice.
  - e2e: `e2e/projects.spec.ts`: on the demo WNT session the PM reads "প্রকল্পের সারসংক্ষেপ" with "মোট আবেদন" and the number the applications tab counts, and "বাস্তবায়ন অগ্রগতি" with "আবেদন গ্রহণ" marked current; at 360 px no sideways page scroll (`document.documentElement.scrollWidth <= 360`).
- **Done when:** the tab matches the requirements in Chrome at 1280, 768 and 360 px, light and dark, both languages.
- **Depends on:** U2, U5
- **Size:** M
- **Risk area:** none
- **Status:** todo

### U7. Screens, documents and the full check
- **Goal:** The pictures and documents match the new page.
- **Requirements:** R12 (and documents)
- **Files:** `apps/web/e2e/screens.spec.ts` (the session's page and one framed tab at 1280, 768, 360 px), `docs/ui/SCREENS.md` ("Project list and project page" and the session page entry), `docs/ui/DESIGN_SYSTEM.md` (the record header and link tabs), `docs/architecture/SYSTEM_ARCHITECTURE.md` if it lists the routes, `CLAUDE.md` repository map (`admin/projects/frame/`, the summary read), `docs/STATUS.md`.
- **Approach:** as the documents of D-176 were updated in its plan.
- **Tests:**
  - e2e: `screens.spec.ts` writes the pictures; `a11y.spec.ts` passes in both languages.
- **Done when:** documents and pictures updated in the same branch; `pnpm docs:check` passes.
- **Depends on:** U5, U6
- **Size:** M
- **Risk area:** none
- **Status:** todo

## Checkpoints
- **Mode:** grouped (one by one 1, grouped 11, all at once 2; N is over 4, so one by one's score goes to grouped)
- **Signals:** N 7, L 1,200, R 1, Fd 1, C 4, P 0
- **C1** after U2: the new read and its permission (a risk unit U6 depends on).
- **C2** after U4: the two asf pieces before the frame uses them, and the 25-file limit before U5.
- **C3** after U5: the frame is the foundation of U6 and U7.
- **C4** after U7: end.

## Verification

- `pnpm lint` (ESLint with the hard-coded text rule, Prettier, `pnpm i18n:check`)
- `pnpm typecheck`
- `pnpm test` (unit, component and API; the `api-db` project for `project-series.test.ts` needs `docker compose up -d`)
- `pnpm --filter @css/api contract:coverage`
- `pnpm --filter @css/api authz:matrix` (commit the rewritten matrix)
- `pnpm docs:check`
- `pnpm --filter @css/web build` then `pnpm --filter @css/web bundle:report` (the frame is in the admin chunk; the first route's budget must hold)
- `pnpm e2e` (or the touched specs: `projects.spec.ts`, `a11y.spec.ts`, `screens.spec.ts`, `asf-gallery.spec.ts`, and the specs of U5's existing line)
- A look in Chrome at 1280 and 360 px, light and dark, Bengali and English, as `ae-ui` step 8 asks.

## Risks and rollback

- **The frame changes the headings of three working pages**: many E2E specs open them; U5 lists them and each is run before C3. Rollback is reverting the branch: no migration, no data change.
- **The new read is a count over a session's applications**: the same queries the cards run per session, for one session; no new index. If it is slow on `css_erp_perf`, measure with `perf:lists --only summary` before C1.
- **Decision number clash**: the review-checklist branch also writes the decision log; renumber at merge.

## Definition of done
- All units done and their tests pass
- Verification commands pass
- `ae-review` has run, with no open P0 or P1
- Code from abandoned attempts is removed

## Progress
- **Branch:** `feat/project-page-frame`
- **Updated:** 2026-11-18 21:55
- **Next:** U6 (its tests pass now): its tests in `summary/summary.test.tsx` are written and fail on the missing texts; `stage.ts`, `summary/SessionCounts.tsx`, `summary/SessionProgress.tsx`, the time under a stage of the asf strip and `ProjectFacts`' `leave` are written, uncommitted. Before: U5, the frame: its component tests first in `apps/web/src/admin/projects/frame/frame.test.tsx`
- **Reviewed through:** C3 at 7ae62e8d (C3: security no findings; a refetch that fails keeps the frame and its page with a retry, the series description gives way to the session's when empty, the frame refuses a volunteer and offers a retry on a read that fails, both tested, the E2E move helper waits for the header's menu; the second read of the session by the applications and volunteers pages stays, P3; C2 at 783133e2: C1 at ef571207: logic and security: no findings; standards: a test that the PM of another program reads the same counts, added; the web `sessionSummary` call waits for its caller in U6; C2: security no findings; the tab row now scrolls itself only, not the page, the focus ring sits inside the link, and tests prove the unsafe address left out, the row's scroll and the header's actions by keyboard)
- **Uncommitted:** none
- **Notes:** the decision is D-185 (PR #70 took D-184); `docs/STATUS.md` is updated once in U7. `daysLeft` stayed a private method of the series service (both callers are in it); its cases (last day 0, after the window null) are proved by "gives the days left to the end of the window" in `project-series.test.ts`. The pieces' tests live in `ui.local.record.test.tsx` (the app's own pieces are tested there, not in `ui.extended.test.tsx`); one screenshot `docs/ui/asf-pieces/record-header.png` shows both. A local preview for this branch: `.claude/launch.json` (not committed) runs the E2E API with the demo seed on 4200 against `css_erp_test_frame` and Vite on 3200. U5 notes: on the setup tab the header offers no main move (the wizard's review step activates; two "সক্রিয় করুন" confused the journey); `ApplicationsPage` read the plain project under the frame's key `one`, now `one-plain` like the volunteers page; the copy and menu buttons sit together so they do not wrap apart on a phone; the frame's E2E journey is in `projects.spec.ts`. On this machine the full web suite times out a few tests at 5 s when run beside an E2E run; each passes alone. Run the API tests with Node 24.22 (`fnm` default) on this machine; 24.15 is refused. The worktree needed `prisma generate` first. The owner approved the plan in chat ("প্রকল্প পেইজ দিলাম। ঐটা শুরু করে দাও তাহলে প্ল্যান তো রেডি আছে"), relayed by the session that started this one; the branch starts from develop at 978d1b47 (PR #70, the review checklist), which took no decision number after D-183.
