-- The priority score on the application (docs/plans/2026-10-25-1156-feat-application-rules-plan.md):
-- the total beside its breakdown in application_scores, so the office's list can page by score;
-- the time an application entered the waitlist, so the pull takes the next in order; and the
-- form-level points of the score, kept with the form version like its questions.
ALTER TABLE "applications" ADD COLUMN "total_score" DECIMAL(5,2);
ALTER TABLE "applications" ADD CONSTRAINT "applications_total_score_check"
  CHECK ("total_score" IS NULL OR ("total_score" >= 0 AND "total_score" <= 100));
ALTER TABLE "applications" ADD COLUMN "waitlisted_at" TIMESTAMPTZ(6);
CREATE INDEX "applications_project_id_total_score_id_idx"
  ON "applications" ("project_id", "total_score" DESC, "id" DESC);
CREATE INDEX "applications_project_id_waitlisted_at_idx"
  ON "applications" ("project_id", "waitlisted_at") WHERE "status" = 'waitlisted';
ALTER TABLE "form_versions" ADD COLUMN "scoring" JSONB;
