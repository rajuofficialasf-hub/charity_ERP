# FILES, PHOTOS AND DOCUMENTS

Status: outline, written in task T0.1 (2026-10-10); completed in task T0.13. Depends on open question 17 (media consent) and D-053 (MinIO).

## 1. Scope
Photos (distribution, construction, placard, animal), vouchers, SOP documents, media stories' assets, NID photos of volunteers.

## 2. Storage layout
Object storage buckets and key structure; SOP cloud-folder convention program → project → year → district (BR-168); local-filesystem adapter for tests.

## 3. Upload pipeline
Client compression, chunked resumable upload, type and size validation, virus-scan hook, metadata extraction (capture time, GPS, source camera/gallery), duplicate detection (BR-109).

## 4. Access control
Signed expiring URLs after permission and scope check (BR-204); field-level rules for NID photos and donor files; export packaging.

## 5. Photo rules
Per-project photo rule and source setting (BR-066); flagged photos; verification view for officials (UX-07).

## 6. Locks
Vouchers and photos locked after verification (BR-122, BR-123); how a lock is represented and audited.

## 7. Document register
`documents`, checklists, status chain, hard-copy codes, retention (BR-162…170); deficiency reports; quarterly audit report.

## 8. Media consent and publishable list
Consent record on the profile, channel list, gating of the publishable list (BR-022), media story tracker.

## 9. Retention and growth
Permanent retention; storage-growth reporting (NFR-30); backup of object storage.

## 10. Testing
Upload validation, signed-URL expiry, duplicate detection, lock enforcement, consent gating.
