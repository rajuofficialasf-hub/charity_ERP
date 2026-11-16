-- Reverses 20261116120000_project_series (every migration ships its hand-written reverse,
-- docs/architecture/ADR/ADR-003-prisma-with-down-sql.md). The sessions stay as the projects they
-- were before, each with its program, code, year and names. Lost with the series: its own names
-- and description where they differ from a session's, and a program's description.
--
-- A project code was unique across all projects before. While two sessions share a code (any
-- second session of a series), the reverse stops here and changes nothing. Cancelling the later
-- session is not enough, because a cancelled session keeps its row and its code: each later
-- session must first be given a code of its own, which is the owner's decision.
DO $$
DECLARE
  shared TEXT;
BEGIN
  SELECT string_agg("code", ', ' ORDER BY "code") INTO shared
    FROM (SELECT "code" FROM "projects" GROUP BY "code" HAVING count(*) > 1) AS repeated;
  IF shared IS NOT NULL THEN
    RAISE EXCEPTION 'project_series_in_use: more than one session carries the code %', shared
      USING ERRCODE = '23505';
  END IF;
END $$;

DROP INDEX "projects_series_id_year_key";
DROP INDEX "projects_code_year_key";
CREATE UNIQUE INDEX "projects_code_key" ON "projects"("code");

ALTER TABLE "projects" DROP CONSTRAINT "projects_period_year_check";
ALTER TABLE "projects" DROP CONSTRAINT "projects_period_check";
ALTER TABLE "projects" DROP CONSTRAINT "projects_series_id_program_id_fkey";
ALTER TABLE "projects"
  DROP COLUMN "period_to",
  DROP COLUMN "period_from",
  DROP COLUMN "series_id";

ALTER TABLE "programs"
  DROP COLUMN "description_en",
  DROP COLUMN "description_bn";

DROP TABLE "project_series";
