-- Reverts 20261013000000_registration_draft_channels. Drafts without both contacts are transient
-- (purged daily) and cannot satisfy the restored NOT NULL, so they go first. The NID back photo
-- columns are dropped; the files rows they pointed at stay (unlinked, like any replaced photo).

DELETE FROM "registration_drafts" WHERE "mobile" IS NULL OR "email" IS NULL;

CREATE OR REPLACE FUNCTION discard_registration_photo(p_file uuid)
  RETURNS TABLE (bucket text, object_key text)
  LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  DELETE FROM files fl
   WHERE fl.id = p_file
     AND fl.kind IN ('profile_photo', 'nid_photo')
     AND NOT EXISTS (SELECT 1 FROM registration_drafts d
                      WHERE d.photo_file_id = p_file OR d.nid_photo_file_id = p_file)
     AND NOT EXISTS (SELECT 1 FROM volunteers v
                      WHERE v.photo_file_id = p_file OR v.nid_photo_file_id = p_file)
     AND NOT EXISTS (SELECT 1 FROM volunteer_change_requests r WHERE r.new_value = p_file::text)
     AND NOT EXISTS (SELECT 1 FROM file_links l WHERE l.file_id = p_file)
  RETURNING fl.bucket, fl.object_key;
$$;

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
    RETURNING d.id, d.photo_file_id, d.nid_photo_file_id
  )
  SELECT count(DISTINCT gone.id)::integer, coalesce(array_agg(ids.f) FILTER (WHERE ids.f IS NOT NULL), '{}')
    INTO v_drafts, v_files
    FROM gone, LATERAL (VALUES (gone.photo_file_id), (gone.nid_photo_file_id)) AS ids(f);
  RETURN QUERY
    DELETE FROM files fl
     WHERE fl.id = ANY (v_files) AND fl.kind IN ('profile_photo', 'nid_photo')
    RETURNING fl.bucket, fl.object_key, v_drafts;
  IF NOT FOUND AND v_drafts > 0 THEN
    RETURN QUERY SELECT NULL::text, NULL::text, v_drafts;
  END IF;
END $$;

ALTER TABLE "registration_drafts" DROP CONSTRAINT "registration_drafts_otp_sends_check";
ALTER TABLE "registration_drafts" DROP CONSTRAINT "registration_drafts_channels_check";
ALTER TABLE "registration_drafts" DROP CONSTRAINT "registration_drafts_email_verified_check";
ALTER TABLE "registration_drafts" DROP CONSTRAINT "registration_drafts_mobile_verified_check";

ALTER TABLE "volunteers" DROP CONSTRAINT "volunteers_nid_photo_back_file_id_fkey";
ALTER TABLE "registration_drafts" DROP CONSTRAINT "registration_drafts_nid_photo_back_file_id_fkey";
DROP INDEX "volunteers_nid_photo_back_file_id_idx";
DROP INDEX "registration_drafts_nid_photo_back_file_id_idx";

ALTER TABLE "volunteers" DROP COLUMN "nid_photo_back_file_id";
ALTER TABLE "registration_drafts" DROP COLUMN "nid_photo_back_file_id",
DROP COLUMN "otp_sends",
DROP COLUMN "email_verified_at",
DROP COLUMN "mobile_verified_at",
ALTER COLUMN "email" SET NOT NULL,
ALTER COLUMN "mobile" SET NOT NULL;
