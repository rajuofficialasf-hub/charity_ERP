-- The photos of an application form (the public link's uploads now, the volunteer form's later)
-- are a kind of their own, linked to the application like the other evidence photos
-- (docs/architecture/FILES_AND_DOCUMENTS.md, "Validation table"). Until a public submission
-- claims such a photo, its link names the pending submission by the applicant's client id; the
-- file routes never resolve that entity, so an unclaimed photo is unreadable.
ALTER TABLE "files" DROP CONSTRAINT "files_kind_check";
ALTER TABLE "files"
  ADD CONSTRAINT "files_kind_check"
  CHECK ("kind" IN ('distribution_proof', 'construction_proof', 'evidence', 'voucher', 'payment_copy', 'document', 'animal_photo', 'profile_photo', 'nid_photo', 'media_asset', 'export', 'issue_photo', 'form_photo'));
ALTER TABLE "file_links" DROP CONSTRAINT "file_links_entity_type_check";
ALTER TABLE "file_links"
  ADD CONSTRAINT "file_links_entity_type_check"
  CHECK (entity_type IN ('application', 'activity', 'voucher', 'expense_claim', 'payment', 'document', 'animal', 'issue', 'media_subject', 'media_story', 'volunteer', 'beneficiary', 'followup_evaluation', 'user', 'public_submission'));

-- A public photo no submission claimed within its day is not business data: the nightly sweep
-- removes its rows only through this function (the API role deletes nothing itself) and then the
-- stored objects it names. A photo a submission claimed has an application link and is never
-- touched.
CREATE FUNCTION purge_unclaimed_public_photos(p_before timestamptz, p_limit integer DEFAULT 200)
  RETURNS TABLE (file_id uuid, object_key text, thumbnail_small_key text, thumbnail_medium_key text)
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_ids uuid[];
BEGIN
  SELECT array_agg(f.id) INTO v_ids
    FROM (SELECT x.id FROM files x
           WHERE x.kind = 'form_photo' AND x.created_at < p_before
             AND EXISTS (SELECT 1 FROM file_links l
                          WHERE l.file_id = x.id AND l.entity_type = 'public_submission')
             AND NOT EXISTS (SELECT 1 FROM file_links l
                              WHERE l.file_id = x.id AND l.entity_type <> 'public_submission')
           ORDER BY x.created_at LIMIT p_limit) f;
  IF v_ids IS NULL THEN RETURN; END IF;
  DELETE FROM file_links l WHERE l.file_id = ANY (v_ids);
  RETURN QUERY
    DELETE FROM files fl WHERE fl.id = ANY (v_ids)
    RETURNING fl.id, fl.object_key, fl.thumbnail_small_key, fl.thumbnail_medium_key;
END $$;
REVOKE ALL ON FUNCTION purge_unclaimed_public_photos(timestamptz, integer) FROM PUBLIC;
