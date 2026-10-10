# Phase 0 sign-off — Requirement and Architecture Freeze

| Item | Value |
|---|---|
| Phase | 0 — Requirement and Architecture Freeze (constitution §8) |
| Gate task | T0.22, 2026-10-10 |
| Scope | All documents of constitution §3, the clickable mockups, the decision log up to O-49 |
| Baseline | Commit tagged `gate-phase-0` |
| Management sign-off | **Pending** — signature lines at the end of the Bengali summary |
| Next task after sign-off | T1.1 (repository scaffold); no Phase 1 work starts before the signature |

## 1. Documents of constitution §3

| Document | Status | Task |
|---|---|---|
| docs/source/ERP_BLUEPRINT_BN.md | Business authority (not edited) | owner |
| MASTER_SPEC.md | Complete | T0.1, T0.2 |
| PROJECT_RULES.md | Complete | T0.1 |
| MODULE_CATALOG.md | Complete (22 modules) | T0.3 |
| BUSINESS_RULES.md | Complete (BR-001 to BR-245, BR-221 retired) | T0.4 and later |
| DECISION_LOG.md | Complete (Q-01–Q-47, BD-01–BD-49, D-050–D-057, UX-01–UX-13, O-01–O-49) | T0.5 and later |
| NON_FUNCTIONAL_REQUIREMENTS.md | Complete (NFR-01–NFR-61; PROPOSAL rows decided by O-47 except the IT-team items of O-48) | T0.6, T0.21 |
| architecture/SYSTEM_ARCHITECTURE.md, ADR-001–008, ADR-010, ADR-011 | Complete (ADR-009 written with the form engine in T2.3) | T0.8, T0.22 |
| architecture/AUTH.md | Complete | T0.9 |
| security/RBAC.md, permissions.yaml | Complete (15 roles, 140 permissions) | T0.10 |
| architecture/WORKFLOW_ENGINE.md, workflow-templates/ (schema, _common, 6 templates) | Complete | T0.11 |
| architecture/OFFLINE_SYNC.md | Complete | T0.12 |
| architecture/FILES_AND_DOCUMENTS.md | Complete (SOP-pending items marked, O-34) | T0.13 |
| architecture/NOTIFICATIONS.md | Complete | T0.14 |
| database/ERD.md, erd.mermaid | Complete (91 entities) | T0.15 |
| database/DATABASE_SCHEMA.md, json-schemas/ | Complete (91 tables, 10 JSON Schemas) | T0.16 |
| api/API_STANDARDS.md | Complete | T0.17 |
| api/openapi.yaml, redocly.yaml | Complete for Phases 1–2 (146 operations, 124 paths) | T0.18 |
| ui/DESIGN_BRIEF.md, brand/colors.md, fonts, logo | Complete | owner, T0.1 |
| ui/DESIGN_SYSTEM.md, SCREENS.md | Complete (70 screens: 37 full, 33 compact) | T0.19 |
| ui/mockups/ (14 pilot screens) | Approved by the owner (O-41) | T0.19b |
| ui/I18N.md | Complete | T0.20 |
| testing/TEST_STRATEGY.md, security/SECURITY_POLICY.md | Complete | T0.21 |
| testing/uat/, gates/, ops/DEPLOYMENT.md, ops/RUNBOOK.md | Outlines by design (filled at each gate, T3.0, T6.5) | — |
| STATUS.md | Current | every task |

## 2. Blueprint C3 gate list

