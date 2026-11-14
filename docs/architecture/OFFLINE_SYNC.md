# OFFLINE PWA AND SYNC

Status: complete, task T0.12 (2026-10-10). Design only; no code. Sources: blueprint B7 (offline PWA and sync), B10 (field reality), D2; decisions BD-21, BD-48, O-07 (offline data set, 200 MB photo queue, wipe), O-13 (late-synced drafts), D-052 (Serwist, Dexie; the Next.js part replaced by the Vite SPA of D-073), D-055 (zod shared schemas), UX-06 (iPhones); rules BR-194…202, BR-058, BR-059, BR-077, BR-104, BR-196; NFR-12…28; `docs/architecture/AUTH.md` §5, §8, §9; `docs/architecture/WORKFLOW_ENGINE.md` §8 and `workflow-templates/_common.yaml`; `docs/architecture/SYSTEM_ARCHITECTURE.md` §7; ADR-005, ADR-006. The values proposed in the first draft were decided by the owner on 2026-10-10 as O-29 with additional requirements; section 15 lists them as binding. Where the text below still says PROPOSAL it refers to that first draft and is now decided unless section 15 says otherwise.

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
| Locations | the four-level master (division → district → upazila → union) with the post code of each place (D-160), active rows only | version number; full download only when it changes | about 5,600 rows |
| Reference lists | beneficiary class options, outcomes, expense categories, payment methods, i18n catalogue | with the snapshot | small |
| Outbox and photo queue | section 3 and section 5 | — | photo queue 200 MB (O-07) |

Never cached: NID photos, bank details, ratings, categories, donor data, official sections, audit detail, other volunteers' data (field-level protection applies to the snapshot endpoint exactly as to every other endpoint, BR-183). NID and birth-registration numbers are never part of the cached data set either (constitution §5, BR-183): the volunteer recognizes beneficiaries by name, father or husband name and village. Only the number the volunteer typed into an unsynced draft stays in the encrypted outbox until that record is synced (section 7).

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

Retry schedule (O-29): transient network and server failures (timeouts, 5xx, 429, 503) are retried after 30 s, 2 min, 10 min, 1 h, then every hour for up to 7 days, each with bounded jitter (±20%); a server `Retry-After` header overrides the next retry time. After 7 days the record stays `failed` with reason `retry_exhausted` and appears in the needs-attention card until the user retries or deletes a draft. A permanent business failure (validation, guard, permission, 4xx other than 429) is final (`failed`), never retried automatically; the user corrects the record, which creates a new pending version under the same `client_uuid`.

Purge (O-29): a `synced` record is deleted from the device 7 days after sync only when the server confirmed persistence (the result carried the server id and a later snapshot or result acknowledged it) and no dependent record or photo upload is still pending. Records with pending dependants stay until the dependants are synced.

**As built (T2.7, D-139).** The kinds built are `application_draft`, `application_update`, `application_submit` and `field_update` (the fill of an answer the office unlocked); the other kinds stay declared for their phases. A row keeps its state columns in the clear and its payload and base version sealed (`apps/web/src/offline/{db,outbox}.ts`); the state machine with its `interrupted` (a killed app) and `retry_now` events is `@css/shared/sync/outbox.ts`. A flush asked while one runs starts right after it; the batch on its way is kept sealed in the `meta` table with its exact bytes and key, so a timed-out batch is replayed byte for byte; the data set's application summaries come from the snapshot and the answers are pulled a few per flush, and a pull keeps the answers the phone already holds while the record's ETag did not change. The volunteer's own drafts without a server id are listed beside the server's list, also when the server cannot be read.

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
- Batch size 50 records (O-29) with a separate payload-size limit (PROPOSAL 1 MB per batch, enforced by the client and the API) keeps requests small on 2G; the client sends consecutive batches until the outbox is drained; photos and attachments never travel in record batches (section 5).
- `server_time` lets the client compute its clock offset; `client_created_at` is stored as received and the offset recorded, so the deadline guard (O-13) can evaluate the original creation time with a known tolerance.

