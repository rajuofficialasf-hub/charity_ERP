-- Indexes of the volunteer and beneficiary tabs (DECISION_LOG O-67; measured on the data set of
-- docs/testing/PERFORMANCE.md: 50,000 volunteers and 2,000,000 beneficiaries).
-- The name search of the volunteer tab reads users.display_name with ILIKE '%term%'.
CREATE INDEX users_display_name_trgm_idx ON users USING gin (display_name gin_trgm_ops);
-- The live (not merged) beneficiaries by id: the counts of the tab and the "assisted this year"
-- semi join read this index alone instead of the 2,000,000-row table.
CREATE INDEX beneficiaries_live_id_idx ON beneficiaries (id) WHERE merged_into_id IS NULL;
-- The blocked beneficiaries (a few in a thousand): the blocked count and the blocklist filter.
CREATE INDEX beneficiaries_blocked_idx ON beneficiaries (id) WHERE is_blocked AND merged_into_id IS NULL;
