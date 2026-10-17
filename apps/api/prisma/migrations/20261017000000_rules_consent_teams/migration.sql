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

-- A consent row is about its own assignment or membership: the project and the volunteer must be
-- those of the linked row (the member, for a team), and the version one the project has saved. An
-- append-only row can never be corrected, so a wrong one is refused at the door.
CREATE FUNCTION check_project_consent() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  -- no link or two links: the one-link CHECK answers
  IF (NEW.project_volunteer_id IS NULL) = (NEW.volunteer_team_id IS NULL) THEN
    RETURN NEW;
  END IF;
  IF NEW.project_volunteer_id IS NOT NULL THEN
    PERFORM 1 FROM project_volunteers
      WHERE id = NEW.project_volunteer_id AND project_id = NEW.project_id AND volunteer_id = NEW.volunteer_id;
  ELSE
    PERFORM 1 FROM volunteer_teams
      WHERE id = NEW.volunteer_team_id AND project_id = NEW.project_id AND member_volunteer_id = NEW.volunteer_id;
  END IF;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'project_consent_link: the consent does not match its assignment or membership' USING ERRCODE = '23503';
  END IF;
  PERFORM 1 FROM project_rules_versions WHERE project_id = NEW.project_id AND version = NEW.rules_version;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'project_consent_version: rules version % of the project does not exist', NEW.rules_version USING ERRCODE = '23503';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER project_consents_link BEFORE INSERT ON "project_consents" FOR EACH ROW EXECUTE FUNCTION check_project_consent();

-- Both are logs: no row changes or disappears (D-060).
CREATE TRIGGER project_rules_versions_append_only BEFORE UPDATE OR DELETE ON "project_rules_versions" FOR EACH ROW EXECUTE FUNCTION forbid_log_change();
CREATE TRIGGER project_consents_append_only BEFORE UPDATE OR DELETE ON "project_consents" FOR EACH ROW EXECUTE FUNCTION forbid_log_change();
CREATE TRIGGER project_rules_versions_no_truncate BEFORE TRUNCATE ON "project_rules_versions" FOR EACH STATEMENT EXECUTE FUNCTION forbid_log_change();
CREATE TRIGGER project_consents_no_truncate BEFORE TRUNCATE ON "project_consents" FOR EACH STATEMENT EXECUTE FUNCTION forbid_log_change();