**As built (T2.7).** The request is `{ deviceTime, pendingAfter, records }` and a result is `{ clientUuid, result, serverId, status, code, pendingPhotos, conflict }` (camel case throughout, `docs/api/openapi.yaml`); the batch key is reserved first and each record runs in its own transaction, so one refused record never fails the batch; a photo still on the phone stands in its answer as a pending slot the later upload fills; the device clock is believed within a day and never into the future, and `clientCreatedAt` is kept for the deadline guard of a late send. A record on a closed project, over the volunteer's limit, by a blocked volunteer or after the deadline answers `sync.*` codes with Bangla and English words.

Snapshot endpoint:

```
GET /api/v1/sync/snapshot?since=<timestamp>&project=<id>   (ETag / If-None-Match per data set)
```
returns only changed rows of the data sets of section 2, with field-level masks applied; a 304 saves bandwidth. As built: `GET /sync/snapshot?since=&afterId=` pages oldest first with a (time, id) cursor answered as `nextSince`, `nextAfterId` and `hasMore`; the window starts a minute early; form versions carry their `projectId`; the locations master comes whole from `GET /locations/all` under its version. An official's snapshot is empty (R43, the owner's choice: officials keep nothing on the device in this task).

## 5. Photo queue and resumable upload

- Photos are captured through the in-app camera (or gallery where the project setting allows, UX-11), compressed on the device to at most 300 KB / 1,600 px (NFR-25) before they enter the **photo queue**, a separate Dexie table of blobs keyed by `client_uuid` + attachment slot, with capture time, GPS (if available) and source.
- Text first, photos later (BR-196): the outbox flushes before the photo queue; a photo uploads only after its owning record is `synced` and has a server id.
- Upload is chunked and resumable (ADR-005, D-108): the client asks the API for an upload session, sends 256 KB parts (O-29) to the API, resumes from the parts the server holds after a drop, and finalizes through the API, which validates, stores metadata and runs the duplicate check (BR-109).
- A distribution or any photo-gated step cannot complete while its photos are pending: the engine guard `photos.not_pending_sync` fails and the record shows "photos pending" (WORKFLOW_ENGINE §6). The activity is already recorded; only the completion waits.
- Budget (O-29): 200 MB on Android, 100 MB on iOS; at 80% the app warns and suggests syncing; at 100% new photos are refused and the user is notified with a "free space" action that offers only safe cleanup, i.e. deleting eligible **synchronized** files whose server copy is confirmed. **Unsynchronized photos or attachments are never deleted automatically** to free space (BR-237). Uploaded photos are deleted from the queue once the server confirms the stored object (the server copy is permanent).

## 6. Conflict rules at sync (BD-48, O-13)

