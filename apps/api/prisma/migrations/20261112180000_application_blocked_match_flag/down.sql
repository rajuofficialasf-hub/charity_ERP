-- Reverses 20261112180000_application_blocked_match_flag (every migration ships its hand-written
-- reverse, docs/architecture/ADR/ADR-003-prisma-with-down-sql.md). The flag is removed from the
-- rows that carry it before the narrower check returns; the rows themselves stay, still waiting
-- for verification with their candidate profile.
UPDATE "applications"
SET flags = array_remove(flags, 'blocked_name_match')
WHERE flags && ARRAY['blocked_name_match']::text[];
ALTER TABLE "applications" DROP CONSTRAINT "applications_flags_check";
ALTER TABLE "applications"
  ADD CONSTRAINT "applications_flags_check"
  CHECK (flags <@ ARRAY['existing_identity', 'late_sync', 'stale_form_version', 'public_entry', 'identity_blocked', 'identity_repeated']::text[]);
