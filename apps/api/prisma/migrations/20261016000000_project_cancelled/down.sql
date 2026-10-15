-- Cancelled projects become drafts again (the audit log still records the cancel).
UPDATE projects SET status = 'draft' WHERE status = 'cancelled';
DROP INDEX projects_cancelled_by_idx;
ALTER TABLE projects DROP COLUMN cancelled_by;
ALTER TABLE projects DROP COLUMN cancelled_at;
ALTER TABLE projects DROP CONSTRAINT projects_status_check;
ALTER TABLE projects ADD CONSTRAINT projects_status_check
  CHECK (status IN ('draft', 'active', 'closing', 'closed'));
