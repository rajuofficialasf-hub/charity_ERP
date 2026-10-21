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

## 5. Distribution-day readiness
Pre-season checklist: load test done, helpline active, capacity verified, on-call.

## 6. Change management
How hotfixes are deployed and recorded; link to DEPLOYMENT.md.
