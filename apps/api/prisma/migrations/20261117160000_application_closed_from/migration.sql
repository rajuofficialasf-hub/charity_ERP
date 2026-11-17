-- The state and outcome an application had when its project's close closed it (docs/architecture/
-- WORKFLOW_ENGINE.md, "Common application cycle", the project's close and reopen;
-- docs/database/DATABASE_SCHEMA.md, "applications"). The close writes them with the closed state,
-- the reopen puts them back and empties them, so only an application the close closed holds them.
ALTER TABLE "applications" ADD COLUMN "closed_from_status" TEXT;
ALTER TABLE "applications" ADD COLUMN "closed_from_outcome" TEXT;
ALTER TABLE "applications" ADD CONSTRAINT "applications_closed_from_check"
  CHECK (
    (closed_from_status IS NULL OR status = 'closed')
    AND (closed_from_outcome IS NULL OR closed_from_status IS NOT NULL)
  );
-- A draft or an entry waiting for verification may have no person yet; the close keeps it so, so
-- a closed application without a person is one closed from those two states.
ALTER TABLE "applications" DROP CONSTRAINT "applications_beneficiary_check";
ALTER TABLE "applications" ADD CONSTRAINT "applications_beneficiary_check"
  CHECK (
    "beneficiary_id" IS NOT NULL
    OR "status" IN ('draft', 'needs_verification', 'rejected', 'deleted')
    OR ("status" = 'closed' AND "closed_from_status" IN ('draft', 'needs_verification'))
  );
