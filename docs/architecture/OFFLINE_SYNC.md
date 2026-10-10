# OFFLINE PWA AND SYNC

Status: outline, written in task T0.1 (2026-10-10); completed in task T0.12. Depends on open questions 7 (offline budget) and 13 (late drafts) and on D-052.

## 1. Goals and constraints
Field volunteers on 2G/3G and low-end phones; nothing lost; blueprint B7, BD-48, UX-06.

## 2. Client architecture
PWA shell, service worker (precache, runtime cache), IndexedDB outbox, separate photo queue, encrypted local store, install flow on Android and iOS.

## 3. Offline data set
What is cached per device (forms of assigned projects, own beneficiaries and applications, syllabus, locations), refresh policy, size budget (NFR-22).

## 4. Record model
`client_uuid`, created time, `sync_status` pending → syncing → synced / failed, failure reason, retry with backoff (BR-194, BR-195).

## 5. Sync protocol
Batch endpoint, ordering (text before photos), idempotency on the server, partial success handling, resumable photo upload.

## 6. Conflict rules
Server wins on approved data; last write on drafts and field updates; both logged; "needs verification" on NID collision (BR-199, BR-104); deadline and limit checks for late-synced drafts (open question 13).

## 7. Guards that depend on sync
No completion while photos pending (BR-196); what the UI shows while a record is pending.

## 8. Security
Encryption at rest on the device, wipe on logout or revocation, token expiry while offline (see AUTH.md).

## 9. Platform notes
iOS Safari: storage eviction, no background sync, push only when installed; Android Chrome primary (UX-06).

## 10. Testing
Playwright offline emulation, sync conflict tests, idempotency tests, photo-queue tests, low-memory device profile.
