# OFFLINE PWA AND SYNC

Status: complete, task T0.12 (2026-10-10). Design only; no code. Sources: blueprint B7 (offline PWA and sync), B10 (field reality), D2; decisions BD-21, BD-48, O-07 (offline data set, 200 MB photo queue, wipe), O-13 (late-synced drafts), D-052 (Next.js, Serwist, Dexie), D-055 (zod shared schemas), UX-06 (iPhones); rules BR-194…202, BR-058, BR-059, BR-077, BR-104, BR-196; NFR-12…28; `docs/architecture/AUTH.md` §5, §8, §9; `docs/architecture/WORKFLOW_ENGINE.md` §8 and `workflow-templates/_common.yaml`; `docs/architecture/SYSTEM_ARCHITECTURE.md` §7; ADR-005, ADR-006. Values not yet decided by the owner are marked PROPOSAL and collected in section 15 (DECISION_LOG open question 26).

## 1. Goals and constraints

- Field work never stops for lack of network: applications, today's distribution / class / construction / visit / follow-up, expense claims, consent, edit requests are captured offline and submitted when the network returns; nothing is lost (B7, Q-23, BR-200).
- One PWA for everyone; volunteers mainly on low-cost Android phones (2 GB RAM), some on iPhones; 2G/3G and intermittent networks (NFR-12…19).
- The server stays the authority: every offline record passes the same authorization, validation, guards and audit as an online request when it is synced (SYSTEM_ARCHITECTURE §6, §7).
- Sensitive data on the phone is encrypted and wiped on logout or revocation (BR-198, NFR-36).
- No background sync can be assumed (iOS); the design works with foreground sync only.

## 2. What is cached on the device (O-07)

| Data set | Content | Refresh | Size guard |
|---|---|---|---|
| Assigned projects | project id, name, status, template snapshot (states, stages, labels), photo rule and source, limits, deadline, rules texts, consent state | on every snapshot pull; a project the user is no longer assigned to is removed | small |
| Current form versions | the published form version of each assigned project (sections, fields, options, logic) | pulled when the server reports a newer version; old version kept until drafts on it are synced | small |
| Own beneficiaries and applications | the volunteer's own applications (status, stage, basic beneficiary data without masked fields) and, for Local দায়ীs and paid volunteers, assigned beneficiaries | delta by `since` timestamp | paginated; ASSIGNED/SELF only |
| Syllabus | topics of dawah-enabled projects | with the project snapshot | small |
| Locations | the four-level master (division → district → upazila → union), active rows only | version number; full download only when it changes | about 5,000 rows |
| Reference lists | beneficiary class options, outcomes, expense categories, payment methods, i18n catalogue | with the snapshot | small |
| Outbox and photo queue | section 3 and section 5 | — | photo queue 200 MB (O-07) |

Never cached: NID photos, bank details, ratings, categories, donor data, official sections, audit detail, other volunteers' data (field-level protection applies to the snapshot endpoint exactly as to every other endpoint, BR-183). The NID or birth number of the volunteer's own beneficiaries is cached because the volunteer entered it and needs it to recognize the person; it is encrypted at rest (section 7).

## 3. Outbox pattern and record lifecycle

Every offline write is an **outbox record** in Dexie (IndexedDB), never a direct call. Online, the same path is used with immediate flush, so there is one code path.

```
outbox record
  client_uuid        UUID v4 generated on the device; the server's idempotency key (BR-194)
  kind               application_draft | application_submit | application_update | field_update |
                     activity (distribution, training, construction, visit, follow_up, inspection) |
                     stock_receive | stock_reconcile | expense_claim | voucher_submit | consent_accept |
                     edit_request | profile_contact_update
  target             server id of the application/activity when known; null for new records
  project_id, form_version_id, template_version
  payload            zod-validated with the shared schema of packages/shared (D-055)
  attachments[]      slots that reference photo-queue entries (section 5)
  client_created_at, client_updated_at   device clock, with the server offset learned at last sync
  sync_status        pending | syncing | synced | failed
  attempts, next_retry_at, failure_code, failure_reason_key, server_result
  dependencies[]     client_uuids this record needs synced first (e.g. activity after application_submit)
```

