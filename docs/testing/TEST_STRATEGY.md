# TEST STRATEGY

Status: outline, written in task T0.1 (2026-10-10); completed in task T0.21. Sources: constitution §14, PROJECT_RULES §6, NFR sections 1–2.

## 1. Principles
Tested means executed; testing is part of every task; every BR with a test type gets a test; test status recorded in `docs/BUSINESS_RULES.md` section 19.

## 2. Pyramid and tools
Unit (business rules in `packages/shared`, services), integration (database constraints, cross-module), API/contract (against `openapi.yaml`), E2E (Playwright, including offline emulation), load (k6), accessibility (axe), visual regression, security (authorization matrix, IDOR, upload), data integrity (unique constraints, idempotency), smoke per deployment. Tool choices depend on D-051/D-052.

## 3. Critical E2E journeys
The twelve journeys of constitution §14 mapped to phases and gates.

## 4. Test data
Seed framework and demo data (T1.3), anonymized samples from `docs/source/samples/`, dummy OTP, never production data.

## 5. Environments and CI
What runs on every commit, before a gate, before a field rollout; test databases and storage adapters; CI provider (to be named in T1.1).

## 6. Authorization matrix testing
Generated tests from `permissions.yaml` covering every endpoint × role × scope.

## 7. Offline and sync testing
Outbox, retries, conflicts, photo queue, iOS constraints.

## 8. Load testing
Distribution-day scenario, pass criteria (NFR-02), schedule before the Phase 3 pilot and each rollout.

## 9. UAT
Bengali UAT scripts per gate in `docs/testing/uat/`; who tests at each gate (PLAN §2.4).

## 10. Reporting
How test results are reported in the §15 template and in `docs/STATUS.md`.
