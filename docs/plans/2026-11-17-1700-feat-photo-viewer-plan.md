---
title: The photo viewer
type: feat
status: in-progress
source: plan
date: 2026-11-17
doc_review: 2026-11-17
---

# The photo viewer

## Goal
Wherever the app shows a photo large, an official or a volunteer sees it in a proper viewer: the photo big with zoom and full screen, the record's other photos one press away, the photo's details with its place on a map, a download that keeps the capture time and the place, and a link that opens the same photo inside the app for someone allowed to see it.

## Problem
The owner found the enlarged photo poor everywhere ("খুব বাজে দেখা যায়"), with no download, and wants each photo's details, the location among them, for later use (D-181, 2026-11-17, with the owner's demo of a viewer).

## Requirements
- **R1** A photo opened large shows in a viewer: the photo as large as the screen allows, zoom in and out (buttons, wheel, pinch, double press), full screen, the previous and next photo of the same record, a strip of the record's photos, and the details beside the photo on a computer and in a sheet under it on a 360 px phone; it works by keyboard (arrows, Escape, + and -) and in both languages.
- **R2** "ডাউনলোড" saves the photo for whoever may see it; a protected photo (an NID photo) only for an official who holds that class, as seeing it already requires; every download is written to the audit log with the file and the record.
- **R3** "লিংক কপি" copies an address of the app that opens the viewer on that photo; it opens only for a signed-in person who may see the photo, and nothing leaves the app (no share, no outside link, no signed address; files stay streamed by the API, D-074).
- **R4** The viewer has no delete button.
- **R5** The details show what the server keeps of the photo: capture time, GPS with its accuracy and a link to the place on a map, file size, resolution, who uploaded it and when; a detail the server does not have says so.
- **R6** A downloaded photo carries its capture time and GPS written into the file, while the stored photo stays without its metadata.

## Scope
- In: every place in the web app where a photo opens large today; the API's download and the details of a file; the audit of a download; the in-app link.
- Out (not now): editing, rotating or deleting a photo; sharing outside the app; videos and PDFs; a map drawn inside the app (the map link opens the map site in a new tab); the small avatars of lists and the decorative card covers.

## Key decisions
- **Download for whoever sees the photo** (the owner: "যিনি দেখতে পান তিনিই"): seeing and saving are one right, audited. Governs R2.
- **Only an in-app link** (the owner: "শুধু অ্যাপের ভেতরের লিংক"): files stay private. Governs R3.
- **No delete** (the owner: "মোছার বোতাম থাকবে না"): a photo is replaced where the app already replaces one. Governs R4.
- **The download keeps the place** (the owner: "ডাউনলোডেও লোকেশন থাকুক"): the stored photo stays stripped. Governs R6.

