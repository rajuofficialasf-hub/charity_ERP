-- Reverses 20261021170000_public_form_photos (every migration ships its hand-written reverse,
-- docs/architecture/ADR/ADR-003-prisma-with-down-sql.md). The links of photos no submission has
-- claimed yet are removed (they are pending uploads, not business data), and the claimed form
-- photos continue as evidence photos of their application under the older kind list; rows of the
-- files table are never removed.
DROP FUNCTION IF EXISTS purge_unclaimed_public_photos(timestamptz, integer);
DELETE FROM "file_links" WHERE entity_type = 'public_submission';
UPDATE "files" SET kind = 'evidence' WHERE kind = 'form_photo';
ALTER TABLE "file_links" DROP CONSTRAINT "file_links_entity_type_check";
ALTER TABLE "file_links"
  ADD CONSTRAINT "file_links_entity_type_check"
  CHECK (entity_type IN ('application', 'activity', 'voucher', 'expense_claim', 'payment', 'document', 'animal', 'issue', 'media_subject', 'media_story', 'volunteer', 'beneficiary', 'followup_evaluation', 'user'));
ALTER TABLE "files" DROP CONSTRAINT "files_kind_check";
ALTER TABLE "files"
  ADD CONSTRAINT "files_kind_check"
  CHECK ("kind" IN ('distribution_proof', 'construction_proof', 'evidence', 'voucher', 'payment_copy', 'document', 'animal_photo', 'profile_photo', 'nid_photo', 'media_asset', 'export', 'issue_photo'));
