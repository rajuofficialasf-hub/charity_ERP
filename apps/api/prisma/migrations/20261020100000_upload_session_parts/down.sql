-- Reverses 20261020100000_upload_session_parts (docs/architecture/ADR, the reversible migrations
-- record). The sessions of the chunked upload are temporary: the rows go with the columns, and
-- the first design's columns come back on an empty table.
-- the status-log guard refuses a delete unless the cleanup setting is on for this transaction
SELECT set_config('css.cleanup', 'on', true);
DELETE FROM "upload_sessions";
DROP TRIGGER "upload_sessions_status_log" ON "upload_sessions";
DROP INDEX IF EXISTS "upload_sessions_open_expires_at_idx";
DROP INDEX IF EXISTS "upload_sessions_user_id_client_uuid_key";
ALTER TABLE "upload_sessions" DROP CONSTRAINT "upload_sessions_bucket_check";
ALTER TABLE "upload_sessions" DROP CONSTRAINT "upload_sessions_bytes_received_check";
ALTER TABLE "upload_sessions" DROP CONSTRAINT "upload_sessions_part_count_check";
ALTER TABLE "upload_sessions" DROP COLUMN "bytes_received";
ALTER TABLE "upload_sessions" DROP COLUMN "parts_received";
ALTER TABLE "upload_sessions" DROP COLUMN "part_count";
ALTER TABLE "upload_sessions" DROP COLUMN "object_key";
ALTER TABLE "upload_sessions" DROP COLUMN "bucket";
ALTER TABLE "upload_sessions" DROP COLUMN "client_uuid";
ALTER TABLE "upload_sessions" ADD COLUMN "parts_acknowledged" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "upload_sessions" ADD COLUMN "multipart_upload_id" TEXT NOT NULL;
CREATE TRIGGER "upload_sessions_status_log" BEFORE UPDATE OR DELETE ON "upload_sessions" FOR EACH ROW
  EXECUTE FUNCTION guard_status_log('parts_acknowledged', 'finalized_file_id');
