-- One finalize of an upload session at a time without holding a transaction while the parts are
-- joined (docs/architecture/FILES_AND_DOCUMENTS.md, "Upload pipeline"): a finalize first takes the
-- session until a moment two minutes on, joins the parts into the object outside any transaction,
-- then writes the file's rows in a short one; a second finalize meanwhile is told to try again, and
-- one that comes after the lease ran out (a finalize that died) takes it over.
ALTER TABLE "upload_sessions" ADD COLUMN "finalizing_until" TIMESTAMPTZ;

-- the status-log guard names the columns an update may change
DROP TRIGGER "upload_sessions_status_log" ON "upload_sessions";
CREATE TRIGGER "upload_sessions_status_log" BEFORE UPDATE OR DELETE ON "upload_sessions" FOR EACH ROW
  EXECUTE FUNCTION guard_status_log('parts_received', 'bytes_received', 'expires_at', 'finalized_file_id', 'finalizing_until');

-- the nightly sweep leaves a session alone while a finalize holds it
CREATE OR REPLACE FUNCTION purge_expired_upload_sessions(p_limit integer DEFAULT 500)
  RETURNS TABLE (session_id uuid)
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM set_config('css.cleanup', 'on', true);
  RETURN QUERY
    DELETE FROM upload_sessions s
     WHERE s.id IN (SELECT x.id FROM upload_sessions x
                     WHERE x.finalized_file_id IS NULL AND x.expires_at < now()
                       AND (x.finalizing_until IS NULL OR x.finalizing_until < now())
                     ORDER BY x.expires_at LIMIT p_limit)
       -- checked again on the row itself: a finalize that held the row may have just finished it
       AND s.finalized_file_id IS NULL AND s.expires_at < now()
       AND (s.finalizing_until IS NULL OR s.finalizing_until < now())
    RETURNING s.id;
  PERFORM set_config('css.cleanup', 'off', true);
END $$;
REVOKE ALL ON FUNCTION purge_expired_upload_sessions(integer) FROM PUBLIC;
