-- The count of reference lookups of a registration draft is gone (docs/database/DATABASE_SCHEMA.md,
-- "registration_drafts"): the reference is looked up by the registration service without a count
-- kept on the draft, and nothing reads or writes the column. Its check goes with it.
ALTER TABLE "registration_drafts" DROP CONSTRAINT IF EXISTS "registration_drafts_reference_lookups_check";
ALTER TABLE "registration_drafts" DROP COLUMN IF EXISTS "reference_lookups";
