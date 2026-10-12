-- Registration drafts and the contact-change OTP purpose (T1.9; DECISION_LOG D-082, D-085;
-- DATABASE_SCHEMA registration_drafts). Additive: one new table and two widened CHECKs.

-- CreateTable
CREATE TABLE "registration_drafts" (
    "id" UUID NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'volunteer',
    "mobile" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "token_hash" TEXT,
    "verified_at" TIMESTAMPTZ(6),
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "reference_lookups" SMALLINT NOT NULL DEFAULT 0,
    "photo_file_id" UUID,
    "nid_photo_file_id" UUID,
    "submitted_user_id" UUID,
    "submitted_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_by" UUID,

    CONSTRAINT "registration_drafts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "registration_drafts_mobile_idx" ON "registration_drafts"("mobile");

-- CreateIndex
CREATE INDEX "registration_drafts_email_idx" ON "registration_drafts"("email");

-- CreateIndex
CREATE INDEX "registration_drafts_expires_at_idx" ON "registration_drafts"("expires_at") WHERE (submitted_at IS NULL);

-- CreateIndex
CREATE INDEX "registration_drafts_photo_file_id_idx" ON "registration_drafts"("photo_file_id");

-- CreateIndex
CREATE INDEX "registration_drafts_nid_photo_file_id_idx" ON "registration_drafts"("nid_photo_file_id");

-- CreateIndex
CREATE INDEX "registration_drafts_submitted_user_id_idx" ON "registration_drafts"("submitted_user_id");

-- CreateIndex
CREATE INDEX "registration_drafts_created_by_idx" ON "registration_drafts"("created_by");

-- CreateIndex
CREATE INDEX "registration_drafts_updated_by_idx" ON "registration_drafts"("updated_by");

-- AddForeignKey
ALTER TABLE "registration_drafts" ADD CONSTRAINT "registration_drafts_photo_file_id_fkey" FOREIGN KEY ("photo_file_id") REFERENCES "files"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "registration_drafts" ADD CONSTRAINT "registration_drafts_nid_photo_file_id_fkey" FOREIGN KEY ("nid_photo_file_id") REFERENCES "files"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "registration_drafts" ADD CONSTRAINT "registration_drafts_submitted_user_id_fkey" FOREIGN KEY ("submitted_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "registration_drafts" ADD CONSTRAINT "registration_drafts_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "registration_drafts" ADD CONSTRAINT "registration_drafts_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- ---------------------------------------------------------------------------------------------
-- Hand-written part: CHECK constraints and triggers (what Prisma cannot express)
-- ---------------------------------------------------------------------------------------------
ALTER TABLE "registration_drafts" ADD CONSTRAINT "registration_drafts_kind_check" CHECK ("kind" IN ('volunteer', 'staff'));
ALTER TABLE "registration_drafts" ADD CONSTRAINT "registration_drafts_mobile_format" CHECK ("mobile" ~ '^01[3-9][0-9]{8}$');
ALTER TABLE "registration_drafts" ADD CONSTRAINT "registration_drafts_email_lower_check" CHECK ("email" = lower("email"));
ALTER TABLE "registration_drafts" ADD CONSTRAINT "registration_drafts_reference_lookups_check" CHECK ("reference_lookups" BETWEEN 0 AND 5);
-- The draft token is issued at verification; a submitted draft names the account it created.
ALTER TABLE "registration_drafts" ADD CONSTRAINT "registration_drafts_verified_check" CHECK (token_hash IS NULL OR verified_at IS NOT NULL);
ALTER TABLE "registration_drafts" ADD CONSTRAINT "registration_drafts_submitted_check" CHECK ((submitted_at IS NULL) = (submitted_user_id IS NULL));

CREATE TRIGGER registration_drafts_set_updated_at BEFORE UPDATE ON "registration_drafts" FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- D-085: codes sent to a new mobile or email before an edit request reaches the approver.
ALTER TABLE "otp_codes" DROP CONSTRAINT "otp_codes_purpose_check";
ALTER TABLE "otp_codes" ADD CONSTRAINT "otp_codes_purpose_check" CHECK ("purpose" IN ('registration', 'password_reset', 'contact_change'));

-- D-082: the staff photo is linked to the user (volunteers keep volunteers.photo_file_id).
ALTER TABLE "file_links" DROP CONSTRAINT "file_links_entity_type_check";
ALTER TABLE "file_links" ADD CONSTRAINT "file_links_entity_type_check" CHECK (entity_type IN ('application', 'activity', 'voucher', 'expense_claim', 'payment', 'document', 'animal', 'issue', 'media_subject', 'media_story', 'volunteer', 'beneficiary', 'followup_evaluation', 'user'));
