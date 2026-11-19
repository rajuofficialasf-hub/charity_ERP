# API STANDARDS (/api/v1)

Status: complete, task T0.17 (2026-10-10). Every endpoint of the ERP follows these conventions; `docs/api/openapi.yaml` (T0.18) applies them and the CI drift test (NFR-54, ADR-014) enforces them. Sources: constitution §9, §13, §15; `docs/architecture/SYSTEM_ARCHITECTURE.md` §6 (check order); ADR-002 (NestJS, @nestjs/swagger); D-055 (zod as the only validation library); `docs/architecture/AUTH.md`; `docs/security/RBAC.md` §8 and `permissions.yaml`; `docs/architecture/OFFLINE_SYNC.md` §4; `docs/architecture/FILES_AND_DOCUMENTS.md` §3–§5; `docs/architecture/WORKFLOW_ENGINE.md` §6; `docs/architecture/NOTIFICATIONS.md`; `docs/database/DATABASE_SCHEMA.md`; O-03, O-08, O-25, O-29, O-30; UX-05. The technical choices below are approved with this document.

## 1. Versioning

- Base path `/api/v1`. The version is in the path, not in a header.
- Additive changes stay in v1: new endpoints, new optional request fields, new response fields, new error codes in an existing family, new enum values in *configurable* lists (clients must tolerate unknown values there).
- Breaking changes follow section 17. If a breaking change cannot be avoided, `/api/v2` runs in parallel with v1 for a deprecation window long enough for offline phones to update (section 17).

## 2. Resource naming and methods

| Rule | Example |
|---|---|
| Plural, kebab-case nouns | `/projects`, `/expense-claims`, `/media-subjects` |
| Nest at most one level under the owning parent | `/projects/{projectId}/applications`, `/applications/{applicationId}/activities` |
| Ids are UUIDs (v7) | `/beneficiaries/{beneficiaryId}` (the BEN-ID, O-03) |
| Human application number as an alternate lookup | `GET /application-numbers/{appNo}` |
| JSON field names camelCase | `beneficiaryId`, `submittedAt` (the database is snake_case; Prisma maps) |
| Methods | `GET` read, `POST` create or action, `PATCH` partial update; no `PUT`; no hard `DELETE` |
| State changes are explicit actions | `POST /applications/{id}/actions/submit`, `…/actions/approve`, `…/actions/reject`, `…/actions/waitlist`, `…/actions/delete` (soft delete), `POST /projects/{id}/actions/close` |
| Actions map to workflow transitions | the action name equals the transition's target or verb in the project's workflow snapshot (WORKFLOW_ENGINE §5); the engine runs permission, guards and effects |
| Searches with large bodies | `POST /beneficiaries/lookup` (NID lookup sends the number in the body, never in the URL, so it is not logged by proxies) |

No personal data in paths or query strings (privacy rule): identity numbers, mobile numbers and names go in request bodies.

Application action names and the common-cycle transitions they trigger (`workflow-templates/_common.yaml`):

| Action | Transition |
|---|---|
| submit | draft → submitted |
| review | submitted → under_review |
| send_for_approval | under_review → reviewed |
| approve | reviewed → approved |
| reject | reviewed → rejected, or waitlisted → rejected |
| waitlist | reviewed → waitlisted |
| pull_from_waitlist | waitlisted → approved |
| delete | draft → deleted, or submitted → deleted |
| verify_link | needs_verification → submitted |
| reject_unverified | needs_verification → rejected |

Template stages after approval are moved by activities (`POST /applications/{id}/activities` and the bulk screens), not by action names.

## 3. Request and response envelope

Success:

```json
{
  "data": { "id": "0192…", "status": "submitted" },
  "meta": { "requestId": "req_01J…", "etag": "W/\"1728549…\"" }
}
```

Lists:

```json
{
  "data": [ { … }, { … } ],
  "meta": { "requestId": "req_…", "nextCursor": "eyJ…", "prevCursor": null, "limit": 25, "total": 137 }
}
```

Error:

```json
{
  "error": {
    "code": "validation.failed",
    "messageKey": "errors.validation.failed",
    "message": "কিছু তথ্য সঠিক নয়",
    "details": [ { "path": "beneficiary.nid", "code": "validation.nid_format", "messageKey": "errors.validation.nid_format", "message": "NID 10, 13 বা 17 অঙ্কের হতে হবে" } ],
    "requestId": "req_…"
  }
}
```

Messages come from the Bengali or English catalogue; digits are always 0–9 in both languages (UX-05).

- `params` appears only for the codes whose parameters section 8 documents (`permission.grant_refused` with `rule`; in a detail, `beneficiary.identity_taken` with `benNo` when the caller may see the holder, and on the addition of a document to a profile without one also `beneficiaryId`, the live profile behind the holder, for the comparison of the two, and `beneficiary.merge_conflict` with `projectId` and `applicationId`, or `ref`; `application.answer_not_in_list` with `question`, the label of the question in the request language, also in a sync row result, D-168; `form.label_language` with the text of a form that lacks a language, D-171; `public_link.replaces_live` with `formId` and `form`, the title in the request language of the form whose live public link an enable would move, D-179); other codes keep their parameters inside the rendered message.
- `requestId` is returned in every response and in the `X-Request-Id` header; it is the correlation key in logs (SYSTEM_ARCHITECTURE §10).
- Timestamps are ISO 8601 UTC with `Z`; dates are `YYYY-MM-DD`; money is a decimal **string** (`"1000.00"`) in BDT; counts are integers; booleans are booleans; all digits are 0–9 (UX-05).
- Fields the caller may not see are **absent**, not null (field-level protection by removal, RBAC.md §8).
- `null` means "known to be empty"; an absent optional field in a PATCH means "unchanged".

