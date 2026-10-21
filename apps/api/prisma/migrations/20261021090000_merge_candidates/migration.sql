-- The suggested duplicate pairs of beneficiaries, kept instead of computed for each request (the
-- decision on the duplicate suggestions in docs/DECISION_LOG.md): a profile's own pairs are
-- recomputed when it changes, and a nightly job recomputes all of them. A pair that no longer
-- holds is marked inactive; rows are never deleted. Additive: one new table.
CREATE TABLE "beneficiary_merge_candidates" (
    "low_id" UUID NOT NULL,
    "high_id" UUID NOT NULL,
    "rules" TEXT[] NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "computed_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "beneficiary_merge_candidates_pkey" PRIMARY KEY ("low_id", "high_id"),
    CONSTRAINT "beneficiary_merge_candidates_pair_check" CHECK ("low_id" < "high_id"),
    CONSTRAINT "beneficiary_merge_candidates_rules_check" CHECK (
      cardinality("rules") > 0
      AND "rules" <@ ARRAY['name_dob_union', 'name_father_mobile', 'same_mobile']::text[]
    )
);
CREATE INDEX "beneficiary_merge_candidates_high_id_idx" ON "beneficiary_merge_candidates"("high_id");
CREATE INDEX "beneficiary_merge_candidates_active_idx" ON "beneficiary_merge_candidates"("low_id", "high_id") WHERE (active);
ALTER TABLE "beneficiary_merge_candidates" ADD CONSTRAINT "beneficiary_merge_candidates_low_id_fkey" FOREIGN KEY ("low_id") REFERENCES "beneficiaries"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;
ALTER TABLE "beneficiary_merge_candidates" ADD CONSTRAINT "beneficiary_merge_candidates_high_id_fkey" FOREIGN KEY ("high_id") REFERENCES "beneficiaries"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;
