---
title: Notifications (T1.14)
type: feat
status: in-progress
doc_review: 2026-10-18
source: brainstorm
date: 2026-10-18
---

# Notifications (T1.14)

## Goal
Staff and volunteers learn about every Phase 1 event that concerns them: each sees an in-app inbox with an unread count, reads and marks items read, and officials also get the events marked for email in Mailpit (bn and en); failed emails are retried and their delivery state is visible to the Department Head and the Monitoring Team; beneficiaries never receive anything.

## Problem
The events of registration, edit requests, permissions, blocklist, handover, project assignment, consent, deadline extension and device revocation already happen, but they only write a log line (`LoggingRegistrationEvents`) or nothing; nobody is told. The tables (`notifications`, `notification_templates`, `outbound_messages`), 31 seeded bilingual templates and the SMTP and SMS adapters exist since T1.2 and T1.7, and `docs/architecture/NOTIFICATIONS.md` (O-35) fixes the matrix, channels, outbox, retries and limits. T1.14 connects them.

## Requirements

### Events and recipients
- **R1** Every Phase 1 event of NOTIFICATIONS.md §4.1 and §4.2 that exists in the code produces its notifications with the recipients, channels and template key of the matrix: registration submitted (pending), correction requested, approved, rejected, staff registration pending, edit request submitted and decided, role or permission changed (panel or project grant), account blocked and unblocked, device session revoked by an official, account locked and the lockout alert, refresh-token reuse, handover items assigned and completed, Main Admin transferred, project activated, volunteer assigned (consent pending), consent result, team member added, deadline extended, project closing, closed and reopened. An event of the matrix that does not exist in the code yet is listed in the plan, not invented.
- **R2** Recipients are resolved at event time with the authorization scope (§3): a person is notified only about a record they may open, and the in-app entry links to it; the API checks access again when it is opened.
- **R3** Nothing is ever sent to a beneficiary, and no beneficiary contact is ever read for messaging (BD-47, BR-214); a test walks every event and proves it.
- **R4** Volunteers receive operational messages in the app only; email and SMS reach volunteers only for OTP (UX-12, BR-216).

### In-app inbox
- **R5** Every signed-in user (`notification.read_own`, own data only) has an inbox: newest first, page by page, unread first marked, each entry in the user's language with its time and a link to the record; mark one or all read; an unread count in the top bar of the app and the admin area, on a phone too.
- **R6** Identical events for the same recipient and target within 15 minutes collapse into one entry with a count (O-35).
- **R16** An in-app entry never carries another person's name, mobile or NID: it says what happened, the project and counts, and the link opens the record, where access is checked again; so an entry stays harmless after the reader loses access (owner, 2026-10-18).

### Email and SMS delivery
- **R7** Email and SMS go through the transactional outbox: a message exists only when its business event committed; the worker (pg-boss) sends it at least once and never twice (D-054).
- **R8** Transient failures retry after 30 s, 2 min, 10 min, 1 h, then hourly up to 24 hours; permanent failures stop at once; each attempt is recorded (O-35). A message that fails for good raises an in-app operations alert to the Monitoring Team.
- **R9** Email goes through SMTP (Mailpit in development), rendered from the active template version in the recipient's language; SMS goes through the adapter, which only logs (dry run) until a provider exists (O-33). OTP codes are never stored or logged in clear text.
- **R10** Email throughput is throttled to 30 per minute, adjustable (O-35).

### Templates
- **R11** Templates are data: per key, channel and language (bn and en both required), with declared `{{variables}}`; numbers and dates rendered by the shared formatter in English digits; rendering fails closed when a declared variable is missing.
- **R12** The Department Head and the Monitoring Team (`notification.template.manage`) see every template with a preview in both languages using sample data, and edit the subject, title and body; each change is a new version, audited; a change that uses a placeholder not declared for the key is refused, while leaving a declared one out is allowed (owner, 2026-10-18). Old messages keep the version they were rendered with.

### Preferences
- **R13** Each official chooses the email mode for digest-eligible events (immediate or daily digest, default digest, O-35); security and work-assigned notifications cannot be switched off; volunteers have no email or SMS preference. Phase 1 has no digest-eligible event, so the stored default has no effect yet; the daily digest itself is sent once the first digest-eligible event exists (Phase 2); until then no email waits for it.

