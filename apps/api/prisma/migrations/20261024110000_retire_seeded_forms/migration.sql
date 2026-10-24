-- Data only: the schema does not change.
-- The seeded form templates are retired: the Monitoring Team builds every form and the question
-- library itself, and nothing is pre-placed. The two templates stay in the table, inactive, so a
-- project form built from them keeps its questions; the seeded library tables are no longer read
-- and keep their rows.
UPDATE "project_templates"
   SET "active" = false, "updated_at" = CURRENT_TIMESTAMP
 WHERE "definition"->>'kind' = 'form_template'
   AND "key" IN ('form_distribution', 'form_self_reliance_construction')
   AND "active";
