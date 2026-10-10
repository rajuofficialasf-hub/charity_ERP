# Project status (Claude updates this at the end of every task; read it at the start of every session)

- Last updated: 2026-10-10
- Current phase: 0 (Requirement & Architecture Freeze) - IN PROGRESS
- Last completed task: T0.8 - System architecture and ADRs: docs/architecture/SYSTEM_ARCHITECTURE.md complete; ADR-001..006 written; ADR index renumbered (007..011 planned). Design choices made in T0.8 were approved by the owner on 2026-10-10 as D-054..D-057 with implementation requirements (see DECISION_LOG section 3 and SYSTEM_ARCHITECTURE sections 2.1 and 10). (T0.1 and T0.7 done the same day; T0.2..T0.6 delivered inside T0.1.)
- T0.9 done (2026-10-10): docs/architecture/AUTH.md complete (registration with two OTPs and the dummy-OTP path, password rules, tokens and device sessions, lockout, account states, remote revocation and local wipe, permission-version refresh, handover, Main Admin protection, rate limits, audit events). Values not covered by O-05 were proposed in AUTH.md section 14 and approved the same day as O-25 (BR-231..233).
- T0.10 done (2026-10-10): docs/security/permissions.yaml is the machine-readable source of truth (roles, scopes, conditions, three permission sets, sensitive-field catalogue, permissions with default grants); docs/security/RBAC.md explains the model, resolves scopes, shows the default matrix for A4's two tables plus Official daee and Implementer, and specifies enforcement and tests. Name consistency between the two files checked with a script. The six interpretations of RBAC.md section 11 were confirmed the same day (O-26), with two refinements: the RPM may grant application approval to an Official daee per project (O-27), and the Media Team works in its own Media tab with a beneficiary work list (O-28; new entity media_subjects, permission media.subject.manage, BR-234..235).
- T0.11 done (2026-10-10): docs/architecture/WORKFLOW_ENGINE.md complete (common cycle with needs_verification and waitlisted, state diagram, definition format, guard and effect catalogues, activity model and bulk-update pattern, overrides, project lifecycle, versioning, code-vs-data table, worked example of a new project type); workflow-templates/ holds schema.json, _common.yaml and the six templates; ADR-008 written. Design choices approved with the document: post-approval stages are sub-states of implementation; edge cases are outcomes, not states; soft-delete state `deleted` for drafts and pending applications.
- T0.12 done (2026-10-10): docs/architecture/OFFLINE_SYNC.md complete (cached data set, outbox record and lifecycle, batch and snapshot endpoints, photo queue and resumable upload, conflict rules per record kind, offline NID path, encrypted storage and wipe, form-version handling, sync UI, iOS section, sequence diagrams, test strategy); ADR-010 written. Values not covered by O-07/O-13 were proposed as question 26 and decided the same day as O-29 with additional requirements (Retry-After, payload-size limit, no automatic deletion of unsynced files, secure device-bound keys, recovery table, required tests).
- T0.13 done (2026-10-10): docs/architecture/FILES_AND_DOCUMENTS.md complete (file kinds and metadata model, signed-URL access, upload pipeline with 256 KB chunks and virus-scan hook, validation table, image handling with EXIF/GPS capture and pHash duplicate warning, per-project photo source setting with the web realisation and its trade-offs, bucket and key layout per SOP 10, SOP document register with status chain, hard-copy codes and retention, working-day deadline countdown and non-compliance, deficiency reports with escalation and legacy marking, quarterly audit report, media consent gating, locks, storage growth, tests). Proposals decided the same day as O-30 with changes (BR-239..241); hard-copy code segments and the 11 deficiency fields wait for the SOP text.
- T0.14 done (2026-10-10): docs/architecture/NOTIFICATIONS.md complete (principles, channels, recipient resolution by scope, full event matrix with recipients/channels/template keys/phases, mandatory vs optional and preferences, bilingual templates, transactional outbox with retries and status, rate limits and coalescing, OTP path, Qurbani donor messages, Web Push evaluation with a "yes, optional, later" recommendation, privacy, tests); ADR-007 written. Proposals accepted the same day as O-35.
- T0.15 done (2026-10-10): docs/database/ERD.md complete (90 entities in 12 clusters with keys, relationships and cardinality, classification master/configuration/transaction/log/platform, JSONB usages, constraints and idempotency keys, naming map, additions and ambiguities) and docs/database/erd.mermaid (one erDiagram, same entities). Physical names follow the T0.15 prompt; earlier documents were swept to them (MASTER_SPEC keeps blueprint names with a pointer). Ambiguities resolved as recommended by O-37.
- T0.16 done (2026-10-10): docs/database/DATABASE_SCHEMA.md complete (91 tables with columns, types, nullability, defaults, comments, keys, uniques, checks and indexes; code lists instead of PostgreSQL enums; application number counter `id_sequences` per O-03, no BEN- sequence because O-03 made the BEN-ID the UUID v7; BD-03 enforced by deferred constraint triggers; index catalogue; JSON Schemas in docs/database/json-schemas/ (10 files); soft-delete policy; retention and partitioning; database roles). ERD updated with id_sequences. Proposals accepted the same day (O-38, O-39).
- T0.17 done (2026-10-10): docs/api/API_STANDARDS.md complete (path versioning, resource naming with action endpoints for state changes, envelope, keyset cursor pagination with capped totals, filtering/sorting/search, ETag and If-Match concurrency, validation and bn/en localization, error-code catalogue with a mapping of earlier names, idempotency on existing unique keys, rate-limit classes, auth headers and CSRF-protected refresh, file and signed-URL conventions, bulk-update and export patterns, audit per endpoint, required OpenAPI annotations, breaking-change rule with client-version support for offline phones).
- T0.18 done (2026-10-10): docs/api/openapi.yaml written (OpenAPI 3.1, 146 operations on 124 paths across 19 tags: auth, sessions, users, access, registration, volunteers, beneficiaries, programs, projects, templates, forms, public, applications, activities, files, notifications, exports, reference, sync); every operation has operationId, x-permission, x-scope, x-audit, x-idempotency and x-rate-limit; docs/api/redocly.yaml enforces them. Lint: `npx --yes @redocly/cli@1 lint docs/api/openapi.yaml --config docs/api/redocly.yaml` → valid, 0 errors, 0 warnings. Two paths renamed to avoid ambiguity (/application-numbers/{appNo}, /upload-sessions); API_STANDARDS updated with the four x-permission markers and the action-to-transition map.
- T0.19 done (2026-10-10): docs/ui/DESIGN_SYSTEM.md complete (tokens as CSS variables from colors.md plus four derived status tints, spacing, radius, typography with UbuntuSans and Bornomala at 400/700, elevation, focus, motion, layers, breakpoints; Bengali typography rules; layout per device; inventory of all 19 base components of constitution section 12 with props, states and accessibility; patterns: bulk-update list, review detail with timeline, form renderer, NID lookup, photo tile, progress-first dashboard, masked fields; mobile rules for 2 GB Android and iPhone; states; dark-theme note). docs/ui/SCREENS.md complete (37 full screen entries incl. My Work for all 15 roles, 33 compact later-phase rows, coverage matrices). Design choices recorded as O-40 (radius 6/8/16, caption 12 px, body 16 px on phones and 14 px on desktop, elevation, status tints, Lucide icons, chart colours, breakpoints).
- T0.19b built (2026-10-10): docs/ui/mockups/ holds index.html with 360/768/1280 preview frames, the 14 pilot screens of DESIGN_BRIEF section 6 in Bangla with fake data, tokens.css (DESIGN_SYSTEM section 2.9), components.css, mockup.js, icons.js (96 Lucide icons, ISC), local fonts and logo, and README.md (how to open, verification, 11 listed deviations from the design system). Static files only, no network at view time.
- T0.19b approved by the owner on 2026-10-10 (O-41, "Phase 0 mockups approved"); focus-ring outline and split-view widths with column priority 4 written into DESIGN_SYSTEM.md.
- O-42 (2026-10-10): Taka below 10 lakh in lakh grouping (৳ 3,00,000), from 10 lakh in millions (৳ 1 মিলিয়ন); mockups updated. Details confirmed: at most 2 decimals, million form only in dashboards and summaries (exact amounts in entry fields, ledgers, vouchers, exports, PDF), threshold 10 lakh or more, counts never in millions.
- T0.20 done (2026-10-10): docs/ui/I18N.md complete (principles, locale resolution, message catalogue with ICU and typed keys, no-hard-coded-strings rule with four enforcement layers, server-side localization per output, one formatter with an exact format table including O-42 Taka display and 12-hour time with Bengali day periods, NFC and digit normalization, bilingual-data inventory and rules, fallback table, exports/PDF/email/SMS, third-language process, tests, implementation map). Owner answers O-43 (both languages required for configuration, Hijri withdrawn, no runtime message overrides, 12-hour time) and technical choices O-44 recorded; BR-221 retired, BR-243 to BR-245 added; export_jobs.locale added; hijri_date removed from user preferences; i18n.manage description corrected; mockup times converted to 12-hour.
- T0.21 done (2026-10-10): docs/testing/TEST_STRATEGY.md complete (principles, pyramid and tools, coverage per layer incl. the 12 critical journeys mapped to gates, load, accessibility, visual, security, data integrity, offline, i18n, smoke; test data strategy; coverage targets; CI gate stages; BR test-status tracking; environments; per-gate run table; flaky-test policy). docs/security/SECURITY_POLICY.md complete (roles, data classification, OWASP Top 10 mapping, authentication and sessions, authorization and field protection, input validation, web and transport security, uploads, secrets, logging, dependencies, error handling, audit event map, retention, backups, devices, privacy, incident response, secure release, pre-production checklist, exceptions). Owner answers O-45 (logs 90 days, incidents to IT lead and Department Head within 24 hours, no external pentest for now) and technical choices O-46 recorded; NFR targets confirmed as O-47; [L] tables append-only by trigger; BR-221 status wording corrected to retired; API_STANDARDS section references corrected.
- Next task: T0.22 - Phase 0 gate: consistency check and sign-off.
- Blocking items: none.
- Git: the owner pushed main to origin on 2026-10-10 up to ceb4e50 (verified: main...origin/main in sync); later commits are local until the next push.