## 4. Pagination: keyset cursors

Decision: **cursor (keyset) pagination** for every list endpoint.

Why: lists change while people work (applications arrive during review, distributions are recorded all day); offset pages shift and skip or repeat rows, and deep offsets get slower; with about 2,000 concurrent field users (NFR-01) the database cost must stay constant at any depth; UUID v7 ids are time-ordered, so `(sortKey, id)` is a natural stable key.

- Parameters: `limit` (default 25, maximum 100, NFR-11), `cursor` (opaque base64 of the last row's sort key and id, signed so it cannot be forged into another scope), `include=total` to request a count.
- `meta.nextCursor` / `meta.prevCursor` are null at the ends.
- `meta.total` is exact up to 10,000 rows and `"10000+"` beyond, so screens can show "statistics everywhere" (BR-224) without full counts on huge tables; dashboards use their own aggregate endpoints.
- Officials' tables navigate with next/previous and narrow with filters instead of jumping to page N.
- Small bounded lists (at most 500 rows, e.g. reference lists, a project's components, locations under one parent) return all rows without paging and say so in the OpenAPI description.
- Page numbers (D-105): the volunteer and the beneficiary lists also accept `page` (1-based), an offset into the same order, so a person can jump to a numbered page. It is allowed only inside the counted range of 10,000 rows, where the offset stays cheap, and never together with `cursor` (422 `validation.failed` on `page`); the answer carries the cursors as usual, so the rows past the counted range page by cursor.
- Offline snapshots use `since=<timestamp>` deltas (OFFLINE_SYNC §4), not cursors.

## 5. Filtering, sorting and searching

- Filters are plain query parameters documented per endpoint; multiple values are comma-separated: `?status=submitted,reviewed&districtId=0192…&ownerVolunteerId=…`.
- Ranges use suffixes: `submittedFrom`, `submittedTo` (dates, inclusive).
- Sorting: `sort=-submittedAt,appNo` (leading `-` = descending); only fields whitelisted per endpoint; the id is always added as the final tiebreaker.
- Search: `q=` where documented; it searches names and application numbers with trigram matching (O-39); identity numbers are searched only through the lookup endpoint (section 2).
- Every filter is combined with the caller's resolved scope (RBAC.md §4); a filter can narrow but never widen what the caller may see.
- Unknown parameters are rejected with `validation.unknown_parameter` (catches typos that would silently return everything).

## 6. Concurrency control

- Every single-record response carries an `ETag` derived from the row's `updated_at` (weak validator).
- `PATCH` and action endpoints on mutable records require `If-Match: <etag>`; a mismatch returns 412 `conflict.stale_version` with the current representation in `error.details`, so the client can show what changed.
- This prevents an official and a volunteer (or two officials) from silently overwriting each other online. Offline records do not use ETags; their conflicts follow OFFLINE_SYNC §6.

## 7. Validation and localization

- Every request body, query and path parameter is validated on the server with the zod schema from `packages/shared` (D-055), regardless of client validation; database constraints are the last line (DATABASE_SCHEMA §5, §18).
- Validation failures return **422** with `validation.failed` and one `details` entry per problem: `path` (JSON path in camelCase), `code` (catalogue code), `messageKey`, `message`.
- Language of `message`: the `Accept-Language` header (the PWA always sends the user's chosen language), else the authenticated user's stored language, else `bn`. Only `bn` and `en` are served; other values fall back to `bn`.
- Messages come from the i18n catalogue; the API never builds sentences by concatenation; numbers in messages use the central formatter with English digits (UX-05, BR-219).

## 8. Error-code catalogue

Codes are dotted, lower-case, stable and documented; the i18n key is `errors.<code>`. HTTP status gives the class; clients branch on `code`.

| Family | Code | HTTP | Meaning / client action |
|---|---|---|---|
| auth | auth.invalid_credentials | 401 | wrong id or password (same message for unknown id) |
| auth | auth.account_locked | 423 | locked after 5 failures for 15 minutes (O-05) |
| auth | auth.account_pending | 403 | registration awaiting approval |
| auth | auth.account_blocked | 403 | blocked; show the block message (BR-047) |
| auth | auth.account_deactivated | 403 | account closed |
| auth | auth.password_change_required | 403 | a staff account approved with a global role must set a new password first; only the own profile read, the language, the password change and the logout answer (O-66) |
| auth | auth.token_missing | 401 | no bearer token |
| auth | auth.token_expired | 401 | access token expired → refresh |
| auth | auth.token_stale | 401 | permission version changed → refresh silently (AUTH.md §9) |
| auth | auth.session_revoked | 401 | device session revoked → wipe local data (AUTH.md §8) |
| auth | auth.refresh_invalid | 401 | refresh token expired or invalid → log in; keep the outbox (O-29) |
| auth | auth.refresh_reused | 401 | refresh-token reuse detected → session revoked |
| auth | auth.csrf_failed | 403 | refresh without a valid CSRF token |
| client | client.origin_refused | 403 | a POST, PUT, PATCH or DELETE whose `Origin` is missing, `null`, or neither the PWA's own nor an allowed one; answered before any route |
| auth | auth.current_password_invalid | 422 (as detail of validation.failed) | password change with a wrong current password (T1.7) |
| auth | auth.password_confirmation_failed | 403 | a wrong password where a signed-in person confirms an act with it (the Main Admin transfer); counted as a wrong login is, so the fifth answers 423 `auth.account_locked` (AUTH.md §11) |
| auth | auth.password_unchanged | 422 (as detail of validation.failed) | password change to the password the account already has (O-66) |
| auth | auth.invitation_invalid | 404 | the set-password link is unknown; ask the admin for a new link (D-097) |
| auth | auth.invitation_expired | 410 | the set-password link was used, replaced or is older than 72 hours (BR-262) |
| otp | otp.invalid | 422 | wrong code |
| otp | otp.expired | 422 | code older than 5 minutes |
| otp | otp.attempts_exceeded | 429 | more than 5 attempts on one code |
| permission | permission.denied | 403 | the action needs a permission the caller lacks |
| permission | permission.not_found | 404 | record does not exist **or** is outside the caller's scope (no existence leak, RBAC.md §8) |
| permission | permission.grant_refused | 403 | the permission panel or a project grant refuses the change; `params.rule` names the rule: `self_change`, `top_role_protected`, `key_permission_admin_only`, `owner_transfer_only_admin`, `global_scope_protected`, `sensitive_to_volunteer`, `not_held_by_granter`, `not_rpm_grantable`; a new account and the approval of an official's registration answer it with `role_admin_only` for a role the caller may not give (RBAC.md §6, §7; D-078, D-187) |
| validation | validation.failed | 422 | see details |
| validation | validation.unknown_parameter | 400 | unknown query parameter |
| validation | validation.malformed | 400 | unparsable JSON or wrong content type |
| validation | validation.nid_format, validation.birth_reg_format, validation.mobile_format, validation.required, validation.too_long, validation.out_of_range, validation.option_unknown, validation.bangla_text, validation.date_format, validation.date_future, validation.facebook_link | 422 (as details) | field-level problems |
| validation | validation.password_too_short, validation.password_uppercase_digit | 422 (as details) | password rules of AUTH.md §3 (T1.7, D-071) |
| validation | validation.job_id_format, validation.job_id_mobile, validation.affiliation_unit | 422 (as details) | an official's job ID (2 to 32 letters, digits or . _ / -; never a mobile number) and the unit named only outside the department (D-097) |
| validation | validation.email_format, validation.amount_format, validation.list_code, validation.https_public_url | 422 (as details) | settings and lists: an email, a Taka amount with at most two decimals, a list item code (small letters, digits and _), an https endpoint on a public host (D-098) |
| reference | reference.code_taken | 409 | a list item code already in the list (D-098) |
| nisab | nisab.effective_date | 422 (as detail of validation.failed) | the effective date is before today (Dhaka), more than a year ahead, or not after the latest version not withdrawn (BR-211, D-098) |
| nisab | nisab.in_effect | 409 | withdrawing a version that has already taken effect (D-098) |
| audit | audit.range_required | 422 (as detail of validation.failed) | the audit viewer's date range is reversed or longer than 366 days (D-098) |
| nisab | nisab.withdrawn | 409 | withdrawing a version already withdrawn (D-098) |
| notification | notification.no_email_for_volunteers | 422 (as detail of validation.failed) | a volunteer asks for an email setting; volunteers get notifications in the app only (D-099) |
| notification | notification.unsafe_text | 422 (as detail of validation.failed) | a template text holds a link or the characters < or > (D-099) |
| notification | notification.placeholder_unknown | 422 (as detail of validation.failed) | a template text uses a placeholder that is not declared for its key (D-099) |
| notification | notification.person_in_app | 422 (as detail of validation.failed) | an in-app template text uses a person's name; only an email may (D-099) |
| session | session.use_logout | 409 | the current device session is ended with logout, not revoke (T1.7) |
| user | user.system_owner_protected | 409 | the Main Admin cannot be blocked, deactivated or have its sessions revoked by others (BR-035, AUTH.md §11) |
| user | user.handover_required | 409 | deactivation before a completed handover (BR-034) |
| user | user.role_unchanged | 409 | a role change to the role the official already holds (BR-321) |
| user | user.department_head_exists | 409 | the Department Head role given while another official holds it; the earlier Head changes role first (BR-320) |
| user | user.transition_not_allowed | 409 | account state change not allowed (AUTH.md §7, O-59): same state, own account, pending account (registration flow), volunteer block (blocklist flow) |
| user | user.not_locked | 409 | lock clearing on an account that is not locked (O-59) |
| user | user.job_id_taken | 409 | the job ID belongs to another account, in any letter case (BR-261) |
| user | user.supervisor_invalid | 422 (as detail of validation.failed) | the supervisor is not an active department official, is the official themself, or the line would loop (BR-261) |
| user | user.invitation_not_needed | 409 | a new set-password link for an account that already has a password (BR-262) |
| user | user.not_staff | 409 | an official's action (link, profile) on a volunteer account (D-097) |
| registration | registration.account_exists | 409 | after both codes: the mobile or email belongs to an active, pending or blocked account; log in instead (D-086) |
| registration | registration.already_verified | 409 | a code is sent or checked for a contact that is already verified, or the draft already holds its token (D-090) |
| registration | registration.token_invalid | 401 | missing or wrong draft token on lookup, upload or submit (D-082) |
| registration | registration.draft_expired | 410 | the draft is older than 24 hours or unverified; start again |
| registration | registration.open_corrections | 409 | approval or resubmit while a correction is unanswered (BR-030) |
| registration | registration.not_resubmitted | 409 | approval of a registration still in correction |
| registration | registration.blocklisted | 409 | approval of a blocklisted registration (BR-047) |
| registration | registration.nid_exists | 409 | a volunteer registration with an NID another volunteer already holds (O-20) |
| registration | registration.staff_by_invitation | 422 | officials do not register themselves; the admin creates the account (D-097) |
| registration | registration.request_open | 409 | an edit request for a field that already has an open one (D-085) |
| handover | handover.target_invalid | 422 | the receiving user is not an active official with a fitting role, or is the person handed over (BR-034) |
| handover | handover.items_outstanding | 409 | completion while items are still unassigned (BR-034) |
| program | program.code_taken | 409 | a program code already in use (T1.11) |
| program | program.inactive | 409 | a new project, or a project moved, into an inactive program (BR-256) |
| program | program.has_open_projects | 409 | deactivation of a program with a draft, active or closing project (BR-256) |
| program | program.pm_role_required | 422 | the assigned PM does not hold the Program Manager role |
| project | project.session_year_taken | 409 | a session of a project series, new or with a new period, in a year another session of that series already starts in; a cancelled session holds no year (BR-312, D-177) |
| project | project.series_code_taken | 409 | a project series with a code another series already holds (O-03, BR-312) |
| project | project.session_source_foreign | 422 | a new session whose named source is not a session of the same series, or is one the caller may not view (BR-315) |
| project | project.session_source_none | 422 | a new session with no source named, of a series that has no session the caller may copy: none yet, only cancelled ones, or none the caller may view (BR-315) |
| project | project.read_only | 409 | a setup change the project's state does not allow: the period, the workflow or the window while active, anything while closing, closed or cancelled (BR-257); also a rename of one session while its series holds another session (BR-312) |
| project | project.deadline_not_later | 409 | a deadline extension to a date not after the current end date (BR-058) |
| project | project.rpm_role_required | 422 | an area's RPM does not hold the RPM role (BR-060) |
| project | project.staff_role_required | 422 | staff access for someone who is not a Project Executive or Official দায়ী (D-095; the Implementer is retired, D-162) |
| project | project.area_exists | 409 | the same area with the same RPM is already on the project (BR-060) |
| project | project.staff_exists | 409 | the person already has an active access on the project |
| project | project.budget_mismatch | 422 | an active project whose fund sources would no longer add up to its planned budget; budget and fund sources change together (D-095) |
| project | project.fund_source_in_use | 409 | removal of a fund source that budget ledger entries already use |
| project | project.area_in_use | 409 | removal of an area whose location still carries active staff access and no other RPM covers it |
| project | project.topic_in_use | 409 | removal of a syllabus topic that classes or progress entries already use |
| form | form.label_language | 422 (as details of validation.failed) | a form is published while a text lacks a language (BR-245, D-171); one detail per text and language, its `path` the question's key (the part's key for a title) and its `params` naming the text: `text` (`title`, `label`, `help`, `placeholder`, `option`, `table_row`, `table_col` or `result`), `language` (`bn` or `en`), `fieldKey` or `section`, and `option`, `row`, `col` or `result` with the code or key of the option, table row, table column or text result. A draft save accepts the missing text and answers this code only for a text that is not a pair of strings or is over its length |
| form | public_link.replaces_live | 409 | the public link is enabled on a form while it is live on another form of the project, without `confirm: true`; `params.formId` and `params.form` (its title in the request language) name the live form, whose applicants lose the link. A caller who may not edit the project's forms gets 403 `permission.denied` first and learns no name (D-179) |
| form | public.sender_full | 429 | one sender (the address the trusted proxies report) already has its share of a public link's unclaimed photos, 20 photos or 50 MB, a tenth of the link's ceiling; `Retry-After` (D-179) |
| business | beneficiary.identity_missing | 422 | neither NID nor birth registration (BR-001) |
| business | beneficiary.mobile_is_volunteer_mobile | 422 | BD-03 / BR-008 (also raised by the database trigger, DATABASE_SCHEMA §18) |
| business | beneficiary.blocked | 422 | blocked beneficiary cannot apply (BR-010) |
| business | beneficiary.already_applied | 409 | one application per beneficiary per project (BR-016) |
| business | beneficiary.locked_field | 422 | locked field changes only through a correction request (BR-006) |
| business | beneficiary.pick_invalid | 422 | a pick token of the name lookup that is forged, altered, another caller's or another project's, or names a profile that no longer exists; an expired token is not refused but sends the application to the office's verification (BR-303) |
| business | beneficiary.match_not_open | 422 | the name lookup, or an application with a pick token, on a project that requires the identity document (BR-303) |
| business | beneficiary.document_present | 409 | an identity document added to a profile that already has one; a change of the number is a correction request (BR-308) |
| business | beneficiary.pick_number_conflict | 409 | an identity number typed beside a person picked by name (or bound without a document) that another live profile holds (BR-303) |
| business | beneficiary.match_limit | 429 | the day's number of name lookups (setting `lookup.match_daily_limit`) is used up until the next day in Bangladesh (BR-303) |
| business | payment.transaction_id_exists | 409 | unique transaction id (BR-134) |
| business | payment.claim_already_paid | 409 | one payment per claim |
| business | animal.already_allocated | 409 | allocated animal (BR-145) |
| workflow | workflow.transition_not_allowed | 409 | no transition from the current state with this action |
| workflow | workflow.guard.<guard_name> | 409 | a named guard failed; `<guard_name>` is any guard of WORKFLOW_ENGINE §6 with dots replaced by underscores, e.g. `workflow.guard.deadline_open`, `workflow.guard.limit_not_exceeded`, `workflow.guard.photos_required_per_rule`, `workflow.guard.photos_not_pending_sync`, `workflow.guard.stock_balanced`, `workflow.guard.exam_passed`, `workflow.guard.vouchers_verified`, `workflow.guard.project_not_closed`, `workflow.guard.score_comment_if_against_order` |
| workflow | workflow.reason_required, workflow.comment_required | 422 | transition needs a reason, or a comment against the score order, into a full quota, or for a repeat of the same person or family the project holds (the details name each reason) |
| conflict | conflict.stale_version | 412 | `If-Match` mismatch |
| conflict | conflict.stale_version | 409 | the database ended the write because another request was changing the same person or application at the same moment (a deadlock or a write conflict); nothing was written and the same request may be sent again |
| conflict | conflict.locked_on_server | 409 | locked or approved data; server wins (OFFLINE_SYNC §6) |
| sync | sync.batch_too_large | 413 | more than 50 records or over the payload limit (O-29) |
| sync | sync.deadline_passed | 409 (per record) | late draft created after the deadline (O-13) |
| sync | sync.limit_exceeded | 409 (per record) | volunteer's application limit reached (O-13) |
| sync | sync.project_closed | 409 (per record) | project closed |
| sync | sync.not_permitted | 403 (per record) | permission or assignment removed while offline |
| sync | sync.retry_exhausted | — (client-side) | client gave up after 7 days of transient failures (O-29) |
| file | file.type_not_allowed | 415 | type not allowed for the kind (FILES_AND_DOCUMENTS §5) |
| file | file.too_large | 413 | above the size limit |
| file | file.source_not_allowed | 422 | gallery under camera_only (UX-11) |
| file | file.duplicate | 409 | identical bytes already in the project (O-30); `params.fileId` names the other file only to a caller whose scope reaches one of its records |
| file | file.quarantined | 423 | not scanned yet; cannot be previewed or downloaded (O-30) |
| file | file.infected | 410 | blocked by the scanner |
| file | file.session_expired | 410 | upload session expired |
| file | file.kind_not_allowed | 422 | the kind cannot be linked to that record type (D-108) |
| file | file.part_out_of_range | 422 | a part number outside the declared size (D-108) |
| file | file.checksum_mismatch | 422 | the joined bytes do not match the declared SHA-256 or size (D-108) |
| file | file.unreadable | 422 | a stored photo whose container cannot be walked for its download (damaged or not its stored type); nothing is sent and nothing audited (D-181) |
| file | file.parts_missing | 409 | finalize before every part of the declared size arrived (D-108) |
| file | file.sessions_limit | 429 | more than 20 open upload sessions (D-108) |
| file | file.session_mismatch | 409 | a create repeats a client id of an earlier session with other file details (kind, record, slot, type, size or SHA-256) |
| file | file.cover_invalid | 422 | the file named as a cover is not a finished upload of kind cover_photo that the caller made for this very program or project series and that the scan has cleared; one answer for every such reason, so it tells nothing of another person's file (BR-316) |
| rate_limit | rate_limit.exceeded | 429 | with `Retry-After` |
| export | export.not_ready, export.expired | 409, 410 | job still running; file removed after 30 days |
| client | client.upgrade_required | 426 | PWA version below the minimum supported version; sync the outbox, then update (section 17) |
| server | server.unavailable | 503 | maintenance or dependency down, with `Retry-After` |
| server | server.busy | 503 | a list, statistics or profile query ran over its 5-second limit; try a narrower filter (O-67) |
| server | server.internal | 500 | unexpected; message never contains stack traces or SQL (BR-210) |

Mapping of codes written in earlier documents (same meaning, normalized here): `session_revoked` → `auth.session_revoked`; `token_stale` → `auth.token_stale`; `account_blocked` → `auth.account_blocked`; `locked_on_server` → `conflict.locked_on_server`; `deadline_passed` → `sync.deadline_passed`; `limit_exceeded` → `sync.limit_exceeded`; `project_closed` → `sync.project_closed`; `not_permitted` → `sync.not_permitted`; `retry_exhausted` → `sync.retry_exhausted`; `beneficiary_mobile_is_volunteer_mobile` → `beneficiary.mobile_is_volunteer_mobile`; `file.type_not_allowed`, `file.too_large`, `file.source_not_allowed` unchanged.

New codes are added to this table in the same commit as the endpoint that raises them; the i18n catalogue must contain `errors.<code>` in bn and en (CI check).

## 9. Idempotency

There is no generic idempotency-key table; idempotency rides on keys the data model already enforces as unique (DATABASE_SCHEMA §18):

| Operation | Key | Replay behaviour |
|---|---|---|
| Create endpoints for offline-capable records (applications, activities, classes, expense claims, issues, vouchers, follow-ups, stock movements) | `clientUuid` in the body (unique column) | the existing record is returned with 200 and `Idempotent-Replay: true` |
| `POST /sync/batch` and bulk-update endpoints | `Idempotency-Key` header (stored in `sync_batches.idempotency_key` with the per-record results) | stored results returned unchanged |
| Payment records | `clientUuid` plus the unique `transactionId` | a different body with a used `transactionId` → 409 `payment.transaction_id_exists` |
| File finalize | `clientUuid` + slot | existing file returned |
| Public application form | `clientUuid` generated by the page | repeated submissions return the first result (O-08) |
| Donor messages and notifications | outbox `idempotency_key` (NOTIFICATIONS §7) | never sent twice |

The PWA uses the same create endpoint online and offline (OFFLINE_SYNC §3), so every create carries a `clientUuid`.

Implementation (T1.6, O-57): `IdempotencyService` in apps/api: `replayByClientUuid` for the clientUuid mode and `runWithKey` for the header mode on `sync_batches`; there is no generic idempotency-key table.

## 10. Rate limiting

| Class (`x-rate-limit`) | Limit | Key |
|---|---|---|
| probe | none: the health probes only, so a busy client can never make the API look down to the proxy; readiness reuses a finished result for 2 seconds instead | none |
| login | 10 per minute, 100 per hour | login id and IP |
| otp-request | 5 per hour per number or address; 20 per hour per IP (O-25) | address, IP |
| otp-verify | 5 attempts per code (O-25); 20 per hour per IP (D-075) | code, IP |
| password-reset | 5 per hour per login id (normalized spelling); 20 per hour per IP (D-075) | login id, IP |
| refresh | 60 per hour | device session |
| public-form | 20 per hour per route (O-08, NFR-41): the public form read, the public submission and the public photo upload each have their own budget per address | IP |
| registration | 10 registrations started per IP per day, plus the `otp-request` windows (D-082) | IP, address |
| reference-read | 300 per hour (public reference data, D-083) | IP |
| default | 600 per minute per user (PROPOSAL, tuned by the load test T3.4) | user |
| list | 60 per minute per user and 600 per minute per address; each read stops after 5 seconds with `server.busy` (O-67) | user, IP |
| sync | 60 batches per minute per device session (PROPOSAL) | device session |
| upload | 600 parts per hour per user (a photo of 1.6 MB is 7 parts; D-108) | user |
| lookup | the beneficiary lookup by NID or birth registration: 60 per minute and 600 per day per user, and 120 per minute per address; every lookup is audited without the number (D-114) | user, IP |
| export | 30 export requests per hour per user; each reads up to 100,000 rows in the worker (D-143) | user |
| file-download | 120 photo downloads per hour per user; each carries the photo's place and is audited (D-181) | user |

Responses include `RateLimit-Limit`, `RateLimit-Remaining`, `RateLimit-Reset`; a 429 carries `Retry-After`, which the PWA honours (O-29). Limits are enforced in the API (not only in Caddy) so they apply per account.

## 11. Authentication headers and token refresh

- `Authorization: Bearer <access token>` on every authenticated request (15-minute JWT, AUTH.md §5).
- Refresh only at `POST /api/v1/auth/refresh`, using the HttpOnly, Secure, SameSite=Strict refresh cookie scoped to that path **and** an `X-CSRF-Token` header that must match the double-submit cookie; the response returns a new access token and rotates the refresh cookie.
- Cookie names (D-070): `css_refresh` (HttpOnly, path `/api/v1/auth/refresh`; value = device session id, a dot and 256 random bits) and `css_csrf` (readable, path `/`, value = nonce and HMAC bound to the session). Login and refresh set both; logout and a dead refresh clear both. A locked login (423) carries `Retry-After` with the seconds until the lock ends.
- Client behaviour on 401: `auth.token_expired` or `auth.token_stale` → refresh once and retry; `auth.session_revoked` → wipe and show login; `auth.refresh_invalid` → keep the outbox, show login (O-29); any other 401 → login.
- `X-Client-Version: <pwa version>` on every request (section 17); `X-Device-Session` is not needed because the session id is inside the token.
- Public endpoints (login, OTP, registration, public form, health) are declared `x-permission: public` and listed in SECURITY_POLICY.

## 12. Files, streamed through the API

- File bytes never travel through JSON endpoints. Uploads use upload sessions (FILES_AND_DOCUMENTS §4): `POST /upload-sessions` (declares kind, record, slot, mime, size, sha256, capture metadata, clientUuid) → `PUT /upload-sessions/{id}/parts/{n}` with raw bytes (256 KB parts, O-29) → `GET /upload-sessions/{id}` for resume → `POST /upload-sessions/{id}/finalize` (D-108).
- Downloads: `GET /files/{fileId}/content` (with `variant` for thumbnails) streams the bytes after the permission, scope and field-class checks, with `no-store` and `nosniff`; no URL to an object is ever issued (D-074, D-108); quarantined files return 423 `file.quarantined` and infected ones 410 `file.infected` (O-30).
- Records reference files by id in the slot fields (`photoFileIds`, `voucherFileId`); clients fetch the content route by id when they display a file, thumbnails included.

## 13. Bulk-update pattern

Used by the today's screens (distribution, class, construction, visit, follow-up; WORKFLOW_ENGINE §8):

```
POST /api/v1/projects/{projectId}/bulk/{screen}      screen = distribution | class | construction | visit | followup
Idempotency-Key: <uuid>
{ "rows": [ { "clientUuid": "…", "applicationId": "…", "outcome": "distributed", "photoSlots": ["…"], "comment": "…" }, … ] }   (≤ 50 rows)

200 { "data": { "results": [ { "clientUuid": "…", "result": "done" | "failed" | "pending_photos", "code": "workflow.guard.photos_required_per_rule", "status": "implementation", "stage": "distributed" } ] } }
```

- Each row is processed independently through the same application service, guards, effects and audit as a single action; one failed row never rolls back the others (one savepoint per row inside the batch's transaction).
- The review screen uses the same pattern for the common cycle: `POST /api/v1/projects/{projectId}/bulk/review` with `{ "action": "review" | "approve", "rows": [ { "clientUuid", "applicationId", "ifMatch" } ] }`; `ifMatch` is the row's `etag` from the list, so a row that changed since the list was read fails with `conflict.stale_version` while the others pass. The request is refused as a whole (403) when the caller holds no permission for the action at all, and (422) when the Idempotency-Key was used by someone else or with another request.
- Permission is checked per row against the row's record and scope; `x-permission` on the endpoint names the screen's permission (e.g. `distribution.update`, `class.record`, `progress.update`, `site_verification.record`, `followup.record`).
- The same payload shape is accepted inside `/sync/batch` for offline saves.

## 14. Export job pattern

```
GET  /api/v1/exports/columns?list=applications&projectId=…  → the columns the caller may export
POST /api/v1/exports            { "kind": "applications", "format": "xlsx" | "csv" | "pdf",
                                  "columns": ["app_no", "status", "q:monthly_income"],
                                  "filters": { … }, "projectId": "…" }
202 { "data": { "id": "…", "status": "queued", "rowsTotal": 1200, "rowsDone": 0, … } }
GET  /api/v1/exports            → the caller's own jobs of the last 30 days
GET  /api/v1/exports/{jobId}    → { status: queued | running | done | failed, rowsDone, rowsTotal, rowCount, fileId, errorCode }
GET  /api/v1/files/{fileId}/content → the file, streamed after the checks (D-074)
```

- The request needs `export.list` and the list's own read permission. It freezes the list's query (the list service's own `where` and order, inside the caller's scope of that moment) with the field classes the export may carry; the job replays exactly that query and never reads the caller's access again (D-143).
- Refused before any job exists: an unknown column (422), a column of a class the caller may not export (403), a project out of the caller's reach (404), more than 100,000 rows or, for a PDF, 1,000 rows (422 `export.too_many_rows`, `export.pdf_too_many_rows`), and a fourth waiting or running export of the caller (409 `export.running_limit`; a job older than 30 minutes no longer counts).
- The job writes in batches of 1,000 rows, never more than the limit even when rows were added after the count, and updates `rowsDone` after each batch. It streams the file into the `exports` bucket, then writes the `files` row (kind `export`, source `system`, scan `clean`) and `done` in one transaction. A failed attempt removes its partial object and is retried; only the last attempt writes `failed` with a fixed code (`export.failed`, `export.pdf_unavailable`, `export.pdf_failed`).

- The export runs in the worker (ADR-004) with the requester's permissions, scope and field masks frozen at request time (RBAC.md §8).
- Kinds that include identity, bank, donor or official-section fields require the matching `export.*` permission, set `sensitive = true` and write an audit entry with filters and row count (BR-224, BR-179).
- The file streams from `GET /files/{fileId}/content` to its requester alone, as an attachment, and only while their account is active and their live access still holds `export.list` and, for a sensitive file, the export permissions of its protected classes, while they still see every protected class its columns or its record hold, and while the list's scope of now reaches every record its frozen query selects (a record's PDF: that record) (D-179); anyone else gets 404. Each download of a sensitive file writes `file.download_sensitive`.
- A daily sweep on the `exports` queue deletes files after 30 days (the object first, then the file row marked deleted); the job row and the audit entry remain (O-30), and the requester's download of an expired file answers 410 `export.expired`. The same sweep fails a job waiting or running for more than 30 minutes with `export.timed_out` and removes what its attempts left.
- The requester gets an in-app notification when the job is done (`export_ready`) or failed (`export_failed`).

## 15. Audit requirements per endpoint

- Every write endpoint declares `x-audit: <action>` (e.g. `application.approve`, `permission_change`, `blocklist.set`); the application service writes the entry in the same transaction (BR-179).
- Always audited (constitution §13): permission and role changes, approvals and rejections, field unlock, blocklist, transfer, handover, merge and revert, payments and expense verification, animal allocation, nisab changes, deletions (soft), template changes, document deadline extensions, deficiency reports, media consent, exports of sensitive data, sensitive file URL issuance (NID photos, register documents).
- Read endpoints declare `x-audit: none` unless they expose a sensitive class in bulk.
- Audit entries carry the `requestId`, actor, on-behalf-of user (jobs, sync), device session and client_uuid where applicable (DATABASE_SCHEMA §17 audit_log).

## 16. OpenAPI annotations required on every operation

| Annotation | Content | Checked by |
|---|---|---|
| `operationId` | `<module>.<resource>.<action>`, e.g. `applications.application.approve` | lint |
| `tags` | the API module (its router) | lint |
| `summary`, `description` | one line and the behaviour, including scope rules | review |
| `x-permission` | a name from `permissions.yaml`, or one of four markers: `public` (no authentication; the operation sets `security: []`), `authenticated` (any active user, own data or non-sensitive reference data only), `workflow` (the permission is taken from the project's workflow snapshot: the transition's `permission` for actions and state-dependent edits, the activity binding's `permission` for activities; requires `x-workflow`), `entity` (file endpoints: the read permission of the file's linked entity plus its field class) | boot check and CI (unknown names fail) |
| `x-scope` | entity type whose scope is resolved (`project`, `application`, `beneficiary`, `self`, …) | lint |
| `x-audit` | audit action or `none` | lint |
| `x-idempotency` | `none`, `clientUuid` or `header` | lint |
| `x-rate-limit` | class from section 10 | lint |
| `x-sensitive-fields` | sensitive field classes the response may include for permitted roles (`beneficiary.nid`, `volunteer.bank`, …) | review, serializer mask test |
| `x-workflow` | for action endpoints: the transition scope and action | lint |
| `requestBody`, `parameters` | generated from the zod schemas of `packages/shared` | drift test |
| `responses` | success schema plus every error response the operation can return, referencing shared components (`#/components/responses/Error422`, …) | drift test |
| `security` | `bearerAuth` or none for public | lint |

The generated document from the code must match `docs/api/openapi.yaml`; CI fails on any difference (NFR-54). An operation missing any required annotation fails lint.

Implementation (T1.6): handlers declare `@ApiContract({...})`; `apps/api/test/api/openapi-drift.test.ts` compares every implemented operation with this contract (annotations, known permission names, security, parameters, request body schema, response codes). Operations of the contract that are not implemented yet are allowed.

## 17. Breaking changes

A change is **breaking** when an existing client could fail or misbehave: removing or renaming an endpoint, field, parameter or error code; changing a type, format or meaning; making an optional request field required; narrowing accepted values of a fixed code list; changing authorization so that a previously allowed call is denied (except security fixes, which follow SECURITY_POLICY); changing pagination or envelope shape.

Process (constitution §2, §15):
1. Impact analysis: database, API, UI, offline clients, security, tests, migration, deployment.
2. Owner approval recorded in DECISION_LOG before implementation.
3. OpenAPI updated in the same change; migration with `down.sql` if the schema changes.
4. Client compatibility: offline phones may run an older PWA for days. Every request sends `X-Client-Version`; the server keeps accepting the previous contract until the minimum supported version (a setting) is raised after all active device sessions report the new version; requests from versions below the minimum get 426 `client.upgrade_required` and the PWA prompts an update after syncing its outbox.
5. Tests: contract tests for both versions during the window; E2E with an old-client fixture.
6. Release notes in the phase gate documents.

## 18. Endpoint checklist (for every new endpoint)

- [ ] Path, method and action name follow sections 1–2; no personal data in the URL.
- [ ] zod request and response schemas in `packages/shared`.
- [ ] `x-permission`, `x-scope`, `x-audit`, `x-idempotency`, `x-rate-limit`, `x-sensitive-fields` set.
- [ ] Scope filter in the repository and object-level check for single-record routes (404 outside scope).
- [ ] Field-level masks applied; the same masks in exports.
- [ ] Errors from the catalogue; new codes added to section 8 and to the i18n catalogue in bn and en.
- [ ] `If-Match` on mutating record endpoints; `clientUuid` on offline-capable creates.
- [ ] Audit entry written in the transaction where required.
- [ ] OpenAPI updated; drift test green; authorization-matrix test regenerated.
- [ ] Tests: unit, API (allow and deny per role/scope), and E2E where the journey is critical.
