-- Reverses 20261118100000_file_dimensions: the two columns go with their values, which the
-- processing job read from the photos and can read again; nothing a person wrote is lost.
ALTER TABLE "files" DROP CONSTRAINT IF EXISTS "files_dimensions_check";
ALTER TABLE "files" DROP COLUMN IF EXISTS "height", DROP COLUMN IF EXISTS "width";
