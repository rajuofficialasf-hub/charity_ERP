---
title: Fewer clicks in the application review, a per-project review checklist, clearer names
type: feat
status: in-progress
source: plan
date: 2026-11-18
---

# Fewer clicks in the application review, a per-project review checklist, clearer names

## সংক্ষেপে (মালিকের জন্য)

- **এক চাপে পাঠানো:** "রিভিউ শুরু" বোতাম উঠে যাবে। "অফিসে পাঠানো হয়েছে" থেকে সরাসরি "অনুমোদনের জন্য পাঠান" চাপা যাবে। কেউ চেকলিস্টে টিক দিলে বা উত্তর সম্পাদনা করলে সিস্টেম নিজেই "পর্যালোচনা চলছে" করবে। 12টি অবস্থা আর অডিট যেমন আছে থাকবে।
- **রিভিউ চেকলিস্ট, প্রকল্প ঠিক করবে:**
  - শুরুতে তিনটি বিষয়: পরিচয় যাচাই, ঠিকানা যাচাই, যোগ্যতা যাচাই। PM সেটআপে বাদ দিতে বা নতুন যোগ করতে পারবেন।
  - প্রতিটিতে "ঠিক আছে" বা "সমস্যা আছে" + মন্তব্য দেওয়া যাবে। কে কখন দিলেন, সেটা রাখা হবে।
  - প্রতিটি প্রকল্পে একটা সুইচ থাকবে: "চেকলিস্ট পূরণ না হলে পাঠানো যাবে না"। সুইচ বন্ধ থাকলে চেকলিস্ট ঐচ্ছিক।
- **একসঙ্গে অনেক বা সব আবেদন:**
  - তালিকায় "এই তালিকার সব আবেদন বাছুন" থাকবে।
  - একসঙ্গে "অনুমোদনের জন্য পাঠান" আর "অনুমোদন করুন" দুটোই করা যাবে, 50টি করে ভাগে, অগ্রগতি দেখিয়ে।
  - যে প্রকল্পে চেকলিস্ট বাধ্যতামূলক, সেখানে চেকলিস্ট অপূর্ণ আবেদনগুলো কারণসহ বাদ পড়বে।
- **নাম বদল:**
  - স্বেচ্ছাসেবকের ট্যাব: "পেন্ডিং" → "প্রক্রিয়াধীন", "বাতিল" → "প্রত্যাখ্যাত"।
  - অফিসের বোতাম: "বাতিল করুন" → "প্রত্যাখ্যান করুন", "বাতিল ফিরিয়ে নিন" → "পুনর্বিবেচনার জন্য পাঠান"।
  - অবস্থার নাম "গৃহীত হয়নি" যেমন আছে থাকবে।
- **এখন হবে না:**
  - 5 পর্যায়ের অগ্রগতি দেখানো: আপনি বেছে নেননি।
  - বাস্তবায়নের ধাপ আপনা থেকে এগোনো (প্যাকেজ পাঠানো → রিসিভ → বিতরণ): এটা Phase 3-এর বিতরণ কাজে হবে, কারণ সেই ধাপগুলো এখনো তৈরি হয়নি। এই দিকনির্দেশ DECISION_LOG-এ লিখে রাখা হবে।

## Context

The owner tested the office review during UAT and finds it click-heavy. Today a Project Executive presses "রিভিউ শুরু" and then "অনুমোদনের জন্য পাঠান" as two requests. The `under_review` state is mandatory, with no checklist and no one-step path (`packages/shared/src/workflow/actions.ts:33-47`, `docs/architecture/workflow-templates/_common.yaml:53-63`). D-182(1) recorded that these stay one press each; the owner now reverses that.

The owner also wants a review checklist whose strictness differs by project, and a bulk path that approves many or all applications. The bulk API takes 50 ticked rows per request, with actions `review` and `approve` only (`apps/api/src/applications/bulk.ts:18`).

Implementation stages (package_sent, received, distributed) are declared in `distribution.yaml` but not built (Phase 3). So the proposal's step-progress idea is recorded as direction for Phase 3 only.

## Owner decisions (2026-11-18, in chat)

- One press from `submitted` to `reviewed`. `under_review` becomes system-managed: it is entered on the first checklist answer or answer edit.
- A review checklist chosen per project: three starting items, PM may remove or add. Each item takes ok / problem + comment.
- Strictness per project: some projects check carefully, others need to approve many or all at once.
- Labels:
  - Tabs: পেন্ডিং → প্রক্রিয়াধীন, বাতিল → প্রত্যাখ্যাত.
  - Buttons: বাতিল করুন → প্রত্যাখ্যান করুন, বাতিল ফিরিয়ে নিন → পুনর্বিবেচনার জন্য পাঠান.
  - State label stays গৃহীত হয়নি.
