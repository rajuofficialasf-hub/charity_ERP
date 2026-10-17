---
title: Officials created by the admin, login by job ID, department staff apart, organogram
status: in-progress
source: plan
date: 2026-10-17
---

# Officials created by the admin, login by job ID, department staff apart, organogram

## Goal
Volunteers keep self-registration and mobile login. Officials no longer sign up: the Department Head or the Monitoring Team creates the account, a single-use link (72 hours, emailed and copyable) lets the person set a password, and the official logs in with the job ID (email or mobile also work). People from other departments of the Foundation and outside partners can be given accounts, but the department's own staff stay apart and are shown by program as an organogram.

## Requirements
- R1 New official self-registration ends; pending staff registrations are still decided; self-registered officials stay.
- R2 Only holders of `user.create` (the global roles by default) create an official with job ID, name, designation, email, optional mobile, affiliation (+ unit), program, division, supervisor and one official role (not the Department Head role).
- R3 The link: 256-bit random token stored hashed, 72 hours, single use, emailed and returned once to copy; a new link revokes the open one and only while no password is set.
- R4 Using the link sets the password under the role's rules and activates the account; expired, used or revoked links are refused.
- R5 Login by job ID (case-insensitive), email or mobile; password reset accepts the job ID too.
- R6 Affiliation `department` / `foundation` / `external`; existing staff are department staff.
- R7 The profile (job ID, name, designation, affiliation, program, division, supervisor) is edited by `user.profile.manage`, for existing officials too; supervisor chains never loop.
- R8 Staff directory: department staff, other departments and outside partners in separate tabs, with filters.
- R9 Organogram per program, computed from roles, home program, supervisor and division; department staff only.
- R10 Every creation, link, acceptance and profile change is audited.

## Key decisions
DECISION_LOG D-097 (owner answers in chat, 2026-10-17).

## Implementation units

### U1 Migration, shared schemas, seed, D-097
- Status: done
- Files: `apps/api/prisma/migrations/20261017120000_official_accounts/{migration.sql,down.sql}`, `apps/api/prisma/schema.prisma`, `packages/shared/src/auth/staff.ts` (+ test), error messages, demo seed job IDs and supervisors, DECISION_LOG D-097.
- Tests: unit (job ID, mobile clash, unit rule, token); integration `migrations.test.ts` (down.sql and drift), `seed.test.ts`.
- Size: M · Risk area: migration, auth · Depends on: —

### U2 Create, link, accept, login by job ID, staff self-registration closed
- Status: done
- Files: `apps/api/src/services/staff-accounts.ts` (new), `routes/users.ts`, `routes/auth.ts`, `services/auth.ts`, `auth/login-id.ts`, `services/registration.ts`, `notifications` email template, permissions.yaml, openapi.yaml.
- Tests: integration (create 201 with link, 403 for an RPM, 409 job ID or email taken, role rules; link 404/410, single use, resend revokes; accept activates with role password length; login by job ID in any case, by email and by mobile; reset with job ID; staff start refused, pending staff decision still works).
- Size: L · Risk area: auth · Depends on: U1

### U3 Profile edit, list filters, organogram API
- Status: done
- Files: `services/staff-accounts.ts`, `services/users.ts`, `services/organogram.ts` (new), routes, openapi.yaml.
- Tests: integration (profile audited with If-Match, supervisor loop refused, list by affiliation/program/role, organogram has department staff only, places by home program or supervisor chain).
- Size: M · Risk area: auth · Depends on: U2

### U4 Web staff directory, create dialog, copy link, profile edit
- Status: todo
- Files: `apps/web/src/admin/staff/*`, `navigation.ts`, routes, i18n.
- Tests: component (tabs, create shows link and copy, edit, refusals).
- Size: L · Risk area: — · Depends on: U3

### U5 Web invite page, login label, register volunteer-only
- Status: todo
- Files: `apps/web/src/features/auth/InvitePage.tsx`, `LoginForm.tsx`, `features/registration/RegisterPage.tsx`, routes, i18n.
- Tests: component (valid link, expired link, password rules, success to login).
- Size: M · Risk area: auth · Depends on: U2

### U6 Web organogram
- Status: todo
- Files: `apps/web/src/admin/staff/OrganogramPage.tsx`, css, i18n.
- Tests: component (tree by program, not placed, phone width).
- Size: M · Risk area: — · Depends on: U3

### U7 E2E and documents
- Status: todo
- e2e: `/admin/staff` as head@example.org → "নতুন অফিসিয়াল" → fill → "লিঙ্ক কপি করুন" → open the link in a new context → set the password → log in with the job ID → the official is in the organogram; an outside partner is not.
- Docs: AUTH.md, BUSINESS_RULES (BR-028, BR-261 to BR-263), RBAC.md, AUTHORIZATION_MATRIX, DATABASE_SCHEMA, ERD, SCREENS, DEMO_ACCOUNTS, STATUS, CLAUDE.md map.
- Size: M · Risk area: — · Depends on: U4, U5, U6

## Checkpoints
- C1 after U3 (API complete; auth risk).
- C2 after U7 (web, E2E, whole branch).

## Verification
`pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm --filter @css/api exec vitest run --config vitest.db.config.mts`, `pnpm docs:check`, `pnpm --filter @css/api authz:matrix`, `pnpm e2e`; dev DB `pnpm db:migrate`.

## Progress
- Branch: feat/official-accounts-organogram (from feat/templates-consent-assignment, stacked on PR #4)
- Next: U4 the staff directory screen
- Reviewed through: C1 at the C1 fix commit (U1 to U3)
- Uncommitted: —
- Notes: C1 review fixed: lock order users then link in accept; an unchanged supervisor stays valid; supervisor changes take one advisory lock and the organogram puts members of a loop at the top; emailed flag apart from the send; no SMTP message with an address in the log; a corrected email with a new link; the profile and the new link need GLOBAL scope. Kept on purpose: decision and rule ids in comments and test names (the repository's own convention, CLAUDE.md asks code to read like the surrounding code); guessable job IDs can lock an account like an email or mobile can (reported to the owner). The set-password token travels in the URL fragment (`/invite#token`) and in request bodies, never in a path, so no access log keeps it; `APP_ORIGIN` builds the link (https in production); SMTP calls time out after 10 s so a dead mail server never holds a create request. Staff registration tests now use drafts or pending accounts written in the database (the API refuses new ones). Job IDs are stored in capitals (CHECK) instead of an expression index, so the unique index stays a plain partial one Prisma can describe; a BEFORE INSERT trigger gives staff rows without an affiliation `department`.
- Updated: 2026-10-17
