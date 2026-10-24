-- An application's rejection carries two texts: the office's reason stays in decision_comment,
-- and rejection_message is the words written for the volunteer. identity_kind keeps the kind of
-- number the lookup asked (a 17-digit number is an NID or a birth registration as the applicant
-- said). The index serves the drafts of a project's list.
ALTER TABLE "applications" ADD COLUMN "rejection_message" TEXT;
ALTER TABLE "applications" ADD COLUMN "identity_kind" TEXT;
ALTER TABLE "applications" ADD CONSTRAINT "applications_identity_kind_check"
  CHECK ("identity_kind" IS NULL OR "identity_kind" IN ('nid', 'birth_reg'));
CREATE INDEX "applications_project_id_status_created_at_idx"
  ON "applications"("project_id", "status", "created_at" DESC);
