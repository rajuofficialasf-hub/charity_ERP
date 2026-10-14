-- Reverts 20261014120000_volunteer_education_permanent_address: the education, the permanent
-- address and the full-time answer entered since are dropped; the emergency contact columns come
-- back empty.
ALTER TABLE "volunteers"
  DROP COLUMN "emergency_full_time",
  DROP COLUMN "education_details",
  DROP COLUMN "permanent_address",
  ADD COLUMN "emergency_contact_name" TEXT,
  ADD COLUMN "emergency_contact_mobile" TEXT;

ALTER TABLE "volunteers"
  ADD CONSTRAINT "volunteers_emergency_contact_mobile_check"
    CHECK ("emergency_contact_mobile" IS NULL OR "emergency_contact_mobile" ~ '^01[3-9][0-9]{8}$');
