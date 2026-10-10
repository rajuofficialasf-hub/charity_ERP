---
description: "Check that code and documentation are in sync and update the documentation"
disable-model-invocation: true
---
Check whether the code and the documentation are still synchronized: MASTER_SPEC, MODULE_CATALOG, BUSINESS_RULES (including the test-status column), DECISION_LOG, ERD, DATABASE_SCHEMA, openapi.yaml (run the drift test), RBAC and permissions.yaml, SCREENS, I18N (missing keys in bn or en), TEST_STRATEGY, STATUS.
List every mismatch, then update the documentation to match the approved implementation. Where the code contradicts an approved decision, do not change the docs: report it as a defect instead.
