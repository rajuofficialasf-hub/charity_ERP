-- Reverses 20261123180000_user_extra_area_source (every migration ships its hand-written reverse,
-- docs/architecture/ADR/ADR-003-prisma-with-down-sql.md). The link to a source goes; the areas the
-- migration ended because their source had ended stay ended, as the owner decided they should,
-- and the audit log keeps each of those ends.
ALTER TABLE "user_extra_areas" DROP CONSTRAINT IF EXISTS "user_extra_areas_source_area_id_fkey";
DROP INDEX IF EXISTS "user_extra_areas_source_area_id_idx";
ALTER TABLE "user_extra_areas" DROP COLUMN IF EXISTS "source_area_id";
