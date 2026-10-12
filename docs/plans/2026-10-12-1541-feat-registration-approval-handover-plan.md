---
title: Staff and volunteer registration, approval, correction, blocklist and handover (T1.9)
type: feat
status: in-progress
source: brainstorm
date: 2026-10-12
doc_review: 2026-10-12
---

# Staff and volunteer registration, approval, correction, blocklist and handover (T1.9)

## Goal
A volunteer or a staff member registers on a phone with two verified OTPs and a form, waits in a pending state with only their own profile, and an authorized official approves the registration or asks for corrections to single fields. After approval a volunteer changes data only through an approved edit request, an RPM or a higher official can blocklist a volunteer with a reason, and an official's account is deactivated only after a recorded handover of their pending work.

## Problem
Today accounts exist only in the seed: nobody can join the system, and the approval, blocklist and handover rules of the blueprint (A5, BD-06, BD-08, BD-44) are not enforced. Phase 1's gate needs real people to register and be approved, and every later module (applications, projects, documents) assumes approved volunteers and staff with recorded handovers.

## Requirements

### Registration
- **R1** A visitor enters a mobile number and an email, receives one OTP on each channel and enters them as two separate steps on the screen (the API verifies both codes together, AUTH.md 2; the fixed dummy code in development and test, BD-44, BD-49), and the registration form opens only after both codes are verified; the OTP limits and the 24-hour resume of AUTH.md 2 and O-25 apply. A mobile or email that already belongs to an account is reported only after both codes are verified ("log in instead"), so nobody learns which numbers are registered without owning them.
- **R2** The volunteer form captures the BR-026 fields: name, father's name, mother's name, NID, WhatsApp, address with cascading division → district → upazila → union, education, experience, work description, previous projects, Facebook id, optional bank details, volunteer type (general, local দায়ী, both, team member, paid; BR-033), a password, a photo and an NID photo; it is a static form on the `packages/ui` form primitives, works at 360 px and in Bangla and English.
- **R3** A team member gives the main volunteer's NID as reference; once both OTPs are verified the form shows that volunteer's full name when the NID matches an active volunteer, only a few lookups are allowed per registration, and every lookup is audited.
- **R4** The photo and the NID photo are uploaded as images (JPEG or PNG, size-limited, compressed on the phone), kept in a private bucket through the existing storage adapter, and shown only through the API: the NID photo only to roles that may see volunteer identity data.
- **R5** The staff form (MASTER_SPEC A5) captures name, photo, the verified mobile and email, designation, program and region (division), and a password; it does not ask for NID, parents' names or bank details.
- **R6** Submitting creates the account in the `pending` state; a pending user can log in and sees only their own profile with the message that they have not joined any project yet (BR-031) and any open correction request; every other endpoint answers `auth.account_pending`.

### Approval and correction
- **R19** An approver's scope for a pending volunteer follows the volunteer's address: the RPM and the Project Executive reach the registrations whose address lies in their region (division, or district when the region is split), a PM those in the divisions where the PM's program has project areas, and the Department Head and Monitoring Team all of them.
- **R7** An approver sees the pending registrations inside their scope on a "নিবন্ধন" page in the admin area; approvers of volunteers are the Project Executive, RPM, PM, Monitoring Team and Department Head (Q-19, BR-029); the admin area opens for the RPM and the Project Executive for this page.
- **R8** An approver approves a volunteer registration (the account becomes `active`), rejects it with a reason (the account becomes `deactivated`), or sends a correction request that names one or more fields with a note; only the named fields reopen, the volunteer fixes them and presses resubmit, and the registration returns to the approvers (BR-030).
- **R9** A staff registration is approved by the Department Head or the Monitoring Team, who assign the role at approval (BR-028); other officials cannot approve staff.

### Profile after approval
- **R10** After approval a volunteer cannot edit their profile directly: they submit an edit request with the new value of a field, an RPM or Project Executive approves that value (it applies at once) or refuses it with a reason (BR-031 as amended by the owner, 2026-10-12); every step is audited.
- **R18** A volunteer may also change the mobile number or email through an edit request: a code goes to the new number or address first, the request reaches the approver only after the code is verified, the change applies on approval, and the new value must not belong to another account; the change revokes the volunteer's other sessions.
- **R11** A volunteer sees their own NID and bank details in full on their own profile; every other volunteer-facing response keeps them out, and officials see them only through the roles of the `volunteer.identity` and `volunteer.bank` classes.

### Volunteer blocklist
- **R12** An RPM, PM, Monitoring Team member or the Department Head blocklists a volunteer inside their scope with a mandatory reason and lifts the block with a mandatory reason (BD-06, BR-047); while blocked the volunteer cannot log in beyond the block message, gets no new applications or assignments, and loses sight of their own applications as those modules arrive.

### Staff handover
- **R13** The Department Head or the Monitoring Team marks an official "to be deactivated" and sees the official's pending work by category (reviews and approvals, projects of their district or region, documents in their name, issues, follow-ups); categories whose modules do not exist yet come from a provider interface that returns no items until those modules plug in.
- **R14** Each pending item is reassigned to a chosen official, or all items to one official in one action; the handover record is kept, and only a completed handover allows the deactivation (BR-034, BD-08), after which the account cannot log in and its history stays intact.

### Across the task
- **R15** Every registration, OTP step, reference lookup, approval, rejection, correction, edit request, blocklist change and handover step writes an audit entry (BR-032).
- **R16** Each of those events calls a notification hook that T1.14 will deliver; no message is sent in T1.9.
- **R20** A registration that was started but not submitted within 24 hours is deleted together with its uploaded photos by a daily job; submitted and rejected registrations stay (BD-46).
- **R21** A person whose registration was rejected may register again with the same mobile and email; the new registration reuses the rejected account, which returns to `pending`, and the audit log keeps the earlier values.
- **R17** `docs/api/openapi.yaml` describes every operation built here, and the tests cover unit rules, the API with a positive and a negative case per role, and an E2E journey on a phone from registration to approval.

## Scope
- In: the registration API and screens for volunteers and staff, the small photo upload for registration, the pending list and the approval, rejection and correction actions on an admin page, edit requests, the volunteer blocklist API and its action on that page, the handover API and screen, audit and notification hooks, contract and documentation updates.
- Out (not now): the volunteer tab with its nationwide list, filters (including the blocklist filter) and statistics (T1.10); the beneficiary blocklist (T2.2); notification delivery (T1.14); the full file service with resumable uploads and the virus-scan hook (T2.1, which extends the small upload); real SMS and email gateways (before production); project assignment of volunteers (T1.12); application transfer (T2.6); the 90-day auto-deactivation job for unapproved registrations (O-25, a later job task); encryption of NID and bank columns at rest (the volume and database encryption is part of the deployment, T3.0).

