---
title: The file service (T2.1)
type: feat
status: in-progress
source: plan
date: 2026-10-20
doc_review: 2026-10-20
---

# The file service (T2.1)

## Goal
Any screen of Phase 2 onward can upload a photo, voucher or document in resumable chunks from a weak phone connection, and every file is checked, processed and then served only through the API to people whose permission reaches the record it belongs to. The IT team can see how storage grows, and officials can list and export the files of a record (both named in the T2.1 prompt).

## Problem
Today the only upload is a registration or profile photo of up to 2 MB in one request, its metadata is stripped and never read, and the file route serves those two kinds only. Applications, distribution photos and vouchers (T2.3 onward) need the full pipeline of `docs/architecture/FILES_AND_DOCUMENTS.md`: chunks that survive a dropped 2G connection, capture time and GPS, thumbnails, duplicate checks and quarantine until a scan.

## Requirements
- **R1** An upload is a session of 256 KB chunks sent through the API; a broken connection resumes from the chunks the server already holds, and finalizing twice with the same client id gives the same file (O-29, `FILES_AND_DOCUMENTS.md` 4).
- **R2** The server checks, at session create and again at finalize, that the caller holds `file.upload` and that its scope reaches the record the file links to (404 when the record is out of reach, 403 when it is in reach but the caller may not upload); the kind is allowed for that record type; the declared size fits the kind (images 5 MB, voucher PDF 10 MB, document 20 MB); every part is at most 256 KB with a part number inside the declared size; the bytes received never pass the declared size (413); the type comes from the magic bytes (JPEG, PNG, HEIC/HEIF and WebP for images, PDF for vouchers and documents; never SVG or HTML); and the SHA-256 matches.
- **R3** No signed URLs anywhere: files and thumbnails are streamed by the API after the permission and scope check of the linked record, with `Cache-Control: no-store`, `X-Content-Type-Options: nosniff`, the stored type from the bytes and `inline` only for images and PDF (`attachment` otherwise); the original name is never part of a key or path and is encoded in the header; a refusal answers 404 (D-074).
- **R4** Every file stays quarantined until the virus-scan hook clears it: no preview, download or thumbnail while pending, infected or failed (423 `file.quarantined`, 410 `file.infected`, API_STANDARDS); the development and test adapter marks files `skipped`; production refuses to start without a real scanner (O-30), which makes the scanner a prerequisite of the first deployment (T3.0), recorded as D-109.
- **R5** For photos the server reads capture time and GPS, sets the flags `no_capture_time`, `no_gps`, `stale_capture` (over 10 minutes from the record) and `gallery_under_camera_only` (against the project's photo source setting), and makes thumbnails of 320 and 1,024 px; images over 40 megapixels are not decoded and end `failed`, never clean.
- **R6** An identical file (same SHA-256) within a project is refused, and a near duplicate by perceptual hash (Hamming distance 6 or less) is accepted with `duplicate_suspect` on both files; the refusal and the flag name the other file only to a caller whose scope reaches it, otherwise they say "a file like this is already in the project".
- **R7** The web app has one reusable upload: read capture time and GPS before compressing, compress photos to 1,600 px, send the chunks with progress, resume and retry, and show the states of the `FileUpload` component.
- **R8** Storage keys follow `FILES_AND_DOCUMENTS.md` 8 (documents Program → Project → Year → District; photos and vouchers under project and application), built from ids and codes only.
- **R9** A nightly job records bytes and objects per bucket and project, and the system health page shows them with the monthly growth.
- **R10** The files of one record can be listed and exported as CSV (at most 5,000 rows, no free text) by a caller who may see that record; every export is audited, and a list or export with NID photos as `file.nid_viewed`.
- **R11** The GPS position is personal data of the place a beneficiary lives or a distribution happened: it is the field class `file.location`, seen by the officials doing the project's work whose scope reaches the record and by the person who uploaded the file, and it never reaches a log; the capture time stays an ordinary field (it locates nothing and drives the flags).
- **R12** Open sessions are bounded: at most 20 per user, each expiring after 1 hour without a part, and a nightly sweep aborts expired sessions and removes their stored parts.

## Scope
- In: the upload sessions and their sweep, the processing job, the file and thumbnail routes for every kind, the file list and its CSV, the storage statistics, the web upload hook with the `FileUpload` component, the end of the registration photos' scan exception (D-087).
- Out (not now): the document register, deadlines and deficiency reports (`FILES_AND_DOCUMENTS.md` 9–12, T5.4, O-34); media consent and the publishable list (13); video uploads (the media module); the screens that upload (forms, applications, distribution, T2.3 onward, where the upload's end-to-end journey is tested); switching the registration photo upload to chunks (it keeps its single request and its 2 MB limit of D-087, with the scan now applied); a production virus scanner (chosen with the server before T3.0, like the SMS provider).

## Key decisions
- **Uploads go through the API in chunks** (D-108, to record): a session, `PUT` of each part as raw bytes, a status read for resume, then finalize; the storage driver gets a multipart interface. Implements D-074 for uploads; ADR-005 is amended (its presigned URLs replaced by streaming through the API), and the OpenAPI parts with presigned URLs and `POST /files/{id}/url` are removed.
- **Virus-scan hook** (D-109, to record as proposed until the owner confirms the production scanner): one `ScannerAdapter`; dev and test mark `skipped`, which the policy treats as viewable outside production only; production refuses a missing scanner at start, like the dummy OTP; ClamAV on the own server recommended.
- **Perceptual hash** (D-110, to record): a 64-bit difference hash computed with sharp (9 × 8 grayscale), compared by Hamming distance ≤ 6 against the photos of the same project by a scan of that project's rows in SQL (`bit_count(phash # $1)`), acceptable at the expected thousands of photos per project; revisit past 100,000.

## Technical decisions
- **New dependencies**: `sharp` (API: thumbnails, pixels for the hash, `limitInputPixels` at 40 MP; prebuilt binaries for win32-x64 on the developers' machines and linux-x64 glibc on the bookworm image and CI; named in the T2.1 prompt) and `exifr` (API and web: capture time and GPS). Before installing each, confirm the npm package, its maintainers and its install scripts (ST-32, ST-34). No `file-type`: `apps/api/src/files/policy.ts` extends the magic-byte detection of `apps/api/src/files/images.ts` (JPEG, PNG) to HEIC/HEIF, WebP and PDF, which is all the allowlist needs (a deviation from NS-03's library, recorded in the plan). No multer, no tus: chunks arrive as `express.raw` bodies as the photo route already does (`apps/api/src/files/photo-body.ts`).
- **Storage** (NS-31, NS-32, NS-40, NS-41, NS-42): each 256 KB part is a small object in the bucket `uploads` keyed `<session uuid>/<integer part number>` (only the server's id and an integer reach a key); finalize streams the parts in order into one `put` of the target object, hashing on the way (`apps/api/src/files/parts.ts`). S3 multipart was dropped at U2: S3 and MinIO refuse parts under 5 MiB (D-108 amended). The driver interface and the AWS SDK in `drivers/s3.ts` stay as they are. Encryption at rest is a server setting of the deployment (T3.0: MinIO auto-encryption or an encrypted disk), as for `put` today; nothing sets it per request. Buckets stay private; nothing returns an object URL.
- **Routes** through `defineRoute` with the contract in `docs/api/openapi.yaml` first (the drift test): permission `file.upload` scope `self` on the session routes with the record check in the service at create and finalize (`access.findProject` / the record's own scope helper, as `services/project-volunteers.ts` checks its project); `entity` scope `file` for reads (the linked record decides); a named rate class `upload` for the part route (600 parts an hour per user); responses through the field mask, GPS and capture time under a field class.
- **Jobs**: pg-boss queue `file.process` beside `notify` (`apps/api/src/jobs/consumers.ts`), run by the worker, inline in development; idempotent by file id; a 2-minute timeout per file; retries as `notify`. The session sweep runs with the existing cleanup role `css_jobs_cleanup`, which already holds DELETE on `upload_sessions` (`apps/api/prisma/sql/roles.sql`).
- **Stack profile**: unchanged (CLAUDE.md); the storage adapter and pg-boss already exist.
- **No hard delete** (constitution §2): files are never deleted; only expired sessions and their parts are removed by the sweep.
- **IDs stay here**: plan and rule IDs (R, U, D, O, NS and similar) stay in this plan; code, comments and test names carry the meaning in words (ORG-CMT-10, ORG-CMT-50).

## Implementation units

### U1. Decisions and the contract
- **Goal:** record D-108 to D-110 and bring the API contract and the architecture text to the chunk upload through the API.
- **Requirements:** R1, R2, R3, R10, R11
- **Files:** `docs/DECISION_LOG.md`, `docs/api/openapi.yaml` (`POST /upload-sessions`, `GET /upload-sessions/{id}`, `PUT /upload-sessions/{id}/parts/{partNumber}`, `POST /upload-sessions/{id}/finalize`, `GET /files/{fileId}`, `GET /files/{fileId}/content` with `variant`, `GET /files?entityType&entityId[&format=csv]`; remove `files.file.signedUrl`, `FileUrlRequest` and the `parts[].url` of `UploadSession`), `docs/security/permissions.yaml` and `docs/security/RBAC.md` (the field class for capture time and GPS), `docs/architecture/FILES_AND_DOCUMENTS.md` sections 3, 4 and 15, `docs/architecture/ADR/ADR-005-minio-object-storage.md` and its row in `docs/architecture/ADR/README.md`, `docs/architecture/SYSTEM_ARCHITECTURE.md`, `docs/architecture/OFFLINE_SYNC.md`, `docs/PLAN.md` (a note on T2.1 that D-074 replaces the signed URLs).
- **Approach:** the D-105 change (`docs/api/openapi.yaml` `PageNumber`, its DECISION_LOG row) as the example of a contract change recorded first.
- **Tests:**
  - unit: `pnpm docs:check` (Redocly lint, the schema compile, permissions.yaml against RBAC.md) passes.
- **Done when:** the decisions are in the log, `pnpm docs:check` passes, and a search of `docs/` finds no promise of a signed URL for files outside the decision log's history.
- **Depends on:** none
- **Size:** M
- **Risk area:** none
- **Status:** done

### U2. Part storage and the session columns
- **Goal:** the 256 KB parts of an upload are stored and joined in order into the target object, and an upload session records what it holds.
- **Requirements:** R1, R12
- **Files:** `apps/api/src/files/parts.ts` and `parts.spec.ts` (new), `apps/api/src/storage/types.ts` (the bucket `uploads`), `infra/minio/bootstrap.sh` (the bucket and its two-day expiry), the migration `apps/api/prisma/migrations/20261020100000_upload_session_parts/` (`migration.sql`, `down.sql`), `apps/api/prisma/schema.prisma`, `apps/api/test/integration/storage.test.ts`, `apps/api/test/integration/constraints.test.ts`, `docs/database/DATABASE_SCHEMA.md`, `docs/database/ERD.md`, `docs/database/erd.mermaid`, `docs/architecture/FILES_AND_DOCUMENTS.md` (the bucket row).
- **Approach:** the existing `put`/`get`/`stat`/`delete` of both drivers, no new driver operation; a migration with a hand-written `down.sql` as `20261018100000_notifications_delivery`. The migration drops `multipart_upload_id` and `parts_acknowledged`, adds `parts_received int[] NOT NULL DEFAULT '{}'`, `bytes_received bigint NOT NULL DEFAULT 0`, `client_uuid uuid` (unique with `user_id`), `bucket text`, `object_key text` and `part_count` (NOT NULL, refused by the migration if any session row exists, since no code has written one), and recreates the status-log trigger so an update may change only the parts, the bytes, the expiry and the finalized file; `declared` keeps kind, mime, size, SHA-256, record, slot, capture data and source. `down.sql` empties the table (the sessions are temporary) and restores the first design's columns and trigger.
- **Tests:**
  - unit: three parts sent out of order and one twice join in order with the right size and SHA-256; a missing part answers `file.parts_missing` and leaves no object; a part key is built only from a session uuid and an integer 1–80; an empty part or one over 256 KB is refused; dropping the parts twice is fine.
  - integration: the parts join against MinIO and read back; the trigger lets the parts, bytes and expiry change and refuses another column and a delete; one session per user and client id; 81 parts and the bucket `uploads` as a target are refused; the migration applies and its down.sql reverses it.
- **Done when:** the parts join on both drivers and the migration round-trips.
- **Depends on:** none
- **Size:** M
- **Risk area:** file storage
- **Status:** done

### U3. Upload sessions and their sweep
- **Goal:** create a session, accept chunks, report what is held, finalize into a checked file linked to its record, and sweep the abandoned sessions.
- **Requirements:** R1, R2, R6, R8, R12
- **Files:** `apps/api/src/services/uploads.ts` (new), `apps/api/src/routes/uploads.ts` (new), `apps/api/src/files/policy.ts` (new: types by magic bytes, buckets, key builder), `apps/api/src/files/records.ts` (new: the record a file links to and the upload scope's reach), `apps/api/src/files/photo-body.ts` (a chunk body parser beside it), `apps/api/src/rate-limit/rate-limit.ts` (the `upload` class), `apps/api/src/jobs/upload-sweep.ts` (new, nightly, as `registration-cleanup.ts`, through the function of migration `20261020120000_upload_session_sweep`), `apps/api/src/jobs/consumers.ts`, `apps/api/prisma/sql/roles.sql`, `apps/api/src/openapi/define-route.ts` (a replay answers 200 and skips the audit check), `apps/api/src/container.ts`, `apps/api/src/app.ts`, `packages/shared/src/files/` (new: the request schemas and the size table shared with the web), `apps/api/test/integration/uploads.test.ts` (new).
- **Approach:** `services/registration-photos.ts` (storage first, then the row, link and audit in one transaction, the object removed on failure) and `routes/files.ts` for `defineRoute`; idempotency by `clientUuid` + slot as `src/idempotency/`; the record check as `services/project-volunteers.ts` reaches its project.
- **Tests:**
  - unit: the policy table (type by magic bytes for each allowed type; an SVG or HTML file named `.jpg` refused; size by kind; bucket and key per kind with ids and codes only, never the original name).
  - integration: a three-chunk photo finalizes into a file linked to its record with `file.uploaded` audited; a resend of a held part is accepted once; status lists the held parts after a dropped chunk and the upload resumes from there; finalize twice with the same client id answers the same file; a wrong SHA-256 (422), a wrong type (415), a declared size over the kind's (413), a part over 256 KB or past the declared size (413), a part number out of range (422) and a missing part at finalize (409) are refused; the 21st open session is refused (429); a holder of `file.upload` on a record outside its scope is refused at create (404), and at finalize after losing the record between create and finalize (404); a caller in reach without `file.upload` gets 403; another user's session id answers 404; an expired session answers 410; the same file again in the project is refused (409) and names the other file only to a caller who reaches it; the sweep aborts an expired session and removes its stored parts.
- **Done when:** the integration cases pass and the drift test finds the four upload operations.
- **Depends on:** U1, U2
- **Size:** L
- **Risk area:** file storage
- **Status:** done

### U4. The processing job
- **Goal:** each new file is scanned, its photo metadata read, thumbnails made and near duplicates flagged in the background.
- **Requirements:** R4, R5, R6
- **Files:** `apps/api/src/files/scanner.ts` (new: the adapter, the `skipped` dev adapter), `apps/api/src/config/env.ts` (the scanner setting and the production refusal), `apps/api/src/files/exif.ts` (new, exifr), `apps/api/src/files/thumbnails.ts` (new, sharp with `limitInputPixels`), `apps/api/src/files/phash.ts` (new), `apps/api/src/jobs/file-process.ts` (new), `apps/api/src/jobs/consumers.ts`, `apps/api/package.json`, `apps/api/test/integration/file-process.test.ts` (new), fixtures with EXIF and an oversized-pixel image in `apps/api/test/support/images.ts`.
- **Approach:** the `notify` consumer (`src/notifications/delivery.ts`, `src/jobs/consumers.ts`) for the queue, the retries and the inline run in development; `src/files/images.ts` stays for the registration photos. Confirm `sharp` and `exifr` on npm and their install scripts before adding them (ST-32, ST-34).
- **Tests:**
  - unit: EXIF capture time and GPS from a fixture, none from a stripped one; the flags from capture time, record time and photo source; the difference hash of two resized copies within 6, of two different photos above; production config without a scanner throws at start.
  - integration: the job turns a pending photo into `skipped` with both thumbnails and its capture time; a photo without EXIF gets `no_capture_time` and `no_gps`; a near duplicate in the same project flags both files, one in another project flags none; a failing scanner leaves `failed`, never clean; an image over 40 megapixels ends `failed` without being decoded; running the job twice changes nothing.
- **Done when:** the cases pass and the worker runs the queue.
- **Depends on:** U3
- **Size:** L
- **Risk area:** file storage
- **Status:** todo

### U5. Reading files and thumbnails
- **Goal:** every kind of file and its thumbnails stream through one checked route, and the registration photos lose their scan exception.
- **Requirements:** R3, R4, R6, R11
- **Files:** `docs/api/openapi.yaml` (the `variant` query parameter of `GET /files/{fileId}/content`, added with its code so the drift test stays green), `apps/api/src/services/files.ts`, `apps/api/src/routes/files.ts`, `apps/api/src/jobs/` (a one-time backfill of `file.process` for the registration and profile photos, run at start in development and by the deployment), `apps/api/test/integration/registration-photos.test.ts`, `apps/api/test/integration/files.test.ts` (new).
- **Approach:** extend `FilesService.streamContent` (`services/files.ts`, the owner, field-class and scope checks, `access.denied` with 404, `no-store`) from the two photo kinds to the linked record of any kind; the field mask (`src/access/field-mask.ts`) for capture time and GPS.
- **Tests:**
  - integration: an official who reaches the record streams a photo and its 320 px thumbnail with `nosniff` and the type from the bytes; a PDF is `inline`, any other type `attachment` with the encoded name; another region's official and a volunteer not on the record get 404 and a `permission_denied` log; a pending file answers 423 `file.quarantined` and an infected one 410 `file.infected` to a caller who may see it (404 to everyone else), and shows in `GET /files/{id}` with its state; a NID photo still needs the identity class and audits `file.nid_viewed`; `GET /files/{id}` returns the flags and `duplicateOf` only when the caller reaches the other file; capture time and GPS are absent for a caller without the field class and present for the uploader.
  - existing: the photo route's owner, NID and deny cases are covered by `apps/api/test/integration/registration-photos.test.ts`; update them for the scan state instead of adding new ones.
- **Done when:** the cases pass and no response carries an object URL.
- **Depends on:** U4
- **Size:** M
- **Risk area:** personal data
- **Status:** todo

### U6. File list and CSV per record
- **Goal:** the files of one record can be listed and exported by whoever may see the record.
- **Requirements:** R10, R11
- **Files:** `apps/api/src/services/files.ts`, `apps/api/src/routes/files.ts`, `apps/api/test/integration/files.test.ts`.
- **Approach:** the paging and cursor of `services/volunteer-list.ts` for the list; the CSV as a streamed text response of the same rows, without any free text (no original names), capped at 5,000 rows; the audit entry of a sensitive read (`file.nid_viewed`) for a list or export with NID photos, and `file.list_exported` for every export.
- **Tests:**
  - integration: the list of a record shows kind, size, capture time, flags and scan state, never a key or URL; the CSV has the same columns; a caller who cannot see the record gets 404; a list or export with NID photos is audited as `file.nid_viewed`; every export is audited as `file.list_exported`; capture time and GPS follow the field class in the list and the CSV; a volunteer sees only own files.
- **Done when:** the cases pass.
- **Depends on:** U5
- **Size:** M
- **Risk area:** personal data
- **Status:** todo

### U7. Storage statistics
- **Goal:** the system health page shows storage by bucket and project with its monthly growth.
- **Requirements:** R9
- **Files:** `apps/api/src/jobs/storage-stats.ts` (new, nightly), `apps/api/src/services/system-health.ts`, `apps/api/src/routes/admin-system.ts`, `apps/web/src/admin/system/HealthPage.tsx` and its test, i18n `admin.json` (bn, en), `docs/api/openapi.yaml` (the health response).
- **Approach:** `apps/api/src/jobs/registration-cleanup.ts` for a scheduled job; `SystemHealthService.storage()` already sums the files table.
- **Tests:**
  - integration: the job writes one `storage_stats` row per bucket and project; running it twice in a day keeps one.
  - unit (web): the health page lists the buckets with bytes and the growth of the last months in English digits.
  - e2e: extend `apps/web/e2e/admin-settings.spec.ts`: on `/admin/health` the section "স্টোরেজ" shows a row per bucket.
- **Done when:** the cases pass.
- **Depends on:** none
- **Size:** M
- **Risk area:** none
- **Status:** todo

### U8. The web upload
- **Goal:** one reusable upload that reads the photo's capture time and GPS, compresses, sends the chunks with progress, resumes and retries, and drives the `FileUpload` states.
- **Requirements:** R7
- **Files:** `apps/web/src/lib/uploads.ts` (new: the session client and the retry schedule of O-29), `apps/web/src/lib/use-file-upload.ts` (new hook), `apps/web/src/lib/photo-meta.ts` (new, exifr), `apps/web/src/features/registration/compress.ts` (moved to `src/lib/compress.ts` and reused), `apps/web/package.json`, `apps/web/src/lib/uploads.test.ts`, `apps/web/src/lib/use-file-upload.test.tsx`, the gallery page `apps/web/src/dev/Gallery.tsx`.
- **Approach:** `apps/web/src/lib/api.ts` (`rawBody`, the shared token refresh) for the requests; `packages/ui` `FileUpload` stays a controlled component and gets its items from the hook. Confirm `exifr` on npm before adding it to the web (ST-32, ST-34); it loads in the upload's chunk, never the first route.
- **Tests:**
  - unit: a three-chunk upload sends the parts in order with progress 0 → 100; a dropped chunk is retried, and after a reload the status read sends only the missing parts; capture time and GPS are read before compression; a rejected type never starts a session; a 409 duplicate shows the item as rejected with the server's message; a pending scan shows as quarantined.
- **Done when:** the cases pass, the gallery shows an upload with progress, and `bundle:report` keeps the first route under 250 KB.
- **Depends on:** U3, U5
- **Size:** L
- **Risk area:** file storage
- **Status:** todo

### U9. Documents and the final run
- **Goal:** the documents describe what was built and every run passes.
- **Requirements:** R1–R12
- **Files:** `docs/STATUS.md`, `CLAUDE.md` (the repository map: uploads, files policy, jobs, web uploads), `docs/BUSINESS_RULES.md` (the test status of the file rules), `docs/ui/SCREENS.md` (the health page), `docs/testing/TEST_STRATEGY.md`, `docs/ops/DEPLOYMENT.md` (the scanner as a prerequisite of the first deployment).
- **Approach:** as the documents unit of the earlier plans.
- **Tests:** the verification commands below.
- **Done when:** they pass and STATUS names T2.2 next.
- **Depends on:** U1–U8
- **Size:** S
- **Risk area:** none
- **Status:** todo

## Checkpoints
- **Mode:** grouped (one by one 10, grouped 7 + 10 = 17, all at once 0)
- **Signals:** N 9, L 2,000, R 6, Fd 3, C 5, P 1
- **C1** after U1: foundation (the contract U3 and U8 build on)
- **C2** after U2: file storage and a migration
- **C3** after U3: file storage, foundation for U4 and U8
- **C4** after U4: file storage
- **C5** after U5: personal data, foundation for U6 and U8
- **C6** after U6: personal data
- **C7** after U8: file storage and a new pattern (U7 reviewed with it)
- **C8** after U9: end

## Verification
`docker compose up -d postgres minio mailpit` (the root `compose.yaml`), then `pnpm typecheck`, `pnpm lint`, `pnpm docs:check`, `pnpm test`, `pnpm --filter @css/api exec vitest run --config vitest.db.config.mts test/integration/uploads.test.ts test/integration/file-process.test.ts test/integration/files.test.ts test/integration/storage.test.ts`, `pnpm --filter @css/api contract:coverage`, `pnpm --filter @css/api authz:matrix`, `pnpm e2e`, `pnpm --filter @css/web bundle:report`.

## Risks and rollback
- The migration changes only `upload_sessions`, which no code has written yet (it refuses to run if a row exists); its `down.sql` restores the count column and drops the new ones (DB-MIG-05, ADR-003).
- sharp is a native module: if its binary fails on a machine, the job fails the file as `failed` (never clean) and nothing else stops; the uploads keep working.
- The scan policy makes registration photos invisible until the backfill job has run once; it runs at start in development and as a deployment step. Production cannot start without a scanner (D-109), so the first deployment (T3.0) needs the scanner chosen and installed.

## Progress
- **Branch:** `feat/file-service`
- **Updated:** 2026-10-20 11:40
- **Next:** C3 (review of U3), then U4: the processing job `file.process` (sharp, exifr, the scanner adapter, the perceptual hash)
- **Reviewed through:** C2 at f4f1d1a
- **Uncommitted:** none
- **Notes:** U1 kept the `variant` parameter of the content route out of the contract until U5 builds it (the drift test compares built operations). API_STANDARDS already fixed `file.quarantined` 423 and `file.infected` 410, so a quarantined file answers those to a caller who may see it (R4, U5). The capture time stays an ordinary field; only the GPS position is the class `file.location` (R11). C1 (tier T0, docs only): no finding; for U6, the file list's `x-scope: file` needs the record's scope instead (a list has no file id), changed with its code. U2: S3 and MinIO refuse multipart parts under 5 MiB, so each 256 KB part is an object of its own in the bucket `uploads` and finalize joins them (D-108 amended); the dev MinIO needs `docker compose run --rm minio-init` once for the new bucket, and the dev database `pnpm db:migrate`. C2 (T2, three reviewers): `joinParts` now takes the declared size and SHA-256 and writes the whole beside the parts first, so bytes that fail the check never reach a target bucket (documents and photos keep every version); `partCount` refuses 0 and over 80 parts; `firstBytes` answers `file.parts_missing`; `dropParts` removes every possible part; a CHECK keeps `bytes_received` within the declared size; BR-204 and the last signed-URL wording now say streamed by the API; DEPLOYMENT and README name the bucket step (readiness fails while a bucket is missing). For U3 from C2: refuse a part number above the session's `part_count`; every part but the last exactly 256 KB and the last the remainder; check the magic bytes with `firstBytes` before the join; lock the session row (`finalized_file_id IS NULL`) before finalize and answer the stored file when it is already set, so a second or parallel finalize gives the same file; drop the parts only after the transaction commits. U3: the create and finalize routes take `x-scope: project` (the scope handle of `file.upload` on projects decides the record's reach in `files/records.ts`); the records a chunked upload takes are application, activity, issue, voucher, expense claim, payment, animal and document (`@css/shared/files`), profile and NID photos stay on the registration upload and beneficiary photos and media assets wait for their modules; ASSIGNED and the `own_part` grants reach nothing until their assignments exist; a project takes files while active or closing (409 `project.read_only`, added to the create's responses); the file id and the object key are fixed at create, so racing finalizes write the same object and the row lock decides; a replay (resent create, second finalize) answers 200 with `Idempotent-Replay` and `defineRoute` skips the audit check for it (API_STANDARDS 9); `file.duplicate` sends `params.fileId` only to a caller who reaches the other file; finalize sets `no_capture_time`, `no_gps` and `stale_capture` from the declaration, `gallery_under_camera_only` waits for U4 with the project's photo source; animal photo keys use the animal id (a cow and a goat may share a number) and document keys the file id instead of a slug (FILES_AND_DOCUMENTS 8 updated).
