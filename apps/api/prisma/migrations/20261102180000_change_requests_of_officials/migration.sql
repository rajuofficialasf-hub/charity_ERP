-- An official asks for a change of their own details like a volunteer does (docs/DECISION_LOG.md
-- D-147): the requests table serves both. user_id names the person the request is about; a
-- volunteer's request also names the volunteer, an official's does not. A registration
-- correction is always a volunteer's.
ALTER TABLE "volunteer_change_requests" ADD COLUMN "user_id" UUID;
UPDATE "volunteer_change_requests" r
   SET "user_id" = v."user_id"
  FROM "volunteers" v
 WHERE v."id" = r."volunteer_id";
ALTER TABLE "volunteer_change_requests" ALTER COLUMN "user_id" SET NOT NULL;
ALTER TABLE "volunteer_change_requests"
  ADD CONSTRAINT "volunteer_change_requests_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;
CREATE INDEX "volunteer_change_requests_user_id_status_idx"
  ON "volunteer_change_requests"("user_id", "status");
ALTER TABLE "volunteer_change_requests" ALTER COLUMN "volunteer_id" DROP NOT NULL;
ALTER TABLE "volunteer_change_requests"
  ADD CONSTRAINT "volunteer_change_requests_person_check"
  CHECK ("kind" = 'profile_edit' OR "volunteer_id" IS NOT NULL);
