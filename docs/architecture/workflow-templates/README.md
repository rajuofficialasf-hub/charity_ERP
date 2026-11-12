# Workflow templates

Status: written in task T0.11 (2026-10-10); seeded into the engine in task T2.5. Format, guard and effect catalogues and the code-versus-data boundary are in `docs/architecture/WORKFLOW_ENGINE.md`. Every file is validated by `schema.json` (JSON Schema 2020-12); at seed time guard, effect, permission and activity names are checked against the code registries and `docs/security/permissions.yaml`.

| File | Template key | Projects | Extends |
|---|---|---|---|
| `_common.yaml` | `_common` | shared by all: common states, common transitions, field-unlock sub-workflow, follow-up/expense/payment activities, project lifecycle | — |
| `distribution.yaml` | `distribution` | winter clothing, iftar, meat distribution | `_common` |
| `construction.yaml` | `construction` | semi-pucca and tin houses (PM final approval) | `_common` |
| `advance-voucher.yaml` | `advance_voucher` | safe water | `_common` |
| `implementation-evidence.yaml` | `implementation_evidence` | self-reliance | `_common` |
| `qurbani.yaml` | `qurbani` | Qurbani (beneficiary side as distribution; donor/animal flow) | `distribution` |
| `open-application-visit.yaml` | `open_application_visit` | tree planting (public link, site visit before approval) | `_common` |

What is data: everything in these files, plus the per-project overrides the PM sets (stage names and order where `stages.editable`, photo rule and source, limit, deadline, scoring criteria, quotas, issue types, expense categories, follow-up template, document checklist). What is code: the engine, the guard implementations, the effect handlers, the activity handlers, the bulk-screen framework, the validator and the seed step.

`defaults` holds the starting values of a new project. Four of them are checked by `schema.json` (D-172, BR-297): `identity_document` and `mobile` (`required` or `optional`) and `repeat_person` and `repeat_family` (`tell` or `hold`) become the settings of the new project's application form component. `distribution.yaml` and `qurbani.yaml` name them (optional, optional, tell, tell); a template that names none starts a project as required, required, hold, hold. They are read only when a project is created and are never written into a project that exists; the engine reads none of them, and they touch no state, transition, guard or effect.

Adding a new project type: copy the closest file, change the key, titles and stages, reuse only existing guard/effect/permission/activity names, validate, seed. See WORKFLOW_ENGINE.md section 14.
