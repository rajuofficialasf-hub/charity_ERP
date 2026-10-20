-- A draft that was never activated can be cancelled (DECISION_LOG D-095, BR-255): it keeps its row
-- and its code, leaves the project lists, and records who cancelled it and when; the reason is in
-- the audit entry.
ALTER TABLE projects DROP CONSTRAINT projects_status_check;
ALTER TABLE projects ADD CONSTRAINT projects_status_check
  CHECK (status IN ('draft', 'active', 'closing', 'closed', 'cancelled'));
ALTER TABLE projects ADD COLUMN cancelled_at TIMESTAMPTZ(6);
ALTER TABLE projects ADD COLUMN cancelled_by UUID REFERENCES users(id) ON DELETE RESTRICT;
CREATE INDEX projects_cancelled_by_idx ON projects (cancelled_by);
