---
title: The known issues fixed
type: fix
status: in-progress
source: plan
date: 2026-11-17
doc_review: 2026-11-17
---

# The known issues fixed

## Goal
The defects, gaps and flaky tests listed under "Known issues" in `docs/STATUS.md` are fixed, so the Phase 2 UAT starts on a system without known faults: a blocked person's ongoing application can still be worked on, every role reaches what its permissions grant, the phone keeps working when the network drops with the app open, the public link and the exports keep their limits, and the slow reads named in the measurements are fast.

## Problem
The identity plan, the Phase 2 gate and the programs and projects work each left a list of faults found outside their scope. The owner ordered on 2026-11-17: "Known issues গুলো ঠিক করে ফেল", after the program card's description (PR #63).

## Requirements
- **R1** A block set on a person refuses a new application, and a draft counts as new: the draft may still be edited but not submitted. An application submitted before the block goes on through review, approval and delivery, and its edits are not refused (BD-06, BR-010, D-179 (4)).
- **R2** The Procurement Team opens the application list and an application of its own house-construction project, as `permissions.yaml` grants (`application.view`, PROJECT, `house_construction_project`), and nothing more: the protected fields (NID and the other classes it does not hold) stay masked.
- **R3** An export file is downloaded only while the requester is active, still holds the export permission, every protected class the file carries and the scope the export was taken in; a requester who lost any of them is refused.
- **R4** The beneficiary lookup's daily limit answers a known and an unknown number the same way; the duplicate merges list pages past 100; a profile's projects by year come from all its applications, not the first 20.
- **R5** An application transfer to a volunteer whose consent to the project's rules is pending goes through, and the office is told the volunteer works on the applications only after accepting (decision D-179 (2), asked again on 2026-11-17).
- **R6** The public link: one sender cannot fill the link's photo ceiling (a per-sender share); enabling the link on another form asks first, naming the form whose live link stops; an unpublished draft is read only by those who may edit the project's forms; the per-IP limit stays until the pilot's load test (D-179 (1)). Enabling or moving the link needs the form edit right on the target form and on the form whose link stops; a caller without the right on that form is refused without learning its name. The per-sender share is keyed by the client address the server trusts (`req.ip` under the configured trust proxy), never a raw header (D-179 (5)).
- **R7** A project's close moves its unfinished applications to `closed` with the prior state kept, applications in implementation get the template's not-delivered outcome, and a reopen restores the prior states; the times helped are counted again on both (the close transition of `_common.yaml`, O-49).
- **R8** A builder-made question for a standard column with a reference list (gender, marital status, education, relationship) takes its options from that list, so the profile accepts its answers.
- **R9** Production has a path to load and update the workflow templates and the base reference lists without the seed (`docs/ops/DEPLOYMENT.md`, section on the first start).
- **R10** Offline with the app already open: a page whose data was not read before the network dropped reads the phone's copy instead of loading forever, and a route whose chunk failed offline loads again once the network is back, without a reload.
- **R11** The project setup's component dialog shows the saved values when it is opened again right after a save; the form builder does not redraw the whole canvas after each save, and its save state stays in view while scrolling.
- **R12** Performance (D-179 (3)): the upload finalize joins the parts outside the transaction; an application list loads each workflow definition once per request, not per row; the phone's photo queue sums sizes without reading the photo bytes; the builder's autosave writes only what changed; the public form keeps its definition between requests until the version changes; the export count runs under the time limit of the other list reads; the media summary counts in the database; the beneficiary statistics reach the 300 ms p95 target on the measurement data set. The program card reads stay as D-178 decided.
- **R13** The demo seed holds an approved application, so a demo person shows the times helped and the family's help; the E2E run processes uploads, so a cover upload is shown end to end; the fullest project card back fits a 360 px phone without scrolling.
- **R14** The flaky E2E tests are stable: the `scan` helper with focus on a radio, the accessibility sweep of the new-project screen, the random key of `placeReadyForm`, the identity-rules result on the phone while the send is syncing, and the offline journeys' address list; the duplicated date helpers are one.

