-- Reverses 20261025130000_application_scores (every migration ships its hand-written reverse,
-- docs/architecture/ADR/ADR-003-prisma-with-down-sql.md): the columns and their indexes go. The
-- breakdown stays in application_scores; the form-level points of every version are lost.
ALTER TABLE "form_versions" DROP COLUMN IF EXISTS "scoring";
DROP INDEX IF EXISTS "applications_project_id_waitlisted_at_idx";
DROP INDEX IF EXISTS "applications_project_id_total_score_id_idx";
ALTER TABLE "applications" DROP COLUMN IF EXISTS "waitlisted_at";
ALTER TABLE "applications" DROP CONSTRAINT IF EXISTS "applications_total_score_check";
ALTER TABLE "applications" DROP COLUMN IF EXISTS "total_score";
