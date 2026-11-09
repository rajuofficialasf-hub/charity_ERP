-- Reverses 20261026160000_media_team (every migration ships its hand-written reverse,
-- docs/architecture/ADR/ADR-003-prisma-with-down-sql.md). It refuses while any media referral
-- exists, so no media work is dropped silently; export the media rows first. It recreates the two
-- early media tables empty, exactly as 20261011000000_init made them.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM "media_referrals") THEN
    RAISE EXCEPTION 'media_team down: media referrals exist';
  END IF;
END $$;

DROP TABLE "media_events";
DROP TABLE "media_comments";
DROP TABLE "media_publications";
DROP TABLE "media_work_members";
DROP TABLE "media_works";
DROP TABLE "media_referrals";
DROP FUNCTION check_media_roles();
DROP FUNCTION check_media_work_referral();
DROP FUNCTION keep_media_referral_accepted();
DROP FUNCTION check_media_referral_application();

DROP TRIGGER reference_lists_keep_system ON "reference_lists";
DROP FUNCTION keep_system_list_entries();
DELETE FROM "reference_lists" WHERE "list_key" IN ('media_stage', 'media_role', 'media_platform');
ALTER TABLE "reference_lists" DROP COLUMN "attributes";
ALTER TABLE "reference_lists" DROP COLUMN "is_system";

CREATE TABLE "media_subjects" (
    "id" UUID NOT NULL,
    "beneficiary_id" UUID NOT NULL,
    "project_id" UUID,
    "added_by" UUID NOT NULL,
    "media_status" TEXT NOT NULL DEFAULT 'planned',
    "notes" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_by" UUID,

    CONSTRAINT "media_subjects_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "media_stories" (
    "id" UUID NOT NULL,
    "media_subject_id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT,
    "author_id" UUID NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'planned',
    "channel_code" TEXT,
    "published_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_by" UUID,
    "channel_list" TEXT GENERATED ALWAYS AS ('consent_channel') STORED,

    CONSTRAINT "media_stories_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "media_subjects_project_id_idx" ON "media_subjects"("project_id");
CREATE INDEX "media_subjects_added_by_idx" ON "media_subjects"("added_by");
CREATE INDEX "media_subjects_created_by_idx" ON "media_subjects"("created_by");
CREATE INDEX "media_subjects_updated_by_idx" ON "media_subjects"("updated_by");
CREATE UNIQUE INDEX "media_subjects_beneficiary_id_key" ON "media_subjects"("beneficiary_id") WHERE (project_id IS NULL);
CREATE UNIQUE INDEX "media_subjects_beneficiary_id_project_id_key" ON "media_subjects"("beneficiary_id", "project_id") WHERE (project_id IS NOT NULL);
CREATE INDEX "media_stories_media_subject_id_idx" ON "media_stories"("media_subject_id");
CREATE INDEX "media_stories_author_id_idx" ON "media_stories"("author_id");
CREATE INDEX "media_stories_channel_code_idx" ON "media_stories"("channel_code");
CREATE INDEX "media_stories_created_by_idx" ON "media_stories"("created_by");
CREATE INDEX "media_stories_updated_by_idx" ON "media_stories"("updated_by");
ALTER TABLE "media_subjects" ADD CONSTRAINT "media_subjects_beneficiary_id_fkey" FOREIGN KEY ("beneficiary_id") REFERENCES "beneficiaries"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;
ALTER TABLE "media_subjects" ADD CONSTRAINT "media_subjects_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;
ALTER TABLE "media_subjects" ADD CONSTRAINT "media_subjects_added_by_fkey" FOREIGN KEY ("added_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;
ALTER TABLE "media_subjects" ADD CONSTRAINT "media_subjects_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;
ALTER TABLE "media_subjects" ADD CONSTRAINT "media_subjects_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;
ALTER TABLE "media_stories" ADD CONSTRAINT "media_stories_media_subject_id_fkey" FOREIGN KEY ("media_subject_id") REFERENCES "media_subjects"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;
ALTER TABLE "media_stories" ADD CONSTRAINT "media_stories_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;
ALTER TABLE "media_stories" ADD CONSTRAINT "media_stories_channel_list_channel_code_fkey" FOREIGN KEY ("channel_list", "channel_code") REFERENCES "reference_lists"("list_key", "code") ON DELETE RESTRICT ON UPDATE NO ACTION;
ALTER TABLE "media_stories" ADD CONSTRAINT "media_stories_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;
ALTER TABLE "media_stories" ADD CONSTRAINT "media_stories_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;
ALTER TABLE "media_subjects" ADD CONSTRAINT "media_subjects_media_status_check" CHECK ("media_status" IN ('planned', 'in_progress', 'published'));
ALTER TABLE "media_stories" ADD CONSTRAINT "media_stories_status_check" CHECK ("status" IN ('planned', 'in_progress', 'done', 'published'));
CREATE TRIGGER media_subjects_set_updated_at BEFORE UPDATE ON "media_subjects" FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER media_stories_set_updated_at BEFORE UPDATE ON "media_stories" FOR EACH ROW EXECUTE FUNCTION set_updated_at();
