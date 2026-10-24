-- Reverses 20261024110000_retire_seeded_forms (every migration ships its hand-written reverse,
-- docs/architecture/ADR/ADR-003-prisma-with-down-sql.md): the two seeded form templates are
-- active again. Nothing else changed.
UPDATE "project_templates"
   SET "active" = true, "updated_at" = CURRENT_TIMESTAMP
 WHERE "definition"->>'kind' = 'form_template'
   AND "key" IN ('form_distribution', 'form_self_reliance_construction')
   AND NOT "active";
