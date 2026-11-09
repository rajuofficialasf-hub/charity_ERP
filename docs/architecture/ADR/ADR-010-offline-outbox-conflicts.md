# ADR-010: Offline outbox with client_uuid idempotency and server-decided conflicts

Status: approved with `docs/architecture/OFFLINE_SYNC.md` (task T0.12, 2026-10-10); derives from BD-48, O-07, O-13 and blueprint B7. Implemented in T2.7 (2026-10-31, D-139): the "session-derived key" of the decision became a data key wrapped under a server-issued device key and a device-bound browser key, because the refresh token is an HttpOnly cookie the app cannot read (OFFLINE_SYNC.md §7); only volunteers work offline in this task; Background Sync only wakes an open window.

## Context

Volunteers capture applications and field updates without network and sync later; iOS offers no background sync; networks drop mid-upload; the same record may be sent twice; a form may be republished or a volunteer's permission changed while they are offline; the server must remain the authority for approved data and must enforce the same rules for offline and online work.

## Decision

- Every offline write is an outbox record with a device-generated `client_uuid`; the server treats `client_uuid` as the idempotency key and a replayed batch returns stored results (at-least-once delivery, exactly-once effect).
- Text records sync before photos; photos travel in a separate compressed queue with chunked resumable upload; photo-gated steps cannot complete while photos are pending.
- Conflicts are decided on the server by record kind: server wins on approved or locked data; last write wins on drafts, field updates and contact data; activities are append-only; an identity collision routes the record to `needs_verification`; late drafts follow O-13. Both versions of every conflict are written to the audit log.
- Offline records are processed by the same application services, guards, effects and audit as online requests, with the originating user as actor, so there is one rule set.
- Local business data is encrypted at rest with a session-derived key and wiped on logout or revocation; a mere token expiry keeps the outbox.

## Alternatives considered

- CRDT or operational-transform merging: unnecessary for this domain (records are mostly created by one person and reviewed by another) and would hide conflicts that the department wants to see and audit.
- Client-decided conflicts: contradicts "server value wins on approved data" and would let a stale client overwrite verified work.
- Background Sync API as the primary mechanism: unavailable on iOS; kept as an enhancement on Android only.
- Keeping photos inline in the text records: would make text sync fail on slow networks; separate queues let the text (and the office's visibility) arrive first.

## Consequences

Positive: no duplicates, no silent loss, identical rules online and offline, auditable conflicts, a small and testable state machine on the device.

Negative: two queues and a dependency order to maintain; encryption key management on the device; iOS eviction can still lose unsynced work if the user ignores nudges, so training and the install guide matter; late drafts and limit races produce "failed" records that volunteers must understand (Bangla reasons, needs-attention card).

Follow-ups: T2.7 implements the stores, sync client, endpoints and Playwright offline tests; T2.10 writes the install guide; T3.4 load-tests the sync burst; the values of OFFLINE_SYNC.md §15 were confirmed by the owner (O-29, answering question 26).

## Related

BD-48, O-07, O-13; BR-104, BR-194…202; NFR-18…28; `docs/architecture/OFFLINE_SYNC.md`, `docs/architecture/WORKFLOW_ENGINE.md` §8, `docs/architecture/AUTH.md` §7–§9, ADR-005, ADR-006.