Lifecycle (BR-195):

```
pending ──(flush)──► syncing ──(server: synced)──► synced ──(after 7 days, PROPOSAL)──► purged
   ▲                    │
   │                    ├──(server: needs_verification)──► synced (record flagged on the server; shown to the user)
   │                    ├──(network error / 5xx / timeout)──► pending (retry with backoff)
   └──(retry now)───────┴──(server: failed <code>)──► failed (reason shown; user may edit and resubmit, which creates a new pending version of the same client_uuid)
```

Retry schedule (PROPOSAL): 30 s, 2 min, 10 min, 1 h, then every hour for up to 7 days, each with ±20% jitter; after that the record stays `failed` with reason `retry_exhausted` and appears in the needs-attention card until the user retries or deletes a draft. A server business failure (validation, guard, permission) is final (`failed`), not retried automatically, because retrying cannot change the outcome; the user corrects the record.

Ordering: records flush in `client_created_at` order with dependencies respected (an `application_submit` before the `activity` rows of that application). Flush triggers: app open, `online` event, `visibilitychange` to visible, after any local write when online, manual "sync now", and a 15-minute timer while the app is open and online.

## 4. Batch sync endpoint

```
POST /api/v1/sync/batch
Idempotency-Key: <batch uuid>
{ device_time: ..., records: [ up to 50 text records, dependency-ordered ] }

200 { server_time, results: [ { client_uuid, result: synced | needs_verification | failed,
                                 server_id, status, stage, failure_code, failure_reason_key, conflict: {...} } ] }
```

- Authentication and the permission `sync.batch` (SELF scope) gate the endpoint; each record is then processed through the ordinary application service of its kind, with the originating user as actor, so permission, scope, guards, effects and audit are identical to the online path (SYSTEM_ARCHITECTURE §6 step 11).
- Idempotency at two levels: the batch id (a replayed batch returns the stored results) and the record `client_uuid` (a replayed record returns its stored result and never creates a duplicate, BR-194).
- Partial success is normal: every record gets its own result; the batch never fails as a whole because one record failed.
- Batch size 50 (PROPOSAL) keeps requests small on 2G; the client sends consecutive batches until the outbox is drained, photos excluded.
- `server_time` lets the client compute its clock offset; `client_created_at` is stored as received and the offset recorded, so the deadline guard (O-13) can evaluate the original creation time with a known tolerance.

Snapshot endpoint:

```
GET /api/v1/sync/snapshot?since=<timestamp>&project=<id>   (ETag / If-None-Match per data set)
```
returns only changed rows of the data sets of section 2, with field-level masks applied; a 304 saves bandwidth.

## 5. Photo queue and resumable upload

- Photos are captured through the in-app camera (or gallery where the project setting allows, UX-11), compressed on the device to at most 300 KB / 1,600 px (NFR-25) before they enter the **photo queue**, a separate Dexie table of blobs keyed by `client_uuid` + attachment slot, with capture time, GPS (if available) and source.
- Text first, photos later (BR-196): the outbox flushes before the photo queue; a photo uploads only after its owning record is `synced` and has a server id.
- Upload is chunked and resumable (ADR-005): the client asks the API for an upload session, uploads 256 KB chunks (PROPOSAL) to presigned URLs, resumes from the last acknowledged chunk after a drop, and finalizes through the API, which validates, stores metadata and runs the duplicate check (BR-109).
- A distribution or any photo-gated step cannot complete while its photos are pending: the engine guard `photos.not_pending_sync` fails and the record shows "photos pending" (WORKFLOW_ENGINE §6). The activity is already recorded; only the completion waits.
- Budget: 200 MB per device (O-07); at 80% the app warns and suggests syncing; at 100% new photos are refused until space is freed by successful uploads (NFR-22). Uploaded photos are deleted from the queue immediately (the server copy is permanent).

