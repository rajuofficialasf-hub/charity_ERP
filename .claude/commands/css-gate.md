---
description: "Phase gate: docs sync, review, full tests, Bengali UAT script, release notes, git tag"
argument-hint: "[phase number]"
disable-model-invocation: true
---
Phase gate for phase $ARGUMENTS. Run in this order and report each step; do not start work that belongs to the next phase.
1. Documentation sync for every module of this phase (same checks as /css-docsync); fix the docs.
2. Review each module of this phase against MASTER_SPEC, BUSINESS_RULES, RBAC, API_STANDARDS (use subagents in parallel if available): rule violations, missing authorization or field-level protection, missing tests, duplicated logic, hard-coded strings, performance risks. Fix critical findings now with tests; log the rest in docs/STATUS.md under known issues.
3. Run the complete test suite (unit, API/contract, E2E, axe) and paste the summary. List the BR-ids still untested and why.
4. Write docs/testing/uat/PHASE_<N>_UAT_BN.md: a Bengali UAT script for the real testers of this phase, scenario by scenario with expected results, the demo accounts to use, and a feedback table (ক্রমিক, পর্দা, কী হলো, কী হওয়ার কথা, গুরুত্ব).
5. Write docs/gates/PHASE_<N>_RELEASE_NOTES.md (English, with a Bengali summary at the top).
6. Update docs/STATUS.md (phase <N> complete pending UAT; next task id), commit, and tag gate-phase-<N>.
