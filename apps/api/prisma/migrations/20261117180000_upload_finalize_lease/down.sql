-- Reverses 20261117180000_upload_finalize_lease: the sweep and the status-log guard as they were,
-- then the lease column goes.
CREATE OR REPLACE FUNCTION purge_expired_upload_sessions(p_limit integer DEFAULT 500)
  RETURNS TABLE (session_id uuid)
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM set_config('css.cleanup', 'on', true);
  RETURN QUERY
    DELETE FROM upload_sessions s
     WHERE s.id IN (SELECT x.id FROM upload_sessions x
                     WHERE x.finalized_file_id IS NULL AND x.expires_at < now()
                     ORDER BY x.expires_at LIMIT p_limit)
       -- checked again on the row itself: a finalize that held the row may have just finished it
       AND s.finalized_file_id IS NULL AND s.expires_at < now()
    RETURNING s.id;
  PERFORM set_config('css.cleanup', 'off', true);
END $$;
REVOKE ALL ON FUNCTION purge_expired_upload_sessions(integer) FROM PUBLIC;
DROP TRIGGER "upload_sessions_status_log" ON "upload_sessions";
CREATE TRIGGER "upload_sessions_status_log" BEFORE UPDATE OR DELETE ON "upload_sessions" FOR EACH ROW
  EXECUTE FUNCTION guard_status_log('parts_received', 'bytes_received', 'expires_at', 'finalized_file_id');
ALTER TABLE "upload_sessions" DROP COLUMN IF EXISTS "finalizing_until";
