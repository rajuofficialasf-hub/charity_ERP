-- The extra areas of an official (docs/database/DATABASE_SCHEMA.md, "user_extra_areas"): a
-- division, a district or the whole country in which the person sees the volunteers whether or
-- not a project of theirs is at work there. A row is either one location or the whole country,
-- never both; one taken away is ended with who ended it and why, never deleted.
CREATE TABLE "user_extra_areas" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "location_id" UUID,
    "whole_country" BOOLEAN NOT NULL DEFAULT false,
    "reason" TEXT NOT NULL,
    "granted_by" UUID NOT NULL,
    "granted_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ended_at" TIMESTAMPTZ(6),
    "ended_by" UUID,
    "end_reason" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_by" UUID,
    CONSTRAINT "user_extra_areas_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "user_extra_areas_place_check" CHECK (("location_id" IS NULL) = "whole_country"),
    CONSTRAINT "user_extra_areas_end_check" CHECK (("ended_at" IS NULL) = ("ended_by" IS NULL))
);
CREATE UNIQUE INDEX "user_extra_areas_user_id_location_id_key" ON "user_extra_areas"("user_id", "location_id") WHERE ("ended_at" IS NULL AND "location_id" IS NOT NULL);
CREATE UNIQUE INDEX "user_extra_areas_user_id_whole_country_key" ON "user_extra_areas"("user_id") WHERE ("ended_at" IS NULL AND "whole_country");
CREATE INDEX "user_extra_areas_user_id_idx" ON "user_extra_areas"("user_id");
CREATE INDEX "user_extra_areas_location_id_idx" ON "user_extra_areas"("location_id");
CREATE INDEX "user_extra_areas_granted_by_idx" ON "user_extra_areas"("granted_by");
CREATE INDEX "user_extra_areas_ended_by_idx" ON "user_extra_areas"("ended_by");
CREATE INDEX "user_extra_areas_created_by_idx" ON "user_extra_areas"("created_by");
CREATE INDEX "user_extra_areas_updated_by_idx" ON "user_extra_areas"("updated_by");
ALTER TABLE "user_extra_areas" ADD CONSTRAINT "user_extra_areas_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;
ALTER TABLE "user_extra_areas" ADD CONSTRAINT "user_extra_areas_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "locations"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;
ALTER TABLE "user_extra_areas" ADD CONSTRAINT "user_extra_areas_granted_by_fkey" FOREIGN KEY ("granted_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;
ALTER TABLE "user_extra_areas" ADD CONSTRAINT "user_extra_areas_ended_by_fkey" FOREIGN KEY ("ended_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;
ALTER TABLE "user_extra_areas" ADD CONSTRAINT "user_extra_areas_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;
ALTER TABLE "user_extra_areas" ADD CONSTRAINT "user_extra_areas_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;
CREATE TRIGGER user_extra_areas_set_updated_at BEFORE UPDATE ON "user_extra_areas" FOR EACH ROW EXECUTE FUNCTION set_updated_at();
