-- Upload sessions for the chunked upload through the API (docs/DECISION_LOG.md D-108; plan
-- docs/plans/2026-10-20-0918-feat-file-service-plan.md). Each 256 KB part is stored as a small
-- object in the temporary uploads bucket and the parts are joined at finalize, so the S3
-- multipart id and the part counter of the first design go; the session now records the parts it
-- holds, the bytes received, the target object and the client's id for an idempotent create.
-- No code has written a session yet: the migration refuses to run on a table with rows.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM "upload_sessions") THEN
    RAISE EXCEPTION 'upload_sessions has rows; this migration expects the unused table';
  END IF;
END $$;

-- the status-log guard names the columns an update may change; it names the dropped counter
DROP TRIGGER "upload_sessions_status_log" ON "upload_sessions";
ALTER TABLE "upload_sessions" DROP COLUMN "multipart_upload_id";
ALTER TABLE "upload_sessions" DROP COLUMN "parts_acknowledged";
ALTER TABLE "upload_sessions" ADD COLUMN "client_uuid" UUID NOT NULL;
ALTER TABLE "upload_sessions" ADD COLUMN "bucket" TEXT NOT NULL;
ALTER TABLE "upload_sessions" ADD COLUMN "object_key" TEXT NOT NULL;
ALTER TABLE "upload_sessions" ADD COLUMN "part_count" INTEGER NOT NULL;
ALTER TABLE "upload_sessions" ADD COLUMN "parts_received" INTEGER[] NOT NULL DEFAULT '{}';
ALTER TABLE "upload_sessions" ADD COLUMN "bytes_received" BIGINT NOT NULL DEFAULT 0;

ALTER TABLE "upload_sessions" ADD CONSTRAINT "upload_sessions_part_count_check" CHECK ("part_count" BETWEEN 1 AND 80);
ALTER TABLE "upload_sessions" ADD CONSTRAINT "upload_sessions_bytes_received_check" CHECK ("bytes_received" >= 0);
ALTER TABLE "upload_sessions" ADD CONSTRAINT "upload_sessions_bucket_check" CHECK ("bucket" IN ('documents', 'photos', 'vouchers', 'profiles', 'media'));

-- one session per device-made id of a user, so a resent create answers the same session
CREATE UNIQUE INDEX "upload_sessions_user_id_client_uuid_key" ON "upload_sessions"("user_id", "client_uuid");
-- the nightly sweep reads the open sessions past their expiry
CREATE INDEX "upload_sessions_open_expires_at_idx" ON "upload_sessions"("expires_at") WHERE "finalized_file_id" IS NULL;

-- an upload in progress may record its parts, its bytes and its expiry, and finally its file
CREATE TRIGGER "upload_sessions_status_log" BEFORE UPDATE OR DELETE ON "upload_sessions" FOR EACH ROW
  EXECUTE FUNCTION guard_status_log('parts_received', 'bytes_received', 'expires_at', 'finalized_file_id');