## Key decisions
- **Volunteer blocklist by RPM and above** (owner, 2026-10-12): BD-06 and BR-047 stay; D-080 (only the Department Head blocks or unblocks an account through the account-state change) keeps governing staff accounts. Governs R12.
- **A small photo upload now** (owner, 2026-10-12): images only, size-limited, private bucket through the existing storage adapter, viewed through the API; T2.1 extends the same part instead of replacing it. Governs R4.
- **Staff form per MASTER_SPEC A5** (owner, 2026-10-12): no staff NID, parents' names or bank details, so no new table. Governs R5.
- **Approval page in the admin area, open to RPM and Project Executive** (owner, 2026-10-12): the T1.10 volunteer tab takes the page over later. Governs R7.
- **Reference NID shows the full name only after both OTPs, with a lookup limit and audit** (owner, 2026-10-12). Governs R3.
- **Volunteers see their own NID and bank details in full on their own profile** (owner, 2026-10-12): an exception to the `sensitive_fields` rule "never to volunteers" for the own record only; to be recorded in DECISION_LOG before implementation. Governs R11.
- **Approver scope by the volunteer's address** (owner, 2026-10-12): a new volunteer is on no project yet, so REGION and PROGRAM scopes reach pending volunteers through their address division. Governs R19.
- **Mobile and email changeable now through an edit request with OTP** (owner, 2026-10-12): the login id changes only after a code to the new value is verified. Governs R18.
- **Approvers per Q-19** (approved earlier): Project Executive, RPM, PM, Monitoring Team, Department Head for volunteers; Department Head and Monitoring Team for staff (BR-028). Governs R7, R9.
- **An edit request carries the new value** (owner, 2026-10-12): the approver approves the value itself, which applies at once; this amends the BR-031 wording "the field is opened, changed and locked again". Governs R10, R18.
- **Existing accounts are reported only after both codes** (owner, 2026-10-12): no enumeration of registered numbers before verification. Governs R1.
- **Unsubmitted registrations are deleted after 24 hours** (owner, 2026-10-12): drafts and their photos never became records; BD-46 keeps everything submitted. Governs R20.
- **A rejected registrant may register again** (owner, 2026-10-12): the rejected, never-approved account is reused, because mobile, email and NID are unique. Governs R21.
- **Static form now** (task prompt): the dynamic form engine comes in Phase 2; this form uses the `packages/ui` primitives. Governs R2, R5.

## Technical decisions
- **Stack profile unchanged** (`CLAUDE.md` "Stack profile", ST-43): Express 5, Prisma 7 on PostgreSQL 17, the storage adapter with the S3 driver on MinIO, TanStack Query and `packages/ui` on the web; nothing is added. The photos use the existing storage adapter (ST-05, D-074: private bucket, streamed by the API, no signed URLs).
- **Contract first** (CONTRIBUTING "How to add an endpoint", D-076): `docs/api/openapi.yaml` changes before code; the drift test and the authorization matrix (`pnpm --filter @css/api authz:matrix`) cover every new route. Request and response schemas live in `packages/shared/src/registration/` and are used by both apps (ST-07, RE-CMP-04).
- **Decisions logged before code** (CLAUDE.md "Decisions"): the own-record exception of R11, the `registration_drafts` table, public locations, the approver scope by address (R19), contact changes with OTP (R18), the edit request carrying the value (R10, amending BR-031), the deletion of unsubmitted drafts (R20), the reuse of a rejected account (R21) and the contract additions go into `docs/DECISION_LOG.md` in U1 as proposed; the owner confirms them with the "Start implementation" answer.
- **Registration draft** (AUTH.md 2, O-25): a new table `registration_drafts` (id, kind, mobile, email, token_hash, verified_at, expires_at, reference_lookups, photo_file_id, nid_photo_file_id, submitted_user_id, audit columns) holds the state between `start` and `submit`; the OTPs stay in `otp_codes` with purpose `registration`; a verified draft lives 24 hours and is refused afterwards, and a daily pg-boss job deletes expired unsubmitted drafts with their files (R20). The OTP purpose list gets `contact_change` for R18, and `file_links.entity_type` gets `user` for the staff photo. Hand-written `down.sql` (ADR-003).
- **Draft ownership** (NE-SEC-03): `verify` issues a random draft token, stores only its hash and returns it once; the web keeps it in memory and sends it in the `X-Registration-Token` header (never in a URL or a log, NE-CFG-03); lookup, photo upload, resume and submit refuse a draft without its token or with another draft's token. Resume re-verifies the mobile code and issues a new token.
- **Existing accounts after verification** (R1): `start` always sends the codes; `verify` answers `registration.account_exists` when the mobile or email belongs to an active, pending or blocked account, and treats a rejected, never-approved account as free (R21).
- **Rate limits** (NE-SEC-04): a new class `registration` caps draft starts at 10 per IP per day besides the `otp-request` window; reference lookups are capped at 5 per draft, 20 per IP per day and 5 per NID per day; a new class `reference-read` (300 per IP per hour) serves `GET /locations`; uploads use `public-form` plus one replacement per slot per minute.
- **Public reads for the form**: `GET /locations` becomes `public` (reference data with no personal data, rate class `reference-read`) so the cascading address works before login; the reference lookup `POST /auth/register/reference-lookup` needs a verified draft and its token, counts lookups on the draft, audits each (`auth.reference_lookup`, NID hashed in the entry) and answers only the name of an active volunteer.
- **Photo upload** (R4; storage.md, NE-REQ-02, NE-SEC-07): `POST /auth/register/photos/{slot}` (slot `photo` or `nid_photo`) takes a raw JPEG or PNG body of at most 2 MB on that route only, checks the magic bytes, strips location and other metadata (JPEG APP1 segments, PNG text and eXIf chunks; no new dependency, ST-30), stores the object in the `profiles` bucket under a server-chosen key, then writes a `files` row (`kind` `profile_photo` or `nid_photo`, `source` `camera` or `gallery` as the client says, sha256, size, `virus_scan = pending` until T2.1) and removes the object when the row fails (NS-06), and links it to the draft; a new upload to a slot deletes the slot's previous object and row. The same route serves an authenticated volunteer whose correction or edit request names a photo field. `GET /files/{fileId}/content` streams a photo (the contract's `GET /files/{fileId}` metadata and `/url` operations stay for T2.1) with `Cache-Control: no-store` and `X-Content-Type-Options: nosniff` to its owner, to officials who reach the volunteer, and the NID photo only to roles of the `volunteer.identity` class; everyone else gets 404.
- **Submit by kind**: the request schema is a union on the draft's kind (volunteer: the BR-026 fields; staff: name, designation, program, region), replacing the single schema of the contract; one transaction creates the `users` row (state `pending`) and the `volunteers` row or the staff fields (or, for R21, returns a rejected, never-approved account to `pending` with the new values), links the photos (`file_links` with entity `user` for the staff photo) and writes `auth.registered`.
- **Approver scope filter** (R19, RBAC.md 4): a new `volunteerWhere(scope)` in `apps/api/src/access/scope.ts` reaches volunteers whose division, district, upazila or union is one of the caller's area locations, plus for PROGRAM the area locations of the program's projects; it serves the pending list, the approval actions, the edit-request decisions and the blocklist (404 outside, like `userWhere`).
- **Change requests** (BR-030, BR-031 as amended): `volunteer_change_requests` rows, one per field. A correction request takes `fields[]` and one note and opens one `registration_correction` row per field in one transaction; the volunteer answers each row, then `POST /me/registration/resubmit` returns the registration to the approvers (refused while a row is open); the pending list shows registrations awaiting review by default and those in correction under a filter. A `profile_edit` request carries the new value and is approved (applied at once) or refused by an RPM or Project Executive. Mobile and email requests first need the `contact_change` OTP on the new value; applying them revokes the volunteer's other sessions and bumps the permission version. The editable field keys and their value formats live in `packages/shared/src/registration/` (text fields as strings; the address and the bank details as zod-checked objects; photos as a file id from the upload).
- **Sensitive data** (NE-LOG-02, RBAC.md 6): the log redaction list gains the bank, registration-token and reference-NID keys (with a test); audit entries of NID, bank, mobile and email changes record the field name and who changed it, not the values; the approvers of R19 (PM, RPM, Project Executive and the global roles) are exactly the `volunteer.identity` roles, so they see the NID number and the NID photo of registrations in their scope, while the bank details stay with the `volunteer.bank` roles; NID and bank columns are not encrypted at rest in T1.9 (scope).
- **Volunteer blocklist** (BD-06, BR-047): `POST /volunteers/{id}/block` and `/unblock` write `blocklist`; the existing `sync_blocklist_flags` trigger moves an active volunteer's account to `blocked` and back and bumps the permission version; the service also revokes the sessions. A blocklisted pending registration cannot be approved (409). D-080 keeps applying only to the account-state endpoint.
- **Handover contract** (BR-034): `GET /users/{id}/handover` lists the pending items by category; the first `POST /users/{id}/handover` writes `auth.handover_started` (this is the "to be deactivated" mark); `POST /users/{id}/handover/complete` only completes the handover (the contract summary changes); `program` joins the item types of `docs/database/json-schemas/handover-scope.schema.json`. The target must be an active official whose role fits the item (a PM for a program, an RPM for an area) and not the person handed over; every item id must come from `list(sourceUserId)` inside the transaction; both users' permission versions are bumped.
- **Handover providers** (BR-034, BD-08): a `HandoverProvider` interface (`list(userId)`, `reassign(itemIds, toUserId, tx)`) with real providers for programs (`programs.pm_user_id`), project areas (`project_areas.rpm_user_id`) and project staff rows, and empty providers for reviews and approvals, documents, issues and follow-ups that later modules replace; the handover record keeps every reassignment in `handovers.scope`; deactivation stays the existing state change, which already needs a completed handover.
- **Notification hooks** (R16): a `RegistrationEvents` interface in `apps/api/src/notifications/` with a logging implementation; T1.14 plugs delivery in.
- **Web**: `/register` (public, mobile-first; the two codes are two screens although the API verifies both together, AUTH.md 2), `/account/profile` (own profile, corrections, edit requests), admin pages `/admin/registrations` and `/admin/handover`; the admin audience grows by the RPM and the Project Executive, and each admin destination lists its roles in `apps/web/src/admin/navigation.ts`. Bengali copy follows `ae-bangla-copy`.
- **E2E data**: the registration specs generate a unique fake mobile and email per run (`packages/shared/src/testing`), and the handover spec uses a dedicated demo official added to the demo seed, so reruns and other specs are unaffected.

