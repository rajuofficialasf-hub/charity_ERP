-- The name typed on an application that waits for verification (a public entry, or an offline
-- entry whose number belongs to a profile with other names): until the office links the entry to
-- a profile it has no beneficiary, and every list and record show this name in its place
-- (docs/DECISION_LOG.md D-141). Null on the rows that never waited.
ALTER TABLE "applications" ADD COLUMN "applicant_name" TEXT;
