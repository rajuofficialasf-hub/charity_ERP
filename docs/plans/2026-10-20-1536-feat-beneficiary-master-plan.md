---
title: Beneficiary master (T2.2)
type: feat
status: in-progress
source: brainstorm
date: 2026-10-20
doc_review: 2026-10-20
---

# Beneficiary master (T2.2)

## Goal
An official or volunteer who types a beneficiary's NID or birth-registration number gets the person's known details filled in, with the identity fields locked. Officials can correct a locked field only through a reviewed request. They can block and unblock a beneficiary, and see which beneficiaries in a project look like one family. They can find duplicate profiles, merge them and undo the merge. The 360° profile shows all of this with a short BEN number everyone can read out.

## Problem
Phase 2 starts the application cycle (T2.3 to T2.6), and every application hangs on one beneficiary profile. Today the database already has every table and constraint (`beneficiaries`, `profile_merges`, `profile_correction_requests`, `blocklist`, `field_changes`, the own-mobile triggers), and `docs/api/openapi.yaml` already describes lookup, corrections, merge and block. The code has only the list, the statistics and a read-only 360° profile (`apps/api/src/services/beneficiaries.ts`, `apps/web/src/admin/beneficiaries/`). Without the master, the application form has nothing to look up, and duplicates and blocked people cannot be handled.

## Requirements

### Identity and BEN number
- **R1** Every profile has an NID or a birth-registration number, each unique and checked for format (NID 10, 13 or 17 digits; birth registration 17 digits). The service refuses a wrong or used number with a localized error before the database constraints do. A used number points to the existing profile, but only to a caller who may see that profile.
- **R2** Every profile gets a short sequential BEN number (`BEN-0000123`). It is unique and never reused, given at creation, backfilled for existing profiles, searchable, and shown wherever a beneficiary is named (list, 360° profile, warnings, merge screens). The UUID stays the key.
- **R3** Mobile is contact data: not unique, not identity. When a mobile is already on another live profile, the caller gets a warning that does not refuse the save.

