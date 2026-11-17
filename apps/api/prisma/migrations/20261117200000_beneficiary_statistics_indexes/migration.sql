-- The beneficiary statistics under the 300 ms of docs/NON_FUNCTIONAL_REQUIREMENTS.md on two million
-- profiles (docs/testing/PERFORMANCE.md, "The beneficiary statistics"): the total, the blocked and
-- the two genders are counted in one pass over a small index of the live profiles instead of the
-- table, and the people helped this year are found through the applications of the year's
-- projects read from an index that holds what the count needs, without the table.
CREATE INDEX "beneficiaries_live_block_gender_idx" ON "beneficiaries" ("is_blocked", "gender_code") WHERE merged_into_id IS NULL;
CREATE INDEX "applications_project_help_idx" ON "applications" ("project_id", "status", "beneficiary_id", "approved_at", "outcome");
