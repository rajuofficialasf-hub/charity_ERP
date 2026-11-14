-- Reverses 20261114120000_beneficiary_name_keys (every migration ships its hand-written reverse,
-- docs/architecture/ADR/ADR-003-prisma-with-down-sql.md). The keys are derived from the names, so
-- dropping them loses nothing a person wrote; the list of spelling variants goes with its table.
DROP TRIGGER "beneficiary_family_members_set_updated_at" ON "beneficiary_family_members";
CREATE TRIGGER beneficiary_family_members_set_updated_at BEFORE UPDATE ON "beneficiary_family_members" FOR EACH ROW EXECUTE FUNCTION set_updated_at();
DROP TRIGGER "beneficiaries_set_updated_at" ON "beneficiaries";
CREATE TRIGGER beneficiaries_set_updated_at BEFORE UPDATE ON "beneficiaries" FOR EACH ROW EXECUTE FUNCTION set_updated_at();
DROP FUNCTION set_updated_at_unless_match_keys();

DROP TABLE "name_variants_version";
DROP TABLE "name_variants";

DROP INDEX "beneficiary_family_members_match_keys_version_idx";
DROP INDEX "beneficiaries_match_keys_version_idx";
DROP INDEX "beneficiary_family_members_name_key_idx";
DROP INDEX "beneficiaries_union_id_village_key_idx";
DROP INDEX "beneficiaries_union_id_name_key_guardian_key_idx";
ALTER TABLE "beneficiary_family_members"
  DROP COLUMN "match_keys_version",
  DROP COLUMN "name_key";
ALTER TABLE "beneficiaries"
  DROP COLUMN "match_keys_version",
  DROP COLUMN "village_key",
  DROP COLUMN "guardian_key",
  DROP COLUMN "name_key";
