-- The answers of an application's review checklist (docs/database/DATABASE_SCHEMA.md,
-- "application_review_checks"): one row per item an official answered, "ok" or "problem" with a
-- comment, and who answered last and when. A later answer of the same item replaces the row's
-- values, and the audit log keeps every answer, so no row is ever deleted.
CREATE TABLE "application_review_checks" (
    "id" UUID NOT NULL,
    "application_id" UUID NOT NULL,
    "item_code" TEXT NOT NULL,
    "result" TEXT NOT NULL,
    "comment" TEXT,
    "checked_by" UUID NOT NULL,
    "checked_at" TIMESTAMPTZ(6) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_by" UUID,
    CONSTRAINT "application_review_checks_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "application_review_checks_item_code_check" CHECK ("item_code" ~ '^[a-z0-9_]{1,64}$'),
    CONSTRAINT "application_review_checks_result_check" CHECK ("result" IN ('ok', 'problem')),
    CONSTRAINT "application_review_checks_comment_check" CHECK (
      ("comment" IS NULL OR char_length("comment") <= 500)
      AND ("result" = 'ok' OR char_length(btrim(coalesce("comment", ''))) > 0)
    )
);
CREATE UNIQUE INDEX "application_review_checks_application_id_item_code_key" ON "application_review_checks"("application_id", "item_code");
CREATE INDEX "application_review_checks_checked_by_idx" ON "application_review_checks"("checked_by");
CREATE INDEX "application_review_checks_created_by_idx" ON "application_review_checks"("created_by");
CREATE INDEX "application_review_checks_updated_by_idx" ON "application_review_checks"("updated_by");
ALTER TABLE "application_review_checks" ADD CONSTRAINT "application_review_checks_application_id_fkey" FOREIGN KEY ("application_id") REFERENCES "applications"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;
ALTER TABLE "application_review_checks" ADD CONSTRAINT "application_review_checks_checked_by_fkey" FOREIGN KEY ("checked_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;
ALTER TABLE "application_review_checks" ADD CONSTRAINT "application_review_checks_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;
ALTER TABLE "application_review_checks" ADD CONSTRAINT "application_review_checks_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;
CREATE TRIGGER application_review_checks_set_updated_at BEFORE UPDATE ON "application_review_checks" FOR EACH ROW EXECUTE FUNCTION set_updated_at();