## Deliverables of T0.1 (complete vs outline)
Complete:
- docs/MASTER_SPEC.md (Parts A, B, C, D, both appendices, open questions)
- docs/PROJECT_RULES.md
- docs/MODULE_CATALOG.md (22 modules)
- docs/BUSINESS_RULES.md (BR-001..BR-245, BR-221 retired, gaps list; test-status register empty until code exists)
- docs/DECISION_LOG.md (Q-01..Q-47, BD-01..BD-49, D-050..D-053 proposed, UX-01..UX-13 approved, Open 1..23)
- docs/NON_FUNCTIONAL_REQUIREMENTS.md (NFR-01..NFR-59, PROPOSAL rows need approval)

- docs/architecture/SYSTEM_ARCHITECTURE.md and ADR/ADR-001..006 (T0.8)
- docs/architecture/AUTH.md (T0.9)
- docs/security/RBAC.md and permissions.yaml (T0.10)
- docs/architecture/WORKFLOW_ENGINE.md, workflow-templates/ (schema, _common, six templates), ADR-008 (T0.11)
- docs/architecture/OFFLINE_SYNC.md, ADR-010 (T0.12)
- docs/architecture/FILES_AND_DOCUMENTS.md (T0.13)
- docs/architecture/NOTIFICATIONS.md, ADR-007 (T0.14)
- docs/database/ERD.md and erd.mermaid (T0.15)
- docs/database/DATABASE_SCHEMA.md and json-schemas/ (T0.16)
- docs/api/API_STANDARDS.md (T0.17)
- docs/api/openapi.yaml and redocly.yaml (T0.18; later phases extend it)
- docs/ui/DESIGN_SYSTEM.md and SCREENS.md (T0.19)
- docs/ui/I18N.md (T0.20)
- docs/testing/TEST_STRATEGY.md and docs/security/SECURITY_POLICY.md (T0.21)

