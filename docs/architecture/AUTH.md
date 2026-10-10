# AUTHENTICATION AND SESSIONS

Status: complete, task T0.9 (2026-10-10). Design only; no code. Inputs: blueprint A5 (registration), B8 (session and login), B10 (account security); constitution §5 (Main Admin), §13; decisions BD-08, BD-44, BD-47, BD-49, O-05 (password, tokens, lockout, OTP scope), D-055 (zod validation), D-056 (network), D-057 (monitoring); rules BR-023…035, BR-047, BR-201, BR-203, BR-209; NFR-36, NFR-40, NFR-41. Values the owner has not decided are marked PROPOSAL and listed in section 14 (DECISION_LOG open question 25).

## 1. Identities and accounts

| Account kind | Login id | Created by | Approved by | Notes |
|---|---|---|---|---|
| Volunteer (General, Local দায়ী, Both, Team Member, Paid Volunteer) | Mobile number (verified by OTP at registration; unique, BR-025) | Self-registration | Project Executive, RPM, PM, Monitoring Team or Department Head (BR-029) | Email also verified at registration and kept for password reset |
| Staff / official (Department Head, Monitoring Team, PM, RPM, Project Executive, Implementer, Official দায়ী, Procurement, Media, Finance) | Mobile number or email (both verified) | Self-registration on the same form plus designation, program, region (BR-028) | Department Head or Monitoring Team, who also assign the role | The first Department Head account is created by the seed/installation step, never through self-registration |
| Main Admin / system owner | The Department Head account | Installation | — | Cannot be deleted or deactivated through normal CRUD (BR-035); see section 11 |

One person has one user account. A volunteer account and a staff account are never merged; if a volunteer later becomes staff, a new staff account is created and the volunteer account is deactivated after handover of its applications (application transfer, BR-049).

Passwords are stored as Argon2id hashes (PROPOSAL of algorithm; any current memory-hard hash is acceptable) with a per-user salt; plaintext passwords and OTP codes never appear in logs, audit entries or error messages.

## 2. Registration with two OTPs

Flow (BR-023, BD-44):

```
1. Start        enter mobile number and email
2. OTP mobile   system sends an OTP to the mobile through the SMS adapter
3. OTP email    system sends a different OTP to the email through SMTP
4. Verify       both codes must be entered and match; only then the registration form opens
5. Form         identity, education and experience, contact, optional bank details, reference, attachments, type (BR-026)
6. Password     chosen at the end of the form, rules of section 3
7. Submit       account created in state "pending" (section 7); appears in the volunteer tab
8. Review       approval or field-level correction requests (BR-029, BR-030); on approval the account becomes "active"
```

OTP parameters (PROPOSAL unless decided): 6 digits; valid 5 minutes; at most 5 verification attempts per code, then a new code is required; at most 5 OTP requests per number or address per hour (NFR-41, rate limiting section 12); the same code is never reused; codes are stored hashed with their expiry in `otp_codes` and purged by a job after expiry.

Partial registrations: a user who verified both OTPs but did not submit the form may resume within 24 hours (PROPOSAL) by verifying the mobile OTP again; after that the draft is discarded.

### 2.1 Dummy OTP in development and test (BD-44, BD-49, BR-024)

- The OTP delivery path is an adapter: `OtpDeliveryService` chooses between `SmsAdapter` + `EmailAdapter` (real) and `DummyOtpAdapter` (fixed code).
- `DummyOtpAdapter` is enabled only when `OTP_DUMMY_ENABLED=true`; the fixed code is read from configuration (`OTP_DUMMY_CODE`), never hard-coded in the source, and is the same for mobile and email in dev/test.
- The configuration loader refuses to start the process when `OTP_DUMMY_ENABLED=true` and `NODE_ENV=production`; the production-readiness checklist (T6.5) and a smoke test on each deployment assert that the dummy path is off.
- Real gateways in staging and production: SMS through the provider-agnostic adapter configured in admin settings (provider chosen before Qurbani, Q-11); email through the organization's SMTP. In staging the SMS adapter may run in dry-run mode (logs instead of sending) until the provider exists; the email OTP still goes out.
- Seed data for dev/test creates accounts with known passwords; such seeds never run in production (BR-024).

