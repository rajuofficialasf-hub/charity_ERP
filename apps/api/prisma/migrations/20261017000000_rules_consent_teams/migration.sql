-- Rules versions, the consent log, team members' own consent, the application counter and the
-- template description (plan docs/plans/2026-10-17-0905-feat-templates-consent-assignment-plan.md,
-- unit U1; DECISION_LOG D-096; BR-039, BR-040, BR-059, BR-064). Additive: two new tables and five
-- new columns; nothing is rewritten.

-- The rules version a volunteer accepts; 0 while the project has no saved rules (BR-039).
ALTER TABLE "projects" ADD COLUMN "rules_version" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "projects" ADD CONSTRAINT "projects_rules_version_check" CHECK ("rules_version" >= 0);

-- A short description shown in the template library.
ALTER TABLE "project_templates" ADD COLUMN "description" TEXT;
ALTER TABLE "project_templates" ADD CONSTRAINT "project_templates_description_check"
  CHECK (char_length("description") <= 2000);

-- A team member accepts the project's rules on their own (DECISION_LOG D-096).
ALTER TABLE "volunteer_teams" ADD COLUMN "consent_status" TEXT NOT NULL DEFAULT 'pending';
ALTER TABLE "volunteer_teams" ADD COLUMN "consent_at" TIMESTAMPTZ(6);
ALTER TABLE "volunteer_teams" ADD CONSTRAINT "volunteer_teams_consent_status_check"
  CHECK ("consent_status" IN ('pending', 'accepted', 'rejected'));

-- The applications counted against the volunteer's limit on this project, the team's included
-- (BR-059); Phase 2 raises it in the transaction that creates an application.
ALTER TABLE "project_volunteers" ADD COLUMN "applications_counted" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "project_volunteers" ADD CONSTRAINT "project_volunteers_applications_counted_check"
  CHECK ("applications_counted" >= 0);

-- Every saved version of a project's rules texts, kept for good (append-only).
CREATE TABLE "project_rules_versions" (
    "id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "version" INTEGER NOT NULL,
    "texts" JSONB NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID NOT NULL,

    CONSTRAINT "project_rules_versions_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "project_rules_versions_version_check" CHECK ("version" >= 1)
);
CREATE UNIQUE INDEX "project_rules_versions_project_id_version_key" ON "project_rules_versions"("project_id", "version");
CREATE INDEX "project_rules_versions_created_by_idx" ON "project_rules_versions"("created_by");
ALTER TABLE "project_rules_versions" ADD CONSTRAINT "project_rules_versions_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;
ALTER TABLE "project_rules_versions" ADD CONSTRAINT "project_rules_versions_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- Who accepted or refused which rules version when, through an assignment or a team membership
-- (append-only).
CREATE TABLE "project_consents" (
    "id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "volunteer_id" UUID NOT NULL,
    "project_volunteer_id" UUID,
    "volunteer_team_id" UUID,
    "rules_version" INTEGER NOT NULL,
    "decision" TEXT NOT NULL,
    "parts" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID NOT NULL,

    CONSTRAINT "project_consents_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "project_consents_decision_check" CHECK ("decision" IN ('accepted', 'refused')),
    CONSTRAINT "project_consents_rules_version_check" CHECK ("rules_version" >= 1),
    CONSTRAINT "project_consents_one_link_check"
      CHECK (("project_volunteer_id" IS NULL) <> ("volunteer_team_id" IS NULL)),
    CONSTRAINT "project_consents_parts_check" CHECK ("parts" <@ ARRAY['volunteer_duties', 'implementation_process', 'daee_duties', 'misconduct']::TEXT[])
);
CREATE INDEX "project_consents_project_id_volunteer_id_idx" ON "project_consents"("project_id", "volunteer_id");
CREATE INDEX "project_consents_volunteer_id_idx" ON "project_consents"("volunteer_id");
CREATE INDEX "project_consents_project_volunteer_id_idx" ON "project_consents"("project_volunteer_id");
CREATE INDEX "project_consents_volunteer_team_id_idx" ON "project_consents"("volunteer_team_id");
CREATE INDEX "project_consents_created_by_idx" ON "project_consents"("created_by");
ALTER TABLE "project_consents" ADD CONSTRAINT "project_consents_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;
ALTER TABLE "project_consents" ADD CONSTRAINT "project_consents_volunteer_id_fkey" FOREIGN KEY ("volunteer_id") REFERENCES "volunteers"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;
ALTER TABLE "project_consents" ADD CONSTRAINT "project_consents_project_volunteer_id_fkey" FOREIGN KEY ("project_volunteer_id") REFERENCES "project_volunteers"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;
ALTER TABLE "project_consents" ADD CONSTRAINT "project_consents_volunteer_team_id_fkey" FOREIGN KEY ("volunteer_team_id") REFERENCES "volunteer_teams"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;
ALTER TABLE "project_consents" ADD CONSTRAINT "project_consents_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- Both are logs: no row changes or disappears (D-060).
CREATE TRIGGER project_rules_versions_append_only BEFORE UPDATE OR DELETE ON "project_rules_versions" FOR EACH ROW EXECUTE FUNCTION forbid_log_change();
CREATE TRIGGER project_consents_append_only BEFORE UPDATE OR DELETE ON "project_consents" FOR EACH ROW EXECUTE FUNCTION forbid_log_change();