- Not now: the 5-phase progress display.

**Proposed default:** the checklist switch "required before sending" is off for a new project, and the PM turns it on. This is recorded as proposed in the decision entry.

## Approach (units, each tested and committed on its own; branch `feat/review-one-press-checklist` from develop)

### U1 — Decision and rules
Append D-184 to `docs/DECISION_LOG.md`:
- it supersedes D-182(1) and the bulk-action part of D-131(4);
- the checklist decisions above;
- the Phase 3 direction: implementation steps advance by completion actions, with no start press.

Update in `docs/BUSINESS_RULES.md`:
- BR-090, BR-091 and BR-092;
- a new BR for the checklist and its per-project gate.

### U2 — One press to send for approval
API, `apps/api/src/applications/service.ts`:
- `send_for_approval` is available from `submitted` too.
- The service runs the `review` transition, then `send_for_approval`, through `WorkflowEngine.transition`, in one transaction.
- Both moves keep their audit entries and timeline rows. Workflow states and templates stay unchanged.
- In `availableActions` (`service.ts:2139`), `review` stops being offered to the screen; the API action stays for compatibility.

Answer edit:
- Allowed in `submitted` for a holder of `application.review` (today only `under_review`, `service.ts:159-163`).
- The first save moves the application to `under_review` in the same transaction.

Bulk:
- `bulkReviewSchema` gains `send_for_approval`, mapped to `application.review`. For a submitted row, the same two moves run.

Web:
- `ApplicationReviewPage.tsx` `ACTIONS` drops the `review` button.
- `ApplicationsPage.tsx` replaces bulk "রিভিউ শুরু" with "অনুমোদনের জন্য পাঠান" (enabled for submitted or under_review rows).

Also update the OpenAPI enum and the web schema `apps/web/src/api/schemas/office-applications.ts`.

### U3 — Labels
Keys in `packages/shared/src/i18n/messages/{bn,en}/applications.json`:
- `list.pending` "প্রক্রিয়াধীন" / "In process"
- `list.rejected` "প্রত্যাখ্যাত" / "Rejected"
- the reject action "প্রত্যাখ্যান করুন"
- return_to_review "পুনর্বিবেচনার জন্য পাঠান"

Use the ae-bangla-copy skill. Update the tests that assert these labels: the volunteer list and detail tests, the office applications tests, the home test, `e2e/applications.spec.ts`.

### U4 — Checklist configuration per project
Shared, `packages/shared/src/projects/`:
- `reviewChecklist(settings)` beside `identity-rules.ts`, read from the application form component's settings with defaults.
- Defaults: `required: false`, items `identity`, `address`, `eligibility` with bn/en labels.
- PM-added items get a generated key and bilingual labels.
- A zod schema in the component settings definition (`COMPONENT_SETTINGS_DEFINITION`).

Web:
- A "রিভিউ চেকলিস্ট" part in `apps/web/src/admin/projects/setup/ComponentDrawer.tsx` for `application_form`: the switch, plus a list of items to add, rename or remove.
- Reuse the drawer's existing save path (If-Match).
- Editable while the project is draft or active (`editableIn` already allows components).

### U5 — Checklist answers (API, database)
Prisma migration with a hand-written `down.sql`: table `application_review_checks`.
- Columns: `id`, `application_id`, `item_key`, `result` (`ok` | `problem`), `comment`, `checked_by`, `checked_at`, audit columns.
- Unique (`application_id`, `item_key`). A check constraint requires a comment when `result = problem`.
- No hard delete; a later answer updates the row and the audit keeps the before and after.

Route `PUT /applications/{applicationId}/review-checks/{itemKey}`:
- Permission `application.review`, scope application, audit `application.review_check`, If-Match on the application.
- An answer on a `submitted` application first moves it to `under_review`.
- Refused in any state other than submitted, under_review or reviewed.
- Refused for an item key the project's checklist does not list.

The application record:
- carries `reviewChecklist` (items with their answers), masked as `application.official_section`;
- never goes to a volunteer, in screens or exports.

The gate:
- runs as a `beforeApply` hook of the engine for under_review → reviewed (`apps/api/src/workflow/`, as `applications/side-effects.ts` does), so the single and the bulk path both pass it;
- when the project's switch is on and an item has no answer, it refuses with `review.checklist_incomplete` (422, bn/en message);
- in bulk, the refusal is that row's result.

Contract and docs: OpenAPI, `docs/security/permissions.yaml` (no new permission; the route is listed), `pnpm --filter @css/api authz:matrix`, DATABASE_SCHEMA and ERD rows.

### U6 — Checklist on the review page
A `ReviewChecklist` card on `ApplicationReviewPage.tsx` beside `Signals`:
- each item has "ঠিক আছে" and "সমস্যা আছে"; a problem opens a one-line comment;
- each answer shows who and when.

