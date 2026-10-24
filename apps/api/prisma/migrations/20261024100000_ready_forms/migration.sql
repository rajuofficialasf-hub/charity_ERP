-- Ready forms (D-125, D-129): a form may stand outside every project — a ready form the Monitoring
-- Team builds for PMs to place, or the one question library — and a project form placed from a
-- ready form names the ready form and the version it copied. The kind says what a form is for: the
-- identity check of D-126 applies to beneficiary applications only. Every existing form is a
-- project's beneficiary application form, so it keeps working unchanged.
ALTER TABLE "forms" ALTER COLUMN "project_id" DROP NOT NULL;
ALTER TABLE "forms" ADD COLUMN "kind" TEXT NOT NULL DEFAULT 'beneficiary_application';
ALTER TABLE "forms" ADD COLUMN "source_form_id" UUID;
ALTER TABLE "forms" ADD COLUMN "source_version_no" INTEGER;

ALTER TABLE "forms" ADD CONSTRAINT "forms_kind_check"
  CHECK (kind IN ('beneficiary_application', 'other', 'library'));
-- the library belongs to no project
ALTER TABLE "forms" ADD CONSTRAINT "forms_library_check"
  CHECK (kind <> 'library' OR project_id IS NULL);
-- a placed copy names its source and the version together, and only a project form is a copy
ALTER TABLE "forms" ADD CONSTRAINT "forms_source_check"
  CHECK (
    (source_form_id IS NULL) = (source_version_no IS NULL)
    AND (source_form_id IS NULL OR project_id IS NOT NULL)
    AND (source_version_no IS NULL OR source_version_no > 0)
  );
ALTER TABLE "forms" ADD CONSTRAINT "forms_source_form_id_fkey"
  FOREIGN KEY ("source_form_id") REFERENCES "forms"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;
CREATE INDEX "forms_source_form_id_idx" ON "forms"("source_form_id");

-- a ready form's key is unique among the forms outside projects (a project's keys stay unique per
-- project through forms_project_id_key_key), and there is one library
CREATE UNIQUE INDEX "forms_ready_key_key" ON "forms"("key") WHERE (project_id IS NULL);
CREATE UNIQUE INDEX "forms_one_library_key" ON "forms"("kind") WHERE (kind = 'library');

-- the library starts empty with its open draft, so a database that is not seeded again has it
INSERT INTO "forms" ("id", "project_id", "key", "title_bn", "title_en", "kind")
VALUES ('01a16a00-0000-7000-8000-00000000f001', NULL, 'question_library', 'প্রশ্ন-লাইব্রেরি', 'Question library', 'library');
INSERT INTO "form_versions" ("id", "form_id", "version_no", "status")
VALUES ('01a16a00-0000-7000-8000-00000000f002', '01a16a00-0000-7000-8000-00000000f001', 1, 'draft');
