-- A program and a project series may carry a cover photo (docs/architecture/FILES_AND_DOCUMENTS.md,
-- "Cover photos"): a file of a kind of its own, linked to its record through file_links and never
-- a column. A photo is uploaded under the slot cover_upload; the cover of a record is its one link
-- with the slot cover.
ALTER TABLE "files" DROP CONSTRAINT "files_kind_check";
ALTER TABLE "files"
  ADD CONSTRAINT "files_kind_check"
  CHECK ("kind" IN ('distribution_proof', 'construction_proof', 'evidence', 'voucher', 'payment_copy', 'document', 'animal_photo', 'profile_photo', 'nid_photo', 'media_asset', 'export', 'issue_photo', 'form_photo', 'cover_photo'));
ALTER TABLE "file_links" DROP CONSTRAINT "file_links_entity_type_check";
ALTER TABLE "file_links"
  ADD CONSTRAINT "file_links_entity_type_check"
  CHECK (entity_type IN ('application', 'activity', 'voucher', 'expense_claim', 'payment', 'document', 'animal', 'issue', 'media_subject', 'media_story', 'volunteer', 'beneficiary', 'followup_evaluation', 'user', 'public_submission', 'program', 'project_series'));
