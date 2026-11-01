# SECURITY POLICY

Status: complete for Phase 0, written in task T0.21 (2026-10-10). Binding for design, code, configuration and operations. Sources: constitution §2, §5, §9, §13; blueprint B8; AUTH.md; RBAC.md and `permissions.yaml`; FILES_AND_DOCUMENTS.md; OFFLINE_SYNC.md; API_STANDARDS.md; NFR-28, NFR-29, NFR-32 to NFR-43, NFR-49, NFR-52, NFR-60, NFR-61; decisions BD-44 to BD-49, D-054 to D-057, O-05, O-06, O-08, O-25, O-30, O-33, O-39, O-45, O-46 in `docs/DECISION_LOG.md`. How each control is tested: `docs/testing/TEST_STRATEGY.md` §3.8.

## 1. Scope, principles and roles

Principles: security first; authorization on the server with default deny (the UI only reflects it); least privilege by role and scope; no sensitive data where it is not needed; every security-relevant action audited; never weaken a control for convenience or to pass a test (constitution §2).

| Role | Responsibility |
|---|---|
| Project owner (the department; the Department Head decides) | Approves this policy and every exception; decides on incident communication to management (O-45) |
| IT team | Server, network, TLS, backups and restores, secrets on the server, operating-system patching, monitoring alerts, first response to incidents (BD-45, BD-46) |
| Monitoring Team | Reviews the audit log and security alerts, permission-panel oversight, supports incident review |
| Developers (Claude Code under CLAUDE.md) | Implement and test the controls of this policy; never read or modify real `.env` files; report findings, never fix security silently |

## 2. Data classification and handling

| Class | Examples | Screens | Exports | Logs | Phones (offline) | Backups |
|---|---|---|---|---|---|---|
| Public | Tree-planting public form texts, login page | everyone | — | allowed | — | yes |
| Internal | Project names, statuses, counts, reference lists | by role and scope | by permission | allowed | cached for assigned projects | yes |
| Personal | Names, father or husband names, mobile numbers, addresses, GPS, photos, family members | by role and scope | by permission, audited when bulk | never in content; ids only | own records only, encrypted | encrypted |
| Sensitive (`sensitive_fields` in permissions.yaml) | NID and birth-registration numbers and NID photos; volunteer NID; bank details; ratings, categories and their comments; donor data; official form sections and scores; blocklist reasons; audit detail | only the roles listed for the class; masked otherwise (RBAC §8) | same mask; export audited (BR-179, BR-224) | never | never sent to volunteers' phones | encrypted; profiles bucket with a separate key (O-30) |
| Secret | Passwords, OTP codes, tokens, cookies, signing keys, database and storage credentials, SMTP and SMS credentials, backup keys | never | never | never | refresh token only, HttpOnly cookie | key material kept apart from data backups |

## 3. OWASP Top 10 (2021) mapped to this system

| Risk | Controls in this system | Where |
|---|---|---|
| A01 Broken access control | Permission and scope on every endpoint with boot-time check; default deny; out-of-scope records return 404; UUID ids; per-record checks in batch and sync endpoints; one serializer mask for JSON and exports; signed file URLs after a permission check; generated authorization-matrix and IDOR tests | RBAC §8, FILES, O-46 |
| A02 Cryptographic failures | TLS everywhere with HSTS (D-056); Argon2id password hashes; refresh tokens stored hashed; encrypted offline outbox with device-bound keys; encrypted backups; no sensitive data in URLs | AUTH §1, §5, OFFLINE_SYNC, §15 |
| A03 Injection | zod validation of every request (D-055); Prisma parameterized queries; raw SQL only in reviewed migrations and repositories with bound parameters; React output escaping; no shell commands built from input | §6 |
| A04 Insecure design | Workflow guards as configuration with server enforcement; idempotency keys; transactions; no hard delete; append-only logs; threat review of each new module in its task plan | WORKFLOW_ENGINE, DATABASE_SCHEMA |
| A05 Security misconfiguration | Caddy security headers and CSP; only ports 80 and 443 public; internal services on the Docker network only; `JOBS_INLINE` and dummy OTP impossible in production; seed guard | §7, §20 |
| A06 Vulnerable and outdated components | Frozen lockfile; `pnpm audit` in CI with recorded exceptions; review of new dependencies; monthly base-image updates | §11 |
| A07 Identification and authentication failures | Password rules, lockout, rate limits, OTP limits, short access tokens, rotated refresh tokens bound to device sessions, remote revocation, session refresh on permission change | §4 |
| A08 Software and data integrity failures | CI gate on every merge; migrations reviewed with `down.sql`; published form versions immutable; audit log append-only; release from tagged commits only | TEST_STRATEGY §6; §13 of this policy |
| A09 Security logging and monitoring failures | Structured logs with request ids; audit log of every §13 event; alerts for lockouts, repeated 429, failed jobs, 5xx rate, readiness failures (O-25, D-057) | §10, §13 |
| A10 Server-side request forgery | The server never fetches URLs supplied by users; outbound connections only to the configured SMTP server, SMS provider and backup target | §7 |

