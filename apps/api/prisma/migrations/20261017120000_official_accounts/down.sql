-- Reverses 20261017120000_official_accounts (docs/architecture/ADR/ADR-003-prisma-with-down-sql.md;
-- DECISION_LOG D-097). The link history goes with its table, and the job IDs, affiliations and
-- supervisors with their columns; the audit log still records every account creation, link and
-- profile change. Officials invited but not yet signed up keep a pending account without a password.

DROP TABLE IF EXISTS "account_invitations";

ALTER TABLE "users" DROP CONSTRAINT "users_supervisor_user_id_fkey";
DROP INDEX IF EXISTS "users_supervisor_user_id_idx";
ALTER TABLE "users" DROP CONSTRAINT "users_supervisor_check";
ALTER TABLE "users" DROP COLUMN "supervisor_user_id";

DROP TRIGGER IF EXISTS users_default_affiliation ON "users";
DROP FUNCTION IF EXISTS default_staff_affiliation();
DROP INDEX IF EXISTS "users_affiliation_idx";
ALTER TABLE "users" DROP CONSTRAINT "users_affiliation_unit_check";
ALTER TABLE "users" DROP CONSTRAINT "users_affiliation_check";
ALTER TABLE "users" DROP COLUMN "affiliation_unit";
ALTER TABLE "users" DROP COLUMN "affiliation";

DROP INDEX IF EXISTS "users_job_id_key";
ALTER TABLE "users" DROP CONSTRAINT "users_job_id_check";
ALTER TABLE "users" DROP COLUMN "job_id";
