-- Reverses 20261012000000_registration_drafts (docs/architecture/ADR/ADR-003-prisma-with-down-sql.md;
-- DECISION_LOG D-082). Drafts are technical data: the table and its purge function go with the
-- rows; their photo files stay in `files`. Rows the narrower CHECKs would
-- refuse are removed first: contact-change codes (short-lived OTPs; deleting them needs the
-- cleanup setting of the status-log trigger) and the links of staff photos (the files stay).

DROP FUNCTION IF EXISTS purge_expired_registration_drafts(integer);
DROP TABLE IF EXISTS "registration_drafts";

DO $$
BEGIN
  PERFORM set_config('css.cleanup', 'on', true);
  DELETE FROM "otp_codes" WHERE "purpose" = 'contact_change';
  PERFORM set_config('css.cleanup', '', true);
END $$;
ALTER TABLE "otp_codes" DROP CONSTRAINT "otp_codes_purpose_check";
ALTER TABLE "otp_codes" ADD CONSTRAINT "otp_codes_purpose_check" CHECK ("purpose" IN ('registration', 'password_reset'));

DELETE FROM "file_links" WHERE "entity_type" = 'user';
ALTER TABLE "file_links" DROP CONSTRAINT "file_links_entity_type_check";
ALTER TABLE "file_links" ADD CONSTRAINT "file_links_entity_type_check" CHECK (entity_type IN ('application', 'activity', 'voucher', 'expense_claim', 'payment', 'document', 'animal', 'issue', 'media_subject', 'media_story', 'volunteer', 'beneficiary', 'followup_evaluation'));
