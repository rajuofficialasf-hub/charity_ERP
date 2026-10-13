---
title: Registration on one page with inline verification, a five-step form and a cleaner interface (T1.9b)
type: feat
status: in-progress
source: brainstorm
date: 2026-10-13
doc_review: 2026-10-13
---

# Registration on one page with inline verification, a five-step form and a cleaner interface (T1.9b)

## Goal
A volunteer or an official registers on one page: the mobile number and the email are verified inside their own fields (no separate code pages), the rest of the form comes in small steps, and every screen built so far looks premium, simple and clean without explanatory text.

## Problem
The owner reviewed the T1.9 screens on 2026-10-13: the codes open separate pages, the volunteer form is one long page, and the screens carry too much text ("AI feel"). The owner supplied a reference image (a green title band, white cards, two-column fields, a "যাচাই করুন" button inside the mobile and the email field, a short notice "পরিচয় যাচাই করুন").

## Requirements
### Registration page
- **R1** `/register` is one page: a green title band (title per kind, "স্বেচ্ছাসেবক নিবন্ধন" or "কর্মকর্তা নিবন্ধন", and one short line), the kind switch (volunteer or official), a compact step indicator and one white card per step, like the reference image.
- **R2** Step 1 holds the name, the father's name, the mobile number and the email. Each contact field has a "যাচাই করুন" button inside the field; pressing it sends a code to that address only, and a code input opens directly below that field in the same card; a correct code marks the field verified (a check and "যাচাই হয়েছে") and locks it; "বদলান" on a verified field reopens it and its verification. A short notice "পরিচয় যাচাই করুন" stays until both are verified.
- **R3** The next step opens only when both contacts are verified and step 1 is complete. An existing account is reported only after both are verified (D-086 unchanged).
- **R4** Volunteer steps: 1 identity and contacts, 2 address, 3 work details and volunteer type (the main volunteer's NID for a team member), 4 optional bank details and the password, 5 photos and submit. Official steps: 1 identity and contacts, 2 workplace (designation, program, division), 3 password, 4 photo and submit. The photos are always the last step (UX-18). Back keeps every answer; each step is checked before the next; a server error goes back to the step of its field.
- **R5** The page works at 360 px (one column) and shows two columns from 640 px, as the reference image.
- **R6** No foreign (প্রবাসী) numbers now: the mobile stays a Bangladesh number (owner, 2026-10-13); the checkbox of the reference image is not built.

### Photos and the own profile (UX-18)
- **R11** The photo step asks for three photos of a volunteer: the own photo, the first page (front) of the NID card and the second page (back) of the NID card; an official gives the own photo. The NID back is a new photo slot with the same rules and protection as the NID photo (JPEG or PNG, at most 2 MB, metadata stripped, field class `volunteer.identity`), also in corrections and edit requests.
- **R12** The own profile shows the details arranged by section (personal, contact, address, work, bank, photos) in cards; the photos show as images.
- **R13** After approval every editable detail has an "সম্পাদনা" button beside it that opens the request for that detail with its new value (the edit request of D-085); a detail with an open request shows its state there instead. Before approval the profile shows only the requested corrections (BR-030, unchanged).

### Cleaner interface (all built screens)
- **R7** Screens carry no explanatory paragraphs: a title, at most one short line where it helps, labels, and messages only when something happens (UX-17). Applies to login, password reset, registration, own profile, sessions, password change and the admin pages (dashboard, registrations, handover, permission panel).
- **R8** The look stays on the approved tokens (colors.md, DESIGN_SYSTEM; no new colours): the title band uses the brand green, cards the surface colour with the soft border and shadow of UX-14, inputs the muted fill.

### Contract and security
- **R9** The registration API verifies each channel on its own (D-090): start creates a draft without contacts and sends nothing; a send names the channel and its address; a verify names the channel and its code; the draft token is issued once both channels are verified. Rate limits and audit stay as they are per address and per draft.
- **R10** Every step of R9 is audited (`auth.register_started`, `auth.otp_sent`, `auth.otp_failed`, `auth.otp_verified`), and no answer tells whether a mobile or email belongs to an account before both are verified.

## Scope
- In: the registration page and its API, the per-channel draft columns, the inline-verification and step patterns in packages/ui, the text clean-up of every built screen, the documents.
- Out: foreign numbers (R6); a new colour palette or font; the role-based home (T1.15); new features on the admin pages; the edit-request contact verification on the own profile (it already verifies one channel at a time).

## Key decisions
- **UX-16** (owner, 2026-10-13): registration on one page with the verification inside the mobile and email fields, five small steps for volunteers (four for officials), a green title band as in the reference image; no foreign numbers now. Governs R1 to R6.
- **UX-17** (owner, 2026-10-13): premium, simple and clean; no "AI feel"; no explanatory text beyond a title and at most one short line; applies to every built screen and to the screens to come (written into DESIGN_BRIEF). Governs R7, R8.
- **UX-18** (owner, 2026-10-13): the photo section comes last; a volunteer gives the own photo and both pages of the NID card; the own profile is arranged by section with an edit button beside each detail that sends the change request. Governs R4, R11 to R13.
- **D-090** (approved by the owner in chat, 2026-10-13, "শুরু কর"; implements UX-16): per-channel registration verification (R9). Resume of a draft by its contacts (AUTH.md 2, D-082) is dropped: a reload starts a new draft, the earlier one is purged after 24 hours as today.

## Open questions
- None blocking. The owner answered the four questions in chat on 2026-10-13 (no foreign numbers now, five steps, all built screens, the title band as in the image).

## Technical decisions
- **API (D-090):** `POST /auth/register/start` takes `{ kind }` and returns `{ registrationId }` (201, no codes). `POST /auth/register/otp/send` takes `{ registrationId, channel, address }`: it sets the address of an unverified channel (a changed address clears that channel's verification) and sends the code; refused (409 `registration.already_verified`) once the draft holds a token. `POST /auth/register/otp/verify` takes `{ registrationId, channel, code }`: it marks that channel verified and answers `{ verified: ['sms'] }`; when both are verified it runs the contact check (409 `registration.account_exists`) and answers the token as today. `submit`, the photos and the reference lookup are unchanged. The old two-code verify and the contacts in `start` are removed (the PWA is the only client; RE-API breaking-change rule satisfied by the same-commit client change and this decision).
- **Rate limits and code budget (doc review, security):** `start` keeps the class `registration` (10 per IP and day, 20 per IP and hour). `otp/send` counts in two windows: the address, validated by the same schemas as today (`mobileSchema` accepts only `01XXXXXXXXX`, the email is lower-cased), so one address has one spelling, 5 per hour; and the draft, across both channels and every address change, 6 sends per draft in its lifetime; plus the IP cap of 20 per hour. `otp/verify` keeps its key on the draft (5 per hour, both channels together). Wrong codes count on the issued code (5 attempts, then a new code, as today, O-25) and on the draft: a new send or an address change invalidates the earlier code of that channel and never resets the draft's budget. Codes stay single-use, hashed, 5 minutes.
- **Draft id:** `registrationId` stays a server-generated UUID v7 (74 random bits from the CSPRNG; not guessable) sent only in request bodies, never in a URL path or query; the photo routes and submit keep requiring the draft token of D-082. Open drafts per IP are bounded by the `registration` class above and purged after 24 hours (D-082).
- **Privacy in audit and logs:** the audit entries of these steps hold the channel and, for a send, the address masked (`01•••••••01`, `a•••@example.org`), never the code; `address` and `code` join the pino redact paths; a test captures a log line and the audit rows and finds no full address or code.
- **No early account answer:** `otp/send` and a first `otp/verify` give the same status, body and audit shape whether or not the address belongs to an account; `registration.account_exists` comes only from the verify that completes both channels (D-086).
- **Database:** migration `20261013000000_registration_draft_channels`: `mobile` and `email` of `registration_drafts` become nullable; new `mobile_verified_at`, `email_verified_at`; CHECKs: a token (`verified_at`) only with both channel times; a channel time only with its address; the format CHECKs accept null. The NID back (R11): `registration_drafts.nid_photo_back_file_id` and `volunteers.nid_photo_back_file_id` (FK to `files`), the purge and discard functions also cover the new column, `permissions.yaml` lists `volunteers.nid_photo_back_file_id` in `volunteer.identity`. `down.sql` deletes drafts without both contacts (transient data, purged daily anyway), restores NOT NULL, drops the new columns and restores the functions.
- **packages/ui:** `TextField` and `PhoneField` get an `endAction` slot (a small button inside the field, RE-CMP reuse); a horizontal `Stepper` built on the existing `Timeline` horizontal variant; a `PageBand` title band for public pages. Tokens only.
- **Web:** `apps/web/src/features/registration/` is rebuilt as `RegisterPage` (band, kind switch, stepper, one card per step), `IdentityStep` with `ContactVerify` fields, and one component per step reusing `AddressFields`, `PhotoField` and the existing validation; the form state lives in the page (memory only, as today).
- **Stack profile:** unchanged (CLAUDE.md "Stack profile").

## Implementation units

### U1. Decisions and design brief
- **Goal:** The owner's design decisions and the proposed contract are recorded before code.
- **Requirements:** R1 to R13
- **Files:** `docs/DECISION_LOG.md` (UX-16, UX-17, UX-18, D-090), `docs/ui/DESIGN_BRIEF.md` (UX-16, UX-17, UX-18), `docs/architecture/AUTH.md` (section 2 flow and partial registrations)
- **Tests:** existing: `pnpm docs:check`
- **Done when:** the decisions are logged and the checks pass.
- **Depends on:** none · **Size:** S · **Risk area:** auth · **Status:** done

### U2. Per-channel draft columns and the NID back
- **Goal:** A draft holds each contact and its verification on its own, and drafts and volunteers hold the NID back photo.
- **Requirements:** R9, R11
- **Files:** `apps/api/prisma/migrations/20261013000000_registration_draft_channels/{migration.sql,down.sql}`, `apps/api/prisma/schema.prisma`, `apps/api/test/integration/constraints.test.ts`, `apps/api/test/integration/migrations.test.ts`, `apps/api/test/integration/registration-start.test.ts` (purge of the NID back), `docs/database/DATABASE_SCHEMA.md`, `docs/security/permissions.yaml`
- **Approach:** the T1.9 migration `20261012000000_registration_drafts` and its CHECK tests.
- **Tests:** integration: a token without both channel times is refused; a channel time without its address is refused; a malformed mobile is refused, a null one accepted; the purge removes an expired draft's NID back object too; the down.sql step test restores the schema before it.
- **Done when:** the constraint and migration tests pass.
- **Depends on:** U1 · **Size:** S · **Risk area:** migration · **Status:** done

### U3. Per-channel registration API and the NID back slot
- **Goal:** Each contact is sent a code and verified on its own; the token follows both; the NID back is a photo slot everywhere the NID photo is.
- **Requirements:** R3, R9, R10, R11
- **Files:** `packages/shared/src/registration/index.ts`, `apps/api/src/services/registration.ts`, `apps/api/src/routes/auth.ts`, `apps/api/src/rate-limit/rate-limit.ts`, `docs/api/openapi.yaml`, `docs/api/API_STANDARDS.md` (new error code), `packages/shared/src/i18n/messages/{bn,en}/errors.json`, `apps/api/test/integration/registration-start.test.ts`, `apps/api/test/integration/support/registration.ts`, `docs/security/AUTHORIZATION_MATRIX.md` (regenerated); for R11 `apps/api/src/services/{registration-photos,files,registrations,volunteers,change-requests}.ts`, `apps/api/src/routes/{registrations,volunteers}.ts`, `apps/api/test/integration/{registration-photos,registration-submit,registration-approval,edit-requests}.test.ts`
- **Approach:** the existing `start`, `resend` and `verify` of `RegistrationService`; existing: `apps/api/test/integration/registration-start.test.ts` (covered; its tests change to the new contract instead of adding contradicting ones).
- **Tests:** integration: three spellings of one mobile are refused by the schema except `01XXXXXXXXX`, so they share one window; many address changes in one draft stop at the per-draft send budget; after 5 wrong codes a new send or an address change gives no fresh draft budget; a send and a first verify look the same for a taken and a free address; a captured log line and the audit rows hold no full address and no code; start creates an empty draft and sends nothing; a send stores the address and sends one code; a verify marks one channel and answers without a token; the second verify answers the token; a wrong code names its channel and counts; a changed address clears that channel; a send after the token answers 409; an existing contact answers 409 only after both channels; resend limits per address and draft; 404, 410 and 422 cases; audit entries per step; the photo, submit and approval suites pass through the new support helper; the NID back: upload to the slot `nid_photo_back`, a volunteer submit needs all three photos, the detail and `/volunteers/me` return it, an official without the identity class does not get it, a correction and an edit request may name it.
- **Done when:** the api and api-db suites and the drift test pass.
- **Depends on:** U2 · **Size:** M · **Risk area:** auth · **Status:** done

### U4. Registration page on one page with steps
- **Goal:** The registration looks and works like the reference image, in small steps.
- **Requirements:** R1 to R6, R8
- **Files:** `packages/ui/src/components/Field/TextField.tsx` (+ test, css), `packages/ui/src/components/Timeline/Stepper.tsx` (+ test), `packages/ui/src/components/PageBand/` (new), `apps/web/src/features/registration/*` (rebuilt), `packages/shared/src/i18n/messages/{bn,en}/registration.json`, `apps/web/src/features/registration/registration.test.tsx`, `apps/web/e2e/registration.spec.ts`, `apps/web/src/dev/Gallery.tsx`
- **Approach:** the reference image; the Form, Card and Field components of packages/ui; existing tests `registration.test.tsx` and `e2e/registration.spec.ts` (covered; updated to the new flow).
- **Tests:**
  - unit (ui): `endAction` renders a button inside the field with its own name; the stepper marks the current step with `aria-current="step"`; axe in bn and en.
  - unit (web, RTL with MSW): "যাচাই করুন" on the mobile sends one code to that number and opens the code input below it; a correct code shows "যাচাই হয়েছে" and locks the field; "বদলান" reopens it; "পরের ধাপ" stays disabled until both are verified; a wrong code shows the message under its field; the volunteer goes through five steps and back keeps the answers; the official has four steps; a server error on submit returns to the step of the field; axe in bn and en at 360 px layout.
  - e2e (`apps/web/e2e/registration.spec.ts`, mobile): `/login` → link "নিবন্ধন করুন" → band "স্বেচ্ছাসেবক নিবন্ধন" → fill "নাম", "পিতার নাম", "মোবাইল নম্বর" → button "যাচাই করুন" (mobile) → textbox "মোবাইলে পাওয়া কোড" 123456 → "যাচাই হয়েছে" → "ইমেইল" → "যাচাই করুন" → "ইমেইলে পাওয়া কোড" → button "পরের ধাপ" → address → work → photos → password → "জমা দিন" → heading "নিবন্ধন জমা হয়েছে"; the desktop approval journey keeps working with the new helper.
- **Done when:** ui and web tests and the registration e2e pass on both projects, also with `--repeat-each 3` and `--workers 1`.
- **Depends on:** U3 · **Size:** L · **Risk area:** none · **Status:** done

### U5. The own profile by section with edit buttons
- **Goal:** The volunteer sees the own details arranged by section and asks for a change from the detail itself.
- **Requirements:** R12, R13
- **Files:** `apps/web/src/features/account/{ProfileView,ChangeRequests,ValueEditor,profile-api}.tsx`, `apps/web/src/components/FileImage.tsx` (moved from `admin/registrations`), `packages/shared/src/i18n/messages/{bn,en}/registration.json`, `apps/web/src/features/account/profile.test.tsx`, `apps/web/e2e/registration.spec.ts`
- **Approach:** the U12 profile of the T1.9 plan; the Card and Field components; existing tests `profile.test.tsx` (covered; updated).
- **Tests:** unit (RTL, MSW): sections with their details and the three photos; "সম্পাদনা" beside the address opens the address editor and sends the request with the new value; a detail with an open request shows "অনুমোদনের অপেক্ষায়" instead of the button; a new mobile waits for its code; a pending registrant sees no edit buttons, only the requested corrections; axe in bn and en.
- **Done when:** the profile tests pass.
- **Depends on:** U4 · **Size:** M · **Risk area:** none · **Status:** done

### U6. Clean, minimal text on every built screen
- **Goal:** The built screens look premium, simple and clean (UX-17).
- **Requirements:** R7, R8
- **Files:** `apps/web/src/features/auth/*`, `apps/web/src/features/account/*`, `apps/web/src/components/{AuthShell,AccountPage}.tsx`, `apps/web/src/admin/**` (page intros, phone notice wording), `packages/shared/src/i18n/messages/{bn,en}/{auth,registration,admin}.json` (texts removed or shortened, unused keys deleted), the affected tests and e2e specs
- **Approach:** UX-17; the reference image's spacing and card look; existing tests of each screen (covered; text assertions updated).
- **Tests:** unit: the existing screen tests with the shortened texts; axe on every screen in bn and en; `pnpm i18n:check` (no unused or missing keys); e2e: the auth, admin, permission, registration and handover specs.
- **Done when:** the web suite, i18n check and all e2e specs pass.
- **Depends on:** U5 · **Size:** M · **Risk area:** none · **Status:** done

### U7. Documents and status
- **Goal:** The documents describe the new registration and the text rule.
- **Requirements:** R1 to R13
- **Files:** `docs/ui/SCREENS.md` (SCR-002, SCR-003, SCR-006), `docs/ui/DESIGN_SYSTEM.md` (inline verification field, stepper, title band, the text rule), `docs/BUSINESS_RULES.md` (BR-023 test register), `CLAUDE.md` (map), `docs/STATUS.md`
- **Tests:** existing: `pnpm docs:check`, `pnpm lint`
- **Done when:** the checks pass and STATUS names T1.10 next.
- **Depends on:** U6 · **Size:** S · **Risk area:** none · **Status:** done

## Checkpoints
- **Mode:** grouped
- **C1** after U3: auth and migration (the contract every screen follows)
- **C2** after U7: end (covers U4 to U7; the whole branch with `ae-check`)

## Verification
- `pnpm typecheck`, `pnpm lint`, `pnpm docs:check`
- `pnpm test` (with the `api-db` project; `docker compose up -d postgres minio mailpit`)
- `pnpm --filter @css/api authz:matrix`
- `pnpm e2e`
- `pnpm build`

## Risks and rollback
- **Migration** (U2): two columns added and two made nullable on a table of transient drafts; `down.sql` deletes drafts without both contacts and restores the earlier shape.
- **Auth contract** (U3): the web client changes in the same branch; no other client exists. The OTP limits per address and per draft and the "taken only after both codes" rule stay; tests prove each.

## Definition of done
- All units done and their tests pass
- Verification commands pass
- `ae-review` has run, with no open P0 or P1
- The owner checked the registration page and the cleaned screens in the browser

## Progress
- **Branch:** feat/registration-redesign
- **Next:** checkpoint C2 (scope `6a221f9..HEAD`, full `ae-check` on the whole branch, full test run), then the plan status `done`, push and CI (O-60)
- **Reviewed through:** C1 at 81e5b16
- **Updated:** 2026-10-13
- **Uncommitted:** none
- **Notes:** the owner said "শুরু কর" (start) on 2026-10-13 and added UX-18 in the same message (photos last with both NID pages; the own profile by section with an edit button beside each detail). An official's photo step has the own photo only: the official form asks for no NID. U2 and U3 are one commit: the nullable contacts of U2 do not typecheck without the service of U3. U3: the per-draft window of the rate class `registration` (5 per hour) now counts only requests that name a draft (a `skip` on the window): a start names no draft, and with the earlier `address` key all starts shared one key. The server stores the NID back but, as before T1.9b, does not require the photos at submit (the PWA does); enforcing them would touch every submit test, so it is left as a remaining issue for the owner. The web registration flow calls the old contract until U4 rebuilds it (only the label of the new slot was added so the web typechecks). C1 review fixes (logic, security, standards): the migration backfills both channel times of drafts verified the T1.9 way before it adds the CHECKs (every database with one registration would have refused the migration; a migration test now starts from a verified and a submitted draft); a send reserves its place in the draft budget, sends the code and only then changes the address under the row lock, and a code that cannot be sent (per-address cap, provider failure) gives the place back and changes nothing (a verified number is no longer lost by trying a full one); a channel verified meanwhile with the same address keeps its verification; the photo upload reads the slot columns once. Kept as decided: `otp-verify` stays 5 per hour per draft for both channels (two successful verifies use 2; the class is shared with the password reset and the contact change); a global ceiling on new drafts and email plus-aliases stay open items (T1.14, with the real SMS provider). U4: step 1 holds exactly the fields of the reference image (name, father's name, mobile, email), so the mother's name, the NID and WhatsApp open step 2 with the address ("পরিচয় ও ঠিকানা"); the volunteer steps are contact, identity and address, work, account (bank and password), photos; the official's contact, workplace, account, photos. A code is checked as soon as its sixth digit is typed. The kind switch sits in the band and is fixed once both contacts are verified (a switch before that starts a new draft). The page has its own shell (`register.css`) instead of the sign-in card; the step names show from 640 px (on phones the section title names the step). packages/ui gained `endAction` on `TextField` and `PhoneField`, `Stepper` and `PageBand`; the dev gallery does not show them yet. The NID photo's label is now "NID কার্ডের প্রথম পাতা" everywhere; the mobile and email labels moved from `registration.start` to `registration.form`. U5: the profile has six section cards (personal, contact, address, work, bank, photos) as a `dl` per card; after approval each detail but the volunteer type has "সম্পাদনা" beside it, which opens a dialog (a bottom sheet on phones) with the new value and an optional reason; a detail with an open request shows its state instead ("আপনার অপেক্ষায়" with the code or the photo upload below it, or "অনুমোদনের অপেক্ষায়"); the earlier request form with a detail picker is gone. `FileImage` and `AddressNames` (with `useLocationName`) moved to `apps/web/src/components` for the profile and the admin pages. A permission-panel test got the 15 s timeout of the other long dialog tests (it hit 5 s under load twice). U6: removed the intro paragraphs of the sessions, permission, registrations and handover pages, the "arrives later" placeholders of the home page and the admin dashboard, the "signed in as" line that repeated the home heading and the "roles cannot be changed here" hint; the password-reset and the corrections intros are one short line now; field hints that prevent a mistake (search length, reason, receiver role) stay. No test asserted the removed texts.
