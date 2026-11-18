-- Reverses 20261118160000_application_review_checks (every migration ships its hand-written
-- reverse, docs/architecture/ADR/ADR-003-prisma-with-down-sql.md). The checklist answers go with
-- their table; the audit log still holds every answer an official gave.
DROP TABLE IF EXISTS "application_review_checks";
