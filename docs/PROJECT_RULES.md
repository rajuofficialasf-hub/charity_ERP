# PROJECT RULES — process checklists

Status: complete, task T0.1 (2026-10-10). This file turns the process rules of the constitution (`docs/MASTER_PROMPT.md` §0, §2, §3, §13, §14, §15, §18) and of `CLAUDE.md` into checklists. The constitution remains the authority; if a line here contradicts it, the constitution wins and the contradiction is reported.

## 1. Precedence (constitution §0)

When instructions conflict, resolve in this order and report the contradiction:

1. The latest explicit instruction from the project owner in the conversation.
2. The blueprint `docs/source/ERP_BLUEPRINT_BN.md` (Bengali) for how the department works.
3. `docs/DECISION_LOG.md` (approved decisions; proposals do not count until approved).
4. The constitution `docs/MASTER_PROMPT.md`.
5. The other project documents of §3 (MASTER_SPEC, BUSINESS_RULES, architecture, database, API, security, UI, testing).
6. Existing code.
7. General best practice.

A blueprint item marked "(প্রস্তাবিত)" is a proposal; where the constitution §7 or DECISION_LOG approves it, it is approved.

## 2. Session ritual (CLAUDE.md)

Start of every session:
- [ ] Read `docs/STATUS.md`.
- [ ] Read the last 40 lines of `docs/DECISION_LOG.md`.
- [ ] Run `git status` and `git log --oneline -15`.
- [ ] Tell the owner in 3–5 lines (Bengali): phase, last completed task, next task, open decisions, anything uncommitted or failing.
- [ ] Do not start any work until the owner pastes the task prompt.

End of every task:
- [ ] Run the tests of every touched package and show the command and summary output.
- [ ] Update `docs/STATUS.md`: phase, last completed task id, next task id, open decisions, known issues, last test run (date, command, result).
- [ ] Update every document the change affects, in the same commit.
- [ ] Commit with a conventional message: `feat|fix|test|docs|chore|refactor(scope): summary`.
- [ ] Say explicitly if anything is uncommitted or failing.
- [ ] Give the §15 report in Bengali with English technical terms.

## 3. One task prompt = one controlled change (constitution §15)

Before coding:
- [ ] Read the relevant documents and current code.
- [ ] Identify dependencies and conflicts (blueprint sections, BD/BR ids, DECISION_LOG entries, existing modules).
- [ ] State briefly: what was found, what will change, what will NOT change, risks, tests to add.
- [ ] In plan mode: wait for approval.

While implementing:
- [ ] Implement only the requested scope; reuse the existing architecture, components, services and patterns.
- [ ] Add or update tests and documentation in the same change.
- [ ] Split large tasks into steps; finish, test and commit each step before the next; write progress into `docs/STATUS.md` when the context grows long.

After implementing:
- [ ] Verify by running the tests.
- [ ] Report with the template:

```
### Changed
### Files
### Database (schema / migrations)
### API (contract changes)
### Security (permissions, sensitive data)
### Tests (created, executed, results)
### Documentation updated
### Decisions needed / open questions
### Remaining issues
```

## 4. Governing principles as do / don't (constitution §2, §18)

Do:
- [ ] Name every ambiguity, list the interpretations and consequences, recommend the safest, and ask the owner; batch the questions and continue with everything that does not depend on them.
- [ ] Ask only when the answer affects business rules, data structure, API contracts, security, permissions, workflows, money or major UX.
- [ ] Stop and explain when a change to business rules, names, relationships, contracts, auth, permission names, workflow states, status definitions, reusable components, naming conventions, data ownership, audit requirements or localization seems necessary; wait for approval; record it in `docs/DECISION_LOG.md`.
- [ ] Record every approved decision in `docs/DECISION_LOG.md` before implementation.
- [ ] Give every business rule an id (BR-nnn) in `docs/BUSINESS_RULES.md` and, where testable, an automated test.
- [ ] Enforce authorization server-side; default deny; the UI only reflects it.
- [ ] Use transactions, unique constraints, idempotency keys, validation, audit history and correction workflows.
- [ ] Keep one deployable backend, one database, one PWA frontend.
- [ ] Search for an existing component, service or pattern before creating one.
- [ ] Keep code and documents synchronized in the same change.
- [ ] Say "tests pass" only when they were executed in this session and the output is shown.

