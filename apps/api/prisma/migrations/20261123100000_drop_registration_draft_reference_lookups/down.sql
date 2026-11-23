-- Reverses 20261123100000_drop_registration_draft_reference_lookups (every migration ships its
-- hand-written reverse, docs/architecture/ADR/ADR-003-prisma-with-down-sql.md). The column comes
-- back as it was, every draft at 0, with its check of 0 to 5.
ALTER TABLE "registration_drafts" ADD COLUMN IF NOT EXISTS "reference_lookups" SMALLINT NOT NULL DEFAULT 0;
ALTER TABLE "registration_drafts" ADD CONSTRAINT "registration_drafts_reference_lookups_check" CHECK ("reference_lookups" BETWEEN 0 AND 5);
