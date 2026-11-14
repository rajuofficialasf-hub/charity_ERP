-- The application a family member's row was written from. A submitted application that carries
-- the family group replaces the person's active members with its own list, and the list of the
-- latest submitted application wins: a list is replaced only by an application submitted no
-- earlier than the one the active rows came from, read through this column. NULL for a row that
-- came from no application, which any list replaces.
ALTER TABLE "beneficiary_family_members" ADD COLUMN "source_application_id" UUID;

-- CreateIndex
CREATE INDEX "beneficiary_family_members_source_application_id_idx" ON "beneficiary_family_members"("source_application_id");

-- AddForeignKey
ALTER TABLE "beneficiary_family_members" ADD CONSTRAINT "beneficiary_family_members_source_application_id_fkey" FOREIGN KEY ("source_application_id") REFERENCES "applications"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;