Behaviour:
- When the switch is on and items are missing, "অনুমোদনের জন্য পাঠান" stays enabled; the server's refusal names the missing items, mirroring the PublishChecklist pattern. When the switch is off, missing items are only shown.
- The approver (RPM) sees the answers at decision time.
- Works at 360 px.

### U7 — Select everything in the list for bulk
`ApplicationsPage.tsx`:
- "এই তালিকার সব {count}টি বাছুন" after the page's rows are ticked.
- The client reads the filtered list's rows with their versions page by page and sends them 50 at a time under one Idempotency-Key per batch.
- It shows the progress and ends with the done and refused counts. Refused rows stay ticked, with their reason.
- The existing bulk-approve confirmation shows the full count.
- No API change beyond U2, since the API keeps its 50-row limit.

### U8 — Docs, UAT, E2E
- Update `docs/ui/SCREENS.md` (review page, list bulk, setup drawer), `WORKFLOW_ENGINE.md` (system-managed under_review), and `docs/testing/uat/PHASE_2_UAT_BN.md` (the review scene and new checklist steps).
- Update `docs/STATUS.md`.

## Critical files
- `apps/api/src/applications/{service.ts,bulk.ts,side-effects.ts}`
- `apps/api/src/workflow/engine.ts` (hook registration)
- `apps/api/src/routes/applications.ts`
- `apps/api/prisma/` (migration)
- `packages/shared/src/projects/` (checklist settings), `packages/shared/src/workflow/actions.ts`
- `apps/web/src/admin/applications/{ApplicationReviewPage,ApplicationsPage}.tsx`
- `apps/web/src/admin/projects/setup/ComponentDrawer.tsx`
- `apps/web/src/features/applications/status.ts` (tabs unchanged, labels only)
- `docs/api/openapi.yaml`, `docs/DECISION_LOG.md`, `docs/BUSINESS_RULES.md`

## Reuse
- The identity-rules pattern: `packages/shared/src/projects/identity-rules.ts`, D-172.
- The engine's `beforeApply` hooks and the effects in `applications/side-effects.ts`.
- `BulkReviewService` with savepoints and idempotency.
- `DecisionDialog` and `ConfirmDialog`; the `PublishChecklist` list style.
- `useSchemaResolver` for the comment form.

## Verification
- API integration tests (`apps/api/test/integration/`):
  - one press from submitted records both moves and both audits;
  - an answer edit and a checklist answer each move a submitted application to under_review;
  - with the switch on, sending is refused with an item missing and allowed when all items are answered (a problem with a comment counts);
  - with the switch off, sending is allowed;
  - bulk `send_for_approval` gives a per-row refusal when the checklist is incomplete;
  - a volunteer and a reviewer outside the region are refused (403/404) and never receive `reviewChecklist`;
  - a problem without a comment answers 422;
  - the migration round trip.
- Shared unit tests for `reviewChecklist(settings)` defaults and schema.
- Web component tests:
  - the review page: no "রিভিউ শুরু", the checklist answers, the refusal message;
  - the list: select all, batches, refused rows;
  - the setup drawer: add, rename and remove items, and the switch;
  - the renamed tabs and buttons.
- E2E: update `applications.spec.ts` (one press, checklist at 360 px, select-all bulk approve) and the helpers that call `send_for_approval`. Run with `--repeat-each 3` and `--workers 1`.
- Commands: `pnpm test`, `pnpm lint`, `pnpm typecheck`, `pnpm docs:check`, `pnpm --filter @css/api contract:coverage`, `pnpm --filter @css/api authz:matrix`, `pnpm e2e`.
- Review: checkpoints after U2+U3 and after U5–U7 (`ae-review`, T2 for the routes and migration).
- Ship: one PR into develop, merged after green CI. The owner pulls and runs `pnpm db:migrate`; no reseed is needed.

## Checkpoints
- C1 after U1–U3 (one press and the labels): `ae-review` on the range.
- C2 after U4–U7 (the checklist and the select-all bulk): `ae-review`, T2 (a migration, a route, personal data masking).
- C3 after U8: the whole branch through `ae-check`, then the full test run before the pull request.

## Progress
- Branch: `feat/review-one-press-checklist`
- Unit status: U1–U8 done
- Next: the pull request into develop; merge after green CI
- Reviewed through: C2 at e416d00c
- Uncommitted: none
- Notes: C1 review (T2): no security finding; an official save with no change no longer starts the review; only volunteers hold application.edit_pending, so an official editing a submitted application under the review permission takes nothing from anyone. The owner approved this plan in chat on 2026-11-18 (plan mode); the default of the checklist switch (off) is recorded as proposed