### Delivery status
- **R14** The Department Head and the Monitoring Team see the outbound messages on an admin page: status (queued, sending, sent, failed, dry run, suppressed), channel, template, recipient with the address partly hidden, attempts, last error and times, filtered by status, channel and dates; an OTP text is never shown.

### Rate limits
- **R15** The existing OTP limits stay (O-25); the inbox endpoints use the default rate class; the template edit and preview are limited like other admin writes.

## Scope
- In: the requirements above, their API, permissions, audit, i18n (bn/en), seed of missing templates, tests and `openapi.yaml`.
- Out (not now):
  - Web Push (after the Phase 3 pilot, O-35);
  - the daily digest job (Phase 2, with the first digest-eligible event);
  - Phase 2 and later events (applications, field activities, money, Qurbani donors, monitoring alerts, documentation SOP);
  - the IT address for operations email (no setting yet; operations alerts go in-app to the Monitoring Team);
  - a real SMS provider (O-33);
  - the volunteer home "needs your attention" panel (T1.15);
  - "Main Admin transferred" (§4.1): no transfer exists in the code yet, so its notification comes with that feature.

## Key decisions
- **Templates**: preview and editing for the Department Head and the Monitoring Team, versioned and audited (owner, 2026-10-18; NOTIFICATIONS.md §6). Governs R11, R12.
- **Digest**: the email-mode preference is kept now; the daily digest job comes with the first digest-eligible event in Phase 2; every Phase 1 email is immediate (owner, 2026-10-18). Governs R13.
- **Delivery status**: a separate admin page for the global roles (owner, 2026-10-18; NOTIFICATIONS.md §7). Governs R14.
- **In-app privacy**: entries carry no other person's name, mobile or NID, only the kind of event, project and counts (owner, 2026-10-18). Governs R16.
- **Template variables**: an undeclared placeholder is refused, a declared one may be left out (owner, 2026-10-18). Governs R12.
- **Operations alert on a failed message**: in-app to the Monitoring Team only until an IT address setting exists (follows D-057 within the current settings). Governs R8.

## Success criteria
The four checks of `docs/PLAN.md` T1.14 pass by hand: an official's email arrives in Mailpit in bn and in en; the in-app inbox shows the events with unread counts and read state; a failing SMTP is retried and the delivery page shows the attempts; no event sends anything to a beneficiary.

## Open questions
None blocking. Each new decision above is recorded in `docs/DECISION_LOG.md` before implementation.

