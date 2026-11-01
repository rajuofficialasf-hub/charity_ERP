-- What an export job needs beyond its first outline (docs/api/API_STANDARDS.md, "Export job
-- pattern"; docs/DECISION_LOG.md D-143): the list or record it exports (the existing kind, now
-- checked), the format, the columns the person chose, the access the request froze, the progress
-- and the reason of a failure. No job row exists yet, so the new not-null columns take their
-- defaults; the format's default only serves that step and is dropped again.
ALTER TABLE "export_jobs"
  ADD COLUMN "format" TEXT NOT NULL DEFAULT 'csv',
  ADD COLUMN "columns" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN "access" JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN "rows_done" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "rows_total" INTEGER,
  ADD COLUMN "error_code" TEXT,
  ADD COLUMN "finished_at" TIMESTAMPTZ(6);
ALTER TABLE "export_jobs" ALTER COLUMN "format" DROP DEFAULT;

ALTER TABLE "export_jobs" ADD CONSTRAINT "export_jobs_kind_check"
  CHECK ("kind" IN ('volunteers', 'beneficiaries', 'applications', 'beneficiary_profile', 'application'));
ALTER TABLE "export_jobs" ADD CONSTRAINT "export_jobs_format_check"
  CHECK ("format" IN ('csv', 'xlsx', 'pdf'));
ALTER TABLE "export_jobs" ADD CONSTRAINT "export_jobs_progress_check"
  CHECK ("rows_done" >= 0 AND ("rows_total" IS NULL OR "rows_total" >= 0));
-- a finished job always has its file, and a failed one always says why
ALTER TABLE "export_jobs" ADD CONSTRAINT "export_jobs_done_file_check"
  CHECK ("status" <> 'done' OR "file_id" IS NOT NULL);
ALTER TABLE "export_jobs" ADD CONSTRAINT "export_jobs_failed_reason_check"
  CHECK ("status" <> 'failed' OR "error_code" IS NOT NULL);

-- the daily sweep finds jobs stuck in waiting or running, and finished files past their keep time
CREATE INDEX "export_jobs_status_created_at_idx" ON "export_jobs"("status", "created_at");