## Implementation units
### U1. Decisions and contract
- **Goal:** The decision log, the API contract and the database documentation describe everything this task adds before any code.
- **Requirements:** R11, R17, R18, R19 (documentation side)
- **Files:** `docs/DECISION_LOG.md`, `docs/api/openapi.yaml`, `docs/api/API_STANDARDS.md`, `docs/database/DATABASE_SCHEMA.md`, `docs/database/json-schemas/handover-scope.schema.json`, `docs/architecture/AUTH.md` (section 2: token, photos, lookup, existing accounts), `docs/security/RBAC.md` (volunteer scope by address, own-record exception), `docs/BUSINESS_RULES.md` (BR-031 amended)
- **Approach:** like the D-079 entry and its contract edit in U5 of `docs/plans/2026-10-12-1100-feat-rbac-permission-panel-plan.md`; new operations: reference lookup, photo upload, `GET /files/{fileId}/content`, `POST /me/registration/resubmit`, contact-change OTP send and verify on `/me/change-requests/{id}`; changed: `/locations` public, `RegistrationSubmitRequest` by kind, `OtpVerifyRequest` answer with the draft token, `ChangeRequestCreate` with `fields[]` for corrections and a typed `newValue` for edits, `/registrations` with `kind` and `status` filters, the handover `GET` with items by category and `complete` without deactivation, the handover-scope JSON Schema with `program`; new error code `registration.account_exists` in API_STANDARDS 8 and the catalogue.
- **Tests:**
  - existing: `pnpm docs:check` and `apps/api/test/api/openapi-drift.test.ts` stay green
- **Done when:** `pnpm docs:check` passes and the new entries are marked proposed.
- **Depends on:** none
- **Size:** M
- **Risk area:** none
- **Status:** done

### U2. Registration drafts and the contact-change OTP purpose
- **Goal:** The database keeps registration drafts, accepts OTPs for contact changes, and links a staff photo to a user.
- **Requirements:** R1, R5, R18, R20
- **Files:** `apps/api/prisma/schema.prisma`, `apps/api/prisma/migrations/20261012000000_registration_drafts/migration.sql`, `apps/api/prisma/migrations/20261012000000_registration_drafts/down.sql`, `apps/api/prisma/sql/roles.sql`, `apps/api/test/integration/migrations.test.ts`, `apps/api/test/integration/constraints.test.ts`, `docs/database/DATABASE_SCHEMA.md`
- **Approach:** follow `apps/api/prisma/migrations/20261011000000_init/` (hand-written CHECKs, foreign-key indexes, DB-MIG-07) and the round-trip test in `apps/api/test/integration/migrations.test.ts`.
- **Tests:**
  - integration: the migration applies and `down.sql` restores the previous schema (round trip); a draft with an unknown kind or a bad mobile is refused by CHECKs; `otp_codes` accepts `contact_change` and still refuses an unknown purpose; `file_links` accepts the entity `user`
  - existing: covered by `apps/api/test/integration/migrations.test.ts`
- **Done when:** the round trip passes and Prisma reports no drift.
- **Depends on:** U1
- **Size:** M
- **Risk area:** migration
- **Status:** done