## Technical decisions
- **Stack profile:** unchanged (CLAUDE.md "Stack profile"); no new dependency. The EXIF of a download is written by a small writer of our own in the API, not by sharp: sharp writes EXIF only while it encodes again, which changes every pixel of a JPEG; exifr (already installed) reads the written file back in the tests.
- **The photo's resolution is stored** (NS-05): `files.width` and `files.height`, written by the processing job, which already reads the header (`files/images-process.ts`); a file processed before has none and the details say "জানা নেই". There is no production data yet, so no backfill.
- **Seeing and saving are one right** (D-181): the download runs the same check as the content (`viewer()` in `apps/api/src/services/files.ts`, which already holds the NID photo to an official with that class, and refuses a quarantined file with 423 or 410), and answers 404 on a refusal like the content.
- **What the download carries:** the stored bytes with any metadata they still hold removed first (`files/images.ts`), then the capture time; the GPS and its accuracy only for a caller who may see the position (the class `file.location` or the uploader, as `GET /files/{fileId}` decides today), so a download never shows more than the details do.
- **Streamed** (NS-04, NS-11): `Content-Disposition: attachment` with an ASCII name from the capture time and the file id, `Cache-Control: private, no-store`, `X-Content-Type-Options: nosniff` and the type from the stored bytes, as the content route sends for an NID photo. The rewrite is a streaming filter per container over the whole file, since a stored photo from a chunked upload is kept as it came and may still hold metadata anywhere: a JPEG segment by segment (APPn and COM dropped, the scan data passed, anything after EOI dropped), a PNG chunk by chunk (the text, `eXIf` and `tIME` chunks dropped), and a WebP read twice from storage (first its chunk list, for the new RIFF length; then streamed with its EXIF and XMP chunks dropped and the new ones added). Nothing is held whole in memory.
- **Bounds on an untrusted file:** a declared segment or chunk length past the end of the file, a RIFF length that disagrees with the stored size, or more than 1 MB of metadata before the image data refuses the download (422 `file.unreadable`) before a byte is sent; the filter holds at most one JPEG segment header or one chunk header at a time.
- **Every download audited** (D-181, SECURITY_POLICY): `file.downloaded` with the file, its kind, the record and whether the position was written. The record is derived on the server from the file's links the caller reaches (the `records` of the details read), never taken from the request. The order is the one `streamExport` keeps: open the stored body (`storage.get`, a missing object answers 404), then the audit transaction, then the headers and the pipe, so no audit row names a download that could not start.
- **A rate limit of its own:** the class `file-download`, 120 downloads an hour per person (`apps/api/src/rate-limit/rate-limit.ts`, beside `export`), so a loop cannot pull every photo a person may see at full speed; the audit shows who tried.
- **The details read** (`GET /files/{fileId}`) gains the resolution, the uploader's name and the records the caller reaches through the file's links; the uploader's name only for an official or the uploader themself (a volunteer is never told another volunteer's name through a photo).
- **The in-app link** is `/photos/:fileId`, a signed-in page of the app shell; it carries no token, and the API decides as for any read. The page shows the photo and the other photos of its first reachable record (the existing `GET /files?entityType&entityId`), which lists only the photos the caller may open: an NID photo only for a caller with the identity class, as the content route decides. A signed-out visitor goes to the sign-in, which returns to the page only for a relative in-app path (a path starting with one `/`, never `//`, a scheme or another host); anything else lands on the home.
- **The uploader's name** is the user's `display_name` (`users`), the name every list of the app shows; a missing user reads as "জানা নেই".
- **The plan's ids stay in the plan** (ORG-CMT-10, ORG-CMT-50): code, comments and test names carry the meaning in words, never an R, U, D or rule id.
- **The map link** opens Google Maps in a new tab (`https://www.google.com/maps/search/?api=1&query=<lat>,<lng>`, `rel="noopener noreferrer"`); nothing is sent until the person presses it.
- **The viewer is a piece of the asf kit** (RE-UI-01 to RE-UI-05): `PhotoViewer` in `src/ui/templates/asf/components/`, typed in `contract.ts`, exported from `@/ui`, listed in `local.json` with its test and picture, following `FlipCard`; MUI stays in the template. The zoom is a CSS transform with pointer events (wheel, two-finger pinch, double press, drag to move); the full screen is the browser's Fullscreen API, with the dialog's own full size where it is refused.