## Technical decisions
- **Stack profile**: unchanged (CLAUDE.md "Stack profile"): pg-boss for delivery, Nodemailer over SMTP (Mailpit in development), the provider-agnostic SMS adapter that only logs (O-33); no new library.
- **Outbox in the business transaction** (D-054, DB-TX-02): today every `RegistrationEvents.emit` runs after its transaction. The events move inside: services call `notifications.publish(tx, event)` in their `$transaction`, which writes the in-app rows and the `outbound_messages` rows and enqueues the `notify` job with the same `tx` (`JobRunner.enqueue` supports it). A rolled-back event leaves no message; no SMTP or SMS call ever happens inside a transaction. `LoggingRegistrationEvents` and the after-commit hook are removed.
- **Event catalogue in one place**: `apps/api/src/notifications/catalogue.ts` maps each event type to its template key, recipient rules, channels (from the matrix), coalescing key and the record link; `packages/shared/src/notifications/links.ts` turns a key and its params into the in-app link, so the API and the PWA agree.
- **Recipient resolution** (§3, RBAC.md §4): no reverse lookup exists, so a new `RecipientResolver` finds candidates (users holding a role whose default includes the permission, plus active panel or project grants of it) and keeps those whose scope reaches the record (`AccessService.scopeOfUser` / `holdsOnProject` / `reaches`). Rules: actor, owner, rpm(region), pm(program), monitoring, assignee, reviewers(region), staff of a project. Beneficiaries are not a recipient kind at all; email goes only to staff with an email; volunteers get in-app only (UX-12).
- **Retry schedule** (O-35): the `notify` queue's own pg-boss retry stays only for worker crashes; the worker records each attempt and schedules the next one itself (30 s, 2 min, 10 min, 1 h, then hourly) with `next_attempt_at` and `startAfter`, up to 24 hours from the first attempt; `DeliveryError.permanent` stops at once. A `sent` row is never sent again (status check under `FOR UPDATE SKIP LOCKED`). A message failing for good writes an in-app `ops_alert` to the Monitoring Team.
- **Throughput** (O-35): emails are sent one at a time, the gap 60 s divided by a new env value `EMAIL_PER_MINUTE` (default 30, so 2 s). Security and work-assigned emails go first (`priority` on the job), and email coalesces like in-app: the same template to the same recipient within 15 minutes sends one email, so a flood of public registrations or locks cannot fill the queue (NE-SEC-04).
- **Output safety** (RE-SEC-01, NE-SEC-11): values are HTML-escaped in an email's HTML part; CR and LF are removed from subjects and addresses; the PWA renders inbox text as plain text; template text may not contain HTML or links (the server refuses `<` and `http`); the in-app link is built in the PWA from fixed relative routes and the record ids, never stored or sent as a URL (RE-SEC-02).
- **Secrets in logs** (NE-LOG-02): the SMS adapter's dry-run log holds only the template key, the masked number and the text length, never the body; OTP and set-password messages write no outbox row and never appear on the delivery page.
- **Errors kept** (NE-SEC-11): an attempt stores a classified error code and a cleaned message (no address, host or user name); the delivery page shows only that.
- **Retention**: notifications and outbound messages are kept permanently like other records (NOTIFICATIONS.md §7, BD-46); the outbox stores the key and params, never the rendered body.
- **OTP and the set-password link stay direct sends** (§9): their secrets are never stored, so they keep the current direct path and never enter the outbox.
- **In-app text** is rendered when read, in the reader's language, from the template version stored on the row (new column `notifications.template_version`), so an edited template never changes old entries; coalescing (15 min, O-35) updates the unread row's count and params.
- **Template editing**: a change inserts a new version (`version + 1`, active) and deactivates the old one in one transaction, audited `notification.template.change`; placeholders may use only the key's declared variables (an undeclared `{{name}}` is refused); a key and its declared variables never change. The preview renders bn and en with typed sample values from `@css/shared`.
- **Permissions**: `notification.read_own` (inbox and preferences, SELF) and `notification.template.manage` (templates, the global roles) already exist; only `notification.delivery.view` (delivery list, no role default, the global roles) is added to permissions.yaml, RBAC.md and the authorization matrix.
- **Plan IDs** stay in this plan and the docs; code comments and test names describe behaviour in words.

## Implementation units

### U1. Data, shared catalogue pieces and the decision record
- **Goal:** the stored template version on in-app rows, the missing templates, links and sample values in shared code, the new permission and D-099.
- **Requirements:** R1, R5, R11, R12, R14, R16
- **Files:** `apps/api/prisma/migrations/<ts>_notifications_delivery/{migration.sql,down.sql}` (+ `schema.prisma`: `notifications.template_version`), `packages/shared/src/notifications/{templates.ts,links.ts,samples.ts}` (+ tests; `ops_alert` in-app, `edit_request_closed`, `team_member_added` and the project lifecycle keys where missing), `apps/api/seed/sets/base/notifications.ts`, `docs/security/permissions.yaml` (`notification.delivery.view`), `docs/DECISION_LOG.md` (D-099), `apps/api/src/config/env.ts` (`EMAIL_PER_MINUTE`)
- **Approach:** the official accounts migration (`20261017120000_official_accounts`) and its `down.sql`; existing seed rows stay unchanged, missing keys are added as new rows and the seed counts test follows; in-app templates lose the other person's name variables (`applicant_name`, `volunteer_name`, `user_name`, `from_name`, `previous_name`, `new_name`) for the event, project and count (R16). D-099 records the four Key decisions.
- **Tests:**
  - unit: every seeded key has bn and en for each of its channels and declares the variables it uses; no in-app template declares a person's name; links for each key are relative routes; samples render every template in both languages; an undeclared placeholder is found.
  - integration: migration up and down (`migrations.test.ts`); seed counts.
- **Done when:** the seed holds every Phase 1 key in both languages and the migration round-trips.
- **Depends on:** none · **Size:** M · **Risk area:** migration
- **Status:** done

