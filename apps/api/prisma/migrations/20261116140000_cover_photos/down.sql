-- Reverses 20261116140000_cover_photos (every migration ships its hand-written reverse,
-- docs/architecture/ADR/ADR-003-prisma-with-down-sql.md). The older schema has no place for a
-- cover, so the links of the cover photos to their programs and project series are removed (a
-- link is a pointer; who set which cover stays in the audit log). The photos themselves stay rows
-- of the files table, as evidence photos without a link under the older kind list, which nobody
-- but their uploader reads; rows of the files table are never removed.
DELETE FROM "file_links" WHERE entity_type IN ('program', 'project_series');
UPDATE "files" SET kind = 'evidence' WHERE kind = 'cover_photo';
ALTER TABLE "file_links" DROP CONSTRAINT "file_links_entity_type_check";
ALTER TABLE "file_links"
  ADD CONSTRAINT "file_links_entity_type_check"
  CHECK (entity_type IN ('application', 'activity', 'voucher', 'expense_claim', 'payment', 'document', 'animal', 'issue', 'media_subject', 'media_story', 'volunteer', 'beneficiary', 'followup_evaluation', 'user', 'public_submission'));
ALTER TABLE "files" DROP CONSTRAINT "files_kind_check";
ALTER TABLE "files"
  ADD CONSTRAINT "files_kind_check"
  CHECK ("kind" IN ('distribution_proof', 'construction_proof', 'evidence', 'voucher', 'payment_copy', 'document', 'animal_photo', 'profile_photo', 'nid_photo', 'media_asset', 'export', 'issue_photo', 'form_photo'));
