-- Reverses 20261114200000_beneficiary_family_source (every migration ships its hand-written
-- reverse, docs/architecture/ADR/ADR-003-prisma-with-down-sql.md). The column is dropped with its
-- values: the members' rows stay, active and inactive as they are, but which application each
-- list came from is lost, so the next submitted list replaces the active rows whatever their age.
-- It can be run again.

ALTER TABLE "beneficiary_family_members" DROP CONSTRAINT IF EXISTS "beneficiary_family_members_source_application_id_fkey";
DROP INDEX IF EXISTS "beneficiary_family_members_source_application_id_idx";
ALTER TABLE "beneficiary_family_members" DROP COLUMN IF EXISTS "source_application_id";
