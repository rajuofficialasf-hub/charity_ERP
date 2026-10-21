# WORKFLOW AND ACTIVITY ENGINE

Status: complete, task T0.11 (2026-10-10). Design only; no code. Sources: blueprint A7 (status cycle, per-status permissions, field unlock, score/quota/waitlist), A8.1–A8.6 (project flows, edge states, stock reconciliation), B5 (configurable workflow, activity engine, bulk screens), B7 (needs verification); decisions BD-11, BD-16, BD-17, BD-18, BD-21, BD-22, BD-23, BD-24, BD-27, BD-48, O-12, O-13, O-21, O-27; permission names from `docs/security/permissions.yaml` (T0.10); request lifecycle in `docs/architecture/SYSTEM_ARCHITECTURE.md` §6. Template files: `docs/architecture/workflow-templates/` (schema `schema.json`, shared `_common.yaml`, six project-type files). Design choices made here are proposed in T0.11 and approved with the document; ADR-008 records the decision to express templates as YAML with named guards.

## 1. Purpose

Application statuses, the steps after approval and the conditions that gate them are configuration, not code (BD-11, BR-090). New project types are added by writing a template file; the engine, the guard implementations, the side-effect handlers and the activity handlers are code that never changes for a new type unless a genuinely new condition is needed (section 13, 14).

## 2. Concepts

| Term | Meaning |
|---|---|
| Workflow template | A versioned definition for one project type: states, stages, transitions, activities, defaults. One YAML file; `_common.yaml` holds the part shared by every template. |
| State | The application's position in the common cycle (section 3). Stored on `applications.status`. |
| Stage | A sub-state of `implementation`, specific to the template (e.g. `package_sent`). Stored on `applications.stage`. Names and order are per-project data overriding the template default (BR-068). |
| Transition | An allowed move from a state (or stage) to another, with the permission that may trigger it, guards that must hold, and effects that run. |
| Permission | A name from `permissions.yaml`; templates never name roles (BR-193). The person's scope is resolved by the request lifecycle before the engine runs. |
| Guard | A named condition implemented once in code; a transition lists the guards it needs. Guards read data and return pass/fail with an i18n reason key. |
| Effect | A named side effect implemented once in code (ledger entry, notification, audit, lock, activity creation). Transactional effects run in the same database transaction as the state change; deferred effects are enqueued as jobs in that transaction. |
| Activity | A unit of field work recorded in `activities` (type, stage, who, when, photos, status, outcome). Activities drive stage transitions through the bulk-update screens. |
| Outcome | A final result recorded on the application when it leaves `implementation` (distributed, not_distributed, deceased_relocated, …), so that edge cases are not confused with "completed" (BD-23). |
| Snapshot | A project copies the template at activation (BD-10); later template versions never change a running project. |

## 3. Common application cycle

States are the same in every template (BD-11) with two additions decided in the constitution: `needs_verification` (BD-48, public link) and `waitlisted` (BD-17). `deleted` is the soft-delete state for drafts and pending applications (no hard delete, §13). Permissions per state follow A7; the names are from `permissions.yaml`.

