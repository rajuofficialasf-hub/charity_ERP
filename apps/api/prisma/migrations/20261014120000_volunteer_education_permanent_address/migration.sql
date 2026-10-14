-- Education, the permanent address and the full-time emergency answer; no emergency contact
-- (DECISION_LOG O-66, D-093; BR-248; plan docs/plans/2026-10-14-1400-feat-volunteer-form-refine-plan.md,
-- U2). The two emergency contact columns of 20261014000000 are dropped at once: no release has used
-- them, so the expand-contract rule DB-MIG-03 is waived by O-66. The qualification list, the
-- year and the address chain of the two JSON objects are checked by the strict zod schemas of
-- @css/shared/registration, like profession_details.

-- AlterTable
ALTER TABLE "volunteers"
  DROP COLUMN "emergency_contact_name",
  DROP COLUMN "emergency_contact_mobile",
  ADD COLUMN "emergency_full_time" BOOLEAN,
  ADD COLUMN "education_details" JSONB NOT NULL DEFAULT '{}',
  ADD COLUMN "permanent_address" JSONB;

ALTER TABLE "volunteers"
  ADD CONSTRAINT "volunteers_education_details_check"
    CHECK (jsonb_typeof("education_details") = 'object'),
  ADD CONSTRAINT "volunteers_permanent_address_check"
    CHECK ("permanent_address" IS NULL OR jsonb_typeof("permanent_address") = 'object');
