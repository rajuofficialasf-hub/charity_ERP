-- Reverses 20261020160000_beneficiary_master (every migration ships its hand-written reverse,
-- docs/architecture/ADR/ADR-003-prisma-with-down-sql.md). The marks on duplicate pairs go with their table and the BEN numbers
-- with their column; the audit log still records every mark, merge and lookup.

DROP TABLE IF EXISTS "beneficiary_merge_dismissals";
DROP FUNCTION IF EXISTS guard_merge_dismissal();

DROP INDEX IF EXISTS "beneficiaries_dup_name_dob_union_idx";
DROP INDEX IF EXISTS "beneficiaries_dup_name_father_mobile_idx";
DROP FUNCTION IF EXISTS person_name_key(TEXT);

DROP TRIGGER IF EXISTS beneficiaries_keep_ben_no ON "beneficiaries";
DROP FUNCTION IF EXISTS keep_ben_no();
DROP INDEX IF EXISTS "beneficiaries_ben_no_key";
ALTER TABLE "beneficiaries" DROP CONSTRAINT IF EXISTS "beneficiaries_ben_no_check";
ALTER TABLE "beneficiaries" DROP COLUMN IF EXISTS "ben_no";
DROP SEQUENCE IF EXISTS "beneficiaries_ben_no_seq";
