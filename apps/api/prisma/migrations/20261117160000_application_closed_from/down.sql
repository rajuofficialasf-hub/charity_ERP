-- Reverses 20261117160000_application_closed_from. The applications a project's close closed go
-- back to the states and outcomes they were closed from first, since the kept prior state goes with
-- the columns (a closed application without a person would also break the earlier check).
UPDATE "applications"
   SET "status" = "closed_from_status", "outcome" = "closed_from_outcome"
 WHERE "status" = 'closed' AND "closed_from_status" IS NOT NULL;
ALTER TABLE "applications" DROP CONSTRAINT "applications_beneficiary_check";
ALTER TABLE "applications" ADD CONSTRAINT "applications_beneficiary_check"
  CHECK ("beneficiary_id" IS NOT NULL OR "status" IN ('draft', 'needs_verification', 'rejected', 'deleted'));
ALTER TABLE "applications" DROP CONSTRAINT IF EXISTS "applications_closed_from_check";
ALTER TABLE "applications" DROP COLUMN IF EXISTS "closed_from_outcome";
ALTER TABLE "applications" DROP COLUMN IF EXISTS "closed_from_status";
