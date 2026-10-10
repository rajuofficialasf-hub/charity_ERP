Session end for the current task.
1. Run the tests of every touched package (unit, API, and E2E if the task touched UI flows) and show the command and summary output.
2. Update docs/STATUS.md: phase, last completed task id, next task id, open decisions, known issues, last test run (date, command, result).
3. Verify every document affected by this task was updated in the same change (MASTER_SPEC, BUSINESS_RULES, DECISION_LOG, ERD/DATABASE_SCHEMA, openapi.yaml, RBAC/permissions.yaml, SCREENS, I18N, TEST_STRATEGY as applicable).
4. Commit with a conventional message. If anything cannot be committed or is failing, say so explicitly.
5. Give the §15 report (Changed / Files / Database / API / Security / Tests / Documentation updated / Decisions needed / Remaining issues) in Bengali with English technical terms.
