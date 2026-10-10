Review the "$ARGUMENTS" module against docs/MASTER_SPEC.md, docs/BUSINESS_RULES.md, docs/security/RBAC.md and docs/api/API_STANDARDS.md.
If subagents are available, split the review: (a) business-rule compliance, (b) authorization and field-level protection including IDOR, (c) tests and coverage, (d) code quality (duplicated logic, hard-coded strings or permissions, magic numbers, performance risks such as N+1 queries and unpaginated lists).
Report a prioritized list (critical / major / minor) with file references. Do not refactor or fix anything yet; give me the list first.
