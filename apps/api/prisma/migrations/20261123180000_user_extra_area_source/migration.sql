-- An extra area an official passed on from an extra area they held names that source, and ends
-- when the source ends (docs/BUSINESS_RULES.md, "An extra area given from an extra area the giver
-- holds records that source"; docs/DECISION_LOG.md, the decision of 2026-11-23 on extra areas
-- passed on). Rows given before this migration are linked where the giver held a covering live
-- extra area when giving: the same place, the division of a district, or the whole country. Those
-- whose source has already ended end now, by the hand that ended the source, each audited and
-- refreshing the person's permissions.
ALTER TABLE "user_extra_areas" ADD COLUMN "source_area_id" UUID;
CREATE INDEX "user_extra_areas_source_area_id_idx" ON "user_extra_areas"("source_area_id");
ALTER TABLE "user_extra_areas" ADD CONSTRAINT "user_extra_areas_source_area_id_fkey" FOREIGN KEY ("source_area_id") REFERENCES "user_extra_areas"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;

UPDATE "user_extra_areas" c
SET "source_area_id" = (
  SELECT s."id"
  FROM "user_extra_areas" s
  LEFT JOIN "locations" l ON l."id" = c."location_id"
  WHERE s."user_id" = c."granted_by"
    AND s."id" <> c."id"
    AND s."granted_at" <= c."granted_at"
    AND (s."ended_at" IS NULL OR s."ended_at" > c."granted_at")
    AND (s."whole_country" OR s."location_id" = c."location_id" OR s."location_id" = l."parent_id")
  ORDER BY (s."location_id" = c."location_id") DESC NULLS LAST, s."whole_country", s."granted_at" DESC
  LIMIT 1
)
WHERE c."ended_at" IS NULL;

WITH RECURSIVE "gone" ("id", "ended_by") AS (
  SELECT c."id", s."ended_by"
  FROM "user_extra_areas" c
  JOIN "user_extra_areas" s ON s."id" = c."source_area_id"
  WHERE c."ended_at" IS NULL AND s."ended_at" IS NOT NULL
  UNION
  SELECT c."id", g."ended_by"
  FROM "user_extra_areas" c
  JOIN "gone" g ON c."source_area_id" = g."id"
  WHERE c."ended_at" IS NULL
),
"ended" AS (
  UPDATE "user_extra_areas" u
  SET "ended_at" = CURRENT_TIMESTAMP, "ended_by" = g."ended_by", "end_reason" = 'উৎস শেষ',
      "updated_by" = g."ended_by"
  FROM "gone" g
  WHERE u."id" = g."id"
  RETURNING u."id", u."user_id", u."location_id", u."whole_country", g."ended_by"
),
"bumped" AS (
  UPDATE "users" SET "permission_version" = "permission_version" + 1
  WHERE "id" IN (SELECT "user_id" FROM "ended")
  RETURNING "id"
)
INSERT INTO "audit_log" ("id", "created_at", "actor_user_id", "action", "entity_type", "entity_id", "old", "reason")
SELECT gen_random_uuid(), CURRENT_TIMESTAMP, e."ended_by", 'user.extra_area_ended', 'user', e."user_id",
       jsonb_build_object('id', e."id", 'locationId', e."location_id", 'wholeCountry', e."whole_country"),
       'উৎস শেষ'
FROM "ended" e;
