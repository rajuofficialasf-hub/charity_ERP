-- The identical-file rule of a project (one row per sha256 among the files of a project) must not
-- answer the public: a refusal would tell an applicant that the same picture is already on the
-- project, which the public form never reveals (DECISION_LOG D-119). The photos of a public
-- application leave that index; the volunteer uploads keep it.
DROP INDEX "files_project_id_sha256_key";
CREATE UNIQUE INDEX "files_project_id_sha256_key" ON "files"("project_id", "sha256")
  WHERE (kind <> 'export' AND kind <> 'form_photo');
