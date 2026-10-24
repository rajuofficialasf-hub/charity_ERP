-- Reverses 20261025090000_application_decisions (every migration ships its hand-written reverse,
-- docs/architecture/ADR/ADR-003-prisma-with-down-sql.md): the two columns and the index go; the
-- volunteer messages written into them are lost with the columns.
DROP INDEX IF EXISTS "applications_project_id_status_created_at_idx";
ALTER TABLE "applications" DROP CONSTRAINT IF EXISTS "applications_identity_kind_check";
ALTER TABLE "applications" DROP COLUMN IF EXISTS "identity_kind";
ALTER TABLE "applications" DROP COLUMN IF EXISTS "rejection_message";
