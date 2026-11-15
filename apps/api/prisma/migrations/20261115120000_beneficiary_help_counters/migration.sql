-- The times each person was helped, kept on the profile (docs/database/DATABASE_SCHEMA.md,
-- "beneficiaries"): the beneficiary list shows, filters and orders two million people by them, so
-- they cannot be counted per request. The rule of what counts is the one of the profile's help
-- summary (`countsAsHelped` of `@css/shared`, read in SQL by `helpedSql` of
-- apps/api/src/services/help-history.ts); the application moves, the merges and the nightly
-- recount (apps/api/src/jobs/help-counters.ts) keep them current, and the profile's own summary is
-- always counted live, never read from here.

-- `help_count`: every counted application of the person, those a merge left on a profile retired
-- into them included. `max_helps_in_year`: the most of them in one project year, so "more than
-- once in a year" is `max_helps_in_year > 1`. A constant default adds the columns without
-- rewriting the table.
ALTER TABLE "beneficiaries"
  ADD COLUMN "help_count" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "max_helps_in_year" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "beneficiaries" ADD CONSTRAINT "beneficiaries_help_counts_check"
  CHECK ("help_count" >= 0 AND "max_helps_in_year" >= 0 AND "max_helps_in_year" <= "help_count");

-- A write of the counters alone is no edit of the person: the row's update stamp, which is also the
-- profile's version for If-Match, stays as it was, so a recount neither moves "last changed" nor
-- makes an official's open edit stale. The recount marks its statement with
-- css.help_counts_only = on (`writeHelpCounts` of apps/api/src/services/help-history.ts sets it
-- around its one UPDATE and clears it after), as the key job marks its transaction with
-- css.match_keys_only (20261114120000_beneficiary_name_keys), whose rule is kept. Every other
-- update stamps the row as before.
CREATE FUNCTION beneficiaries_set_updated_at() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF current_setting('css.match_keys_only', true) = 'on'
     OR current_setting('css.help_counts_only', true) = 'on' THEN
    NEW.updated_at := OLD.updated_at;
  ELSE
    NEW.updated_at := now();
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER "beneficiaries_set_updated_at" ON "beneficiaries";
CREATE TRIGGER beneficiaries_set_updated_at BEFORE UPDATE ON "beneficiaries" FOR EACH ROW EXECUTE FUNCTION beneficiaries_set_updated_at();

-- The counters of everyone from what is on file now, by the same rule and the same set of
-- applications as the profile: the person's own, and the ones each live merge left on its retired
-- profile, which count for the kept profile and for every profile that one was later retired into.
-- A retired profile keeps the count of what still sits on it (the list never shows it). The states
-- and outcomes are those of `HELPED_STATES`, `HELPED_IF_DELIVERED_STATES` and
-- `NOT_DELIVERED_OUTCOMES` (a test compares them with this file). The mark is set for the session
-- and cleared right after, whether or not the migration runs inside a transaction.
SELECT set_config('css.help_counts_only', 'on', false);
WITH RECURSIVE left_behind(person_id, application_id) AS (
  SELECT m.kept_id, x.id::uuid
  FROM profile_merges m,
    jsonb_array_elements_text(
      CASE WHEN jsonb_typeof(m.snapshot -> 'leftBehind') = 'array'
           THEN m.snapshot -> 'leftBehind' ELSE '[]'::jsonb END) AS x(id)
  WHERE m.status = 'merged'
  UNION
  SELECT b.merged_into_id, l.application_id
  FROM left_behind l JOIN beneficiaries b ON b.id = l.person_id
  WHERE b.merged_into_id IS NOT NULL
),
person_applications(person_id, application_id) AS (
  SELECT a.beneficiary_id, a.id FROM applications a WHERE a.beneficiary_id IS NOT NULL
  UNION
  SELECT person_id, application_id FROM left_behind
),
by_year AS (
  SELECT pa.person_id, p.year, count(*)::int AS n
  FROM person_applications pa
    JOIN applications a ON a.id = pa.application_id
    JOIN projects p ON p.id = a.project_id
  WHERE a.status IN ('approved', 'implementation', 'completed')
     OR (a.status IN ('closed')
         AND a.approved_at IS NOT NULL
         AND (a.outcome IS NULL
              OR a.outcome NOT IN ('not_distributed', 'not_built', 'not_installed', 'not_supported')))
  GROUP BY pa.person_id, p.year
),
counted AS (
  SELECT person_id, sum(n)::int AS help_count, max(n)::int AS max_helps_in_year
  FROM by_year GROUP BY person_id
)
UPDATE "beneficiaries" b
SET help_count = c.help_count, max_helps_in_year = c.max_helps_in_year
FROM counted c
WHERE b.id = c.person_id;
SELECT set_config('css.help_counts_only', 'off', false);

-- The list ordered by the times helped (either way, newest first among equals: the index is read
-- backwards for the descending order), and the people helped more than once in a year, both among
-- the live profiles the list shows.
CREATE INDEX "beneficiaries_help_count_idx" ON "beneficiaries"("help_count", "id") WHERE (merged_into_id IS NULL);
CREATE INDEX "beneficiaries_helped_repeat_idx" ON "beneficiaries"("id") WHERE (max_helps_in_year > 1 AND merged_into_id IS NULL);
