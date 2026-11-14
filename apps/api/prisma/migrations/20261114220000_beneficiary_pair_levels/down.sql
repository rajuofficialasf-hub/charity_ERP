-- Reverses 20261114220000_beneficiary_pair_levels (every migration ships its hand-written reverse,
-- docs/architecture/ADR/ADR-003-prisma-with-down-sql.md). The level is dropped, and the rule the
-- earlier check does not know is taken out of every pair; a pair that held by that rule alone is
-- removed. The pairs are derived from the profiles and the earlier nightly job rebuilds them, so
-- nothing an official decided is lost: the marks "not the same person" live in their own table.
-- It can be run again.
DROP INDEX IF EXISTS "beneficiary_merge_candidates_level_idx";
ALTER TABLE "beneficiary_merge_candidates" DROP CONSTRAINT IF EXISTS "beneficiary_merge_candidates_level_check";
ALTER TABLE "beneficiary_merge_candidates" DROP COLUMN IF EXISTS "level";

ALTER TABLE "beneficiary_merge_candidates" DROP CONSTRAINT IF EXISTS "beneficiary_merge_candidates_rules_check";
UPDATE "beneficiary_merge_candidates"
   SET "rules" = array_remove("rules", 'name_father_village')
 WHERE 'name_father_village' = ANY ("rules");
DELETE FROM "beneficiary_merge_candidates" WHERE cardinality("rules") = 0;
ALTER TABLE "beneficiary_merge_candidates" ADD CONSTRAINT "beneficiary_merge_candidates_rules_check" CHECK (
  cardinality("rules") > 0
  AND "rules" <@ ARRAY['name_dob_union', 'name_father_mobile', 'same_mobile']::text[]
);
