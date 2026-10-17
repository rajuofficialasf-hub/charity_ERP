-- Reverses 20261017000000_rules_consent_teams (docs/architecture/ADR/ADR-003-prisma-with-down-sql.md;
-- DECISION_LOG D-096). The rules history and the consent log go with their tables; the current rules
-- texts stay in projects.rules and the consent state of assignments in project_volunteers. The
-- audit log still records every rules change and consent.

DROP TABLE IF EXISTS "project_consents";
DROP TABLE IF EXISTS "project_rules_versions";

ALTER TABLE "project_volunteers" DROP CONSTRAINT "project_volunteers_applications_counted_check";
ALTER TABLE "project_volunteers" DROP COLUMN "applications_counted";

ALTER TABLE "volunteer_teams" DROP CONSTRAINT "volunteer_teams_consent_status_check";
ALTER TABLE "volunteer_teams" DROP COLUMN "consent_at";
ALTER TABLE "volunteer_teams" DROP COLUMN "consent_status";

ALTER TABLE "project_templates" DROP CONSTRAINT "project_templates_description_check";
ALTER TABLE "project_templates" DROP COLUMN "description";

ALTER TABLE "projects" DROP CONSTRAINT "projects_rules_version_check";
ALTER TABLE "projects" DROP COLUMN "rules_version";
