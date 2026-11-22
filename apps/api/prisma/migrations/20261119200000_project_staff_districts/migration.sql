-- The districts of a staff place (docs/database/DATABASE_SCHEMA.md, "project_staff_districts"):
-- an RPM gives a Project Executive or an Official দায়ী one or several districts of the place's
-- area on a project. A place without a live row here holds its whole area, so the places that
-- exist keep what they have. A district that is taken away is ended, never deleted.
CREATE TABLE "project_staff_districts" (
    "id" UUID NOT NULL,
    "project_staff_id" UUID NOT NULL,
    "location_id" UUID NOT NULL,
    "ended_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_by" UUID,
    CONSTRAINT "project_staff_districts_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "project_staff_districts_project_staff_id_location_id_key" ON "project_staff_districts"("project_staff_id", "location_id") WHERE ("ended_at" IS NULL);
CREATE INDEX "project_staff_districts_location_id_idx" ON "project_staff_districts"("location_id");
CREATE INDEX "project_staff_districts_created_by_idx" ON "project_staff_districts"("created_by");
CREATE INDEX "project_staff_districts_updated_by_idx" ON "project_staff_districts"("updated_by");
ALTER TABLE "project_staff_districts" ADD CONSTRAINT "project_staff_districts_project_staff_id_fkey" FOREIGN KEY ("project_staff_id") REFERENCES "project_staff"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;
ALTER TABLE "project_staff_districts" ADD CONSTRAINT "project_staff_districts_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "locations"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;
ALTER TABLE "project_staff_districts" ADD CONSTRAINT "project_staff_districts_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;
ALTER TABLE "project_staff_districts" ADD CONSTRAINT "project_staff_districts_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;
CREATE TRIGGER project_staff_districts_set_updated_at BEFORE UPDATE ON "project_staff_districts" FOR EACH ROW EXECUTE FUNCTION set_updated_at();
