-- Reverses 20261021160000_application_public_flags (every migration ships its hand-written
-- reverse, docs/architecture/ADR/ADR-003-prisma-with-down-sql.md). The two newer flags are
-- removed from the rows that carry them before the narrower check returns; the rows themselves
-- stay.
UPDATE "applications"
SET flags = array_remove(array_remove(flags, 'identity_blocked'), 'identity_repeated')
WHERE flags && ARRAY['identity_blocked', 'identity_repeated']::text[];
ALTER TABLE "applications" DROP CONSTRAINT "applications_flags_check";
ALTER TABLE "applications"
  ADD CONSTRAINT "applications_flags_check"
  CHECK (flags <@ ARRAY['existing_identity', 'late_sync', 'stale_form_version', 'public_entry']::text[]);
