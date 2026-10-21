-- A public entry carries, for the official who verifies it, whether the live profile holding its
-- number is blocked and whether the same number or mobile came through the link within a day
-- (docs/plans/2026-10-21-1135-feat-form-engine-plan.md, "The public link"). The flag list of the
-- needs-verification reasons grows by those two; the existing names stay.
ALTER TABLE "applications" DROP CONSTRAINT "applications_flags_check";
ALTER TABLE "applications"
  ADD CONSTRAINT "applications_flags_check"
  CHECK (flags <@ ARRAY['existing_identity', 'late_sync', 'stale_form_version', 'public_entry', 'identity_blocked', 'identity_repeated']::text[]);
