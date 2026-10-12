-- Database roles and privileges (DATABASE_SCHEMA section 23). Idempotent; NOT run by the
-- migrations. Applied by the deployment (T3.0) as a superuser after `prisma migrate deploy`, and
-- again after every migration that adds tables. Passwords are set outside this file
-- (ALTER ROLE ... PASSWORD from the server's secret store); never commit them.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'css_migrate') THEN CREATE ROLE css_migrate NOLOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'css_app') THEN CREATE ROLE css_app NOLOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'css_jobs_cleanup') THEN CREATE ROLE css_jobs_cleanup NOLOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'css_readonly') THEN CREATE ROLE css_readonly NOLOGIN; END IF;
END $$;

-- css_migrate owns the schema and runs DDL (one-shot migration container, ADR-003).
GRANT ALL ON SCHEMA public TO css_migrate;

-- css_app: read and write business data, no DELETE, no DDL.
GRANT USAGE ON SCHEMA public TO css_app;
GRANT SELECT, INSERT, UPDATE ON ALL TABLES IN SCHEMA public TO css_app;
-- Append-only logs: INSERT only (the triggers of D-060 refuse changes for every role as well).
REVOKE UPDATE ON audit_log, budget_ledger, stock_movements, document_events, application_transfers,
  volunteer_categories_log, workflow_transitions FROM css_app;

-- css_jobs_cleanup: the only deletions the system performs (section 21); the jobs also set
-- css.cleanup = on, which the status-log trigger requires.
GRANT USAGE ON SCHEMA public TO css_jobs_cleanup;
GRANT SELECT, DELETE ON otp_codes, upload_sessions TO css_jobs_cleanup;
GRANT SELECT, UPDATE ON files TO css_jobs_cleanup;
-- Expired unsubmitted registration drafts and their photo rows go only through the purge
-- function, never a table-wide DELETE on files (DECISION_LOG D-082; DATABASE_SCHEMA 21).
GRANT EXECUTE ON FUNCTION purge_expired_registration_drafts(integer) TO css_jobs_cleanup;
-- A replaced registration photo (second upload to a draft slot), the same narrow way.
GRANT EXECUTE ON FUNCTION discard_registration_photo(uuid) TO css_app;

-- css_readonly: reporting views without sensitive columns are added with the reports module;
-- until then it may read the two summary views only.
GRANT USAGE ON SCHEMA public TO css_readonly;
GRANT SELECT ON stock_balances, project_budget_summary TO css_readonly;
