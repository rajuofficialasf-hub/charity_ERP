-- Reverses 20261112160000_beneficiary_optional_identity (every migration ships its hand-written
-- reverse, docs/architecture/ADR/ADR-003-prisma-with-down-sql.md).
--
-- The three relaxed rules return, each as far as the rows allow:
--   * On a database where no profile lacks a mobile or a document and no application has the kind
--     'none', the schema is exactly the one before the migration.
--   * Where such rows exist, they stay: no business row is deleted or filled with an invented
--     value by a rollback. PostgreSQL cannot set NOT NULL on a column that holds a NULL, so
--     "beneficiaries"."mobile" STAYS NULLABLE IN ITS TYPE and the rule is held by the check
--     "beneficiaries_mobile_required", added NOT VALID: every new and every changed row must have
--     a mobile, the existing rows are left as they are. The identity check and the kind check
--     come back NOT VALID in the same way and for the same reason.
-- The two columns that say whose number it is are dropped with their values.
-- Run it as one transaction (psql --single-transaction): the script can be run again after a
-- failure.

ALTER TABLE "beneficiaries" DROP CONSTRAINT IF EXISTS "beneficiaries_mobile_owner_name_check";
ALTER TABLE "beneficiaries" DROP CONSTRAINT IF EXISTS "beneficiaries_mobile_owner_list_mobile_owner_code_fkey";
DROP INDEX IF EXISTS "beneficiaries_mobile_owner_code_idx";
ALTER TABLE "beneficiaries"
  DROP COLUMN IF EXISTS "mobile_owner_list",
  DROP COLUMN IF EXISTS "mobile_owner_name",
  DROP COLUMN IF EXISTS "mobile_owner_code";

ALTER TABLE "applications" DROP CONSTRAINT IF EXISTS "applications_identity_kind_check";
ALTER TABLE "applications" ADD CONSTRAINT "applications_identity_kind_check"
  CHECK ("identity_kind" IS NULL OR "identity_kind" IN ('nid', 'birth_reg')) NOT VALID;
ALTER TABLE "beneficiaries" DROP CONSTRAINT IF EXISTS "beneficiaries_identity_check";
ALTER TABLE "beneficiaries" ADD CONSTRAINT "beneficiaries_identity_check"
  CHECK (nid IS NOT NULL OR birth_reg IS NOT NULL) NOT VALID;
ALTER TABLE "beneficiaries" DROP CONSTRAINT IF EXISTS "beneficiaries_mobile_required";

-- Each rule becomes what it was where no row breaks it. Inside one transaction the statements
-- above hold both tables locked, so no such row can arrive between a look and its change.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM "applications" WHERE "identity_kind" = 'none') THEN
    ALTER TABLE "applications" VALIDATE CONSTRAINT "applications_identity_kind_check";
  END IF;
  IF NOT EXISTS (SELECT 1 FROM "beneficiaries" WHERE "nid" IS NULL AND "birth_reg" IS NULL) THEN
    ALTER TABLE "beneficiaries" VALIDATE CONSTRAINT "beneficiaries_identity_check";
  END IF;
  IF NOT EXISTS (SELECT 1 FROM "beneficiaries" WHERE "mobile" IS NULL) THEN
    ALTER TABLE "beneficiaries" ALTER COLUMN "mobile" SET NOT NULL;
  ELSE
    ALTER TABLE "beneficiaries" ADD CONSTRAINT "beneficiaries_mobile_required"
      CHECK ("mobile" IS NOT NULL) NOT VALID;
  END IF;
END $$;