OWASP ASVS level 2 is the checklist of the security audit before go-live (T6.3).

## 4. Authentication and sessions (AUTH.md, O-05, O-25)

| Control | Rule |
|---|---|
| Password storage | Argon2id with per-user salt; plaintext passwords and OTP codes never stored, logged or audited (T1.7: OTP codes and addresses stored as HMACs; audit entries carry a hash of the login id) |
| Password rules | At least 8 characters with a letter and a digit; at least 12 for Department Head and Monitoring Team accounts |
| Registration and reset OTP | 6 digits, valid 5 minutes, 5 verification attempts per code, 5 requests per hour per number or address; partial registration resumable for 24 hours; OTP not used at every login |
| Dummy OTP | Fixed code in development and test (BD-44, BD-49). Production refuses to start with the dummy mode on, except during the Phase 3 pilot under an explicit, time-limited configuration flag approved in writing by the owner (O-49); the flag is logged at every start and shown to the Monitoring Team; a real SMS gateway is required before rollout beyond the pilot region |
| Lockout | 15 minutes after 5 failed attempts; alert at 10 lockouts of one account per day |
| Access token | 15 minutes, held in memory by the PWA, never in local storage |
| Refresh token | Opaque 256-bit value, 30 days, rotated on every refresh, stored hashed, bound to one device session; sent only as an HttpOnly, Secure, SameSite=Strict cookie scoped to the refresh path together with an `X-CSRF-Token` header |
| Sessions | At most 5 active device sessions per user (oldest revoked on the sixth login); idle timeout 12 hours for official desktop sessions; hard limit 180 days |
| Revocation | Users revoke their own sessions; Department Head and Monitoring Team revoke anyone's; RPM revokes volunteers' sessions in own region; revocation wipes local data on the device at next contact |
| Permission change | A role or permission change bumps `permission_version` and forces a session refresh |
| Account states | Unapproved registrations deactivated after 90 days; staff deactivation only after handover (BD-08) |
| Main Admin | The Department Head (system owner) account cannot be deactivated, blocked or stripped through normal operations; ownership transfer is a separate audited action (AUTH §11) |

## 5. Authorization and field-level protection (RBAC.md §8 and §9)

1. Every handler declares its permission and scope; a handler without them cannot be registered. Public endpoints (login, OTP, password reset, registration start, codes and reference lookup, the locations list, public form) declare `@Public()` and are listed in openapi.yaml with `x-permission: public`.
2. Check order: rate limit, authentication, role resolution, permission, scope resolution, object-level check, validation, service.
3. Repositories take a scope object, never a raw user id; lists always filter by scope.
4. Single records outside the scope return 404, never 403, so existence is not leaked.
5. Batch and sync endpoints check each record and report per-record results.
6. One serializer mask driven by the `sensitive_fields` catalogue protects JSON responses, CSV, XLSX and PDF alike; sensitive exports are audited with filter and row count.
7. Jobs and sync processing re-check the originating user's permission and scope.
8. The permission panel is limited to `permission.panel.manage`; every grant and revoke needs a reason and is audited; revoke beats grant; volunteers can never receive sensitive permissions.

## 6. Input validation and output encoding

- Every body, query and path parameter is validated on the server with the shared zod schema (D-055), regardless of client validation; database constraints are the last line.
- User text is normalized to Unicode NFC and Bengali digits are converted where the field is numeric (O-44).
- Length limits from DATABASE_SCHEMA §2 are enforced in the schemas.
- No query is built by string concatenation; Prisma or bound parameters only.
- React escapes output; `dangerouslySetInnerHTML` is forbidden except for story text rendered after server-side sanitization with an allow-list of tags.
- Uploaded file names are kept as metadata only; storage keys are generated (FILES_AND_DOCUMENTS), so a name can never become a path.
- CSV exports neutralize cells starting with `=`, `+`, `-` or `@` to prevent formula injection in spreadsheets.

## 7. Web and transport security

