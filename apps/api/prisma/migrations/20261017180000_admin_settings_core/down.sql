-- Reverses 20261017180000_admin_settings_core (docs/architecture/ADR/ADR-003-prisma-with-down-sql.md;
-- DECISION_LOG D-098). The withdrawals go with their columns; the audit log still records each one.
-- Refused while a withdrawn version shares its effective date with a live one, because the full
-- unique index cannot come back then; resolve that by hand first.

DROP TRIGGER IF EXISTS nisab_versions_protect ON "nisab_versions";
DROP FUNCTION IF EXISTS protect_nisab_version();

DROP INDEX IF EXISTS "nisab_versions_effective_from_key";
CREATE UNIQUE INDEX "nisab_versions_effective_from_key" ON "nisab_versions"("effective_from");

DROP INDEX IF EXISTS "nisab_versions_withdrawn_by_idx";
ALTER TABLE "nisab_versions" DROP CONSTRAINT "nisab_versions_withdrawal_check";
ALTER TABLE "nisab_versions" DROP CONSTRAINT "nisab_versions_withdrawn_by_fkey";
ALTER TABLE "nisab_versions" DROP COLUMN "withdraw_reason";
ALTER TABLE "nisab_versions" DROP COLUMN "withdrawn_by";
ALTER TABLE "nisab_versions" DROP COLUMN "withdrawn_at";

DROP INDEX IF EXISTS "audit_log_created_at_id_idx";