## Scope
- In: the items of R1 to R14.
- Out (not now): the program card reads' time (D-178); the per-IP limit of the public link (D-179 (1), after the load test); the owner's development database holding the retired role `implementer` (the owner's database; the seed reports it); the measurement database's missing name keys (picked up by the next `perf:seed` run, done inside U12's measurement); notes that are settled or owner-side (the `.env` and port notes, D-059, E-001, `@swc/core`, Prisma consent, gitleaks, coverage enforcement, the blueprint wording).

## Key decisions
- **D-179 (recorded in U1, before its code):** the owner's answers of 2026-11-17: (1) the public link as recommended: a per-sender photo share, a confirmation before the link moves to another form, drafts only for the form editors, the per-IP limit after the load test; (2) a transfer to a volunteer whose consent is pending goes through, with the pending consent shown to the office (asked again: a volunteer added in the same request always starts pending); (3) every performance item now, the card reads excepted (D-178); (4) a blocked person's draft counts as a new application: editable, not submittable; a submitted application goes on; (5) the security review's hardening: the export download re-checks the scope too, the Procurement Team's view masks the protected fields, moving the public link needs the edit right on both forms, a double finalize of one upload runs once, and the public form's kept definition never outlives its link's state.

## Technical decisions
- **Stack profile:** unchanged (`CLAUDE.md`, "Stack profile"). No new package.
- **Block gate only on a new application** (BD-06): `resolvePerson` in `apps/api/src/applications/service.ts` checks `assertMayApply` only when the application is created or its person changes; the other call sites (create, submission) keep it.
- **Procurement reach:** the cause is found first (route access rule, scope match of the `house_construction_project` condition in `apps/api/src/access/effective.ts` and `conditions.ts`, or the web's admin gate); the fix keeps default deny and adds the "another role is refused" cases.
- **Export download re-check:** `apps/api/src/exports/download.ts` compares the job's sensitive classes with `sensitiveClasses` of the requester at download time.
- **Workflow close:** built through the engine's `project.closed` trigger in `apps/api/src/workflow/` with effects from `effects.ts`, called from `project-lifecycle.ts` inside the close transaction; the reopen restores from `workflow_transitions`; the times helped by the existing `recountHelp`.
- **Production sync** copies the idempotent pattern of `notifications:sync` (`apps/api/src/notifications/template-sync.ts`, `scripts/notifications-sync.ts`): a `reference:sync` step that inserts missing workflow templates and base list entries and never overwrites an edited one, run by `pnpm db:migrate` after the notification templates.
- **Offline queries:** `networkMode: 'offlineFirst'` in `apps/web/src/lib/query-client.ts`, with the phone's copy read through the existing store (`offline/snapshot.ts`, `applications-store.ts`); the lazy routes of `routes/index.tsx` go through one wrapper that drops a failed load so the next visit tries again.
- **Statistics speed:** first the plan of the query on css_erp_perf; an index or a kept count is added only where the plan shows the scan, each with a hand-written `down.sql` (DB-MIG-05, the repository's rule in CLAUDE.md).
- **Comments** point at documents by path and heading words; no ids in code, comments or test names.

## Progress
- **Branch:** `fix/known-issues`
- **Updated:** 2026-11-17
- **Next:** U9: offline with the app open
- **Reviewed through:** C7 (the review fixes after bad5c932)
- **Uncommitted:** none
- **Notes:** the owner said not to wait for a command between units or checkpoints. U1: a blocked person's draft is refused at the send by the workflow guard `workflow.guard.beneficiary_not_blocked` (409), not by `beneficiary.blocked`. C1 review: a draft not yet tied to anyone whose number later names a blocked person stays refused at its edit (409 `beneficiary.blocked`), because tying it would fill in the blocked person's names, which the lookup never reveals; BR-010 says so. U2: the cause was the scope builder (`resolveInstances` in `apps/api/src/access/scope.ts`) honouring the house-construction condition only for beneficiaries; the web gives the Procurement Team the tab's list only and a session's "আবেদন". The planned e2e journey is covered by `procurement-applications.test.ts` and the tab's component test instead, because the demo seed has no house-construction project. U4: the lookup's uniform refusal past the day's limit holds on the lookup screen only; an application's own gate lets an unknown number through, since that is how a new person is entered (each draft stays on record under its creator). The profile's years already came from every application (`personApplications`), so nothing changed there. The transfer is not refused for a pending consent (the owner's second answer); it answers `consentPending`. C4 left one item for the owner, to go into STATUS's known issues at the end: past the day's limit the application form still tells a known number outside the area (429) from an unknown one (201); counting unknown numbers against the limit would stop new people being entered, so it is recorded, not changed
  - U8: the workflow transitions point at the permissions, which also came only from the seed, so the sync adds the roles and permissions of permissions.yaml first (`src/access/catalogue-sync.ts`); the seed's stable ids moved to `src/core/stable-id.ts`, so the seed run after a sync updates the same rows.
  - U7: the list options themselves were built by D-163 (2026-11-08, after the gate's list of 2026-11-07): the save, the copy and the publish write the list's options, so a refusal at the publish has nothing to refuse and was not added; the unit adds the end of the builder journey, the profile created from the public entry of a builder-made form (`form-builder.spec.ts`, 3 of 3).
  - U6: the prior state is kept on the application row (`closed_from_status`, `closed_from_outcome`, migration `20261117160000_application_closed_from`), not in `workflow_transitions`, which holds the template's transitions, not a history; the close runs in `workflow/project-close.ts`, called by the project's close. The beneficiary check now lets a draft closed with its project stay without a person.
  - The owner's Docker stack was once started from this worktree (its api mounted the branch); `docker compose` belongs to the main checkout only. The demo seed's winter series collided with the series the project-series migration made for an existing project (fixed, commit 88fd4c66).

## Implementation units

### U1. A blocked person's ongoing application
- **Goal:** edits and moves of an application whose person was blocked later go on; a new application stays refused.
- **Requirements:** R1
- **Files:** `docs/DECISION_LOG.md` (D-179, first), `apps/api/src/applications/service.ts`, `apps/api/test/integration/applications*.test.ts`, `docs/BUSINESS_RULES.md` (BR-010 and its test)
- **Approach:** `resolvePerson` is used by the create (service.ts, the create call) and the edit (the edit call); its gate (`assertMayApply`) is skipped when the application is already bound and the number resolves to the same person (`boundTo === live`), and `pickedPerson` skips it the same way for the bound person. The create keeps the gate; the submission's gate in `submission.ts` stays, so a blocked person's draft cannot be submitted; the moves after submission never call it.
- **Tests:**
  - integration: a draft created, the person blocked: the draft edited (200), its submission refused (the block's error); an application submitted, then the person blocked: an official's edit (200) and its review and approval move (200); a new application for the blocked person refused; an edit that changes the person to a blocked one refused.
  - existing: none for the edit-after-block case, characterize first.
- **Done when:** D-179 is in the decision log and the integration cases pass.
- **Depends on:** none
- **Size:** S
- **Risk area:** personal data
- **Status:** done

### U2. The Procurement Team's applications
- **Goal:** the Procurement Team opens the list and the record of the applications of its own house-construction project.
- **Requirements:** R2
- **Files:** `apps/api/src/access/{effective,conditions,scope}.ts`, `apps/api/src/routes/applications.ts`, `apps/web/src/admin/navigation.ts`, `apps/web/src/admin/applications/ApplicationsPage.tsx`, tests beside them, `docs/security/AUTHORIZATION_MATRIX.md` (rewritten by `authz:matrix`)
- **Approach:** reproduce with the demo procurement account on a house-construction project, find where the grant is lost, fix there; follow the scope tests of `apps/api/test/integration/access-scope*.test.ts`.
- **Tests:**
  - integration: procurement on its house-construction project lists and reads (200, no edit action offered, the NID and the other classes it does not hold absent from the response through `access/field-mask.ts`); on a distribution project and on another house-construction project it is not on, 404 (`permission.not_found`, the repository's refusal for an unreachable record); a volunteer refused 404.
  - e2e: sign in as the procurement demo account, open "প্রোগ্রাম ও প্রকল্প", the house-construction session, "আবেদন": the list shows and the review page has no decision buttons.
  - existing: covered by `apps/api/test/integration/access-effective.test.ts` and the authorization matrix test; neither has this grant.
- **Done when:** the cases pass and the matrix report is current.
- **Depends on:** none
- **Size:** M
- **Risk area:** auth
- **Status:** done

### U3. The export download after a lost class
- **Goal:** a requester who no longer holds a sensitive class of the file is refused its download.
- **Requirements:** R3
- **Files:** `apps/api/src/exports/download.ts`, `apps/api/test/integration/exports.test.ts`
- **Approach:** `exportDownload` already re-checks the active state, `export.list` (or the record's permission) and the export permission of each class. First a failing test reproduces the reported case (the class's view right lost while its export right stays, or the scope lost); then the check adds what is missing: the requester's live scope must still reach the frozen list's scope (the frozen query's scope instances against `access.load`), and a class needs its view right as well as its export right. The refusal stays the existing 404.
- **Tests:**
  - integration: the reported case reproduced and refused 404; the project scope revoked after the request, 404; the export permission revoked, 404 (existing); a deactivated requester, 404 (existing); everything still held, 200; another user 404 (existing).
- **Done when:** the cases pass.
- **Depends on:** none
- **Size:** S
- **Risk area:** auth
- **Status:** done

### U4. The lookup limit, the merges list, the profile's years, the transfer gate
- **Goal:** R4 and R5.
- **Requirements:** R4, R5
- **Files:** `apps/api/src/services/beneficiary-identity.ts`, `apps/api/src/services/beneficiary-merges.ts`, `apps/api/src/services/beneficiaries.ts`, `apps/api/src/applications/transfers.ts`, `apps/web/src/admin/beneficiaries/duplicates/`, `apps/web/src/admin/projects/volunteers/TransferPage.tsx`, the i18n catalogue (bn, en), `docs/api/openapi.yaml` where a list gains pages
- **Approach:** the lookup's daily cap answers the one refusal for both outcomes before the read; the merges list takes the existing keyset pagination (`core/pagination`); the years come from a grouped read; the transfer refuses a target whose `consentStatus` is not `accepted` with a new error `application.transfer_consent_pending` (422), shown on the transfer page.
- **Tests:**
  - integration: the cap reached, a known and an unknown number get the same status and body; merges list page two; a profile with 25 applications shows every year; a transfer to a pending-consent volunteer 422, to an accepted one 200.
  - e2e: on the transfer page choose a volunteer whose consent is pending and press "বদলি করুন": the message "এই স্বেচ্ছাসেবক এখনো প্রকল্পের নিয়মে সম্মতি দেননি; সম্মতির পরে বদলি করা যাবে।" shows (text polished with ae-bangla-copy at build).
- **Done when:** the cases pass; BUSINESS_RULES gains the transfer rule with its test.
- **Depends on:** none
- **Size:** M
- **Risk area:** personal data
- **Status:** done

### U5. The public link's limits and drafts
- **Goal:** R6.
- **Requirements:** R6
- **Files:** `apps/api/src/services/public-photos.ts`, `apps/api/src/services/public-link.ts`, `apps/api/src/services/forms.ts` and `routes/forms.ts` (the draft read), `apps/web/src/admin/forms/PublicLinkPanel.tsx`, `packages/shared/src/files` (the public photo limits), catalogue, `docs/api/openapi.yaml`, `docs/architecture/FILES_AND_DOCUMENTS.md`
- **Approach:** the per-sender share is a fraction of the link's photo ceiling (recorded in FILES_AND_DOCUMENTS, "Public photos"), keyed by `req.ip` under the configured trust proxy; the enable call needs the form edit right on the target form and on the form whose link is live, then answers 409 `public_link.replaces_live` naming the live form unless `confirm: true` is sent; a caller without the right on the live form gets 403 without its name; the draft read requires the form edit permission.
- **Tests:**
  - integration: one sender stops at its share while another can still add; an untrusted `X-Forwarded-For` does not change the sender; the enable on a second form 409 with the first form's name, then 200 with `confirm`; a caller without the edit right on the live form 403 with no form name in the body; a project member without the form edit right reads the published version but not the draft (403).
  - e2e: in the form builder of a second form press "Public লিংক চালু করুন": the dialog "লিংক বদলাবেন?" names the first form, "হ্যাঁ, লিংক বদলান" moves it, and the old link page shows the closed-link message.
- **Done when:** the cases pass.
- **Depends on:** none
- **Size:** M
- **Risk area:** auth
- **Status:** done

### U6. A project's close closes its applications
- **Goal:** R7.
- **Requirements:** R7
- **Files:** `apps/api/src/services/project-lifecycle.ts`, `apps/api/src/workflow/{engine,effects}.ts`, `apps/api/test/integration/project-lifecycle*.test.ts`, `docs/architecture/WORKFLOW_ENGINE.md`
- **Approach:** a new engine entry point (the engine runs only `on_enter_<state>` triggers today, `engine.ts`): `closeProject(tx, projectId)` applies the `_common.yaml` transition with `trigger: project.closed` to every unfinished application as a system actor (each a `workflow_transitions` row holding the prior state, the effects of the template, the audit `application.closed`); `reopenProject` reads each application's last close transition and moves it back to that state (its own transition row and audit), which `_common.yaml` and WORKFLOW_ENGINE gain as the reopen rule. A closed project's applications cannot move (the `project.not_closed` guard), so none moved between the close and the reopen. `recountHelp` after both, as the comment in project-lifecycle.ts marks.
- **Tests:**
  - integration: a project with submitted, approved and in-implementation applications closed: all `closed`, the in-implementation one with the not-delivered outcome, transitions written; reopen restores each; the times helped equal before and after the round trip.
- **Done when:** the cases pass and the comment marking the gap is gone.
- **Depends on:** none
- **Size:** L
- **Risk area:** personal data
- **Status:** done

### U7. A builder question's reference-list options
- **Goal:** R8.
- **Requirements:** R8
- **Files:** `apps/web/src/admin/forms/draft.ts`, `OptionsEditor.tsx`, `packages/shared/src/forms/{core,definition}.ts`, `apps/api/src/services/forms.ts` (the publish), tests (`forms.ts` is touched by U5, U7 and U11 in that order)
- **Approach:** a question bound to a standard column with a reference list reads its options from the list (read only in the editor, with a note), and the publish check refuses a definition whose options leave the list.
- **Tests:**
  - unit: the draft edit for a gender question takes the list's codes; the publish check refuses a changed code.
  - integration: a builder-made form with a gender question published and submitted; the profile is created from a public entry.
  - e2e: covered by `form-builder.spec.ts`, which now finishes the verification of the public entry it stopped at.
- **Done when:** the form-builder journey passes past the verification dialog.
- **Depends on:** none
- **Size:** M
- **Risk area:** none
- **Status:** done

### U8. The production sync of the templates and base lists
- **Goal:** R9.
- **Requirements:** R9
- **Files:** `apps/api/src/workflow/template-sync.ts` (new, the workflow templates, on the pattern of `notifications/template-sync.ts`), `apps/api/src/services/reference-lists-sync.ts` (new, the base lists), `apps/api/scripts/reference-sync.ts` (new, runs both), `apps/api/package.json`, root `package.json` (`db:migrate`), `apps/api/seed/sets/base/` (reads the same sources), `docs/ops/DEPLOYMENT.md`, `CLAUDE.md` commands
- **Approach:** the sync inserts what is missing and leaves edited rows alone; a shipped template whose content differs from the stored one is reported with its difference (never overwritten), so a corrected template reaches production by an explicit step the report names; every skipped row is logged; it runs under the migration role and never writes demo data; the base seed calls the same code so both stay one source.
- **Tests:**
  - integration: on an empty migrated database the sync loads every template and list; a second run changes nothing; an edited list entry is kept.
- **Done when:** the cases pass and DEPLOYMENT names the step.
- **Depends on:** none
- **Size:** M
- **Risk area:** migration
- **Status:** done

### U9. Offline with the app open
- **Goal:** R10.
- **Requirements:** R10
- **Files:** `apps/web/src/lib/query-client.ts`, `apps/web/src/routes/index.tsx`, the pages that read the phone's copy, `apps/web/e2e/offline.spec.ts`
- **Approach:** `offlineFirst` queries fall back to the store when the fetch fails offline; the store is already sealed per signed-in person and wiped at logout and on revocation (`offline/crypto.ts`, `keys.ts`, `lib/wipe.ts`), and the fallback reads only through the open key ring; the route loader wrapper forgets a rejected import.
- **Tests:**
  - unit: the loader wrapper retries after a rejection.
  - e2e (mobile): open the home online, go offline, open "আমার প্রকল্প" not read before: the cached projects show instead of "লোড হচ্ছে"; a route whose chunk failed offline opens after the network returns without a reload; after one volunteer's logout another signs in on the same phone and, offline, sees none of the first one's records.
- **Done when:** the offline spec's new journeys pass three times in a row (`--repeat-each 3 --workers 1`).
- **Depends on:** none
- **Size:** M
- **Risk area:** none
- **Status:** todo

### U10. The setup dialog and the builder's redraw and save state
- **Goal:** R11.
- **Requirements:** R11
- **Files:** `apps/web/src/admin/projects/setup/ComponentDrawer.tsx`, `ComponentsSection.tsx`, `apps/web/src/admin/forms/use-draft-save.ts`, `FormBuilderPage.tsx`, the forms CSS, tests
- **Approach:** the dialog resets its form from the saved answer; the save merges the server's answer into the draft keeping the objects whose content did not change; the save state sits in the sticky header.
- **Tests:**
  - unit/component: save then reopen shows the new value; a save keeps the identity of unchanged questions (no rerender count rise).
  - e2e: covered by `form-builder.spec.ts` and the setup spec, with a check that "সংরক্ষিত" stays visible after scrolling the canvas.
- **Done when:** the tests pass.
- **Depends on:** none
- **Size:** M
- **Risk area:** none
- **Status:** todo

### U11. The server's slow paths
- **Goal:** R12 except the statistics and the phone's queue.
- **Requirements:** R12
- **Files:** `apps/api/src/services/uploads.ts`, `apps/api/src/files/parts.ts`, `apps/api/src/applications/service.ts`, `apps/api/src/services/forms.ts`, `apps/api/src/services/public-forms.ts`, `apps/api/src/exports/service.ts`, `apps/api/src/services/media-home.ts`, `docs/testing/PERFORMANCE.md`
- **Approach:** finalize first claims the session atomically (a conditional status change, so a second finalize gets the replay answer), joins the parts and stores the object outside a transaction, re-checks the joined size and the type from its bytes (`files/policy.ts`), then writes the rows and counts the link's photo ceiling in a short transaction, and removes the stored object if that transaction fails; the list reads the definitions of its page's keys once; the autosave writes the changed rows by their ids; the public form keeps only the immutable definition per version id in memory, and the link's live, published and closed checks run on every request before it is read; the export count goes through `core/bounded-read.ts`; the media summary groups in SQL.
- **Tests:**
  - integration: existing tests of each service stay green (covered by `uploads`, `applications`, `forms`, `public-forms`, `exports`, `media` integration tests); new: two finalize calls at once store one file and one row; a failed row write leaves no stored object; a joined file of another type is refused; a list of 50 rows reads the definition once (query count); an autosave of one changed question writes one row; after the link moves, the old link answers closed with the definition already kept.
- **Done when:** the tests pass and PERFORMANCE records before and after where measured.
- **Depends on:** none
- **Size:** L
- **Risk area:** file storage
- **Status:** todo

### U12. The beneficiary statistics and the phone's photo queue
- **Goal:** the statistics under 300 ms p95 on css_erp_perf; the queue sums sizes from kept metadata.
- **Requirements:** R12
- **Files:** `apps/api/src/services/beneficiaries.ts` (`statistics`), a migration with `down.sql` if an index or kept count is needed, `apps/web/src/offline/{db,photo-queue}.ts`, `docs/architecture/OFFLINE_SYNC.md`, `docs/testing/PERFORMANCE.md`, `docs/database/DATABASE_SCHEMA.md` if the schema changes
- **Approach:** measure with `perf:lists --only statistics`, read the plan, change the query or add the index the plan asks for. The queue already keeps each photo's size, but `usage()` reads every row with its bytes (`photos.toArray()`): the sizes move to a table of their own in the Dexie store (`db.ts`, a version bump whose upgrade writes the size row of every photo already queued on a phone), and `usage()` and the budget check read only that table.
- **Tests:**
  - integration: the statistics' figures equal before and after on the test data.
  - unit: the queue's total from the size table without reading the photos table; the upgrade from the earlier version keeps every queued photo and writes its size.
- **Done when:** `perf:lists` shows the statistics under 300 ms p95 for all and for a district.
- **Depends on:** none
- **Size:** L
- **Risk area:** migration
- **Status:** todo

### U13. The demo seed, the E2E uploads, the project card back
- **Goal:** R13.
- **Requirements:** R13
- **Files:** `apps/api/seed/sets/demo/index.ts`, `docs/testing/DEMO_ACCOUNTS.md`, `apps/api/scripts/e2e-server.ts` (the photos queue beside `e2e-export-worker.ts`), `apps/web/src/admin/projects/{ProjectSeriesCard.tsx,cards.css,cards-api.ts}`, `apps/web/e2e/program-pages.spec.ts`
- **Approach:** one approved application of a demo person; the E2E API runs the photos consumer as it runs the export worker; the back's own-work block tightens at 360 px.
- **Tests:**
  - e2e: a program cover uploaded in the program dialog shows on its card; the fullest project card back at 360 px has no inner scroll (`scrollHeight <= clientHeight`); the demo person's profile shows "সহায়তা পেয়েছেন 1 বার" (text as the catalogue has it).
- **Done when:** the specs pass.
- **Depends on:** none
- **Size:** M
- **Risk area:** none
- **Status:** todo

### U14. The flaky tests and the date helpers
- **Goal:** R14.
- **Requirements:** R14
- **Files:** `apps/web/e2e/support/{admin,forms,offline}.ts`, `apps/web/e2e/{a11y,identity-rules,offline}.spec.ts`; the Dhaka-day helpers `dhakaDayStart` (`apps/api/src/jobs/storage-stats.ts` and `apps/api/src/services/beneficiary-identity.ts`) and `dhakaYear` (`apps/api/src/services/beneficiaries.ts`) as one module `apps/api/src/core/dhaka-day.ts` (new) with its spec
- **Approach:** `scan` waits for a stable page without pressing into a radio; the sweep waits for the label's move to end; the ready form key from the test's own counter; the identity-rules check waits for the synced state; the offline journeys wait for the address list in the store.
- **Tests:**
  - unit: the Dhaka day start and year at the day's edge (just before and at midnight in Dhaka).
  - e2e: each named spec passes `--repeat-each 3 --workers 1`, and one full `pnpm e2e` run is green.
- **Done when:** a full E2E run is green with no flaky test.
- **Depends on:** none
- **Size:** M
- **Risk area:** none
- **Status:** todo

## Checkpoints
- **Mode:** grouped (one by one 6, grouped 12, all at once 4; one by one's 6 added to grouped since N is over 4)
- **Signals:** N 14, L 2,650, R 9, Fd 0, C 1, P 2
- **C1** after U1: personal data
- **C2** after U2: auth
- **C3** after U3: auth
- **C4** after U4: personal data
- **C5** after U5: auth
- **C6** after U6: personal data, a new engine entry point
- **C7** after U8: migration (U7 reviewed with it)
- **C8** after U9: new pattern (the route loader wrapper)
- **C9** after U11: file storage (U10 reviewed with it)
- **C10** after U12: migration
- **C11** after U14: end (U13 reviewed with it)

## Verification
- `pnpm lint`, `pnpm typecheck`, `pnpm docs:check`, `pnpm rules:status --phase 2 --report-only`
- `pnpm --filter @css/api contract:coverage` (API unit and database tests, every operation answered)
- `pnpm test` (web with `--maxWorkers 2` where the load times files out)
- `pnpm --filter @css/api authz:matrix` after U2
- `pnpm e2e`, and the named specs with `--repeat-each 3 --workers 1`
- `pnpm --filter @css/api perf:lists --only statistics` on css_erp_perf for U12
- `pnpm --filter @css/web build` then `pnpm --filter @css/web bundle:report` (first route under 400 KB)

## Risks and rollback
- U6 changes many applications in one close: it runs in the close's transaction, and the reopen restores the prior states; a failed close rolls back whole.
- U8 and U12 touch the database: each migration has a hand-written `down.sql`; the sync never overwrites an edited row, so it can be run again.
- U2 changes access: the authorization matrix test proves no other role gains a right.

## Definition of done
- All units done and their tests pass
- Verification commands pass
- `ae-review` has run, with no open P0 or P1
- Code from abandoned attempts is removed
- `docs/STATUS.md` known issues updated: each fixed item removed, each left one says why