## 3. Password rules (O-05)

- Minimum 8 characters with at least one letter and one digit; no maximum below 128; spaces allowed.
- Rejected: the user's own mobile number, a password equal to the login id, and passwords on a short list of common passwords (PROPOSAL: the top 10,000 list bundled in `packages/shared`).
- No forced periodic rotation (NIST guidance); a change is required only after a reset or when the Monitoring Team forces it for a compromised account.
- Password change (logged in): requires the current password; revokes every other device session (section 5) and keeps the current one.
- Password reset (forgotten): start with the login id → OTP to the registered mobile (volunteers) or mobile or email (staff) → new password → all device sessions revoked. Reset links are not used; OTP only (O-05).
- Officials with GLOBAL scope (Department Head, Monitoring Team): PROPOSAL to require a longer minimum (12 characters) because of the access they hold; open item.

## 4. Login

```
POST /auth/login { loginId, password, device: { name, platform, appVersion } }
```

1. Rate limit per login id and per IP (section 12).
2. Look up the account by mobile (volunteers, staff) or email (staff). Unknown id and wrong password return the same error and the same timing class (no user enumeration).
3. Check lockout (section 6).
4. Verify the password hash.
5. Check account state (section 7): pending → "waiting for approval" message; blocked → the block message and no tokens; deactivated → "account closed".
6. Create a device session (section 5), issue the access token and the refresh token, write the audit event `auth.login`.
7. Return the tokens plus the minimal profile (id, display name, roles, language, must-refresh flag).

Login does not require an OTP (O-05). Multi-factor login for GLOBAL-scope officials is not in scope now; it is listed as a later option in section 14.

## 5. Tokens and device sessions

| Item | Value (O-05) | Where |
|---|---|---|
| Access token | JWT, 15 minutes, signed with a server key (key id in the header; previous key accepted during rotation) | Memory in the PWA; `Authorization: Bearer` |
| Refresh token | Opaque random 256-bit value, 30 days, bound to one `device_sessions` row, revocable, rotated on every refresh | Stored hashed on the server; on the device in an HttpOnly, Secure, SameSite=Strict cookie scoped to `/api/v1/auth/refresh` (PWA on the same origin) |
| Device session | One row per login on a device: user, device name and platform, app version, created at, last seen, last IP, refresh-token hash, revoked at, revoked by, reason | `device_sessions` |

Rules:

- Access tokens carry only `sub` (user id), `sid` (device session id), `roles` (role keys), `pv` (permission version, section 9), `exp`. They never carry permissions, scopes or personal data; the server resolves those per request (SYSTEM_ARCHITECTURE §6).
- Every request checks that the session `sid` exists and is not revoked (cheap lookup, cached for at most 60 seconds per session; a revocation invalidates the cache entry immediately on the same instance and within 60 seconds on others).
- Refresh: `POST /auth/refresh` exchanges the refresh token for a new access token and a new refresh token; the old refresh token is invalidated. Reuse of an already-rotated refresh token means theft: the whole device session is revoked and an audit event `auth.refresh_reuse_detected` is written.
- Session lifetime: a device session lives while it is refreshed at least every 30 days; the hard limit is PROPOSAL 180 days, after which the user logs in again.
- Idle timeout: PROPOSAL 12 hours without any request on official desktop sessions (the access token expires in 15 minutes anyway; this governs silent refresh), none on volunteer phones (field use is intermittent and offline for days). Open item 25.
- Device limit: PROPOSAL at most 5 active device sessions per user; the oldest is revoked when a sixth logs in. Open item 25.
- Logout: revokes the current device session and triggers the local-data wipe (section 8).

## 6. Lockout after failed attempts (O-05)

