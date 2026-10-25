-- The field unlock of an approved application (docs/plans/2026-10-25-1156-feat-application-rules-plan.md):
-- a field_changes row of kind 'unlock' moves open -> updated -> relocked. It records who opened the
-- answer (requested_by, with the reason), who entered the new value and when, and who decided and
-- when, with the decision (accepted, refused or cancelled) and its reason. One unlock per answer
-- waits at a time, and the status-log trigger lets exactly these steps change the row.
ALTER TABLE "field_changes" ADD COLUMN "entered_by" UUID;
ALTER TABLE "field_changes" ADD COLUMN "entered_at" TIMESTAMPTZ(6);
ALTER TABLE "field_changes" ADD COLUMN "decided_by" UUID;
ALTER TABLE "field_changes" ADD COLUMN "decided_at" TIMESTAMPTZ(6);
ALTER TABLE "field_changes" ADD COLUMN "decision" TEXT;
ALTER TABLE "field_changes" ADD COLUMN "decision_reason" TEXT;

ALTER TABLE "field_changes" ADD CONSTRAINT "field_changes_entered_by_fkey"
  FOREIGN KEY ("entered_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;
ALTER TABLE "field_changes" ADD CONSTRAINT "field_changes_decided_by_fkey"
  FOREIGN KEY ("decided_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;
ALTER TABLE "field_changes" ADD CONSTRAINT "field_changes_decision_check"
  CHECK ("decision" IS NULL OR "decision" IN ('accepted', 'refused', 'cancelled'));

CREATE INDEX "field_changes_entered_by_idx" ON "field_changes"("entered_by");
CREATE INDEX "field_changes_decided_by_idx" ON "field_changes"("decided_by");
-- one unlock per answer waits at a time: open, or entered and waiting for its decision
CREATE UNIQUE INDEX "field_changes_open_unlock_key" ON "field_changes"("entity_id", "field")
  WHERE kind = 'unlock' AND decided_at IS NULL;

DROP TRIGGER "field_changes_status_log" ON "field_changes";
CREATE TRIGGER field_changes_status_log BEFORE UPDATE OR DELETE ON "field_changes" FOR EACH ROW
  EXECUTE FUNCTION guard_status_log('unlock_state', 'new_value', 'approved_by', 'entered_by',
    'entered_at', 'decided_by', 'decided_at', 'decision', 'decision_reason');