### U2. Notification core: publish, recipients, in-app rows and the outbox
- **Goal:** `NotificationService.publish(tx, event)` writes the in-app rows (coalesced) and the email and SMS outbox rows for the resolved recipients, and enqueues delivery in the same transaction.
- **Requirements:** R1 to R4, R6, R7, R16
- **Files:** `apps/api/src/notifications/{catalogue,recipients,service}.ts`, `apps/api/src/container.ts`, `apps/api/test/integration/notification-core.test.ts`, `apps/api/test/integration/notifications.test.ts` (the `InAppAdapter` test moves to the `publish(tx, …)` path), `apps/api/src/notifications/*.spec.ts`
- **Approach:** the in-tx write of `InAppAdapter.deliver` (`notifications/adapters.ts`); the scope checks of `access/service.ts`; enqueue with `tx` as `jobs/job-runner.ts` allows. No reverse permission lookup exists (new pattern).
- **Tests:**
  - unit: every catalogue entry has a seeded template in bn and en for each of its channels and recipients and channels matching the matrix; volunteers never get email or SMS; no beneficiary recipient kind exists.
  - integration: a published event writes one in-app row per recipient and one outbox row per staff email; a rolled-back transaction leaves nothing; reviewers of another region and an official outside the scope are not notified; the same event twice within 15 minutes increments the count instead of adding a row; the idempotency key refuses a duplicate outbox row; the same email to the same recipient within 15 minutes is one outbox row; 100 events in a minute queue at most one email per recipient and template.
- **Done when:** publish works in a test transaction for every rule.
- **Depends on:** U1 · **Size:** L · **Risk area:** auth, personal data
- **Status:** done

### U3. Delivery worker with retries, throttle and the operations alert
- **Goal:** the `notify` consumer sends each queued email and SMS once, retries transient failures on the O-35 schedule, stops on permanent ones, and alerts the Monitoring Team after giving up.
- **Requirements:** R7 to R10
- **Files:** `apps/api/src/notifications/{delivery.ts,adapters.ts}`, `apps/api/src/jobs/{consumers.ts,queues.ts}`, `apps/api/src/worker.ts`, `apps/api/src/server.ts`, `apps/api/test/integration/notification-delivery.test.ts`, `apps/api/src/notifications/adapters.spec.ts`
- **Approach:** `jobs/registration-cleanup.ts` and `JobConsumers.register`; `classifySmtpError` and `StubSmsAdapter` in `notifications/adapters.ts`. No outbox worker exists (new pattern).
- **Tests:**
  - integration: a queued email reaches Mailpit in bn and in en with the right subject; a redelivered job does not send a `sent` row again; a transient failure sets `attempts` and `next_attempt_at` 30 s later, then 2 min; after 24 hours it is `failed` and the Monitoring Team has an `ops_alert`; a permanent failure stops at once; an SMS ends `dry_run` without its text logged; the direct OTP path logs no code (logger captured); two emails are at least 60 s / `EMAIL_PER_MINUTE` apart; a name with `<script>` is escaped in the HTML part and a newline never reaches a subject; an SMTP error naming the full address is stored without it.
- **Done when:** the worker runs inline in development and in `worker.ts`.
- **Depends on:** U1, U2 · **Size:** L · **Risk area:** external API (SMTP)
- **Status:** done

### U4. Account events in the transaction
- **Goal:** registration, correction, approval, rejection, staff registration pending, edit requests, blocklist and handover publish their notifications inside their transactions.
- **Requirements:** R1, R2
- **Files:** `apps/api/src/services/{registration,registrations,change-requests,blocklist,handover}.ts`, `apps/api/src/notifications/registration-events.ts` (removed), `apps/api/test/integration/{registration-approval,registration-submit,registration-start,edit-requests,blocklist,handover}.test.ts`
- **Approach:** U2's `publish(tx, …)` at the place of each `events.emit`; the leaving official and each assignee of a handover get their own entries.
- **existing:** integration covered (`registration-approval`, `registration-submit`, `registration-start`, `edit-requests`, `blocklist` and `handover` tests capture `registrationEvents`); update them to read the `notifications` rows instead.
- **Tests:**
  - integration: each event writes the matrix entries for the right people; a staff registration pending also queues email to the Monitoring Team; a refused action writes nothing.
- **Done when:** no service emits after commit any more.
- **Depends on:** U2 · **Size:** L · **Risk area:** none
- **Status:** done

