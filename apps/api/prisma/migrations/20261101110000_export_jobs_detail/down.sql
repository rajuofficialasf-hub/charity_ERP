-- Reverses 20261101110000_export_jobs_detail (every migration ships its hand-written reverse,
-- docs/architecture/ADR/ADR-003-prisma-with-down-sql.md). The chosen columns, the frozen access
-- and the progress of the jobs go with their columns; the jobs, their files and their audit
-- entries stay.
DROP INDEX IF EXISTS "export_jobs_status_created_at_idx";
ALTER TABLE "export_jobs" DROP CONSTRAINT IF EXISTS "export_jobs_failed_reason_check";
ALTER TABLE "export_jobs" DROP CONSTRAINT IF EXISTS "export_jobs_done_file_check";
ALTER TABLE "export_jobs" DROP CONSTRAINT IF EXISTS "export_jobs_progress_check";
ALTER TABLE "export_jobs" DROP CONSTRAINT IF EXISTS "export_jobs_format_check";
ALTER TABLE "export_jobs" DROP CONSTRAINT IF EXISTS "export_jobs_kind_check";
ALTER TABLE "export_jobs"
  DROP COLUMN IF EXISTS "finished_at",
  DROP COLUMN IF EXISTS "error_code",
  DROP COLUMN IF EXISTS "rows_total",
  DROP COLUMN IF EXISTS "rows_done",
  DROP COLUMN IF EXISTS "access",
  DROP COLUMN IF EXISTS "columns",
  DROP COLUMN IF EXISTS "format";
