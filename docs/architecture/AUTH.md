# AUTHENTICATION AND SESSIONS

Status: complete, task T0.9 (2026-10-10); all proposals approved by the owner the same day as O-25. Design only; no code. Inputs: blueprint A5 (registration), B8 (session and login), B10 (account security); constitution §5 (Main Admin), §13; decisions BD-08, BD-44, BD-47, BD-49, O-05 (password, tokens, lockout, OTP scope), O-25 (OTP parameters, idle timeout, device limit, stronger password for GLOBAL-scope officials, RPM revocation, auto-deactivation, alert thresholds), D-055 (zod validation), D-056 (network), D-057 (monitoring); rules BR-023…035, BR-047, BR-201, BR-203, BR-209; NFR-36, NFR-40, NFR-41. All values that were proposals in the first draft are decided: O-25 for the authentication values, SECURITY_POLICY §4 (T0.21) for Argon2id, O-47 for the rate limits of NFR-41; the bundled common-password list was chosen in T1.7 (D-071). Implementation notes of T1.7 are in section 16.

## 1. Identities and accounts

| Account kind | Login id | Created by | Approved by | Notes |
|---|---|---|---|---|
| Volunteer (General, Local দায়ী, Both, Team Member, Paid Volunteer) | Mobile number (verified by OTP at registration; unique, BR-025) | Self-registration | Project Executive, RPM, PM, Monitoring Team or Department Head (BR-029) | Email also verified at registration and kept for password reset |
| Staff / official (Department Head, Monitoring Team, PM, RPM, Project Executive, Official দায়ী, Procurement, Media, Finance) | Job ID (the organisation's own ID), or the email or mobile number | The Department Head or the Monitoring Team (`user.create`) with the job ID, name, designation, email, optional mobile, affiliation, program, division, supervisor and role; the person sets the password through a single-use link (section 2.2; D-097, BR-261). Self-registration of officials ended with D-097; registrations already pending are still decided | The account is active once the link is used; the role is given at creation | The first Department Head account is created by the seed/installation step. Officials who registered themselves before D-097 keep their accounts; the admin adds their job ID and place (section 2.2) |
| Main Admin / system owner | The Department Head account | Installation | — | Cannot be deleted or deactivated through normal CRUD (BR-035); see section 11 |

One person has one user account. A volunteer account and a staff account are never merged; if a volunteer later becomes staff, a new staff account is created and the volunteer account is deactivated after handover of its applications (application transfer, BR-049).

Every official carries an affiliation (D-097): `department` (the department's own staff; existing and pending staff accounts are department staff), `foundation` (another department of the Foundation) or `external` (an outside partner), the last two with the name of their unit. Only department staff appear in the department's staff list and organogram; the others are listed apart. Access is decided by roles and permissions as for everyone else.

Passwords are stored as Argon2id hashes (SECURITY_POLICY §4) with a per-user salt; plaintext passwords and OTP codes never appear in logs, audit entries or error messages.

## 2. Registration with two OTPs

Flow (BR-023, BD-44; one page since UX-16 and D-090, 2026-10-13):

```
1. Start        the page opens a draft for the chosen kind (volunteer or official); nothing is sent
2. OTP mobile   "যাচাই করুন" in the mobile field sends an OTP to that number through the SMS adapter;
                the code is entered below the field and verifies the mobile alone
3. OTP email    the same inside the email field, with a different OTP through SMTP
4. Verified     once both are verified the draft token is issued and the next step opens
5. Form steps   address, work details, the password (rules of section 3, hints while typing), then the
                photos last: own photo and both pages of the NID card (UX-18; an official gives
                the own photo). Nothing else is asked (O-64): no program, workplace, volunteer
                type, reference or bank details; an official gives the designation with the name
6. Submit       account created in state "pending" (section 7); appears in the volunteer tab
7. Review       approval or field-level correction requests (BR-029, BR-030); on approval the account becomes "active"
```

OTP parameters (O-25): 6 digits; valid 5 minutes; at most 5 verification attempts per code, then a new code is required; at most 5 OTP requests per number or address per hour (NFR-41, rate limiting section 12); the same code is never reused; codes are stored hashed with their expiry in `otp_codes` and purged by a job after expiry.

Partial registrations: the form is held in the page only; a reload starts a new draft and asks for both codes again (D-090 dropped the resume by contacts of D-082). Unsubmitted drafts and their photos are deleted by a daily job 24 hours after the last verification (O-25, D-082).

Implementation decisions of T1.9 (D-082, D-086, D-087, D-088): the draft lives in `registration_drafts`; verification returns a random draft token once (only its hash is stored), which the client sends in the `X-Registration-Token` header on the reference lookup, the photo uploads and the submit. Each channel is sent a code and verified on its own (D-090): a send names the channel and the address, a changed address clears that channel, a send is counted per address (5 per hour), per draft (6 in its lifetime) and per IP, and wrong codes count on the code and the draft without a reset by a new send; only after both are verified does the API answer `registration.account_exists` for a mobile or email of an active, pending or blocked account, so nobody learns which numbers are registered without owning them. A rejected, never-approved account is reused by a new registration and returns to `pending`. The photo and the NID photo are JPEG or PNG of at most 2 MB, stripped of metadata on the server and stored privately; a team member's reference NID shows the main volunteer's name, five times per draft at most, audited.

### 2.1 Dummy OTP in development and test (BD-44, BD-49, BR-024)

- The OTP delivery path is an adapter: `OtpDeliveryService` chooses between `SmsAdapter` + `EmailAdapter` (real) and `DummyOtpAdapter` (fixed code).
- `DummyOtpAdapter` is enabled only when `OTP_DUMMY_ENABLED=true`; the fixed code is read from configuration (`OTP_DUMMY_CODE`), never hard-coded in the source, and is the same for mobile and email in dev/test.
- The configuration loader refuses to start the process when `OTP_DUMMY_ENABLED=true` and `NODE_ENV=production`; the production-readiness checklist (T6.5) and a smoke test on each deployment assert that the dummy path is off.
- Real gateways in staging and production: SMS through the provider-agnostic adapter configured in admin settings (a real gateway before rollout beyond the Phase 3 pilot; the pilot may run with the dummy OTP only with the owner's written approval and an explicit, time-limited configuration flag, O-49); email through the organization's SMTP. In staging the SMS adapter may run in dry-run mode (logs instead of sending) until the provider exists; the email OTP still goes out.
- Seed data for dev/test creates accounts with known passwords; such seeds never run in production (BR-024).

### 2.2 Officials created by the admin (D-097, BR-261 to BR-263)

```
1. Create       the Department Head or the Monitoring Team (permission user.create; the panel can
                grant it) enters job ID, name, designation, email, optional mobile, affiliation (and
                the unit outside the department), program, division, supervisor and one official
                role (never the Department Head role); POST /users
2. Link         the account is created pending without a password; a 256-bit random token is
                issued (only its SHA-256 hash is stored in account_invitations), valid 72 hours and
                once; the link APP_ORIGIN/invite#token is emailed (template staff_invitation) and
                returned once in the answer so the admin can copy it for WhatsApp or another way;
                a failed email keeps the account (emailed false)
3. New link     POST /users/{id}/invitation revokes the open link and issues a new one, only while
                no password is set; a corrected email given with it replaces the stored one first
                (audit user.email_corrected), so a link sent to a mistyped address dies
4. Set password the page reads the token from the URL fragment (never sent to a server in a URL,
                so no access log holds it); POST /auth/invitations/check shows the name and the job
                ID; POST /auth/invitations/accept sets the password under the rules of the role
                (section 3) and makes the account active; a used, revoked or expired link answers
                410 auth.invitation_expired, an unknown one 404 auth.invitation_invalid
5. Login        with the job ID (any letter case), the email or the mobile number (section 4)
```

This link is the one exception to "OTP only" (O-05): registration and password reset stay OTP flows. A password reset is refused for an account that has not used its link yet (it has no password to reset). The job ID is 2 to 32 letters, digits or `. _ / -`, starts with a letter or a digit, is stored in capitals (so it is unique without regard to case) and may not read as a mobile number. The profile of an official (job ID, name, designation, affiliation, program, division, supervisor) is changed with `PUT /users/{id}/profile` (`user.profile.manage`), for officials who registered themselves too; a supervisor is an active department official (a supervisor kept unchanged stays even after they left) and no supervisor line may loop (supervisor changes take one advisory lock, so two edits cannot close a loop between them). Both operations need their permission at GLOBAL scope. Every creation (`user.created`), link (`user.invited`), acceptance (`auth.invitation_accepted`) and profile change (`user.profile_changed`) is audited.

## 3. Password rules (O-05)

- Minimum 8 characters with at least one upper-case letter and one digit; no maximum below 128; spaces allowed. That is the whole rule (O-64, D-091): the mobile or email inside the password and common passwords are not checked any more (the earlier O-05 and D-071 rules were dropped by the owner). The API enforces it for the registration, the reset and the change; the PWA shows the three conditions as a checklist while the person types.
- No forced periodic rotation (NIST guidance); a change is required only after a reset or when the Monitoring Team forces it for a compromised account.
- Password change (logged in): requires the current password; revokes every other device session (section 5) and keeps the current one.
- Password reset (forgotten): start with the login id (job ID, email or mobile) → OTP to the registered mobile (volunteers) or mobile or email (staff) → new password → all device sessions revoked. Reset links are not used; OTP only (O-05). The set-password link of a new official (section 2.2) is not a reset.
- Officials with GLOBAL scope (Department Head, Monitoring Team): minimum 12 characters because of the access they hold (O-25).
- Forced change (O-66, T1.9f): a staff registration is submitted with the 8-character rule, because the role is not known yet. When the approval gives a role with global scope, `users.password_change_required` is set. From then on the access middleware (after the blocked and pending checks, before the principal is filled) answers 403 `auth.password_change_required` to every operation except the own profile read (`auth.me.get`), the language (`auth.me.language.set`), the password change (`auth.password.change`) and the logout (`auth.session.logout`), which carry `allowPasswordChange`; `Me.passwordChangeRequired` tells the PWA to open the password screen. A change or a reset clears the flag, always under the 12-character rule of the role, and the new password must differ from the current one (`auth.password_unchanged`). The facts cache of the user's sessions is dropped at the approval and at the change, so the next request sees the new state. Accounts that exist today are not flagged, and a global role granted later through the permission panel does not set the flag.

## 4. Login

```
POST /auth/login { loginId, password, device: { name, platform, appVersion } }
```

1. Rate limit per login id and per IP (section 12).
2. Look up the account: a login id with `@` is an email (staff), one that reads as a mobile number after removing spaces, dashes and the +88 prefix is a mobile (volunteers, staff), anything else is a job ID (staff, matched in capitals; D-097). Unknown id and wrong password return the same error and the same timing class (no user enumeration). An official who has not used the set-password link yet has no password, so the login fails like a wrong password.
3. Check lockout (section 6).
4. Verify the password hash.
5. Check account state (section 7): pending → tokens with the pending restrictions; blocked → 403 `auth.account_blocked` with the catalogue message and no tokens (O-59 item 4; the block reason is never shown); deactivated → 403 `auth.account_deactivated`. The state is revealed only after a correct password.
6. Create a device session (section 5), issue the access token and the refresh token, write the audit event `auth.login`.
7. Return the tokens plus the minimal profile (id, display name, roles, language, must-refresh flag).

Login does not require an OTP (O-05). Multi-factor login for GLOBAL-scope officials is not in scope now; it is listed as a later option in section 14.

## 5. Tokens and device sessions

| Item | Value (O-05) | Where |
|---|---|---|
| Access token | JWT, 15 minutes, signed with a server key (key id in the header; previous key accepted during rotation) | Memory in the PWA; `Authorization: Bearer` |
| Refresh token | Opaque random 256-bit value, 30 days, bound to one `device_sessions` row, revocable, rotated on every refresh | Stored hashed on the server; on the device in an HttpOnly, Secure, SameSite=Strict cookie scoped to `/api/v1/auth/refresh` (PWA on the same origin) |
| Device session | One row per login on a device: user, device name and platform, app version, created at, last seen, last IP, refresh-token hash, revoked at, revoked by, reason; since T2.7 the sealed device key and the pending count the device last reported | `device_sessions` |
| Device key (T2.7, D-139) | 32 random bytes per device session; returned in the body of login and of every refresh (never a cookie) and kept in memory on the phone, where it wraps the key of the encrypted offline store (OFFLINE_SYNC.md §7). The row holds it sealed with AES-256-GCM under `LOCAL_KEY_SECRET` (HKDF; `LOCAL_KEY_PREVIOUS_SECRET` accepted during a rotation, the row re-sealed at its next refresh), bound to the session id. Dropped on logout, on revocation and, by a nightly job, 30 days after the session expired or left its refresh window. A session that merely ended hands its key back to the same user on a new login (`recoverSessionId`; audit `auth.outbox_recovered`), again within 15 minutes of the first handback in case the answer was lost on the network, then never (the key is dropped), so the phone re-keys the outbox it kept; the recovery runs before the new session is created, so the device limit cannot evict the session being recovered; a sealed key no secret opens at a refresh (a rotation that dropped the previous secret too early) is replaced and audited as `sync.outbox_unrecoverable` with reason `seal_unopenable`; otherwise the phone reports what it lost (`lostPending`; audit `sync.outbox_unrecoverable`, or `auth.logout_with_pending` for an offline logout; an online logout audits its `pendingCount` itself) | `device_sessions.local_key`, `POST /auth/login`, `POST /auth/refresh`, `POST /auth/logout` |

Rules:

- Access tokens carry only `sub` (user id), `sid` (device session id), `roles` (role keys), `pv` (permission version, section 9), `exp`. They never carry permissions, scopes or personal data; the server resolves those per request (SYSTEM_ARCHITECTURE §6).
- Every request checks that the session `sid` exists and is not revoked (cheap lookup, cached for at most 60 seconds per session; a revocation invalidates the cache entry immediately on the same instance and within 60 seconds on others).
- Refresh: `POST /auth/refresh` exchanges the refresh token for a new access token and a new refresh token; the old refresh token is invalidated. Reuse of an already-rotated refresh token means theft: the whole device session is revoked and an audit event `auth.refresh_reuse_detected` is written.
- Session lifetime: a device session lives while it is refreshed at least every 30 days; the hard limit is 180 days, after which the user logs in again (O-25).
- Idle timeout: 12 hours without any request on official desktop sessions (the access token expires in 15 minutes anyway; this governs silent refresh), none on volunteer phones (field use is intermittent and offline for days) (O-25).
- Device limit: at most 5 active device sessions per user; the oldest is revoked when a sixth logs in (O-25). Since T2.7 a session that idled past its refresh window counts as ended: it neither counts against the limit nor is revoked for it, so the device key a phone may still recover is not dropped by a later login.
- Logout: revokes the current device session and triggers the local-data wipe (section 8).

## 6. Lockout after failed attempts (O-05)

- 5 consecutive failed password attempts on one login id lock the account for 15 minutes; the counter resets on a successful login or when the window passes.
- The lockout response does not reveal whether the id exists.
- Per-IP rate limiting (section 12) runs independently so that one attacker cannot lock many accounts cheaply; the account lock counts only attempts with a valid-looking id.
- Audit events `auth.login_failed` (with id hash and IP) and `auth.locked`; 10 locks of one account within a day raise a monitoring alert (O-25).
- The Monitoring Team (and the Department Head) can clear a lock with a reason: `POST /users/{userId}/unlock`, permission `user.lock.clear`, audit `auth.lock_cleared` (O-59 item 2). A successful password reset also lifts the lock.
- A locked login answers 423 with `Retry-After` (seconds until the lock ends); the login screen shows the minutes left.

## 7. Account states

| State | Meaning | Can log in | What is allowed |
|---|---|---|---|
| pending | Registered, both OTPs verified, awaiting approval; or an official created by the admin who has not used the set-password link yet (no password, so no login) | Yes (registered); no (waiting for the link) | Own profile and registration correction only; project section shows "You have not participated in any project yet" (BR-031); every other endpoint returns 403 `auth.account_pending` (API_STANDARDS §8) |
| active | Approved | Yes | Everything the role, project assignments and permissions allow |
| blocked | On the blocklist (volunteer) or suspended by the Monitoring Team (staff) | No: login answers 403 `auth.account_blocked` with the catalogue message and creates no session (O-59 item 4, same as section 4) | No application creation or assignment; no visibility of own earlier applications (BR-047); a session that existed when the block was set is revoked |
| deactivated | Left or transferred after handover (BR-034) | No | Nothing; all their work and audit entries remain |

Transitions: pending → active (approval, or the set-password link of an official created by the admin) · pending → deactivated (rejected registration, or after 90 days unapproved, O-25) · active ↔ blocked (blocklist set/lift, RPM or above with reason, BR-047; for staff, Monitoring Team or Department Head) · active → deactivated (only after a completed handover, section 10) · deactivated → active (reactivation by the Department Head or Monitoring Team with reason; audited).

Lifting a block or reactivating never restores revoked device sessions; the user logs in again.

## 8. Devices: listing, remote revocation and local-data wipe (B10, BR-201, NFR-36)

- Every user sees own devices (name, platform, last seen, created) on the profile screen and can revoke any of them except the current one (which uses logout).
- Officials with the permission `session.revoke_user` (default: Department Head, Monitoring Team; RPM for volunteers in own region, O-25) see a user's devices and revoke one or all, with a reason; used when a phone is lost or stolen. Audit event `auth.session_revoked_by_official`.
- Effect on the device: the next request fails with 401 `session_revoked`; the PWA then (1) stops sync, (2) wipes the encrypted local store (Dexie databases, photo queue, cached forms, service-worker runtime caches for API data), (3) discards tokens, (4) shows the login screen with the message. The wipe also runs on logout. A refresh token that is only expired (not revoked) does not wipe: the encrypted outbox is kept and the user signs in again before sync continues (O-29, OFFLINE_SYNC §7, API_STANDARDS `auth.refresh_invalid`).
- Pending offline records on a revoked device are lost by design (the data stayed on an untrusted device): the revocation also drops the session's device key, so the encrypted tables cannot be opened again; the official who revoked is told the device's last reported pending count in the confirmation dialog, and the volunteer is told at next login. A later decision may add server-side recovery for already-synced drafts; nothing further now.
- A revoked session cannot be un-revoked; the user logs in again and a new session row is created.
- As built (T2.7): the device lists (`GET /sessions`, `GET /users/{userId}/sessions`) carry `pendingCount` and `pendingReportedAt`, what the device last reported through a sync batch or its logout, shown on both sessions screens and repeated in the revoke dialog; a volunteer's logout with records still on the phone is warned about twice and sends the count; a logout the network cut short is finished at the phone's next refresh (the refresh cookie buys one token that revokes the session; the phone stays signed out), and a volunteer's phone that cannot reach the server opens from its own store with the cached `me` (OFFLINE_SYNC.md §7).
- As built (T2.7b, D-142): every sign-in, an official's too, opens the phone's key ring with the session's device key and keeps the person's profile in the encrypted store, so the installed app opens offline to the shell and the banner; an official's store holds the profile alone (no data set, no outbox), and the same logout and revocation wipe applies.

## 9. Role or permission change forces a session refresh (O-05)

- Each user has a `permission_version` incremented whenever their roles, project assignments, permission sets, permission-panel overrides, blocklist state or account state change.
- The access token carries `pv`; on every request the server compares it with the stored version (same cached lookup as the session check). A mismatch returns 401 `token_stale`; the PWA silently refreshes, receives a token with the new version, and reloads its cached roles and menu. The user never has to log in again for a permission change.
- Removal of all roles or deactivation revokes all sessions outright.
- Offline: the PWA keeps working with its cached permissions until it next syncs; the server re-checks every permission at sync time, so a volunteer whose permission was revoked while offline gets per-record failures with reasons, never a silent acceptance (SYSTEM_ARCHITECTURE §7).

## 10. Staff handover before deactivation (BD-08, BR-034)

- Deactivation starts from the user's admin screen with "mark for deactivation". The system lists the outstanding work: pending reviews and approvals, ongoing projects of their district or region, documents in their name, issues assigned to them, follow-ups, open edit and correction requests they own.
- Each item is reassigned to a chosen person, or all items to one person in one click; the list must be empty before the "deactivate" button is enabled. The handover record (`handovers`: from, to, scope JSON, approved by, time) is written and audited.
- On deactivation: state → deactivated; all device sessions revoked; API keys or integrations, if any, disabled; nothing deleted.
- For volunteers the equivalent is application transfer (BR-049); a volunteer with no open applications can be deactivated directly by the RPM or above (O-25), otherwise transfer first.

## 11. Main Admin protection (constitution §5, BR-035)

- One Admin account is flagged `is_system_owner` (D-187; before it, the Department Head account). It cannot be deleted, deactivated, blocked, demoted or have its sessions revoked by anyone else through the API; the only path is transferring the flag to another active Admin (the Main Admin alone confirms with their password, checked under the login throttle; audited), after which the previous holder is an ordinary Admin.
- A system owner exists at all times (the database refuses a state without one); the transfer is the only operation that changes who it is. The Department Head is appointed and replaced by an Admin; the department may be without a Head between two appointments.
- A role change (an Admin or the Department Head, BR-321) bumps the person's permission version, so their sessions refresh at once.

## 12. Rate limiting (NFR-41, BR-209)

| Route class | Limit (NFR-41, confirmed by O-47) | Key |
|---|---|---|
| Login | 10 attempts per minute, 100 per hour | login id and IP separately |
| OTP request | 5 per hour per mobile or email; 20 per hour per IP | number/address, IP |
| OTP verify | 5 attempts per code (section 2, reserved atomically); 20 per hour per IP (D-075) | code, IP |
| Password reset start | 5 per hour per login id (counted on the normalized id, section 1); 20 per hour per IP (D-075) | login id, IP |
| Refresh | 60 per hour per session | session id |
| Public application form | 20 submissions per hour per IP (O-08) | IP |

Limits are enforced in the API (not only in Caddy) so that they apply per account; the limiter state lives in PostgreSQL or process memory with a short window (no Redis, D-053). Exceeding a limit returns 429 with a retry-after header and is logged; repeated 429s on one IP raise a monitoring alert (O-25).

## 13. Audit events

Every event below is written to `audit_log` (BR-179) with actor, target user, device session id where relevant, IP, outcome and reason. Passwords, OTP codes and tokens are never stored.

| Event | Trigger |
|---|---|
| auth.register_started / otp_sent / otp_verified / otp_failed | Registration OTP flow (per channel) |
| user.created / user.invited / user.email_corrected / auth.invitation_accepted / user.profile_changed | Officials created by the admin, their set-password link, and their profile (D-097) |
| auth.registered | Account created in pending |
| auth.approved / rejected / correction_requested | Registration review |
| auth.login / login_failed / locked / lock_cleared | Login and lockout |
| auth.logout | User logout |
| auth.logout_with_pending | A logout that left records unsent on the device (count only), at the logout or at the next login (T2.7) |
| auth.outbox_recovered / sync.outbox_unrecoverable | The device key of an ended session handed back once, or the phone's report of records it could not open (count) (T2.7) |
| auth.refresh_reuse_detected | Refresh-token reuse |
| auth.session_revoked / session_revoked_by_official | Device revocation |
| auth.password_changed / password_reset_started / password_reset_completed | Password flows |
| user.language_changed | Own interface language changed (I18N 2; endpoint `PUT /me/language`, live with T1.7, O-56) |
| auth.role_changed / permission_changed (written by the access module) | Permission version bump |
| auth.state_changed | pending/active/blocked/deactivated transitions with reason |
| auth.handover_started / handover_completed | Deactivation handover |
| auth.system_owner_transferred | Main Admin transfer |

Security monitoring (D-057): login failures, lockouts, refresh reuse and revocations are also counted on the metrics endpoint; thresholds raise in-app alerts to the Monitoring Team.

## 14. Values decided by O-25 (2026-10-10)

The following were proposed in T0.9 and approved by the owner as O-25; they are binding:

1. OTP parameters: 6 digits, 5-minute validity, 5 verification attempts, 5 requests per hour; partial registration resumable for 24 hours.
2. Idle timeout for official desktop sessions: 12 hours of inactivity ends silent refresh; none for volunteer phones. Hard session limit 180 days.
3. Device limit: 5 active device sessions per user.
4. Stronger minimum password (12 characters) for GLOBAL-scope officials; optional second factor for them as a later feature.
5. Who may revoke volunteers' device sessions besides Department Head and Monitoring Team: RPM for own region.
6. Unapproved registrations auto-deactivated after 90 days; volunteers with no open applications may be deactivated directly by RPM or above.
7. Alert thresholds: 10 lockouts of one account per day; repeated 429s per IP.

Confirmed in T0.21: Argon2id as the password hash (SECURITY_POLICY §4) and the rate-limit numbers of section 12 (NFR-41, O-47); the bundled common-password list is chosen in T1.7. A second factor for GLOBAL-scope officials is a later option, not planned now.

## 15. Related documents

`docs/security/RBAC.md` and `permissions.yaml` (T0.10) for what a session may do; `docs/architecture/OFFLINE_SYNC.md` (T0.12) for token behaviour while offline; `docs/security/SECURITY_POLICY.md` (T0.21); `docs/api/openapi.yaml` (T0.18) for the `auth` tag endpoints: register/start, otp/verify, register/submit, login, refresh, logout, password/change, password/reset/start, password/reset/complete, sessions (list), sessions/{id} (revoke), admin users/{id}/sessions, users/{id}/state, users/{id}/handover.

## 16. Implementation notes (T1.7, D-070, D-071, D-072, O-59)

- Code: `apps/api/src/auth/` (AuthGuard, AuthService, SessionService, TokenService, OtpService and OtpDeliveryService, PasswordHasher, PermissionVersionService, interim PermissionResolver), `apps/api/src/users/`; PWA client and screens in `apps/web/app/_lib/` (api.ts, auth.tsx, wipe.ts), `apps/web/app/login/`, `apps/web/app/account/`.
- Cookies: `css_refresh` (HttpOnly, SameSite=Strict, path `/api/v1/auth/refresh`; value = device session id, a dot and 256 random bits; stored as SHA-256) and `css_csrf` (readable, path `/`; nonce and HMAC bound to the session, sent back as `X-CSRF-Token`). `AUTH_COOKIE_SECURE` may be false only outside production.
- Session lifetime: `expires_at` is the 180-day hard limit (immutable); a refresh is refused after 30 days without activity; the 12-hour idle timeout applies to staff sessions whose client reports platform `desktop`. A rotated refresh token replayed within 30 seconds of its rotation is treated as a parallel tab (`auth.refresh_invalid`, the PWA retries once with the newer cookie); later it is theft (`auth.refresh_reused`, session revoked).
- Authorization until T1.8 (O-59 item 3): `authenticated` for any signed-in user; GLOBAL-scope roles pass every named permission; every user has `session.revoke_own` on own sessions; everything else is denied. A pending account reaches only the operations marked for it (me, logout, own sessions, password change, language).
- Account state endpoint (`POST /users/{userId}/state`, If-Match): active ↔ blocked for staff, active or blocked → deactivated after a completed handover, deactivated → active. Pending accounts (registration flow, T1.9), volunteer blocks (blocklist, T1.9), the own account and the system owner are refused with 409 codes. Every change bumps the permission version; a block or deactivation revokes all sessions.
- OTP: `otp_codes` rows hold HMACs of the address and of the code (`OTP_SECRET`); the reset code goes to staff by email and to volunteers by SMS; with `OTP_DUMMY_ENABLED` the configured `OTP_DUMMY_CODE` is accepted, nothing is sent and the API prints a boxed warning at every start; production refuses the dummy mode (the O-49 pilot flag is not built).
- Lockout for unknown ids is counted in memory, so a lock never tells whether an account exists. Login is rate-limited by login id and by IP separately; the IP is the user's address through trusted proxies only (`TRUST_PROXY`, D-072).
- The PWA keeps the access token in memory, refreshes once for parallel callers (Web Locks across tabs), sends no refresh without the `css_csrf` cookie, never lets a stale refresh end a newer session, and wipes local data on logout, revocation and reuse (section 8). Forms post with POST and their submit buttons stay disabled until the page is interactive (D-072).
