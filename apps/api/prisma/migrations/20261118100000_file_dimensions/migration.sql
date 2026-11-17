-- The width and height of a processed photo, as it stands upright, for the details a photo shows
-- when it is opened large. The processing job writes them with the thumbnails; a file processed
-- before, or one that is not a photo, keeps none.
ALTER TABLE "files" ADD COLUMN "width" INTEGER, ADD COLUMN "height" INTEGER;
ALTER TABLE "files" ADD CONSTRAINT "files_dimensions_check"
  CHECK ((width IS NULL) = (height IS NULL) AND (width IS NULL OR (width > 0 AND height > 0)));