### U3. Public locations list
- **Goal:** The registration form loads divisions, districts, upazilas and unions without a login.
- **Requirements:** R2
- **Files:** `apps/api/src/routes/locations.ts`, `apps/api/src/services/locations.ts`, `apps/api/src/app.ts`, `apps/api/src/container.ts`, `apps/api/src/rate-limit/rate-limit.ts`, `apps/api/src/openapi/registry.ts`, `docs/api/openapi.yaml` (422 on the list), `docs/security/AUTHORIZATION_MATRIX.md`, `apps/api/test/integration/locations-api.test.ts`
- **Approach:** a `defineRoute` list like `apps/api/src/routes/users.ts` (permission `public`, the new rate class `reference-read`), children of `parentId`, active only, bilingual names.
- **Tests:**
  - integration: divisions without `parentId`; districts of a division; an unknown parent gives an empty list; inactive locations stay out; a full cascade of four calls stays far below the limit, and the limit answers 429 after 300 calls per hour
- **Done when:** the test passes and the drift test lists the route.
- **Depends on:** U1
- **Size:** S
- **Risk area:** none
- **Status:** done

### U4. Registration start, OTPs, resume and reference lookup
- **Goal:** A visitor verifies the mobile and the email with two codes and can resume within 24 hours, and a team member sees the main volunteer's name.
- **Requirements:** R1, R3, R15, R16, R20, R21
- **Files:** `apps/api/src/routes/auth.ts`, `apps/api/src/services/registration.ts`, `apps/api/src/notifications/registration-events.ts`, `apps/api/src/jobs/registration-cleanup.ts`, `apps/api/src/jobs/consumers.ts`, `apps/api/src/jobs/job-runner.ts`, `apps/api/src/server.ts`, `apps/api/src/worker.ts`, `apps/api/src/container.ts`, `apps/api/src/auth/otp.service.ts`, `apps/api/src/rate-limit/rate-limit.ts`, `apps/api/src/core/logging.ts`, `packages/shared/src/registration/index.ts`, `packages/shared/package.json`, the `errors` catalogues, `docs/api/openapi.yaml`, `docs/security/AUTHORIZATION_MATRIX.md`, `docs/security/SECURITY_POLICY.md`, `apps/api/test/integration/registration-start.test.ts`, `apps/api/test/integration/support/auth-app.ts`
- **Approach:** copy the password-reset flow in `apps/api/src/services/auth.ts` (`resetStart`, `resetComplete`) and `OtpService.issue/check/consume`; rate classes `otp-request` and `otp-verify`.
- **Tests:**
  - unit: draft expiry and the lookup counter
  - integration: start sends one code per channel (dummy mode) and answers the same for a registered mobile; verify with both right codes marks the draft verified and returns the token once; one wrong code fails with `otp.invalid` naming the channel and counts an attempt; verify for a registered mobile answers `registration.account_exists`, for a rejected never-approved one it succeeds; a resend within the hourly limit works, then 429; the eleventh start from one IP in a day gets 429; a draft older than 24 hours is refused; a lookup without the token, or with another draft's token, is refused; the lookup returns the name of an active volunteer, nothing for an unknown or blocked one, and stops after 5 lookups per draft and 5 per NID per day; the cleanup job deletes an expired unsubmitted draft and its file objects and keeps a submitted one; the log lines carry no token, NID or bank value; every step writes its audit entry and calls the hook
- **Done when:** the test passes with the dummy OTP.
- **Depends on:** U2
- **Size:** L
- **Risk area:** auth
- **Status:** done

### U5. Registration photos and the file stream
- **Goal:** A registrant uploads the photo and the NID photo, and only the owner and allowed officials can see them.
- **Requirements:** R4, R11
- **Files:** `apps/api/src/routes/files.ts`, `apps/api/src/routes/auth.ts`, `apps/api/src/services/registration-photos.ts`, `apps/api/src/services/files.ts`, `apps/api/src/files/images.ts`, `apps/api/src/files/photo-body.ts`, `apps/api/src/openapi/define-route.ts`, `apps/api/src/auth/require-access.ts`, `apps/api/src/access/scope.ts`, `apps/api/src/access/service.ts`, `apps/api/src/container.ts`, `apps/api/src/app.ts`, the U2 migration (function `discard_registration_photo`), `apps/api/prisma/sql/roles.sql`, `docs/api/openapi.yaml`, `docs/security/AUTHORIZATION_MATRIX.md`, `docs/database/DATABASE_SCHEMA.md`, `apps/api/test/integration/registration-photos.test.ts`, `apps/api/test/integration/support/registration.ts`, `apps/api/test/support/images.ts`
- **Approach:** the storage adapter in `apps/api/src/storage/` (`put`, `get`); there is no upload route yet, so this is a new pattern: raw body with a route-only limit, magic-byte check, server-chosen key.
- **Tests:**
  - unit: metadata stripping removes JPEG APP1 and PNG text chunks and keeps the image bytes
  - integration: a JPEG and a PNG up to 2 MB are stored and linked to the verified draft; a GIF, a renamed text file and a 3 MB file are refused (415, 413); an unverified or expired draft, a missing token and another draft's token are refused; a second upload to a slot deletes the first object and row; a failed `files` row removes the stored object; the owner streams the photo; an RPM reaching the volunteer streams the photo, a Finance Team member gets 404 for the NID photo, another volunteer gets 404 for both and cannot upload against the first volunteer's change request; the response carries `no-store` and `nosniff`
- **Done when:** the test passes on the filesystem driver.
- **Depends on:** U4
- **Size:** L
- **Risk area:** file storage
- **Status:** done

### U6. Submit and the pending account
- **Goal:** Submitting creates a pending volunteer or staff account that sees only its own profile.
- **Requirements:** R2, R5, R6, R11, R15, R16, R21
- **Files:** `apps/api/src/routes/auth.ts`, `apps/api/src/routes/volunteers.ts`, `apps/api/src/services/registration.ts`, `apps/api/src/services/volunteers.ts`, `apps/api/src/container.ts`, `apps/api/src/app.ts`, `apps/api/src/notifications/registration-events.ts`, `packages/shared/src/registration/index.ts` (and its test), the `errors` catalogues, `docs/api/openapi.yaml`, `docs/api/API_STANDARDS.md`, `docs/security/AUTHORIZATION_MATRIX.md`, `apps/api/test/integration/registration-submit.test.ts`
- **Approach:** the transaction and audit pattern of `UsersService.changeState` in `apps/api/src/services/users.ts`; password rules from `@css/shared/auth`; `allowPending` on the own-profile routes as in `apps/api/src/routes/me.ts`.
- **Tests:**
  - unit: the volunteer and staff schemas (required fields per kind, NID format, a team member needs a reference)
  - integration: a volunteer submit creates the pending user and the volunteer row with the photos; a staff submit stores designation, program and region and no volunteer row; a duplicate NID is refused; a submit after the draft expired, without the token or with another draft's token is refused; a rejected, never-approved account registers again and returns to pending with the old values in the audit log; the pending user logs in, reads `/volunteers/me` with the full NID and bank details and the "no project" flag, and gets `auth.account_pending` on `/users`; another volunteer reading the profile is refused
