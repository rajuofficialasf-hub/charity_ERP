-- Reverts 20261014000000_volunteer_profile_details: the personal, profession and skills data entered
-- since are dropped (the constraints go with their columns).
ALTER TABLE "volunteers"
  DROP COLUMN "blood_group",
  DROP COLUMN "date_of_birth",
  DROP COLUMN "tshirt_size",
  DROP COLUMN "volunteering_area",
  DROP COLUMN "profession",
  DROP COLUMN "profession_details",
  DROP COLUMN "interest_areas",
  DROP COLUMN "vehicle",
  DROP COLUMN "can_swim",
  DROP COLUMN "availability",
  DROP COLUMN "emergency_contact_name",
  DROP COLUMN "emergency_contact_mobile";
