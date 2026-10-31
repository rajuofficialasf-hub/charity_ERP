-- Reverses 20261031110000_device_local_key (every migration ships its hand-written reverse,
-- docs/architecture/ADR/ADR-003-prisma-with-down-sql.md). The sealed device keys go with the
-- column: a phone whose session expires afterwards cannot recover its outbox, as before the key.
DROP TRIGGER IF EXISTS device_sessions_status_log ON "device_sessions";
CREATE TRIGGER device_sessions_status_log BEFORE UPDATE OR DELETE ON "device_sessions" FOR EACH ROW
  EXECUTE FUNCTION guard_status_log('refresh_token_hash', 'previous_token_hash', 'last_seen_at', 'last_ip',
    'revoked_at', 'revoked_by', 'revoke_reason');
ALTER TABLE "device_sessions" DROP CONSTRAINT IF EXISTS "device_sessions_pending_count_check";
ALTER TABLE "device_sessions" DROP COLUMN IF EXISTS "pending_reported_at";
ALTER TABLE "device_sessions" DROP COLUMN IF EXISTS "pending_count";
ALTER TABLE "device_sessions" DROP COLUMN IF EXISTS "local_key";