- **Done when:** the test passes.
- **Depends on:** U4, U5
- **Size:** L
- **Risk area:** personal data
- **Status:** done

### U7. Approval, rejection and correction requests
- **Goal:** Approvers in scope approve, reject or ask for field corrections, and the Department Head or Monitoring Team decides staff registrations with a role.
- **Requirements:** R7, R8, R9, R15, R16, R19
- **Files:** `apps/api/src/routes/registrations.ts`, `apps/api/src/services/registrations.ts`, `apps/api/src/services/registration.ts` (`addressProblem`), `apps/api/src/access/scope.ts`, `apps/api/src/access/scope.spec.ts`, `apps/api/src/container.ts`, `apps/api/src/app.ts`, `apps/api/src/notifications/registration-events.ts`, `packages/shared/src/registration/index.ts`, `docs/api/openapi.yaml`, `docs/security/AUTHORIZATION_MATRIX.md`, `apps/api/test/integration/registration-approval.test.ts`
- **Approach:** `userWhere` and `findUser` in `apps/api/src/access/` as the model for `volunteerWhere`; routes like `apps/api/src/routes/users.ts`; version bump through `PermissionVersionService.bump`.
- **Tests:**
  - unit: `volunteerWhere` for REGION, a split district, PROGRAM and GLOBAL
  - integration: the Dhaka RPM lists and approves a Dhaka registration and gets 404 for a Rangpur one; a PM approves only in a division of the program's projects; the Project Executive approves in region; a volunteer and the Finance Team get 403; reject needs a reason and deactivates; a correction request on two fields opens two rows in one call, the volunteer answers them and resubmits, resubmit is refused while a row is open, approval is refused before the resubmit and works afterwards; volunteer B answering or reading volunteer A's correction gets 404; the pending list hides registrations in correction unless filtered; a staff decision by the Monitoring Team assigns a role and activates; an RPM gets 403 on a staff decision; the Department Head role cannot be assigned through a decision; every action audits and calls the hook
- **Done when:** the test passes and the matrix report lists the routes.
- **Depends on:** U6
- **Size:** L
- **Risk area:** auth
- **Status:** done

### U8. Edit requests and contact changes
- **Goal:** An approved volunteer changes data only through an edit request whose new value an official approves, and mobile and email only after an OTP to the new value.
- **Requirements:** R10, R15, R16, R18
- **Files:** `apps/api/src/routes/registrations.ts`, `apps/api/src/services/change-requests.ts`, `apps/api/src/services/registrations.ts` (`applyField` exported), `apps/api/src/services/registration-photos.ts`, `apps/api/src/rate-limit/rate-limit.ts`, `apps/api/src/container.ts`, `apps/api/src/notifications/registration-events.ts`, `packages/shared/src/registration/index.ts` (and its test), `packages/shared/src/notifications/templates.ts` (`otp_contact_change`), the `errors` catalogues, `docs/api/openapi.yaml`, `docs/api/API_STANDARDS.md`, `docs/architecture/NOTIFICATIONS.md`, `docs/security/AUTHORIZATION_MATRIX.md`, `apps/api/src/auth/auth.spec.ts`, `apps/api/test/integration/seed.test.ts` (30 templates), `apps/api/test/integration/edit-requests.test.ts`
- **Approach:** the same change-request service as U7; the `contact_change` OTP through `OtpService`, like the password reset.
- **Tests:**
  - unit: the value format of each editable field key (text, address object, bank object, file id)
  - integration: a volunteer asks to change the address with the new value, the Dhaka RPM approves and the value applies at once; a refusal needs a reason and changes nothing; a request for a field that is not editable is refused; a mobile change sends a code to the new number, reaches the approver only after the right code, applies on approval and revokes the volunteer's other sessions; a mobile already used by another account is refused; an RPM of another region gets 404 on the decision; volunteer B cannot see, answer or verify volunteer A's request (404); the audit entry of an NID change holds the field name and no value
- **Done when:** the test passes.
- **Depends on:** U7
- **Size:** L
- **Risk area:** personal data
- **Status:** done

### U9. Volunteer blocklist
- **Goal:** An RPM or a higher official blocklists a volunteer in scope with a reason and lifts the block with a reason.
- **Requirements:** R12, R15, R16
- **Files:** `apps/api/src/routes/volunteers.ts`, `apps/api/src/services/blocklist.ts`, `apps/api/src/container.ts`, `apps/api/src/notifications/registration-events.ts`, `docs/api/openapi.yaml`, `docs/security/AUTHORIZATION_MATRIX.md`, `apps/api/test/integration/blocklist.test.ts`
- **Approach:** the trigger `sync_blocklist_flags` of the init migration; the session revocation of `UsersService.changeState`; `volunteerWhere` from U7.
- **Tests:**
  - integration: the Dhaka RPM blocks a Dhaka volunteer (account blocked, sessions revoked, login answers `auth.account_blocked`) and lifts it with a reason (login works); blocking without a reason is refused; a second block of the same volunteer gives 409; a Rangpur volunteer gives 404; a Project Executive gets 403; a blocklisted pending registration cannot be approved; both actions audit
- **Done when:** the test passes.
- **Depends on:** U6, U7
- **Size:** M
- **Risk area:** auth
- **Status:** done

### U10. Staff handover
- **Goal:** The Department Head or Monitoring Team sees an official's pending work, reassigns it, completes the handover, and only then deactivates.
- **Requirements:** R13, R14, R15, R16
- **Files:** `apps/api/src/handover/providers.ts`, `apps/api/src/services/handover.ts`, `apps/api/src/routes/users.ts`, `apps/api/seed/sets/demo/index.ts` (the dedicated handover official), `apps/api/test/integration/handover.test.ts`
- **Approach:** a new provider pattern (no example in the repo); writes follow `UsersService.changeState`; deactivation stays the existing state change.
- **Tests:**
  - unit: reassign-all moves every listed item to one official; an empty provider lists nothing
  - integration: an RPM with two project areas and a PM with a program list those items by category; the first assignment writes `auth.handover_started`; reassigning one item moves only that area; reassign-all moves the rest; a volunteer, a deactivated official, an official of an unfitting role and the person handed over are refused as targets; an item id of another user and a stale item are refused; both users' permission versions are bumped; completing with items left is refused (409); completion does not deactivate, and afterwards the state change deactivates (login refused, history intact); deactivation before completion answers `user.handover_required`; a PM gets 403 on the handover; every step audits
- **Done when:** the test passes.
- **Depends on:** U1, U4
- **Size:** L
- **Risk area:** auth
- **Status:** todo

