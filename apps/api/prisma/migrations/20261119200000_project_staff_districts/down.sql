-- Reverses 20261119200000_project_staff_districts (every migration ships its hand-written
-- reverse, docs/architecture/ADR/ADR-003-prisma-with-down-sql.md). The districts go with their
-- table, so every staff place holds its whole area again; the audit log still holds each change.
DROP TABLE IF EXISTS "project_staff_districts";