- 5 consecutive failed password attempts on one login id lock the account for 15 minutes; the counter resets on a successful login or when the window passes.
- The lockout response does not reveal whether the id exists.
- Per-IP rate limiting (section 12) runs independently so that one attacker cannot lock many accounts cheaply; the account lock counts only attempts with a valid-looking id.
- Audit events `auth.login_failed` (with id hash and IP) and `auth.locked`; 10 locks of one account within a day raise a monitoring alert (PROPOSAL threshold).
- The Monitoring Team can clear a lock from the user's admin screen (audited).

## 7. Account states

| State | Meaning | Can log in | What is allowed |
|---|---|---|---|
| pending | Registered, both OTPs verified, awaiting approval | Yes | Own profile only; project section shows "You have not participated in any project yet" (BR-031); correction requests can be answered |
| active | Approved | Yes | Everything the role, project assignments and permissions allow |
| blocked | On the blocklist (volunteer) or suspended by the Monitoring Team (staff) | Yes, but only to see the block message | No application creation or assignment; no visibility of own earlier applications (BR-047); the login response carries `state: blocked` and the message; every other endpoint returns 403 `account_blocked` |
| deactivated | Left or transferred after handover (BR-034) | No | Nothing; all their work and audit entries remain |

Transitions: pending → active (approval) · pending → deactivated (rejected registration, PROPOSAL: after 90 days unapproved) · active ↔ blocked (blocklist set/lift, RPM or above with reason, BR-047; for staff, Monitoring Team or Department Head) · active → deactivated (only after a completed handover, section 10) · deactivated → active (reactivation by the Department Head or Monitoring Team with reason; audited).

Lifting a block or reactivating never restores revoked device sessions; the user logs in again.

## 8. Devices: listing, remote revocation and local-data wipe (B10, BR-201, NFR-36)

- Every user sees own devices (name, platform, last seen, created) on the profile screen and can revoke any of them except the current one (which uses logout).
- Officials with the permission `user.session.revoke` (default: Department Head, Monitoring Team; RPM for volunteers in own region, PROPOSAL) see a user's devices and revoke one or all, with a reason; used when a phone is lost or stolen. Audit event `auth.session_revoked_by_official`.
- Effect on the device: the next request fails with 401 `session_revoked`; the PWA then (1) stops sync, (2) wipes the encrypted local store (Dexie databases, photo queue, cached forms, service-worker runtime caches for API data), (3) discards tokens, (4) shows the login screen with the message. The wipe also runs on logout and when the refresh token is rejected for any reason.
- Pending offline records on a revoked device are lost by design (the data stayed on an untrusted device); the official who revoked is told so in the confirmation dialog, and the volunteer is told at next login. A later decision may add server-side recovery for already-synced drafts; nothing further now.
- A revoked session cannot be un-revoked; the user logs in again and a new session row is created.

## 9. Role or permission change forces a session refresh (O-05)

- Each user has a `permission_version` incremented whenever their roles, project assignments, permission sets, permission-panel overrides, blocklist state or account state change.
- The access token carries `pv`; on every request the server compares it with the stored version (same cached lookup as the session check). A mismatch returns 401 `token_stale`; the PWA silently refreshes, receives a token with the new version, and reloads its cached roles and menu. The user never has to log in again for a permission change.
- Removal of all roles or deactivation revokes all sessions outright.
- Offline: the PWA keeps working with its cached permissions until it next syncs; the server re-checks every permission at sync time, so a volunteer whose permission was revoked while offline gets per-record failures with reasons, never a silent acceptance (SYSTEM_ARCHITECTURE §7).

## 10. Staff handover before deactivation (BD-08, BR-034)

- Deactivation starts from the user's admin screen with "mark for deactivation". The system lists the outstanding work: pending reviews and approvals, ongoing projects of their district or region, documents in their name, issues assigned to them, follow-ups, open edit and correction requests they own.
- Each item is reassigned to a chosen person, or all items to one person in one click; the list must be empty before the "deactivate" button is enabled. The handover record (`handovers`: from, to, scope JSON, approved by, time) is written and audited.
- On deactivation: state → deactivated; all device sessions revoked; API keys or integrations, if any, disabled; nothing deleted.
- For volunteers the equivalent is application transfer (BR-049); a volunteer with no open applications can be deactivated directly by the RPM or above (PROPOSAL), otherwise transfer first.

