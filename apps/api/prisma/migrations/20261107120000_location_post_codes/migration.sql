-- The locations master carries post codes, and cantonments and forest ranges stand beside the
-- unions as places of their own kind. A post code is four digits; a place without one keeps null
-- (a division, a district, a city corporation).
ALTER TABLE "locations" ADD COLUMN "post_code" VARCHAR(4);
ALTER TABLE "locations" ADD CONSTRAINT "locations_post_code_check" CHECK ("post_code" IS NULL OR "post_code" ~ '^[0-9]{4}$');
ALTER TABLE "locations" DROP CONSTRAINT "locations_kind_check";
ALTER TABLE "locations" ADD CONSTRAINT "locations_kind_check" CHECK ("kind" IN ('division', 'district', 'upazila', 'city_corporation', 'union', 'pourosova', 'thana', 'other'));
ALTER TABLE "locations" DROP CONSTRAINT "locations_kind_level_check";
ALTER TABLE "locations" ADD CONSTRAINT "locations_kind_level_check" CHECK (
  (level = 'division' AND kind = 'division') OR
  (level = 'district' AND kind = 'district') OR
  (level = 'upazila' AND kind IN ('upazila', 'city_corporation')) OR
  (level = 'union' AND kind IN ('union', 'pourosova', 'thana', 'other')));
