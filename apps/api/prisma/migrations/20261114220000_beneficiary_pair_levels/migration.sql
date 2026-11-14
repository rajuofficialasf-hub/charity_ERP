-- The suggested duplicate pairs gain the rule "the same name, father's or husband's name and
-- village in one union" and say their level: `probable` where several facts agree (any rule that
-- compares a name, or two rules together), `check` where a shared mobile is the only fact. The
-- level follows from the rules alone, so a check holds the two together, and the existing rows get
-- the level their rules give. A pair by an identity or BEN number does not exist: two live profiles
-- never share one (the unique indexes), so the strong level belongs to the number lookup and the
-- verification, not to a stored pair. Additive: one column, one index and a wider rules check.
ALTER TABLE "beneficiary_merge_candidates" DROP CONSTRAINT "beneficiary_merge_candidates_rules_check";
ALTER TABLE "beneficiary_merge_candidates" ADD CONSTRAINT "beneficiary_merge_candidates_rules_check" CHECK (
  cardinality("rules") > 0
  AND "rules" <@ ARRAY['name_dob_union', 'name_father_mobile', 'name_father_village', 'same_mobile']::text[]
);

ALTER TABLE "beneficiary_merge_candidates" ADD COLUMN "level" TEXT;
UPDATE "beneficiary_merge_candidates"
   SET "level" = CASE WHEN "rules" <@ ARRAY['same_mobile']::text[] THEN 'check' ELSE 'probable' END;
ALTER TABLE "beneficiary_merge_candidates" ALTER COLUMN "level" SET NOT NULL;
ALTER TABLE "beneficiary_merge_candidates" ADD CONSTRAINT "beneficiary_merge_candidates_level_check" CHECK (
  "level" = CASE WHEN "rules" <@ ARRAY['same_mobile']::text[] THEN 'check' ELSE 'probable' END
);

-- the list reads the active pairs by level (probable first: 'probable' sorts after 'check'), then by the pair
CREATE INDEX "beneficiary_merge_candidates_level_idx" ON "beneficiary_merge_candidates"("level" DESC, "low_id", "high_id") WHERE ("active");
