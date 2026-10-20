-- The beneficiary master (the decisions on the BEN number and on merges in docs/DECISION_LOG.md,
-- technical decisions). Additive: the short BEN number of every profile, the marks on suggested duplicate pairs that are not the same person, and the two
-- indexes the duplicate suggestions read.

-- The short number officials read out: given once from a sequence, never reused, never changed.
-- Existing profiles are numbered in the order they were created; numbering is not an edit, so the
-- update stamp of a profile stays as it was.
CREATE SEQUENCE "beneficiaries_ben_no_seq" AS INTEGER;
ALTER TABLE "beneficiaries" ADD COLUMN "ben_no" INTEGER;
ALTER TABLE "beneficiaries" DISABLE TRIGGER "beneficiaries_set_updated_at";
UPDATE "beneficiaries" AS b SET "ben_no" = n.rn
  FROM (SELECT id, row_number() OVER (ORDER BY created_at, id) AS rn FROM "beneficiaries") AS n
  WHERE b.id = n.id;
ALTER TABLE "beneficiaries" ENABLE TRIGGER "beneficiaries_set_updated_at";
SELECT setval('beneficiaries_ben_no_seq', COALESCE((SELECT max("ben_no") FROM "beneficiaries"), 0) + 1, false);
ALTER TABLE "beneficiaries" ALTER COLUMN "ben_no" SET DEFAULT nextval('beneficiaries_ben_no_seq');
ALTER TABLE "beneficiaries" ALTER COLUMN "ben_no" SET NOT NULL;
ALTER SEQUENCE "beneficiaries_ben_no_seq" OWNED BY "beneficiaries"."ben_no";
ALTER TABLE "beneficiaries" ADD CONSTRAINT "beneficiaries_ben_no_check" CHECK ("ben_no" > 0);
CREATE UNIQUE INDEX "beneficiaries_ben_no_key" ON "beneficiaries"("ben_no");

CREATE FUNCTION keep_ben_no() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.ben_no IS DISTINCT FROM OLD.ben_no THEN
    RAISE EXCEPTION 'ben_no_is_fixed: the BEN number of a profile never changes'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER beneficiaries_keep_ben_no BEFORE UPDATE OF "ben_no" ON "beneficiaries" FOR EACH ROW EXECUTE FUNCTION keep_ben_no();

-- The comparable form of a person's name: every run of white space (tabs and line breaks too)
-- made one space, then trimmed, letter case folded.
-- The duplicate suggestions and the family warning compare names through it, and the indexes
-- below are built on it, so a query and its index always agree.
CREATE FUNCTION person_name_key(value TEXT) RETURNS TEXT LANGUAGE sql IMMUTABLE PARALLEL SAFE AS $$
  SELECT lower(btrim(regexp_replace(value, '\s+', ' ', 'g')))
$$;
CREATE INDEX "beneficiaries_dup_name_father_mobile_idx" ON "beneficiaries"(person_name_key("name"), person_name_key("father_or_husband_name"), "mobile") WHERE (merged_into_id IS NULL);
CREATE INDEX "beneficiaries_dup_name_dob_union_idx" ON "beneficiaries"(person_name_key("name"), "dob", "union_id") WHERE (merged_into_id IS NULL AND dob IS NOT NULL);

-- A suggested pair an official marked as two different people, with the reason; the pair is kept
-- in one order (the lower id first), one active mark per pair, and lifting the mark keeps the row.
CREATE TABLE "beneficiary_merge_dismissals" (
    "id" UUID NOT NULL,
    "low_id" UUID NOT NULL,
    "high_id" UUID NOT NULL,
    "reason" TEXT NOT NULL,
    "dismissed_by" UUID NOT NULL,
    "dismissed_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lifted_by" UUID,
    "lifted_at" TIMESTAMPTZ(6),
    "lift_reason" TEXT,

    CONSTRAINT "beneficiary_merge_dismissals_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "beneficiary_merge_dismissals_pair_check" CHECK ("low_id" < "high_id"),
    CONSTRAINT "beneficiary_merge_dismissals_reason_check" CHECK (char_length(btrim("reason")) BETWEEN 3 AND 1000),
    CONSTRAINT "beneficiary_merge_dismissals_lift_check" CHECK (
      ("lifted_at" IS NULL) = ("lifted_by" IS NULL)
      AND ("lifted_at" IS NULL) = ("lift_reason" IS NULL)
      AND ("lift_reason" IS NULL OR char_length(btrim("lift_reason")) BETWEEN 3 AND 1000)
    )
);
CREATE UNIQUE INDEX "beneficiary_merge_dismissals_active_key" ON "beneficiary_merge_dismissals"("low_id", "high_id") WHERE (lifted_at IS NULL);
CREATE INDEX "beneficiary_merge_dismissals_high_id_idx" ON "beneficiary_merge_dismissals"("high_id");
CREATE INDEX "beneficiary_merge_dismissals_dismissed_by_idx" ON "beneficiary_merge_dismissals"("dismissed_by");
CREATE INDEX "beneficiary_merge_dismissals_lifted_by_idx" ON "beneficiary_merge_dismissals"("lifted_by");
ALTER TABLE "beneficiary_merge_dismissals" ADD CONSTRAINT "beneficiary_merge_dismissals_low_id_fkey" FOREIGN KEY ("low_id") REFERENCES "beneficiaries"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;
ALTER TABLE "beneficiary_merge_dismissals" ADD CONSTRAINT "beneficiary_merge_dismissals_high_id_fkey" FOREIGN KEY ("high_id") REFERENCES "beneficiaries"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;
ALTER TABLE "beneficiary_merge_dismissals" ADD CONSTRAINT "beneficiary_merge_dismissals_dismissed_by_fkey" FOREIGN KEY ("dismissed_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;
ALTER TABLE "beneficiary_merge_dismissals" ADD CONSTRAINT "beneficiary_merge_dismissals_lifted_by_fkey" FOREIGN KEY ("lifted_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;
-- Every mark stays, as every log of decisions does: no row disappears, and the only change a row
-- takes is being lifted once; who marked it, why, and the pair stay as written.
CREATE FUNCTION guard_merge_dismissal() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.lifted_at IS NOT NULL
    OR NEW.lifted_at IS NULL
    OR (NEW.id, NEW.low_id, NEW.high_id, NEW.reason, NEW.dismissed_by, NEW.dismissed_at)
       IS DISTINCT FROM (OLD.id, OLD.low_id, OLD.high_id, OLD.reason, OLD.dismissed_by, OLD.dismissed_at)
  THEN
    RAISE EXCEPTION 'merge_dismissal_is_fixed: a mark is only lifted, once' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER beneficiary_merge_dismissals_lift_only BEFORE UPDATE ON "beneficiary_merge_dismissals" FOR EACH ROW EXECUTE FUNCTION guard_merge_dismissal();
CREATE TRIGGER beneficiary_merge_dismissals_no_delete BEFORE DELETE ON "beneficiary_merge_dismissals" FOR EACH ROW EXECUTE FUNCTION forbid_log_change();
CREATE TRIGGER beneficiary_merge_dismissals_no_truncate BEFORE TRUNCATE ON "beneficiary_merge_dismissals" FOR EACH STATEMENT EXECUTE FUNCTION forbid_log_change();