| # | Gate item | Where it is settled | Status |
|---|---|---|---|
| a | Role and scope model with the default matrix | RBAC.md §1–§7, permissions.yaml, MASTER_SPEC A4; Q-36, O-26–O-28 | Covered |
| b | Component list, common workflow states, template exceptions | MASTER_SPEC A6; WORKFLOW_ENGINE §3, §9–§11; `_common.yaml` and six templates; ADR-008; BD-09–BD-11, BD-24, O-12, O-49 | Covered |
| c | Form platform: section library, standard fields, versioning, mandatory fields, beneficiary type options | MASTER_SPEC B3, App B.3; DATABASE_SCHEMA §9; BD-12–BD-14; BR-072–BR-089 | Covered |
| d | Budget buckets, cost per beneficiary, volunteer expense categories and approval rule | MASTER_SPEC B6; DATABASE_SCHEMA payments and ledger tables; BD-29–BD-31, O-14, O-22, O-24 | Covered |
| e | Offline conflict rules | OFFLINE_SYNC §6, §15; ADR-010; BD-48, O-07, O-13, O-29 | Covered |
| f | Security, audit and retention | SECURITY_POLICY; AUTH; BD-46, O-05, O-25, O-45, O-46 | Covered |
| g | Stack and hosting | D-050–D-057 (approved, O-01); BD-45; SYSTEM_ARCHITECTURE; ADRs | Covered |
| h | Document checklist, deadlines, storage codes | FILES_AND_DOCUMENTS §9–§12; BD-35–BD-39; DATABASE_SCHEMA §16 | Designed; built last by owner decision O-34 (T5.4 after T6.1); hard-copy code segments and the 11 deficiency fields wait for the SOP v2.3 text |
| i | Ratings method, category list, close/reopen, follow-up | BD-19, BD-20, BD-40, O-10, O-12, O-23, O-49; BR-042–BR-046, BR-055–BR-057 | Covered |
| j | Nisab handling | BD-28, O-15; DATABASE_SCHEMA `nisab_versions` and application snapshot; PLAN T4.2 prerequisite | Covered |
| k | SMS provider timing | O-33, O-36, O-49: the Phase 3 pilot may use the dummy OTP with the owner's written approval; a real gateway before rollout beyond the pilot and before Qurbani | Decided |
| l | UX-01–UX-13 reflected in the design documents | DESIGN_BRIEF §1, §7; DESIGN_SYSTEM; SCREENS; UX-09 and UX-10 final (O-49) | Covered |
| m | HTML mockups approved and recorded | O-41 "Phase 0 mockups approved"; docs/ui/mockups/ | Covered |

Blueprint D1 Phase 0 items: ERD (database/), API contract (openapi.yaml, lint valid), main screen mockups (O-41), registration form fields (MASTER_SPEC A5, openapi registration schemas), workflow template definitions (workflow-templates/) — all present. SOP fields are deferred by O-34.

## 3. Open questions

All 30 open questions are answered (DECISION_LOG §6: 1–25 by O-01–O-25, 26 by O-29, 27 by O-30, 28 by O-35, 29 by O-37, 30 by O-38 and O-39). Questions raised during this gate were answered by the owner as O-49.

## 4. Deferred items (not blocking Phase 1)

| Item | Owner | When | Decision |
|---|---|---|---|
| SOP v2.3 text (hard-copy codes, deficiency fields, checklists) | Department | Before T5.4 (documentation module, built last) | O-34, O-36 |
| SMS provider | Department / IT | Before rollout beyond the Phase 3 pilot and before Qurbani | O-33, O-49 |
| Server details, domains, backup target | IT team | Before T3.0 | O-36 |
| IT approval of NFR-31, NFR-33, NFR-35, NFR-42 | IT team | Production preparation (T6.5) | O-48 |
| CI provider | IT / developers | T1.1 | O-36, O-48 |
| Incident contacts in RUNBOOK.md | Department / IT | Before production | O-45, O-48 |
| Sync payload limit (1 MB proposal) | Developers | T2.7 | O-29 |
| `default` and `sync` rate-limit values | Developers | T3.4 load test | API_STANDARDS §10 |
| Error-tracking tool | Developers / IT | T3.0 | D-057 |

## 5. Consistency check of this gate

Three independent reviews ran (C3 coverage; stale items and contradictions; naming across roles, states, permissions, entities, modules, screens and tasks). Every finding was fixed in the documents; the blueprint and the constitution were not edited.

