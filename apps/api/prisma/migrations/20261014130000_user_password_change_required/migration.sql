-- A staff account approved with a global role must choose a new password of 12 characters at the
-- next sign-in (O-66; docs/plans/2026-10-14-1400-feat-volunteer-form-refine-plan.md, U6). The flag
-- is false for every account that exists today.
ALTER TABLE users
  ADD COLUMN password_change_required BOOLEAN NOT NULL DEFAULT false;
