-- The personal, profession and skills data of a volunteer (DECISION_LOG O-65, D-092; BR-246; plan
-- docs/plans/2026-10-14-0900-feat-volunteer-form-merge-plan.md, U2). All optional: a volunteer
-- registered earlier has none of it. The blood group, the date of birth and the emergency contact
-- belong to the field class volunteer.identity (docs/security/permissions.yaml). The lists are the
-- ones of @css/shared/registration (details.ts); the profession details are one object and the
-- areas of interest one array.

-- AlterTable
ALTER TABLE "volunteers"
  ADD COLUMN "blood_group" TEXT,
  ADD COLUMN "date_of_birth" DATE,
  ADD COLUMN "tshirt_size" TEXT,
  ADD COLUMN "volunteering_area" TEXT,
  ADD COLUMN "profession" TEXT,
  ADD COLUMN "profession_details" JSONB NOT NULL DEFAULT '{}',
  ADD COLUMN "interest_areas" JSONB NOT NULL DEFAULT '[]',
  ADD COLUMN "vehicle" TEXT,
  ADD COLUMN "can_swim" BOOLEAN,
  ADD COLUMN "availability" TEXT,
  ADD COLUMN "emergency_contact_name" TEXT,
  ADD COLUMN "emergency_contact_mobile" TEXT;

ALTER TABLE "volunteers"
  ADD CONSTRAINT "volunteers_blood_group_check"
    CHECK ("blood_group" IS NULL OR "blood_group" IN ('A+', 'A-', 'B+', 'B-', 'O+', 'O-', 'AB+', 'AB-')),
  ADD CONSTRAINT "volunteers_date_of_birth_check"
    CHECK ("date_of_birth" IS NULL OR "date_of_birth" >= DATE '1900-01-01'),
  ADD CONSTRAINT "volunteers_tshirt_size_check"
    CHECK ("tshirt_size" IS NULL OR "tshirt_size" IN ('S', 'M', 'L', 'XL', 'XXL')),
  ADD CONSTRAINT "volunteers_volunteering_area_check"
    CHECK ("volunteering_area" IS NULL OR "volunteering_area" IN ('own_union', 'own_upazila', 'own_district', 'anywhere')),
  ADD CONSTRAINT "volunteers_profession_check"
    CHECK ("profession" IS NULL OR "profession" IN ('student', 'teacher', 'imam', 'businessman', 'job_seeker', 'service_holder')),
  ADD CONSTRAINT "volunteers_profession_details_check"
    CHECK (jsonb_typeof("profession_details") = 'object'),
  ADD CONSTRAINT "volunteers_interest_areas_check"
    CHECK (jsonb_typeof("interest_areas") = 'array'),
  ADD CONSTRAINT "volunteers_vehicle_check"
    CHECK ("vehicle" IS NULL OR "vehicle" IN ('bicycle', 'motorcycle', 'none')),
  ADD CONSTRAINT "volunteers_availability_check"
    CHECK ("availability" IS NULL OR "availability" IN ('holidays', 'anytime', 'on_call')),
  ADD CONSTRAINT "volunteers_emergency_contact_mobile_check"
    CHECK ("emergency_contact_mobile" IS NULL OR "emergency_contact_mobile" ~ '^01[3-9][0-9]{8}$');
