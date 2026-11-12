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
--   * THE KEPT ROWS ARE FROZEN. PostgreSQL holds a NOT VALID check against every new version of a
--     row, so a profile without a mobile or a document, and an application of the kind 'none',
--     then refuses every UPDATE that does not also give it what it lacks: a block, a merge, an
--     address change, a move of the application to another state. Each such row stays frozen
--     until it is given its document and its mobile (the application: a kind of 'nid' or
--     'birth_reg'), or until the stand-in check that holds it is dropped by hand:
--       ALTER TABLE "beneficiaries" DROP CONSTRAINT "beneficiaries_mobile_required";
--       ALTER TABLE "beneficiaries" DROP CONSTRAINT "beneficiaries_identity_check";
--       ALTER TABLE "applications" DROP CONSTRAINT "applications_identity_kind_check";
--     The script ends with a WARNING that counts these rows when there are any.
-- The two columns that say whose number it is are dropped with their values.
--
-- MUST BE RUN IN ONE TRANSACTION, for example `psql --single-transaction -f down.sql`: the
-- statements before the DO block then hold both tables locked, so no row can arrive between the
-- look at the rows and the change that follows from it. Run statement by statement, a row
-- arriving in between makes the script fail without harm, and it can be run again; it can also
-- be run again after it succeeded.

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

-- Each rule becomes what it was where no row breaks it; the rows that break one are counted for
-- the warning that tells the operator they are frozen.
DO $$
DECLARE
  without_mobile bigint;
  without_document bigint;
  kind_none bigint;
BEGIN
  SELECT count(*) INTO kind_none FROM "applications" WHERE "identity_kind" = 'none';
  SELECT count(*) INTO without_document FROM "beneficiaries"
    WHERE "nid" IS NULL AND "birth_reg" IS NULL;
  SELECT count(*) INTO without_mobile FROM "beneficiaries" WHERE "mobile" IS NULL;

  IF kind_none = 0 THEN
    ALTER TABLE "applications" VALIDATE CONSTRAINT "applications_identity_kind_check";
  END IF;
  IF without_document = 0 THEN
    ALTER TABLE "beneficiaries" VALIDATE CONSTRAINT "beneficiaries_identity_check";
  END IF;
  IF without_mobile = 0 THEN
    ALTER TABLE "beneficiaries" ALTER COLUMN "mobile" SET NOT NULL;
  ELSE
    ALTER TABLE "beneficiaries" ADD CONSTRAINT "beneficiaries_mobile_required"
      CHECK ("mobile" IS NOT NULL) NOT VALID;
  END IF;

  IF without_mobile > 0 OR without_document > 0 OR kind_none > 0 THEN
    RAISE WARNING 'optional identity rolled back with rows kept: % profiles without a mobile, % profiles without a document, % applications of the kind none. These rows refuse every UPDATE until each is given what it lacks or the check that holds it is dropped (beneficiaries_mobile_required, beneficiaries_identity_check, applications_identity_kind_check).',
      without_mobile, without_document, kind_none;
  END IF;
END $$;
