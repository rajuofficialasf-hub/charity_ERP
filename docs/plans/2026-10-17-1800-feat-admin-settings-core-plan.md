---
title: Admin and settings, core (T1.13)
type: feat
status: in-progress
doc_review: 2026-10-17
source: brainstorm
date: 2026-10-17
---

# Admin and settings, core (T1.13)

## Goal
The Department Head and the Monitoring Team run the system's settings from the admin area: the organisation's details, the language defaults, the notification channels with an unmistakable warning while the dummy OTP is on, the monitoring thresholds, the expense category and issue type lists, the audit log with its filters, every active device session and the health of the system; Program Managers and above keep the versioned nisab. Every change is audited and the Main Admin stays protected.

## Problem
Settings exist only as seed rows and environment values; nobody can change a threshold, add an expense category or a nisab version, read the audit log or see who is signed in on which device without a database tool. Phase 4 (zakat) needs the versioned nisab, and the monitoring work of Phase 5 needs the thresholds. `docs/PLAN.md` T1.13 asks for this core now; the rest of the admin library follows in T6.2.

## Requirements

### Access (all pages)
- **R1** Each admin page and each endpoint answers only to holders of its permission (server-side, default deny); the pages are hidden from everyone else. The Main Admin's own data and sessions cannot be changed by others.
- **R2** Every change on these pages writes an audit entry with the old and the new value and the actor.

### Organisation settings
- **R3** The Department Head and the Monitoring Team (`settings.manage`) edit the Foundation's and the department's names in Bengali and English, the address in Bengali and English, a contact phone and a contact email; each value is validated (phone 01XXXXXXXXX, email format, lengths). Every signed-in user can read them (they head reports and emails later). The logo stays a file in the repository.

### Localization defaults
- **R4** The same roles set the default language (bn or en) used for a visitor without a choice and for a new official created without one. ~~The Hijri date switch~~ (dropped: O-43 withdrew the Hijri date; the owner confirmed on 2026-10-17).