| State | Meaning (A7) | Who may act | Allowed actions |
|---|---|---|---|
| draft | Created, not sent; may live offline | main volunteer / RPM / Executive (`application.edit_draft`, `application.submit`, `application.delete_pending`); team member `application.edit_draft` on own records | edit, delete, submit |
| needs_verification | Entered from the public form or from an offline record whose identity number already exists (BD-48, O-13). A public entry (T2.3) has no beneficiary, owner volunteer or creating user; its region, district and union come from its address answer, and its `flags` tell the verifying official what the applicant was never told: `public_entry`, `existing_identity` (a live profile holds the number), `identity_blocked` (that profile is blocked), `identity_repeated` (the same NID or mobile came through the link within a day, O-08) | RPM / Executive (`application.verify_needs_verification`) | link to the existing profile and move to `submitted`, or reject with reason |
| submitted | Sent to the office, review not started | main volunteer (`application.edit_pending`, `application.delete_pending`); official (`application.review`) | volunteer edits or deletes; official takes it under review |
| under_review | An official is verifying | official (`application.review`) | edit the whole form, request a site verification, send to approval |
| reviewed | Review done, awaiting the approver | approver (`application.approve`, `application.reject`, `application.waitlist`) | approve, reject (reason), waitlist (comment) |
| waitlisted | Not approved for lack of quota or goods; kept in score order | approver (`application.waitlist` to pull, `application.reject`) | pull in one click to approved, or reject |
| approved | Final; data locked | officials (`application.unlock_field`); volunteer (`application.update_unlocked_field`) | field unlock loop only; enters `implementation` automatically |
| rejected | Not accepted, with reason | — | view only |
| implementation | The template's stages run (sub-state `stage`) | per stage (section 9) | activities, stage moves, field unlock |
| completed | Support delivered, photos and vouchers verified | officials / Official দায়ী (`followup.record`) | view; follow-up evaluations |
| closed | The project closed; everything read-only | `followup.record` only | view; follow-up evaluations |
| deleted | Soft-deleted draft or pending application | — | view in audit only |

Per-status editing rules of the team-member table (BR-041) and of BD-16/O-13 (limit counts drafts, deadline enforced at submission and at late sync) are guards, not states.

## 4. State diagram

```
                                 ┌──────────────────────────┐
  public form / offline collision│    needs_verification    │──reject (reason)──► rejected
                                 └────────────┬─────────────┘
                                    verify+link│
   ┌──────────┐  submit   ┌──────────┐  review ┌──────────────┐  send  ┌──────────┐
   │  draft   ├──────────►│submitted ├────────►│ under_review ├───────►│ reviewed │
   └────┬─────┘           └────┬─────┘         └──────────────┘        └─┬───┬──┬─┘
        │delete                │delete                            approve│   │  │waitlist
        ▼                      ▼                                         │   │  ▼
     deleted                deleted                     reject (reason)  │   │ waitlisted ──pull──► approved
                                                                         │   ▼      │
                                                                         │ rejected ◄┘ reject (reason)
                                                                         ▼
                                                                    ┌──────────┐  auto   ┌────────────────┐
                                                                    │ approved ├────────►│ implementation │ stages per template
                                                                    └──────────┘         └───────┬────────┘
                                                           field unlock loop:                     │ completion guards
                                                           open → updated → relocked            ▼
                                                           on approved / implementation / completed  ┌───────────┐  project close  ┌────────┐
                                                                                                      │ completed ├───────────────►│ closed │
                                                                                                      └───────────┘                └────────┘
                                                                                                      follow-up evaluations allowed in completed and closed
```

