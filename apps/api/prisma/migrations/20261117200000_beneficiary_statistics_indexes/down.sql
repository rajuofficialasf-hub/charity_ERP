-- Reverses 20261117200000_beneficiary_statistics_indexes: the two indexes go; the statistics read
-- the table again.
DROP INDEX IF EXISTS "applications_project_help_idx";
DROP INDEX IF EXISTS "beneficiaries_live_block_gender_idx";