| Category | Corrections |
|---|---|
| Decision-log and status hygiene (stale "proposed", "open question N", series ranges) | DECISION_LOG, MASTER_SPEC, BUSINESS_RULES, NFR, MODULE_CATALOG, DESIGN_BRIEF, colors.md, AUTH, OFFLINE_SYNC, ADR-010 |
| O-34 schedule applied (documentation module last) | PLAN (T1.3, T1.13, T5.4, rows 77 and 217), MODULE_CATALOG, MASTER_SPEC, FILES, TEST_STRATEGY, SECURITY_POLICY, SCREENS |
| Superseded rules removed (ward level, duplicate-photo warning, app-id format, short BEN-ID display, bKash-only payments, mobile-only login, SMS "before Qurbani") | MASTER_SPEC, DESIGN_SYSTEM, SCREENS, PLAN, BUSINESS_RULES, I18N, DATABASE_SCHEMA, MODULE_CATALOG, AUTH, SYSTEM_ARCHITECTURE, NOTIFICATIONS, mockups (34 ids) |
| Contradictions resolved (refresh expiry vs wipe, NID on phones, 15-minute URL exception, upload types, pending accounts, test database model, checklist values, project close and reopen) | AUTH, OFFLINE_SYNC, NFR, SECURITY_POLICY, ADR-005, TEST_STRATEGY, SYSTEM_ARCHITECTURE, BUSINESS_RULES, WORKFLOW_ENGINE, `_common.yaml` |
| Naming fixes (permission names, column names, role names, module codes, table names, field-unlock and merge states) | AUTH, RBAC, permissions.yaml, workflow templates, MODULE_CATALOG, BUSINESS_RULES, WORKFLOW_ENGINE, FILES, erd.mermaid, ERD, SCREENS |
| Schema additions to match decided behaviour | `applications.submitted_by`, `completed_by`; `profile_merges.status`, `proposed_by`, `proposed_at` with nullable merge columns (BD-05 proposals); `L-merge-status` |
| Bad references | BR-223 → BR-224 (6 places), API_STANDARDS §2/§4 → §3, TEST_STRATEGY section reference, BR-025/026 → BR-230, M10 task |
| Defect found by the YAML parser | `permissions.yaml` had one unquoted description with a colon (invalid YAML); fixed |
| Missing ADR | ADR-011 identifier formats written |

In total 39 documents and mockup files were corrected in this gate.

## 6. Verification (executed 2026-10-10)

| Check | Result |
|---|---|
| Reference resolution across all documents (BR, NFR, Q/BD/D/UX/O, SCR, task ids) | 0 unresolved |
| Permission names in openapi.yaml (146 operations), templates, RBAC, SCREENS, AUTH, policies | 0 unknown |
| Sensitive-field columns of permissions.yaml present in DATABASE_SCHEMA | all present |
| YAML parse (permissions.yaml, openapi.yaml, 7 workflow templates) and JSON parse (json-schemas, template schema) | all parse; 140 permissions, 15 roles |
| Workflow templates against `schema.json` (ajv) | 7 of 7 valid |
| Redocly lint of openapi.yaml | valid, 0 errors, 0 warnings |
| Mockups: renders at 360/768/1280 px; interaction script | 45 of 45 clean; 51 of 51 passed |
| Stale markers, "ward" without the O-09 note, Bengali digits in English documents | none outside historical question tables and the constitution |

## 7. What is frozen

From the tag `gate-phase-0` the following are the baseline for Phase 1; any change goes through DECISION_LOG.md with the owner's approval (constitution §2):

- Business rules BR-001 to BR-245 and decisions up to O-49.
- Roles, scopes and the 140 permissions with their defaults.
- The data model (91 tables) and the JSON Schemas.
- The API contract for Phases 1 and 2 (146 operations) and the API standards.
- The common workflow and the six project templates.
- The design system, the screen inventory and the approved mockups.
- Localization, security and test policies.

---

## বাংলা সারাংশ (ম্যানেজমেন্টের জন্য)

**বিষয়:** চ্যারিটি ও সোশ্যাল সার্ভিস ERP — Phase 0 (চাহিদা ও কাঠামো চূড়ান্তকরণ) সম্পন্ন, অনুমোদনের জন্য উপস্থাপন। তারিখ: 10-10-2026।

