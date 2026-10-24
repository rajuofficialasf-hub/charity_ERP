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
-- A draft for a person the lookup did not find holds the number in its identity answer until the
-- submission creates the profile; a public entry has no profile until it is verified, and a
-- rejected public entry or a deleted draft keeps none. Every other state has its person.
ALTER TABLE "applications" DROP CONSTRAINT "applications_beneficiary_check";
ALTER TABLE "applications" ADD CONSTRAINT "applications_beneficiary_check"
  CHECK ("beneficiary_id" IS NOT NULL OR "status" IN ('draft', 'needs_verification', 'rejected', 'deleted'));
-- The official's edit of an application under review is logged question by question as its own
-- kind of field change.
ALTER TABLE "field_changes" DROP CONSTRAINT "field_changes_kind_check";
ALTER TABLE "field_changes" ADD CONSTRAINT "field_changes_kind_check"
  CHECK ("kind" IN ('unlock', 'contact_update', 'correction', 'sync_conflict', 'review_edit'));