### U5. Access, security and project events
- **Goal:** permission and project grant changes, device revocation, lockout with the lockout alert, refresh reuse, project activated, closing, closed, reopened, deadline extended, volunteer assigned, consent result and team member added publish their notifications.
- **Requirements:** R1, R2, R4
- **Files:** `apps/api/src/services/{access,sessions,auth,project-lifecycle,project-volunteers,my-projects,volunteer-teams}.ts`, `apps/api/src/auth/{session.service,lockout,token.service}.ts` (the reuse detection is in `session.service.ts`), integration tests beside them
- **Approach:** as U4. The Main Admin transfer has no code yet: listed under Scope, out, not built.
- **existing:** integration covered for each service (`access-panel`, `sessions-users`, `auth`, `project-lifecycle`, `project-volunteers`, `my-projects`, `volunteer-teams` tests); extend them with the notification rows.
- **Tests:**
  - integration: a granted permission notifies the person; a revoked device notifies its owner; the tenth lock of a day emails the Monitoring Team; activation notifies the area RPMs and assigned people; an extension notifies the assigned volunteers; an assignment notifies the volunteer in-app only; consent notifies the RPM of the region.
- **Done when:** every event of R1 that exists in the code publishes.
- **Depends on:** U2 · **Size:** L · **Risk area:** none
- **Status:** done

### U6. API: inbox, preferences, templates and deliveries
- **Goal:** the endpoints of the inbox, the preferences, the template list, preview and edit, and the delivery list.
- **Requirements:** R5, R11 to R15
- **Files:** `apps/api/src/routes/notifications.ts`, `apps/api/src/services/{inbox,notification-templates,deliveries}.ts`, `docs/api/openapi.yaml`, `docs/security/{RBAC.md,AUTHORIZATION_MATRIX.md}`, `apps/api/test/integration/{inbox,notification-templates,deliveries}.test.ts`
- **Approach:** the audit viewer (`services/audit-log.ts`, exact keyset by row id) for the lists; `routes/settings.ts` for the admin writes.
- **Tests:**
  - integration: the inbox lists only the caller's rows, rendered in the caller's language from the stored version, newest first by pages; another user's notification answers 404 on read and stays unread; another user's read-all leaves the first user's unread count unchanged; read one and read all; the unread count; preferences store the email mode for staff and refuse it for a volunteer; template edit makes version 2, audited, old rows keep version 1; an undeclared placeholder answers 422; preview renders both languages; deliveries list with masked addresses and filters for the global roles, 403 for a PM; 401 without a session on each.
- **Done when:** drift test and authorization matrix pass.
- **Depends on:** U1, U2 · **Size:** L · **Risk area:** auth
- **Status:** done

### U7. Web: the inbox and the unread count
- **Goal:** a bell with the unread count in the top bar and the admin bar, the inbox at `/notifications` for everyone, and the email preference on the account page for officials.
- **Requirements:** R5, R13
- **Files:** `apps/web/src/features/notifications/*`, `apps/web/src/components/TopBar.tsx`, `apps/web/src/admin/AdminLayout.tsx`, `apps/web/src/routes/index.tsx`, `apps/web/src/features/account/*` (preference), i18n `notifications` namespace (bn, en)
- **Approach:** list and paging as `admin/audit/AuditPage.tsx`; the account section pattern of `features/account`.
- **Tests:**
  - component: the badge shows the unread count and hides at 0; the inbox marks one and all read; a volunteer has no email preference; an official saves "দৈনিক সংক্ষিপ্তসার".
- **Done when:** the inbox works at 360 px.
- **Depends on:** U6 · **Size:** M · **Risk area:** none
- **Status:** done

### U8. Web admin: templates and deliveries
- **Goal:** `/admin/notification-templates` (list, preview bn and en, edit) and `/admin/deliveries` (status, channel, dates).
- **Requirements:** R12, R14
- **Files:** `apps/web/src/admin/notifications/*`, `admin/navigation.ts`, `admin/roles.ts`, `routes/index.tsx`, i18n `admin`
- **Approach:** `admin/settings/` and `admin/audit/`.
- **Tests:**
  - component: preview shows both languages; an edit with an undeclared variable shows the server's message; deliveries filters land in the request and addresses are masked; a PM gets the forbidden content.
- **Done when:** both pages work on a desktop and at 360 px.
- **Depends on:** U6 · **Size:** M · **Risk area:** none
- **Status:** done

