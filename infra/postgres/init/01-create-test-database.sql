-- Runs once when the dev PostgreSQL volume is created. css_erp_dev is created by the image
-- (POSTGRES_DB); automated tests use css_erp_test and, from T1.2, per-file copies of it (O-46).
CREATE DATABASE css_erp_test;