### Notification channels
- **R5** The SMTP settings (host, port, secure, sender, whether a login is set) are read from the environment and shown read-only; no password or secret ever leaves the server.
- **R6** The SMS settings screen (`provider.settings.manage`) stores the provider-agnostic adapter configuration (provider, sender ID, on or off, the provider's endpoint where it needs one); the provider's key stays only in the server's environment and the screen shows only whether it is present. Until a real provider exists (O-33) the stub adapter keeps logging.
- **R7** Whether the dummy OTP is on is shown on the channels page and on the health page; while it is on, a red warning says that it must be off and real SMS and email connected before production (BD-44, BD-49).

### Nisab
- **R8** Program Managers and above (`nisab.set`) see the nisab versions newest first, with the version in force today marked, and add a version: an amount in Taka above zero and at most 1,00,00,000, an effective date of today or later, at most one year ahead and after the latest version's, and an optional basis note. A version is never edited or deleted. A version that has not taken effect yet can be withdrawn by the same roles with a reason (audited); a withdrawn version stays in the list, marked, and no longer counts as the latest. A version that has taken effect never changes.
- **R9** The API answers which nisab was in force on a given date, so the zakat verification of Phase 4 can store it on the application (`applications.nisab_version_id`); stored values never change afterwards.

### Monitoring thresholds
- **R10** The Department Head and the Monitoring Team (`settings.manage`) set the thresholds: review pending days (default 7), approval pending days (5), no-update days (7), inactive volunteer days (14), budget use percent (90) (O-04); each within a sensible range; the monitoring work reads them later.

### Lists
- **R11** The same roles keep the expense category list and the issue type list: add an item (code and labels in Bengali and English), relabel it, put it in order, deactivate or activate it; an item is never deleted and its code never changes, so old records keep their meaning.

### Audit log
- **R12** The Department Head and the Monitoring Team see the audit log newest first, filtered by actor, entity type, entity id, action and date range, read page by page; an entry shows the time, actor, action, entity, reason, IP and device, and the old and new values side by side.
- **R13** From an entry or an entity, one press shows the whole history of that entity (entity drill-down).

### Sessions
- **R14** The Department Head and the Monitoring Team see every active device session (person, account kind, device name and platform, app version, last seen, started) with a search by person, and end one with a reason; the Main Admin's sessions are ended only by the Main Admin. The RPM keeps ending the sessions of volunteers in the own region from the volunteer profile, as today (O-25).

### System health
- **R15** The Department Head and the Monitoring Team see the state of the database, the file storage and the job queue, the app version, the dummy OTP state, and the storage growth: the number and size of stored files in total, by kind and by month for the last twelve months (BD-46).

## Scope
- In: the pages and endpoints above, their permissions, audit, i18n (bn/en), tests and `openapi.yaml`.
- Out (not now):
  - the notification template preview and user channel preferences (T1.14);
  - audit export (`audit.export`) and the audit history inside PM and RPM pages (their tasks);
  - a real SMS provider (O-33), the holiday calendar editor and the document checklist editor (T5.4, O-34);
  - the monitoring alerts that use the thresholds (Phase 5) and the zakat verification that uses the nisab (Phase 4);
  - the remaining admin library (T6.2).

## Key decisions
- **Organisation settings**: names, address and contact only; the logo stays a file (owner, 2026-10-17). Governs R3.
- **SMS secrets**: only in the server's environment; the screen shows whether the key is present (owner, 2026-10-17; security first). Governs R6.
- **Audit viewer**: the Department Head and the Monitoring Team only for now; PM and RPM see histories inside their own pages in later tasks (owner, 2026-10-17). Governs R12, R13.
- **Thresholds**: changed by the Department Head and the Monitoring Team only (`settings.manage`, no role default; the panel can grant it) (owner, 2026-10-17). Governs R10, R11, R3, R4 (the writes; who reads which key is in Technical decisions).
- **Nisab dates**: a new version takes effect today or later and after the latest one; versions are never edited or deleted (owner, 2026-10-17). A mistaken entry must not block later versions, so the effective date is at most one year ahead, the amount has an upper limit, and a version not yet in effect can be withdrawn with a reason (owner, doc review 2026-10-17). Governs R8.
- **Sessions**: the global roles see and end every session; the RPM keeps the own-region volunteer sessions from the profile (O-25; owner, 2026-10-17). Governs R14.

## Success criteria
The four checks of `docs/PLAN.md` T1.13 pass by hand: the nisab version list shows the effective dates; a threshold can be changed and is audited; the dummy OTP warning is red and visible; the audit viewer filters by actor, entity, action and dates.

## Open questions
None blocking. Each new decision above is recorded in `docs/DECISION_LOG.md` before implementation.

## Technical decisions
- **Stack profile**: unchanged (CLAUDE.md "Stack profile"); no new library and no new table (one migration adds columns and an index, U1). The tables `settings`, `reference_lists`, `nisab_versions`, `audit_log`, `device_sessions`, `files` and the column `applications.nisab_version_id` already exist (T1.2).
- **Settings as typed keys**: one zod schema and one default per key in `@css/shared/settings` (`organisation`, `localization`, `monitoring.thresholds`, `sms.provider`). The API validates every write against the key's schema, answers the default while no row exists, and audits `settings.change` with old and new (contract `x-audit`; BR-179). An unknown key answers 404. The base seed writes the defaults (O-04 values).
- **Permissions** (existing names in `permissions.yaml`, none renamed):
  - `settings.manage`: organisation, localization, thresholds and lists (the contract's operations; RBAC.md lists thresholds under it). No role default, so only the global roles hold it unless the panel grants it (owner decision). `alert.settings.manage` is left for the alert settings of the monitoring work (Phase 5) and is not used here.
  - `provider.settings.manage`: the channels page and the SMS config.
  - `nisab.set`: PM at GLOBAL and the global roles.
  - `audit.view` (`GET /audit-log`) and `session.revoke_user` (`GET /sessions/active`): the new viewers declare `scope: 'global'` (as `POST /users` does), so the PM's PROGRAM and the RPM's REGION defaults do not open them (owner decision); the RPM's own-region revoke on the volunteer profile stays.
  - New `system.health.view` (no role default; module M21) for the health page.
  - Kept in sync in RBAC.md and the authorization matrix in the unit that adds each route (NE-SEC default deny).
- **Who reads which setting**: `GET /settings` (`settings.manage`, global) returns `organisation`, `localization` and `monitoring.thresholds`; `sms.provider` is read and written only through `/admin/channels` (`provider.settings.manage`). Every visitor and signed-in user reads the organisation's public details (names, address, phone, email) and the default language through `GET /public/settings`; nothing else is public.
- **Plan IDs**: the plan's IDs (R-, U-, D-, BR-, O-) stay in this plan and the docs; code comments, test names and identifiers describe the behaviour in words.
- **Secrets**: SMTP values come from `env`; the API returns host, port, secure, sender and whether a login is set, never the password. The SMS key lives only in a new optional env value `SMS_API_KEY`; the API returns `keyPresent: boolean` only (owner decision; no secrets in responses or logs).
- **SMS endpoint**: optional; the schema accepts only an `https:` URL whose host is a name or a public address (loopback, private, link-local and `localhost` refused), so a stored value cannot point the server at an internal host (NE-SEC-08). When a real provider is chosen (O-33) its adapter adds a host allowlist.
- **Audit viewer**: keyset pages ordered by (`created_at` desc, `id`) with cursors bound to the caller (`core/pagination.ts`). A date range is required (default the last 30 days, at most 366 days) so the monthly partitions are pruned (DATABASE_SCHEMA). The existing indexes all start with entity, actor or action, so U1's reversible migration adds an index on (`created_at` desc, `id` desc) for the unfiltered view (DB-MIG-07). The drill-down is the same list filtered by entity type and id. Actor names are joined for display. The global roles may see the personal data in old and new values; as a safety net the service drops any key that names a secret (password, hash, token, secret, otp, at any depth) before answering, and audit values are never written to the application log (NE-LOG-02).
- **Nisab withdrawal**: `nisab_versions` gains `withdrawn_at`, `withdrawn_by` and `withdraw_reason` (all set together or none, CHECK); the unique effective date becomes partial on versions not withdrawn, so a corrected version can take the same date. Adding takes a transaction-level advisory lock, so two adds at once cannot both pass the "after the latest" check. The amount limit is a named constant in `@css/shared/settings`.
- **Rate limits**: the admin reads and writes use the `default` class; `GET /public/settings` uses `reference-read` (`apps/api/src/rate-limit/rate-limit.ts`, by IP). The storage figures of the health page are cached in memory for 60 seconds.
- **Sessions monitor**: a new list of active sessions (not revoked, not expired) for the global roles with a person search. Each row carries only the session id, the person (id, name, account kind), device name, platform, app version, started and last seen; never a token, refresh hash or IP. The Main Admin's sessions are listed but cannot be ended by others. Ending a session reuses `POST /users/{userId}/sessions/{sessionId}/revoke` with its Main Admin protection (`services/sessions.ts`).
- **Health**: the `HealthService` checks plus the app version, the dummy OTP flag, the last month that has an `audit_log` partition, and storage growth from `files` (count and bytes in total, by kind, and by month for 12 months; rows with `deleted_at` set are left out). The page reads `files` live; `storage_stats` stays for the periodic snapshot job of the growth report, which does not exist yet.
- **Localization**: a public `GET /public/settings` (no session; the `reference-read` rate class) returns the default language and the organisation's public details. The PWA uses that language when the device has no choice yet (`i18n/locale.ts`). A new official created without a language takes it; a volunteer keeps the language of the registration request. No Hijri date (O-43).

## Implementation units

### U1. Shared settings schemas, defaults, seed and decision record
- **Goal:** the typed setting keys, their defaults and the request schemas exist in one place, and the defaults are seeded.
- **Requirements:** R3, R4, R6, R8, R10, R11 (contracts)
- **Files:** `apps/api/prisma/migrations/<timestamp>_admin_settings_core/{migration.sql,down.sql}` (+ `schema.prisma`: the `audit_log` index on (`created_at` desc, `id` desc); the nisab withdrawal columns, CHECK and partial unique), `packages/shared/src/settings/index.ts` (+ `settings.test.ts`; export `./settings` in `packages/shared/package.json`), `packages/shared/src/i18n/messages/{bn,en}/errors.json`, `apps/api/seed/sets/base/settings.ts` (+ `base/index.ts`), `docs/DECISION_LOG.md` (D-098: the owner's T1.13 decisions), `docs/BUSINESS_RULES.md` (BR-173 values, BR-211, BR-213)
- **Approach:** follow `packages/shared/src/auth/staff.ts` (zod schemas with message codes), `apps/api/seed/sets/base/reference-lists.ts` (seed by upsert), and the migration `20261017120000_official_accounts` with its hand-written `down.sql` (DB-MIG).
- **Tests:**
  - unit: each key's schema accepts its default and refuses out-of-range values (thresholds 1 to 365 days, budget 1 to 100 %), a bad phone or email, a language other than bn/en; the nisab schema refuses 0, an amount over the limit and a non-money string; the withdraw schema needs a reason; the list item code pattern `^[a-z][a-z0-9_]{1,40}$`.
  - integration: `seed.test.ts` finds the four setting rows with the O-04 values; `migrations.test.ts` applies the migration and its `down.sql`; a withdrawn version with the same effective date as a new one is allowed, two live ones are not; withdrawal columns set only together.
- **Done when:** the schemas are exported, the migration applies and reverses, the seed writes the defaults, D-098 is recorded.
- **Depends on:** none · **Size:** M · **Risk area:** migration
- **Status:** done

### U2. API: settings, lists, nisab, public settings
- **Goal:** the contract's settings, reference-list and nisab operations work, plus the public settings and the nisab in force on a date.
- **Requirements:** R1, R2, R3, R4, R8, R9, R10, R11
- **Files:** `apps/api/src/services/{settings,reference-lists,nisab}.ts`, `apps/api/src/routes/settings.ts`, `apps/api/src/container.ts`, `apps/api/src/app.ts`, `docs/api/openapi.yaml` (adjust the existing operations; add `GET /public/settings`, `GET /nisab-versions/in-force` and `POST /nisab-versions/{id}/withdraw`), `docs/security/AUTHORIZATION_MATRIX.md`, `apps/api/test/integration/{settings,nisab}.test.ts`
- **Approach:** follow `routes/programs.ts` with `services/programs.ts` (defineRoute, audit, ApiError, P2002 mapping); money through the paisa helpers of `@css/shared/projects`.
- **Tests:**
  - integration, settings: GET returns `organisation`, `localization` and `monitoring.thresholds` with their defaults and never `sms.provider`; PATCH a threshold → 200 and an audit entry with old and new; out of range → 422 naming the field; unknown key → 404; PATCH `sms.provider` here → 404 (own route in U4); a PM, an RPM and a volunteer → 403 on both GET and PATCH.
  - integration, lists: GET for any signed-in user; add, relabel, reorder, deactivate (`settings.manage`); a duplicate code → 409; a list other than `expense_category_default` or `issue_type_default` → 404; nothing is deleted.
  - integration, nisab: newest first with `inForce`; a PM adds → 201 and audit `nisab.change`; a date before today (Dhaka), more than one year ahead, or not after the latest version that is not withdrawn → 422 `nisab.effective_date`; an amount over the limit → 422; two adds at once → one 201 and one 422; withdraw a future version with a reason → 200, audit `nisab.change`, a new version may then take that date; withdraw a version already in effect → 409 `nisab.in_effect`; an RPM → 403 on add and withdraw; `in-force?date=` picks the right version, skips withdrawn ones, and answers 404 before the first one.
  - integration, public: without a session → the default language and the organisation's details only, no thresholds and no SMS config.
- **Done when:** the drift test and the matrix pass with the new operations.
- **Depends on:** U1 · **Size:** L · **Risk area:** auth (permissions on admin writes)
- **Status:** done

### U3. API: audit viewer and active sessions
- **Goal:** the global roles read the audit log with filters and drill-down, and list and end active sessions.
- **Requirements:** R1, R12, R13, R14
- **Files:** `apps/api/src/services/{audit-log,session-monitor}.ts`, `apps/api/src/routes/{audit,session-monitor}.ts`, `docs/api/openapi.yaml` (`GET /audit-log`, `GET /sessions/active`), `docs/security/AUTHORIZATION_MATRIX.md`, `apps/api/test/integration/{audit-log,session-monitor}.test.ts`
- **Approach:** list, filters and keyset as `services/users.ts` `list`; `GET /audit-log` requires `audit.view` and `GET /sessions/active` requires `session.revoke_user`, both declared at global scope; ending a session uses the existing revoke route through `services/sessions.ts`; the list uses the `created_at` index of U1's migration.
- **Tests:**
  - integration, audit: actor, entity type, entity id, action and range combine; newest first; cursor pages without gaps or repeats; a range over 366 days → 422; the actor's name is joined; a PM holding the PROGRAM default of `audit.view` → 403; an entry whose old or new value holds a `passwordHash` or `token` key answers without that key.
  - integration, sessions: only active sessions (not revoked, not expired) with the person and the device; search by name; a global role ends another official's session with a reason (audit `auth.session_revoked_by_official`); ending the Main Admin's session → 409 `user.system_owner_protected`; an RPM → 403 on the list; no row carries a token, refresh hash or IP.
- **Done when:** both lists answer within the existing bounded read on the dev seed, and the authorization matrix includes both routes.
- **Depends on:** U1 · **Size:** L · **Risk area:** auth, personal data
- **Status:** done

### U4. API: notification channels and system health
- **Goal:** the channels page reads SMTP and the dummy OTP state and writes the SMS adapter config; the health page reads the checks and the storage growth.
- **Requirements:** R5, R6, R7, R15
- **Files:** `apps/api/src/services/{channels,system-health}.ts`, `apps/api/src/routes/admin-system.ts`, `apps/api/src/config/env.ts` (+ `SMS_API_KEY`; `.env.example`), `docs/security/permissions.yaml` (`system.health.view`), `docs/security/RBAC.md` (the new permission), `docs/security/AUTHORIZATION_MATRIX.md`, `docs/api/openapi.yaml` (`GET /admin/channels`, `PUT /admin/channels/sms`, `GET /admin/health`), `apps/api/test/integration/admin-system.test.ts`
- **Approach:** the checks of `health/service.ts`; `files` (not deleted) grouped by kind and by month in one SQL query each, cached for 60 seconds.
- **Tests:**
  - integration: channels returns SMTP without the password and `smsKeyPresent` false or true by env; the response never contains the values of `SMTP_PASSWORD` or `SMS_API_KEY`; PUT validates and audits `settings.change`; an endpoint that is not `https:` or points at `localhost`, a loopback or a private address → 422; a PM → 403.
  - integration: health returns the three checks, `otpDummy: true` in test, the last audit partition month, and storage totals by kind and month from seeded files, a deleted file left out; a PM → 403.
- **Done when:** the checks, the growth figures and the dummy flag show on the dev database, and the authorization matrix includes the three routes.
- **Depends on:** U1 · **Size:** M · **Risk area:** security (secrets)
- **Status:** done

### U5. Localization defaults in effect
- **Goal:** the default language greets visitors and new officials (the Hijri part was dropped, O-43).
- **Requirements:** R4
- **Files:** `apps/web/src/i18n/{locale.ts,LocaleProvider.tsx}` (+ `LocaleProvider.test.tsx`), `apps/web/src/lib/public-settings.ts`, `apps/web/test/msw/handlers.ts`, `apps/api/src/services/{staff-accounts,registration}.ts` (the language default), `packages/shared/src/auth/staff.ts`, tests beside each
- **Approach:** the cached default sits next to the device choice in `i18n/locale.ts`; `usePublicSettings` (TanStack Query) feeds `LocaleProvider`.
- **Tests:**
  - integration: a new official gets the default language when none is sent; a volunteer keeps the registration language.
  - component: a device without a stored language starts in the server's default.
- **Done when:** a device without a choice opens in the default language set by the admin.
- **Depends on:** U1, U2 · **Size:** M · **Risk area:** none
- **Status:** done

### U6. Web: the settings page
- **Goal:** `/admin/settings` with the tabs প্রতিষ্ঠান, ভাষা, থ্রেশহোল্ড, তালিকা, নোটিফিকেশন চ্যানেল.
- **Requirements:** R1 to R7, R10, R11
- **Files:** `apps/web/src/admin/settings/*` (page, a form per tab, `settings-api.ts`, `settings.test.tsx`), `admin/navigation.ts` (সেটিংস), `admin/roles.ts`, `routes/index.tsx`, i18n `admin` namespace (bn and en)
- **Approach:** tabs as `admin/registrations/`; forms and lists as `admin/programs/ProgramDialog.tsx` and `admin/staff/StaffPage.tsx`; the dummy OTP warning as a danger `Alert`.
- **Tests:**
  - component: each tab loads and saves, showing the server's field messages; the list tab adds, relabels and deactivates; the channels tab shows SMTP read-only, whether the key is set, and the red dummy OTP alert; a PM gets the forbidden content.
- **Done when:** every tab works at 360 px and on a desktop.
- **Depends on:** U2, U4 · **Size:** L · **Risk area:** none
- **Status:** todo

### U7. Web: nisab
- **Goal:** `/admin/nisab` with the nisab in force, the versions with their effective dates, the add dialog, and "প্রত্যাহার" with a reason on a version not yet in effect.
- **Requirements:** R8
- **Files:** `apps/web/src/admin/nisab/*`, navigation, roles, routes, i18n
- **Approach:** `admin/programs/ProgramsPage.tsx` and `ProgramDialog.tsx`; amounts through the shared money formatter.
- **Tests:**
  - component: the list shows the effective dates and marks the version in force; adding with a past date shows the server's message; withdrawing sends the reason and marks the row; a version in effect has no withdraw button; an RPM gets the forbidden content.
- **Done when:** a PM adds a version and sees it in the list.
- **Depends on:** U2 · **Size:** M · **Risk area:** none
- **Status:** todo

### U8. Web: audit viewer
- **Goal:** `/admin/audit` with the filters, the entry detail (old and new side by side) and the entity drill-down.
- **Requirements:** R12, R13
- **Files:** `apps/web/src/admin/audit/*`, navigation, roles, routes, i18n
- **Approach:** list and filters as `admin/volunteers/` (filters in the URL, `TableToolbar`, keyset pages); the detail in a `Drawer`.
- **Tests:**
  - component: the filters land in the request; the drawer shows the old and new values; "এই বিষয়ের পুরো ইতিহাস" sets the entity filter.
- **Done when:** a threshold change is found by its action and its date range.
- **Depends on:** U3 · **Size:** M · **Risk area:** none
- **Status:** todo

### U9. Web: sessions and health
- **Goal:** `/admin/sessions` (active sessions, search, end with a reason) and `/admin/health` (checks, version, dummy OTP, audit partitions, storage growth).
- **Requirements:** R14, R15, R7
- **Files:** `apps/web/src/admin/{sessions,health}/*`, navigation, roles, routes, i18n
- **Approach:** sessions as the volunteer profile's session section and `projects/ReasonDialog.tsx`; health with the stat cards, `Badge` and a table.
- **Tests:**
  - component: ending a session sends the reason; the Main Admin refusal shows its message; health shows a failed check in red and the storage figures in English digits.
- **Done when:** both pages work at 360 px.
- **Depends on:** U3, U4 · **Size:** M · **Risk area:** none
- **Status:** todo

### U10. E2E and documents
- **Goal:** the four checks of PLAN T1.13 run in the browser, and the documents match the code.
- **Requirements:** all
- **Files:** `apps/web/e2e/admin-settings.spec.ts`, `docs/ui/SCREENS.md` (new SCR ids for settings, nisab, audit viewer, sessions, health), `docs/security/RBAC.md` (the admin pages' text), `docs/api/API_STANDARDS.md` (error codes), `docs/database/DATABASE_SCHEMA.md` (setting keys, the nisab withdrawal, the audit index), `docs/STATUS.md`, the CLAUDE.md map
- **Tests:**
  - e2e (desktop and phone; the Department Head, or the Monitoring Team on a phone):
    - `/admin/settings` → tab "থ্রেশহোল্ড" → set "রিভিউ অপেক্ষার দিন" to 8 → "সংরক্ষণ করুন" → "সেটিংস সংরক্ষিত হয়েছে।"
    - `/admin/settings` → tab "নোটিফিকেশন চ্যানেল" → the red alert "ডামি OTP চালু আছে" is visible.
    - as a PM: `/admin/nisab` → "নতুন নিসাব" → an amount and an effective date after the latest → "সংরক্ষণ করুন" → the new row with its date.
    - `/admin/audit` → action filter "settings.change" and today's range → the threshold change, old 7 and new 8 in the detail.
    - `/admin/sessions` → the own session listed; `/admin/health` → "ডাটাবেস" ok.
- **Done when:** the spec passes with `--repeat-each 3` and with `--workers 1`; `docs:check` passes.
- **Depends on:** U6, U7, U8, U9 · **Size:** M · **Risk area:** none
- **Status:** todo

## Checkpoints
- **Mode:** grouped (one by one 8, grouped 9, all at once 0; N is over 4, so one by one's points go to grouped: 17)
- **Signals:** N 10, L about 2,400, R 4, Fd 4, C 4, P 1
- **C1** after U1: risk (migration) and foundation for U2 to U5
- **C2** after U2: risk (auth) and foundation for U5 to U7
- **C3** after U3: risk (auth, personal data) and foundation for U8, U9
- **C4** after U4: risk (secrets) and foundation for U6, U9
- **C5** after U5: new pattern (the server default language in the PWA; the Hijri part dropped)
- **C6** after U8: size (U6 to U8 near 700 lines and over 20 files)
- **C7** after U10: the end; scripted checks on the whole branch

## Verification
- `pnpm typecheck`
- `pnpm lint`
- `pnpm test`
- `pnpm --filter @css/api exec vitest run --config vitest.db.config.mts`
- `pnpm docs:check`
- `pnpm --filter @css/api authz:matrix`
- `pnpm e2e` (or, after a build, `npx playwright test e2e/admin-settings.spec.ts` in `apps/web`)
- dev database: `pnpm db:seed --set base`

## Risks and rollback
- One migration adds an index on `audit_log` and the nullable nisab withdrawal columns (its `down.sql` drops them and restores the full unique effective date; it refuses while a withdrawn version shares a date); the seed only adds setting rows, removable by key. Rolling back is reverting the commits and running the `down.sql`.
- Permissions: the new viewers are global-only by route scope; the matrix test proves the PM and the RPM are refused.
- Secrets: a test asserts that the channel and health answers never contain the SMTP password or the SMS key.
- The `audit_log` partitions end in December 2027 and no job adds new months yet (left from T1.6). The health page shows the last month so it stays visible; the rolling job is a separate task for the owner to schedule.

## Definition of done
- All units done and their tests pass
- The verification commands pass
- `ae-review` has run at every checkpoint, with no open P0 or P1
- Code from abandoned attempts is removed

## Progress
- **Branch:** `feat/admin-settings-core` (stacked on `feat/official-accounts-organogram`, PR #5)
- **Updated:** 2026-10-17 21:10
- **Next:** U6: the settings page (`/admin/settings`, tabs, `admin/programs` and `admin/staff` as examples)
- **Reviewed through:** C5 at a5c506a
- **Uncommitted:** none
- **Notes:** doc review on 2026-10-17: the owner chose the nisab limits and the withdrawal of a version not yet in effect. The `settings` table also holds the seed markers `seed.marker.*`; every settings read must keep to the known keys. The organisation's default names carry `i18n-allow-bengali` (bilingual data); the default contact is a placeholder. C1: plan IDs are kept out of new code comments (words or a doc path instead); the nisab trigger itself refuses withdrawing a version in effect (Dhaka date), so the service's 409 must be checked before the update. U2: the withdraw body reuses the shared reason schema (3 to 1000 characters), so the DB CHECK allows 1000; a nisab date error is 422 `validation.failed` with the detail `nisab.effective_date` on `effectiveFrom`; `isoDateInDhaka` in `@css/shared/format` is the one "today". C2 left open (P3): the nisab list shows who set a version to every signed-in user; a future date on in-force is allowed (Phase 4 must ask for today or earlier when it stores the version). U3: audit_log partitions start in October 2026, so test rows older than the start of the month fail to insert; the test harness knows only five roles (no Project Executive). C3: a keyset on a microsecond timestamp read into a JS date skips rows; the audit list pages by the boundary row id with a raw row comparison, the sessions list sorts by the time-ordered id. Left open (P3): reading the audit log is not itself audited; an idle session that can no longer refresh still shows as active (as the own session list); no 503 test on the two lists. U4: files can be deleted only when they are exports (CHECK), so the storage figures leave deleted exports out; `APP_VERSION` and `SMS_API_KEY` are new env values. C4: the storage figures are null when the database read fails (the checks then show it down). Left open (P3): the SMS endpoint is checked by host text only; the real adapter must check the resolved address or keep a host allowlist. U5: the owner kept O-43 (no Hijri date) when asked on 2026-10-17; the Hijri formatter was built and removed again. A volunteer account takes the request language of the registration; an official created without a language takes the system default. C5: a stored `localization` row with the old `hijriDates` key would fall back to the default; none exists outside this unpushed branch, so no data migration.
