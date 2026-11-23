# RUNBOOK

Status: outline, written in task T0.1 (2026-10-10); completed in tasks T3.0 and T6.5.

## 1. Daily and weekly operations
Backup verification, queue and sync-failure review, storage growth, certificate renewal.

## 2. Restore procedure and drill
Step-by-step restore of database and object storage; monthly drill log with date, duration and result (NFR-35).

After a restore into a server whose collation or ICU version differs from the source (another operating system, a PostgreSQL upgrade), rebuild the indexes on expressions over text, because their stored order may no longer match: `REINDEX INDEX CONCURRENTLY beneficiaries_dup_name_father_mobile_idx;` and `REINDEX INDEX CONCURRENTLY beneficiaries_dup_name_dob_union_idx;` (the duplicate suggestions, built on `person_name_key`). Then run the nightly duplicate job once by hand (queue `duplicates`) so the pairs table matches the restored data. PostgreSQL warns about a collation version mismatch in the server log; `ALTER DATABASE css_erp REFRESH COLLATION VERSION;` clears the warning only after the rebuild.

## 3. Incident response
Severity levels, who to contact, first actions, communication to field users during distribution season.

## 4. Common tasks
Revoke a device session, unlock an account, re-send donor emails, re-run a failed sync batch, regenerate an export, rotate a secret.

Exempting the office from the per-address rate limits (D-198): an Admin opens the settings' "নিরাপত্তা" tab from the office network, checks that "এই কম্পিউটারের ঠিকানা" shows the office's public address (if it shows the proxy's address or a private one, `TRUST_PROXY` does not name Caddy and every user looks like one client; fix that first), and adds it, or the office's range up to a /24. The list reaches the API at once; another API instance reads it within a minute. Remove an address when the office moves.

Rotating `LOCAL_KEY_SECRET` (the seal of the device keys, AUTH.md §5): set `LOCAL_KEY_PREVIOUS_SECRET` to the current value and `LOCAL_KEY_SECRET` to the new one, restart the api and the worker; every session is re-sealed under the new secret at its next refresh (within 30 days, the refresh window), and a key the previous secret sealed still opens meanwhile. After 30 days clear `LOCAL_KEY_PREVIOUS_SECRET` and restart again; a session that never refreshed in that time has ended and its key is dropped by the nightly cleanup anyway.

Moving the files to the NAS (D-168), once IT has mounted the NAS on the server: set `STORAGE_ROOT` to the mount for the api and the worker, keep `STORAGE_DRIVER=s3` and the `S3_*` settings, and run `pnpm --filter @css/api storage:copy --from s3 --to nas --dry-run` to see how many files wait, then the same without `--dry-run` (a `--limit 100` first is a fair trial; runs may go on while the app works). Each file and its thumbnails are copied and checked (the size, and the file's SHA-256 read back from the NAS), and only then is the row marked `nas`; the source is never changed, so a stopped run is run again and copies only what is left. An upload still being processed (`unprocessed`) waits for a later run, because its thumbnails come after it. A row reported `missing` has no object in the S3 store; a row reported `failed` did not arrive whole: look at both before switching. The switch itself: (1) stop the api, so no new file is written; (2) let the worker finish the `photos` queue (no file with `virus_scan = 'pending'` left), then stop it; (3) run the copy until it reports `remaining: 0` and exits 0; (4) set `STORAGE_DRIVER=nas` and start the api and the worker. The S3 store stays until a backup of the NAS has been checked. Each batch writes one `storage.copied` audit entry. After the switch, a later migration may drop the column's default `s3` (it stays while an older API may write during a deploy).

## 5. Distribution-day readiness
Pre-season checklist: load test done, helpline active, capacity verified, on-call.

## 6. Change management
How hotfixes are deployed and recorded; link to DEPLOYMENT.md.
