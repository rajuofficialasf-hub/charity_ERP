-- Reverses 20261116130000_cancelled_session_year (every migration ships its hand-written
-- reverse, docs/architecture/ADR/ADR-003-prisma-with-down-sql.md): the two unique indexes count
-- every session again, cancelled ones included.
--
-- While a cancelled session shares its year with another session of its series, the full
-- uniques cannot hold, and the reverse stops here and changes nothing. No row is removed to make
-- room: which of the sessions keeps the year is the owner's decision.
DO $$
DECLARE
  shared TEXT;
BEGIN
  SELECT string_agg(format('%s %s', "code", "year"), ', ' ORDER BY "code", "year") INTO shared
    FROM (
      SELECT "code", "year" FROM "projects" GROUP BY "code", "year" HAVING count(*) > 1
      UNION
      SELECT min("code"), "year" FROM "projects" GROUP BY "series_id", "year" HAVING count(*) > 1
    ) AS repeated;
  IF shared IS NOT NULL THEN
    RAISE EXCEPTION 'cancelled_session_year_in_use: a cancelled session shares its year with another session of its project: %', shared
      USING ERRCODE = '23505';
  END IF;
END $$;

DROP INDEX "projects_series_id_year_idx";
DROP INDEX "projects_series_id_year_key";
DROP INDEX "projects_code_year_key";
CREATE UNIQUE INDEX "projects_code_year_key" ON "projects"("code", "year");
CREATE UNIQUE INDEX "projects_series_id_year_key" ON "projects"("series_id", "year");
