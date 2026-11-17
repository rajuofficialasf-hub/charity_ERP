-- The width and height of a processed photo, as it stands upright, for the details of the photo
-- viewer (docs/architecture/FILES_AND_DOCUMENTS.md, "The photo viewer"). The processing job writes
-- them with the thumbnails; a file processed before keeps none, and the details say so.
ALTER TABLE "files" ADD COLUMN "width" INTEGER, ADD COLUMN "height" INTEGER;
ALTER TABLE "files" ADD CONSTRAINT "files_dimensions_check"
  CHECK ((width IS NULL) = (height IS NULL) AND (width IS NULL OR (width > 0 AND height > 0)));
