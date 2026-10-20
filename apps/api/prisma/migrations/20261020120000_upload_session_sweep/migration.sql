-- The nightly sweep of upload sessions that expired before they were finalized
-- (docs/architecture/FILES_AND_DOCUMENTS.md, "Upload pipeline"). A session is deleted only through
-- this function, which turns on the cleanup setting the status-log guard asks for and returns the
-- ids, so the job can remove the stored parts.
CREATE FUNCTION purge_expired_upload_sessions(p_limit integer DEFAULT 500)
  RETURNS TABLE (session_id uuid)
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM set_config('css.cleanup', 'on', true);
  RETURN QUERY
    DELETE FROM upload_sessions s
     WHERE s.id IN (SELECT x.id FROM upload_sessions x
                     WHERE x.finalized_file_id IS NULL AND x.expires_at < now()
                     ORDER BY x.expires_at LIMIT p_limit)
    RETURNING s.id;
  PERFORM set_config('css.cleanup', 'off', true);
END $$;
REVOKE ALL ON FUNCTION purge_expired_upload_sessions(integer) FROM PUBLIC;