Outlines (headings plus one line per section; completed in the task named in each file):
- docs/testing/uat/README.md, gates/README.md
- docs/ops/DEPLOYMENT.md and RUNBOOK.md (T3.0, T6.5)

## Open decisions waiting on the owner
- None. Question 30 answered by O-38 (reference list seeds) and O-39 (pg_trgm, audit_log partitioning, GPS columns, mobile check, no row-level security).
- NFR PROPOSAL rows confirmed by O-47 (T0.21); NFR-31, NFR-33, NFR-35 feasibility and the NFR-42 network rule wait for the IT team.
- Questions 1..30 are answered (O-01..O-39; full list in DECISION_LOG section 5). Interpretations recorded in O-03, O-09, O-16 and O-22 stand unless the owner corrects them. Architecture choices of T0.8 are D-054..D-057.

## Prerequisites still open (checked 2026-10-10)
Needed for development (before T1.1):
- pnpm is not installed on the owner's machine (`npm install -g pnpm`).
- Docker Desktop was not running (postgres, minio, mailpit via Docker Compose).

Resolved before production, not now (O-36); none blocks Phase 0 or development:
- SMS provider (O-33); the adapter runs in dry-run mode until then.
- Server details, domain names and backup target (needed by T3.0 for the pilot deployment, finalized in T6.5).
- CI provider (named when T1.1 sets up CI).
- SOP v2.3 text (with the documentation module at the end, O-34).
- Other input files (samples, locations CSV): see docs/source/README.md; requested by the task that needs them.