| Area | Rule |
|---|---|
| TLS | Caddy with automatic certificates; HTTP redirects to HTTPS; HSTS (D-056) |
| Headers | `Content-Security-Policy: default-src 'self'; img-src 'self' blob: data: https://i.ytimg.com; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'`; `X-Content-Type-Options: nosniff`; `Referrer-Policy: strict-origin-when-cross-origin`; `Permissions-Policy: camera=(self), geolocation=(self), microphone=()` |
| CORS | Same origin only; no wildcard |
| CSRF | The access token travels in the `Authorization` header (not a cookie); the refresh cookie requires the `X-CSRF-Token` header and SameSite=Strict |
| Network | Only ports 80 and 443 public; PostgreSQL, the MinIO admin API, the worker and the metrics endpoint are reachable only on the internal Docker network or with authentication (D-056, D-057, NFR-61) |
| Outbound | Only the SMTP server, the SMS provider and the backup target; no fetching of user-supplied URLs |
| Rate limits | Per class of API_STANDARDS §10: login, OTP request, OTP verify, password reset, refresh, public form (O-08: rate-limited, repeated NID or mobile goes to needs verification, no CAPTCHA), registration, reference lookup, reference read (D-082, D-083, D-088), default, sync |

## 8. File upload rules (FILES_AND_DOCUMENTS.md, O-30)

- Allowed types and size limits per file kind as in FILES_AND_DOCUMENTS (photos JPEG, PNG, WebP; documents PDF, JPEG, PNG, DOCX, XLSX; video only for the media team), checked by content type and magic bytes, not by extension alone.
- Every uploaded file stays quarantined until the ClamAV scan succeeds (O-46 item 7); a pending scan never allows preview, download or publication; infected files are blocked and alerted; a scanner failure is never treated as clean. Exception until T2.1 (D-087): registration and profile photos (JPEG or PNG, at most 2 MB, type by magic bytes, metadata stripped on the server, private `profiles` bucket, served with `nosniff`) may be viewed by their owner and allowed officials before the scanner exists; T2.1 scans them retroactively.
- EXIF capture time and GPS are read and stored as metadata; served images and thumbnails carry no EXIF.
- No file is public; every download goes through the permission check, and the API streams the file itself (`GET /api/v1/files/{fileId}/content`, `Cache-Control: no-store`); there are no signed URLs (D-074, NS-41). A view of an NID photo by an official is audited (`file.nid_viewed`). The only exception is the donor photo links in Qurbani emails, valid 30 days and limited to that donor's animal photos (O-35, NOTIFICATIONS.md); how they are served without signed URLs is settled with T4.4.
- Export files are deleted 30 days after creation (O-30); source records are untouched.
- Identical content is rejected within a project by SHA-256; near duplicates only warn.

## 9. Secrets management

- Secrets: database credentials, MinIO credentials, token signing key, CSRF secret, SMTP credentials, SMS provider credentials, Web Push VAPID keys, backup encryption keys (with a separate key for the profiles bucket).
- They live only in per-environment `.env` files on the server, owned by the service user with mode 600, or in the server's secret store; only `.env.example` without values is in git.
- Different values per environment; staging values never reach production.
- Rotation: at go-live, once a year, when a person with access leaves, and immediately after a suspected incident.
- gitleaks scans every commit in CI and as a pre-commit hook (O-46 item 6). Known false positives (test fixtures that are obviously not secrets) are listed by exact fingerprint in `.gitleaksignore` at the repository root, never by path or rule, so every other finding still fails CI; today two entries: the fixed test cursor secret of `apps/api/test/integration/pagination.test.ts` from T1.6 (2026-10-12), and the made-up device key of the web test fixtures (`apps/web/test/auth.tsx`) in the first commit of T2.7's device key (2026-10-31), replaced in the same task by a plainly fake value so that only the history holds it (2026-11-01). Development security limitation (O-52, 2026-10-11): the local pre-commit hook is not installed yet; CI scans the full git history on every push and the run fails when a secret is found. Local scanning is revisited when a suitable installation method exists.
- Secrets are never logged, never placed in URLs, never sent to the browser except the user's own cookies.
- Claude Code never reads or modifies `.env` files that hold real secrets (CLAUDE.md).

## 10. Logging without sensitive data

