# SECURITY POLICY

Status: outline, written in task T0.1 (2026-10-10); completed in task T0.21. Sources: blueprint B8, constitution §13, NFR section 8; decisions O-05 (authentication parameters), O-06 (backup targets), O-08 (public form: rate limit, needs verification, no CAPTCHA).

## 1. Data classification
Public, internal, sensitive (NID and photos, bank details, mobile numbers, GPS, donor data, ratings and categories, blocklist reasons, official section); handling rules per class on screens, exports, logs and backups.

## 2. Authentication and session policy
Password rules, lockout, token lifetimes, device sessions, OTP policy (from AUTH.md once decided).

## 3. Authorization policy
Default deny, server-side checks, scope filters, field-level protection, permission panel audit (RBAC.md).

## 4. Application security baseline
OWASP controls: input validation, output encoding, CSRF, XSS, injection, secure headers, dependency scanning, secrets management, error handling.

## 5. File security
Upload validation, virus-scan hook, signed URLs, no public links, EXIF handling.

## 6. Audit and monitoring
Mandatory audit events, retention, review of security events, alerting on anomalies (duplicate NID attempts, repeated failed logins).

## 7. Backup and recovery
RPO/RTO, backup encryption and location, restore drills (links to RUNBOOK.md).

## 8. Privacy
Minimum collection, no notifications to beneficiaries, media consent, export logging, data for other departments only within role and scope.

## 9. Secure development and release
Code review, security tests before each gate (authorization matrix, IDOR, upload), production hardening checklist (Phase 6), incident response contacts and steps.

## 10. Exceptions
How a deviation from this policy is requested, approved and recorded in DECISION_LOG.