## Progress
- **Branch:** `feat/photo-viewer`
- **Updated:** 2026-11-17
- **Next:** U6, the app's photo viewer in `apps/web/src/features/photos/`
- **Reviewed through:** C4 at 825d7717
- **Uncommitted:** none
- **Notes:** the owner said "শুরু করো" and not to wait for a command between units or checkpoints. The branch starts from the tip of `fix/known-issues` (PR #64 still in CI); once #64 is squash-merged into `develop`, `origin/develop` is merged into this branch (never a rebase). U3: `images.ts` only exports its strip's rules for the writer, which strips a WebP itself; exifr reads no WebP, so the spec reads a WebP's EXIF chunk as the raw TIFF block the WebP container holds (libvips reads it too); the Dhaka wall clock is `dhakaClock` in `core/dhaka-day.ts`. C3: the writer refuses before any byte only what it finds in the head; a JPEG or PNG cut inside its image data, or a WebP changed between its two reads, fails after the headers are out, so the download route pipes with `pipeline` and destroys the response on an error (the client sees a failed download, never a short photo) and logs the abort. The owner added every hardening of the plan's security review ("সব যোগ করো").

## Implementation units

### U1. The resolution of a photo
- **Goal:** each processed photo keeps its width and height.
- **Requirements:** R5
- **Files:** `apps/api/prisma/schema.prisma`, `apps/api/prisma/migrations/<stamp>_file_dimensions/{migration.sql,down.sql}`, `apps/api/src/jobs/file-process.ts`, `apps/api/src/files/images-process.ts`, `apps/api/test/integration/file-process.test.ts`, `docs/database/DATABASE_SCHEMA.md`
- **Approach:** two nullable integer columns with a CHECK that both are set together and positive; the job writes them with the thumbnails (follow the `phash` write in `file-process.ts`); the migration on the pattern of `20261117180000_upload_finalize_lease`.
- **Tests:**
  - integration: a processed JPEG and a PNG get their width and height; a PDF keeps none; a second run changes nothing; the migration round trip (existing `migrations.test.ts`).
  - existing: covered by `apps/api/test/integration/file-process.test.ts` (the processing) and `migrations.test.ts`.
- **Done when:** the tests pass and DATABASE_SCHEMA lists the columns.
- **Depends on:** none
- **Size:** S
- **Risk area:** migration
- **Status:** done

### U2. The details of a photo
- **Goal:** `GET /files/{fileId}` answers everything the details panel shows.
- **Requirements:** R5, R3
- **Files:** `apps/api/src/routes/files.ts`, `apps/api/src/services/files.ts` (`info`), `docs/api/openapi.yaml`, `apps/web/src/api/schemas/` (the file info schema), `apps/api/test/integration/files.test.ts`
- **Approach:** extend `info()` and `fileInfoSchema` with the new fields `width`, `height`, `uploadedBy: { name } | null` (an official caller or the uploader) and `records: [{ entityType, entityId }]` of the links the caller reaches (`files/records.ts`, `scopeReachesRecord`); `gps` with its `accuracyM` already exists under `file.location` and stays as it is with its test. Check that `GET /files?entityType&entityId` leaves out an NID photo for a caller without the identity class, and make it so if it does not.
- **Tests:**
  - integration: an official reads width, height, the position with its accuracy, the uploader's name and the record; a volunteer who uploaded it reads their own name and the position; another volunteer on the project reads neither the position nor the uploader's name; a caller outside the record gets 404; the NID photo's details for an official still write `file.nid_viewed`; an official without the identity class lists a volunteer's photos and the NID photos are not among them (and no `file.nid_viewed` row is written for them).
  - existing: covered by `apps/api/test/integration/files.test.ts` (the metadata read).
- **Done when:** the cases pass and the OpenAPI drift test is green.
- **Depends on:** U1
- **Size:** M
- **Risk area:** personal data
- **Status:** done

### U3. The EXIF writer
- **Goal:** the capture time and the position written into a JPEG, a PNG and a WebP without touching their pixels.
- **Requirements:** R6
- **Files:** `apps/api/src/files/exif-write.ts` (new), `apps/api/src/files/exif-write.spec.ts` (new), `apps/api/src/files/images.ts` (the strip reused, WebP added)
- **Approach:** streaming filters (Node `Transform`), never a whole-file buffer; build one little-endian TIFF block (IFD0 with the pointers, the EXIF IFD with `DateTimeOriginal` and `OffsetTimeOriginal` +06:00, the GPS IFD with `GPSLatitudeRef`, `GPSLatitude`, `GPSLongitudeRef`, `GPSLongitude` as rationals and `GPSHPositioningError` for the accuracy); place it as an APP1 segment after the JPEG's SOI, an `eXIf` chunk before a PNG's first `IDAT`, and an `EXIF` chunk with the VP8X flag in a WebP (a VP8X header added to a simple WebP from its frame size); every container's existing metadata removed first. No existing example: a new pattern.
- **Tests:**
  - unit: each of the three containers read back with exifr gives the same time and position (north and south, east and west, six decimals); a photo without a position gets the time only; the pixels decode the same before and after (sharp `raw()` equality); a file that already held EXIF, or a PNG text chunk after its image data, keeps only the written metadata; refused: a JPEG segment length past the end, a PNG chunk length past the end, a RIFF length that disagrees with the size, more than 1 MB of metadata before the image data, a truncated file; the filter fed one byte at a time gives the same bytes.
- **Done when:** the spec passes.
- **Depends on:** none
- **Size:** L
- **Risk area:** file storage
- **Status:** done

### U4. The download
- **Goal:** `GET /files/{fileId}/download` saves the photo with its metadata, audited.
- **Requirements:** R2, R6
- **Files:** `apps/api/src/routes/files.ts`, `apps/api/src/services/files.ts` (`streamDownload`), `apps/api/src/rate-limit/rate-limit.ts`, the error catalogue (bn, en, `file.unreadable`), `docs/api/openapi.yaml`, `docs/architecture/FILES_AND_DOCUMENTS.md`, `docs/security/SECURITY_POLICY.md`, `docs/BUSINESS_RULES.md` (the download rule with its test), `apps/api/test/integration/files.test.ts`, `docs/security/AUTHORIZATION_MATRIX.md` (rewritten by `authz:matrix`)
- **Approach:** a route beside `files.file.content` (`permission: 'entity'`, `scope: 'file'`, the rate-limit class `file-download`); the service reuses `viewer()` and `refuseQuarantined`, opens the stored body, writes `file.downloaded` with the record derived from the file's links, then sets the headers and streams through the filter of U3; images only (any other kind answers 404 here and keeps its content route).
- **Tests:**
  - integration: an official downloads an application photo: 200, `attachment`, the EXIF holds the time and the position, one `file.downloaded` row; the uploading volunteer gets the position too; another volunteer of the project gets the time only; the NID photo for an official with the class 200 and for one without it 404; a volunteer outside the record 404; a quarantined photo 423; no session 401; the headers carry `private, no-store` and `nosniff`; a stored object that is gone answers 404 and writes no audit row; a damaged stored photo answers 422 `file.unreadable` with no audit row; the 121st download in an hour answers 429.
- **Done when:** the cases pass, the matrix report is current and BUSINESS_RULES has the rule with its test.
- **Depends on:** U3
- **Size:** M
- **Risk area:** file storage
- **Status:** done

### U5. The viewer piece of the kit
- **Goal:** `PhotoViewer` in the asf kit.
- **Requirements:** R1, R4
- **Files:** `apps/web/src/ui/templates/asf/components/photo-viewer.tsx` (new), `apps/web/src/ui/contract.ts`, `apps/web/src/ui/index.ts`, the kit's labels and `ui.json` (bn, en), `apps/web/src/ui/templates/asf/local.json`, `apps/web/src/ui/templates/asf/ui.local.photo-viewer.test.tsx` (new), `apps/web/src/dev/AsfGallery.tsx`, `docs/ui/asf-pieces/photo-viewer.png`, `docs/ui/DESIGN_SYSTEM.md`
- **Approach:** follow `FlipCard` (`components/flip-card.tsx`, its test and gallery entry); a full-size dialog with the photo, the toolbar (previous, next, zoom in, zoom out, full screen, details, the actions the page passes in, close), the strip, and a details slot drawn beside the photo from 1024 px and as a bottom sheet below it; the photos and their sources come from props, so the kit knows nothing of the API.
- **Tests:**
  - unit (component): the arrows move between photos and stop at the ends; + and - change the zoom and 0 resets it; Escape closes; the details slot shows beside the photo on a wide screen and opens as a sheet on a narrow one; no delete control exists; the toolbar buttons have names in bn and en; `axe-core` (already installed) run on the rendered viewer finds no violation.
- **Done when:** the test passes and the gallery shows the piece.
- **Depends on:** none
- **Size:** L
- **Risk area:** none
- **Status:** done

### U6. The app's photo viewer
- **Goal:** one viewer the pages open with a group of photos and a starting one, with the details, the download and the link.
- **Requirements:** R1, R2, R3, R5
- **Files:** `apps/web/src/features/photos/` (new: `PhotoViewerDialog.tsx`, `PhotoDetails.tsx`, `photos-api.ts`, `download.ts`, tests), the i18n catalogue (bn, en), `apps/web/src/components/FileImage.tsx` (the original's address beside the thumbnails)
- **Approach:** the photo shown is the original through `useFileDataUrl`, the strip the small thumbnails; the details from `GET /files/{fileId}` formatted with `@css/shared/format`; "ডাউনলোড" fetches `/files/{id}/download` through the API client and saves the blob under the server's file name; "লিংক কপি" copies `<origin>/photos/<id>` with `CopyButton` and says "লিংক কপি হয়েছে"; a detail the server lacks shows "জানা নেই"; the position shows with "মানচিত্রে দেখুন".
- **Tests:**
  - unit (component, MSW): the details of an official's read with every row; a volunteer's read without the position or the uploader; the download calls the route and saves the server's name; a failed download says why; the copied text is the in-app address; a 423 photo shows the scan message.
- **Done when:** the tests pass.
- **Depends on:** U2, U4, U5
- **Size:** L
- **Risk area:** none
- **Status:** todo

### U7. Every enlarged photo opens the viewer
- **Goal:** the pages that show a photo large use the viewer with their group of photos.
- **Requirements:** R1
- **Files:** `apps/web/src/admin/volunteers/VolunteerProfilePage.tsx` (`DocumentStrip`), `apps/web/src/admin/registrations/RegistrationDetail.tsx` (`Photos`), `apps/web/src/features/applications/AnswerList.tsx`, `apps/web/src/features/account/ProfileDetails.tsx`, `apps/web/src/admin/registrations/EditRequests.tsx`, `apps/web/src/admin/registrations/StaffEditRequests.tsx`, `apps/web/src/components/PersonPhoto.tsx` (`PersonBanner`), their tests
- **Approach:** each place turns its photos into a group (the document slots it may see; the files of one photo answer; the old and the new photo of a request; the profile photo) and a press opens the viewer at that photo; the small dialog of `DocumentStrip` goes.
- **Tests:**
  - unit (component): each place opens the viewer on the pressed photo with its group; the volunteer profile's NID photos are in the group only when the view holds them.
  - existing: covered by the component tests of each page (`VolunteerProfilePage`, `RegistrationDetail`, `AnswerList`, the edit requests); updated, not duplicated.
- **Done when:** the tests pass.
- **Depends on:** U6
- **Size:** M
- **Risk area:** none
- **Status:** todo

### U8. The in-app link page
- **Goal:** `/photos/:fileId` opens the viewer for a signed-in person who may see the photo.
- **Requirements:** R3, R1
- **Files:** `apps/web/src/routes/index.tsx`, `apps/web/src/lib/auth.tsx` (the sign-in's return to an in-app path), `apps/web/src/features/auth/` (the sign-in page reads it), `apps/web/src/features/photos/PhotoPage.tsx` (new), the i18n catalogue, `apps/web/e2e/photo-viewer.spec.ts` (new), `docs/ui/SCREENS.md`
- **Approach:** a lazy route inside the shell (the pattern of `/notifications`); the page reads the details, opens the viewer on the photo with its record's photos, "রেকর্ডে যান" where the record has a page (a volunteer, a beneficiary, an application, a registration), and "ছবিটি পাওয়া যায়নি, অথবা এটি দেখার অনুমতি আপনার নেই।" on a 404; closing goes back, or home.
- **Tests:**
  - unit (component): the page opens on the photo; a 404 shows the message; signed out, the sign-in comes first and returns to the page; a return target of `//evil.example`, `https://evil.example` or `javascript:alert(1)` is ignored and the home opens.
  - e2e (desktop and mobile): the RPM opens an application with a photo at `/admin/applications/:applicationId` and presses the photo: the dialog "ছবি" shows it, "পরের ছবি" moves on, "বিস্তারিত" shows "তোলার সময়" and "অবস্থান" with "মানচিত্রে দেখুন", "ডাউনলোড" saves a file whose name ends `.jpg`, "লিংক কপি" says "লিংক কপি হয়েছে"; opening the copied address shows the same photo; a volunteer of another project opening it sees "ছবিটি পাওয়া যায়নি, অথবা এটি দেখার অনুমতি আপনার নেই।"; an official without the identity class opening a volunteer's profile photo link finds no NID photo in the strip; at 360 px the details open as a sheet and the page has no sideways scroll; axe has no violation.
- **Done when:** the spec passes three times in a row (`--repeat-each 3 --workers 1`).
- **Depends on:** U6, U2
- **Size:** M
- **Risk area:** auth
- **Status:** todo

## Checkpoints
- **Mode:** grouped (scores: one by one 5, grouped 10, all at once 1; N is over 4, so one by one's 5 goes to grouped, which makes 15)
- **Signals:** N 8, L 1,850, R 5, Fd 2, C 4, P 1
- **C1** after U1: migration
- **C2** after U2: personal data, and the details later units read
- **C3** after U3: file storage, a new pattern
- **C4** after U4: file storage, the download the viewer calls
- **C5** after U6: the viewer the pages build on (U5 reviewed with it)
- **C6** after U8: auth, end (U7 reviewed with it)

## Verification
- `pnpm lint`, `pnpm typecheck`, `pnpm docs:check`, `pnpm rules:status --phase 2 --report-only`
- `pnpm --filter @css/api contract:coverage`
- `pnpm --filter @css/api authz:matrix` after U4
- `pnpm test` (web with `--maxWorkers 2` where the load times files out)
- `pnpm e2e`, and `photo-viewer.spec.ts` with `--repeat-each 3 --workers 1`
- `pnpm --filter @css/web build` then `pnpm --filter @css/web bundle:report` (the viewer is in a lazy chunk; the first route stays under 400 KB)

## Risks and rollback
- U1's migration: its `down.sql` drops the two columns; nothing a person wrote is lost.
- U4 adds a way out for files: it runs the content route's own check, the authorization matrix test proves no role gains a file it could not read, and every download is in the audit log.
- U3 writes into files: the stored object is never changed; only the bytes sent are rewritten, and the spec proves the pixels stay the same.

## Definition of done
- All units done and their tests pass
- Verification commands pass
- `ae-review` has run, with no open P0 or P1
- Code from abandoned attempts is removed
