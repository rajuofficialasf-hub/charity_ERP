-- Reverses 20261031120000_application_pending_photos (every migration ships its hand-written
-- reverse, docs/architecture/ADR/ADR-003-prisma-with-down-sql.md). The waiting slots go with the
-- column: a photo still on a phone for such a slot is refused at its upload and uploaded again
-- through the record's edit.
ALTER TABLE "applications" DROP COLUMN IF EXISTS "pending_photos";