## 11. Main Admin protection (constitution §5, BR-035)

- The Department Head account is flagged `is_system_owner`. It cannot be deleted, deactivated, blocked, demoted or have its sessions revoked by anyone else through the API; the only path is transferring the flag to another active official (Department Head confirms with password; audited), after which the previous holder becomes an ordinary account.
- At least one active Department Head must exist at all times; the transfer is the only operation that changes who it is.
- The Monitoring Team has the same functional access as the Department Head everywhere (BR-184) except this one operation.

## 12. Rate limiting (NFR-41, BR-209)

| Route class | Limit (PROPOSAL values from NFR-41) | Key |
|---|---|---|
| Login | 10 attempts per minute, 100 per hour | login id and IP separately |
| OTP request | 5 per hour per mobile or email; 20 per hour per IP | number/address, IP |
| OTP verify | 5 attempts per code (section 2) | code |
| Password reset start | 5 per hour per login id | login id |
| Refresh | 60 per hour per session | session id |
| Public application form | 20 submissions per hour per IP (O-08) | IP |

Limits are enforced in the API (not only in Caddy) so that they apply per account; the limiter state lives in PostgreSQL or process memory with a short window (no Redis, D-053). Exceeding a limit returns 429 with a retry-after header and is logged; repeated 429s on one IP raise a monitoring alert (PROPOSAL).

## 13. Audit events

Every event below is written to `audit_log` (BR-179) with actor, target user, device session id where relevant, IP, outcome and reason. Passwords, OTP codes and tokens are never stored.

| Event | Trigger |
|---|---|
| auth.register_started / otp_sent / otp_verified / otp_failed | Registration OTP flow (per channel) |
| auth.registered | Account created in pending |
| auth.approved / rejected / correction_requested | Registration review |
| auth.login / login_failed / locked / lock_cleared | Login and lockout |
| auth.logout | User logout |
| auth.refresh_reuse_detected | Refresh-token reuse |
| auth.session_revoked / session_revoked_by_official | Device revocation |
| auth.password_changed / password_reset_started / password_reset_completed | Password flows |
| auth.role_changed / permission_changed (written by the access module) | Permission version bump |
| auth.state_changed | pending/active/blocked/deactivated transitions with reason |
| auth.handover_started / handover_completed | Deactivation handover |
| auth.system_owner_transferred | Main Admin transfer |

Security monitoring (D-057): login failures, lockouts, refresh reuse and revocations are also counted on the metrics endpoint; thresholds raise in-app alerts to the Monitoring Team.

## 14. Open items (DECISION_LOG open question 25)

Values not covered by O-05, proposed here and awaiting the owner:

1. OTP parameters: 6 digits, 5-minute validity, 5 verification attempts, 5 requests per hour; partial registration resumable for 24 hours.
2. Idle timeout for official desktop sessions: 12 hours of inactivity ends silent refresh; none for volunteer phones. Hard session limit 180 days.
3. Device limit: 5 active device sessions per user.
4. Stronger minimum password (12 characters) for GLOBAL-scope officials; optional second factor for them as a later feature.
5. Who may revoke volunteers' device sessions besides Department Head and Monitoring Team: RPM for own region.
6. Unapproved registrations auto-deactivated after 90 days; volunteers with no open applications may be deactivated directly by RPM or above.
7. Alert thresholds: 10 lockouts of one account per day; repeated 429s per IP.

Everything else in this document follows approved decisions and needs no further answer.

## 15. Related documents

`docs/security/RBAC.md` and `permissions.yaml` (T0.10) for what a session may do; `docs/architecture/OFFLINE_SYNC.md` (T0.12) for token behaviour while offline; `docs/security/SECURITY_POLICY.md` (T0.21); `docs/api/openapi.yaml` (T0.18) for the `auth` tag endpoints: register/start, otp/verify, register/submit, login, refresh, logout, password/change, password/reset/start, password/reset/complete, sessions (list), sessions/{id} (revoke), admin users/{id}/sessions, users/{id}/state, users/{id}/handover.