### Lookup and auto-fill
- **R4** A lookup by NID or birth-registration number inside a project scope returns one of three answers:
  - **not found:** the profile is created when the application is submitted (T2.5);
  - **found:** the auto-fill basics (name, father/husband name, mother's name, mobile, gender, date of birth, address down to village, household basics), with name, father/husband name and the id marked locked;
  - **blocked:** a message without the reason.

  Each found answer also says whether the person already applied in that project.
- **R5** A lookup or search by a retired (merged) profile's NID, birth-registration number or BEN number resolves to the kept profile, with a note naming the kept profile's BEN number.
- **R6** The lookup is a reusable web field: the first field of the application form in T2.5. In T2.2 it shows the auto-fill with the locked fields read-only, inside the beneficiary tab ("NID / জন্মনিবন্ধন দিয়ে খুঁজুন") for officials who hold the lookup permission.

### Contact changes and corrections
- **R7** Mobile and address can be edited by an official with permission, and later through the application. Every change is logged with old value, new value, who and when. The 360° profile shows the log.
- **R8** Name, father/husband name, NID and birth-registration number are refused on any plain edit. They change only through a profile correction request:
  - an official requests it with the new value and a reason;
  - another official approves or rejects it, never the requester;
  - an approved request is applied and audited in one transaction.
- **R9** An approved correction to an NID or birth-registration number that another live profile already holds is refused, and the answer suggests a merge instead.

### Own mobile
- **R10** A volunteer cannot give their own mobile as a beneficiary's mobile, at lookup, entry or contact edit. The service refuses it with a clear message. The existing database triggers stay as the backstop. Applications from a public link have no volunteer and are not checked.

### Blocklist
- **R11** An RPM or above (the permissions `beneficiary.block` and `beneficiary.unblock`) blocks a beneficiary with a reason and lifts the block with a reason. Each change is audited.
- **R12** A blocked beneficiary cannot get a new application in any project. Ongoing applications continue unchanged. The application form shows a plain message without the reason.
- **R13** Block reasons and history are shown to officials only, never to volunteers, the Media Team or the Procurement Team. This holds in responses and exports as well as screens.
- **R14** T2.2 provides the check "may this beneficiary get a new application"; T2.5 and T2.6 call it at entry.

### Family-duplicate warning
- **R15** For a beneficiary in a project, the system lists the other beneficiaries in the same project who share either of these:
  - the same mobile, wherever they live;
  - the same union, village and father/husband name.

  Each match shows the name, the BEN number and which rule matched. It never rejects anything.
- **R16** T2.2 delivers the detection and its tests. The warning appears on the application review and in its `familyDuplicateWarnings` field when that screen exists (T2.5 and T2.6), where the official decides with a reason.

### Duplicate profiles: candidates, merge, revert
- **R17** Officials with the merge permissions see the suggested duplicate pairs in their scope, each with the matching rule. The rules are:
  - name + father/husband name + mobile;
  - name + date of birth + union;
  - several live profiles on one mobile.
- **R18** An official can mark a suggested pair "not the same person" with a reason. The pair then leaves the suggestions, and the mark can be lifted later. Both actions are audited.
- **R19** An RPM proposes a merge of two profiles with a reason (`beneficiary.merge.propose`). A PM, the Monitoring Team or the Department Head (`beneficiary.merge`) merges from a proposal or directly. The merge shows a side-by-side comparison, and the official chooses the profile to keep and gives a reason.
- **R20** When both profiles have an application in the same project (one person can hold only one application per project, whatever its status), the retired profile's application decides the outcome:
  - a draft or pending application stops the merge: the answer lists those projects, and an official deletes the duplicate application first;
  - an application past pending (rejected, completed or any later state) stays on the retired profile. The kept profile shows it through the merge link, and the revert loses nothing.
- **R21** On a merge, everything that points to the retired profile moves to the kept one (except the applications R20 leaves behind): applications, support payments, dawah records, photos and files, follow-ups, family members, consents and calls. The retired profile keeps its own NID or birth registration and points to the kept profile. A snapshot of what moved is stored, and the merge is audited.
- **R22** If either profile is blocked, the kept profile is blocked afterwards, so a merge never lifts a block. A block on the retired profile alone moves with its reason. When both are blocked, the kept profile keeps its own block, and the retired profile's block is released with a merge reason. A revert restores both.
- **R23** The Monitoring Team and the Department Head revert a merge with a reason (`beneficiary.merge.revert`). The revert:
  - moves back exactly the rows that moved, and any block that moved;
  - clears the pointer;
  - keeps on the kept profile anything added after the merge;
  - is audited.

### 360° profile and beneficiary tab
- **R24** The 360° profile shows real data:
  - the BEN number;
  - photos and files (T2.1);
  - the contact change log;
  - corrections (requested, decided);
  - block history, for officials only;
  - merge history (merged-from profiles, or "merged into" on a retired profile).

  Each action shows only to a caller who holds its permission: edit contact, request or decide a correction, block or unblock, propose, merge or revert.
- **R25** The beneficiary tab shows the BEN number and finds a profile by BEN number. It has a page of duplicate suggestions and merge proposals for officials who hold the merge permissions.

### Tests and contract
- **R26** Every testable rule has an executed test: BR-001 to BR-015, BR-019, BR-250 and BR-251, plus the API negative cases (401, 403, 404 out of scope, 409, 422). Two E2E journeys cover lookup → auto-fill and merge → revert. `docs/api/openapi.yaml` and the authorization matrix match the routes.

## Scope
- In: the beneficiary service, routes and screens above, the BEN number column and its backfill, the "not the same person" table, the permissions T2.2 needs, the seed of demo cases (a blocked person, a duplicate pair, a family pair), and the documents (BUSINESS_RULES test status, DATABASE_SCHEMA, ERD, RBAC, SCREENS, DECISION_LOG).
- Out (not now):
  - creating applications and the review screen (T2.5, T2.6);
  - the official's decision on a family warning (T2.6);
  - offline lookup and the needs-verification path (T2.7);
  - the 360° PDF and other exports (T2.8);
  - media consent recording (T2.8b);
  - notifications for blocks, merges or corrections.

## Key decisions
- **Family-duplicate match:** same mobile in the project, or same union + village + father/husband name; union + village alone would flag whole villages (owner, 2026-10-20). Governs R15.
- **Merge conflict:** nothing is dropped silently (owner, 2026-10-20, amended the same day after the plan review). The database allows one application per person and project whatever its status, and only drafts and pending applications can be deleted. So the retired profile's draft or pending application in a shared project stops the merge until an official deletes the duplicate. An application past pending stays on the retired profile, and the kept profile shows it through the merge link. Governs R20, R21.
- **Lookup across regions:** a found profile returns the full auto-fill wherever it lives, as BD-02 says, because a beneficiary can come back in another project (owner, 2026-10-20). It is watched closely instead:
  - every lookup that finds a profile is audited, without the number;
  - a per-user limit per minute and per day, and a per-IP limit.

  Governs R4.
- **Who reverts:** the Monitoring Team and the Department Head, the two global roles, as everywhere else (owner, 2026-10-20). This amends the "Monitoring Team" wording of BD-05. Governs R23.
- **BEN number:** a short sequential `BEN-0000123` beside the UUID key (owner, 2026-10-20). This amends O-03, which kept the UUID as the only id, and needs a migration and a backfill. Governs R2.
- **Merge and block:** the block moves to the kept profile, and back on a revert (owner, 2026-10-20). Governs R22, R23.
- **False pairs:** "not the same person" with a reason, which can be lifted; one small new table (owner, 2026-10-20). Governs R18.
- **Corrections need two people:** the official who requested a correction cannot approve it. This is the safe default of the correction flow; the owner can reverse it. Governs R8.
- **Delivered without the application screens:** lookup, the blocklist check and the family detection are APIs and services, with the lookup field shown in the beneficiary tab. The application form and the review use them from T2.5 and T2.6 (docs/PLAN.md). Governs R6, R14, R16.

- **Contact edit permission:** a new `beneficiary.contact.edit` for the PM in the program and the RPM and Project Executive in the region, plus the two global roles (owner, 2026-10-20). Governs R7.
- **Who marks a false pair:** those who propose or merge (RPM, PM and the two global roles), through a new `beneficiary.merge.dismiss` (owner, 2026-10-20). Governs R18.

## Technical decisions
- **Stack unchanged** (`ST-40` to `ST-45`): the profile in `CLAUDE.md` covers this work (Express 5 with `defineRoute`, Prisma 7 on PostgreSQL 17, the own auth, the storage adapter of T2.1). Nothing is added to the stack.
- **Decisions first:** U1 appends these to `docs/DECISION_LOG.md` before any code:
  - the owner's decisions above;
  - the two permissions: `beneficiary.contact.edit` (PM PROGRAM; RPM and Project Executive REGION) and `beneficiary.merge.dismiss` (RPM REGION, PM PROGRAM);
  - the BEN number;
  - the revert order.

  `beneficiary.merge.revert` keeps its empty default, so only the two global roles hold it.
- **BEN number:** an integer column `ben_no` filled by a PostgreSQL sequence default.
  - It is NOT NULL and UNIQUE, and the backfill numbers existing rows in `created_at, id` order.
  - It is shown as `BEN-` plus the number padded to 7 digits by `@css/shared` (one formatter, I18N.md section 6).
  - A sequence, not `id_sequences`: one global counter row would serialize every insert on a distribution day. A sequence never reuses a value, and the gaps after a rolled-back insert are accepted and recorded.
  - Search accepts `BEN-0000123`, `ben-123` and `BEN123`.
- **Retired ids:** a retired profile keeps its own NID or birth-registration number, so the unique indexes stay as they are.
  - Lookup and search match live and retired rows, then follow `merged_into_id` to the live profile (a bounded loop, since the kept profile of one merge can later be merged itself).
  - A merge can be reverted only while its kept profile is live. A later merge on top must be reverted first (409 `beneficiary.merge_revert_order`).
- **Merge in one transaction:**
  - Both rows are locked `FOR UPDATE` in id order.
  - Both profiles, and the kept profile any `merged_into_id` leads to, are checked against the caller's scope for compare, propose, execute, direct merge and revert. An id outside the scope answers 404 and is never named.
  - The conflicts are checked first:
    - **Applications:** the same project is a conflict for any application not `deleted`, exactly what `applications_project_id_beneficiary_id_key` enforces. A retired profile's `draft` or `pending` application answers 409 `beneficiary.merge_conflict` with the projects. One past pending stays where it is, and the snapshot lists it as left behind.
    - **Other uniques:** the dawah uniques of `class_attendance`, `learning_progress` and `exam_results`, and `media_subjects`, answer the same 409 with the list.
    - **Backstop:** a 23505 from any of these indexes maps to that 409.
  - Every other row that points to the retired profile is updated to point to the kept one, never deleted:
    - `applications.beneficiary_id` and `candidate_beneficiary_id`, `beneficiary_family_members`, `media_consents`;
    - `class_attendance`, `learning_progress`, `exam_results`, `call_logs`, `followup_evaluations`, `media_subjects`;
    - the polymorphic `file_links` and `alerts`.
  - Submitted `profile_correction_requests` on the retired profile are rejected with a merge reason. They stay rejected after a revert, since an official can request again.
  - **Block:** a block on the retired profile alone moves to the kept profile. When both profiles are blocked, the kept profile keeps its own row and the retired row is released with a merge reason, since `blocklist_subject_type_subject_id_key` allows one active block per subject. The snapshot stores only the blocklist row ids, never the reason.
  - **Other proposals:** an execute of a proposal whose profiles are no longer both live answers 409 `beneficiary.merge_stale`.
  - `field_changes` and `audit_log` stay on their own entity as history; the 360° profile reaches them through the merge link.
  - The `snapshot` JSONB holds the moved row ids per table and the block move, and the revert uses exactly those.
  - The deferred own-mobile trigger can fire at commit when a moved application meets a kept mobile; its 23514 maps to 409 `beneficiary.mobile_is_volunteer_mobile`.
- **Merge candidates:** kept in `beneficiary_merge_candidates` (D-117, the owner's choice on 2026-10-21 after the measurement below): the write that changes a profile recomputes its own pairs, a nightly job on the `duplicates` queue recomputes them all, and the list reads the active pairs with both profiles in the caller's scope through `core/bounded-read.ts`, paged by cursor. First planned as computed per request; on 2,000,000 profiles that took 5 to 24 seconds.
  - There are three queries on normalized values (trimmed, collapsed spaces, case-folded): name + father/husband name + mobile; name + date of birth + union; mobile groups.
  - Retired rows and pairs with an active dismissal are left out.
  - U1 adds the expression indexes these queries need:
    - `beneficiaries_dup_name_father_mobile_idx` on the normalized name, father/husband name and mobile;
    - `beneficiaries_dup_name_dob_union_idx` on the normalized name, date of birth and union;

    both partial on `merged_into_id IS NULL`. The mobile index already exists.
  - A plain `CREATE INDEX` inside the migration is acceptable, not `CONCURRENTLY` (`DB-MIG-06`): no production database exists yet, and the dev and test tables are small.
  - U7 measures the queries on `css_erp_perf` with `perf:lists --only merge`.
  - The list is guarded by `beneficiary.merge.dismiss`. Its holders are exactly those who propose or merge (RPM REGION, PM PROGRAM, the two global roles), so the contract's `x-permission` of `/beneficiaries/merge-candidates` changes from `beneficiary.merge.propose` to it.
- **Dismissals:** a new table `beneficiary_merge_dismissals`:
  - columns: `id` (uuid v7), `low_id` and `high_id` with CHECK `low_id < high_id`, `reason`, dismissed by/at, lifted by/at, `lift_reason`;
  - a partial unique on the pair while not lifted; foreign keys to `beneficiaries`.
- **Corrections:**
  - Statuses are `submitted`, then `approved` or `rejected`. The CHECK also allows `open` and `closed`; this work never writes them, and DATABASE_SCHEMA records that.
  - The list of a profile's requests needs `beneficiary.correction.request` or `beneficiary.correction.approve`. The old and new values of an NID or birth-registration request are masked by the `beneficiary.nid` class unless the caller holds `beneficiary.view_nid` in scope.
  - There is one submitted request per beneficiary and field (409).
  - The decider is never the requester (403 `beneficiary.correction_own`).
  - The approval re-checks that the old value is still current (409 if stale). A new NID or birth registration must be valid and unused; otherwise 409 `beneficiary.identity_taken`, which names the holder's BEN number only to a caller who may see that profile.
  - The change is applied in the decide transaction, following `services/change-requests.ts` `decide` (lock with FOR UPDATE, scope filter, status check).
- **Contact edit:** a new `PATCH /beneficiaries/{beneficiaryId}/contact` with If-Match, following `routes/programs.ts`.
  - It covers the mobile and the address down to village, post office and landmark.
  - Each changed field writes a `field_changes` row of kind `contact_update`.
  - Any other field is refused with 422 `beneficiary.locked_field` (the code the contract already lists).
  - The response carries a `beneficiary.mobile_shared` warning with the other profiles' BEN numbers that the caller may see.
- **Own mobile:** a service check mirrors the trigger: the mobile may not equal the caller's own mobile, or the user mobile of a volunteer who owns a live application of the profile. It answers 409 `beneficiary.mobile_is_volunteer_mobile` with a plain message. The lookup answer adds `mobileIsCallerOwn`, so the form asks for another number.
- **Lookup:**
  - It follows the declared `beneficiaries.beneficiary.lookup`, adding `benNo`, `mergedInto` and `mobileIsCallerOwn`.
  - It never returns the other identity number or the block reason.
  - A found profile returns the full auto-fill wherever it lives (owner decision above).
  - It gets a new `lookup` rate-limit class, because the number is the identity and should not be enumerable. The class has three windows (proposals tuned in T3.4):
    - 60 per minute per user;
    - 600 per day per user;
    - 120 per minute per IP (`NE-SEC-04`).
  - Every lookup that finds a profile writes an audit row `beneficiary.looked_up`: actor, project, the found profile id, and whether it lies outside the caller's region. The number itself is never written (`NE-LOG-02`). The monitoring alerts of Phase 5 read these rows.
- **Profile creation and the gates:** delivered as services with no new route; T2.5 calls them when an application is submitted:
  - `createProfile(tx, actor, input)`: identity checks, own mobile, the shared-mobile warning and the BEN number;
  - `assertMayApply(tx, beneficiaryId)`: follows `merged_into_id` first, then reads `is_blocked` under `SELECT … FOR UPDATE` on the live profile, in the transaction that inserts the application. Block, unblock and merge take the same row lock, so an application and a block cannot cross. A blocked profile answers 409 `beneficiary.blocked`;
  - `familyMatches(tx, projectId, beneficiaryId)`.

  Integration tests reach them through `createContainer`.
- **Block reason:** stays in the existing field class `blocklist.reason`. Volunteers, the Media Team and the Procurement Team never get it (`access/field-mask.ts`). The blocklist service gains the beneficiary subject, without the session revoke the volunteer path does.
- **Masks on every new response:** each response names its permission and its field classes, and has a test that it is masked for the Media Team and a volunteer.
  - correction list: `beneficiary.nid` on identity values;
  - contact log: `beneficiary.contact`, so the old mobiles stay with officials who see contacts;
  - merge history and the comparison: `beneficiary.nid` and `blocklist.reason`;
  - `MergeCandidate` and family matches: name, BEN number and the matched rule only, never a number;
  - snapshot: never returned, only summarised as counts per table.
- **Reasons:** every reason and note is 3 to 1,000 characters in the zod schemas, as `BlocklistRequest` already is. The screens render them as plain text, never as HTML.
- **Contract:** every route is declared once with `defineRoute`, and `docs/api/openapi.yaml` changes in the same unit. New routes:
  - `PATCH /beneficiaries/{beneficiaryId}/contact` (U4);
  - `GET /beneficiaries/{beneficiaryId}/correction-requests` (U4);
  - `POST /beneficiaries/merge-dismissals` and `POST /beneficiary-merge-dismissals/{dismissalId}/lift` (U7, `beneficiary.merge.dismiss`);
  - `GET /beneficiary-merges` (U8): proposals and merges by status, paged, scope region, `beneficiary.merge.dismiss`;
  - `POST /beneficiary-merges/direct` (U8, `beneficiary.merge`): a merge without a proposal. It writes a `profile_merges` row with the caller as both proposer and merger.

  Changes to existing entries:
  - `benNo` on `Beneficiary`, `BeneficiarySummary`, `MergeCandidate` and `LookupResult`;
  - an optional `keptId` on execute, so the merging official can choose the kept profile;
  - each unit adds its new error codes to the contract's code list (U3: `identity_taken`; U4: `correction_own`; U8: `merge_conflict`, `merge_revert_order`, `merge_stale`; U5 reuses `blocked`).

  The drift test and `authz:matrix` keep both in step.
- **Code comments and test names:** carry the meaning in words, never a plan, unit, rule or decision id (`ORG-CMT-10`, `ORG-CMT-40`, `ORG-CMT-50`).
- **Text:** every user-facing text is a bn/en key in `@css/shared/i18n` (the `beneficiaries` namespace), with English digits.

## Implementation units

### U1. Decisions, permissions and the migration
- **Goal:** record the decisions, add the two permissions, and add the BEN number, the dismissal table and the two duplicate-search indexes with a reversible migration.
- **Requirements:** R2, R7 (permission), R18, R23 (who)
- **Files:**
  - `docs/DECISION_LOG.md`, `docs/security/permissions.yaml`, `docs/security/RBAC.md`;
  - `apps/api/prisma/schema.prisma`;
  - `apps/api/prisma/migrations/<timestamp>_beneficiary_master/{migration.sql,down.sql}`;
  - `apps/api/test/integration/migrations.test.ts`, `constraints.test.ts`;
  - `docs/database/DATABASE_SCHEMA.md`, `docs/database/ERD.md`;
  - `docs/security/AUTHORIZATION_MATRIX.md` (regenerated).
- **Approach:**
  - migration as `migrations/20261017120000_official_accounts` (backfill, then the constraint; a hand-written `down.sql`);
  - permissions as the existing `beneficiary.*` entries.
- **Tests:**
  - integration:
    - the migration applies and `down.sql` reverts it;
    - existing rows get BEN numbers in creation order;
    - a new row gets the next number, and a duplicate `ben_no` is refused;
    - a dismissal with `low_id >= high_id` is refused;
    - a second active dismissal of the same pair is refused;
    - both duplicate-search indexes exist after the migration and are gone after `down.sql`;
  - `pnpm docs:check` passes the new permissions.
- **Done when:** `pnpm db:migrate` applies on the dev database, the round-trip test passes, and the authorization matrix is current.
- **Depends on:** none
- **Size:** M
- **Risk area:** migration
- **Status:** done

### U2. Shared rules and request schemas
- **Goal:** one place for the identity formats, the BEN number formatter and parser, the family-match normalization and the zod schemas of every new request.
- **Requirements:** R1, R2, R15
- **Files:**
  - `packages/shared/src/beneficiaries/{identity,ben-no,normalize,requests}.ts` with their `.spec.ts`;
  - `packages/shared/src/beneficiaries/index.ts`: extend the existing `@css/shared/beneficiaries` export, which today holds the list filter schema;
  - `packages/shared/src/i18n/messages/{bn,en}/beneficiaries.json`: a new namespace for the error keys, registered where the existing namespaces are and checked by `pnpm i18n:check`.
- **Approach:** follow `@css/shared/files` (rules and request schemas, exported by subpath).
- **Tests:**
  - unit:
    - NID 10/13/17 digits, birth registration 17 digits, Bengali digits normalized;
    - wrong lengths and letters refused;
    - `BEN-0000123`, `ben-123` and `BEN123` parse to 123, and 123 formats as `BEN-0000123`;
    - names that differ only in spaces or case normalize the same;
    - the request schemas refuse missing reasons, reasons over 1,000 characters and unknown fields.
- **Done when:** the unit tests pass and `pnpm i18n:check` is clean.
- **Depends on:** none
- **Size:** M
- **Risk area:** none
- **Status:** done

### U3. Identity, lookup, search and profile creation
- **Goal:** look up a profile by NID or birth registration with auto-fill and locks, find profiles by BEN number and by retired ids, and create a profile with every identity check.
- **Requirements:** R1, R2, R3, R4, R5, R10, R26
- **Files:**
  - `apps/api/src/services/beneficiary-identity.ts` (new), `apps/api/src/services/beneficiaries.ts` (search, `benNo` in list and profile);
  - `apps/api/src/routes/beneficiaries.ts`;
  - `apps/api/src/rate-limit/rate-limit.ts` (the `lookup` class);
  - `apps/api/src/container.ts`, `docs/api/openapi.yaml`;
  - `apps/api/test/integration/beneficiary-identity.test.ts` (new), `apps/api/test/integration/beneficiary-tab.test.ts`.
- **Approach:**
  - lookup and search as `services/beneficiaries.ts` (scope filter, `view_nid` rule, field masks);
  - route as the three existing `defineRoute` entries of `routes/beneficiaries.ts`;
  - the rate-limit class as the `upload` class.
- **Tests:**
  - integration:
    - lookup by NID and by birth registration returns the auto-fill basics with name, father/husband name and the id locked;
    - an unknown number returns not found;
    - a blocked profile returns blocked without a reason;
    - `alreadyAppliedInProject` is true after an application row in that project;
    - a retired NID resolves to the kept profile with `mergedInto`;
    - the other identity number is never returned;
    - `mobileIsCallerOwn` is true when the profile's mobile is the caller's;
    - a volunteer outside the project, an unknown project and an RPM on another region's project get 404 (the project lies outside the scope), a caller without the permission 403;
    - 401 without a token, 422 on a wrong format;
    - the 61st lookup in a minute by one user gets 429, and so does the 601st in a day;
    - every lookup writes the `beneficiary.looked_up` audit row without the number, a found one with the profile and `outsideScope`, an empty one with `found: false` (failed attempts are what an enumeration leaves);
    - a profile of another region is found with the full auto-fill, and its audit row marks it as outside the region;
    - search finds a profile by BEN number and by a retired NID;
    - a retired NID in the caller's scope whose kept profile is outside it answers as not found in search, without naming the kept profile;
    - `createProfile` refuses a used NID (409, the holder's BEN number only to a caller who sees it), refuses a wrong format with the localized message, refuses the caller's own mobile (409), warns on a shared mobile and gives the next BEN number.
  - existing: covered by `apps/api/test/integration/beneficiary-tab.test.ts` (list, search, profile), `constraints.test.ts` (identity checks) and `triggers.test.ts` (own-mobile trigger); update them for `benNo` rather than duplicating.
- **Done when:** the lookup answers as the contract says, and the drift and contract-coverage tests pass.
- **Depends on:** U1, U2
- **Size:** L
- **Risk area:** personal data
- **Status:** done

### U4. Contact edit and correction requests
- **Goal:** officials edit mobile and address with a change log, and the locked fields change only through a reviewed correction request.
- **Requirements:** R3, R7, R8, R9, R10
- **Files:**
  - `apps/api/src/services/beneficiary-contact.ts`, `apps/api/src/services/beneficiary-corrections.ts` (new);
  - `apps/api/src/routes/beneficiaries.ts`, `docs/api/openapi.yaml`;
  - `apps/api/test/integration/beneficiary-contact.test.ts`, `beneficiary-corrections.test.ts` (new).
- **Approach:**
  - corrections as `services/change-requests.ts` (`create`, `list`, `decide` with FOR UPDATE, scope filter and status check);
  - If-Match as `routes/programs.ts`;
  - the change log as the `field_changes` rows the registration corrections write.
- **Tests:**
  - integration, contact edit:
    - a PM, RPM or Project Executive changes the mobile and the village, and each change is logged with old value, new value, who and when;
    - a name or NID in the body is refused (422 `beneficiary.locked_field`);
    - the mobile of a volunteer who owns a live application of the profile is refused (409);
    - a mobile on another profile saves, with the `beneficiary.mobile_shared` warning;
    - a stale If-Match gets 412;
    - an official of another region gets 403;
    - a volunteer and the Media Team get 403.
  - integration, corrections:
    - an RPM requests a name correction with a reason, and a PM approves it: the name changes, and the request and the change are audited;
    - the requester's own decision is refused (403);
    - a second submitted request on the same field gets 409;
    - a rejection keeps the value and records the reason;
    - an approval after the value changed gets 409;
    - a new NID held by another profile gets 409 `beneficiary.identity_taken`;
    - a new NID in a wrong format gets 422;
    - a decision on a request outside the scope gets 404;
    - the correction list masks the old and new NID for an official without `beneficiary.view_nid`, and gives 403 to the Media Team and a volunteer;
    - the contact log hides the old mobiles from a caller without the contact class.
- **Done when:** both flows pass their tests, and the audit rows carry before and after.
- **Depends on:** U3
- **Size:** L
- **Risk area:** personal data
- **Status:** done

### U5. Beneficiary blocklist and the application gate
- **Goal:** RPM and above block and unblock a beneficiary with a reason; T2.5 gets a check for new applications; the reason stays with officials.
- **Requirements:** R11, R12, R13, R14
- **Files:**
  - `apps/api/src/services/blocklist.ts`, `apps/api/src/routes/beneficiaries.ts`;
  - `apps/api/src/services/beneficiary-identity.ts` (`assertMayApply`);
  - `docs/api/openapi.yaml`;
  - `apps/api/test/integration/blocklist.test.ts`.
- **Approach:** extend the volunteer path of `services/blocklist.ts` to the beneficiary subject (the table and its triggers already take it), without the session revoke; the routes as `routes/volunteers.ts` block and unblock.
- **Tests:**
  - integration:
    - an RPM blocks a beneficiary in the region with a reason: `is_blocked` is set, the block is audited, and lookup says blocked;
    - `assertMayApply` refuses a blocked profile in any project and passes once the block is lifted with a reason;
    - existing application rows keep their status;
    - a second block gets 409, and an unblock without an active block gets 409;
    - an RPM of another region gets 404 (outside the scope), and a Project Executive and a volunteer get 403;
    - the reason is absent for the Media Team, the Procurement Team and a volunteer, and present for a PM;
    - `assertMayApply` on a retired profile's id follows to the kept profile and refuses when that one is blocked;
    - a block committed while an application insert waits on the row lock is seen by that insert, which is refused.
  - existing: covered by `apps/api/test/integration/blocklist.test.ts` (volunteer subject); extend it.
- **Done when:** both subjects pass the blocklist tests.
- **Depends on:** U3
- **Size:** M
- **Risk area:** auth
- **Status:** done

### U6. Family-duplicate detection
- **Goal:** for a beneficiary in a project, list the other beneficiaries there with the same mobile, or the same union, village and father/husband name.
- **Requirements:** R15, R16
- **Files:** `apps/api/src/services/beneficiary-family.ts` (new), `apps/api/src/container.ts`, `apps/api/test/integration/beneficiary-family.test.ts` (new).
- **Approach:** a scoped SQL query over the project's live applications, using the U2 normalization; returns name, BEN number and the matched rule.
- **Tests:**
  - integration:
    - two applicants with one mobile in different villages match on mobile;
    - the same union, village and father/husband name (differing only in spaces) match;
    - the same village with different fathers does not match;
    - an applicant of another project does not match;
    - retired profiles and deleted applications are ignored;
    - nothing is refused.
- **Done when:** the detection returns the expected matches, and T2.5 can call it.
- **Depends on:** U3
- **Size:** S
- **Risk area:** none
- **Status:** done

### U7. Merge candidates and "not the same person"
- **Goal:** officials see the suggested duplicate pairs in their scope with the matched rule, and can dismiss a false pair with a reason or lift that mark.
- **Requirements:** R17, R18
- **Files:**
  - `apps/api/src/services/beneficiary-merge-candidates.ts` (new), `apps/api/src/routes/beneficiaries.ts`, `docs/api/openapi.yaml`;
  - `apps/api/test/integration/beneficiary-merge-candidates.test.ts` (new);
  - `apps/api/scripts/perf-lists.ts`, `docs/testing/PERFORMANCE.md`.
- **Approach:** the bounded read of `core/bounded-read.ts`, as the volunteer list does, with the scope filter of `services/beneficiaries.ts`; the dismissal endpoints as the blocklist routes (reason, audit).
- **Tests:**
  - integration:
    - each of the three rules yields its pair with `matchedOn`;
    - a dismissed pair disappears and comes back after the lift;
    - dismiss and lift are audited;
    - retired profiles are absent;
    - an RPM sees only pairs in the region (another region's pair is absent);
    - a PM sees the pairs in the program, and a Project Executive gets 403 on the list and on dismiss;
    - a candidate row carries name, BEN number and the rule, never an NID or mobile;
    - a dismissal without a reason gets 422, and a second one gets 409.
  - perf: `perf:lists --only merge` on css_erp_perf records p50 and p95 in `docs/testing/PERFORMANCE.md`.
- **Done when:** the candidates list answers within the bounded-read limit on the measurement database.
- **Depends on:** U3
- **Size:** L
- **Risk area:** personal data
- **Status:** done

### U8. Merge, proposal and revert
- **Goal:** an RPM proposes, a PM or a global role merges with a chosen kept profile and a reason, and a global role reverts exactly what moved.
- **Requirements:** R5, R19, R20, R21, R22, R23
- **Files:** `apps/api/src/services/beneficiary-merges.ts` (new), `apps/api/src/routes/beneficiaries.ts`, `docs/api/openapi.yaml`, `apps/api/test/integration/beneficiary-merges.test.ts` (new).
- **Approach:**
  - one transaction with ordered row locks (as `services/uploads.ts` finalize locks its session);
  - moves listed per table in one table-driven map, so the merge and the revert read the same list;
  - the snapshot in `profile_merges.snapshot`;
  - audit through the route's `audit` declaration.
- **Tests:**
  - integration:
    - an RPM proposes with a reason (audited), and a PM executes it;
    - every listed table row of the retired profile moves to the kept one (an application, a family member, a consent, a call, a follow-up, a file link);
    - the retired profile points to the kept one, and its NID finds the kept one;
    - a direct merge by the Department Head through `POST /beneficiary-merges/direct` works without a proposal;
    - a proposal, a comparison or a direct merge with one profile outside the caller's scope gets 404 without naming it;
    - the merges list shows a PM the proposals in the program;
    - `keptId` on execute swaps the kept profile;
    - a retired profile's pending application in a project where the kept one has an application gets 409, listing the project;
    - a retired profile's rejected application in such a project stays on the retired profile, the merge goes through, and the revert keeps it there;
    - a blocked retired profile leaves the kept one blocked with the same reason;
    - when both are blocked, the kept profile keeps its block, the retired block is released with a merge reason, and the revert restores it;
    - a second proposal on a profile already merged answers 409 `beneficiary.merge_stale` on execute;
    - a submitted correction on the retired profile is rejected with a merge reason;
    - a revert by the Monitoring Team or the Department Head moves back exactly the moved rows and the block, keeps on the kept profile a row added after the merge, and is audited;
    - a revert while the kept profile has itself been merged gets 409;
    - a PM revert gets 403, and an RPM execute gets 403;
    - an execute on a request outside the scope gets 404;
    - a second execute gets 409;
    - the own-mobile backstop at commit maps to 409.
- **Done when:** a merge and its revert leave the database as it was, except for the history rows.
- **Depends on:** U5, U7
- **Size:** L
- **Risk area:** personal data
- **Status:** done

### U9. The 360° profile with real data
- **Goal:** the profile shows the BEN number, photos and files, the contact log, corrections, block and merge history, and the action flags of the caller.
- **Requirements:** R13, R24
- **Files:** `apps/api/src/services/beneficiaries.ts`, `apps/api/src/routes/beneficiaries.ts`, `docs/api/openapi.yaml`, `apps/api/test/integration/beneficiary-tab.test.ts`.
- **Approach:** the action flags as `services/volunteer-profile.ts`; the files through `services/files.ts` list of a record (T2.1); a retired profile answers with `mergedInto` instead of 404.
- **Tests:**
  - integration:
    - the profile carries the BEN number, the contact log rows, the correction requests and the merge history;
    - the block history is present for a PM and absent for the Media Team and the Procurement Team;
    - the merge history masks NIDs and block reasons for the Media Team, and shows the moved counts, never the snapshot;
    - the kept profile lists an application left on the retired profile, through the merge link;
    - the action flags match each role (RPM: block, propose, request correction; PM: merge, decide correction; Monitoring Team: revert; Media Team: none);
    - a retired profile answers with `mergedInto`;
    - an official of another region gets 404.
  - existing: covered by `apps/api/test/integration/beneficiary-tab.test.ts` (profile shell); update it.
- **Done when:** the profile response passes the contract recorder with every new section.
- **Depends on:** U4, U5, U8
- **Size:** M
- **Risk area:** personal data
- **Status:** todo

### U10. Web: beneficiary tab, lookup field and profile actions
- **Goal:** the tab shows and finds BEN numbers; a reusable lookup field shows the auto-fill with locks; the profile offers contact edit, correction request and decision, and block and unblock.
- **Requirements:** R6, R13, R24, R25
- **Files:**
  - `apps/web/src/admin/beneficiaries/{BeneficiariesPage,BeneficiaryProfilePage}.tsx`, `beneficiaries-api.ts`;
  - `apps/web/src/features/beneficiaries/LookupField.tsx` (new, reusable by the application form);
  - `apps/web/src/admin/beneficiaries/{ContactDialog,CorrectionDialog}.tsx` (new);
  - `apps/web/src/admin/beneficiaries/beneficiaries.test.tsx`, `apps/web/test/msw/` handlers;
  - `apps/web/e2e/beneficiaries.spec.ts`;
  - `packages/shared/src/i18n/messages/{bn,en}/beneficiaries.json`.
- **Approach:**
  - block and unblock reuse `admin/registrations/Blocklist.tsx` `BlocklistAction` and `BlocklistDialog`;
  - reasons use `admin/projects/ReasonDialog.tsx`;
  - the profile layout of UX-22 as `admin/volunteers/VolunteerProfilePage.tsx`;
  - the MUI set only through `@css/ui`.
- **Tests:**
  - unit/component:
    - the lookup field shows the locked fields read-only and the mobile editable;
    - each answer has its message: not found, blocked, "already applied in this project", own mobile;
    - the BEN number is in the list and the profile;
    - the actions show only with their flags;
    - axe passes in both languages.
  - e2e:
    - as `rpm.dhaka@example.org` on `/admin/beneficiaries`, the button "NID / জন্মনিবন্ধন দিয়ে খুঁজুন" opens the lookup;
    - a seeded NID with "খুঁজুন" shows the name, with the label "লক করা" beside "নাম" and "পিতা/স্বামীর নাম", and the mobile field editable;
    - an unknown NID shows "এই নম্বরে কোনো প্রোফাইল নেই";
    - the seeded blocked NID shows "এই ব্যক্তি ব্লক করা আছেন";
    - typing the BEN number into the search opens the profile.
  - existing: covered by `apps/web/src/admin/beneficiaries/beneficiaries.test.tsx` and `apps/web/e2e/beneficiaries.spec.ts`; extend both.
- **Done when:** the e2e lookup journey passes on the mobile and desktop projects.
- **Depends on:** U9
- **Size:** L
- **Risk area:** none
- **Status:** todo

### U11. Web: duplicates and merge screens
- **Goal:** officials review suggested pairs, dismiss false ones, compare two profiles side by side, merge with a chosen kept profile, and revert from the merge history.
- **Requirements:** R17, R18, R19, R20, R22, R23, R25
- **Files:**
  - `apps/web/src/admin/beneficiaries/duplicates/{DuplicatesPage,ComparePage,MergeDialog}.tsx` (new) with tests;
  - `apps/web/src/routes/index.tsx`, `apps/web/src/admin/navigation.ts`;
  - `apps/web/e2e/beneficiary-merge.spec.ts` (new);
  - `packages/shared/src/i18n/messages/{bn,en}/beneficiaries.json`.
- **Approach:**
  - the side-by-side comparison as `admin/registrations/RegistrationReview`;
  - lists with chips and filters in the URL as `admin/beneficiaries/BeneficiariesPage` (`list-query.ts`);
  - reasons through `ReasonDialog`.
- **Tests:**
  - unit/component:
    - a conflict answer lists the projects;
    - the kept profile choice is required;
    - the revert action shows only with its flag;
    - axe passes in both languages.
  - e2e:
    - as `pm.hum@example.org` on `/admin/beneficiaries/duplicates`, the tab "সম্ভাব্য ডুপ্লিকেট" shows the seeded pair with "একই নাম, পিতা/স্বামী ও মোবাইল";
    - "তুলনা করুন" shows both profiles side by side;
    - choose "এই প্রোফাইল রাখুন" on one, give a reason, and "মার্জ করুন" ends with "প্রোফাইল মার্জ হয়েছে";
    - searching the retired BEN number opens the kept profile with "BEN-… এর সাথে মার্জ হয়েছে";
    - then as `monitoring@example.org`, on the kept profile, "মার্জ ফেরত নিন" with a reason ends with "মার্জ ফেরত নেওয়া হয়েছে", and both profiles are live again;
    - a volunteer and the Media Team cannot open the duplicates page.
- **Done when:** the merge and revert journey passes on the mobile and desktop projects.
- **Depends on:** U8, U10
- **Size:** L
- **Risk area:** none
- **Status:** todo

### U12. Demo cases, the rule register and closing documents
- **Goal:** the demo seed has the cases the journeys use, every rule has its test recorded, and the documents match the build.
- **Requirements:** R26
- **Files:**
  - `apps/api/seed/sets/demo/index.ts`: a blocked person, a duplicate pair, a family pair in one project, and a merged pair;
  - `apps/api/test/integration/seed.test.ts`;
  - `docs/BUSINESS_RULES.md` (test register for BR-001 to 015, 019, 250, 251);
  - `docs/ui/SCREENS.md` (beneficiary tab, lookup field, duplicates page), `docs/testing/TEST_STRATEGY.md`, `docs/testing/DEMO_ACCOUNTS.md`;
  - `docs/STATUS.md`, `CLAUDE.md` (repository map).
- **Approach:** the seed as the existing demo beneficiaries (deterministic, every tenth by birth registration); the register lines as the T2.1 lines.
- **Tests:**
  - integration: the seed is deterministic and creates the demo cases.
  - `pnpm rules:status` reports every listed rule as tested.
- **Done when:** the full verification below passes.
- **Depends on:** U10, U11
- **Size:** M
- **Risk area:** none
- **Status:** todo

## Checkpoints
- **Mode:** grouped (one by one 10, grouped 7, all at once 0; N is over 4, so one by one's 10 goes to grouped: 17)
- **Signals:** N 12, L 3,200, R 7, Fd 4, C 8, P 2
- **C1** after U1: a migration and the permissions the rest build on.
- **C2** after U3: the identity and lookup foundation (four later units depend on it), personal data, with U2.
- **C3** after U4: personal data, the reviewed corrections.
- **C4** after U5: an authorization change that U8 and U9 build on.
- **C5** after U7: personal data and a new pattern (the candidate queries), with U6.
- **C6** after U8: personal data and a new pattern (the merge and revert), a foundation for U9 and U11.
- **C7** after U9: personal data in the profile response.
- **C8** after U10: the web foundation for U11 and U12.
- **C9** after U12: the end, with U11.

## Verification
- `pnpm typecheck` · `pnpm lint` · `pnpm test` · `pnpm --filter @css/api exec vitest run --config vitest.db.config.mts`
- `pnpm docs:check` · `pnpm --filter @css/api authz:matrix` · `pnpm --filter @css/api contract:coverage`
- `pnpm rules:status --phase 2 --report-only`
- `pnpm e2e` (or, while building, `pnpm --filter @css/web e2e -- e2e/beneficiaries.spec.ts e2e/beneficiary-merge.spec.ts e2e/a11y.spec.ts` after `pnpm --filter @css/web build:e2e`), with `--repeat-each 3 --workers 1` on the new specs
- `pnpm --filter @css/api perf:lists --only merge` on css_erp_perf
- Dev database: `pnpm db:migrate`, then http://localhost:3000/admin/beneficiaries as `rpm.dhaka@example.org` and `pm.hum@example.org`

## Risks and rollback
- **Migration:** `down.sql` drops the dismissal table, the `ben_no` column, its sequence and the new indexes. The backfill only adds numbers, so nothing is lost on the way down (`DB-MIG-05`).
- **Merge:** rows are only updated, never deleted, and the snapshot lists every moved id, so a revert restores the state. A mistake in the table map is the main risk; U8 tests each listed table, and the merge refuses instead of guessing on any unique conflict.
- **Personal data:** NID enumeration through lookup is limited by the project scope and the per-user `lookup` rate limit, and the block reason stays in its field class. C2, C5 and C6 run the security reviewer.

## Definition of done
- All units done and their tests pass
- Verification commands pass
- `ae-review` has run, with no open P0 or P1
- Code from abandoned attempts is removed

## Progress
- **Branch:** `feat/beneficiary-master`
- **Updated:** 2026-10-20 18:10
- **Next:** U9: the 360° profile with real data (start with the profile tests in `apps/api/test/integration/beneficiary-tab.test.ts`)
- **Uncommitted:** none
- **Reviewed through:** C6 at d6e749b
- **Notes:** the plan was reviewed on 2026-10-20 (plan and security reviewers); the owner decided in chat: full auto-fill across regions with audit and limits; an application past pending stays on the retired profile at a merge. The Prisma model of the dismissal table is `MergeDismissal` (a longer name re-aligned the whole schema file). The dev database got the migration through the host `pnpm db:migrate` (its `jobs:install` step then stops without `apps/api/.env`, a known issue); the API container needs `docker compose run --rm setup` or a restart to regenerate its Prisma client before the U3 routes run there. U2: the rules live in `@css/shared/beneficiaries` (`identity.ts`, `requests.ts`, tests in `rules.test.ts`); the error texts went into the existing `errors.beneficiary` group and the screen texts go into `admin.beneficiaries`, so no new namespace. The request schemas reuse `nidSchema`, `mobileSchema` and `reasonRequestSchema`; they keep plain patterns (no transforms) so the generated contract stays comparable, and the app turns Bengali digits into English ones with `normalizeIdentityNumber` before it sends. C6 (T2, three reviewers): conflict details name a project only where the caller reaches it; open alerts of one kind clash; a left-behind application keeps its candidate pointer; the revert moves back only rows still on the kept profile; the merge list needs one side in scope and hides proposals whose profiles are no longer both live; `core/db-errors.ts` recognises a unique violation and the own-mobile refusal at commit (the other modules keep their own copies; a follow-up). The owner decided (D-118) that a PM merges only when every application of the retired profile is in the PM's program. U8: "pending" means `draft`, `submitted` and `needs_verification` (the states an application can still be deleted in); a block is carried by new rows (the retired block released with a reason, a copy with the same reason on the kept profile, and back by the revert), never by changing a row's subject, because the flag trigger syncs only the new subject; the error answer now sends a detail's `params` for `beneficiary.identity_taken` (`benNo`) and `beneficiary.merge_conflict` (`projectId`, `applicationId` or `ref`), so the BEN number of U3 reaches the app; after a merge the retired profile can leave a PM's program scope (its applications moved), so a second execute by that PM answers 404. C5 (T2, three reviewers): a mobile held by more than 20 live profiles gives no `same_mobile` pairs (a shared phone; quadratic growth), pairs with the same name and father still come; `refreshFor` takes the merge-candidates advisory lock shared and `refreshAll` exclusive; pair ids compare lower-cased. Carried to T2.5 and T2.6: the route that shows the family warning must check the project scope and keep it from volunteers, Media and Procurement, and application-side mobile or address edits must call `refreshFor`. U7: the suggestions name every rule a pair meets (`matchedOn` is a list); the pairs are kept in a table, kept up to date by creation, contact edit and name correction, and by the nightly job (8 s on 2,000,000 profiles); the list answers in 12 ms (p95) with 50,000 pairs. The scope of the raw queries is `beneficiaryScopeSql` in `access/scope.ts`, proven equal to `beneficiaryWhere` by a test. A list route of the marks (`GET /beneficiary-merge-dismissals`) was added, since lifting a mark needs its id. U6: the matches name both rules when both hold (`matchedOn` is a list: `mobile`, `union_village_father`); the contract field `familyDuplicateWarnings` of the application detail follows that shape and carries the BEN number. C4 (T2, three reviewers): the gate locks each profile of a merge chain before it reads the pointer; the concurrency tests wait for the other session to wait for the lock (`pg_stat_activity`, this database only) instead of sleeping; the reason-visibility test of the block (Media, Procurement, volunteer) belongs to U9, where the profile first shows block history. C3 (T2, three reviewers): a correction request names a held number only inside the requester's NID scope (otherwise accepted, refused at approval), and the holder of a number is named by the NID-scope rule everywhere; a no-op correction is refused; a unique violation at approval maps to 409; one user's lookups take an advisory lock (`$executeRaw`, as `services/nisab.ts`), so the daily count holds under parallel requests. Dismissed: the claim that the profile answer sends `updatedAt` (the route schema drops unknown fields). Left as noted: a lookup after the daily limit still tells an existing out-of-scope number (429) from an unknown one (found false). U5: the beneficiary blocklist reuses the volunteer path's entry view and `blocklistEntry` schema; an unblock without an active block answers 409 (the volunteer path answers 404). U4: no separate list route of correction requests; the 360° profile of U9 carries them for callers who hold either correction permission (one route takes one permission). The profile GET now sends its ETag for the contact edit's If-Match. The correction's decision reason lives in the audit row (the table has no column for it). The own-mobile check of a contact edit covers the owner volunteer and the creator of every live application, as the database trigger does. C2 (T2, three reviewers): the shared-mobile warning counts all and names only the profiles in the caller's scope; `createProfile` refuses a mobile in another spelling than `01XXXXXXXXX`; a merge chain that does not end throws instead of answering not found; an NID and a birth registration are two separate number spaces (a 17-digit NID equal to someone's birth registration is not a clash). The security reviewer raised the cross-region auto-fill again (P1); it is the owner's decision D-114, and the owner was asked whether to add a daily cap on lookups outside the caller's region. U3: the lookup audits every call (also the empty ones) and answers 404 for a project outside the scope; a new profile is inserted with explicit SQL, because Prisma writes the schema default of the generated reference-list columns (`gender_list` and the two others), which the database refuses, and making them `dbgenerated` in schema.prisma would need a migration; a search by BEN number needs no lookup limit, since the tab's own scope already lists those profiles. C1 (T2, three reviewers): the name key collapses all white space before it trims; a dismissal row can only be lifted, once (trigger); no decision ids in the SQL comments; the tests read back stored rows. Carried forward from C1: a BEN-number search is walkable, so it gets the `lookup` limits and audit like an NID (U3); the create service and its schema never accept `ben_no`; the dismiss and lift routes check both profiles against the scope; the correction decider is never the requester (service, and a CHECK if it fits); the runbook notes that the two duplicate-search indexes are rebuilt after a restore into another collation (U12).
