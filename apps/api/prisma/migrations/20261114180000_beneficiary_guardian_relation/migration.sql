-- Whether the name beside a beneficiary is the father's or the husband's, where the application
-- said so: a code of the reference list `guardian_relation` (`father`, `husband`), NULL where it is
-- not known. It describes the locked name beside it, so the comparison of two people never pairs
-- a father's name with a husband's. The code is kept against its list like the other coded
-- columns; the stored generated list column rewrites the table once.
ALTER TABLE "beneficiaries"
  ADD COLUMN "guardian_relation_code" TEXT,
  ADD COLUMN "guardian_relation_list" TEXT GENERATED ALWAYS AS ('guardian_relation') STORED;

-- CreateIndex
CREATE INDEX "beneficiaries_guardian_relation_code_idx" ON "beneficiaries"("guardian_relation_code");

-- AddForeignKey (named by hand: the default name would pass the 63 characters PostgreSQL keeps)
ALTER TABLE "beneficiaries" ADD CONSTRAINT "beneficiaries_guardian_relation_fkey" FOREIGN KEY ("guardian_relation_list", "guardian_relation_code") REFERENCES "reference_lists"("list_key", "code") ON DELETE RESTRICT ON UPDATE NO ACTION;