Don't:
- [ ] Guess or silently pick an interpretation of an ambiguous requirement.
- [ ] Silently change anything in the list above.
- [ ] Hard-delete business data.
- [ ] Weaken security for convenience, a failing test or a difficult flow.
- [ ] Introduce microservices, message buses or distributed systems without a demonstrated and approved need.
- [ ] Expand beyond the task prompt; something else broken is reported under "Remaining issues".
- [ ] Claim untested work as done.
- [ ] Write application code in Phase 0 (no `apps/`, `packages/` before the Phase 0 sign-off).

## 5. Documentation sync map (constitution §3)

Which document must change with which kind of change:

| Change | Documents to update in the same commit |
|---|---|
| Any business rule | `BUSINESS_RULES.md` (BR id, status, test status), `MASTER_SPEC.md` if the behaviour description changes |
| Any decision (business or technical) | `DECISION_LOG.md` first; then the documents it affects |
| Table, column, constraint, index, migration | `database/ERD.md`, `database/DATABASE_SCHEMA.md`, migration with hand-written `down.sql` |
| Endpoint, request/response, error code | `api/openapi.yaml`, `api/API_STANDARDS.md` if a convention changes |
| Permission name, default, scope | `security/permissions.yaml` (single source of truth), `security/RBAC.md` |
| Authentication, sessions, devices | `architecture/AUTH.md`, `security/SECURITY_POLICY.md` |
| Workflow state, transition, guard, template | `architecture/WORKFLOW_ENGINE.md`, `architecture/workflow-templates/` |
| Offline record, sync, conflict rule | `architecture/OFFLINE_SYNC.md` |
| File storage, upload, documents | `architecture/FILES_AND_DOCUMENTS.md` |
| Notification, email, SMS | `architecture/NOTIFICATIONS.md` |
| Technical decision with alternatives | one ADR in `architecture/ADR/` |
| Screen added or changed | `ui/SCREENS.md`; `ui/DESIGN_SYSTEM.md` if a component or token changes |
| i18n key, language, number or date formatting | `ui/I18N.md` |
| Test type, tool, critical journey | `testing/TEST_STRATEGY.md`; UAT scripts in `testing/uat/` per gate |
| Module scope, dependency, phase | `MODULE_CATALOG.md` |
| Non-functional target | `NON_FUNCTIONAL_REQUIREMENTS.md` |
| Deployment, backup, operations | `ops/DEPLOYMENT.md`, `ops/RUNBOOK.md` |
| Scripts, repository layout, commands | `CLAUDE.md` "Repository map and commands", `README.md` |
| Every task | `STATUS.md` |

Documentation language: English (the blueprint stays Bengali). User-facing text exists only as bn/en i18n keys.

## 6. Testing rules (constitution §14)

- [ ] Testing is part of every task, not a final activity.
- [ ] Pyramid: unit tests for every testable BR; integration tests for cross-module behaviour; API/contract tests against `openapi.yaml`; Playwright E2E for critical journeys; k6 load tests for distribution-day concurrency; axe for accessibility; visual regression for key screens; security tests (authorization matrix, IDOR, upload); data-integrity tests (unique constraints, idempotency); smoke tests per deployment.
- [ ] "Tests pass" means executed in this session with the command and summary output shown.
- [ ] Production data is never used in tests; dummy OTP and seed data never reach production (BD-49).

Critical E2E journeys (each must have a Playwright test before its phase gate):
1. Login/logout and role-based denial.
2. Volunteer registration with OTP and approval.
3. Mobile application with NID auto-fill, offline capture and sync.
4. Review, score, waitlist, approval, field unlock.
5. Application transfer.
6. Today's distribution with photos and reconciliation.
7. Expense claim and payment with unique transaction id.
8. House-construction issue raise/resolve.
9. Self-reliance exam → payment → voucher lock.
10. Qurbani allocation exclusivity.
11. Document deadline warning and deficiency report.
12. Language switch.

## 7. Security and data-integrity checklist (constitution §13)

Every endpoint:
- [ ] Declares auth, permission name and scope; default deny.
- [ ] Object-level and function-level authorization checks; no IDOR.
- [ ] Input validation with error codes and localized messages.
- [ ] Idempotency keys for sync and payments; rate limiting on auth and public forms.
- [ ] Never leaks stack traces or SQL.

Every serializer and export:
- [ ] Field-level protection: NID numbers and photos, bank details, ratings, categories, donor data and the official section are visible to authorized officials only, never to volunteers.