- Structured JSON logs with a request id on every line; the same id is returned in error responses (D-057, NFR-52).
- Redacted always: passwords, OTP codes, tokens, cookies, `Authorization` headers, NID and birth-registration numbers, bank details, GPS from photo metadata, and the full request bodies of authentication, registration, beneficiary and payment endpoints. Records are referred to by id.
- Retention: application and access logs 90 days (O-45); metrics according to the monitoring configuration; the audit log permanently (§13).
- Security events (login failures, lockouts, permission denials in bulk, rate-limit hits, revocations, sensitive exports, scanner findings) are logged and the ones listed in §13 are also written to the audit log.
- Alerts reach the Monitoring Team in the app and the IT address by email: 10 lockouts of one account per day, repeated 429 from one IP (O-25), failed jobs, elevated 5xx rate, readiness failures (D-057), infected uploads.

## 11. Dependency and supply-chain security

- The lockfile is committed and installs are frozen in CI.
- `pnpm audit` runs on every push; high and critical findings fail the build; an exception names the package, reason, mitigation and an expiry date in DECISION_LOG (section 7). Active: E-001 (braces, development tooling only, expires 2027-01-11).
- A new dependency needs a reason in the task report, an active maintainer, a compatible licence and a lockfile review.
- Docker base images are pinned by version and updated at least monthly; the server's operating system is patched by the IT team.

## 12. Error handling

- Every error uses the envelope of API_STANDARDS §3 with a stable code, a localized message and the request id.
- Unexpected errors return a generic 500 message; stack traces, SQL, file paths, library names and internal ids never appear in responses.
- Developer detail stays in the server logs (redacted per §10).
- Validation errors name the field and rule, never echo sensitive input back.

## 13. Audit requirements (constitution §13, NFR-43)

Every entry stores the actor, the originating user for jobs and sync, the actor's role, the action code, entity type and id, old and new values, the reason where one is required, IP address and device session, and the time. The `audit_log` table and the other `[L]` log tables are append-only, enforced by a trigger that rejects UPDATE and DELETE (O-46 item 9); entries are kept permanently (BD-46).

| Constitution §13 event | Action codes |
|---|---|
| Permission and role changes | `permission_change`, `permission_change_refused` (refused panel and project-grant changes, including any change aimed at the Main Admin; T1.8), `auth.state_changed`, `auth.system_owner_transferred` |
| Approvals and rejections | `application.approve`, `application.reject`, `application.waitlisted`, `auth.approved`, `auth.rejected`, `beneficiary.correction_decided`, `auth.edit_request_decided` |
| Field unlock | `field.unlock`, `field.updated`, `field.relocked` |
| Blocklist | `blocklist.set`, `blocklist.lift` |
| Transfer | `application.transfer` |
| Handover | `auth.handover_started`, `auth.handover_completed` |
| Merge and merge reversal | `beneficiary.merge`, `beneficiary.merge_reverted` |
| Payments and expense verification | `payment.record`, `expense.claim.verify` (Phase 3) |
| Animal allocation | `animal.allocate`, `animal.deallocate` (Phase 4) |
| Nisab changes | `nisab.change` |
| Deletion | `application.delete` and every soft delete |
| Template changes | `template.create`, `form.publish`, `form.version_created`, `form.ready_create`, `form.place`, `form.take_version`, project template updates |
| Document deadline extensions | `document.deadline_extend` (documentation module, O-34) |
| Deficiency reports | `deficiency.report` (documentation module, O-34) |
| Media consent | `media_consent` |
| Exports of sensitive data | `export.requested` with `sensitive = true`, `file.download_sensitive` |

The audit viewer (SCR-096) is available to the roles with `audit.view`; old and new values are a sensitive class (`audit.detail`). The Phase 5 gate checks that every event above produces an entry (TEST_STRATEGY §9).

## 14. Data retention (BD-46, BR-207)

| Data | Retention |
|---|---|
| Business records, beneficiary history, photos, documents | Permanent; no hard delete (NFR-29, NFR-32) |
| Audit log | Permanent |
| Application and access logs | 90 days (O-45) |
| Generated export files | 30 days (O-30) |
| Synced records on devices | Purged 7 days after confirmed sync (O-29); everything wiped on logout or revocation |
| Backups | Per the backup schedule of RUNBOOK.md (§15) |

The system reports storage growth to the IT team (NFR-30).

## 15. Backup and restore responsibilities (O-06, NFR-34, NFR-35)

- The IT team owns backups and restores (BD-46); developers provide the scripts, schedules and documentation (T3.0, T6.5).
- Targets: RPO 24 hours at first with a daily backup, 1 hour once WAL archiving is enabled; RTO 4 hours.
- Daily encrypted `pg_dump` and a MinIO mirror to a separate location; the profiles bucket encrypted with its own key (O-30); keys stored apart from the backups.
- A restore drill every month on a clean machine, timed against the RTO and recorded in RUNBOOK.md; a full drill is part of the Phase 6 gate.
- A backup counts as verified only after a successful restore.