## Known issues / risks
- The blueprint contradicts itself on beneficiary mobile uniqueness (B3 layer table and diagram image4 vs B3 rules, Q-21, BD-01). Resolved by O-02 (not unique); the blueprint text itself is unchanged and the owner may align it in a later version.
- O-09 drops the ward level named in constitution section 6 and blueprint B2/B3; the constitution text is not edited (DECISION_LOG outranks it per section 0).
- docs/api/openapi.yaml and docs/security/permissions.yaml were checked visually only; no YAML parser is installed on this machine (PyYAML missing). They are parsed in CI from T1.1.

## Last test run
- 2026-10-10 T0.19b: Playwright (playwright-core 1.49.1 with installed Chrome): 45 of 45 page renders clean at 360/768/1280 px (no page errors, no horizontal overflow, no missing icons, no Bengali digits, no text below 12 px, no phone touch target below 44 px), fonts loaded from file://; interaction script 51 of 51 passed; axe-core 4.10.2 WCAG A/AA 0 violations on all pages at 360 and 1280 px.
- 2026-10-10 T0.19: document checks by a Node script: every permission name in SCREENS.md exists in permissions.yaml (138 of 140 referenced, 0 unknown); the four status tints equal the computed 12 percent mixes; every hex value in DESIGN_SYSTEM.md is in colors.md or the derived tints; all 32 required full entries and all 15 roles covered; no Bengali digits in either file.
- 2026-10-10 T0.18: `npx --yes @redocly/cli@1 lint docs/api/openapi.yaml --config docs/api/redocly.yaml` → "Your API description is valid", 0 errors, 0 warnings (first OpenAPI lint run). Otherwise Phase 0 has documents only; earlier verification after T0.8: SYSTEM_ARCHITECTURE has 13 sections with the deployment diagram and the request-check order; six ADR files plus README exist; 230 unique BR ids; DECISION_LOG row counts Q 47 / BD 49 / D 4 / UX 13 / O 23; git working tree clean.

## Notes for the next session
- The model and effort level for every task are in docs/MODEL_GUIDE.md. It is the owner's reference; Claude Code does not switch models by itself. The rows marked ছাড় নেই (no downgrade) must not be run on a lower model when a usage limit runs out.
- Brand assets are in docs/ui/brand/: colors.md, logo.png, logo.svg and fonts/ with licence texts (copied from the website on 2026-10-10).
- Design interview held on 2026-10-10: owner decisions UX-01 to UX-13 are in docs/ui/DESIGN_BRIEF.md and were imported into docs/DECISION_LOG.md in T0.1. There is no Figma file; clickable HTML mockups are built in task T0.19b.
- Owner answers to open questions are recorded as O-nn (same number as the question) in docs/DECISION_LOG.md; every affected document is then updated in the same change (T0.7).
- Git remote: origin is https://github.com/rajuofficialasf-hub/charity_ERP.git, branch main. T0.1 commits are local; push when the owner wants.
- The repository contains only docs/, CLAUDE.md, .claude/, README.md and the git configuration files. No application code until Phase 0 is signed off.
- docs/source/ERP_BLUEPRINT_BN.md was machine-converted from the owner's docx and verified paragraph by paragraph against it on 2026-10-10.
