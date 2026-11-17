---
title: The walk-through findings fixed
type: fix
status: in-progress
source: plan
date: 2026-11-17
---

# The walk-through findings fixed

## Goal
Everything the walk-through from a volunteer's registration to an approved application found is fixed (decision D-182), so the Phase 2 UAT testers meet none of it.

## Problem
On 2026-11-17 the owner asked for a hand walk-through of the whole path ("ভলেন্টিয়ার রেজিস্ট্রেশন থেকে শুরু করে আবেদন পাঠানো"). The path worked end to end, and the report listed defects and rough edges. The owner ordered all of them fixed, and a confirmation before the activation and the approval.

## Requirements
- **R1** The office's application list names each application's area (union, district) in the reader's language; the waitlist pull of an untargeted area names that area.
- **R2** No own page (`AccountPage`) scrolls sideways at 360 px; "আমার আবেদন" with its four tabs is the case found.
- **R3** The volunteer's home shows their applications by state with links, not "শিগগিরই আসছে"; an official's home counts the applications waiting for a review (`application.review`: submitted, under review) or an approval (`application.approve`: reviewed) inside the caller's scope on active projects, as an attention item opening the oldest; the "পর্যালোচনার তালিকা — শিগগিরই আসছে" card goes.
- **R4** The demo seed has a published ready beneficiary application form with the identity questions, so the PM can place it; the demo officials' designations are Bengali.
- **R5** The date and month pickers show Bengali month and weekday names and Bengali screen-reader texts in Bengali, English ones in English, digits English in both (UX-05).
- **R6** Activating a project, approving an application and approving one from the waitlist each ask a confirmation first (D-182 (1)).
- **R7** A range error of a form answer names its bounds ("1 থেকে 20-এর মধ্যে").
- **R8** A send the server refuses for an answer (a validation error) leaves no "সিঙ্ক হয়নি" mark: the error stands at the form, the record is not a failed sync.
- **R9** After the identity questions are added in one press, the next question added from the pane lands after them, not after the first.
- **R10** Registration: a field's error goes when its value changes; a Facebook link without `https://` is taken with it added; a registration photo's uploader is the registrant; every page's browser tab title has the same form.

## Scope
Out: the bank, reference and previous-project fields (removed by O-64 and O-65, they stay out); Bengali digits typed into free text (data as typed).

## Technical decisions
- R1: the API's application row carries `districtName` and `unionName` (`{bn,en}`, the joined location rows), an additive contract change; the web stops looking a union up among the divisions. The quota pull passes the filter's parent id.
- R2: `.account-page` gets `grid-template-columns: minmax(0, 1fr)`.
- R3: a new attention kind `applications_waiting` in `@css/shared` `ATTENTION_ROUTES`, counted like `verifications_pending`; the widget `my_applications` becomes live, `review_queue` leaves the roles' tables.
- R5: the kit's pickers take month and weekday names and the picker's screen-reader texts from the labels (`ui.json`), and build a dayjs locale from them.
- R6: the review page's `start` asks through `DecisionDialog` (no reason) for approve and pull; the lifecycle's activate asks through the kit's `ConfirmDialog`.

## Implementation units
- **U1** Area names in the office list (R1). Files: `apps/api/src/applications/{service,view}.ts`, `routes/applications.ts` schema, `docs/api/openapi.yaml`, `apps/web/src/admin/applications/{ApplicationsPage,QuotaBars}.tsx`, web schema. Tests: API integration (the names come in the list), web component test. Size M. Risk: API contract. Status: done
- **U2** Own pages at 360 px (R2). Files: `apps/web/src/components/auth-shell.css`; E2E check on `/my-applications` in the mobile project. Size S. Status: done
- **U3** Homes (R3). Files: `packages/shared/src/attention.ts`, `apps/api/src/services/attention.ts`, i18n `home`, `apps/web/src/features/home/*`, SCREENS. Tests: API integration of the count and scope, web tests of the widget and item. Size M. Risk: permissions scope. Status: done
- **U4** Demo seed (R4). Files: `apps/api/seed/sets/demo/index.ts`, `docs/testing/DEMO_ACCOUNTS.md`. Tests: seed test, E2E untouched. Size S. Status: todo
- **U5** Bengali calendar (R5). Files: `apps/web/src/ui/templates/asf/components/{pickers,labels}.tsx`, `ui.json` bn/en, the kit's test. Size S. Status: todo
- **U6** Confirmations (R6). Files: `apps/web/src/admin/applications/ApplicationReviewPage.tsx`, `apps/web/src/admin/projects/LifecycleActions.tsx`, i18n, E2E specs that approve or activate. Size M. Status: todo
- **U7** Range message (R7). Files: the web's field error rendering, i18n `errors`. Size S. Status: todo
- **U8** No failed-sync mark after a refused send (R8). Files: `apps/web/src/offline/applications-store.ts` or the form page. Size S. Status: todo
- **U9** Question placement after the identity questions (R9). Files: `apps/web/src/admin/forms/{FormBuilderPage,draft}.ts*`. Size S. Status: todo
- **U10** Registration and titles (R10). Files: `apps/web/src/features/registration/form-state.ts`, `packages/shared/src/registration/details.ts`, `apps/api/src/services/files.ts`, the seven pages that let the kit write the title. Size M. Status: todo

## Checkpoints
- C1 after U1–U3 (API contract and scope).
- C2 after U4–U7.
- C3 after U8–U10, with the whole-branch check.

## Verification
`pnpm lint`, `pnpm typecheck`, `pnpm docs:check`, `pnpm test`, `pnpm --filter @css/api contract:coverage`, `pnpm --filter @css/api authz:matrix` when routes change, `pnpm e2e`.

## Progress
- **Branch:** fix/manual-test-findings
- **Next:** C1 (test and review U1–U3), then U4
- **Reviewed through:** —
- **Uncommitted:** —
- **Notes:** The E2E width checks compared with `window.innerWidth`, which grows with the content under a phone emulation (Pixel 7 is `isMobile`), so they could not fail; they now compare with the root element's `clientWidth`. Run every spec with such a check at C1 on the mobile project.
