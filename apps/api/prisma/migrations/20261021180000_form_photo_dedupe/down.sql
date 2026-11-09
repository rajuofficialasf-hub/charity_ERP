-- Reverses 20261021180000_form_photo_dedupe (every migration ships its hand-written reverse,
-- docs/architecture/ADR/ADR-003-prisma-with-down-sql.md). Form photos with the same bytes on one
-- project would block the older index; the later duplicates lose their project link (the rows
-- stay, reachable through their application links) before the index returns.
UPDATE "files" f SET project_id = NULL
 WHERE f.kind = 'form_photo' AND f.project_id IS NOT NULL
   AND EXISTS (SELECT 1 FROM "files" g
                WHERE g.project_id = f.project_id AND g.sha256 = f.sha256 AND g.kind <> 'export'
                  AND g.id < f.id);
DROP INDEX "files_project_id_sha256_key";
CREATE UNIQUE INDEX "files_project_id_sha256_key" ON "files"("project_id", "sha256")
  WHERE (kind <> 'export');
