-- One open draft per form, and a one-way life for a version: draft → published → retired. The
-- children of a non-draft version (sections, fields, options) are already frozen by
-- forbid_published_form_change; this guards the version row itself, so a published version can
-- neither go back to draft nor change what it is. Additive: one partial unique index, one trigger.
CREATE UNIQUE INDEX "form_versions_one_draft_key" ON "form_versions"("form_id") WHERE (status = 'draft');

CREATE FUNCTION guard_form_version_status() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.status = 'draft' THEN
    IF NEW.status = 'draft' THEN
      RETURN NEW;
    END IF;
    IF NEW.status = 'published' AND NEW.published_at IS NOT NULL AND NEW.published_by IS NOT NULL THEN
      RETURN NEW;
    END IF;
    RAISE EXCEPTION 'form_version_transition: a draft becomes published with its stamp, nothing else'
      USING ERRCODE = '23514';
  END IF;
  -- a published or retired row keeps what it is; only the status may move, and only once
  IF NEW.form_id IS DISTINCT FROM OLD.form_id
     OR NEW.version_no IS DISTINCT FROM OLD.version_no
     OR NEW.published_at IS DISTINCT FROM OLD.published_at
     OR NEW.published_by IS DISTINCT FROM OLD.published_by
     OR NEW.created_at IS DISTINCT FROM OLD.created_at
     OR NEW.created_by IS DISTINCT FROM OLD.created_by THEN
    RAISE EXCEPTION 'form_version_transition: a % version does not change', OLD.status
      USING ERRCODE = '23514';
  END IF;
  IF NEW.status = OLD.status THEN
    RETURN NEW;
  END IF;
  IF OLD.status = 'published' AND NEW.status = 'retired' THEN
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'form_version_transition: a % version cannot become %', OLD.status, NEW.status
    USING ERRCODE = '23514';
END $$;
CREATE TRIGGER form_versions_status_guard BEFORE UPDATE ON "form_versions"
  FOR EACH ROW EXECUTE FUNCTION guard_form_version_status();
