-- Reverses 20261107120000_location_post_codes (every migration ships its hand-written reverse,
-- docs/architecture/ADR/ADR-003-prisma-with-down-sql.md). The old shape has no kind for a
-- cantonment or a forest range, so those rows are deactivated and filed as unions; nothing is
-- deleted, because addresses may point at them. The post codes go with the column.
UPDATE "locations" SET "kind" = 'union', "active" = false, "version" = "version" + 1 WHERE "kind" = 'other';
ALTER TABLE "locations" DROP CONSTRAINT IF EXISTS "locations_kind_level_check";
ALTER TABLE "locations" ADD CONSTRAINT "locations_kind_level_check" CHECK (
  (level = 'division' AND kind = 'division') OR
  (level = 'district' AND kind = 'district') OR
  (level = 'upazila' AND kind IN ('upazila', 'city_corporation')) OR
  (level = 'union' AND kind IN ('union', 'pourosova', 'thana')));
ALTER TABLE "locations" DROP CONSTRAINT IF EXISTS "locations_kind_check";
ALTER TABLE "locations" ADD CONSTRAINT "locations_kind_check" CHECK ("kind" IN ('division', 'district', 'upazila', 'city_corporation', 'union', 'pourosova', 'thana'));
ALTER TABLE "locations" DROP CONSTRAINT IF EXISTS "locations_post_code_check";
ALTER TABLE "locations" DROP COLUMN IF EXISTS "post_code";