### U11. Registration screens
- **Goal:** A visitor registers on a phone in Bengali or English from the login page to the pending confirmation.
- **Requirements:** R1, R2, R3, R4, R5, R21
- **Files:** `apps/web/src/features/registration/{RegisterPage,StartStep,CodeStep,VolunteerForm,StaffForm,PhotoField}.tsx`, `apps/web/src/features/registration/registration.test.tsx`, `apps/web/src/routes/index.tsx`, `apps/web/src/features/auth/LoginForm.tsx` (link), `packages/shared/src/i18n/messages/{bn,en}/registration.json`, `packages/shared/src/testing/` (unique fake contacts), `apps/web/e2e/registration.spec.ts`
- **Approach:** the OTP screens of `apps/web/src/features/auth/ResetForm.tsx` and the `packages/ui` form primitives (`Form`, `FormSection`, `TextField`, `PhoneField`, `Select`, `FileUpload`, `PasswordField`); images are compressed in the browser before upload.
- **Tests:**
  - unit: (RTL, MSW) the form opens only after both codes; the token is sent in the header and never in the URL; a registered mobile shows the "log in instead" message after the codes; the district list follows the division; a team member sees the matched name; a refused code shows its message; axe in bn and en
  - e2e (`apps/web/e2e/registration.spec.ts`, mobile project): `/login` → link "নিবন্ধন করুন" → `/register` → radio "স্বেচ্ছাসেবক" → textboxes "মোবাইল নম্বর" and "ইমেইল" with a unique fake mobile and email of this run → button "কোড পাঠান" → textbox "মোবাইলে পাওয়া কোড" with `123456` → button "পরের ধাপ" → textbox "ইমেইলে পাওয়া কোড" with `123456` → button "যাচাই করুন" → heading "নিবন্ধন ফর্ম" → fields "নাম", "পিতার নাম", "মাতার নাম", "NID নম্বর", "বিভাগ", "জেলা", "উপজেলা", "ইউনিয়ন", "স্বেচ্ছাসেবকের ধরন", "ছবি", "NID-এর ছবি", "পাসওয়ার্ড" → button "জমা দিন" → heading "নিবন্ধন জমা হয়েছে" and the text "অনুমোদনের পর আপনি কাজ শুরু করতে পারবেন।"; axe has no violations
- **Done when:** RTL and the e2e spec pass.
- **Depends on:** U3, U4, U5, U6
- **Size:** L
- **Risk area:** none
- **Status:** todo

### U12. Own profile and change requests
- **Goal:** A pending or approved volunteer sees their profile, answers correction requests and asks for edits.
- **Requirements:** R6, R8, R10, R11, R18
- **Files:** `apps/web/src/features/account/ProfileView.tsx`, `apps/web/src/features/account/ChangeRequests.tsx`, `apps/web/src/features/account/HomeView.tsx`, `apps/web/src/features/account/profile.test.tsx`, `packages/shared/src/i18n/messages/{bn,en}/registration.json`
- **Approach:** the TanStack Query screen of `apps/web/src/features/account/SessionsView.tsx`.
- **Tests:**
  - unit: (RTL, MSW) a pending user sees "আপনি এখনো কোনো প্রজেক্টে যুক্ত হননি।", only the correction fields and the button "আবার জমা দিন" once every field is answered; an approved user asks for an address change with the new value; a mobile change asks for the code before the request is sent; axe in bn and en
  - e2e: covered by the journey of U13
- **Done when:** RTL passes.
- **Depends on:** U7, U8
- **Size:** L
- **Risk area:** none
- **Status:** todo

### U13. Registration admin page
- **Goal:** Approvers handle pending registrations, edit requests and the blocklist on one admin page.
- **Requirements:** R7, R8, R9, R10, R12
- **Files:** `apps/web/src/admin/registrations/{RegistrationsPage,RegistrationDetail,CorrectionDialog,StaffDecisionDialog,EditRequests,Blocklist}.tsx`, `apps/web/src/admin/registrations/registrations.test.tsx`, `apps/web/src/admin/{roles.ts,navigation.ts}`, `apps/web/src/routes/index.tsx`, `packages/shared/src/i18n/messages/{bn,en}/admin.json`, `apps/web/e2e/registration.spec.ts`
- **Approach:** the permission panel in `apps/web/src/admin/permissions/` (search, table with phone cards, dialogs, alerts).
- **Tests:**
  - unit: (RTL, MSW) the list shows the pending rows with their kind; approving shows the success alert; a correction request names the checked fields; a staff decision needs a role; the blocklist action needs a reason; an RPM sees the page, a Finance Team user does not; axe in bn and en
  - e2e (`apps/web/e2e/registration.spec.ts`, desktop project, after the mobile registration): `rpm.dhaka@example.org` signs in → `/admin` → sidebar "নিবন্ধন" → heading "নিবন্ধন" → the new registration's row → button "সংশোধনের অনুরোধ" → checkbox "পিতার নাম" → textbox "কী ঠিক করতে হবে" → button "পাঠান" → alert "সংশোধনের অনুরোধ পাঠানো হয়েছে"; the volunteer signs in on mobile, fixes "পিতার নাম" and presses "আবার জমা দিন"; the RPM opens the row again → button "অনুমোদন" → button "অনুমোদন করুন" → alert "নিবন্ধন অনুমোদিত হয়েছে"; the volunteer's home no longer shows the pending message
- **Done when:** RTL and the e2e journey pass on both projects.
- **Depends on:** U7, U8, U9, U11, U12
- **Size:** L
- **Risk area:** none
- **Status:** todo

### U14. Handover admin page
- **Goal:** The Department Head or Monitoring Team runs a handover and deactivates the official from one page.
- **Requirements:** R13, R14
- **Files:** `apps/web/src/admin/handover/HandoverPage.tsx`, `apps/web/src/admin/handover/handover.test.tsx`, `apps/web/src/admin/navigation.ts`, `apps/web/src/routes/index.tsx`, `packages/shared/src/i18n/messages/{bn,en}/admin.json`, `apps/web/e2e/handover.spec.ts`
- **Approach:** the user search and dialogs of `apps/web/src/admin/permissions/`.
- **Tests:**
  - unit: (RTL, MSW) the pending items show by category with empty states; reassign-all sends one request; completion enables "নিষ্ক্রিয় করুন"; axe
  - e2e (`apps/web/e2e/handover.spec.ts`, desktop): `head@example.org` → sidebar "হ্যান্ডওভার" → search the dedicated demo official `handover.rpm@example.org` → button "নিষ্ক্রিয় করুন" is refused with "অ্যাকাউন্ট বন্ধের আগে ব্যবহারকারীর অপেক্ষমাণ কাজ হস্তান্তর করুন।" → combobox "যাঁকে দেবেন" chooses "আরপিএম ঢাকা (নমুনা)" → button "সব হস্তান্তর করুন" → button "হ্যান্ডওভার শেষ করুন" → button "নিষ্ক্রিয় করুন" → alert "অ্যাকাউন্ট নিষ্ক্রিয় করা হয়েছে"
