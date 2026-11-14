-- The name keys kept with each person (docs/database/DATABASE_SCHEMA.md, "beneficiaries"): the key
-- of the name, of the father's or husband's name and of the village, by which two spellings of
-- one person compare equal. The keys are computed in TypeScript only (`matchKey` of
-- `@css/shared/beneficiaries`), because they read the list of spelling variants that officials
-- edit, and an SQL function cannot read an editable list and stay immutable. This migration adds
-- the columns empty and computes nothing: on a large table that would hold the migration for
-- minutes, and the key job (apps/api/src/jobs/name-keys.ts) fills them in batches.

-- The keys of a profile, and the version of the variants list they were computed with; NULL until
-- the job or a write computes them.
ALTER TABLE "beneficiaries"
  ADD COLUMN "name_key" TEXT,
  ADD COLUMN "guardian_key" TEXT,
  ADD COLUMN "village_key" TEXT,
  ADD COLUMN "match_keys_version" INTEGER;
ALTER TABLE "beneficiary_family_members"
  ADD COLUMN "name_key" TEXT,
  ADD COLUMN "match_keys_version" INTEGER;

-- The pair of the same name and father's or husband's name inside a union, and the people of one
-- village of a union; the merged profiles are never a candidate.
CREATE INDEX "beneficiaries_union_id_name_key_guardian_key_idx" ON "beneficiaries"("union_id", "name_key", "guardian_key") WHERE (merged_into_id IS NULL);
CREATE INDEX "beneficiaries_union_id_village_key_idx" ON "beneficiaries"("union_id", "village_key") WHERE (merged_into_id IS NULL);
CREATE INDEX "beneficiary_family_members_name_key_idx" ON "beneficiary_family_members"("name_key");

-- The rows whose keys are missing or older than the list: the key job's walk and the check at the
-- worker's start read this index instead of the whole table. A btree index holds the NULLs too, so
-- the one index serves both "missing" (IS NULL) and "older" (<).
CREATE INDEX "beneficiaries_match_keys_version_idx" ON "beneficiaries"("match_keys_version");
CREATE INDEX "beneficiary_family_members_match_keys_version_idx" ON "beneficiary_family_members"("match_keys_version");

-- The known spelling variants of names, by group: a group is one spelling the keys use (its
-- canonical) and the other spellings of the same name. A group is switched off and on as a whole
-- and never deleted; while off, the keys ignore it and its spellings stay its own.
CREATE TABLE "name_variant_groups" (
    "id" UUID NOT NULL,
    "canonical" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_by" UUID,
    CONSTRAINT "name_variant_groups_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "name_variant_groups_canonical_check" CHECK (char_length(btrim("canonical")) BETWEEN 1 AND 100 AND "canonical" !~ '\s')
);
CREATE INDEX "name_variant_groups_created_by_idx" ON "name_variant_groups"("created_by");
CREATE INDEX "name_variant_groups_updated_by_idx" ON "name_variant_groups"("updated_by");
ALTER TABLE "name_variant_groups" ADD CONSTRAINT "name_variant_groups_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;
ALTER TABLE "name_variant_groups" ADD CONSTRAINT "name_variant_groups_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;
CREATE TRIGGER name_variant_groups_set_updated_at BEFORE UPDATE ON "name_variant_groups" FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Each spelling of a group, its canonical included, one word each, kept as written; the key reads
-- them in key form. A spelling taken out of its group stays as a row that is no longer active, so
-- nothing is deleted; an active spelling belongs to one group only.
CREATE TABLE "name_variants" (
    "id" UUID NOT NULL,
    "group_id" UUID NOT NULL,
    "variant" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_by" UUID,
    CONSTRAINT "name_variants_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "name_variants_variant_check" CHECK (char_length(btrim("variant")) BETWEEN 1 AND 100 AND "variant" !~ '\s')
);
CREATE UNIQUE INDEX "name_variants_variant_key" ON "name_variants"("variant") WHERE (active);
CREATE INDEX "name_variants_group_id_idx" ON "name_variants"("group_id");
CREATE INDEX "name_variants_created_by_idx" ON "name_variants"("created_by");
CREATE INDEX "name_variants_updated_by_idx" ON "name_variants"("updated_by");
ALTER TABLE "name_variants" ADD CONSTRAINT "name_variants_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "name_variant_groups"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;
ALTER TABLE "name_variants" ADD CONSTRAINT "name_variants_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;
ALTER TABLE "name_variants" ADD CONSTRAINT "name_variants_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;
CREATE TRIGGER name_variants_set_updated_at BEFORE UPDATE ON "name_variants" FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- The version of the variants list: one row, raised in the transaction of every change of the list,
-- so a stored key older than it is computed again. Version 1 is the list as the seed or the first
-- change leaves it.
CREATE TABLE "name_variants_version" (
    "id" SMALLINT NOT NULL DEFAULT 1,
    "version" INTEGER NOT NULL DEFAULT 1,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_by" UUID,
    CONSTRAINT "name_variants_version_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "name_variants_version_one_row_check" CHECK ("id" = 1),
    CONSTRAINT "name_variants_version_version_check" CHECK ("version" > 0)
);
CREATE INDEX "name_variants_version_updated_by_idx" ON "name_variants_version"("updated_by");
ALTER TABLE "name_variants_version" ADD CONSTRAINT "name_variants_version_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;
CREATE TRIGGER name_variants_version_set_updated_at BEFORE UPDATE ON "name_variants_version" FOR EACH ROW EXECUTE FUNCTION set_updated_at();
INSERT INTO "name_variants_version" ("id", "version") VALUES (1, 1);

-- A write of the keys alone is no edit of the person: the key job marks its transaction with
-- css.match_keys_only = on, and the update stamp of the row then stays as it was, so the job
-- neither moves a profile's "last changed" nor makes an official's open edit stale (If-Match).
-- Every other update stamps the row as before.
CREATE FUNCTION set_updated_at_unless_match_keys() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF current_setting('css.match_keys_only', true) = 'on' THEN
    NEW.updated_at := OLD.updated_at;
  ELSE
    NEW.updated_at := now();
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER "beneficiaries_set_updated_at" ON "beneficiaries";
CREATE TRIGGER beneficiaries_set_updated_at BEFORE UPDATE ON "beneficiaries" FOR EACH ROW EXECUTE FUNCTION set_updated_at_unless_match_keys();
DROP TRIGGER "beneficiary_family_members_set_updated_at" ON "beneficiary_family_members";
CREATE TRIGGER beneficiary_family_members_set_updated_at BEFORE UPDATE ON "beneficiary_family_members" FOR EACH ROW EXECUTE FUNCTION set_updated_at_unless_match_keys();