### U9. E2E and documents
- **Goal:** the four checks of PLAN T1.14 in the browser; documents match the code.
- **Requirements:** all
- **Files:** `apps/web/e2e/notifications.spec.ts`, `docs/architecture/NOTIFICATIONS.md` (implementation notes), `docs/ui/SCREENS.md`, `docs/api/API_STANDARDS.md`, `docs/STATUS.md`, CLAUDE.md map
- **Tests:**
  - e2e (desktop: Department Head; phone: Monitoring Team):
    - a volunteer registers; the official opens `/notifications` and sees "নতুন নিবন্ধন অপেক্ষায়" with an unread badge; "সব পড়া হয়েছে" clears the badge.
    - Mailpit receives the staff registration email in bn; with the account language set to English, the next one arrives in en.
    - `/admin/notification-templates` → "registration_approved" → the bn and en preview are shown.
    - `/admin/deliveries` → the email row "পাঠানো হয়েছে".
- **Done when:** the spec passes with --repeat-each 3 --workers 1; docs:check passes.
- **Depends on:** U3, U4, U5, U7, U8 · **Size:** M · **Risk area:** none
- **Status:** done

## Checkpoints
- **Mode:** grouped (one by one 10, grouped 17, all at once 0; N is over 4, so one by one's points go to grouped)
- **Signals:** N 9, L 2,600, R 4, Fd 3, C 5, P 2
- **C1** after U1: foundation for U2, U3, U6, and a migration
- **C2** after U2: foundation for U3 to U6, risk (auth, personal data), new pattern (recipients)
- **C3** after U3: risk (SMTP), new pattern (the outbox worker)
- **C4** after U5: size (U4 and U5 near 800 lines; U6 would pass 1,000)
- **C5** after U6: risk (auth), foundation for U7 and U8
- **C6** after U9: end; scripted checks on the whole branch

## Verification
- `pnpm typecheck`, `pnpm lint`, `pnpm test`
- `pnpm --filter @css/api exec vitest run --config vitest.db.config.mts` (needs Mailpit from `docker compose up -d`)
- `pnpm docs:check`, `pnpm --filter @css/api authz:matrix`
- `pnpm e2e`; the spec alone with `npx playwright test e2e/notifications.spec.ts` after `pnpm --filter @css/web build:e2e`
- dev: `pnpm db:migrate`, `pnpm db:seed --set base`, Mailpit at http://127.0.0.1:8025

## Risks and rollback
- One additive migration (`notifications.template_version`, nullable for old rows); its `down.sql` drops it.
- Moving the event writes into the business transactions changes many services: each unit updates the tests that already cover them, and a refused action must write nothing.
- A broken SMTP never blocks a business action: only the outbox row is written in the transaction.
- Rollback: revert the branch; queued `notify` jobs of reverted code are dropped by pg-boss expiry.

## Definition of done
- All units done and their tests pass
- The verification commands pass
- `ae-review` has run at every checkpoint, with no open P0 or P1
- Code from abandoned attempts is removed

## Progress
- **Branch:** `feat/notifications` (stacked on `feat/admin-settings-core`)
- **Updated:** 2026-10-18 17:30
- **Next:** checkpoint C6 (review U7 to U9, scripted checks of the whole branch, full run), then STATUS and the report
- **Reviewed through:** C5 at 8226df3
- **Uncommitted:** none
- **Notes:** doc review on 2026-10-18: the owner chose no other person's name in in-app entries (R16) and that a declared variable may be left out of a template. U1: a template variable may be bilingual data ({ bn, en }) or a number, rendered in the reader's language by `renderTemplateText`; `project_consent_result` takes the answer as bilingual data; in-app texts drop every person variable (tested), emails to officials keep them. C1: `PLACEHOLDER` is the one pattern for the renderer and the editor check; a value that is not text, a finite number or { bn, en } fails closed; U2 stores `inAppParams` (no person variables) on in-app rows; U6 must refuse a person variable in an in-app text, render each inbox row with a per-row fallback, and U3 must always escape the HTML part. Open: the base seed is the only path that writes templates and it refuses production, so a deploy step that inserts missing template keys (never overwriting edits) is needed before production: planned with U3 (`notifications:sync` in `db:migrate`). U2: the test template database now has the pg-boss schema (global setup), because publishing enqueues the delivery in the event's transaction; `AccessService.reaches` takes the transaction so a record created in it is found; the email coalesces per recipient and key within 15 minutes; `InAppAdapter` is no longer used by publish (left for U4 to remove). C2: publish takes a per-person advisory lock on the event's coalesce key; the outbox keeps `coalesce_key`, so the email dedup is per recipient and record (another record still gets its email) and a replayed `eventId` is skipped by its idempotency key; `about` is required when the params carry `userId` or `projectId` (U4 and U5 callers must pass it); in-app params are an allow-list (`IN_APP_PARAMS`, tested against every in-app text); recipients are checked one after another in the event's transaction (`AccessService.load`/`scopeOfUser` take `db`). The outbox is append-only, so tests can't age rows: use a different `about` or the clock. U3: `NotificationDelivery.deliver` holds the row lock (FOR UPDATE SKIP LOCKED, 90 s transaction) while the provider call runs, so a crash between send and commit can resend once (accepted); a retry stays `queued` with `next_attempt_at` and its own job (`singletonKey` id:attempt); give-up is 24 hours after `created_at`; the SMS stub returns `dryRun` and the row ends `dry_run`; `notifications:sync` runs in `db:migrate` and in the test global setup, and the base seed now upserts templates on (key, channel, locale, version). `ops_alert` keeps `count: 1` in params and coalesces per 15 minutes: U6 must show the row's `count` for it. `JobConsumers` takes a services object. C3: the operations alert is written after the commit in its own transaction (a failed alert never undoes `failed`); a retry job waits a relative number of seconds (database clock), and a job that starts ahead of the row's next attempt queues one at that time instead of dropping it; the last attempt is the one whose next would fall after 24 hours; the throttle waits after the lock, only for a message that is sent, and takes an injectable clock; non-delivery errors are logged and retried. Accepted and left: the send runs inside the row lock, so a crash between the provider's acceptance and the commit can send once more (at least once; R7's never-twice holds for redeliveries); the throttle is per process, so production runs the consumers in the worker only (JOBS_INLINE is refused in production). The template renderer still fails closed on a declared variable the event does not supply: R12's 'may be left out' is about the template text, not the event. U4: `AccountEvents` (notifications/account-events.ts) publishes the registration, correction, decision, edit request, block and handover events in their transactions; `LoggingRegistrationEvents` is gone. Not built because the event no longer exists: staff registration pending (staff self-registration ends with D-097; the template stays). Choices to report: the block and unblock entries go to the affected person only (the template speaks to them; the audit log is the official record); a rejection is written before the account closes, so the person sees it on registering again; a resubmitted registration publishes `registration_pending` again; an edit request tells the approvers once it is ready (on create, after the contact code, after the photo upload); the leaving official gets no handover entry (the template speaks to the receiver); the field labels moved to `REQUEST_FIELD_LABEL` in `@css/shared/registration`. U5: `ProjectEvents` (notifications/project-events.ts) and the security methods of `AccountEvents`; `publish` takes `only: 'in_app' | 'email'` so one key can reach the person in the app and the Monitoring Team by email with their own texts (refresh reuse); the project rule takes `regionLocationId` (consent goes to the RPM of the volunteer's area, a team member's through the main volunteer's assignment); the lockout alert counts today's `auth.locked` audit entries in Dhaka time and emails at exactly the tenth; bilingual summaries come from the new `common.notification.*` catalogue keys; the refresh-reuse texts now say the one session ended (AUTH.md revokes the device session, not all); the container builds access and the notifications before the sessions. Not sent: Finance on `project_closed` (Finance has no project access to open the link, R2) and the Main Admin transfer (no code yet). The R3 walk is in notification-core: every catalogue key reaches staff and volunteers only, email to staff only, never a beneficiary contact. C4: the lockout and refresh-reuse notices run in a savepoint (`AccountEvents.apart`), so a notice that fails is logged and never undoes the lockout or the revoke; the lockout alert takes a per-day advisory lock, so exactly one lockout counts the tenth; the reuse email to the Monitoring Team coalesces per person; the reopen reason left the in-app text (it reaches everyone on the project); a consent answer without a known area tells nobody; `ProjectRule` is one type; permission summaries use a typed key map. U6: routes in `routes/notifications.ts` (inbox list with `unreadCount` in meta, `GET /notifications/unread-count` for the badge, `POST /notifications/read` with ids or all, `GET/PATCH /me/preferences`, `GET /admin/notification-templates`, `POST …/:key/:channel/preview`, `PUT …/:key/:channel`, `GET /admin/deliveries`); services `inbox.ts`, `notification-templates.ts`, `deliveries.ts`; lists page by the uuidv7 id; the inbox renders with the request language and a per-row fallback (`common.notification.fallback_*`); `ops_alert` shows the entry's count (`countsEvents` in the catalogue); only catalogue keys and their in-app and email channels are editable (OTP and set-password texts stay in code); request schemas in `@css/shared` (`notifications/api.ts`); new error details `notification.*` in API_STANDARDS §8; the template edit shares the default rate class like the other admin writes. C5: the template text refuses markup, `//`, any scheme and anything shaped like a web address (every seeded text still passes, tested); the inbox takes the audience from the principal; delivery fields are typed unions; tests for the preview's 404 and 422 and an exact Bengali title. Dismissed: an unchanged save still makes an audited version (the route's audit enforcement needs the entry, and a retry is harmless); `reason`, `note` and `device_name` stay usable in in-app texts (declared only on events that reach the person concerned); the inbox and delivery lists keep their own short keyset code on the shared pagination helpers; the health-probe script finding is the existing `/health` design. Full run at C5: 231 unit, 56 DB files with 576 tests, 305 shared, all passing. U7: `features/notifications` (`NotificationBell` in the top bar of the signed-in pages and in the admin bar, polling the unread count every minute; `NotificationsPage` at `/notifications` with all and unread tabs, the list by Dhaka day, open marks read and follows the link, mark all read, and the email setting card for officials on the same page instead of the profile, since officials have no profile section for it); a new `notifications` catalogue namespace; the component tests' default MSW handler answers the unread count with 0; checked by hand at 360 px on the dev server (empty state, entries, mark all read, no console errors). The dev database now has the branch migration, the pg-boss queues and the synced templates. `notifications:sync` reads `.env` when present. Not built: the desktop dropdown of the last 10 entries (SCR-004), the bell links to the page. U8: `admin/notifications/` (`NotificationTemplatesPage` with the editor in a modal: channel switch, bn and en fields, the available values, preview of both languages, save as a new version with the server's field messages; `DeliveriesPage` with status chips, channel and date filters in the address, the hidden address, attempts and the last error, cards on phones); two sidebar items for the global roles; checked by hand on the dev server at 1280 px and 360 px. U9: `e2e/notifications.spec.ts` (a permission change reaches the inbox of the implementer on a desktop and the Media Team member on a phone, the badge and "সবগুলো পড়া হয়েছে"; the template preview in bn and en and the delivery page on a desktop) passes with --repeat-each 3 --workers 1 (9 passed, 3 desktop-only skips). Changed from the plan: no staff registration email exists any more (D-097), and the e2e API runs no job consumer, so the Mailpit bn and en check is the integration test against Mailpit plus a hand check on the dev server (a handover to the Dhaka RPM arrived in Bangla, the hand-back to the handover official set to English arrived in English, both shown on the delivery page). Docs: NOTIFICATIONS.md §15, SCREENS SCR-004 built, SCR-074 and SCR-075, CLAUDE.md map. C6: "খুলুন" opens the record even when marking it read fails; the editor clears an old save error on typing; one email-mode save at a time; links are followed only as paths of the app; comments name docs instead of ids; tests for a failed delivery list and a saved template; the e2e desktop official is the Procurement Team member (the auth spec resets the implementer's password); the project setup wizard now waits for the rules before it picks its opening step (a race of T1.11 that the admin bar's extra request made visible: projects.spec failed every time). Full run at C6: typecheck and lint clean, `pnpm test` 163 files / 1504 tests, web 41 / 316 after the fixes, database 56 files / 576 tests (alone; two runs while other suites ran at the same time showed one or two unhandled Vitest worker errors), docs:check passed, authorization matrix current, `pnpm e2e` 80 passed, 14 skipped, 0 failed. Dismissed: project-wide recipients are not re-checked by scope (project access is these rows: an RPM is the area's `rpm_user_id`, staff are open `project_staff` rows, volunteers open assignments); the betterleaks P0 is the deliberately wrong password of the lockout test. The full DB run twice showed 2 unhandled errors only while other test commands ran at the same time; alone it passes 53/53 files, 556/556 tests.