Project close moves every application that is not `rejected`, `deleted` or already `closed` to `closed` (O-49): draft, needs_verification, submitted, under_review, reviewed, waitlisted, approved, implementation and completed. The prior state is kept in `workflow_transitions`; applications still in `implementation` receive the outcome `not_distributed` (or the template's equivalent) with no cost (BD-23, BR-113, BR-140). The Closing step lists unfinished applications as a warning. Project reopen restores every application closed by that close to its prior state and clears the close-time outcome.

## 5. Definition format

Templates are YAML files validated by `workflow-templates/schema.json` (JSON Schema 2020-12) at seed time and in CI. Structure:

```yaml
template: distribution            # key, unique
version: 1                        # bumped on any change; projects snapshot a version
title_en: Distribution
title_bn: বিতরণ
extends: _common                  # shared states and transitions; qurbani extends distribution
projects: [winter_clothing, iftar, meat_distribution]
source: [A8.1, B5]
states: [...]                     # declared states (common ones come from _common)
stages:                           # sub-states of implementation; PM may rename/reorder when stages_editable
  editable: false
  list:
    - { key: package_sent, label_en: Package sent, label_bn: প্যাকেজ পাঠানো }
transitions:                      # state → state
  - from: implementation
    to: completed
    auto: true                    # or permission: <permissions.yaml name>
    trigger: photos.synced        # for auto transitions
    guards: [photos.required_per_rule, photos.not_pending_sync]
    effects: [outcome.set:distributed, audit:application.completed]
stage_transitions:                # stage → stage inside implementation
  - { from: null, to: package_sent, permission: stock.dispatch, activity: distribution, guards: [...], effects: [...] }
activities:                       # which activity types the template uses and how
  - type: distribution
    bulk_screen: todays_distribution
    attachments: photos_per_rule
    outcomes: [distributed, absent, later, not_distributed, shortage, damaged, partial, deceased_relocated]
project_close_guards: [stock.balanced]
defaults: { photo_rule: per_project, photo_source: camera_only, vouchers: not_used }
```

Transition fields: `from`, `to`, `permission` or `auto` + `trigger`, `guards[]`, `effects[]` (name or `name:parameter`), `requires_reason`, `requires_comment_if` (`against_score_order`), `actor_recorded_as` (`submitted_by | reviewed_by | approved_by | completed_by`). Guard and effect names must exist in the catalogues of sections 6 and 7; the schema enforces the string shape, the seed step enforces existence against the code registry.

## 6. Guard catalogue (code)

Each guard is one function in `apps/api/src/modules/applications/workflow/guards/` with the signature `(ctx) → { ok: boolean, reason?: i18nKey }`. Templates reference guards by name only.

| Guard | Holds when | Reads | Rules |
|---|---|---|---|
| project.active | project status is `active` | projects | BR-054, BR-056 |
| project.not_closed | project status is not `closed` (allows `closing`) | projects | BR-056, O-12 |
| project.setup_complete | form published, enabled components valid, areas and RPMs set, budget and fund sources set, rules texts present (project lifecycle draft → active) | projects, project_components, project_areas, forms | BR-053, BR-062 |
| template.project_close_guards | meta-guard of the project lifecycle: runs every guard listed in the project's snapshot under `project_close_guards` (e.g. `stock.balanced`, `animal_photos.complete`) | project snapshot | BR-110, O-12 |
| deadline.open | now (or the record's client creation time for a late-synced draft, flagged) is within apply_from..apply_to or an extension | projects, applications.client_created_at | BR-058, O-13 |
| limit.not_exceeded | the submitting volunteer's count of applications not rejected/deleted (drafts included) is below the project limit | applications | BR-059, O-13 |
| identity.present | NID or birth registration present and format-valid | application answers | BR-001, BR-002 |
| mandatory_fields.present | the BD-13 mandatory fields and the form version's required fields are filled | form_version, answers | BR-078 |
| beneficiary.not_blocked | the beneficiary is not on the blocklist | blocklist | BR-010, BR-015 |
| volunteer.not_blocked | the acting volunteer is not blocked | blocklist | BR-047 |
| consent.accepted | the volunteer accepted the project rules | project_volunteers.consent_at | BR-039 |
| score.comment_if_against_order | a comment exists when the decision skips a higher-scored pending application in the same quota area | application_scores, project_quotas | BR-099 |
| zakat.eligible_if_zakat_fund | if the project's fund source includes zakat, the Official দায়ী's zakat decision is "eligible" | fund_sources, answers | BR-133, BR-212 |
| receipt.confirmed | the volunteer confirmed receipt for this application's goods | stock_movements | BR-107, BR-127 |
| photos.required_per_rule | the photos the project's photo rule demands (one per beneficiary, or a group photo) are attached | project_components.settings, files | BR-066, BR-108 |
| photos.not_pending_sync | no photo of this activity is still in the device queue | sync state | BR-196 |
| stock.balanced | sent = distributed + remaining + damaged for the project (or volunteer); differences have a reason | stock_movements | BR-110 |
| stages.all_completed | every configured stage of the project is completed for this application | activities | BR-117 |
| evidence.photo_present | the final evidence photo (house, placard, tube well, garden) is attached | files | BR-117, BR-122, BR-123 |
| exam.passed | the beneficiary passed the final exam | exam_results | BR-121 |
| payment.recorded | a payment of the required type is recorded for this application | payments | BR-121, BR-123 |
| vouchers.verified | all submitted vouchers are verified | vouchers | BR-122, BR-123 |
| site_verification.recorded | a site verification with recommendation exists | site_verifications | BR-106, BR-124 |
| field_unlock.open | an open unlock exists for the field being updated | field_changes | BR-095 |
| workers.assigned | a Local দায়ী and at least one paid volunteer are assigned to the application's area | work_assignments, assignments | BR-117 |
| animals.allocated | every animal of the volunteer has a volunteer and the donor shares are complete | animals, animal_shares | BR-144, BR-145 |
| donor.notified | pre-notification sent for all donors of the animal | donor_messages | BR-147 |
| animal_photos.complete | the three photo kinds exist for the animal | animal_photos | BR-148 |

## 7. Effect catalogue (code)

Transactional effects run inside the transition's database transaction; deferred effects are enqueued (pg-boss, ADR-004) inside the same transaction and executed by the worker.

| Effect | Kind | What it does | Rules |
|---|---|---|---|
| audit:`action` | transactional | Writes the audit entry with old/new state, actor, reason | BR-179 |
| score.compute | transactional | Computes/recomputes the priority score | BR-097, O-21 |
| score.snapshot | transactional | Freezes score and criteria at the decision | O-21 |
| quota.increment / quota.decrement | transactional | Updates approved_count of the matching quota row | BR-098 |
| waitlist.enqueue / waitlist.dequeue | transactional | Adds to or removes from the ordered waitlist | BR-100 |
| ledger.post:`bucket` | transactional | Posts the ledger row for the bucket (approved, spent, beneficiary_support, advance, actual_expense, voucher_submitted, voucher_verified, returned, expense_claimed, expense_paid) | BR-128…132 |
| lock:`fields` / lock:`vouchers` / lock:`photos` | transactional | Makes the named set read-only | BR-095, BR-122 |
| unlock:field | transactional | Opens one field with a field_changes row | BR-095 |
| activity.create:`type` / activity.close:`type` | transactional | Creates or closes the linked activity | BR-125 |
| stock.recompute | transactional | Recomputes the volunteer's stock cells | BR-110 |
| outcome.set:`value` | transactional | Records the application outcome | BD-23 |
| applications.restore_prior_state | transactional | On project reopen, returns every application closed by the project close to the state recorded before the close and clears the close-time outcome | O-49 |
| profile.status:`value` | transactional | Changes the beneficiary profile status (deceased, relocated) | BR-021, O-18 |
| needs_verification.link | transactional | Links the record to the existing beneficiary profile | BR-104 |
| notify:`template` | deferred | In-app/email/SMS message via the notifications outbox | BR-214…217 |
| alert.raise:`kind` | deferred | Monitoring alert (unbalanced_stock, damaged_goods, …) | BR-173 |
| donor.email:`kind` | deferred | Emails donors (pre-notification, animal photos) with sent status | BR-147, BR-148 |

## 8. Activity model and bulk-update pattern

Activity types (B5): Distribution, Construction, Purchase, Training, Visit, Payment, Voucher, Expense, Issue, Inspection, Follow-up. One record per unit of work in `activities`: application, type, stage, done_by, done_at, photos/files, comments, status (planned / done / failed), outcome (per type), client_uuid for offline records.

| Type | Bulk screen | Row columns | Required attachments | Outcomes |
|---|---|---|---|---|
| Distribution | today's distribution | beneficiary, received ✓, photo, status | photos per rule | distributed, absent, later, not_distributed, shortage, damaged, partial, deceased_relocated |
| Training (dawah class) | today's class | beneficiary (and family members), present, topic, in progress / learned | — | present, absent (reason) |
| Construction | today's construction | beneficiary, current stage, progress %, issue, photo | photo per stage | stage_done, blocked (issue) |
| Visit (site verification) | today's visit | beneficiary, visited, result, photo | photo | recommend_approve, recommend_reject, revisit |
| Follow-up | today's follow-up | beneficiary, method, result, comments | optional photo | per follow-up template (O-23) |
| Purchase, Voucher, Payment, Expense, Issue, Inspection | single-record screens | — | voucher files, placard photo, payment copy, issue photos | per type |

Bulk-update pattern (B5, BR-126): one list (the user's assigned records for today) → tick or fill per row → one save → for every row the engine (1) validates the activity, (2) creates the activity record, (3) attempts the stage or state transition bound to that activity, running its guards and effects, (4) writes the audit entry, (5) returns a per-row result (done / failed with reason / pending photos). Offline the same rows sit in the outbox and are processed identically at sync (SYSTEM_ARCHITECTURE §7); a row whose transition fails stays in its previous stage with the reason shown, never silently accepted.

## 9. The six templates

| File | Template | Projects | Stages after approval (default) | Completion guards | Project-close guards |
|---|---|---|---|---|---|
| `distribution.yaml` | Distribution | winter clothing, iftar, meat distribution | package_sent → received → distributed | photos.required_per_rule, photos.not_pending_sync | stock.balanced |
| `construction.yaml` | Construction | semi-pucca and tin houses | worker_assigned → PM-defined stages (default foundation, wall, roof) → final_photo | stages.all_completed, evidence.photo_present | — |
| `advance-voucher.yaml` | Advance + construction + voucher | safe water | fund_sent → work_started → PM-defined stages → work_completed → voucher_submitted → verified | payment.recorded, evidence.photo_present, vouchers.verified | — |
| `implementation-evidence.yaml` | Implementation + evidence + follow-up | self-reliance | training → initial_exam → final_exam → payment → purchase → verified | exam.passed, payment.recorded, vouchers.verified, evidence.photo_present | — |
| `qurbani.yaml` | Beneficiary + donor + animal | Qurbani | beneficiary side extends distribution; donor flow imported → animal_allocated → notified → photos_sent → voucher | as distribution | stock.balanced (animals), animal_photos.complete |
| `open-application-visit.yaml` | Open application + visit | tree planting | saplings_sent → received → distributed (site verification before approval) | photos.required_per_rule, photos.not_pending_sync | stock.balanced (saplings) |

Stage keys are snake_case of the A8/B5 names; labels carry the Bengali and English texts. Where the blueprint says the PM writes the stages (house construction, safe water), `stages.editable: true` and the list is the default the PM edits per project.

## 10. Exceptions and overrides

- **PM final approval in house construction (BD-24):** the `construction.yaml` approval transition uses `application.approve` like every template; the permission's default grants already give the PM `application.approve` at PROGRAM under the condition `house_construction_only` (permissions.yaml), and the template names no role (BR-193). The RPM keeps approval too (A4 matrix row 15 shows both); the template adds the guard `approval.by_pm_required: true` → implemented as guard `approver.has_permission` with the PM condition, so that an RPM approval on a construction project is refused unless the panel grants it. Recorded in the template as `overrides.approval.require_condition: house_construction_only`.
- **Official দায়ী approval (O-27):** no template change; the RPM grants `application.approve` per project.
- **Implementer (O-26):** `advance-voucher.yaml` transitions use the ordinary permissions; the Implementer holds them through the `safe_water_only` condition.
- **Per-project overrides (data):** stage names and order (when editable), photo rule and source, limit, deadline, scoring criteria and weights, quotas, issue types, expense categories, follow-up template, document checklist. Stored in `project_components.settings` and the `projects` row (limits, deadline, quotas); the engine reads the project's snapshot, never the template file, after activation.

## 11. Project lifecycle workflow

Defined in `_common.yaml` under `project_lifecycle`: `draft → active` (`project.activate`; guards: form published, components valid, areas and RPM set, budget set, rules texts present) → `closing` (`project.close`; stops new applications) → `closed` (`project.close`; guards: template `project_close_guards`, e.g. `stock.balanced`; effects: close every unfinished application with outcome and recorded prior state (O-49), lock everything, audit) → `active` (`project.reopen`; requires reason; effect `applications.restore_prior_state`). Follow-up evaluations remain allowed in `closed` (BR-056, BR-070).

## 12. Versioning and snapshots

- Each template file carries `version`. Seeding stores templates in `workflow_definitions` (key, version, definition JSONB) and transitions in `workflow_transitions` for querying.
- At project activation the project stores `template_key`, `template_version` and a JSONB snapshot of the merged definition (template + `_common` + project overrides). All engine decisions for that project read the snapshot (BD-10).
- A template change is a new version; it applies to projects activated afterwards. Running projects are never migrated automatically; a deliberate migration is a decision with its own `down.sql`-style reversal plan.
- Template edits by PM/Head/Monitoring (`project.template.manage`) are audited (BR-064).

## 13. What is code and what is data

| Code (changes only with a developer) | Data (changes by configuration) |
|---|---|
| The engine: load snapshot, evaluate transition, run guards, apply effects, write audit, return reasons | Templates: states, stages, transitions, which guards and effects each transition uses, activity bindings, outcomes, defaults |
| Guard implementations (section 6) | Per-project overrides: stage names and order, photo rule and source, limit, deadline, scoring criteria, quotas, issue types, expense categories, follow-up template, document checklist |
| Effect handlers (section 7) | Bilingual labels of states, stages, outcomes |
| Activity handlers and the bulk-screen framework (row validation, per-row results, offline outbox) | Which activity types a template uses and their bulk screens |
| JSON Schema validator and the seed step | Workflow template versions in `workflow_definitions` and the project snapshot |
| Permission names and their checks (`permissions.yaml` is data, its enforcement is code) | Permission-panel grants and RPM project grants |

## 14. Adding a new project type by configuration

Example: "Flood relief kit" (Emergency Response program), a distribution project with an extra inspection before distribution.

1. Copy `distribution.yaml` to `flood-relief.yaml`; set `template: flood_relief`, titles, `projects: [flood_relief]`.
2. Insert a stage `inspected` between `received` and `distributed` with a stage transition `permission: site_verification.record`, `activity: inspection`, `guards: [receipt.confirmed]`, `effects: [activity.create:inspection, audit:stage.inspected]`.
3. Add `inspection` to `activities` (single-record screen, photo required).
4. Validate against `schema.json`; the seed step confirms every guard, effect, permission and activity name exists.
5. Seed; the PM selects the new template in project setup and configures photo rule, limit, deadline, quotas.

No code changed. If the flood kit needed a condition that does not exist (for example "household size verified by a second volunteer"), that one guard would be added to the catalogue in code and listed here; the template would then reference it.

## 15. Testing

- Schema validation of every template file in CI; seed step checks name existence (guards, effects, permissions, activities).
- Transition matrix tests generated from the merged definitions: for every (state, transition, permission holder, guard outcome) the expected result.
- Unit tests per guard and per effect with in-memory repositories.
- E2E per template (constitution §14 journeys): review → score → waitlist → approve → field unlock; today's distribution with photos and reconciliation; issue raise/resolve; exam → payment → voucher lock; Qurbani allocation exclusivity; tree-planting public form → verification → visit.
- Offline: late-synced draft hits `deadline.open` and `limit.not_exceeded` with the flag path (O-13); NID collision routes to `needs_verification`.

## 16. Open items

None blocking. Implementation notes for T2.5: (1) the `approver.has_permission` guard for the construction PM rule is an internal guard not exposed in templates; (2) waitlist ordering ties are broken by submission time; (3) the exact i18n reason keys for every guard are defined in T0.20/T2.5.