- **Done when:** RTL and the e2e spec pass.
- **Depends on:** U10
- **Size:** M
- **Risk area:** none
- **Status:** todo

### U15. Documentation and status
- **Goal:** The documents describe the registration, approval, blocklist and handover as built.
- **Requirements:** R17
- **Files:** `docs/security/AUTHORIZATION_MATRIX.md` (regenerated), `docs/BUSINESS_RULES.md` (test register for BR-023 to BR-034 and BR-047), `docs/ui/SCREENS.md`, `docs/testing/DEMO_ACCOUNTS.md` (if the E2E accounts change), `CLAUDE.md` (map), `docs/STATUS.md`
- **Approach:** like U9 of `docs/plans/2026-10-12-1100-feat-rbac-permission-panel-plan.md`.
- **Tests:**
  - existing: `pnpm docs:check`, `pnpm lint`
- **Done when:** the checks pass and STATUS names T1.10 as next.
- **Depends on:** U11, U12, U13, U14
- **Size:** S
- **Risk area:** none
- **Status:** todo

## Checkpoints
- **Mode:** grouped (one by one 10, grouped 17, all at once 0; N is over 4, so one by one's score goes to grouped)
- **Signals:** N 15, L 4300, R 8, Fd 8, C 10, P 2
- **C1** after U1: foundation (decisions and contract every unit follows)
- **C2** after U2: migration
- **C3** after U4: auth, and the base of the registration API (covers U3)
- **C4** after U5: file storage and a new pattern
- **C5** after U6: personal data, foundation for approval and the screens
- **C6** after U7: auth, foundation for edit requests and the admin page
- **C7** after U8: personal data
- **C8** after U9: auth
- **C9** after U10: auth and a new pattern
- **C10** after U11: foundation for the admin journey (U13) and the documents
- **C11** after U12: foundation for U13
- **C12** after U15: end (covers U13 and U14)

## Verification
- `pnpm typecheck`, `pnpm lint`, `pnpm docs:check`
- `pnpm test` (including the `api-db` project; needs `docker compose up -d postgres minio mailpit`)
- `pnpm --filter @css/api authz:matrix` (the report is regenerated and committed)
- `pnpm e2e` (dummy OTP 123456 on the E2E database)
- `pnpm build`

## Risks and rollback
- **Migration** (U2): an additive table and two widened CHECKs; `down.sql` drops the table and restores the old CHECKs after deleting `contact_change` codes (short-lived OTPs) and `user` file links (the staff photos stay as files without a link).
- **Public endpoints** (U3, U4, U5): a rate class on every one, verified-draft checks, a lookup counter and audit; no endpoint says whether a mobile, email or NID exists beyond the documented lookup.
- **Files** (U5): type by magic bytes, metadata stripped, a size limit on that route only, server-chosen keys, a private bucket, write order with removal on failure (NS-06), replacement and the daily cleanup against orphans, 404 for anyone without access, and no virus scan until T2.1 (the files stay `pending`). Server-side encryption of the bucket (NS-40) is a deployment setting of T3.0.
- **Auth** (U6 to U10): a pending account still reaches only the own-profile routes (`allowPending`), and every new route is in the authorization matrix.

## Definition of done
- All units done and their tests pass
- Verification commands pass
- `ae-review` has run, with no open P0 or P1
- Code from abandoned attempts is removed

## Progress
- **Branch:** `feat/registration-approval-handover`
- **Updated:** 2026-10-12 19:40
- **Next:** checkpoint C8 (scope `4bed297..HEAD`), then U10: staff handover; first `apps/api/test/integration/handover.test.ts`
- **Reviewed through:** C7 at 0b3c031
- **Uncommitted:** none
- **Notes:** C1 (T0, own review of the documents): no findings; for U5, the access middleware refuses the `entity` permission marker today (`holdsPermission` in `apps/api/src/access/scope.ts`), so `GET /files/{fileId}/content` needs the middleware to pass `entity` like `authenticated` and the files service to decide. U1: decisions D-081 to D-089 in DECISION_LOG (approved with "Start implementation"; D-087 is a further owner answer during U1: registration photos may be viewed before the T2.1 scanner, an exception to O-30). Resume of a draft is "start again with the same mobile and email and verify both codes" (AUTH.md 2 rewritten), not the mobile code alone. The contract got a new `RegistrationToken` header parameter, `RegistrationCorrectionCreate` (the name `CorrectionRequestCreate` already belongs to the beneficiary correction), `OwnVolunteerProfile`, `PendingRegistration` and `RegistrationDetail`; the rate classes `registration`, `reference-lookup` and `reference-read` are also in `docs/api/redocly.yaml`. Request schemas in the contract may still be adjusted to what zod generates when the routes are built (the drift test compares them). The owner answered "Start implementation" after the doc review, which also confirms the proposed decisions of U1 (Technical decisions "Decisions logged before code"). U2: migration `20261012000000_registration_drafts`; besides the documented CHECKs it has `registration_drafts_email_lower_check` (as on users), `_verified_check` (a token only with `verified_at`) and `_submitted_check` (submitted_at and submitted_user_id together); the CHECK tests live in `constraints.test.ts` next to the others, and `migrations.test.ts` gained a step test (each later migration's down.sql restores the schema before it). down.sql deletes `contact_change` codes inside a DO block that sets `css.cleanup` (the otp status-log trigger refuses DELETE otherwise). C2 review: the cleanup role gets no DELETE on `files` or the drafts; it only EXECUTEs the `SECURITY DEFINER` function `purge_expired_registration_drafts(limit)` (deletes unsubmitted drafts past `expires_at` with their profile and NID photo rows, returns bucket and object key for the job to remove from storage); "deleted after 24 hours" (R20) means past `expires_at`, which is 24 hours after the start or last verification; a CHECK clears the token of a submitted draft (`registration_drafts_token_spent_check`), so submit must set `token_hash` to null. U3: `registry.ts` now takes its rate-limit type from `RateLimitClass` in `rate-limit.ts` (one list); a new class is added there only. The list answers 422 for a malformed `parentId` (added to the contract). U4: resume = `start` with the same mobile, email and kind returns the open draft; an unknown or submitted draft answers 404, an expired one 410 `registration.draft_expired` (410 and 422 added to the contract for resend, verify and lookup); every token problem answers 401 `registration.token_invalid`; a wrong code carries `details[0].path` `mobileCode` or `emailCode`; an existing contact consumes both codes and answers 409 after they are verified; "rejected, never approved" = state `deactivated` and, for a volunteer, `volunteers.approved_at` null, for an official no `user_roles` row ever; the reference name is `users.display_name` of an active volunteer; the cleanup runs daily 03:30 on the `maintenance` queue under the schedule key `registration-cleanup` (`JobRunner.schedule` gained `key`). `authHarness` accepts `overrides` (Partial<Container>). The handover error texts were added to the catalogue now because the catalogue check requires every API_STANDARDS code. C3 review fixes: a code resend is limited per draft (the `otp-request` address key also reads `registrationId`; before, every resend shared one bucket); the 5 lookups per NID and day are counted by the service from the `auth.reference_lookup` audit entries after the token check (a pre-auth limiter let anyone lock an NID out); a taken contact clears an earlier token of the draft; the purge function also returns the number of drafts and the job repeats it while a batch is full. Open for later (not T1.9): a global daily ceiling and alert for registration SMS (SMS pumping) belongs with the real SMS provider (O-33, T1.14); email plus-aliases count as separate addresses for the OTP window. U5: `defineRoute` gained `before` (route-only middleware such as the raw photo parser) and `streams` (the handler writes the response; no envelope, no mask); the `entity` marker now passes the access middleware like `authenticated` and `FilesService` decides per file: the owner (volunteer profile, staff `file_links` user, or the uploader of a `/me` photo) always, an official through `volunteer.view_all`, `registration.approve` or `staff.registration.approve` reaching the owner, and the NID photo only with the `volunteer.identity` class; a draft photo before submit has no owner (404). A replaced draft photo goes through the `SECURITY DEFINER` function `discard_registration_photo` (css_app has EXECUTE, no DELETE). `/me/photos/{slot}` accepts an open own change request whose `field` is the slot name, so U7 and U8 must use the field keys `photo` and `nid_photo` for the photos; Doc follow-ups for U15: SECURITY_POLICY still says files need a scan before preview and a signed URL (D-074, D-087 changed both), FILES_AND_DOCUMENTS needs the D-087 exception. C4 review fixes: concurrent uploads to one slot lock the draft row (`FOR UPDATE`) and discard the photo they replace; the JPEG cleaner walks every segment (also between progressive scans), drops APP1 to APP15 except Adobe APP14 and comments, and cuts everything after the end marker; a `/me` photo upload becomes the request's `new_value` (so U7 and U8 read the photo answer from `new_value`) and replaces the previous upload; `discard_registration_photo` removes only a photo nothing references (draft, volunteer profile, change request, file link); an official's view of an NID photo writes `file.nid_viewed`; `defineRoute` refuses the `entity` marker outside scope `file`. U6: a new error code `registration.nid_exists` (409; catalogue and API_STANDARDS); the contract's submit schemas are strict (`additionalProperties: false`) with `minLength: 1` on the required texts; the submit checks the password like a reset (no global scope), the address chain (division → district → upazila → union, active), the staff program and division, and a team member's active main volunteer (`reference_volunteer_id`); it locks the draft, reuses only one rejected never-approved account of the same kind, and spends the token; a parallel unique violation maps to 409. No role is granted at submit (the approval of U7 grants it). `GET /volunteers/me` returns 404 for an account without a volunteer row; `inAnyProject` counts open `project_volunteers` rows. C5 review fixes: the team member's reference at submit goes through the same counted and audited lookup as `reference-lookup` (5 per draft, 5 per NID and day); each refused submit (409 or 422) writes `auth.register_refused` and a draft allows 5 before 429, which bounds NID probing with one verified draft; verify reports a rejected account of the other kind as taken (no dead end after verification); a returning official's photo link is moved to the new photo (the earlier photo stays with the earlier submitted draft); new tests for the 409 after verification, staff 422s, a closed reference, the refused-submit cap and the 401 of `/volunteers/me`. `registration.nid_exists` stays explicit (owner may revisit: it tells a verified registrant that an NID is registered). U7: the correction fields are `CORRECTION_FIELD_VALUES` in `packages/shared/src/registration` (name, parents, nid, whatsapp, address, the free texts, bank, photo, nid_photo; not the type or the reference, which decide the role and need the counted lookup); an answer is checked by its field and written into the pending profile at once, the row goes to `submitted`, the resubmit closes the rows; approval is refused while a row is `open` (`registration.open_corrections`) or `submitted` (`registration.not_resubmitted`); approval grants the role `volunteer_<type>` and bumps the permission version (the bump writes the `auth.approved` entry); rejection deactivates, revokes the sessions and closes the rows; approve, reject and correct act only on pending registrations (otherwise 404); a staff decision gives any official role except `department_head` (the Main Admin's); the pending list sorts by `users.created_at` and shows `submittedAt` from the latest submitted draft; the contract got 401/403/422 on these operations, `StaffDecisionRequest` replaces the inline allOf, `ChangeValue` is an anyOf matching zod, and the correction fields are an enum. C6 review fixes: every decision locks the user row first and reads its state after (an approval and a rejection at once now give one consistent outcome; tested); refused correction answers (409, 422) write `auth.correction_refused` and an account allows 10 before 429; the resubmit stamps `decided_at` on the closed rows; stored values are parsed as JSON only for `address` and `bank`. Open for the owner: a staff decision may give any official role except `department_head` (also `monitoring_team`, a global role); the decision route declares `x-audit: auth.approved` while a rejection writes `auth.rejected`. U8: the editable fields are `EDIT_FIELD_VALUES` (the correction fields plus mobile and email); a text or object edit is `submitted` at once, a contact edit stays `open` until its `contact_change` code is verified, a photo edit is created without a value and the own upload (`/me/photos`) fills it and submits it; one open edit per field (`registration.request_open`, new code); a new contact must be free at the request and again at the approval; the approval applies the value (NID re-checked for uniqueness), and a contact change revokes every session of the volunteer and bumps the version; approvers see NID and bank values only with their field class; the rate-limit keys of the contact-code routes fall back to the change request in the path (the body names no address); a new template `otp_contact_change` (30 templates in the seed). The test harness now hands out one listening server per file (`authHarness.server()`), which made the full DB run stable on Windows (one crash in three runs remains, CI on Linux unaffected). C7 review fixes: the decision response hides NID and bank values without the field class, as the list does; whether a new contact belongs to another account is told only after its code is verified (and again at approval), so a volunteer cannot probe numbers they do not own; a new request for a contact replaces one still waiting for its code (a mistyped number no longer blocks the field), and the current value is refused; a correction photo can no longer be swapped after its answer (only profile edits accept a second upload until the decision); stored values are parsed by the field schema at approval. U9: block and unblock reach volunteers by address (`volunteerWhere`); the trigger flips an active account to `blocked` and back and bumps the version, the service ends the sessions on a block and evicts the cached facts on a lift; a second block answers 409 `user.transition_not_allowed`, lifting without an active block 404; the response leaves the reason out (it stays in the audit entry, class `blocklist.reason`), so the routes declare no sensitive fields; `BlocklistRequest` is strict with a 1000-character cap. For U5: the application role `css_app` has no DELETE privilege in production (DATABASE_SCHEMA 21, 23), so "a new upload to a slot deletes the previous row" cannot run as the API; unlink the old file instead and let the cleanup job remove unlinked draft photos, or record a decision.
