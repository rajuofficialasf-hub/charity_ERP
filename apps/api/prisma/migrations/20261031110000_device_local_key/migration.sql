-- The device key of a session and what the device still holds (docs/architecture/AUTH.md "Tokens
-- and device sessions", docs/architecture/OFFLINE_SYNC.md "Local storage security"): local_key is
-- the key sealed under the server's secret and bound to the session id; it is dropped on logout,
-- on revocation and thirty days after the session ended. pending_count is the number of records
-- the device reported as still waiting, with the time of the report, for the sessions screens.
ALTER TABLE "device_sessions" ADD COLUMN "local_key" BYTEA;
-- when the key was first handed back after the session ended; the phone may ask again for a short
-- while (a lost answer on a poor network), then the key goes
ALTER TABLE "device_sessions" ADD COLUMN "local_key_recovered_at" TIMESTAMPTZ(6);
ALTER TABLE "device_sessions" ADD COLUMN "pending_count" INTEGER;
ALTER TABLE "device_sessions" ADD COLUMN "pending_reported_at" TIMESTAMPTZ(6);
ALTER TABLE "device_sessions" ADD CONSTRAINT "device_sessions_pending_count_check"
  CHECK ("pending_count" IS NULL OR "pending_count" >= 0);

-- The status-log guard lets these three columns change along with the rotation and revocation ones.
DROP TRIGGER IF EXISTS device_sessions_status_log ON "device_sessions";
CREATE TRIGGER device_sessions_status_log BEFORE UPDATE OR DELETE ON "device_sessions" FOR EACH ROW
  EXECUTE FUNCTION guard_status_log('refresh_token_hash', 'previous_token_hash', 'last_seen_at', 'last_ip',
    'revoked_at', 'revoked_by', 'revoke_reason', 'local_key', 'local_key_recovered_at', 'pending_count',
    'pending_reported_at');
