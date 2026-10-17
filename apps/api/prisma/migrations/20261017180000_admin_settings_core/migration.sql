-- Admin and settings, core (DECISION_LOG D-098; plan
-- docs/plans/2026-10-17-1800-feat-admin-settings-core-plan.md). Additive: an index for the audit
-- viewer's newest-first list, and the withdrawal of a nisab version that has not taken effect.

-- The audit viewer lists the log newest first within a date range; the existing indexes all start
-- with the entity, the actor or the action. Created on the partitioned parent, so every monthly
-- partition gets it.
CREATE INDEX "audit_log_created_at_id_idx" ON "audit_log"("created_at" DESC, "id" DESC);

-- A nisab version that has not taken effect may be withdrawn with a reason; it stays in the list.
-- The three columns are set together, once.
ALTER TABLE "nisab_versions" ADD COLUMN "withdrawn_at" TIMESTAMPTZ(6);
ALTER TABLE "nisab_versions" ADD COLUMN "withdrawn_by" UUID;
ALTER TABLE "nisab_versions" ADD COLUMN "withdraw_reason" TEXT;
ALTER TABLE "nisab_versions" ADD CONSTRAINT "nisab_versions_withdrawn_by_fkey" FOREIGN KEY ("withdrawn_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;
ALTER TABLE "nisab_versions" ADD CONSTRAINT "nisab_versions_withdrawal_check" CHECK (
  ("withdrawn_at" IS NULL) = ("withdrawn_by" IS NULL)
  AND ("withdrawn_at" IS NULL) = ("withdraw_reason" IS NULL)
  AND ("withdraw_reason" IS NULL OR char_length("withdraw_reason") BETWEEN 1 AND 500)
);
CREATE INDEX "nisab_versions_withdrawn_by_idx" ON "nisab_versions"("withdrawn_by");

-- One live version per effective date: a withdrawn version frees its date for a corrected one.
DROP INDEX "nisab_versions_effective_from_key";
CREATE UNIQUE INDEX "nisab_versions_effective_from_key" ON "nisab_versions"("effective_from") WHERE (withdrawn_at IS NULL);

-- Applications store the version used at verification, so a version never changes: no delete, the
-- amount, date, note and setter stay, and the withdrawal is written once.
CREATE FUNCTION protect_nisab_version() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'nisab versions are never deleted' USING ERRCODE = 'restrict_violation';
  END IF;
  IF NEW.value IS DISTINCT FROM OLD.value
    OR NEW.effective_from IS DISTINCT FROM OLD.effective_from
    OR NEW.basis_note IS DISTINCT FROM OLD.basis_note
    OR NEW.set_by IS DISTINCT FROM OLD.set_by
    OR (OLD.withdrawn_at IS NOT NULL AND (
      NEW.withdrawn_at IS DISTINCT FROM OLD.withdrawn_at
      OR NEW.withdrawn_by IS DISTINCT FROM OLD.withdrawn_by
      OR NEW.withdraw_reason IS DISTINCT FROM OLD.withdraw_reason)) THEN
    RAISE EXCEPTION 'a nisab version never changes; only a withdrawal is added once'
      USING ERRCODE = 'restrict_violation';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER nisab_versions_protect BEFORE UPDATE OR DELETE ON "nisab_versions" FOR EACH ROW EXECUTE FUNCTION protect_nisab_version();
