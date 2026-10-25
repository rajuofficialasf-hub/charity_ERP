# NOTIFICATIONS

Status: complete, task T0.14 (2026-10-10). Design only; no code. Sources: blueprint A5 (OTP, correction requests), A8.6 (donor messages), A10 (alerts, SOP warnings), B9 (notifications); decisions BD-34, BD-44, BD-47, BD-49, UX-12, O-25 (OTP parameters), O-30 (security alerts), O-31 (PWA short name), O-33 (SMS provider before production), O-34 (documentation module last), D-053 (adapters), D-054 (worker retries, idempotency), D-057 (essential alerting); rules BR-024, BR-147, BR-148, BR-214…217; the `notify:` and `donor.email:` effects used in `docs/architecture/workflow-templates/`; permissions `notification.read_own`, `notification.template.manage`, `donor.message.send` (`docs/security/permissions.yaml`). The proposals of the first draft were accepted by the owner on 2026-10-10 as O-35; where the text below says PROPOSAL, the value is now decided as listed in section 14.

## 1. Principles and approved decisions

- **Nobody outside staff, volunteers and Qurbani donors receives anything.** Beneficiaries receive no notification on any channel for now (BD-47, BR-214).
- **Volunteers read operational messages in the app only** — correction requests, approvals, assignments, transfers, reminders — with no SMS, WhatsApp or email for these (UX-12, BR-216). Email and SMS reach volunteers only for OTP at registration and password reset.
- **SMS is used for exactly two purposes:** OTP and Qurbani donor messages (BD-34, BD-44). No provider is chosen yet; the SMS adapter runs in dry-run mode, logging what it would send, until the provider is configured: a real gateway before rollout beyond the Phase 3 pilot (O-33, O-49).
- **OTP is a fixed dummy code in development and test** behind configuration and impossible to enable in production except during the Phase 3 pilot under the owner's written approval and an explicit, time-limited flag (O-49); real gateways before rollout beyond the pilot (BD-44, BD-49, BR-024; AUTH.md §2.1).
- **Staff** (officials) receive in-app notifications and, for selected events, email through the organization's SMTP (BD-47).
- **Every outbound message goes through a transactional outbox** so that a message exists only when its business event committed, is delivered at least once by the worker, and is never sent twice (D-054).
- **No personal data in SMS or push payloads** beyond what the recipient already owns (their own OTP, the donor's own animal); never NIDs, names of beneficiaries or bank details.

## 2. Channels

| Channel | Audience | Transport | Status in dev / test | Notes |
|---|---|---|---|---|
| In-app | All staff and volunteers | `notifications` table, read through the API; badge counts; offline-available inbox cached on the device | active | Primary channel for everything operational; volunteers' "needs your attention" first on the home screen (UX-12) |
| Email | Staff; donors; volunteers only for OTP and password reset | Nodemailer over the organization's SMTP (D-053) | Mailpit captures everything | Staff may choose immediate or daily digest for informational events (section 5) |
| SMS | Registration/reset OTP; Qurbani donor pre-notification | Provider-agnostic `SmsAdapter` (HTTP provider plugged in by settings) | `LoggingSmsAdapter` (dev/test); dry-run in staging until a provider exists (O-33) | Bangla Unicode SMS length handled by the adapter (segments counted for cost) |
| Web Push (optional) | Staff and volunteers who installed the PWA and opted in | Browser push services via VAPID | off | Recommendation in section 11; content-free payloads only |

## 3. Recipient resolution

Recipients in the matrix are written as a role plus a scope rule; the notifications service resolves them at event time with the same scope resolver as authorization (RBAC.md §4), so a person is notified only about records they may see.

| Rule | Resolves to |
|---|---|
| actor | the user who triggered the event (confirmation copies are not sent by default) |
| owner | the application's submitting volunteer (main volunteer; team members get notices only for their own drafts) |
| team | the main volunteer's team members linked to the record |
| reviewers(region) | users holding `application.review` on the project at the record's region |
| approvers(region) | users holding `application.approve` on the project at the record's region (RPM; PM on house construction; granted Executives and Official দায়ীs) |
| rpm(region) | RPMs of the record's region in the project |
| pm(program) | the program's PM |
| monitoring | Department Head and Monitoring Team |
| assignee | the user an item is assigned to (issue, handover item, document owner) |
| finance | Finance Team (in-app only, informational) |
| donor | the donor's email or mobile (Qurbani) |
| it | the IT address configured in admin settings (operations alerts, D-057) |

## 4. Notification matrix

Channels: **A** in-app · **E** email · **S** SMS · **P** optional Web Push (if adopted, section 11; mirrors in-app for installed apps). Phase = constitution §8 phase in which the event first exists. Template keys are shared with the workflow templates' `notify:` and `donor.email:` effects.

### 4.1 Registration, accounts and security (Phase 1)

| Event | Recipients | Channels | Template key | Phase |
|---|---|---|---|---|
| Registration OTP (mobile) | registrant | S (dummy in dev/test) | `otp_registration_sms` | 1 |
| Registration OTP (email) | registrant | E (dummy in dev/test) | `otp_registration_email` | 1 |
| Contact change OTP (new mobile or email of an edit request, D-085) | volunteer | S to the new mobile, E to the new email (dummy in dev/test) | `otp_contact_change` | 1 |
| Password reset OTP | user | S for volunteers, S or E for staff | `otp_password_reset` | 1 |
| Registration submitted (pending) | reviewers of the registrant's region (Project Executive, RPM), pm, monitoring | A | `registration_pending` | 1 |
| Registration correction requested (per field) | registrant | A | `registration_correction_requested` | 1 |
| Registration approved | registrant | A | `registration_approved` | 1 |
| Registration rejected / auto-deactivated after 90 days (O-25) | registrant | A | `registration_rejected` | 1 |
| Staff registration pending | monitoring | A, E | `staff_registration_pending` | 1 |
| Profile edit request submitted | rpm(region), Project Executive of the region | A | `edit_request_submitted` | 1 |
| Edit request approved (field opened) / closed | owner | A | `edit_request_approved` | 1 |
| Role or permission changed (panel or project grant) | affected user | A | `permission_changed` | 1 |
| Account blocked / unblocked | affected user (sees the block message at login); monitoring | A | `account_blocked`, `account_unblocked` | 1 |
| Device session revoked by an official | affected user (shown at next login) | A | `session_revoked` | 1 |
| Account locked after failed attempts | affected user; monitoring when 10 locks/day (O-25) | A; E to monitoring | `account_locked`, `security_lockout_alert` | 1 |
| Refresh-token reuse detected | affected user; monitoring | A, E (monitoring) | `security_refresh_reuse` | 1 |
| Handover started / items assigned | each assignee; leaving official | A, E | `handover_items_assigned` | 1 |
| Handover completed, account deactivated | monitoring | A | `handover_completed` | 1 |
| System owner transferred | previous and new holder; monitoring | A, E | `system_owner_transferred` | 1 |

### 4.2 Projects, assignment and consent (Phase 1)

| Event | Recipients | Channels | Template key | Phase |
|---|---|---|---|---|
| Project activated | rpm(all areas), assigned staff, assigned volunteers | A | `project_activated` | 1 |
| Volunteer assigned to a project (consent pending) | the volunteer | A | `project_assignment` | 1 |
| Consent accepted / rejected | rpm(region) | A | `project_consent_result` | 1 |
| Team member added to a project team | the team member | A | `team_member_added` | 1 |
| Application deadline extended | assigned volunteers, rpm(all areas) | A | `deadline_extended` | 1 |
| Application deadline approaching (3 days before, PROPOSAL) | assigned volunteers with drafts | A | `deadline_reminder` | 2 |
| Project moved to Closing | assigned staff and volunteers | A | `project_closing` | 1 |
| Project closed | assigned staff and volunteers; finance | A | `project_closed` | 1 |
| Project reopened | assigned staff and volunteers | A | `project_reopened` | 1 |
| Permission granted on a project ("if RPM grants") | the grantee | A | `project_grant_changed` | 1 |

### 4.3 Applications and workflow (Phase 2)

| Event | Recipients | Channels | Template key | Phase |
|---|---|---|---|---|
| Application submitted | reviewers(region) (coalesced per volunteer per hour) | A | `application_submitted` | 2 |
| Application entered needs verification (public link, offline collision, stale form) | reviewers(region) | A | `application_needs_verification` | 2 |
| Application reviewed (awaiting approval) | approvers(region) | A, E (digest-eligible) | `application_reviewed` | 2 |
| Application approved | owner, team (own records) | A | `application_approved` | 2 |
| Application rejected (the message written for the volunteer; the office reason stays in the record) | owner, team (own records) | A | `application_rejected` | 2 |
| Application returned from rejection to review | owner, team (own records) | A | `application_reopened` | 2 |
| Application waitlisted / pulled from waitlist | owner | A | `application_waitlisted` | 2 |
| Field unlocked for the volunteer | owner | A | `field_unlocked` | 2 |
| Unlocked field updated (needs verification) | the official who unlocked | A | `field_updated` | 2 |
| Applications transferred | new volunteer; old volunteer (count only, no details); rpm(region) | A | `application_transferred` | 2 |
| Application completed | owner | A | `application_completed` | 2 |
| Sync result: records failed or need verification | the volunteer (in-app inbox and sync centre) | A | `sync_attention` | 2 |
| Pending-sync reminder (24 h, then daily; O-29) | the volunteer | A (local notice on the device) | `sync_reminder` | 2 |
| Approval pending too long (5 days, O-04) | approvers(region); monitoring | A, E | `alert_approval_pending` | 5 |
| Review pending too long (7 days, O-04) | reviewers(region); monitoring | A, E | `alert_review_pending` | 5 |

### 4.4 Field activities, money and stock (Phases 3–4)

| Event | Recipients | Channels | Template key | Phase |
|---|---|---|---|---|
| Package / saplings / animals dispatched to a volunteer | the volunteer | A | `package_sent` | 3 |
| Receipt confirmed | rpm(region), the dispatching official | A | `package_received` | 3 |
| Stock does not balance / damaged or lost goods | rpm(region), pm(program); monitoring | A, E | `alert_stock_mismatch`, `alert_damaged_goods` | 3 |
| Goods shortage (beneficiaries waitlisted) | rpm(region) | A | `alert_stock_shortage` | 3 |
| Expense claim submitted | Project Executive and RPM of the region | A | `expense_claim_submitted` | 3 |
| Expense claim verified | claimant | A | `expense_claim_verified` | 3 |
| Expense payment recorded (transaction id) | claimant; finance | A | `expense_claim_paid` | 3 |
| Workers assigned (Local দায়ী, paid volunteers) | the assigned workers | A | `workers_assigned` | 4 |
| Advance sent (safe water) | the volunteer; finance | A | `advance_sent` | 4 |
| Vouchers submitted | verifiers (Executive, RPM; Implementer on safe water) | A | `vouchers_submitted` | 4 |
| Vouchers verified and locked | the submitter | A | `vouchers_verified` | 4 |
| Issue raised | rpm(region), Project Executive, Procurement Team (house construction) | A | `issue_raised` | 4 |
| Issue assigned | assignee | A, E (staff) | `issue_assigned` | 4 |
| Issue resolved | raiser, everyone on the project who follows the issue | A | `issue_resolved` | 4 |
| Dawah classes started | the assigned Local দায়ী; the volunteer | A | `classes_started` | 4 |
| Exam results recorded | the Local দায়ী and the volunteer of the beneficiary; rpm(region) | A | `exam_results` | 4 |
| Beneficiary support payment recorded | the volunteer; finance | A | `support_paid` | 4 |
| Animal allocated to a volunteer | the volunteer | A | `animal_allocated` | 4 |
| Donor pre-notification (allocation final) | donor | E and/or S (per available contact) | `donor_pre_notification` (effect `donor.email:pre_notification`) | 4 |
| Donor animal photos (animal, meat, packet) | donor | E (photos attached as links valid 30 days, PROPOSAL) | `donor_animal_photos` (effect `donor.email:animal_photos`) | 4 |
| Donor message failed after retries | rpm(region), pm(program) | A | `donor_message_failed` | 4 |

### 4.5 Monitoring, operations and security alerts (Phase 5; essential operations alerts from launch, D-057)

| Event | Recipients | Channels | Template key | Phase |
|---|---|---|---|---|
| No update from a Local দায়ী / volunteer / paid volunteer for 7 days (O-04) | the worker; rpm(region); Official দায়ী for দায়ীs | A | `alert_no_update` | 5 |
| Distribution marked without photo | rpm(region); monitoring | A | `alert_missing_photo` | 5 |
| Budget use above 90% (O-04) | pm(program); monitoring; finance | A, E | `alert_budget` | 5 |
| Incomplete activity / implementation delayed | rpm(region), pm(program) | A | `alert_activity_delayed` | 5 |
| Inactive volunteer for 14 days (O-04) | rpm(region) | A | `alert_inactive_volunteer` | 5 |
| Duplicate NID attempts | rpm(region); monitoring | A | `alert_duplicate_identity` | 5 |
| Flagged-photo share above 30% (O-30) | rpm(region); monitoring | A | `alert_flagged_photos` | 5 |
| Malware detected in an upload (O-30) | uploader (generic "file rejected" message); monitoring; it | A; E to monitoring and it, immediately | `security_malware_detected` | 2 (from the file service) |
| Failed jobs after retries, elevated 5xx rate, readiness failure (D-057) | monitoring; it | A; E to it | `ops_alert` | 1 (from launch) |
| Storage threshold crossed / monthly storage report (BD-46) | it; monitoring | E; A | `ops_storage_report`, `ops_storage_threshold` | 1 |
| Follow-up evaluation added | owner volunteer is not notified; the profile shows it | — | — | 5 |

### 4.6 Documentation SOP (built last, O-34)

| Event | Recipients | Channels | Template key | Phase |
|---|---|---|---|---|
| Document deadline passed: soft warning, 3-working-day countdown starts | assignee (responsible official) | A, E | `document_soft_warning` | last (O-34) |
| Countdown ended: non-compliance | assignee; pm(program); monitoring | A, E | `document_non_compliance` | last (O-34) |
| Document deadline extended | assignee | A | `document_deadline_extended` | last (O-34) |
| Deficiency report filed | responsible official; pm(program) | A | `deficiency_filed` | last (O-34) |
| Deficiency escalated (second report within a year) | Department Head, monitoring; pm(program) | A, E | `deficiency_escalated` | last (O-34) |

Never notified to volunteers: ratings, categories, blocklist reasons, monitoring alerts about others, documentation events (BR-046, BR-163).

## 5. Mandatory and optional notifications, user preferences

| Class | Examples | In-app | Email (staff) | User can switch off |
|---|---|---|---|---|
| Security and account | OTP, lockout, session revoked, refresh reuse, permission changed, blocked | always | where listed | no |
| Work assigned to the user | approvals and reviews waiting, issue assigned, handover items, document warnings | always | immediate | email only, to digest (not off) |
| Informational | approvals of own records, project status changes, results | always | listed events only | email off or digest |
| Alerts | monitoring and operations alerts | always for recipients | listed events | no for monitoring/it; others may digest |

- Preferences are per user (own data, `notification.read_own`): email mode for digest-eligible events (immediate / daily digest at 08:00 Asia/Dhaka, PROPOSAL default: digest), language follows the user's interface language (bn default), optional Web Push opt-in (if adopted).
- Volunteers have no email or SMS preferences because those channels are not used for them (UX-12); their only choice is the optional push opt-in.
- The inbox keeps every notification permanently with read state; lists are paginated (NFR-11).

## 6. Templates

```
notification_templates
  key, channel (in_app | email | sms | push), locale (bn | en — both required for every key and channel),
  subject (email), title (in_app/push), body (text; email may also have HTML), variables[] (declared, typed),
  version, active, updated_by, updated_at
```

- Variables use `{{name}}` placeholders declared per key (e.g. `{{application_id}}`, `{{project_name}}`, `{{due_date}}`, `{{count}}`); rendering fails closed if a declared variable is missing; numbers and dates go through the central formatter with English digits (UX-05, BR-219).
- A seed set ships in code (`packages/shared/notifications/templates`) and is loaded into the table on deploy; the Department Head and Monitoring Team may edit texts (`notification.template.manage`); every change is a new version and audited; a preview renders the template with sample data in both languages.
- Bilingual completeness is checked in CI: every key used by a `notify:` effect or the matrix must exist in bn and en for each of its channels.
- SMS templates are short and contain no personal data except the recipient's own OTP or animal reference; push titles and bodies are content-free (section 11).

## 7. Delivery, outbox, retries and status

```
domain event (in the business transaction)
  └─ notifications service resolves recipients and channels
       ├─ in-app: INSERT notifications (user, key, params, created_at)  ── same transaction
       └─ email / SMS / push: INSERT outbound_messages (queued)        ── same transaction
worker (pg-boss queue `notify`)
  └─ claim message → render template version → adapter.send → update status
```

`outbound_messages`: id, event_id, recipient (user id or donor id), address (email/mobile, stored for the attempt), channel, template key and version, params JSON, idempotency_key (event id + recipient + channel; unique), status `queued → sending → sent | failed | dry_run | suppressed`, provider message id, attempts, next_attempt_at, last_error (no secrets), created_at, sent_at, delivered_at (when the provider reports delivery).

- **Idempotency (D-054):** before sending, the worker checks the row's status; a `sent` row is never sent again even if the job is redelivered.
- **Retries:** transient failures (SMTP 4xx, provider 5xx, timeouts) retry after 30 s, 2 min, 10 min, 1 h, then hourly up to 24 hours (PROPOSAL) with bounded jitter and respect for provider rate-limit headers; permanent failures (invalid address, rejected content) stop immediately with `failed`.
- **Dry run (O-33):** with no SMS provider configured, SMS rows end in `dry_run` with the rendered text logged (without OTP digits in production-like environments); the admin screen shows them so the Qurbani team sees what would have been sent.
- **Status visibility:** an admin screen lists messages by status and channel with filters; donor messages show per-donor sent status on the donor list (BR-147, BR-148); failures after retries raise `ops_alert` to monitoring and it (D-057) and, for donors, `donor_message_failed`.
- **Retention:** notification rows and outbound message logs are kept permanently like other records (BD-46), except rendered OTP text, which is never stored.

## 8. Rate limits and coalescing

| Limit | Value | Source |
|---|---|---|
| OTP requests | 5 per hour per number or address; 20 per hour per IP | O-25 |
| Email throughput | queue throttle 30 per minute (PROPOSAL), adjustable to the organization's SMTP limits | — |
| SMS throughput | per provider limit configured in settings; donor bulk sends paced and resumable | O-33 |
| In-app per user | coalescing instead of hard caps: identical event key and target within 15 minutes collapse into one entry with a count (PROPOSAL) | — |
| Bulk saves | one summary notification per recipient per bulk batch (e.g. "12 distributions recorded in Winter 2026") | WORKFLOW_ENGINE §8 |
| Digest | digest-eligible staff emails collected and sent once a day | section 5 |

## 9. OTP path

- `OtpDeliveryService` chooses `DummyOtpAdapter` when `OTP_DUMMY_ENABLED=true` (dev/test only; refuses to start in production) or the real adapters otherwise (AUTH.md §2.1).
- Real path: mobile OTP through `SmsAdapter`, email OTP through SMTP; codes are generated and hashed by the auth module (6 digits, 5 minutes, O-25) and passed to the template only at render time; the outbox row stores the template key and the recipient, never the code in clear text.
- Until the SMS provider exists (O-33) the mobile OTP cannot be delivered for real in staging; staging uses the email OTP plus the dry-run log for UAT, and production launch requires the provider (C3 item 10).

## 10. Qurbani donor messages

- Pre-notification after allocation is final (`donor.email:pre_notification`, permission `donor.message.send`): email to donors with an address, SMS to donors with only a mobile, both when both exist (PROPOSAL); content: animal number, share, Qurbani spot (district/upazila/union), no volunteer phone numbers.
- Animal photos after Qurbani (`donor.email:animal_photos`): one email per donor per animal with the three photos as signed links valid 30 days (PROPOSAL) rather than attachments (small emails, no stale copies); photos must be scan-clean (O-30) before sending.
- Per-donor sent status, retries and failures as in section 7; resend by `donor.message.send` with the same idempotency key family (a manual resend creates a new event id and is audited).
- Donor contact data is sensitive (`donor.data`); message logs are visible only to holders of `donor.view`.

## 11. Web Push evaluation

| Aspect | Finding |
|---|---|
| Platform support | Android Chrome (installed PWA and browser) supports Web Push; iOS and iPadOS 16.4 and later support it only for PWAs added to the Home Screen; Safari tabs cannot receive push. |
| Value | Makes in-app items visible when the app is closed: approvals waiting (UX-07 "stuck approvals"), correction requests and sync failures for volunteers; aligns with UX-12 (still in-app content, no SMS/email). |
| Dependency | Push messages travel through the browser vendor's push service (Google FCM for Chrome, Apple Push Notification service for iOS, Mozilla for Firefox). This is an external runtime service, in tension with BD-45 ("nothing cloud-dependent"). |
| Privacy | Payloads pass through vendor infrastructure (encrypted end to end per the Web Push protocol, but metadata is visible). |
| Cost and effort | VAPID keys, subscription storage per device session, service-worker handler, opt-in UI, unsubscribe on logout/revocation; moderate effort. |

**Recommendation: yes, as an optional, off-by-default enhancement, introduced after the Phase 3 pilot** (with Phase 5 monitoring alerts as the first strong use case), under these conditions:

1. The system is fully functional without push; nothing is delivered only by push; in-app remains the record.
2. Payloads are content-free: "ASF Charity: you have 3 new items" (O-31 short name) and a deep link to the inbox; no names, ids, NIDs, amounts or locations.
3. Per-user opt-in on each device; subscriptions tied to the device session and deleted on logout, revocation or wipe.
4. VAPID keys generated and held by the organization; no third-party push SDK.
5. If the department considers any vendor push service unacceptable under BD-45, the answer is "no" and nothing else changes.

Decided by the owner on 2026-10-10 (O-35): adopted on these conditions, after the Phase 3 pilot.

## 12. Security and privacy

- No beneficiary contact data is ever used for messaging (BD-47).
- Recipients are resolved through the authorization scope; a notification never reveals a record the recipient cannot open; the in-app entry links to the record and the API re-checks access on open.
- The old volunteer in a transfer receives only a count, never the transferred applications' details (BR-049).
- Security notifications never include secrets or tokens; OTP codes are never logged or stored in clear text.
- Email links point to the application, never to a direct file; files are opened through the signed-URL path after login (FILES_AND_DOCUMENTS §3), except donor photo links, which are signed, expiring and limited to the donor's own animal.

## 13. Testing

- Template completeness in CI (every key in bn and en per channel; variables declared and used).
- Unit: recipient resolution per rule with scope; coalescing; preference handling (mandatory classes cannot be switched off); digest assembly.
- Integration: outbox written in the same transaction as the event (rollback leaves no message); worker idempotency under redelivery; retry and permanent-failure handling; dry-run SMS; dummy OTP refusal in production configuration.
- E2E: volunteer receives in-app notices for correction request, approval and transfer and nothing by SMS/email; staff email in Mailpit for approvals waiting; donor pre-notification and photo email with sent status; malware alert path.
- No beneficiary message under any event (negative test across the event list).

## 14. Values decided by O-35 (2026-10-10)

1. Web Push: adopted as an optional, off-by-default enhancement after the Phase 3 pilot with content-free payloads, organization-held VAPID keys and per-device opt-in.
2. Staff email default for digest-eligible events: daily digest at 08:00 Asia/Dhaka (staff can switch to immediate).
3. Coalescing window: 15 minutes for identical events.
4. Email and SMS retry give-up: 24 hours (30 s, 2 min, 10 min, 1 h, then hourly).
5. Email throughput throttle: 30 per minute, adjustable.
6. Deadline reminder to volunteers with drafts 3 days before the application deadline.
7. Donors with both email and mobile receive both channels for the pre-notification; donor photo links valid 30 days.

## 15. Implementation (T1.14, 2026-10-18)

Decision record: DECISION_LOG D-099; plan `docs/plans/2026-10-18-0911-feat-notifications-plan.md`.

- **Publish in the business transaction.** Services call `NotificationService.publish(tx, input)` (`apps/api/src/notifications/service.ts`) through `AccountEvents` (registration, correction, decision, edit request, block, handover, permission, session, lockout, refresh reuse) and `ProjectEvents` (activation, closing, closed, reopened, deadline, assignment, consent, team member, project grants). One call writes the in-app rows and, for a key with email, one `outbound_messages` row per official with an address, and enqueues the `notify` job with the same transaction. A rolled-back event leaves nothing. `only: 'in_app' | 'email'` narrows a call when one key reaches people whose text differs by channel (refresh reuse). The lockout and refresh-reuse notices run in a savepoint, so a notice that fails never undoes the security write.
- **Catalogue.** `apps/api/src/notifications/catalogue.ts` lists the Phase 1 keys with their channels and urgency (security and alerts first). Not built because the event does not exist: staff registration pending (staff accounts are created by the admin since D-097), Main Admin transferred (no transfer yet). Finance gets no `project_closed` entry (no project access to open it).
- **Recipients** (`recipients.ts`): the person concerned (also while pending or blocked), roles, holders of a permission whose scope reaches the record (checked one by one inside the transaction), and the people of a project (RPMs, optionally of one area; staff; volunteers). The actor never gets a copy. Beneficiaries are not a recipient kind; email goes only to staff with an address. The test `notification-core` walks every key and proves it.
- **In-app entries** keep the template key, the version and an allow-list of values (`IN_APP_PARAMS`: counts, place, project, the reader's own text, record ids), never another person's name (R16). Entries are rendered when read in the request language from the stored version, with a plain fallback per entry; identical events within 15 minutes (same recipient, key and record) count up one unread entry. The reopen reason is not on the in-app entry, since it reaches everyone on the project.
- **Delivery** (`delivery.ts`, the `notify` consumer in the worker and inline in development): the row is locked while it is sent (`FOR UPDATE SKIP LOCKED`), so a redelivered job never sends a `sent` row again; a crash between the provider's acceptance and the commit can send once more (at least once). Transient failures retry after 30 s, 2 min, 10 min, 1 h, then hourly, with a relative wait on the database clock; the last attempt is the one whose next would fall after 24 hours; permanent failures stop at once. A message that fails for good writes an in-app `ops_alert` to the Monitoring Team after the commit. Emails leave one at a time, `EMAIL_PER_MINUTE` a minute (default 30, per process; production runs the consumers in the worker only). The HTML part escapes everything, subjects are one line, stored errors carry no address or number. The SMS stub returns a dry run and logs no text.
- **Templates** are synced into `notification_templates` by `pnpm db:migrate` (`notifications:sync`, inserts missing keys only). The Department Head and the Monitoring Team list, preview (bn and en with sample values) and edit the in-app and email texts of the catalogue keys (`/admin/notification-templates`); an edit is a new version, audited `notification.template.change`; a text with markup or anything shaped like a link, an undeclared placeholder or a person's name in an in-app text is refused. OTP and set-password texts stay in code.
- **API** (tag notifications): `GET /notifications`, `GET /notifications/unread-count`, `POST /notifications/read`, `GET/PATCH /me/preferences` (email mode for officials; Phase 1 has no digest-eligible event, so every email is sent at once), `GET /admin/notification-templates`, `POST …/{key}/{channel}/preview`, `PUT …/{key}/{channel}`, `GET /admin/deliveries` (`notification.delivery.view`, addresses partly hidden, never a text).
- **Web**: the bell with the unread count in the top bar and the admin bar, the inbox at `/notifications` (SCR-004) with the email setting for officials, the admin pages of the texts and the deliveries. Not built yet: the desktop dropdown of the last 10 entries (the bell opens the page), the daily digest (Phase 2), Web Push (after the pilot).