## 6. Conflict rules at sync (BD-48, O-13)

| Record kind | Rule | Logged as |
|---|---|---|
| Changes to approved or locked data (an approved application's locked fields, verified vouchers, locked photos) | **Server wins.** The client change is rejected with `failed: locked_on_server`; the client discards its local change after showing it to the user | `audit:sync.conflict_server_won` with the rejected values |
| Drafts and pending applications, field updates inside an open unlock, profile contact updates | **Last write wins** by comparing `client_updated_at` (offset-corrected) with the server's `updated_at`; the losing version is kept in the audit entry | `audit:sync.conflict_last_write` with both versions |
| Activities and bulk rows (distribution, class, construction, visit, follow-up) | **Append-only.** A duplicate `client_uuid` is ignored; two different records for the same beneficiary and day are both kept and the stage transition is attempted once; a transition whose guard fails leaves the stage unchanged and returns the reason (WORKFLOW_ENGINE §8) | ordinary audit per activity |
| Offline-created beneficiary whose NID or birth number already exists on the server | The application is **not deleted**; it enters `needs_verification`; an official links it to the existing profile or rejects (BR-104, `_common.yaml`) | `audit:application.verified_link` on resolution |
| Draft synced after the project deadline | Accepted only if `client_created_at` is before the deadline (offset tolerance applied); then flagged `needs_verification`; otherwise `failed: deadline_passed` | per O-13 |
| Draft synced after the volunteer's limit was reached | `limit.not_exceeded` counts drafts, so a draft created within the limit offline but synced after other submissions filled it is refused with `failed: limit_exceeded`; the volunteer sees it in the needs-attention card | BR-059, O-13 |
| Record referencing a project that was closed meanwhile | `failed: project_closed`; follow-up evaluations are the exception and are accepted | BR-056 |
| Volunteer blocked or assignment removed while offline | `failed: not_permitted`; the record stays on the device until the user deletes it; nothing is accepted silently (AUTH.md §9) | audit of the denied attempt |

Offline NID lookup is impossible (B7): the volunteer enters the identity number and the basic fields by hand; auto-fill happens only online. The form keeps the entered data; at sync the server performs the lookup and either links to the existing profile (auto-fill fields are then overwritten by the server's locked values: name, father/husband name) or creates the profile. Where entered values differ from the locked profile values, the record goes to `needs_verification` rather than silently changing either side.

## 7. Local storage security

- All Dexie tables holding business data (outbox, photo queue, cached beneficiaries, applications, forms with answers) are encrypted at field level with AES-GCM; cached static reference data (locations, i18n, syllabus) is not encrypted.
- The key is derived in memory from the current refresh token and a per-device random salt (HKDF-SHA-256); it is never written to storage. It is re-derived when the refresh token rotates (AUTH.md §5), with a short re-encryption of the key-wrapping record only (the data keys are wrapped, so a rotation does not re-encrypt every row).
- Wipe triggers: logout; 401 `session_revoked`; refresh token rejected as reused or revoked; the user deleting the installed app (storage goes with it). A wipe deletes all Dexie databases, the photo queue, the service-worker runtime cache for API data and in-memory tokens (BR-198, AUTH.md §8).
- Before logout with unsynced records the app shows a blocking warning listing pending and failed records and offers "sync now"; proceeding requires a second confirmation and is logged at next login (`auth.logout_with_pending`, count only).
- The app offers no "clear data" button while records are pending; browser-level clearing is outside the app's control and is covered by the iOS mitigations in section 11 and by the install guide.
- If the refresh token merely expired (30 days without sync, `invalid_grant`), the outbox is **kept**; the user logs in again on the same device and the records are re-keyed from the new session (the old wrapped keys are unwrapped with a device-bound recovery key that is itself wrapped by the previous refresh token's derived key; PROPOSAL, open item). If this proves fragile in T2.7, the fallback is to require sync before expiry through the nudges of section 9 and to warn at login when records would be lost.

## 8. Form-version handling

- Every draft and submission carries `form_version_id` (BR-077). A form republished while the volunteer was offline does not invalidate drafts: the server accepts a record on the older version when the record's `client_created_at` is before the new version's `published_at`, stores it under that version, and the application keeps that version for its lifetime.
- A draft created offline **after** the new version was published but on the stale cached form is still accepted under the old version and flagged `needs_verification` with reason `stale_form_version`, so an official can check whether new mandatory questions matter.
- The client keeps the old version in cache until no draft references it, then removes it; new drafts always use the latest cached version. The snapshot endpoint tells the client about a newer version, and the form screen shows a notice "form updated, syncing will refresh it".
- Logic and calculations are evaluated with the shared evaluator of `packages/shared` on both sides (BR-076), so a draft valid offline is valid online under the same version.

## 9. Sync status UI and the offline banner

- **Offline banner** at the top of every screen when the device reports offline or the last request failed with a network error: "You are offline. Your work is saved on this phone." with the pending count.
- **Sync chip** in the app bar: pending / failed counts; tap opens the **sync centre**: records grouped by status with the Bangla reason for failures, "retry now", "retry all", and for drafts "edit" or "delete"; a photo-queue section with uploaded/pending bytes and the budget bar.
- **Per-record badges** on lists: pending, syncing, failed, needs verification, photos pending.
- **Needs-attention card** on the volunteer home (UX-12) lists failed records, records needing verification, and "photos pending" items.
- **Nudges**: when pending records are older than 24 hours (PROPOSAL) the app shows a reminder on open; on iOS the reminder is stronger (section 11).
- All messages use i18n keys with English digits (UX-05).

## 10. Token behaviour while offline (AUTH.md §5, §9)

- An expired access token never blocks local work; the app continues with cached permissions.
- Every flush starts with a refresh if the access token is expired; refresh success → sync; refresh failure `invalid_grant` (expired) → outbox kept, user asked to log in (section 7); `session_revoked` → wipe.
- Permission changes made while the volunteer was offline take effect at sync: records are re-checked server-side and denied with reasons; the client refreshes its cached permissions from the token's `permission_version` (AUTH.md §9).

## 11. iOS (UX-06)

| Topic | Fact | Design response |
|---|---|---|
| Installed PWA vs Safari tab | An installed PWA (Share → Add to Home Screen) gets its own storage and runs standalone; a Safari tab shares Safari's storage and loses state more easily | Treat installation as the supported mode for volunteers on iPhones; the Safari tab works for lookups but shows an "install for offline work" notice before offline capture |
| Storage eviction | Safari may evict IndexedDB and cache storage of sites not used for a while, and clears them when the user clears Safari data | Request `navigator.storage.persist()` at first login; sync on app open, on `visibilitychange`, on `online`; nudge when pending > 0 for more than 24 hours and daily after; show a warning that unsynced work can be lost if the app is removed or data cleared; keep the photo budget lower on iOS (100 MB, PROPOSAL) so queues drain faster |
| No background sync | iOS does not run the Background Sync API | Foreground sync only (section 3 triggers); no promise of "it will sync by itself later" in the UI; the home screen shows the pending count prominently |
| Push notifications | Only installed PWAs can receive Web Push on iOS; decision deferred (T0.14) | In-app inbox remains the primary channel (UX-12); push, if adopted, is an enhancement for installed apps |
| Camera and files | Camera capture works through the file input with `capture`; EXIF may be stripped | Capture time is taken from the device clock at capture; GPS from the Geolocation API with the user's permission; missing metadata flags the photo (BR-109) |
| Install guidance | Users do not find "Add to Home Screen" | Bangla step-by-step install guide with screenshots inside the app and in the volunteer manual (T2.10); champions trained on it (D2) |
| Memory | Older iPhones and 2 GB Android phones | Lists paginated, images downscaled, no heavy animation (NFR-12, design brief) |

## 12. Sequence diagrams

First sync after offline capture:

```
PWA                                   API                              worker
 │ online event                        │                                │
 │ refresh token if expired ──────────►│                                │
 │◄──────────────────── new tokens ────│                                │
 │ POST /sync/batch (≤50 text records)►│ idempotency: batch, client_uuid│
 │                                     │ per record: authz, zod, service│
 │                                     │ guards, effects, audit         │
 │◄──── per-record results ────────────│ (jobs enqueued in tx) ────────►│ notify, alerts
 │ mark synced / failed / needs_verif. │                                │
 │ photo queue: upload session ───────►│ presigned chunk URLs           │
 │ chunks ─────────────────────► MinIO │                                │
 │ finalize ──────────────────────────►│ validate, metadata, duplicate ─►│ photos job
 │◄──── photo linked; completion guard re-evaluated ─────────────────────│
 │ GET /sync/snapshot?since ──────────►│ masked deltas, ETags           │
```

Conflict on a locked field:

```
PWA: field_update(client_uuid X, application A, field mobile, value V2, client_updated_at t2)
API: A.status = approved, field locked, no open unlock → reject
     result { X: failed, failure_code: locked_on_server, conflict: { server_value: V1 } }
     audit: sync.conflict_server_won { A, field, client_value V2, server_value V1, actor }
PWA: show "This field is locked; the office keeps V1" → discard local change
```

NID collision:

```
PWA: application_submit(client_uuid Y, beneficiary { nid N, name, ... }) created offline
API: beneficiary with nid N exists (BEN-ID B) → application created in needs_verification, linked candidate B
     result { Y: needs_verification, server_id: APP-..., reason_key: existing_identity }
Official: verifies, links to B (or rejects) → submitted → ordinary cycle
```

## 13. Test strategy

| Level | What | Tool |
|---|---|---|
| Unit (shared) | Outbox state machine (statuses, retries, dependencies), conflict resolution rules, clock-offset handling, form-version selection, encryption wrap/unwrap | Vitest on `packages/shared` and the PWA store |
| API | `/sync/batch` idempotency (batch and record), per-record results, needs-verification routing, late-draft deadline and limit rules, locked-field rejection with audit, snapshot deltas and masking | Supertest against the test database |
| E2E | Playwright with offline emulation and a throttled 3G profile: capture application offline → reconnect → synced; today's distribution offline with photos → text first, photos later, completion blocked until photos; conflict scenarios; logout warning with pending records; revocation wipe | Playwright, Android Chrome profile |
| Device matrix | Installed PWA on a 2 GB Android phone (Chrome); iPhone: Safari tab and installed PWA, including persist() request, eviction simulation (clear website data) and recovery messaging | Manual script before each gate (UAT) |
| Load | Sync burst on distribution day: 2,000 devices flushing batches within 30 minutes with the worker under photo load | k6 (NFR-02, T3.4) |
| Security | Encrypted-at-rest check of IndexedDB contents, wipe on revocation, no masked field in the snapshot | automated where possible, manual review |

## 14. Code and data

Code: the outbox and photo-queue stores, the sync client, the batch and snapshot endpoints, conflict resolution, encryption, the service worker configuration. Data: what each project caches (template snapshot), form versions, reference lists, budgets and thresholds in settings (photo budget, nudge interval, batch size, retry schedule).

## 15. Values to confirm (DECISION_LOG open question 26)

1. Retry schedule 30 s, 2 min, 10 min, 1 h, then hourly up to 7 days; synced records purged from the device after 7 days.
2. Batch size 50 records; chunk size 256 KB.
3. Nudge when pending records are older than 24 hours; daily afterwards.
4. iOS photo budget 100 MB (Android 200 MB per O-07).
5. Recovery of a kept outbox after refresh-token expiry through a device-bound wrapped key (section 7), or the fallback of warning and requiring sync before expiry.
