# AUTHENTICATION AND SESSIONS

Status: outline, written in task T0.1 (2026-10-10); completed in task T0.9. Depends on open question 5 (password, token lifetimes, lockout, OTP at login).

## 1. Identities
Staff users and volunteer users; mobile number as the volunteer login id (BR-025); email for staff; the Department Head account protection (BR-035).

## 2. Registration and OTP
Two separate OTPs (mobile and email) before the form (BR-023); dummy OTP in dev/test only (BR-024); OTP delivery through the SMS adapter and SMTP; rate limits.

## 3. Login
Mobile/email plus password; failed-attempt lockout; password rules; password reset flow with OTP.

## 4. Tokens and sessions
Access and refresh tokens, lifetimes, rotation; device sessions (`device_sessions`), last seen, revocation by an official for lost phones (BR-201); session refresh on role or permission change.

## 5. Authorization hand-off
What the token carries and what is resolved per request from `docs/security/RBAC.md` (roles, project assignments, scopes); never trusting the client.

## 6. Offline considerations
Token validity while offline, re-authentication after expiry without losing the outbox, wiping local data on logout or revocation.

## 7. Audit and security events
Logged events: login success/failure, lockout, OTP issue and verification, password reset, session revocation.

## 8. Threats and mitigations
Credential stuffing, OTP abuse, token theft, device loss, session fixation; references to `docs/security/SECURITY_POLICY.md`.
