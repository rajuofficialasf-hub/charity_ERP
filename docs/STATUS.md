# Project status (Claude updates this at the end of every task; read it at the start of every session)

- Last updated: 2026-10-10
- Current phase: 0 (Requirement & Architecture Freeze) - IN PROGRESS
- Last completed task: T0.8 - System architecture and ADRs: docs/architecture/SYSTEM_ARCHITECTURE.md complete; ADR-001..006 written; ADR index renumbered (007..011 planned). Design choices made in T0.8 were approved by the owner on 2026-10-10 as D-054..D-057 with implementation requirements (see DECISION_LOG section 3 and SYSTEM_ARCHITECTURE sections 2.1 and 10). (T0.1 and T0.7 done the same day; T0.2..T0.6 delivered inside T0.1.)
- T0.9 done (2026-10-10): docs/architecture/AUTH.md complete (registration with two OTPs and the dummy-OTP path, password rules, tokens and device sessions, lockout, account states, remote revocation and local wipe, permission-version refresh, handover, Main Admin protection, rate limits, audit events). Values not covered by O-05 were proposed in AUTH.md section 14 and approved the same day as O-25 (BR-231..233).
- T0.10 done (2026-10-10): docs/security/permissions.yaml is the machine-readable source of truth (roles, scopes, conditions, three permission sets, sensitive-field catalogue, permissions with default grants); docs/security/RBAC.md explains the model, resolves scopes, shows the default matrix for A4's two tables plus Official daee and Implementer, and specifies enforcement and tests. Name consistency between the two files checked with a script. The six interpretations of RBAC.md section 11 were confirmed the same day (O-26), with two refinements: the RPM may grant application approval to an Official daee per project (O-27), and the Media Team works in its own Media tab with a beneficiary work list (O-28; new entity media_subjects, permission media.subject.manage, BR-234..235).
- T0.11 done (2026-10-10): docs/architecture/WORKFLOW_ENGINE.md complete (common cycle with needs_verification and waitlisted, state diagram, definition format, guard and effect catalogues, activity model and bulk-update pattern, overrides, project lifecycle, versioning, code-vs-data table, worked example of a new project type); workflow-templates/ holds schema.json, _common.yaml and the six templates; ADR-008 written. Design choices approved with the document: post-approval stages are sub-states of implementation; edge cases are outcomes, not states; soft-delete state `deleted` for drafts and pending applications.
- T0.12 done (2026-10-10): docs/architecture/OFFLINE_SYNC.md complete (cached data set, outbox record and lifecycle, batch and snapshot endpoints, photo queue and resumable upload, conflict rules per record kind, offline NID path, encrypted storage and wipe, form-version handling, sync UI, iOS section, sequence diagrams, test strategy); ADR-010 written. Values not covered by O-07/O-13 were proposed as question 26 and decided the same day as O-29 with additional requirements (Retry-After, payload-size limit, no automatic deletion of unsynced files, secure device-bound keys, recovery table, required tests).
- T0.13 done (2026-10-10): docs/architecture/FILES_AND_DOCUMENTS.md complete (file kinds and metadata model, signed-URL access, upload pipeline with 256 KB chunks and virus-scan hook, validation table, image handling with EXIF/GPS capture and pHash duplicate warning, per-project photo source setting with the web realisation and its trade-offs, bucket and key layout per SOP 10, SOP document register with status chain, hard-copy codes and retention, working-day deadline countdown and non-compliance, deficiency reports with escalation and legacy marking, quarterly audit report, media consent gating, locks, storage growth, tests). Proposals = open question 27; hard-copy code segments and the 11 deficiency fields wait for the SOP text.
- Next task: T0.14 - Notifications (docs/architecture/NOTIFICATIONS.md); decide Web Push and the PWA short name.
- Blocking items: none.

## Deliverables of T0.1 (complete vs outline)
Complete:
- docs/MASTER_SPEC.md (Parts A, B, C, D, both appendices, open questions)
- docs/PROJECT_RULES.md
- docs/MODULE_CATALOG.md (22 modules)
- docs/BUSINESS_RULES.md (BR-001..BR-227, gaps list; test-status register empty until code exists)
- docs/DECISION_LOG.md (Q-01..Q-47, BD-01..BD-49, D-050..D-053 proposed, UX-01..UX-13 approved, Open 1..23)
- docs/NON_FUNCTIONAL_REQUIREMENTS.md (NFR-01..NFR-59, PROPOSAL rows need approval)

- docs/architecture/SYSTEM_ARCHITECTURE.md and ADR/ADR-001..006 (T0.8)
- docs/architecture/AUTH.md (T0.9)
- docs/security/RBAC.md and permissions.yaml (T0.10)
- docs/architecture/WORKFLOW_ENGINE.md, workflow-templates/ (schema, _common, six templates), ADR-008 (T0.11)
- docs/architecture/OFFLINE_SYNC.md, ADR-010 (T0.12)
- docs/architecture/FILES_AND_DOCUMENTS.md (T0.13)

