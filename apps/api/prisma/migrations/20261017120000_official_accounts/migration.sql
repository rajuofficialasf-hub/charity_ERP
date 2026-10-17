-- Officials created by the admin with a set-password link, login by job ID, the department's own
-- staff kept apart from other users, the supervisor line of the organogram (DECISION_LOG D-097;
-- plan docs/plans/2026-10-17-1500-feat-official-accounts-organogram-plan.md, unit U1). Additive:
-- four new columns on users and one new table; existing staff become department staff.

-- The organisation's own job ID, typed by the admin. Stored in capitals, so the unique index is
-- case-insensitive; a job ID that reads as a mobile number would make the login id ambiguous.
ALTER TABLE "users" ADD COLUMN "job_id" TEXT;
ALTER TABLE "users" ADD CONSTRAINT "users_job_id_check" CHECK (
  "job_id" IS NULL OR (
    "kind" = 'staff'
    AND "job_id" = upper("job_id")
    AND "job_id" ~ '^[A-Z0-9][A-Z0-9._/-]{1,31}$'
    AND replace("job_id", '-', '') !~ '^(88)?01[0-9]{9}$'
  )
);
CREATE UNIQUE INDEX "users_job_id_key" ON "users"("job_id") WHERE (job_id IS NOT NULL);

-- Where an official belongs: the department, another department of the Foundation, or an outside
-- partner; the last two name their unit. Only the department's staff appear in the organogram.
ALTER TABLE "users" ADD COLUMN "affiliation" TEXT;
ALTER TABLE "users" ADD COLUMN "affiliation_unit" TEXT;
UPDATE "users" SET "affiliation" = 'department' WHERE "kind" = 'staff';
ALTER TABLE "users" ADD CONSTRAINT "users_affiliation_check" CHECK (
  ("kind" = 'staff') = ("affiliation" IS NOT NULL)
  AND ("affiliation" IS NULL OR "affiliation" IN ('department', 'foundation', 'external'))
);
ALTER TABLE "users" ADD CONSTRAINT "users_affiliation_unit_check" CHECK (
  ("affiliation_unit" IS NULL) = ("affiliation" IS NULL OR "affiliation" = 'department')
  AND ("affiliation_unit" IS NULL OR char_length("affiliation_unit") BETWEEN 1 AND 200)
);
CREATE INDEX "users_affiliation_idx" ON "users"("affiliation") WHERE (affiliation IS NOT NULL);

-- A staff account written without an affiliation is department staff (the pending staff
-- registrations and older code paths); the CHECK above then holds for every staff row.
CREATE FUNCTION default_staff_affiliation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.kind = 'staff' AND NEW.affiliation IS NULL THEN
    NEW.affiliation := 'department';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER users_default_affiliation BEFORE INSERT ON "users" FOR EACH ROW EXECUTE FUNCTION default_staff_affiliation();

-- Who the official reports to (the organogram); never the official themself.
ALTER TABLE "users" ADD COLUMN "supervisor_user_id" UUID;
ALTER TABLE "users" ADD CONSTRAINT "users_supervisor_check" CHECK (
  "supervisor_user_id" IS NULL OR ("kind" = 'staff' AND "supervisor_user_id" <> "id")
);
CREATE INDEX "users_supervisor_user_id_idx" ON "users"("supervisor_user_id");
ALTER TABLE "users" ADD CONSTRAINT "users_supervisor_user_id_fkey" FOREIGN KEY ("supervisor_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- The set-password link of an official created by the admin: single use, 72 hours, stored as a
-- SHA-256 hash only. A new link revokes the open one; rows are never deleted.
CREATE TABLE "account_invitations" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "token_hash" TEXT NOT NULL,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "emailed" BOOLEAN NOT NULL DEFAULT false,
    "used_at" TIMESTAMPTZ(6),
    "revoked_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID NOT NULL,

    CONSTRAINT "account_invitations_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "account_invitations_closed_check" CHECK ("used_at" IS NULL OR "revoked_at" IS NULL),
    CONSTRAINT "account_invitations_expiry_check" CHECK ("expires_at" > "created_at")
);
CREATE UNIQUE INDEX "account_invitations_token_hash_key" ON "account_invitations"("token_hash");
CREATE UNIQUE INDEX "account_invitations_user_id_open_key" ON "account_invitations"("user_id") WHERE (used_at IS NULL AND revoked_at IS NULL);
CREATE INDEX "account_invitations_user_id_idx" ON "account_invitations"("user_id");
CREATE INDEX "account_invitations_created_by_idx" ON "account_invitations"("created_by");
ALTER TABLE "account_invitations" ADD CONSTRAINT "account_invitations_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;
ALTER TABLE "account_invitations" ADD CONSTRAINT "account_invitations_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- The history of every link stays (D-060): no row disappears.
CREATE TRIGGER account_invitations_no_delete BEFORE DELETE ON "account_invitations" FOR EACH ROW EXECUTE FUNCTION forbid_log_change();
CREATE TRIGGER account_invitations_no_truncate BEFORE TRUNCATE ON "account_invitations" FOR EACH STATEMENT EXECUTE FUNCTION forbid_log_change();
