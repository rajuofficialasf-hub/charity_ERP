# WORKFLOW AND ACTIVITY ENGINE

Status: outline, written in task T0.1 (2026-10-10); completed in task T0.11 together with the six template definitions in `docs/architecture/workflow-templates/`. Depends on open questions 12 (Closing state), 13 (limits), 21 (score timing).

## 1. Purpose
Configurable states and transitions for applications and project activities (BD-11, BR-090); nothing project-specific in code.

## 2. Concepts
State, transition, actor (role or permission), guard (named condition implemented in code and referenced by name), action (side effect such as ledger entry or notification), template, stage.

## 3. Common application cycle
Draft → Submitted → Under Review → Reviewed → Approved / Rejected → Implementation or Distribution → Completed → Closed; per-status permissions (BR-091); waitlist as a sub-state of Reviewed/Approved to be defined.

## 4. Template model
YAML/JSON structure of a template: states, transitions, guards, actions, stages after approval; how a project binds a template and overrides stage names (BR-068).

## 5. The six templates
Distribution; Construction; Advance + construction + voucher; Implementation + evidence + follow-up; Beneficiary + donor + animal (Qurbani); Open application + visit (tree planting). One file each under `workflow-templates/`.

## 6. Guard catalogue
Named guards: photos present per photo rule, stock balanced, exam passed, vouchers verified, consent given, within deadline, under limit, score comment present, project not closed, field unlock open.

## 7. Activity engine
Common activity record (type, stage, who, when, photos, status) and how bulk screens produce activities; relation to the ledger and monitoring.

## 8. Field unlock loop
How unlock, update, verify and re-lock are modelled as transitions with `field_changes`.

## 9. Project lifecycle
Draft → Active → Closing → Closed and reopen, as a second small workflow.

## 10. Versioning and migration of templates
What happens to running applications when a template changes; snapshots per project (BD-10).

## 11. Testing
Unit tests per transition and guard; template validation test; E2E journeys that exercise each template.
