-- The Media Team module: a referral of an approved application, its work with
-- stages, members, a script and publications, comments and a history. The two early media tables
-- were never written by any service and are empty, so they are dropped here; down.sql recreates
-- them as the init migration made them.

-- ---------------------------------------------------------------------------------------------
-- reference lists: system entries the rules need, and attributes (a platform's kind)
-- ---------------------------------------------------------------------------------------------
ALTER TABLE "reference_lists" ADD COLUMN "is_system" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "reference_lists" ADD COLUMN "attributes" JSONB NOT NULL DEFAULT '{}';

-- a system entry keeps its code, stays active and is never deleted
CREATE FUNCTION keep_system_list_entries() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.is_system THEN
      RAISE EXCEPTION 'system_list_entry: %/%', OLD.list_key, OLD.code USING ERRCODE = '23514';
    END IF;
    RETURN OLD;
  END IF;
  IF OLD.is_system AND (NOT NEW.is_system OR NOT NEW.active OR NEW.code <> OLD.code OR NEW.list_key <> OLD.list_key) THEN
    RAISE EXCEPTION 'system_list_entry: %/%', OLD.list_key, OLD.code USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER reference_lists_keep_system BEFORE UPDATE OR DELETE ON "reference_lists" FOR EACH ROW EXECUTE FUNCTION keep_system_list_entries();

-- ---------------------------------------------------------------------------------------------
-- the early media tables, never used
-- ---------------------------------------------------------------------------------------------
DROP TABLE "media_stories";
DROP TABLE "media_subjects";

-- ---------------------------------------------------------------------------------------------
-- media referrals: one per application, its state cycling with each decision and send-again
-- ---------------------------------------------------------------------------------------------
CREATE TABLE "media_referrals" (
    "id" UUID NOT NULL,
    "application_id" UUID NOT NULL,
    "beneficiary_id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "referred_by" UUID NOT NULL,
    "priority" TEXT NOT NULL,
    "note" TEXT NOT NULL,
    "story" TEXT,
    "state" TEXT NOT NULL DEFAULT 'pending',
    "decided_by" UUID,
    "decided_at" TIMESTAMPTZ(6),
    "decision_comment" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_by" UUID,
    CONSTRAINT "media_referrals_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "media_referrals_priority_check" CHECK ("priority" IN ('high', 'normal', 'low')),
    CONSTRAINT "media_referrals_state_check" CHECK ("state" IN ('pending', 'accepted', 'sent_back', 'rejected')),
    CONSTRAINT "media_referrals_note_check" CHECK (length(btrim("note")) > 0),
    -- a decision names its decider; sending back and rejecting carry their reason
    CONSTRAINT "media_referrals_decision_check" CHECK (
      ("state" = 'pending' AND "decided_by" IS NULL AND "decided_at" IS NULL)
      OR ("state" <> 'pending' AND "decided_by" IS NOT NULL AND "decided_at" IS NOT NULL
          AND ("state" = 'accepted' OR length(btrim(coalesce("decision_comment", ''))) > 0))
    )
);
CREATE UNIQUE INDEX "media_referrals_application_id_key" ON "media_referrals"("application_id");
CREATE INDEX "media_referrals_beneficiary_id_idx" ON "media_referrals"("beneficiary_id");
CREATE INDEX "media_referrals_project_id_idx" ON "media_referrals"("project_id");
CREATE INDEX "media_referrals_referred_by_idx" ON "media_referrals"("referred_by");
CREATE INDEX "media_referrals_state_created_at_idx" ON "media_referrals"("state", "created_at");
CREATE INDEX "media_referrals_decided_by_idx" ON "media_referrals"("decided_by");
CREATE INDEX "media_referrals_created_by_idx" ON "media_referrals"("created_by");
CREATE INDEX "media_referrals_updated_by_idx" ON "media_referrals"("updated_by");
ALTER TABLE "media_referrals" ADD CONSTRAINT "media_referrals_application_id_fkey" FOREIGN KEY ("application_id") REFERENCES "applications"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;
ALTER TABLE "media_referrals" ADD CONSTRAINT "media_referrals_beneficiary_id_fkey" FOREIGN KEY ("beneficiary_id") REFERENCES "beneficiaries"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;
ALTER TABLE "media_referrals" ADD CONSTRAINT "media_referrals_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;
ALTER TABLE "media_referrals" ADD CONSTRAINT "media_referrals_referred_by_fkey" FOREIGN KEY ("referred_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;
ALTER TABLE "media_referrals" ADD CONSTRAINT "media_referrals_decided_by_fkey" FOREIGN KEY ("decided_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;
ALTER TABLE "media_referrals" ADD CONSTRAINT "media_referrals_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;
ALTER TABLE "media_referrals" ADD CONSTRAINT "media_referrals_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;
CREATE TRIGGER media_referrals_set_updated_at BEFORE UPDATE ON "media_referrals" FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- a referral names its application's own beneficiary and project; checked at commit, since a
-- merge moves the application and its referral in one transaction
CREATE FUNCTION check_media_referral_application() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM applications a
     WHERE a.id = NEW.application_id AND a.beneficiary_id = NEW.beneficiary_id AND a.project_id = NEW.project_id
  ) THEN
    RAISE EXCEPTION 'media_referral_application_mismatch' USING ERRCODE = '23514';
  END IF;
  RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER media_referrals_application AFTER INSERT OR UPDATE OF application_id, beneficiary_id, project_id ON "media_referrals" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION check_media_referral_application();

-- ---------------------------------------------------------------------------------------------
-- media works: one per accepted referral
-- ---------------------------------------------------------------------------------------------
CREATE TABLE "media_works" (
    "id" UUID NOT NULL,
    "referral_id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "stage_list" TEXT GENERATED ALWAYS AS ('media_stage') STORED,
    "stage_code" TEXT NOT NULL,
    "held_stage_code" TEXT,
    "content_type" TEXT NOT NULL DEFAULT 'video',
    "script" JSONB NOT NULL DEFAULT '{}',
    "script_state" TEXT NOT NULL DEFAULT 'draft',
    "review_approved_by" UUID,
    "review_approved_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_by" UUID,
    CONSTRAINT "media_works_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "media_works_title_check" CHECK (length(btrim("title")) > 0),
    CONSTRAINT "media_works_content_type_check" CHECK ("content_type" IN ('video', 'photo', 'both')),
    CONSTRAINT "media_works_script_state_check" CHECK ("script_state" IN ('draft', 'in_review', 'final')),
    CONSTRAINT "media_works_review_check" CHECK (("review_approved_by" IS NULL) = ("review_approved_at" IS NULL)),
    -- only a work on hold remembers the stage it was held at
    CONSTRAINT "media_works_held_check" CHECK (("stage_code" = 'on_hold') = ("held_stage_code" IS NOT NULL)),
    -- nothing is published, or done, before the final review
    CONSTRAINT "media_works_published_check" CHECK ("stage_code" NOT IN ('published', 'done') OR "review_approved_by" IS NOT NULL)
);
CREATE UNIQUE INDEX "media_works_referral_id_key" ON "media_works"("referral_id");
CREATE INDEX "media_works_stage_code_idx" ON "media_works"("stage_code");
CREATE INDEX "media_works_review_approved_by_idx" ON "media_works"("review_approved_by");
CREATE INDEX "media_works_created_by_idx" ON "media_works"("created_by");
CREATE INDEX "media_works_updated_by_idx" ON "media_works"("updated_by");
ALTER TABLE "media_works" ADD CONSTRAINT "media_works_referral_id_fkey" FOREIGN KEY ("referral_id") REFERENCES "media_referrals"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;
ALTER TABLE "media_works" ADD CONSTRAINT "media_works_stage_list_stage_code_fkey" FOREIGN KEY ("stage_list", "stage_code") REFERENCES "reference_lists"("list_key", "code") ON DELETE RESTRICT ON UPDATE NO ACTION;
ALTER TABLE "media_works" ADD CONSTRAINT "media_works_review_approved_by_fkey" FOREIGN KEY ("review_approved_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;
ALTER TABLE "media_works" ADD CONSTRAINT "media_works_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;
ALTER TABLE "media_works" ADD CONSTRAINT "media_works_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;
CREATE TRIGGER media_works_set_updated_at BEFORE UPDATE ON "media_works" FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- no work enters production without an accepted referral, and an accepted referral with a work
-- stays accepted
CREATE FUNCTION check_media_work_referral() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM media_referrals r WHERE r.id = NEW.referral_id AND r.state = 'accepted') THEN
    RAISE EXCEPTION 'media_work_referral_not_accepted' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER media_works_referral BEFORE INSERT OR UPDATE OF referral_id ON "media_works" FOR EACH ROW EXECUTE FUNCTION check_media_work_referral();
CREATE FUNCTION keep_media_referral_accepted() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.state = 'accepted' AND NEW.state <> 'accepted'
     AND EXISTS (SELECT 1 FROM media_works w WHERE w.referral_id = OLD.id) THEN
    RAISE EXCEPTION 'media_referral_has_work' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER media_referrals_keep_accepted BEFORE UPDATE OF state ON "media_referrals" FOR EACH ROW EXECUTE FUNCTION keep_media_referral_accepted();

-- ---------------------------------------------------------------------------------------------
-- the members of a work, each with one or more production roles
-- ---------------------------------------------------------------------------------------------
CREATE TABLE "media_work_members" (
    "id" UUID NOT NULL,
    "work_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "roles" TEXT[] NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_by" UUID,
    CONSTRAINT "media_work_members_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "media_work_members_roles_check" CHECK (cardinality("roles") > 0)
);
CREATE UNIQUE INDEX "media_work_members_work_id_user_id_key" ON "media_work_members"("work_id", "user_id");
CREATE INDEX "media_work_members_user_id_idx" ON "media_work_members"("user_id");
CREATE INDEX "media_work_members_created_by_idx" ON "media_work_members"("created_by");
CREATE INDEX "media_work_members_updated_by_idx" ON "media_work_members"("updated_by");
ALTER TABLE "media_work_members" ADD CONSTRAINT "media_work_members_work_id_fkey" FOREIGN KEY ("work_id") REFERENCES "media_works"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;
ALTER TABLE "media_work_members" ADD CONSTRAINT "media_work_members_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;
ALTER TABLE "media_work_members" ADD CONSTRAINT "media_work_members_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;
ALTER TABLE "media_work_members" ADD CONSTRAINT "media_work_members_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;
CREATE TRIGGER media_work_members_set_updated_at BEFORE UPDATE ON "media_work_members" FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- a production role must be a code of the list media_role
CREATE FUNCTION check_media_roles() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE v_missing text;
BEGIN
  SELECT string_agg(c, ', ') INTO v_missing
  FROM unnest(NEW.roles) AS c
  WHERE NOT EXISTS (SELECT 1 FROM reference_lists r WHERE r.list_key = 'media_role' AND r.code = c);
  IF v_missing IS NOT NULL THEN
    RAISE EXCEPTION 'unknown_media_role: %', v_missing USING ERRCODE = '23503';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER media_work_members_roles BEFORE INSERT OR UPDATE OF roles ON "media_work_members" FOR EACH ROW EXECUTE FUNCTION check_media_roles();

-- ---------------------------------------------------------------------------------------------
-- publications on the platforms
-- ---------------------------------------------------------------------------------------------
CREATE TABLE "media_publications" (
    "id" UUID NOT NULL,
    "work_id" UUID NOT NULL,
    "platform_list" TEXT GENERATED ALWAYS AS ('media_platform') STORED,
    "platform_code" TEXT NOT NULL,
    "state" TEXT NOT NULL DEFAULT 'waiting',
    "published_on" DATE,
    "link" TEXT,
    "note" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_by" UUID,
    CONSTRAINT "media_publications_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "media_publications_state_check" CHECK ("state" IN ('waiting', 'published', 'taken_down')),
    -- a published post has its link and its date
    CONSTRAINT "media_publications_published_check" CHECK ("state" = 'waiting' OR ("link" IS NOT NULL AND "published_on" IS NOT NULL)),
    CONSTRAINT "media_publications_link_check" CHECK ("link" IS NULL OR ("link" LIKE 'https://%' AND length("link") <= 500))
);
CREATE INDEX "media_publications_work_id_idx" ON "media_publications"("work_id");
CREATE INDEX "media_publications_platform_code_idx" ON "media_publications"("platform_code");
CREATE INDEX "media_publications_created_by_idx" ON "media_publications"("created_by");
CREATE INDEX "media_publications_updated_by_idx" ON "media_publications"("updated_by");
ALTER TABLE "media_publications" ADD CONSTRAINT "media_publications_work_id_fkey" FOREIGN KEY ("work_id") REFERENCES "media_works"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;
ALTER TABLE "media_publications" ADD CONSTRAINT "media_publications_platform_list_platform_code_fkey" FOREIGN KEY ("platform_list", "platform_code") REFERENCES "reference_lists"("list_key", "code") ON DELETE RESTRICT ON UPDATE NO ACTION;
ALTER TABLE "media_publications" ADD CONSTRAINT "media_publications_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;
ALTER TABLE "media_publications" ADD CONSTRAINT "media_publications_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;
CREATE TRIGGER media_publications_set_updated_at BEFORE UPDATE ON "media_publications" FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ---------------------------------------------------------------------------------------------
-- comments on a work
-- ---------------------------------------------------------------------------------------------
CREATE TABLE "media_comments" (
    "id" UUID NOT NULL,
    "work_id" UUID NOT NULL,
    "author_id" UUID NOT NULL,
    "body" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "media_comments_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "media_comments_body_check" CHECK (length(btrim("body")) > 0)
);
CREATE INDEX "media_comments_work_id_created_at_idx" ON "media_comments"("work_id", "created_at");
CREATE INDEX "media_comments_author_id_idx" ON "media_comments"("author_id");
ALTER TABLE "media_comments" ADD CONSTRAINT "media_comments_work_id_fkey" FOREIGN KEY ("work_id") REFERENCES "media_works"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;
ALTER TABLE "media_comments" ADD CONSTRAINT "media_comments_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;
CREATE TRIGGER media_comments_append_only BEFORE UPDATE OR DELETE ON "media_comments" FOR EACH ROW EXECUTE FUNCTION forbid_log_change();

-- ---------------------------------------------------------------------------------------------
-- the history of a referral and its work: every decision, stage, member, script and publication
-- change, with who and when
-- ---------------------------------------------------------------------------------------------
CREATE TABLE "media_events" (
    "id" UUID NOT NULL,
    "referral_id" UUID NOT NULL,
    "work_id" UUID,
    "kind" TEXT NOT NULL,
    "from_value" TEXT,
    "to_value" TEXT,
    "comment" TEXT,
    "actor_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "media_events_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "media_events_kind_check" CHECK ("kind" IN ('referred', 'resent', 'accepted', 'sent_back', 'rejected', 'title_changed', 'stage_changed', 'held', 'resumed', 'cancelled', 'members_changed', 'content_type_changed', 'script_changed', 'publication_added', 'publication_changed', 'review_approved', 'review_sent_back'))
);
CREATE INDEX "media_events_referral_id_created_at_idx" ON "media_events"("referral_id", "created_at");
CREATE INDEX "media_events_work_id_idx" ON "media_events"("work_id");
CREATE INDEX "media_events_actor_id_idx" ON "media_events"("actor_id");
ALTER TABLE "media_events" ADD CONSTRAINT "media_events_referral_id_fkey" FOREIGN KEY ("referral_id") REFERENCES "media_referrals"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;
ALTER TABLE "media_events" ADD CONSTRAINT "media_events_work_id_fkey" FOREIGN KEY ("work_id") REFERENCES "media_works"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;
ALTER TABLE "media_events" ADD CONSTRAINT "media_events_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;
CREATE TRIGGER media_events_append_only BEFORE UPDATE OR DELETE ON "media_events" FOR EACH ROW EXECUTE FUNCTION forbid_log_change();
