-- Reverses 20261021140000_form_version_rules (every migration ships its hand-written reverse,
-- docs/architecture/ADR/ADR-003-prisma-with-down-sql.md). The rows stay as they are; only the
-- guard and the one-draft index go.
DROP TRIGGER IF EXISTS form_versions_status_guard ON "form_versions";
DROP FUNCTION IF EXISTS guard_form_version_status();
DROP INDEX IF EXISTS "form_versions_one_draft_key";
