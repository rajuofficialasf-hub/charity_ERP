-- Reverses 20261024110000_retire_seeded_forms (every migration ships its hand-written reverse,
-- docs/architecture/ADR/ADR-003-prisma-with-down-sql.md): the rows it retired, and only those,
-- are active again and lose its mark.
UPDATE "project_templates"
   SET "active" = true,
       "definition" = "definition" - 'retired_by',
       "updated_at" = CURRENT_TIMESTAMP
 WHERE "definition"->>'retired_by' = '20261024110000_retire_seeded_forms';
