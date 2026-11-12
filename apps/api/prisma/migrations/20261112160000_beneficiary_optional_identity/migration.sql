-- A beneficiary may have no identity document and no mobile number: the project decides what its
-- application asks, and a person entered without a document still gets a profile of their own.
-- Only rules are relaxed and columns added; nothing is backfilled or removed, so an API that
-- always writes a document and a mobile keeps working on this schema.

-- A rollback of this migration on a database that already held a profile without a mobile left
-- this check in the place of NOT NULL (see down.sql); it goes before the column is relaxed again.
ALTER TABLE "beneficiaries" DROP CONSTRAINT IF EXISTS "beneficiaries_mobile_required";

-- No number is stored for a person who is reached through the volunteer. The format check, the
-- index and the own-mobile triggers all compare with "=" or "~", which is never true for NULL, so
-- a missing number passes them and a volunteer's own number is still refused.
ALTER TABLE "beneficiaries" ALTER COLUMN "mobile" DROP NOT NULL;

-- A profile without a document has neither number. A number that is given is still checked for
-- its format and is still unique (the two partial unique indexes cover the rows that have one).
ALTER TABLE "beneficiaries" DROP CONSTRAINT "beneficiaries_identity_check";

-- Whose number the mobile is (the person's own, a family member's, a neighbour's) and that
-- person's name. The code is kept against its reference list like the other coded columns.
ALTER TABLE "beneficiaries"
  ADD COLUMN "mobile_owner_code" TEXT,
  ADD COLUMN "mobile_owner_name" TEXT,
  ADD COLUMN "mobile_owner_list" TEXT GENERATED ALWAYS AS ('mobile_owner') STORED;

-- CreateIndex
CREATE INDEX "beneficiaries_mobile_owner_code_idx" ON "beneficiaries"("mobile_owner_code");

-- AddForeignKey
ALTER TABLE "beneficiaries" ADD CONSTRAINT "beneficiaries_mobile_owner_list_mobile_owner_code_fkey" FOREIGN KEY ("mobile_owner_list", "mobile_owner_code") REFERENCES "reference_lists"("list_key", "code") ON DELETE RESTRICT ON UPDATE NO ACTION;

ALTER TABLE "beneficiaries" ADD CONSTRAINT "beneficiaries_mobile_owner_name_check"
  CHECK ("mobile_owner_name" IS NULL OR char_length(btrim("mobile_owner_name")) BETWEEN 1 AND 200);

-- An application for a person without a document says so in the kind of its identity.
ALTER TABLE "applications" DROP CONSTRAINT "applications_identity_kind_check";
ALTER TABLE "applications" ADD CONSTRAINT "applications_identity_kind_check"
  CHECK ("identity_kind" IS NULL OR "identity_kind" IN ('nid', 'birth_reg', 'none'));
