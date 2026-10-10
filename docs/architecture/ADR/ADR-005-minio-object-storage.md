# ADR-005: MinIO object storage with presigned URLs, filesystem adapter for tests

Status: approved 2026-10-10 (DECISION_LOG D-053, confirmed by the owner in O-01). Written in task T0.8.

## Context

Photos (distribution, construction, placard, animal), vouchers, SOP documents, NID photos and exports must be stored permanently (BD-46), served only through signed, expiring URLs after an authorization check (constitution §9, BR-204), uploaded resumably from weak networks (NFR-24), mirrored for backup (O-06) and reported for growth (NFR-30). Nothing may depend on a cloud service at runtime (BD-45).

## Decision

- MinIO (self-hosted, S3-compatible) as the object store in development, staging and production, behind a `StorageAdapter` interface in the `files` module.
- `FilesystemStorage` implements the same interface for automated tests (fast, no container needed in unit and most API tests); the integration test suite that covers upload and signed URLs runs against the real MinIO container in CI.
- Buckets per environment: `photos`, `vouchers`, `documents` (SOP register, keyed program/project/year/district per BR-168), `exports` (the only bucket with a deletion policy), `profiles` (volunteer photos and NID photos, most restricted). Object keys carry the entity id, never personal data.
- Downloads: the API checks permission, scope and field-level rules, then returns a presigned URL valid for at most 15 minutes (NFR-28); Caddy proxies the MinIO endpoint so that only presigned requests reach it; no bucket is public.
- Uploads: the client requests an upload session, uploads in chunks (multipart) directly to a presigned upload URL, then calls the API to finalize; finalize validates type and size, runs the virus-scan hook, extracts metadata (capture time, GPS, source) and computes the duplicate hash (BR-109, NFR-27).
- Backups: `mc mirror` of all buckets except `exports` to the backup target on the schedule of O-06; versioning enabled on `photos` and `documents` so that an accidental overwrite is recoverable.

## Alternatives considered

- Plain filesystem storage behind the API: simplest, but signed URLs, chunked uploads, mirroring and per-bucket policies would be hand-built, and large downloads would stream through the API process.
- Cloud object storage: feature-complete but violates the no-cloud-dependency decision.

## Consequences

Positive: standard S3 tooling for uploads, signed URLs, mirroring and lifecycle rules; file traffic bypasses the API process; the adapter interface keeps tests fast and the storage swappable.

Negative: one more service to run, monitor and back up; MinIO's licence and release cadence must be tracked by the IT team; developers need Docker for the full file path (unit tests do not).

Follow-ups: T0.13 details the file pipeline and the document register storage; T2.1 implements the `files` module and both adapters; T3.0 sets up the mirror and the restore drill for objects.

## Related

D-053; BD-21, BD-35, BD-46; BR-109, BR-168, BR-204, BR-205; NFR-24…28, NFR-30, NFR-34, NFR-35; `docs/architecture/FILES_AND_DOCUMENTS.md`.
