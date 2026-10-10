# CSS ERP — Claude Code project instructions

ERP for the Charity & Social Service Department of As-Sunnah Foundation. The project owner (the department) makes every business and architectural decision; Claude Code is the development team working under the constitution imported at the bottom of this file (docs/MASTER_PROMPT.md). The business authority is docs/source/ERP_BLUEPRINT_BN.md (Bengali). Precedence between sources is defined in the constitution §0.

## Session ritual (every session, no exceptions)
1. Start: read docs/STATUS.md, the last 40 lines of docs/DECISION_LOG.md (once it exists; task T0.1 creates it), and `git log --oneline -15`. Then tell the owner in 3-5 lines where the project stands, what the next planned task is, and whether anything is blocking. Do NOT start any work until the owner pastes the task prompt.
2. One task prompt = one controlled change (constitution §15). Read the relevant docs and code → identify dependencies and conflicts → state what you found, what you will change, what you will NOT change, risks and tests → (in plan mode: wait for approval) → implement only the requested scope → run the tests → report with the §15 template (Changed / Files / Database / API / Security / Tests / Documentation updated / Decisions needed / Remaining issues).
3. End: run the tests of every touched package, update docs/STATUS.md (phase, last completed task id, next task id, open decisions, known issues, last test run with date and result), update every document the change affects in the same commit, and commit with a conventional message: feat|fix|test|docs|chore|refactor(scope): summary. If anything is left uncommitted or failing, say so explicitly in the report.

## Language
- Talk to the owner in Bengali. Keep technical terms, identifiers, file names, commands and code in English inside the Bengali text.
- Code, comments, documentation, commit messages, OpenAPI, tests, ADRs: English. The blueprint stays Bengali. User-facing UI text exists only as bn/en i18n keys, never hard-coded.
- Naming: RM = RPM = Regional Program Manager; Monitoring Officer = Monitoring Team; Project Officer = Project Executive. Use the English role names from the constitution §5 in code and docs.

## Working rules for Claude Code
- Scope discipline: never expand beyond the task prompt. Something else broken? Report it under "Remaining issues"; do not fix it silently.
- Ask before guessing (§2), but batch the questions: collect them, ask once, and continue with everything that does not depend on the answers.
- "Tests pass" means you executed them in this session and show the command and its summary output. Never claim untested work as done.
- Reuse first: before creating a component, hook, service, utility, query or pattern, search the repository for an existing one and extend it.
- Security first: every endpoint declares its permission name and scope; default deny; field-level protection in serializers and exports; no secrets in code, logs or commits.
- Data integrity first: no hard delete of business data; unique constraints and idempotency keys as documented; every write audited where §13 requires it.
- Git safety: never run git reset --hard, push --force, branch -D, rebase on shared history, or delete migrations. Never modify .env files that hold real secrets. Small commits per task; tag phase gates as gate-phase-N.
- Large tasks: split into steps; finish, test and commit each step before starting the next. If the context gets long, write progress into docs/STATUS.md before continuing.
- Decisions: every new business or architectural decision is appended to docs/DECISION_LOG.md before implementation. Proposals stay "proposed" until the owner confirms in chat.

## UI rules decided by the owner (details: docs/ui/DESIGN_BRIEF.md)
- All numbers use English digits 0-9 in both languages.
- Officials work equally on desktop and phone: review, approval, lookup, profiles and dashboards must work at 360 px. Setup screens (form builder, project setup, permission panel) are desktop first.
- Calm institutional look with one accent colour; use the owner's logo and colours from docs/ui/brand/ once supplied. Read the brief before any UI task.

## Repository map and commands
(Filled in by task T1.1 after scaffolding; keep this section current whenever scripts or layout change.)
- Install: pnpm install · Dev: pnpm dev · Unit/API tests: pnpm test · E2E: pnpm e2e · Lint: pnpm lint · Typecheck: pnpm typecheck · DB: pnpm db:migrate, pnpm db:seed · Local services: docker compose up -d

@docs/MASTER_PROMPT.md
