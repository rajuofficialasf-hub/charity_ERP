# ADR-008: Workflow templates as YAML with named guards and effects

Status: approved with `docs/architecture/WORKFLOW_ENGINE.md` (task T0.11, 2026-10-10); derives from Q-35 and BD-11 (workflow is configuration, not code).

## Context

Blueprint B5 and BD-11 require application states, transitions and post-approval stages to be configurable so that a new project type needs configuration, not code (BD-09). Six project types exist today with different post-approval flows, one exception (PM final approval in house construction), edge states on distribution day, and conditions such as "no completion without photos" or "payment only after the exam". The same workflow must behave identically for online requests and for offline records processed at sync.

## Decision

- Templates are YAML files in `docs/architecture/workflow-templates/`, validated by a JSON Schema, seeded into `workflow_definitions` and snapshotted per project at activation (BD-10). `_common.yaml` carries the shared cycle; project types extend it.
- A transition names a **permission** from `permissions.yaml` (never a role), a list of **guards** and a list of **effects** by name. Guards and effects are implemented once in code and registered by name; the seed step fails if a template references an unknown name.
- Post-approval stages are sub-states of the common `implementation` state, so dashboards and monitoring aggregate on the same common states for every project type; stage names and order are per-project data where the blueprint says the PM writes them.
- Edge cases on distribution day are **outcomes** recorded on the application and the activity, not extra states.
- Activities (eleven types) drive stage transitions through bulk-update screens; a row that fails a guard stays where it was with a reason.

## Alternatives considered

- Hard-coded state machines per project type: fastest to start, but every new type or rule change is a release, contradicting BD-09/BD-11.
- A general BPMN engine: expressive but heavy, a new dependency, and its conditions would still need code; the department's flows are linear with a few branches.
- Fully scriptable conditions inside the YAML (expressions): flexible, but conditions would become un-reviewable code in data and could not be unit-tested one by one; named guards keep the testable surface small and explicit.

## Consequences

Positive: a new project type is a reviewed YAML file; the set of conditions is a finite, tested catalogue; permissions, audit and ledger effects are declared where the transition is, so reviews can read the whole business flow in one file; offline and online processing share one engine.

Negative: templates can only express what the guard and effect catalogues offer; a truly new condition is still code (one function) and a documentation update; the schema and the seed step must be maintained; the merged snapshot per project must be stored and read consistently.

Follow-ups: T2.5 implements the engine, guards, effects and the seed step; T0.12 specifies how sync replays transitions; T0.20 defines the i18n reason keys per guard.

## Related

Q-35, BD-09, BD-10, BD-11, BD-17, BD-18, BD-23, BD-48; BR-090…101, BR-107…127; `docs/architecture/WORKFLOW_ENGINE.md`; `docs/architecture/workflow-templates/`.
