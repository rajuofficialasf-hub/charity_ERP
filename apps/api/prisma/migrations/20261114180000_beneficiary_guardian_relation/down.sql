-- Reverses 20261114180000_beneficiary_guardian_relation (every migration ships its hand-written
-- reverse, docs/architecture/ADR/ADR-003-prisma-with-down-sql.md). The column is dropped with its
-- values: whether a name is the father's or the husband's is lost for every profile that had it.
-- The entries of the list `guardian_relation` stay in `reference_lists` (the base seed wrote them,
-- not this migration). It can be run again.

ALTER TABLE "beneficiaries" DROP CONSTRAINT IF EXISTS "beneficiaries_guardian_relation_fkey";
DROP INDEX IF EXISTS "beneficiaries_guardian_relation_code_idx";
ALTER TABLE "beneficiaries"
  DROP COLUMN IF EXISTS "guardian_relation_list",
  DROP COLUMN IF EXISTS "guardian_relation_code";
