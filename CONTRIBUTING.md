# Contributing to the CSS ERP

This repository is built by the department's in-house team with Claude Code under the project constitution (`docs/MASTER_PROMPT.md`). The project owner (the Charity & Social Service Department) makes every business and architectural decision. These rules apply to every change, by a person or by Claude Code.

## One task, one controlled change

- Every change starts from a task prompt (`docs/PLAN.md`) or an owner instruction. Stay inside its scope; something else broken goes into the report under "Remaining issues", it is not fixed silently.
- Read the relevant documents first (`docs/STATUS.md`, `docs/DECISION_LOG.md`, the architecture document of the area). Business rules live in `docs/BUSINESS_RULES.md` (BR-nnn), decisions in `docs/DECISION_LOG.md`.
- A new business or architectural decision is written into `docs/DECISION_LOG.md` before it is implemented, and stays "proposed" until the owner confirms it.
- Reuse first: search for an existing component, service, utility or pattern before creating one.
- Documents change in the same commit as the code they describe.

## Commits

Small, coherent commits with a conventional message:

```
<type>(<scope>): <summary in the imperative, lower case>
```

| Type | Use for |
|---|---|
| `feat` | New behaviour for users |
| `fix` | A bug fix |
| `test` | Tests only |
| `docs` | Documentation only |
| `chore` | Tooling, configuration, scaffolding, dependencies |
| `refactor` | Code change without behaviour change |
| `ci` | The CI pipeline |

The scope names the module or area, for example `feat(application): …`, `fix(sync): …`, `test(payment): …`, `docs(erd): …`, `chore(scaffold): …`. The body explains why, and names the BR, decision or task ids involved.

Commits written with Claude Code end with its `Co-Authored-By` trailer.

## Before every commit

Run, from the repository root, and fix every failure:

```bash
pnpm lint
pnpm typecheck
pnpm test
```

Run `pnpm e2e` when a change touches pages or user journeys, and `pnpm docs:check` when it touches `docs/security/permissions.yaml`, `docs/api/openapi.yaml`, workflow templates or JSON Schemas. "Tests pass" means they were executed and passed; never report untested work as done.

Tests name the rule they prove: `it('BR-097 score recomputed on answer change', …)`.

## Never

- Commit secrets, real `.env` files, or real personal data (NIDs, phone numbers, bank details, donor data). Seeds and fixtures use obviously fake identities (TEST_STRATEGY section 4).
- Weaken an authorization check, a validation or a test to make something pass.
- Hard-delete business data, edit a migration that has been shared, or delete a migration. Every migration ships with a hand-written `down.sql`.
- Rewrite shared history: no `git push --force`, `git reset --hard` on shared branches, or `git rebase` of pushed commits.
- Hard-code user-facing text; every text is a bn/en i18n key. All numbers use English digits.

## Pushing

The project owner reviews and pushes to GitHub; CI (`.github/workflows/ci.yml`) then runs lint, typecheck, document checks, tests, build, the dependency audit and the secret scan, and E2E on `main`. Phase gates are tagged `gate-phase-N`.

How to add an endpoint (envelope, validation, permission and scope, audit, OpenAPI) is added to this file with the API backbone in task T1.6.
