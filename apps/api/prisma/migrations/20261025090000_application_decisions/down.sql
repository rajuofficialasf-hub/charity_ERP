-- Reverses 20261025090000_application_decisions (every migration ships its hand-written reverse,
-- docs/architecture/ADR/ADR-003-prisma-with-down-sql.md): the two columns and the index go; the
-- volunteer messages written into them are lost with the columns.
-- The review-edit rows must be removed before the narrower kind check returns.
ALTER TABLE "field_changes" DROP CONSTRAINT IF EXISTS "field_changes_kind_check";
ALTER TABLE "field_changes" ADD CONSTRAINT "field_changes_kind_check"
  CHECK ("kind" IN ('unlock', 'contact_update', 'correction', 'sync_conflict'));
-- The narrower check returns; a draft, a rejected public entry or a deleted draft without a
-- profile would refuse it, so such rows must be removed or given a profile first.
ALTER TABLE "applications" DROP CONSTRAINT IF EXISTS "applications_beneficiary_check";
ALTER TABLE "applications" ADD CONSTRAINT "applications_beneficiary_check"
  CHECK ("status" = 'needs_verification' OR "beneficiary_id" IS NOT NULL);
DROP INDEX IF EXISTS "applications_project_id_status_created_at_idx";
ALTER TABLE "applications" DROP CONSTRAINT IF EXISTS "applications_identity_kind_check";
ALTER TABLE "applications" DROP COLUMN IF EXISTS "identity_kind";
ALTER TABLE "applications" DROP COLUMN IF EXISTS "rejection_message";
