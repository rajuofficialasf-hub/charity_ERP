-- Reverses 20261124100000_export_with_codes (every migration ships its hand-written reverse,
-- docs/architecture/ADR/ADR-003-prisma-with-down-sql.md). The choice of the codes goes; the files
-- already written keep what they hold.
ALTER TABLE "export_jobs" DROP COLUMN IF EXISTS "with_codes";
