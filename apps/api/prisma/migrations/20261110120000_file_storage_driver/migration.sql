-- Each stored file records the driver that holds it, so the files kept on MinIO so far can be found
-- and copied to the NAS when the app switches drivers. Every file stored before this migration is
-- on MinIO, so the default fills them. The default stays while an API that does not know the column
-- may still be running during a deploy; the writers of this version set the driver themselves.
ALTER TABLE "files" ADD COLUMN "storage_driver" TEXT NOT NULL DEFAULT 's3';
ALTER TABLE "files" ADD CONSTRAINT "files_storage_driver_check" CHECK ("storage_driver" IN ('nas', 's3'));
-- the copy reads the files of one driver in id order
CREATE INDEX "files_storage_driver_id_idx" ON "files" ("storage_driver", "id");