| Record kind | Rule | Logged as |
|---|---|---|
| Changes to approved or locked data (an approved application's locked fields, verified vouchers, locked photos) | **Server wins.** The client change is rejected with `failed: locked_on_server`; the client discards its local change after showing it to the user | `audit:sync.conflict_server_won` with the rejected values |
| Drafts and pending applications, field updates inside an open unlock, profile contact updates | **Last write wins** by comparing `client_updated_at` (offset-corrected) with the server's `updated_at`; the losing version is kept in the audit entry | `audit:sync.conflict_last_write` with both versions |
| Activities and bulk rows (distribution, class, construction, visit, follow-up) | **Append-only.** A duplicate `client_uuid` is ignored; two different records for the same beneficiary and day are both kept and the stage transition is attempted once; a transition whose guard fails leaves the stage unchanged and returns the reason (WORKFLOW_ENGINE §8) | ordinary audit per activity |
| Offline-created beneficiary whose NID or birth number already exists on the server | The application is **not deleted**; it enters `needs_verification`; an official links it to the existing profile or rejects (BR-104, `_common.yaml`) | `audit:application.verified_link` on resolution |
| Entry without an identity number (the project asks the document "if they have one", D-172) | Synced like an online send: the server makes a profile without a document, and without a mobile where the project lets it be left out; where the project requires the document the send fails with `workflow.guard.identity_present` and the draft stays. A new person who looks like a blocked one, with a number nobody holds or without one, is held: `needs_verification` with no reason code, so the phone says only that the office verifies it (the outbox keeps such a record as held under `HELD_WITHOUT_REASON`, and the sync centre lists it under "অফিস যাচাই করছে" with the group's general line) | BR-298, BR-299, BR-304 |
| Draft synced after the project deadline | Accepted only if `client_created_at` is before the deadline (offset tolerance applied); then flagged `needs_verification`; otherwise `failed: deadline_passed` | per O-13 |
| Draft synced after the volunteer's limit was reached | `limit.not_exceeded` counts drafts, so a draft created within the limit offline but synced after other submissions filled it is refused with `failed: limit_exceeded`; the volunteer sees it in the needs-attention card | BR-059, O-13 |
| Record referencing a project that was closed meanwhile | `failed: project_closed`; follow-up evaluations are the exception and are accepted | BR-056 |
| Volunteer blocked or assignment removed while offline | `failed: not_permitted`; the record stays on the device until the user deletes it; nothing is accepted silently (AUTH.md §9) | audit of the denied attempt |

Offline NID lookup is impossible (B7): the volunteer enters the identity number and the basic fields by hand; auto-fill happens only online. The form keeps the entered data; at sync the server performs the lookup and either links to the existing profile (auto-fill fields are then overwritten by the server's locked values: name, father/husband name) or creates the profile. Where entered values differ from the locked profile values, the record goes to `needs_verification` rather than silently changing either side.

An entry without an identity number (D-172): where the project the phone holds asks the document "if they have one", the new-application screen offers the start from the name without network too (the rule is part of the cached project; a project cached before the rules existed asks the document). Such an entry carries no identity answer at all, so nothing of it waits for a lookup: it is an ordinary `application_draft` with its `application_submit`, sealed in the outbox like every record, listed in the sync centre under "পাঠানোর অপেক্ষায়" by the typed name, and at sync the server makes the profile without a document as it does for an online send. It is held for the office only for the reasons any entry is (a late sync, a retired form version, a person who looks like a blocked one). If the PM asked the document again while the phone was away, the send fails with `workflow.guard.identity_present` the draft stays a draft, and the sync centre lists the refused send with that reason until the volunteer gives the number.

## 7. Local storage security

- All Dexie tables holding business data (outbox, photo queue, cached beneficiaries, applications, forms with answers) are encrypted at field level with AES-GCM; cached static reference data (locations, i18n, syllabus) is not encrypted.
- The data key (as built in T2.7, D-139): one random 256-bit AES-GCM key per device seals every secret field with its own IV. It is written to the phone only wrapped, twice: under the **device key** the server issues for the device session (returned by login and refresh in the body, never a cookie; kept in memory only; stored on the server sealed with the session, see AUTH.md §5) and under a **device-bound key** the browser generates non-extractable and keeps as a `CryptoKey` in the `keys` table. The working data key is imported non-extractable. This replaces the refresh-token derivation of the first design, which the app cannot perform because the refresh token is an HttpOnly cookie.
- **What the device-bound key does and does not protect.** It exists so the app opened offline after a cold start can read and write its tables (the server's key is not there yet). Its price is that any script running on the app's origin, or anyone holding the unlocked phone with the app installed, can open the store without signing in: the wrapped key and the key that opens it sit in the same database. The encryption at rest therefore protects against a copied or backed-up database and against other origins, not against a compromised origin or an unlocked phone; the Content-Security-Policy, the session's revocation (which wipes the store) and the phone's own lock are the guards there. A PIN- or biometric-derived third wrap for the cold-start open is a possible later hardening (owner decision).
- **One opener at a time.** The sign-in path and the cold-start path open the ring through one in-flight promise, so two openers never make two rings and seal rows under different keys. On a sign-in the ring opens before the session is published to the screens, so the first flush finds the key.
- **Another user on the same phone.** A sign-in by a different user clears the store after counting the records not yet accepted by the server; the count is noted on the device and reported by the next login (`lostPending`), and the person who signed in sees only that leftover data was removed, never the count or the owner.
- Wipe triggers: logout; 401 `session_revoked`; refresh token rejected as reused or revoked; the user deleting the installed app (storage goes with it). A wipe deletes all Dexie databases, the photo queue, the service-worker runtime cache for API data and in-memory tokens (BR-198, AUTH.md §8).
- Before logout with unsynced records the app shows a blocking warning listing pending and failed records and offers "sync now"; proceeding requires a second confirmation and is logged at next login (`auth.logout_with_pending`, count only). As built: the warning is two confirm dialogs with the count and a sync button in the first (`apps/web/src/features/sync/LogoutWarning.tsx`); an online logout sends the count, which the server writes onto the session row before revoking it; when the server never heard the logout (the network was away), the phone notes `css_logout_pending` and the next refresh spends the refresh cookie on one token that revokes the session, staying signed out, so the next person on a shared phone is never signed in by the surviving cookie; the lost count is noted for the next login as well.
- **The offline cold start as built.** A refresh that fails on the network signs a volunteer in from the phone's own store: the device-bound key opens the ring (`openOffline`) and the cached `me` of the last sign-in says who; there is no token, so the first request with network refreshes first. An official's installed app opens the same way (T2.7b, D-142): the sign-in opens the ring for every person and keeps the profile (`me`) in the store, which for an official holds nothing else, so the shell, the home and the banner open offline and every read says it needs the connection; no official data set is cached and no official write is queued; logout and revocation wipe the store as for a volunteer.
- **No plain copies outside the store (Phase 2 gate, 2026-11-07).** The answers a person is typing are held in memory only; nothing personal is written to the tab's `sessionStorage` or `localStorage`, where it would wait unencrypted. A volunteer's draft reaches the encrypted outbox at the end of each part. The plain reload copies an earlier version kept (`apply:…`, `public-apply:…`) are removed when a form opens. When the key ring cannot be opened, the sync engine reports `offline.store_unavailable` and the shell shows that sync failed while records wait, instead of a silent outbox.
- The app offers no "clear data" button while records are pending; browser-level clearing is outside the app's control and is covered by the iOS mitigations in section 11 and by the install guide.
- **Outbox persistence across credential expiry (O-29).** When the access or refresh credentials expire (`invalid_grant`), encrypted pending outbox records are **preserved**, never silently discarded. The data keys are wrapped twice: by the session-derived key (section above) and by a device-bound key held in platform-appropriate secure storage where it exists (WebAuthn/PRF-backed or platform keystore-backed key on Android Chrome where available; on iOS Safari, a non-extractable CryptoKey stored in IndexedDB, which is the strongest option the platform offers). After re-authentication on the same device the records are unwrapped with the device-bound key and re-keyed to the new session; synchronization of protected records requires that re-authentication first. If secure persistence across expiry cannot be implemented on a platform (T2.7 verifies this per platform), the documented fallback for that platform is advance synchronization warnings: reminders from 7 days before refresh-token expiry, a blocking warning at 24 hours, and a clear statement at login of what would be lost.

Recovery behaviour by event (O-29):

| Event | Outbox and photo queue | Local cache | Keys and tokens | User experience |
|---|---|---|---|---|
| Logout (user) | Warning if anything is pending; after confirmation wiped | wiped | wiped | Must sync first to keep work; confirmation logged at next login |
| Device revocation by an official (lost phone) | wiped | wiped | wiped | Next request fails with `session_revoked`; login screen with message; the official saw the pending count in the confirmation dialog |
| Credential expiry (`invalid_grant`) | preserved, encrypted | preserved | session key gone; device-bound key keeps data recoverable | Login required; after login records are re-keyed and synced; nothing lost |
| App removal / site data cleared by the user | lost with the storage (outside the app's control) | lost | lost | Prevented by warnings and the install guide; iOS persist() request; reminders while pending |
| Key loss (secure storage unavailable or corrupted) | undecryptable → treated as lost; count reported at login | re-downloaded | regenerated | The app reports the number of records that could not be recovered and asks the user to re-enter them; audited (`sync.outbox_unrecoverable`) |
| Account deactivation or block while records pending | records rejected at sync with `not_permitted`; kept on the device until the user deletes them | wiped on next login attempt | wiped | Message explains the state; nothing silently accepted or deleted |

## 8. Form-version handling

- Every draft and submission carries `form_version_id` (BR-077). A form republished while the volunteer was offline does not invalidate drafts: the server accepts a record on the older version when the record's `client_created_at` is before the new version's `published_at`, stores it under that version, and the application keeps that version for its lifetime.
- A draft created offline **after** the new version was published but on the stale cached form is still accepted under the old version and flagged `needs_verification` with reason `stale_form_version`, so an official can check whether new mandatory questions matter.
- The client keeps the old version in cache until no draft references it, then removes it; new drafts always use the latest cached version. The snapshot endpoint tells the client about a newer version, and the form screen shows a notice "form updated, syncing will refresh it".
- Logic and calculations are evaluated with the shared evaluator of `packages/shared` on both sides (BR-076), so a draft valid offline is valid online under the same version.
- The definition the client caches is exactly what `GET /form-versions/{versionId}` answers (T2.3): the sections, fields, options, logic and calculations in the engine's own shape, already filtered to the volunteer-visible part for a volunteer, so the cached form never holds an official-only section and the evaluator runs on the same object on both sides.

## 9. Sync status UI and the offline banner

- **Offline banner** at the top of every screen when the device reports offline or the last request failed with a network error: "You are offline. Your work is saved on this phone." with the pending count.
- **Sync chip** in the app bar: pending / failed counts; tap opens the **sync centre**: records grouped by status with the Bangla reason for failures, "retry now", "retry all", and for drafts "edit" or "delete"; a photo-queue section with uploaded/pending bytes and the budget bar.
- **Per-record badges** on lists: pending, syncing, failed, needs verification, photos pending.
- **Needs-attention card** on the volunteer home (UX-12) lists failed records, records needing verification, and "photos pending" items.
- **Reminders (O-29)**: the first reminder appears when a record has been pending for 24 hours, then once per day while pending records remain; reminders stop when sync succeeds. The sync chip and sync centre always show the pending count, the last successful synchronization time and actionable failure reasons.
- All messages use i18n keys with English digits (UX-05).

**As built (T2.7).** The banner (the asf `OfflineBanner` from `@/ui` since D-150, a named landmark) follows the engine: offline with the waiting count, syncing, failed (only while something waits; a volunteer without a project has no `sync.batch` and is not told of a refused pull), back online for a moment; a volunteer's banner opens the sync centre. The chip (`features/sync/SyncChip.tsx`) counts pending, syncing and failed and turns red on a refusal; the centre at `/sync` groups the records (refused with the reason, waiting, the office verifying, photos to go) with "আবার পাঠান" per record and for all, edit and delete of a draft of the phone's own, the photo room against the budget with the free-space action, the last sync, the iOS notice and "এখনই সিঙ্ক করুন". The badges of the volunteer's lists come from the outbox rows, and a record the office verifies carries that badge until the data set shows the decision. The home's "needs your attention" lists the device's own kinds (`sync_failed`, `sync_verifying`, `photos_pending`) before the server's, and the day-old reminder is an alert on the home and in the centre, once a day, read from the outbox itself. The install hint on the volunteer's home keeps the browser's prompt (Android Chrome) or shows the share-sheet steps (iPhone); the profile menu brings it back; a waiting new version shows a reload banner and takes over only on the tap.

## 10. Token behaviour while offline (AUTH.md §5, §9)

- An expired access token never blocks local work; the app continues with cached permissions.
- Every flush starts with a refresh if the access token is expired; refresh success → sync; refresh failure `invalid_grant` (expired) → outbox kept, user asked to log in (section 7); `session_revoked` → wipe.
- Permission changes made while the volunteer was offline take effect at sync: records are re-checked server-side and denied with reasons; the client refreshes its cached permissions from the token's `permission_version` (AUTH.md §9).

## 11. iOS (UX-06)

| Topic | Fact | Design response |
|---|---|---|
| Installed PWA vs Safari tab | An installed PWA (Share → Add to Home Screen) gets its own storage and runs standalone; a Safari tab shares Safari's storage and loses state more easily | Treat installation as the supported mode for volunteers on iPhones; the Safari tab works for lookups but shows an "install for offline work" notice before offline capture |
| Storage eviction | Safari may evict IndexedDB and cache storage of sites not used for a while, and clears them when the user clears Safari data | Request `navigator.storage.persist()` at first login; sync on app open, on `visibilitychange`, on `online`; reminder when pending > 0 for 24 hours and daily after (O-29); show a warning that unsynced work can be lost if the app is removed or data cleared; photo budget 100 MB on iOS (O-29) so queues drain faster |
| No background sync | iOS does not run the Background Sync API | Foreground sync only (section 3 triggers); no promise of "it will sync by itself later" in the UI; the home screen shows the pending count prominently. As built on Android Chrome: the page asks for a one-shot sync while records wait and the worker only posts `flush` to an open window, since the key lives in the page |
| Push notifications | Only installed PWAs can receive Web Push on iOS; Web Push decided by O-35 (optional, off by default, after the Phase 3 pilot) | In-app inbox remains the primary channel (UX-12); push, if adopted, is an enhancement for installed apps |
| Camera and files | Camera capture works through the file input with `capture`; EXIF may be stripped | Capture time is taken from the device clock at capture; GPS from the Geolocation API with the user's permission; missing metadata flags the photo (BR-109) |
| Install guidance | Users do not find "Add to Home Screen" | Bangla step-by-step install guide with screenshots inside the app and in the volunteer manual (T2.10); champions trained on it (D2). As built (T2.7): the home's install hint with the share-sheet steps, and the owner's device checklist `docs/testing/uat/OFFLINE_DEVICE_CHECKLIST_BN.md` |
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
 │ photo queue: upload session ───────►│ 256 KB parts to the API        │
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
| As run (T2.7, 2026-10-31) | Unit: `packages/shared/src/sync/*.test.ts`, `apps/web/src/offline/*.test.ts` (crypto, db, keys, outbox, photo queue, snapshot, engine, reminders), `apps/web/src/lib/api.test.ts`; API: `apps/api/test/integration/{sync-batch,sync-rules,sync-snapshot,sessions-users,auth}.test.ts`; component: `apps/web/src/features/{applications/offline,sync/sync,sync/install,home/MyWorkPage}.test.tsx`, `components/shell/shell.test.tsx`; E2E: `apps/web/e2e/offline.spec.ts` (five journeys on the mobile project: capture with a photo over a slow link and a cut part, a known number with another name to the office's link, both-sides edit, the logout warning, the revocation wipe), `shell.spec.ts` (the offline open on the mobile and iphone projects), the volunteer sweeps of `a11y.spec.ts` with `/sync`; device matrix: the owner's checklist | Vitest, Playwright, the owner |
| Required by O-29 | Offline capture and sync; intermittent connectivity (drops mid-batch and mid-chunk, Retry-After honoured, jitter bounds); authentication expiry with pending records (preserved, re-auth, re-key, sync; fallback warnings where persistence is unsupported); storage exhaustion (80% warning, 100% block, no automatic deletion of unsynced files, safe cleanup of synced files); 7-day purge only after confirmed persistence; recovery paths of section 7 (logout, revocation, app removal, key loss, deactivation) | Playwright, Vitest, device matrix; results recorded before the Phase 2 gate |

## 14. Code and data

Code: the outbox and photo-queue stores, the sync client, the batch and snapshot endpoints, conflict resolution, encryption, the service worker configuration. As built: `packages/shared/src/sync/` (the decided values, the record and result schemas, the retry ladder, the outbox state machine, the name match), `apps/api/src/sync/` (`rules.ts`, `sync.service.ts`, `snapshot.service.ts`, the routes in `routes/sync.ts`), `apps/web/src/offline/` (`crypto.ts`, `db.ts`, `keys.ts`, `outbox.ts`, `photo-queue.ts`, `snapshot.ts`, `sync-engine.ts`, `applications-store.ts`, `reminders.ts`, `OfflineProvider.tsx`), `apps/web/src/features/sync/` (the chip, the centre, the reminder, the logout warning, the install hint), `apps/web/src/sw.ts` and `apps/web/src/lib/{api,app-update,or-cached}.ts`. Data: what each project caches (template snapshot), form versions, reference lists, budgets and thresholds in settings (photo budget, nudge interval, batch size, retry schedule).

## 15. Values decided by O-29 (2026-10-10)

1. Retry: 30 s, 2 min, 10 min, 1 h, then hourly up to 7 days; `Retry-After` respected; bounded jitter; permanent validation errors never auto-retried; synced records purged after 7 days only with confirmed persistence and no pending dependants.
2. Batches of up to 50 records with a separate payload-size limit (1 MB PROPOSAL, to confirm in T2.7); 256 KB chunks; attachments never inside record batches.
3. First reminder after 24 hours pending, then daily until sync succeeds; pending count, last sync time and actionable reasons always visible.
4. Photo budget 100 MB on iOS, 200 MB on Android; compression per NFR-25; unsynced files never deleted automatically; notification at budget with safe cleanup of synced files only.
5. Encrypted pending outbox preserved across credential expiry with platform-appropriate secure, device-bound keys; re-authentication before syncing protected records; recovery behaviour per the table in section 7; no silent discard; advance synchronization warnings as the documented fallback where secure persistence is impossible.

All of these are validated by the tests listed in section 13 (offline, intermittent connectivity, authentication expiry, storage exhaustion).
