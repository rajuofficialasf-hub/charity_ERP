---
title: Fix the Phase 1 and 2 UAT findings
type: fix
status: in-progress
source: plan
date: 2026-11-23
doc_review: 2026-11-23
---

# Fix the Phase 1 and 2 UAT findings

In this plan "UAT U-nn" names an improvement of the UAT results file; "U1", "U2" … are this plan's implementation units.

## Goal
Every bug and every improvement the Phase 1 and 2 UAT found (docs/testing/uat/UAT_RESULTS_2026-11_BN.md) is fixed and tested, so the owner can repeat the failed scenes and sign the gate.

## Problem
The UAT on 2026-11-23 found 18 bugs (B-02 to B-20, B-01 withdrawn, B-09 not a bug by the owner's decision) and 54 improvements (UAT U-01 to U-54). Two are urgent (one person helped twice after a merge; an extra area outliving its source), five block work on a field day.

## Requirements
Bugs (by severity):
- **R1** (B-15) A merge waits while both profiles have a sent, undecided application in the same project, naming those the official can see (a draft does not block; sending it later is refused as a repeat in the project); an application left behind after a decision carries a "same person, another application" mark on the review page and the kept profile.
- **R2** (B-07) An extra area an official passed on from their own extra area ends, audited, when its source ends.
- **R3** (B-20) The form builder adds, in one press, an optional "family members" list (name, relationship, age, monthly income) whose rows reach the profile's family.
- **R4** (B-19) "আরেকটি আবেদন" on the sent screen opens a new, empty application.
- **R5** (B-12) Bulk send and approve keep the refused rows ticked with their reason, and bulk approve takes one shared comment that is stored on each row it approves.
- **R6** (B-08) Requests from an office IP address listed in the settings are not held by the IP limits, and the registration's daily limit counts per draft, not per IP.
- **R7** (B-14) The public-entry verification shows the entry beside the matched profile and warns when the names differ.
- **R8** (B-11) A new mobile given on a known person's application is used for the family match from submission; the approver sees "the profile's mobile will change" and it is written to the profile, with its change log, at approval, unless the number belongs to another profile (then it stays on the application with a warning).
- **R9** (B-10) "আগে আসা আগে" lists the oldest first, and equal scores keep the earlier arrival first.
- **R10** (B-13) The application change log names who opened, who decided and why, and a sent-back answer is shown as sent back, not as a change.
- **R11** (B-16) The export writes the BEN number as on screen ("BEN-0000166").
- **R12** (B-17) A PDF that cannot be printed on this server fails at once with a plain message offering Excel or CSV; the deployment doc says the API must run as a non-root user.
- **R13** (B-18) The "big screen" notice shows only on the setup screens (form builder, project setup, permission panel, template and checklist editors).
- **R14** (B-02, B-03, B-04, B-05, B-06, UAT U-53) Wrong texts and data are corrected: the used-link text names the Admin or Department Head; outside development and test the API refuses to start without the app's real address, so links never carry 127.0.0.1; the demo names carry "(নমুনা)" once; seeded roles read "সিস্টেম দিয়েছেন"; a designation change has its own notice; a PM opening a project form is told that forms and scoring belong to the Monitoring Team, with "তৈরি ফর্ম বসান".

Improvements:
- **R15** Application lists and entry: UAT U-38, U-39, U-40, U-42 (with `?q=`), U-43.
- **R16** Unlocks and volunteer notices: UAT U-44, U-45, U-46, U-47.
- **R17** Profile history: UAT U-48, U-49.
- **R18** Entry without a document: UAT U-52.
- **R19** Media and exports: UAT U-50, U-51.
- **R20** Sign-in and devices: UAT U-01, U-02, U-54 (UAT U-03 already works: ণ-6 showed the sign-in returning to the linked page; kept only as the safe-redirect test below).
- **R21** Registrations and state names: UAT U-04, U-05, U-06, U-08, U-10, U-30.
- **R22** Permission panel and staff pickers: UAT U-11, U-13, U-14, U-18, U-29.
- **R23** Notifications and audit viewer: UAT U-12, U-15, U-16, U-27.
- **R24** Raw codes, nisab history, device tab: UAT U-21, U-26, U-28.
- **R25** Form builder: UAT U-31, U-32.
- **R26** Project setup and pages: UAT U-33, U-34, U-35, U-36, U-37, U-41.
- **R27** Shared UI: UAT U-07, U-09, U-17, U-19, U-20, U-22, U-23, U-24, U-25.

## Scope
- In: everything above, with tests and the documents each change touches.
- Out (not now): the PDF check on the host (ঞ-4, ঢ-8) and the download step (ণ-4) are re-run by the owner after the fixes; Phase 3 work.

## Key decisions
Owner, in chat on 2026-11-23:
- **Re-delegated extra areas end with their source**; re-delegation stays allowed and an extra area includes approval. Governs R2.
- **Scoring is set by whoever builds the form**; a placed ready form brings its scoring, so B-09 is not a bug. Governs R14.
- **Family members list in one press, optional.** Governs R3.
- **Office IP exemption** set in the settings, registration daily limit per draft. Governs R6.
- **Permission scope starts empty and must be chosen.** Governs R22.
- **Merge waits for open applications; decided ones get a same-person mark; a draft does not block.** Governs R1.
- **A new mobile reaches the profile at approval, not when it is another profile's number.** Governs R8.
- **Extra areas given before this fix are linked to their source where it can be found** (and ended if the source has already ended). Governs R2.
- **The API refuses to start outside development and test without a real app address.** Governs R14.
- **One name for a pending volunteer: "অনুমোদনের অপেক্ষায়"**, rejected counted apart as "প্রত্যাখ্যাত". Governs R21.
- **Bulk approve takes one shared comment.** Governs R5.
- **The big-screen notice stays on all setup screens.** Governs R13.
- Work order: all bugs first, then the improvements; one pull request per area; the first pull request also carries the UAT results (branch `docs/uat-phase-1-2`).

## Technical decisions
- **Stack profile** unchanged (CLAUDE.md "Stack profile"); nothing new is added.
- **Decisions first** (CLAUDE.md, constitution §2): U1 writes D-194 onwards to docs/DECISION_LOG.md before any code, numbers re-checked against `origin/develop` at each merge.
- **Extra-area source link** as a nullable self reference `source_area_id` on `user_extra_areas` (DB-MIG-*, hand-written down.sql), ended in the same transaction as its source; derived-from-`granted_by` rejected as ambiguous.
- **Office exemption** as a typed setting in `@css/shared/settings` read by the limiter chain in `apps/api/src/rate-limit/`; the exempt request still passes the per-login and per-draft limits (NE-SEC rate limiting stays on).
- **Contract changes** update `docs/api/openapi.yaml` with the unit and pass the drift test and the contract recorder: bulk review comment and row reasons (U6), extra-area source (U3), settings key (U7), verify read (U8), mobile-change flag (U9), change-log fields (U11), send-back message (U16), 360° history names (U17), status-code column (U19), device IP tail (U20), nisab history (U24).
- **Authorization lives in the API** (NE-SEC-03, RE-SEC-05): every rule that limits who may do or see something is enforced in the service and proven by an integration test with the refused caller (`TS-13`), the screen only reflects it — U2, U3, U7, U8, U9, U17, U19, U20, U22, U23.
- **Plan IDs stay in this plan** (ORG-CMT-10, ORG-CMT-50): R, U, UAT U-nn, B-nn, D-nn and scene codes never reach code, comments or test names; tests are named by behaviour (ORG-CMT-40).
- **New user-facing text** goes into the bn and en catalogues through `ae-bangla-copy`; no literals (`css/no-literal-ui-text`).
- **Pull requests**: PR 1 = U1–U7 (branch `fix/uat-bugs-urgent`, started from `docs/uat-phase-1-2`), PR 2 = U8–U14 (`fix/uat-bugs-rest`), PR 3 = U15–U19 (`feat/uat-improve-applications`), PR 4 = U20–U24 (`feat/uat-improve-people`), PR 5 = U25–U27 (`feat/uat-improve-forms-ui`); each squash-merged into develop after green CI (D-167).

## Implementation units

### U1. Record the owner's decisions
- **Goal:** the decisions above stand in the decision log and the business rules before code changes.
- **Requirements:** R1–R14, R21, R22
- **Files:** `docs/DECISION_LOG.md`, `docs/BUSINESS_RULES.md`, `docs/ui/DESIGN_BRIEF.md` (UX-04 note), `docs/STATUS.md`
- **Approach:** entries in the style of D-193; one per decision; amend the rules they touch (merge, extra areas, family members, rate limits, pending state name).
- **Tests:** none (docs); `pnpm docs:check` passes.
- **Done when:** D-194 onwards are in the log and `pnpm docs:check` is green.
- **Depends on:** none
- **Size:** S
- **Risk area:** none
- **Status:** done

### U2. Merge waits for open applications; same-person mark
- **Goal:** one person cannot hold two live applications in one project after a merge.
- **Requirements:** R1
- **Files:** `apps/api/src/services/beneficiary-merges.ts` (PENDING_STATES at :57, shared check at :275), `apps/api/src/applications/person-signals.ts`, `apps/web/src/admin/beneficiaries/duplicates/*`, `apps/web/src/admin/applications/Signals.tsx`, i18n `beneficiaries.json`, `applications.json`
- **Approach:** the conflict list (existing `beneficiary.merge_conflict` with params) covers the sent, undecided states (submitted, needs_verification, under_review, reviewed, waitlisted) and no longer `draft`; a draft left on the retired profile is refused at submission as a repeat in the project. The same-person signal is derived at read time from the merge row and the project (both the kept and the retired side), and names the other application's number only when the viewer reaches it.
- **Tests:**
  - integration: merge refused 409 with two reviewed applications in one project and both named; allowed after one is rejected; allowed with a draft on the retired side, and sending that draft later is refused; both left-behind and kept applications show the same-person signal; a reviewer outside the region gets the conflict and the signal without application numbers (`apps/api/test/integration/beneficiary-merges.test.ts`).
  - component (in place of e2e, since the E2E data holds no pair with open applications): the merge dialog's refusal lists "{project}: সিদ্ধান্তের অপেক্ষায় থাকা আবেদন" with "আবেদনটি খুলুন" linking each application the caller reaches (`duplicates.test.tsx`); the review page shows "একই ব্যক্তির আরেকটি আবেদন এই প্রকল্পে আছে: {appNo}" (`applications.test.tsx`). The demo pairs of the merge E2E now hold decided (rejected) applications, so that journey still merges.
  - existing: covered by `apps/api/test/integration/beneficiary-merges.test.ts`, `apps/web/e2e/beneficiary-merge.spec.ts`.
- **Done when:** the ঝ-2 situation is refused with the two numbers, and a decided leftover is marked.
- **Depends on:** U1
- **Size:** M
- **Risk area:** personal data
- **Status:** done

### U3. Re-delegated extra areas end with their source
- **Goal:** an extra area given from another extra area ends when that source ends.
- **Requirements:** R2
- **Files:** `apps/api/prisma/schema.prisma` (UserExtraArea), new migration with `down.sql`, `apps/api/src/services/extra-areas.ts` (give :176, end :221), `packages/shared/src/access/*` (row type), `docs/api/openapi.yaml`, `docs/database/DATABASE_SCHEMA.md`, `apps/web/src/admin/staff/ExtraAreas.tsx`
- **Approach:** `give()` records the giver's live extra-area row that covers the location as `source_area_id`; `end()` ends dependants recursively in the same transaction with reason "উৎস শেষ", one `user.extra_area_ended` audit and a permission-version bump each; the cascade needs no further authority check because it follows the ender's own right over the source. The migration backfills `source_area_id` for live rows whose giver held a covering extra area at the time of giving, and ends, audited, those whose source has already ended.
- **Tests:**
  - integration: RPM re-delegates from an extra area, the Head ends the RPM's area, the executive's area is ended and they lose the volunteers (403/404 on a Rangpur volunteer); an area given from the RPM's own project area is untouched; a chain of three ends together; the backfill links and ends as described; migration up and down.
  - e2e: none; the screen is unchanged (an ended area already lists its reason, here "উৎস শেষ"), and the API tests prove the chain end and its audit.
  - existing: covered by `apps/api/test/integration/extra-areas.test.ts`, `apps/api/src/access/hard-rules.spec.ts`, `apps/web/e2e/extra-areas.spec.ts`.
- **Done when:** the ড-5…ড-10 sequence leaves the executive without Rangpur.
- **Depends on:** U1
- **Size:** M
- **Risk area:** migration
- **Status:** done

### U4. One-press family-members list
- **Goal:** a form builder adds the family members list in one press, and its rows reach the profile.
- **Requirements:** R3
- **Files:** `apps/web/src/admin/forms/draft.ts` (pattern `addIdentityQuestions` :917, `addMobileOwnerQuestions` :1059), `apps/web/src/admin/forms/FormBuilderPage.tsx` (:530, :548), `packages/shared/src/forms/core.ts` (FAMILY_MEMBER_COLUMNS), i18n `forms.json`
- **Approach:** `addFamilyMemberQuestions` appends a part "পরিবারের সদস্য" with a repeat group (standard column `beneficiary_family_members`) holding name, relationship (`relationship_code`, reference list), age (`age_years`), monthly income (`monthly_income`); offered once per beneficiary application form; optional.
- **Tests:**
  - unit: the helper adds the group once with the four columns and passes the definition check (`draft.test.ts`, `definition.test.ts`).
  - integration: covered by `apps/api/test/integration/family-members.test.ts` (rows written from any list with the family-members column, the relationship list checked, other volunteers and the Media and Procurement Teams given no member); no server change.
  - component (in place of e2e): `PublishChecklist.test.tsx` — the button "পরিবারের সদস্যের প্রশ্নগুলো যোগ করুন" saves the part with the list and goes away. The owner's repeat of scene ঢ checks the whole flow.
- **Done when:** scene ঢ can be run.
- **Depends on:** U1
- **Size:** M
- **Risk area:** none
- **Status:** done

### U5. "আরেকটি আবেদন" starts a new application
- **Goal:** after sending, the volunteer can start the next application in one press.
- **Requirements:** R4
- **Files:** `apps/web/src/features/applications/ApplicationFormPage.tsx` (:570)
- **Approach:** the link carries a fresh navigation key (or resets the page state) so the same route remounts empty.
- **Tests:**
  - unit: pressing "আরেকটি আবেদন" shows the identity step again (`ApplicationFormPage` test).
  - e2e: none added; the component test runs the same press on the sent screen, and the E2E journeys of `applications.spec.ts` still pass through the page.
- **Done when:** ড-5 works without a reload.
- **Depends on:** none
- **Size:** S
- **Risk area:** none
- **Status:** done

### U6. Bulk results with reasons and a shared comment
- **Goal:** the office sees which rows failed and why, and can approve a full quota in bulk with one comment.
- **Requirements:** R5
- **Files:** `apps/api/src/applications/bulk.ts` (schema :17, rows :41), `docs/api/openapi.yaml`, `apps/web/src/admin/applications/ApplicationsPage.tsx` (:145–176), `apps/web/src/api/schemas/office-applications.ts`, i18n `applications.json`
- **Approach:** request takes an optional `comment` passed to each row's decision; refused rows stay ticked with the reason text of their error code; "মন্তব্য দিয়ে আবার চেষ্টা" retries only those.
- **Tests:**
  - integration: bulk approve over a full quota without a comment refuses those rows with `workflow.comment_required`, with a comment approves them and stores the comment; a reviewer outside the area is refused per row (`bulk-review.test.ts`).
  - e2e: none added; the component test `applications.test.tsx` runs the same flow (three ticked, "1টি হয়েছে, 2টি হয়নি", the two kept ticked with "মন্তব্য লাগবে", the comment and "মন্তব্য দিয়ে আবার চেষ্টা" → "2টি হয়েছে, 0টি হয়নি" with the comment sent), and the API test proves the quota refusal and the stored comment.
  - existing: covered by `apps/api/test/integration/bulk-review.test.ts`, `apps/web/src/admin/applications/applications.test.tsx`.
- **Done when:** ঘ-8খ can be done from the list.
- **Depends on:** U1
- **Size:** M
- **Risk area:** none
- **Status:** done

### U7. Office IP exemption and per-draft registration limit
- **Goal:** a training day from one office Wi-Fi is not stopped by the limits.
- **Requirements:** R6
- **Files:** `apps/api/src/rate-limit/rate-limit.ts` (:88–139), `apps/api/src/rate-limit/limiters.ts`, `packages/shared/src/settings/*`, `apps/api/src/services/settings.ts`, `apps/web/src/admin/settings/*`, `docs/api/API_STANDARDS.md`, `docs/api/openapi.yaml`
- **Approach:** a setting `security.office_ips` (Admin only, audited): single addresses or ranges no wider than /24 (IPv4) and /56 (IPv6), at most 20 entries, matched with the same grouping the limiter uses on the address `trust proxy` yields (documented in the RUNBOOK with the `TRUST_PROXY` check). A listed address skips the IP windows; the per-account windows (login, OTP, password reset) and the per-draft windows stay for everyone. For unlisted addresses the registration keeps an IP ceiling on draft creation (as today, 10 a day) and the submit window moves to per draft, so new drafts cannot reset it.
- **Tests:**
  - unit: a listed IP skips the IP windows but not the login, OTP and reset windows; a range wider than /24 or a 21st entry is refused by the schema; IPv6 matches by /56.
  - integration: 12 registrations from one listed IP pass; from one unlisted IP the 11th draft of the day is refused; 11 logins a minute for one login id are still refused from a listed IP; only an Admin changes the setting (403 for the Head).
- **Done when:** the B-08 numbers pass from a listed address.
- **Depends on:** U1
- **Size:** M
- **Risk area:** auth
- **Status:** done

### U8. Public-entry verification compares names
- **Goal:** linking a public entry to a profile with a different name is a seen, deliberate choice.
- **Requirements:** R7
- **Files:** `apps/web/src/admin/applications/VerifyDialog.tsx`, `apps/api/src/applications/*` (verify read), `docs/api/openapi.yaml`, i18n
- **Approach:** the dialog shows entry and profile side by side (name, father or husband, mobile, union); when the name key differs (`matchKey` of `@css/shared/beneficiaries`) a warning and a second confirmation. The profile side comes from the verify read, which serves it only to a caller who may verify that entry.
- **Tests:**
  - unit: differing names show "নাম মেলে না" and need the second press.
  - integration: the verify read returns the matched profile's fields to an official in reach and refuses (403/404) one outside the region (`TS-13`).
  - e2e: `public-link.spec.ts` — entry "কোনো এক মানুষ" on a known NID; the dialog shows both names and "নাম মেলে না".
  - existing: covered in part by `apps/web/src/admin/applications/applications.test.tsx` (:1871).
- **Done when:** ছ-3 shows the comparison.
- **Depends on:** none
- **Size:** M
- **Risk area:** personal data
- **Status:** todo

### U9. A new mobile reaches the profile at approval
- **Goal:** a changed mobile is used for the family match and kept on the profile.
- **Requirements:** R8
- **Files:** `apps/api/src/applications/submission.ts` (:241–258, :343), `apps/api/src/applications/person-signals.ts`, `apps/api/src/services/beneficiary-contact.ts`, `apps/api/src/applications/side-effects.ts`, `apps/web/src/admin/applications/DecisionDialog.tsx`, `docs/api/openapi.yaml`
- **Approach:** the family and same-mobile signals read the application's mobile; the record carries a "profile mobile will change" flag the decision dialog shows; the approve effect writes it through the contact service with its change log ("আবেদনের অনুমোদনে বদল", who approved), inside the approver's existing reach check; a number held by another profile is not written and stays as a warning.
- **Tests:**
  - integration: known person's application with a new mobile shows the same-family signal against another applicant with that number; after approval the profile has the new mobile and a log row; a number held by another profile is not written; a rejected application leaves the profile unchanged; an approver outside the region cannot approve and so cannot change the profile (`TS-13`).
  - unit: the decision dialog shows "প্রোফাইলের মোবাইল বদলাবে: … → …".
- **Done when:** the গ-4/ঘ-7 case shows the warning and the profile updates on approval.
- **Depends on:** U1
- **Size:** M
- **Risk area:** personal data
- **Status:** todo

### U10. Arrival order oldest first
- **Goal:** the list's arrival order and score ties follow arrival.
- **Requirements:** R9
- **Files:** `apps/api/src/applications/service.ts` (:194–224), `apps/api/src/applications/decision-rules.ts` (:58)
- **Approach:** arrival sort by `submitted_at asc, id asc`; score sort ties by `submitted_at asc`, as WAITLIST_ORDER does; the volunteer's own list stays newest first.
- **Tests:**
  - integration: three applications sent in order list 1, 2, 3 under arrival; equal scores list the earlier first.
  - existing: score order covered by `apps/api/test/integration/application-scores.test.ts`; arrival none, characterize first.
- **Done when:** EMD-2026-00001 is first under "আগে আসা আগে".
- **Depends on:** none
- **Size:** S
- **Risk area:** none
- **Status:** todo

### U11. Change log with who and why
- **Goal:** the change log tells who opened, who decided and why, and marks a sent-back answer.
- **Requirements:** R10
- **Files:** `apps/api/src/applications/history.ts` (:37), `apps/api/src/applications/unlocks.ts`, `apps/web/src/admin/applications/ChangeLog.tsx`, `docs/api/openapi.yaml`, i18n
- **Approach:** the field-change view joins the unlock row (opened by, reason, decided by); a returned unlock is listed as "ফেরত দেওয়া হয়েছে" with the refused value, not as a change.
- **Tests:**
  - integration: accepted unlock entry names opener, decider and reason; a returned one has kind returned and leaves the value.
  - unit: ChangeLog renders "খুলেছেন", "গ্রহণ করেছেন", "কারণ" and the returned mark.
- **Done when:** ঙ-3's log reads as the owner's rule says.
- **Depends on:** none
- **Size:** M
- **Risk area:** none
- **Status:** todo

### U12. Export BEN format and PDF failure
- **Goal:** exports show BEN numbers as on screen, and an impossible PDF says so at once.
- **Requirements:** R11, R12
- **Files:** `apps/api/src/exports/rows.ts` (:455), `apps/api/src/jobs/export-run.ts` (:168–185), `apps/web/src/features/exports/ExportProgress.tsx`, `docs/ops/DEPLOYMENT.md`, `README.md` (:117)
- **Approach:** `formatBenNo` as in `beneficiary-family.ts:85`; a small no-retry set beside `KEPT_CODES` (export-run.ts:37) holding `export.pdf_unavailable`, and the catch (:170–180) calls `fail(job, code, …)` and returns instead of rethrowing for it; the web already maps the code (`exports-api.ts:13`), so the dialog only gains the text "এই সার্ভারে এখন PDF বানানো যাচ্ছে না। Excel বা CSV নিন।".
- **Tests:**
  - unit: the beneficiary row's `ben_no` is "BEN-0000166" (`xlsx.spec.ts`, `csv.spec.ts`).
  - integration: a renderer that throws `export.pdf_unavailable` fails the job on the first attempt (`exports.test.ts`).
- **Done when:** ঞ-1's file shows BEN-… and ঞ-4 fails within seconds with the message.
- **Depends on:** none
- **Size:** S
- **Risk area:** none
- **Status:** todo

### U13. The big-screen notice only on setup screens
- **Goal:** officials see no "big screen" notice on pages meant for phones.
- **Requirements:** R13
- **Files:** `apps/web/src/admin/AdminLayout.tsx` (:57), `apps/web/src/routes/index.tsx` (handles :174–242)
- **Approach:** invert the route flag to `desktopFirst` on the form builder, project setup, permission panel, template and checklist editors.
- **Tests:**
  - unit: notice on a desktop-first route, none on the volunteer list (`admin.test.tsx` :118–133 updated).
  - e2e: `screens.spec.ts` at 360 px — no "এই পর্দা বড় স্ক্রিনে ভালো চলে।" on `/admin/applications/<id>`, present on `/admin/projects/<id>/setup`.
  - existing: covered by `apps/web/src/admin/admin.test.tsx`.
- **Done when:** ঠ-4's 17 pages show the notice only on setup and forms.
- **Depends on:** U1
- **Size:** S
- **Risk area:** none
- **Status:** todo

### U14. Wrong texts and demo data
- **Goal:** the small wrong texts are right.
- **Requirements:** R14
- **Files:** i18n catalogues (invite, staff, notifications, forms), `apps/api/src/config/env.ts` (:10, :185), `apps/api/src/config/env.spec.ts`, `apps/api/.env.example`, `docs/ops/RUNBOOK.md`, `apps/api/seed/sets/demo/index.ts` (:167, :184, :194), `apps/api/src/services/staff-change-requests.ts` (designation decision), `apps/api/src/notifications/catalogue.ts`, `apps/api/src/notifications/account-events.ts`, notification template sync, `apps/web/src/admin/forms/FormBuilderPage.tsx` (PM view)
- **Approach:** B-02 text "অ্যাডমিন বা ডিপার্টমেন্ট হেডকে বলুন"; B-03 the env check refuses to start when `APP_ORIGIN` is unset or loopback and `NODE_ENV` is neither development nor test, naming the setting to set (documented in the RUNBOOK); B-04 seed names; B-05 "সিস্টেম দিয়েছেন"; B-06 a `designation_changed` notice "আপনার পদবি বদলানো হয়েছে: {designation}"; UAT U-53 the PM's read-only form page text and "তৈরি ফর্ম বসান".
- **Tests:**
  - unit: RoleHistory with no giver shows "সিস্টেম দিয়েছেন"; PM form page shows the new text and button; env refuses a loopback origin under `NODE_ENV=staging` and accepts it under development and test.
  - integration: approving a designation request sends `designation_changed`.
  - existing: `apps/web/src/admin/staff/staff.test.tsx`, `apps/api/src/config/env.spec.ts`.
- **Done when:** each text reads as in R14.
- **Depends on:** none
- **Size:** S
- **Risk area:** none
- **Status:** todo

### U15. Application lists and entry
- **Goal:** the list and the entry screen take fewer presses and fewer mistakes.
- **Requirements:** R15
- **Files:** `apps/web/src/admin/applications/ApplicationsPage.tsx`, `apps/web/src/features/beneficiaries/LookupField.tsx`, `apps/web/src/admin/applications/QuotaBars.tsx`, reference list labels
- **Approach:** UAT U-38 Enter starts the lookup; U-39 one gender word ("মহিলা") in lookup and form; U-40 a fixed space for the bulk bar; U-42 page number in the address and `?q=` applied on load; U-43 the pull dialog names who comes next and shows the comment field when the quota is full.
- **Tests:**
  - unit: each behaviour in `applications.test.tsx` and the LookupField test.
  - e2e: `applications.spec.ts` — open `/admin/projects/<id>/applications?q=EMD-2026-00001&page=1`, only that row shows.
- **Done when:** the five items behave as described.
- **Depends on:** U6
- **Size:** M
- **Risk area:** none
- **Status:** todo

### U16. Unlocks and volunteer notices
- **Goal:** the volunteer fixes an opened answer cleanly and learns what happened.
- **Requirements:** R16
- **Files:** `apps/web/src/features/applications/UnlockedAnswer.tsx`, `apps/web/src/admin/applications/UnlockReview.tsx`, `apps/api/src/applications/unlocks.ts`, `apps/api/src/notifications/*` (application events), `apps/web/src/admin/applications/ApplicationReviewPage.tsx`, `docs/api/openapi.yaml`
- **Approach:** U-44 empty new-answer field with the old answer beside it; U-45 a message to the volunteer on send-back and a notice; U-46 notices name the application number and open it; U-47 the public-entry texts change after verification and say "পাবলিক লিংক থেকে এসেছে".
- **Tests:** unit for each screen; integration for the send-back notice with its message.
- **Done when:** ঙ and ছ read as described.
- **Depends on:** U11
- **Size:** M
- **Risk area:** none
- **Status:** todo

### U17. Profile history names people
- **Goal:** the profile tells who did what.
- **Requirements:** R17
- **Files:** `apps/web/src/admin/beneficiaries/ProfileHistory.tsx`, `apps/api/src/services/beneficiaries.ts` (360° read), merge history view, `docs/api/openapi.yaml`
- **Approach:** U-48 the activity history filled from the audit rows of the profile, and who changed contact, asked and approved corrections and blocked (names of officials only, never a volunteer's personal data beyond the name); U-49 merge history text by state, no "সক্রিয়" beside "ব্লক করা".
- **Tests:** integration on the 360° read (names present for an official in reach; refused for one outside the region and for the Media Team's limited view, `TS-13`); unit on ProfileHistory.
- **Done when:** জ-2…জ-5 show names.
- **Depends on:** U2
- **Size:** M
- **Risk area:** personal data
- **Status:** todo

### U18. Entry without a document
- **Goal:** the name search's answers carry into the form.
- **Requirements:** R18
- **Files:** `apps/web/src/features/applications/ApplicationFormPage.tsx`, `apps/web/src/features/beneficiaries/*` name lookup
- **Approach:** name, father or husband, address and village prefill the form; the village star in the search; the own-number error marks the field with one message.
- **Tests:** unit; e2e `identity-rules.spec.ts` (360 px) — after "নতুন মানুষ হিসেবে শুরু করুন" the name field already holds the searched name.
- **Done when:** ড-4 needs no retyping.
- **Depends on:** U5
- **Size:** S
- **Risk area:** none
- **Status:** todo

### U19. Media and exports texts
- **Goal:** media and export screens say what is going on.
- **Requirements:** R19
- **Files:** `apps/web/src/admin/applications/ApplicationsPage.tsx` (media mark), `apps/web/src/features/media/*`, `apps/web/src/features/exports/MyExportsPage.tsx`, `apps/web/src/routes/index.tsx`, `apps/api/src/exports/*` (status code column), `docs/api/openapi.yaml`
- **Approach:** U-51 media mark in the list row (only to callers who already see the referral), accept dialog line, "চূড়ান্ত পর্যালোচনা অনুমোদিত হলো"; U-50 the page is not routed for volunteers (the API already answers 403 to their export calls, checked by a test), "অবস্থা (কোড)" only when chosen.
- **Tests:** unit per screen; integration: the code column is absent unless asked; a volunteer gets 403 on the export list, request and file, and another official's export file is refused (`TS-13`).
- **Done when:** ট and ঞ-6 read as described.
- **Depends on:** U12
- **Size:** S
- **Risk area:** none
- **Status:** todo

### U20. Sign-in, logout and devices
- **Goal:** sign-in messages and devices are clear, and a new person starts on their own home.
- **Requirements:** R20
- **Files:** `apps/web/src/features/auth/*`, `apps/web/src/lib/auth.tsx`, `apps/api/src/auth/*` (device read), `apps/web/src/features/account/*` devices, `docs/api/openapi.yaml`
- **Approach:** U-01 the error names Job ID; U-02 the device row shows the last IP's tail (last octet masked to the /24 for IPv4) without a location lookup service; U-54 an explicit logout drops `next=`; `next` is honoured only as a same-origin relative path (starts with one `/`, not `//` or `/\`, no scheme), else home.
- **Tests:** unit for login text, logout redirect and `next` values `https://evil.example`, `//evil.example`, `/\evil`, `javascript:alert(1)` all landing on home, `/photos/x` kept; integration for the device field (own devices only, another user's devices refused).
- **Done when:** the four items hold.
- **Depends on:** none
- **Size:** M
- **Risk area:** auth
- **Status:** todo

### U21. Registrations and one state name
- **Goal:** a pending volunteer reads "অনুমোদনের অপেক্ষায়" everywhere and registrations need fewer presses.
- **Requirements:** R21
- **Files:** i18n `volunteers.json`, `registration.json`, `apps/web/src/admin/volunteers/*`, `apps/web/src/admin/registrations/*`, `apps/web/src/features/registration/*`, `apps/web/src/admin/staff/OfficialDialog.tsx`
- **Approach:** U-04 one name and a "প্রত্যাখ্যাত" count; U-05 one press for one corrected field, banner text; U-06 "অ্যাডমিন"; U-08 who asked a correction and when; U-10 Job ID checked at step one; U-30 the tab named "কর্মীর নিবন্ধন" with a link to the volunteers.
- **Tests:** unit per screen; integration for the Job ID check endpoint use.
- **Done when:** খ and ঝ read as described.
- **Depends on:** U1
- **Size:** M
- **Risk area:** none
- **Status:** todo

### U22. Permission panel and staff pickers
- **Goal:** giving and taking permissions cannot go to the whole country by mistake and reads plainly.
- **Requirements:** R22
- **Files:** `apps/web/src/admin/permissions/*` (GrantDialog, ScopePicker, OverridesList, RevokeDialog), `apps/web/src/admin/UserSearch.tsx`, `apps/web/src/admin/staff/StaffPage.tsx`, `apps/api/src/services/access.ts`, `apps/api/src/access/hard-rules.ts`, `apps/api/src/routes/access.ts`
- **Approach:** U-11 empty scope required on screen, and the grant request schema already demands a scope (confirm; refuse an omitted one with 400 if not); U-13 title by action and module names; U-14 admin-only permissions marked and disabled for the Head, the API's existing hard rule names the refused permission in its error details; U-18 the role beside the name; U-29 page text by role.
- **Tests:** unit in `permissions.test.tsx`; integration: a grant without a scope is refused 400; the Head granting an admin-only permission is refused 403 with the permission named; nobody grants to themselves (`TS-13`); e2e `admin-permissions.spec.ts` — "পারমিশন দিন" cannot be saved until a scope is chosen.
- **Done when:** গ and ঢ (Phase 1) read as described.
- **Depends on:** U1
- **Size:** M
- **Risk area:** auth
- **Status:** todo

### U23. Notifications and audit viewer
- **Goal:** role and delivery notices are complete and the audit viewer is quick to read.
- **Requirements:** R23
- **Files:** `apps/api/src/notifications/account-events.ts`, `apps/api/src/notifications/service.ts` (coalescing), `apps/api/src/notifications/delivery.ts`, `apps/api/src/services/deliveries.ts`, `apps/web/src/admin/notifications/*`, `apps/web/src/admin/audit/*`, `apps/api/src/services/audit-log.ts`, `docs/api/openapi.yaml`
- **Approach:** U-12 role change names the new role and is not merged with a grant; U-27 password-link, OTP and reset mails listed in the deliveries as metadata only (kind, masked recipient, time, status) for the roles that open that page today; no body, link, token or code is stored in the delivery row or returned; help text corrected; U-15 Enter applies the filter; U-16 the subject's name and an added/removed diff (secret keys still dropped).
- **Tests:** integration for the role notice; the deliveries listing shows an OTP and a set-password mail and its response holds no token, link or code (asserted by searching the body for the sent values); a volunteer and a PM are refused the listing (`TS-13`); unit for the audit filter and diff.
- **Done when:** the four items hold.
- **Depends on:** none
- **Size:** M
- **Risk area:** auth
- **Status:** todo

### U24. Raw codes, nisab history, device tab
- **Goal:** no raw codes on screen, and histories show their entries.
- **Requirements:** R24
- **Files:** `apps/web/src/admin/system/*`, `apps/web/src/admin/notifications/*`, `apps/web/src/admin/nisab/*`, `apps/api/src/services/nisab.ts`, `apps/web/src/admin/volunteers/*`, `docs/api/openapi.yaml`
- **Approach:** U-26 human names for environment, buckets, kinds and template keys; U-28 nisab history from its versions; U-21 the device tab on the volunteer profile (already present, verify and close).
- **Tests:** unit per screen; integration for the nisab history read.
- **Done when:** জ (Phase 1) reads as described.
- **Depends on:** none
- **Size:** S
- **Risk area:** none
- **Status:** todo

### U25. Form builder fixes
- **Goal:** conditions cannot be left half-made and the panes fit a laptop.
- **Requirements:** R25
- **Files:** `apps/web/src/admin/forms/ConditionEditor.tsx`, `RuleGroups.tsx`, `OptionsEditor.tsx`, `FormBuilderPage.tsx` layout CSS
- **Approach:** U-31 no preselected question, an incomplete condition is not kept on close; U-32 wider side panes at 1280 px, option languages stacked.
- **Tests:** unit for the condition editor; e2e `form-builder.spec.ts` at 1280 px — closing the condition dialog with nothing chosen leaves "সব সময় দেখাবে।".
- **Done when:** ক's builder steps go without the U-31 trap.
- **Depends on:** U4
- **Size:** M
- **Risk area:** none
- **Status:** todo

### U26. Project setup and pages
- **Goal:** setup asks less and the project pages stay in their frame.
- **Requirements:** R26
- **Files:** `apps/web/src/admin/projects/*` (wizard, setup sections, frame), `apps/web/src/admin/forms/PublicLinkPanel.tsx`, `apps/web/src/admin/forms/FormsPage.tsx`, `apps/web/src/admin/AreaFilter.tsx`
- **Approach:** U-33 months start at the current month; U-34 copy button for the public link; U-35 duplicate-photo warning on by default; U-36 the forms page inside the project frame; U-37 one kind of area picker with Enter; U-41 the setup's beneficiary type list gets a line saying what it is used for (read from the code that consumes the setting before writing the text) and that the form's own question keeps its options, since forms are built by the Monitoring Team.
- **Tests:** unit per section; e2e `projects.spec.ts` — the forms tab opens inside the project frame with its tabs.
- **Done when:** ক (Phase 2) reads as described.
- **Depends on:** U13
- **Size:** M
- **Risk area:** none
- **Status:** todo

### U27. Shared UI polish
- **Goal:** the same things look and read the same everywhere.
- **Requirements:** R27
- **Files:** `apps/web/src/ui/templates/asf/*` (date field, focus ring), `apps/web/src/components/*`, `apps/web/src/admin/volunteers/*`, `apps/web/src/features/home/*`, i18n
- **Approach:** U-07 hide "শিগগিরই আসছে" cards; U-09 menu contrast in dark mode; U-17 "দিন-মাস-বছর" and a whole typed date; U-19 dialog close button "ফিরে যান"; U-20 one "দেওয়া হয়নি", amounts without decimals; U-22 two-column counts on the phone list; U-23 focus ring; U-24 one NID and mobile format; U-25 one word for each volunteer type and "0টি".
- **Tests:** unit for the date field and formatters (`@css/shared/format`); `ui.local.*.test.tsx` for template additions; e2e `screens.spec.ts` at 360 px.
- **Done when:** each item reads as in the results file.
- **Depends on:** U13
- **Size:** M
- **Risk area:** none
- **Status:** todo

## Checkpoints
- **Mode:** grouped (one by one 6, grouped 16, all at once 0; one by one's 6 points go to grouped since N is over 4)
- **Signals:** N 27, L 3,150, R 8, Fd 2, C 3, P 2
- **C1** after U1: foundation for the decision-led units
- **C2** after U2: personal data
- **C3** after U3: migration, new pattern
- **C4** after U7: auth and new pattern; end of PR 1
- **C5** after U8: personal data
- **C6** after U9: personal data
- **C7** after U14: end of PR 2, and the review of U13 (foundation for U26 and U27; a checkpoint right after U13 would sit next to this one)
- **C8** after U19: end of PR 3 (U17 personal data reviewed here)
- **C9** after U20: auth
- **C10** after U22: auth
- **C11** after U24: end of PR 4, and the review of U23 (auth; a checkpoint right after U23 would sit next to this one)
- **C12** after U27: end

## Verification
- `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm docs:check`
- `pnpm --filter @css/api contract:coverage`, `pnpm --filter @css/api authz:matrix` (U3, U6, U7, U19, U20, U22, U23)
- `pnpm e2e` (or the touched specs with `--repeat-each 3 --workers 1`)
- After each PR merges: the owner pulls and runs `pnpm db:migrate` (U3 adds a migration); then repeats the UAT scenes named in each unit's "Done when".

## Risks and rollback
- U3 migration: nullable column and self FK; `down.sql` drops the FK, index and column. The backfill links existing re-delegated rows and ends, audited, those whose source has already ended; a rollback keeps those ends (they are what the owner decided), and each is visible under "আগের বাড়তি এলাকা" with its reason.
- U7 changes rate limiting: an empty office list behaves exactly as today; a wrong address only relaxes the IP windows, never the per-login window.
- U2 refuses merges that were allowed before; officials decide one application first, nothing is lost.

## Definition of done
- All units done and their tests pass
- Verification commands pass
- `ae-review` has run, with no open P0 or P1
- Code from abandoned attempts is removed

## Progress
- **Branch:** `fix/uat-bugs-urgent` (PR 1, U1–U7; started from `docs/uat-phase-1-2`, which carries the UAT results)
- **Updated:** 2026-11-24 00:40
- **Next:** checkpoint C4 over U6–U7 (`--range 643f614a..HEAD`), T2 review (U7 is an auth risk area), then ask the owner before pushing PR 1
- **Reviewed through:** C3 at 1526c068 (T2 review; the source race fixed, the rest in Notes)
- **Uncommitted:** none
- **Notes:** decisions are D-194 to D-204, rules BR-329 to BR-335 (register lines "deferred … in work" until each unit adds its tests). U3 must change the existing extra-areas test that asserts the old behaviour ("it stays when the RPM loses it"). C2 review: the merge refusal names an application only where the caller's application scope reaches it; a send and a public-entry verification both refuse a person merged with one who applied, after locking the person; left open (P3): the review read runs the twins query twice for a reviewed application. C3 review: a give locks its source row and reads the reach again when the source ended meanwhile, so a give and the end of its source cannot both pass; the ADR file path in down.sql stays as every down.sql in the repo carries it. U7: the office list lives in memory (`OfficeAddresses`), read at start, after each change and once a minute, so the limiter never reads the database; a new permission `security.office_ips.manage` (the Admin alone, a key permission) guards `GET`/`PUT /admin/office-addresses`; an IPv6 entry covers its /56. The demo seed of U2 was reformatted by prettier in the U7 commit (formatting only).