Every write:
- [ ] Audit log entry where §13 requires it (permission and role changes, approvals and rejections, field unlock, blocklist, transfer, handover, merge and reversal, payments and expense verification, animal allocation, nisab changes, deletion, template changes, document deadline extensions, deficiency reports, media consent, exports of sensitive data).
- [ ] Transaction; unique and check constraints; soft delete only where approved; audit columns (created_by/at, updated_by/at).

Files:
- [ ] Type and size checks, virus-scan hook; private files only through signed expiring URLs after an authorization check.

Secrets:
- [ ] Never in code, logs or commits; `.env` files with real secrets are never modified or read by Claude.

## 8. Git rules (CLAUDE.md, constitution §13)

Allowed:
- [ ] Small coherent commits per task or step; conventional messages with scope.
- [ ] Phase gates tagged `gate-phase-N`.
- [ ] Commit messages end with the attribution trailer required by the session.

Forbidden:
- [ ] `git reset --hard`, `push --force`, `branch -D`, rebase on shared history, deleting migrations, rewriting history.
- [ ] Committing secrets or `.env` with secrets.
- [ ] Committing with failing tests without saying so in the report.

## 9. Decision logging (constitution §2, §7)

- [ ] Every new business or architectural decision is appended to `docs/DECISION_LOG.md` with id, date, decision, rationale, affected modules and documents, approved-by, before implementation.
- [ ] Proposals carry status "proposed" until the owner confirms in chat; then the status becomes "approved" with the date.
- [ ] BD-01…BD-49 are never reopened without the owner's approval.
- [ ] A changed blueprint is handled with `/css-change`: impact analysis first, then log, then implement.

## 10. Definition of Done (constitution §15)

- [ ] Requirement satisfied.
- [ ] Business rule documented (BR id, status).
- [ ] Database, API, authorization, validation, UI, localization and audit implemented where applicable.
- [ ] Unit, integration, API and relevant E2E tests executed and passing.
- [ ] Security and accessibility checks passed.
- [ ] Documentation updated (section 5 map).
- [ ] No known critical regression.
- [ ] `docs/STATUS.md` updated and the work committed.

## 11. Change-impact checklist for significant changes (constitution §15)

- [ ] Database: tables, columns, constraints, migration and `down.sql`, data backfill.
- [ ] API: contract, versioning, error codes, OpenAPI update, drift test.
- [ ] UI: screens, components, i18n keys in bn and en, mobile width 360 px.
- [ ] Security: permissions, scopes, field-level protection, audit.
- [ ] Tests: unit, integration, API, E2E, load where field-facing.
- [ ] Existing modules: callers, shared business logic in `packages/shared`.
- [ ] Migration of existing data; deployment and runbook steps.

## 12. Language and naming (CLAUDE.md, constitution §11)

- [ ] Chat with the owner in Bengali; technical terms, identifiers, file names, commands and code stay English inside the Bengali text.
- [ ] Code, comments, documentation, commit messages, OpenAPI, tests, ADRs: English. The blueprint stays Bengali.
- [ ] User-facing text only as bn/en i18n keys; never hard-coded.
- [ ] All numbers (amounts, dates, counts, ids, phone numbers) use English digits 0–9 in both languages (UX-05); formatting lives in one central utility.
- [ ] Role names in code and docs: Department Head, Monitoring Team, Program Manager (PM), Regional Program Manager (RPM), Project Executive, Official দায়ী, Procurement Team, Media Team, Finance Team; volunteer types General, Local দায়ী, Both, Team Member, Paid Volunteer. RM = RPM; Monitoring Officer = Monitoring Team; Project Officer = Project Executive.
- [ ] Form labels, section names, options, statuses and stage names are bilingual data.

## 13. UI rules (CLAUDE.md, docs/ui/DESIGN_BRIEF.md)

- [ ] Read `docs/ui/DESIGN_BRIEF.md` and `docs/ui/brand/colors.md` before any UI task.
- [ ] Officials' screens (review, approval, lookup, profiles, dashboards) work at 360 px; setup screens are desktop first with a notice on phones.
- [ ] Colours and fonts only from `docs/ui/brand/colors.md`; font stack UbuntuSans, Bornomala, sans-serif, weights 400 and 700.
- [ ] Base components are built once in the design system and reused; no per-page invention.
- [ ] Status colours only for status, always with an icon and a label.
