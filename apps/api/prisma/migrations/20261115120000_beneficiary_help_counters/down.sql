-- Reverses 20261115120000_beneficiary_help_counters (every migration ships its hand-written reverse,
-- docs/architecture/ADR/ADR-003-prisma-with-down-sql.md). The counters are derived from the
-- applications, so dropping them loses nothing anyone wrote; the update stamp goes back to the rule
-- of the name keys alone.
DROP INDEX "beneficiaries_helped_repeat_idx";
DROP INDEX "beneficiaries_help_count_idx";

DROP TRIGGER "beneficiaries_set_updated_at" ON "beneficiaries";
CREATE TRIGGER beneficiaries_set_updated_at BEFORE UPDATE ON "beneficiaries" FOR EACH ROW EXECUTE FUNCTION set_updated_at_unless_match_keys();
DROP FUNCTION beneficiaries_set_updated_at();

ALTER TABLE "beneficiaries" DROP CONSTRAINT "beneficiaries_help_counts_check";
ALTER TABLE "beneficiaries"
  DROP COLUMN "max_helps_in_year",
  DROP COLUMN "help_count";
