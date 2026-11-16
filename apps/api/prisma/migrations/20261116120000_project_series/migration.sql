-- Programs, permanent projects and yearly sessions (docs/DECISION_LOG.md, "Programs and projects
-- in one tab, with permanent projects and yearly sessions"; docs/database/DATABASE_SCHEMA.md,
-- "Programs and projects"). A project runs again every year: the permanent project is a row of
-- "project_series", and what "projects" holds is one session of it, with everything it held
-- before plus the months it runs. Every project that exists becomes the one session of its own
-- new series.

-- The permanent project: the program it sits in, the code every session carries (the prefix of
-- the application numbers) and its names. The pair (id, program_id) is unique so that a session
-- can point at its series and its program together.
CREATE TABLE "project_series" (
    "id" UUID NOT NULL,
    "program_id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name_bn" TEXT NOT NULL,
    "name_en" TEXT NOT NULL,
    "description_bn" TEXT,
    "description_en" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_by" UUID,

    CONSTRAINT "project_series_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "project_series_code_format" CHECK ("code" ~ '^[A-Z]{2,8}$')
);
CREATE UNIQUE INDEX "project_series_code_key" ON "project_series"("code");
CREATE UNIQUE INDEX "project_series_id_program_id_key" ON "project_series"("id", "program_id");
CREATE INDEX "project_series_program_id_idx" ON "project_series"("program_id");
CREATE INDEX "project_series_created_by_idx" ON "project_series"("created_by");
CREATE INDEX "project_series_updated_by_idx" ON "project_series"("updated_by");
ALTER TABLE "project_series" ADD CONSTRAINT "project_series_program_id_fkey" FOREIGN KEY ("program_id") REFERENCES "programs"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;
ALTER TABLE "project_series" ADD CONSTRAINT "project_series_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;
ALTER TABLE "project_series" ADD CONSTRAINT "project_series_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;
CREATE TRIGGER project_series_set_updated_at BEFORE UPDATE ON "project_series" FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- A program's short description in both languages, shown on its card.
ALTER TABLE "programs"
  ADD COLUMN "description_bn" TEXT,
  ADD COLUMN "description_en" TEXT;

-- A session names its series and the days it runs: the first day of its start month to the last
-- day of its end month. Empty until the rows that exist are filled below.
ALTER TABLE "projects"
  ADD COLUMN "series_id" UUID,
  ADD COLUMN "period_from" DATE,
  ADD COLUMN "period_to" DATE;

-- Every existing project becomes the one session of its own series. The series takes the
-- project's own id (the two tables number their rows apart, and the id keeps the time the work
-- began), its program, code and names, and its audit columns, since the series is as old as its
-- first session. The session runs January to December of its year. Becoming a session is not an
-- edit of the project, so its update stamp stays as it was.
INSERT INTO "project_series" ("id", "program_id", "code", "name_bn", "name_en", "created_at", "created_by", "updated_at", "updated_by")
  SELECT "id", "program_id", "code", "name_bn", "name_en", "created_at", "created_by", "updated_at", "updated_by" FROM "projects";
ALTER TABLE "projects" DISABLE TRIGGER "projects_set_updated_at";
UPDATE "projects" SET
  "series_id" = "id",
  "period_from" = make_date("year"::int, 1, 1),
  "period_to" = make_date("year"::int, 12, 31);
ALTER TABLE "projects" ENABLE TRIGGER "projects_set_updated_at";

ALTER TABLE "projects"
  ALTER COLUMN "series_id" SET NOT NULL,
  ALTER COLUMN "period_from" SET NOT NULL,
  ALTER COLUMN "period_to" SET NOT NULL;

-- A session sits in the program of its series: the pair is one foreign key, so no session can be
-- moved to another program than its series holds.
ALTER TABLE "projects" ADD CONSTRAINT "projects_series_id_program_id_fkey" FOREIGN KEY ("series_id", "program_id") REFERENCES "project_series"("id", "program_id") ON DELETE RESTRICT ON UPDATE NO ACTION;
-- The end is never before the start, and a session covers at most 24 months.
ALTER TABLE "projects" ADD CONSTRAINT "projects_period_check" CHECK ("period_to" >= "period_from" AND "period_to" < ("period_from" + INTERVAL '24 months'));
-- The year of a session, which numbers its applications, is the year it starts in.
ALTER TABLE "projects" ADD CONSTRAINT "projects_period_year_check" CHECK ("year" = EXTRACT(YEAR FROM "period_from"));

-- The code now belongs to the series and is shared by its sessions, one per start year. The
-- unique on (code, year) is the database's own guard that an application number, code-year-number,
-- names one session only, whatever the series rows say. The unique on (series_id, year) also
-- serves every read of a series' sessions, so the column needs no index of its own.
DROP INDEX "projects_code_key";
CREATE UNIQUE INDEX "projects_code_year_key" ON "projects"("code", "year");
CREATE UNIQUE INDEX "projects_series_id_year_key" ON "projects"("series_id", "year");
