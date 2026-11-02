-- Reverses 20261102180000_change_requests_of_officials (every migration ships its hand-written
-- reverse, docs/architecture/ADR/ADR-003-prisma-with-down-sql.md). An official's request has no
-- place in the old shape, which needs a volunteer, so those rows go; every volunteer's request
-- stays as it was.
DELETE FROM "volunteer_change_requests" WHERE "volunteer_id" IS NULL;
ALTER TABLE "volunteer_change_requests" DROP CONSTRAINT IF EXISTS "volunteer_change_requests_person_check";
ALTER TABLE "volunteer_change_requests" ALTER COLUMN "volunteer_id" SET NOT NULL;
DROP INDEX IF EXISTS "volunteer_change_requests_user_id_status_idx";
ALTER TABLE "volunteer_change_requests" DROP CONSTRAINT IF EXISTS "volunteer_change_requests_user_id_fkey";
ALTER TABLE "volunteer_change_requests" DROP COLUMN IF EXISTS "user_id";
