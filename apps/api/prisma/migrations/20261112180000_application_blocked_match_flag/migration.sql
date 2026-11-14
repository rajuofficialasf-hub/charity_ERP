-- An entry of a person without an identity document whose name, father's or husband's name and
-- village match a blocked profile waits for an official's verification, and says why
-- (docs/BUSINESS_RULES.md, the block list and a profile without a document). The flag list of the
-- needs-verification reasons grows by that one; the existing names stay.
ALTER TABLE "applications" DROP CONSTRAINT "applications_flags_check";
ALTER TABLE "applications"
  ADD CONSTRAINT "applications_flags_check"
  CHECK (flags <@ ARRAY['existing_identity', 'late_sync', 'stale_form_version', 'public_entry', 'identity_blocked', 'identity_repeated', 'blocked_name_match']::text[]);
