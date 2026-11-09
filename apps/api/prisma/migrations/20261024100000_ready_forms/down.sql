-- Reverses 20261024100000_ready_forms (every migration ships its hand-written reverse,
-- docs/architecture/ADR/ADR-003-prisma-with-down-sql.md). It refuses while the database holds what
-- only this migration allows — a ready form, a placed copy, or a library with questions or a
-- published version — rather than deleting it; the empty library it created goes.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM forms WHERE project_id IS NULL AND kind <> 'library')
     OR EXISTS (SELECT 1 FROM forms WHERE source_form_id IS NOT NULL OR kind = 'other')
     OR EXISTS (
       SELECT 1 FROM form_versions v JOIN forms f ON f.id = v.form_id
       WHERE f.kind = 'library' AND (v.status <> 'draft' OR v.version_no <> 1)
     )
     OR EXISTS (
       SELECT 1 FROM form_sections s JOIN form_versions v ON v.id = s.form_version_id
       JOIN forms f ON f.id = v.form_id WHERE f.kind = 'library'
     ) THEN
    RAISE EXCEPTION 'ready_forms_down: ready forms, placed copies or library content exist; move them first';
  END IF;
END $$;

DELETE FROM "form_versions"
  WHERE form_id IN (SELECT id FROM forms WHERE kind = 'library');
DELETE FROM "forms" WHERE kind = 'library';

DROP INDEX IF EXISTS "forms_one_library_key";
DROP INDEX IF EXISTS "forms_ready_key_key";
DROP INDEX IF EXISTS "forms_source_form_id_idx";
ALTER TABLE "forms" DROP CONSTRAINT IF EXISTS "forms_source_form_id_fkey";
ALTER TABLE "forms" DROP CONSTRAINT IF EXISTS "forms_source_check";
ALTER TABLE "forms" DROP CONSTRAINT IF EXISTS "forms_library_check";
ALTER TABLE "forms" DROP CONSTRAINT IF EXISTS "forms_kind_check";
ALTER TABLE "forms" DROP COLUMN IF EXISTS "source_version_no";
ALTER TABLE "forms" DROP COLUMN IF EXISTS "source_form_id";
ALTER TABLE "forms" DROP COLUMN IF EXISTS "kind";
ALTER TABLE "forms" ALTER COLUMN "project_id" SET NOT NULL;
