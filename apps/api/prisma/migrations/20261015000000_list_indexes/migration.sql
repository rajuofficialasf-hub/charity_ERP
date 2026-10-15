-- Indexes of the volunteer and beneficiary tabs, measured on 50,000 volunteers and 2,000,000
-- beneficiaries (docs/testing/PERFORMANCE.md, section "What the measurement changed"). A plain CREATE INDEX
-- blocks writes to its table while it builds; at deployment these tables are small (no legacy data
-- is migrated), so the build takes moments. On a large live table, build such an index in a
-- maintenance window or with CREATE INDEX CONCURRENTLY outside the migration transaction.
-- The name search of the volunteer tab reads users.display_name with ILIKE '%term%'.
CREATE INDEX users_display_name_trgm_idx ON users USING gin (display_name gin_trgm_ops);
-- The live (not merged) beneficiaries by id: the counts of the tab and the "assisted this year"
-- semi join read this index alone instead of the 2,000,000-row table.
CREATE INDEX beneficiaries_live_id_idx ON beneficiaries (id) WHERE merged_into_id IS NULL;
-- The applications by status and project with their beneficiary: the "assisted this year" count
-- reads this index alone (an approved status, the projects of the year, the beneficiary ids).
CREATE INDEX applications_status_project_id_beneficiary_id_idx
  ON applications (status, project_id, beneficiary_id) WHERE beneficiary_id IS NOT NULL;
-- The blocked beneficiaries (a few in a thousand): the blocked count and the blocklist filter.
CREATE INDEX beneficiaries_blocked_idx ON beneficiaries (id) WHERE is_blocked AND merged_into_id IS NULL;
