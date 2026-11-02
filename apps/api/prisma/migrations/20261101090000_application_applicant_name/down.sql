-- Reverses 20261101090000_application_applicant_name (every migration ships its hand-written
-- reverse, docs/architecture/ADR/ADR-003-prisma-with-down-sql.md). The typed name stays in the
-- application's answers; only the copy the lists read goes.
ALTER TABLE "applications" DROP COLUMN IF EXISTS "applicant_name";
