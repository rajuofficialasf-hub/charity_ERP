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

## How to add an endpoint

1. **Contract first.** Add the operation to `docs/api/openapi.yaml` with every annotation of API_STANDARDS 16 (`operationId`, `tags`, `x-permission`, `x-scope`, `x-audit`, `x-idempotency`, `x-rate-limit`, responses) and run `pnpm docs:check`. A new error code goes into API_STANDARDS 8 and into `errors.<code>` in both catalogue languages (`pnpm i18n:check`).
2. **Schemas.** Write the request and response zod schemas in `packages/shared`; the PWA uses the same ones. Name specific error codes with `{ message: 'validation.<code>' }`.
3. **Route.** In `apps/api/src/routes/<module>.ts`, declare the operation with `defineRoute(router, deps, { ...spec, method, path, status?, handler })` using the same values as the contract (`operationId`, `tag`, `permission`, `scope`, `audit`, `idempotency`, `rateLimit`, `body`, `query`, `params`, `responses`); the declaration mounts the access check, the rate-limit chain, the validation and the envelope, and a write route without an audit action cannot be registered. The handler receives `{ body, query, params, req, res }` (parsed, typed) and the caller through `principalOf(req)`; keep it thin: service call, then return the value, `ok(value, meta)` or `page(rows, meta)`.
4. **Service.** Do the work in one Prisma transaction; call `AuditWriter.record(tx, …)` for every write (the request fails otherwise), enqueue jobs with `JobRunner.enqueue(queue, data, { tx })`, throw `ApiError(code, status)` for business failures, and use the pagination helpers for lists.
5. **Tests.** Unit tests for rules, an API test (Supertest) for the endpoint including its error codes, an integration test when the database is involved; the OpenAPI drift test must stay green (`pnpm test`).
6. **Docs.** Update the module's documents in the same commit.

## Never

- Commit secrets, real `.env` files, or real personal data (NIDs, phone numbers, bank details, donor data). Seeds and fixtures use obviously fake identities (TEST_STRATEGY section 4).
- Weaken an authorization check, a validation or a test to make something pass.
- Hard-delete business data, edit a migration that has been shared, or delete a migration. Every migration ships with a hand-written `down.sql`.
- Rewrite shared history: no `git push --force`, `git reset --hard` on shared branches, or `git rebase` of pushed commits.
- Hard-code user-facing text; every text is a bn/en i18n key. All numbers use English digits.

## Pushing

The project owner reviews and pushes to GitHub; CI (`.github/workflows/ci.yml`) then runs lint, typecheck, document checks, tests, build, the dependency audit and the secret scan, and E2E on `main`. Phase gates are tagged `gate-phase-N`.

The endpoint recipe above was written with the API backbone in task T1.6 and rewritten for the Express port in task T1.7d (ADR-014).