Outlines (headings plus one line per section; completed in the task named in each file):
- docs/architecture/NOTIFICATIONS.md (T0.14)
- docs/database/ERD.md (T0.15), DATABASE_SCHEMA.md (T0.16)
- docs/api/API_STANDARDS.md (T0.17), openapi.yaml skeleton (T0.18)
- docs/security/SECURITY_POLICY.md (T0.21)
- docs/ui/DESIGN_SYSTEM.md and SCREENS.md (T0.19), I18N.md (T0.20)
- docs/testing/TEST_STRATEGY.md (T0.21), testing/uat/README.md, gates/README.md
- docs/ops/DEPLOYMENT.md and RUNBOOK.md (T3.0, T6.5)

## Open decisions waiting on the owner
- Open question 27 (FILES_AND_DOCUMENTS.md section 15): virus-scan behaviour, duplicate threshold, capture freshness window, thumbnail/video/exports limits, profiles backup key, flagged-photo alert; recommendations in DECISION_LOG section 6. Items 5 (SOP code segments, deficiency fields) wait for the SOP text.
- Question 26 answered by O-29 (offline sync and mobile storage requirements, BR-236..238). RBAC interpretations confirmed by O-26..O-28. Question 25 answered by O-25 (all seven authentication proposals accepted). Question 24 answered by O-24 (officials enter payment records manually). The T0.8 architecture choices are approved as D-054..D-057 with implementation requirements (worker retries/graceful shutdown/timeouts/idempotency; zod + DB constraints; Caddy with HTTPS and network hardening; monitoring and essential alerting from launch, error-tracking service deferred to T3.0).
- Interpretations recorded in O-03 (BEN-ID = UUID v7, no short display form), O-09 (initial load from an open dataset), O-16 (admin holiday calendar for public holidays) and O-22 (entry stays with officials) stand unless the owner corrects them.
- PWA short name for the phone home screen (open item of UX-09, proposal CSS) and whether to add Web Push (decide in task T0.14).
- Confirm with the web developer where the Bornomala font comes from (UX-13). The files declare the SIL Open Font License 1.0 and name Codepotro as vendor, but no public page confirms it.
- Remaining PROPOSAL rows of docs/NON_FUNCTIONAL_REQUIREMENTS.md (section 13) need the owner's or the IT team's confirmation in T0.21 (NFR-22 photo queue, NFR-35 and NFR-40 are now decided).

## Prerequisites still open (checked 2026-10-10)
- SOP v2.3 text (docs/source/SOP_v2.3_BN.md or .pdf) is needed for the seven document checklists, the 11 deficiency-report items and the hard-copy code structure (BR-162, BR-165, BR-167; tasks T0.4 detail, T1.13, T5.4).
- pnpm is not installed on the owner's machine; needed from T1.1 (`npm install -g pnpm`).
- Docker Desktop was not running; needed from T1.1 (postgres, minio, mailpit via Docker Compose).
- The CI provider is to be named in T1.1.
- Other input files not yet supplied: see docs/source/README.md.

## Known issues / risks
- The blueprint contradicts itself on beneficiary mobile uniqueness (B3 layer table and diagram image4 vs B3 rules, Q-21, BD-01). Resolved by O-02 (not unique); the blueprint text itself is unchanged and the owner may align it in a later version.
- O-09 drops the ward level named in constitution section 6 and blueprint B2/B3; the constitution text is not edited (DECISION_LOG outranks it per section 0).
- docs/api/openapi.yaml and docs/security/permissions.yaml were checked visually only; no YAML parser is installed on this machine (PyYAML missing). They are parsed in CI from T1.1.

## Last test run
- none (Phase 0, documents only). Verification done on 2026-10-10 after T0.8: SYSTEM_ARCHITECTURE has 13 sections with the deployment diagram and the request-check order; six ADR files plus README exist; 230 unique BR ids; DECISION_LOG row counts Q 47 / BD 49 / D 4 / UX 13 / O 23; git working tree clean.

## Notes for the next session
- The model and effort level for every task are in docs/MODEL_GUIDE.md. It is the owner's reference; Claude Code does not switch models by itself. The rows marked ছাড় নেই (no downgrade) must not be run on a lower model when a usage limit runs out.
- Brand assets are in docs/ui/brand/: colors.md, logo.png, logo.svg and fonts/ with licence texts (copied from the website on 2026-10-10).
- Design interview held on 2026-10-10: owner decisions UX-01 to UX-13 are in docs/ui/DESIGN_BRIEF.md and were imported into docs/DECISION_LOG.md in T0.1. There is no Figma file; clickable HTML mockups are built in task T0.19b.
- Owner answers to open questions are recorded as O-nn (same number as the question) in docs/DECISION_LOG.md; every affected document is then updated in the same change (T0.7).
- Git remote: origin is https://github.com/rajuofficialasf-hub/charity_ERP.git, branch main. T0.1 commits are local; push when the owner wants.
- The repository contains only docs/, CLAUDE.md, .claude/, README.md and the git configuration files. No application code until Phase 0 is signed off.
- docs/source/ERP_BLUEPRINT_BN.md was machine-converted from the owner's docx and verified paragraph by paragraph against it on 2026-10-10.
