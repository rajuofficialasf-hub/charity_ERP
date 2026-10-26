-- Reverses 20261025160000_field_unlock (every migration ships its hand-written reverse,
-- docs/architecture/ADR/ADR-003-prisma-with-down-sql.md). It refuses while an unlock waits, since
-- its steps would be lost halfway; the decided unlocks keep their old and new value and the reason
-- that opened them, and lose who entered, who decided and why.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM "field_changes" WHERE kind = 'unlock' AND decided_at IS NULL) THEN
    RAISE EXCEPTION 'field_unlock down: an unlock is still open; decide or cancel it first';
  END IF;
END $$;

DROP TRIGGER "field_changes_status_log" ON "field_changes";
CREATE TRIGGER field_changes_status_log BEFORE UPDATE OR DELETE ON "field_changes" FOR EACH ROW
  EXECUTE FUNCTION guard_status_log('unlock_state', 'new_value', 'approved_by');

DROP INDEX IF EXISTS "field_changes_open_unlock_key";
DROP INDEX IF EXISTS "field_changes_decided_by_idx";
DROP INDEX IF EXISTS "field_changes_entered_by_idx";
ALTER TABLE "field_changes" DROP COLUMN IF EXISTS "decision_reason";
ALTER TABLE "field_changes" DROP COLUMN IF EXISTS "decision";
ALTER TABLE "field_changes" DROP COLUMN IF EXISTS "decided_at";
ALTER TABLE "field_changes" DROP COLUMN IF EXISTS "decided_by";
ALTER TABLE "field_changes" DROP COLUMN IF EXISTS "entered_at";
ALTER TABLE "field_changes" DROP COLUMN IF EXISTS "entered_by";
