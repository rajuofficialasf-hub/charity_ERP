-- Reverses 20261110120000_file_storage_driver (every migration ships its hand-written reverse,
-- docs/architecture/ADR/ADR-003-prisma-with-down-sql.md). The files keep their place; only the
-- record of which driver holds each one goes, so copy the NAS files back to MinIO first when any
-- row says nas.
DROP INDEX IF EXISTS "files_storage_driver_id_idx";
ALTER TABLE "files" DROP CONSTRAINT IF EXISTS "files_storage_driver_check";
ALTER TABLE "files" DROP COLUMN IF EXISTS "storage_driver";
