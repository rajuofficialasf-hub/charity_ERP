-- A cancelled session no longer holds its year (docs/DECISION_LOG.md, "A cancelled session no
-- longer holds its year"; docs/database/DATABASE_SCHEMA.md, "projects"). The two unique indexes
-- that give a series one session per start year leave the cancelled sessions out: a session is
-- cancelled only from a draft and never comes back, so it holds no application, and the year it
-- was opened for may be started again. A plain index keeps the reads of every session of a
-- series, cancelled ones too, on an index.
DROP INDEX "projects_series_id_year_key";
DROP INDEX "projects_code_year_key";
CREATE UNIQUE INDEX "projects_code_year_key" ON "projects"("code", "year") WHERE (status <> 'cancelled');
CREATE UNIQUE INDEX "projects_series_id_year_key" ON "projects"("series_id", "year") WHERE (status <> 'cancelled');
CREATE INDEX "projects_series_id_year_idx" ON "projects"("series_id", "year");