## 16. Devices and offline data

- The offline outbox and cached data are encrypted at rest with device-bound keys (NFR-42, OFFLINE_SYNC).
- Logout and remote revocation wipe local data; pending records are preserved across credential expiry only in encrypted form and require re-authentication before sync (O-29).
- Volunteers' phones never receive sensitive fields (§2).
- A lost or stolen phone is revoked by the user, the RPM (volunteers in own region), the Monitoring Team or the Department Head (§4, RUNBOOK).

## 17. Privacy

- Collect only the fields a project form needs; the mandatory set is BD-13.
- No notifications are sent to beneficiaries (constitution §4).
- Photos enter the publishable list only with recorded media consent (BD-38).
- Data is visible only within role and scope; bulk and sensitive exports are logged.
- Production data is never copied to test, staging or developer machines (NFR-49).

## 18. Incident response basics (O-45)

| Severity | Examples |
|---|---|
| Critical | Sensitive data exposed, account takeover of an official, malware on the server, data loss |
| High | Suspected unauthorized access, repeated attack traffic, a failed backup chain |
| Medium | A single compromised volunteer phone, a misconfigured permission |

Steps:
1. **Detect** through alerts, user reports ("report a problem", NFR-59) or reviews.
2. **Contain**: revoke sessions, block affected accounts, disable a compromised integration, rotate secrets, isolate the server if needed.
3. **Notify**: the person who detects it informs the IT team lead and the Department Head within 24 hours; the Department Head decides on informing the Foundation's management. Names and phone numbers are written into RUNBOOK.md before production.
4. **Preserve evidence**: keep logs and audit entries; do not wipe affected systems before evidence is copied.
5. **Recover**: restore from verified backups where needed; confirm integrity with the audit log.
6. **Review**: the Monitoring Team and the IT team write an incident record in RUNBOOK.md with cause, impact, actions and follow-ups; policy changes go through DECISION_LOG.

## 19. Secure development and release

- Every change is a task with a plan, tests and a report (constitution §15); security-relevant changes state their security impact in the report.
- CLAUDE.md rules: no secrets in code, logs or commits; no destructive git commands; findings reported, never fixed silently.
- The security tests of TEST_STRATEGY §3.8 run in CI; OWASP ZAP baseline before every gate from Phase 3.
- Before go-live, the internal security audit (T6.3) uses the OWASP ASVS level 2 checklist; an external penetration test is not planned now and is reconsidered before T6.6 if a budget exists (O-45).
- Production releases come from tagged commits that passed the full CI set.

## 20. Pre-production checklist

Run before the first production use and before every major release; each item needs evidence in the gate report (T3.6 pilot go-live, T6.6 go/no-go).

| # | Item | Evidence |
|---|---|---|
| 1 | Real SMS and email gateways configured; dummy OTP off | Configuration check and a real OTP received; startup log shows OTP mode `real` (SMS provider chosen, O-33). Pilot exception (O-49): the Phase 3 pilot may run with the dummy OTP only with the owner's written approval recorded in DECISION_LOG; a real gateway before rollout beyond the pilot region |
| 2 | Seed and test data removed; seed guard active | Query showing no seed marker rows and no demo accounts; guard test |
| 3 | Main Admin protected | Attempts to deactivate, block or strip the Department Head account fail; transfer works only through the audited path |
| 4 | Backups verified by an actual restore | Restore drill record with time against the RTO |
| 5 | Audit logging active for every §13 event | Audit-completeness check output (§13) |
| 6 | Secrets rotated from staging values and stored per §9 | IT team confirmation; gitleaks clean |
| 7 | TLS, security headers and open ports verified | Header and port scan output; HSTS present; only 80 and 443 open |
| 8 | `pnpm audit` clean or exceptions accepted in DECISION_LOG | CI output |
| 9 | No open critical or high findings from T6.3 and T6.4, or each explicitly accepted by the owner | Audit reports |
| 10 | Monitoring alerts tested | Test alert received by the Monitoring Team and the IT address |
| 11 | `JOBS_INLINE` off; workers running with retries and graceful shutdown | Configuration and worker health |
| 12 | Incident contacts written into RUNBOOK.md | RUNBOOK section |

## 21. Exceptions

A deviation from this policy is requested in the task report with the reason, risk, mitigation and duration. It takes effect only after the owner approves it in chat and it is recorded in DECISION_LOG.md with an expiry or review date. Expired exceptions are reviewed at the next gate.
