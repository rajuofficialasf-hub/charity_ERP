-- Per-channel registration verification and the NID back photo (DECISION_LOG D-090, UX-16, UX-18;
-- plan docs/plans/2026-10-13-0922-feat-registration-redesign-plan.md, U2). A draft starts without
-- contacts; each channel holds its address and its verification time; the token needs both.
-- Additive apart from the two contacts becoming nullable.

-- AlterTable
ALTER TABLE "registration_drafts" ALTER COLUMN "mobile" DROP NOT NULL,
ALTER COLUMN "email" DROP NOT NULL,
ADD COLUMN "mobile_verified_at" TIMESTAMPTZ(6),
ADD COLUMN "email_verified_at" TIMESTAMPTZ(6),
ADD COLUMN "otp_sends" SMALLINT NOT NULL DEFAULT 0,
ADD COLUMN "nid_photo_back_file_id" UUID;

-- AlterTable
ALTER TABLE "volunteers" ADD COLUMN "nid_photo_back_file_id" UUID;

-- CreateIndex
CREATE INDEX "registration_drafts_nid_photo_back_file_id_idx" ON "registration_drafts"("nid_photo_back_file_id");

-- CreateIndex
CREATE INDEX "volunteers_nid_photo_back_file_id_idx" ON "volunteers"("nid_photo_back_file_id");

-- AddForeignKey
ALTER TABLE "registration_drafts" ADD CONSTRAINT "registration_drafts_nid_photo_back_file_id_fkey" FOREIGN KEY ("nid_photo_back_file_id") REFERENCES "files"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "volunteers" ADD CONSTRAINT "volunteers_nid_photo_back_file_id_fkey" FOREIGN KEY ("nid_photo_back_file_id") REFERENCES "files"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- ---------------------------------------------------------------------------------------------
-- Hand-written part: CHECK constraints and the two photo functions
-- ---------------------------------------------------------------------------------------------
-- A channel is verified only with its address; the token (verified_at) only once both are; the
-- sends of one draft stay within its budget (6 across channels and address changes).
ALTER TABLE "registration_drafts" ADD CONSTRAINT "registration_drafts_mobile_verified_check" CHECK (mobile_verified_at IS NULL OR mobile IS NOT NULL);
ALTER TABLE "registration_drafts" ADD CONSTRAINT "registration_drafts_email_verified_check" CHECK (email_verified_at IS NULL OR email IS NOT NULL);
ALTER TABLE "registration_drafts" ADD CONSTRAINT "registration_drafts_channels_check" CHECK (verified_at IS NULL OR (mobile_verified_at IS NOT NULL AND email_verified_at IS NOT NULL));
ALTER TABLE "registration_drafts" ADD CONSTRAINT "registration_drafts_otp_sends_check" CHECK (otp_sends BETWEEN 0 AND 6);

-- The purge also removes the NID back of an expired draft.
CREATE OR REPLACE FUNCTION purge_expired_registration_drafts(p_limit integer DEFAULT 500)
  RETURNS TABLE (bucket text, object_key text, drafts integer)
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_files uuid[];
  v_drafts integer;
BEGIN
  WITH gone AS (
    DELETE FROM registration_drafts d
     WHERE d.id IN (SELECT x.id FROM registration_drafts x
                     WHERE x.submitted_at IS NULL AND x.expires_at < now()
                     ORDER BY x.expires_at LIMIT p_limit)
    RETURNING d.id, d.photo_file_id, d.nid_photo_file_id, d.nid_photo_back_file_id
  )
  SELECT count(DISTINCT gone.id)::integer, coalesce(array_agg(ids.f) FILTER (WHERE ids.f IS NOT NULL), '{}')
    INTO v_drafts, v_files
    FROM gone, LATERAL (VALUES (gone.photo_file_id), (gone.nid_photo_file_id), (gone.nid_photo_back_file_id)) AS ids(f);
  RETURN QUERY
    DELETE FROM files fl
     WHERE fl.id = ANY (v_files) AND fl.kind IN ('profile_photo', 'nid_photo')
    RETURNING fl.bucket, fl.object_key, v_drafts;
  IF NOT FOUND AND v_drafts > 0 THEN
    RETURN QUERY SELECT NULL::text, NULL::text, v_drafts;
  END IF;
END $$;

-- A replaced photo is kept while a draft or a volunteer holds it as the NID back too.
CREATE OR REPLACE FUNCTION discard_registration_photo(p_file uuid)
  RETURNS TABLE (bucket text, object_key text)
  LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  DELETE FROM files fl
   WHERE fl.id = p_file
     AND fl.kind IN ('profile_photo', 'nid_photo')
     AND NOT EXISTS (SELECT 1 FROM registration_drafts d
                      WHERE p_file IN (d.photo_file_id, d.nid_photo_file_id, d.nid_photo_back_file_id))
     AND NOT EXISTS (SELECT 1 FROM volunteers v
                      WHERE p_file IN (v.photo_file_id, v.nid_photo_file_id, v.nid_photo_back_file_id))
     AND NOT EXISTS (SELECT 1 FROM volunteer_change_requests r WHERE r.new_value = p_file::text)
     AND NOT EXISTS (SELECT 1 FROM file_links l WHERE l.file_id = p_file)
  RETURNING fl.bucket, fl.object_key;
$$;
