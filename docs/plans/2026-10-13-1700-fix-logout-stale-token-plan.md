---
title: Logout survives a stale access token and a late refresh (E2E flake of the password test)
type: fix
status: done
source: plan
date: 2026-10-13
---

# Logout survives a stale access token and a late refresh

## Goal
Logging out always ends the server session, and a silent refresh that finishes after a login or logout never signs the old session in again.

## Problem
`apps/web/e2e/auth.spec.ts` "changes the password and logs in with the new one" (desktop) failed once in about six full `pnpm e2e` runs: after the logout click the next `page.goto('/login')` showed the signed-in home page.

Cause found by reading the code and the specs:
- `logout()` in `apps/web/src/lib/api.ts` calls `POST /auth/logout` with `retry = false`. When the access token is `auth.token_stale` (the user's `permissionVersion` was bumped) or `auth.token_expired`, the call answers 401, is not retried after a refresh, and the server session is never revoked. The `finally` still wipes the device and navigates to the login page, but the refresh cookie survives, so the next page load restores the session silently.
- `admin-permissions.spec.ts` changes the permissions of `executive@example.org`, the very account the password test uses (`ACCOUNTS.desktop.change`). Both run in parallel workers, so the bump can land between the login and the logout of the password test. In real use the same happens when an official's permissions change while they are signed in, and the user then presses "logout".
- Second, related defect (the hypothesis of the task): `refreshOnce` guards the failure path with the `generation` counter but not the success path, so a refresh that started before a logout or a login and succeeds after it calls `accept()` and signs the old session in again.

## Requirements
- **R1** `logout()` refreshes the token once when the logout call answers `auth.token_stale` or `auth.token_expired`, then repeats the call, so the server session is revoked.
- **R2** A refresh that started before a login or logout and succeeds after it returns `null` and changes neither the token nor `me`.
- **R3** Unchanged: the token stays in memory only, the logout wipes local data and the generation counter still increments, and a logout whose request fails (network) still wipes the device and rethrows.

## Scope
- In: `apps/web/src/lib/api.ts`, `apps/web/src/lib/api.test.ts`, docs/STATUS.md.
- Out: the API, the logout contract, the E2E spec accounts (the shared account stays; the product bug is fixed instead of hiding it in the test). Reported, not changed: a logout whose request never reaches the server (offline) leaves the refresh cookie; closing that needs a server-side change decided by the owner.

## Tests
- Unit (`api.test.ts`): logout with `auth.token_stale` refreshes and repeats with the new token; a refresh that succeeds after a logout does not sign in; the same after a login of another session.
- Existing unit tests, lint and typecheck of `@css/web`; the E2E files `auth.spec.ts` and `admin-permissions.spec.ts` together on desktop, repeated.
