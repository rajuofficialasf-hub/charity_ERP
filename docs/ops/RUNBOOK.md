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

Rotating `LOCAL_KEY_SECRET` (the seal of the device keys, AUTH.md §5): set `LOCAL_KEY_PREVIOUS_SECRET` to the current value and `LOCAL_KEY_SECRET` to the new one, restart the api and the worker; every session is re-sealed under the new secret at its next refresh (within 30 days, the refresh window), and a key the previous secret sealed still opens meanwhile. After 30 days clear `LOCAL_KEY_PREVIOUS_SECRET` and restart again; a session that never refreshed in that time has ended and its key is dropped by the nightly cleanup anyway.

Moving the files to the NAS (D-168), once IT has mounted the NAS on the server: set `STORAGE_ROOT` to the mount for the api and the worker, keep `STORAGE_DRIVER=s3` and the MinIO settings, and run `pnpm --filter @css/api storage:copy --from s3 --to nas --dry-run` to see how many files wait, then the same without `--dry-run` (a `--limit 100` first is a fair trial). Each file and its thumbnails are copied, checked by size, and only then is the row marked `nas`; the source is never changed, so a stopped run is run again and copies only what is left. A row reported missing has no object on MinIO; a row reported failed did not arrive whole: look at both before switching. When a run reports nothing left, set `STORAGE_DRIVER=nas` and restart the api and the worker; MinIO stays until a backup of the NAS has been checked. Each batch writes one `storage.copied` audit entry.

## 5. Distribution-day readiness
Pre-season checklist: load test done, helpline active, capacity verified, on-call.

## 6. Change management
How hotfixes are deployed and recorded; link to DEPLOYMENT.md.
