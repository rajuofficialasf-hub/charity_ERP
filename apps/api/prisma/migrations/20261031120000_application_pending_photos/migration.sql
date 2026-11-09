-- The photos an application still waits for after an offline sync (docs/architecture/OFFLINE_SYNC.md
-- "Photo queue and resumable upload"): the text of the record arrives first, each waiting photo as
-- the slot it will fill; the upload that arrives for the slot fills the answer and removes it.
ALTER TABLE "applications" ADD COLUMN "pending_photos" JSONB NOT NULL DEFAULT '[]'::jsonb;