**কী করা হয়েছে:** ডিপার্টমেন্টের ব্লুপ্রিন্টের ভিত্তিতে পুরো সিস্টেমের নকশা লিখিতভাবে চূড়ান্ত করা হয়েছে। কোনো কোড লেখা হয়নি; শুধু নকশা, নিয়ম ও সিদ্ধান্ত। ডিপার্টমেন্ট মোট 30টি খোলা প্রশ্নের উত্তর দিয়েছে এবং 49টি সিদ্ধান্ত লিখিত আছে।

**যা চূড়ান্ত (ফ্রিজ) করা হলো:**
1. কাজের নিয়ম: 245টি বিজনেস রুল; কে কী করতে পারবেন তার 15টি ভূমিকা ও 140টি অনুমতি।
2. তথ্যের কাঠামো: 91টি টেবিলের ডেটাবেস নকশা; উপকারভোগী NID বা জন্ম নিবন্ধন দিয়ে চেনা হবে; কোনো তথ্য স্থায়ীভাবে মোছা হবে না।
3. কাজের ধারা: আবেদন থেকে অনুমোদন পর্যন্ত সাধারণ ধাপ, আর ছয় ধরনের প্রকল্পের (বিতরণ, ঘর নির্মাণ, স্বাবলম্বী, নিরাপদ পানি, বৃক্ষরোপণ, কুরবানী) আলাদা ধাপ।
4. অফলাইন কাজ: নেটওয়ার্ক না থাকলেও মাঠের কাজ চলবে, পরে সিঙ্ক হবে।
5. পর্দার নকশা: ফোন ও কম্পিউটারের 14টি মূল পর্দার মকআপ ডিপার্টমেন্ট অনুমোদন করেছে।
6. নিরাপত্তা: অনুমতি ছাড়া কেউ কিছু দেখতে পাবেন না; NID, ব্যাংক তথ্য, রেটিং ও দাতার তথ্য শুধু অনুমোদিত কর্মকর্তারা দেখবেন; প্রতিটি গুরুত্বপূর্ণ কাজের অডিট লগ থাকবে।
7. ভাষা: বাংলা ও ইংরেজি দুটোই; সব সংখ্যা ইংরেজি অঙ্কে; টাকা 10 লাখের নিচে লাখ পদ্ধতিতে, তার বেশি মিলিয়নে।

**যা পরে হবে (সিদ্ধান্ত অনুযায়ী, এখন বাধা নয়):**
- SOP অনুযায়ী ডকুমেন্ট রেজিস্টার সবার শেষে তৈরি হবে (SOP-এর লেখা তখন লাগবে)।
- SMS সেবাদাতা: পাইলটে অস্থায়ী (ডামি) OTP চলতে পারে, তবে ডিপার্টমেন্টের লিখিত অনুমোদনে; সব অঞ্চলে চালুর আগে ও কুরবানীর আগে আসল SMS সেবা লাগবে।
- সার্ভার, ব্যাকআপ ও নেটওয়ার্কের বিষয়ে IT টিমের অনুমোদন প্রোডাকশনের আগে।

**পরের ধাপ (Phase 1):** লগইন ও নিবন্ধন, ভূমিকা ও অনুমতি, পারমিশন প্যানেল, কর্মী ও স্বেচ্ছাসেবক নিবন্ধন-অনুমোদন, প্রোগ্রাম ও প্রকল্প সেটআপ, স্বেচ্ছাসেবক ও উপকারভোগী তালিকা, অডিট লগ ও দুই ভাষা। Phase 1 শেষে অফিসিয়াল টিম পরীক্ষা করবে, তারপর Phase 2।

**অনুমোদন:** এই নকশা অনুমোদিত হলে Phase 1-এর কাজ শুরু হবে। অনুমোদনের পর কোনো পরিবর্তন লিখিত সিদ্ধান্ত ছাড়া হবে না।

| ভূমিকা | নাম | স্বাক্ষর | তারিখ |
|---|---|---|---|
| ডিপার্টমেন্ট হেড | | | |
| ম্যানেজমেন্ট প্রতিনিধি | | | |
