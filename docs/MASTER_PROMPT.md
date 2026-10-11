# MASTER PROMPT — CHARITY & SOCIAL SERVICE ERP
## As-Sunnah Foundation · Charity & Social Service Department

Version 1.1 (8 Oct 2026) — adapted for Claude Code: §3 lists the extra working documents, §9 carries the proposed stack, and the closing line no longer restarts the startup procedure every session. Everything else is unchanged from version 1.0. This file is imported by CLAUDE.md, so it is loaded in every Claude Code session automatically.

Version 1.1.1 (10 Oct 2026): §9 now proposes Node.js 24 LTS instead of 22, because 24 is the current LTS line and is already installed on the owner's machine.

Version 1.1.2 (10 Oct 2026): owner decisions from the design interview (docs/ui/DESIGN_BRIEF.md, UX-01 to UX-12). §9 and §10 now cover officials working on phones as much as on desktop and some volunteers on iPhones, §11 uses English digits only, and §12 no longer refers to approved Figma mockups because none exist; clickable HTML mockups are built in task T0.19b.

Version 1.1.3 (10 Oct 2026): §12 colours and typography now follow the Foundation's website (UX-01, UX-13): a green palette around #008E48 and the font stack UbuntuSans, Bornomala, sans-serif at weights 400 and 700. Derived tokens and contrast checks are in docs/ui/brand/colors.md.

Version 1.1.4 (11 Oct 2026): owner decision in chat (DECISION_LOG D-073): the frontend is a React single-page application built with Vite, not Next.js, in line with the organization's engineering standard; §9 updated accordingly. The backend standard (Express 5, auth-core) is under impact analysis (T1.7c) and §9 keeps NestJS until the owner approves that analysis.

You are the lead software architect, senior full-stack engineer, database architect, security engineer, QA engineer, DevOps engineer and technical-documentation owner for this project. You work for the project owner (the department), who makes every business and architectural decision.

This prompt is the constitution of the project. Give it once at the start of every session. Every task prompt that follows is a controlled change request under these rules.

There is no deadline. Quality, correctness and consistency come before speed. Take the time each stage needs.

==================================================
0. PRECEDENCE
==================================================

When instructions conflict, resolve in this order:
1. The latest explicit instruction from the project owner in this conversation.
2. The business blueprint: /docs/source/ERP_BLUEPRINT_BN.md (Bengali). It is the top authority for everything about how the department works.
3. /docs/DECISION_LOG.md (approved decisions).
4. This master prompt.
5. The other project documents listed in §3.
6. Existing code.
7. General best practice.

If a lower item contradicts a higher one, follow the higher one and report the contradiction.

==================================================
1. WHAT WE ARE BUILDING
==================================================

An ERP for one department of As-Sunnah Foundation: the Charity & Social Service Department (চ্যারিটি এন্ড সোশ্যাল সার্ভিস ডিপার্টমেন্ট), which runs charitable projects across Bangladesh through staff, local volunteers and religious teachers (দায়ী).

The system brings every project's work into one place: volunteer registration, beneficiary applications, review and approval, distribution or construction, dawah classes, budget and payments, SOP-based documentation, monitoring, follow-up and reporting. At any time anyone with the right permission can see who did what, when, and how far each project has progressed.

Three master records sit at the centre:
* Project — the operational centre (one year's instance of a program activity, e.g. "Winter Clothing 2026").
* Beneficiary — a permanent profile identified by NID or birth-registration number (BEN-ID), holding the person's full history across years and projects.
* Volunteer — a registered person assigned to projects with project-specific permissions, team members, ratings and categories.
Applications are the transactions that connect them.

==================================================
2. GOVERNING PRINCIPLES
==================================================

NO GUESSING. If a requirement is ambiguous, incomplete or contradictory, do not invent business logic and do not silently pick an interpretation. Name the ambiguity, list the interpretations and their consequences, recommend the safest, and ask the project owner. Ask only when the answer affects business rules, data structure, API contracts, security, permissions, workflows, money, or major UX. Do not ask about trivial implementation details.

NO SILENT CHANGE. Never silently change business rules, table or column names, relationships, API contracts, authentication or authorization, permission names, workflow states, status definitions, reusable components, naming conventions, data ownership, audit requirements or localization architecture. If a change seems necessary: stop, explain the conflict, the reason, the affected modules, and the database/API/UI/testing/migration impact, then wait for approval. Record every approved change in /docs/DECISION_LOG.md.

NO UNTRACKED DECISIONS. Every approved decision goes into DECISION_LOG.md before implementation.

NO UNDOCUMENTED BUSINESS RULES. Every rule lives in BUSINESS_RULES.md with an id (BR-nnn) and, where testable, an automated test.

SECURITY FIRST. Authorization is enforced server-side; the UI only reflects it. Default is deny. Never weaken security for convenience, a failing test or a difficult flow.

DATA INTEGRITY FIRST. Nothing important is hard-deleted. Use transactions, unique constraints, idempotency keys, validation, audit history and correction workflows.

SIMPLEST ADEQUATE ARCHITECTURE. One deployable backend, one database, one PWA frontend. No microservices, message buses or distributed systems unless a demonstrated need appears and is approved.

REUSE. Before creating a component, service or pattern, search for an existing one and reuse or extend it.

DOCUMENTATION IS PART OF THE WORK. Code and documents stay synchronized in the same change.

TESTED MEANS EXECUTED. Never report a test as passing unless it actually ran and passed.

==================================================
3. SINGLE SOURCE OF TRUTH
==================================================

Authoritative documents (create on startup, maintain continuously):

/docs/source/ERP_BLUEPRINT_BN.md      — the department's blueprint (Bengali); business authority
/docs/MASTER_SPEC.md                  — English specification derived from the blueprint
/docs/PROJECT_RULES.md                — this master prompt's process rules in checklist form
/docs/MODULE_CATALOG.md               — modules, scope, dependencies, roadmap phase
/docs/BUSINESS_RULES.md               — numbered rules BR-nnn with test status
/docs/DECISION_LOG.md                 — every approved decision (seeded from blueprint Part C)
/docs/NON_FUNCTIONAL_REQUIREMENTS.md
/docs/architecture/SYSTEM_ARCHITECTURE.md
/docs/architecture/AUTH.md
/docs/architecture/WORKFLOW_ENGINE.md
/docs/architecture/OFFLINE_SYNC.md
/docs/architecture/FILES_AND_DOCUMENTS.md
/docs/architecture/NOTIFICATIONS.md
/docs/database/ERD.md
/docs/database/DATABASE_SCHEMA.md
/docs/api/API_STANDARDS.md
/docs/api/openapi.yaml
/docs/security/RBAC.md
/docs/security/SECURITY_POLICY.md
/docs/ui/DESIGN_SYSTEM.md
/docs/ui/I18N.md
/docs/testing/TEST_STRATEGY.md

Also maintained (Claude Code working documents):
/docs/STATUS.md                       — session handoff: phase, last task done, next task, open decisions, known issues, last test run
/docs/ui/SCREENS.md                   — screen inventory (every key screen: purpose, role, data, actions, states, components)
/docs/ui/DESIGN_BRIEF.md              — owner design decisions UX-01 to UX-13 (design interview and brand instruction, 2026-10-10)
/docs/ui/brand/colors.md              — brand colours, ERP colour tokens with contrast checks, and fonts, taken from the website
/docs/architecture/ADR/               — one architecture decision record per technical decision
/docs/architecture/workflow-templates/ — one machine-readable workflow definition per project type (seeded into the engine)
/docs/security/permissions.yaml       — the single source of truth for permission names, defaults and scopes
/docs/testing/uat/                    — Bengali UAT scripts per phase gate
/docs/gates/                          — sign-off and release notes per phase gate
/docs/ops/DEPLOYMENT.md, RUNBOOK.md   — deployment, backup/restore, operations

Documentation language: English (the team reads both; the blueprint stays Bengali). User interface: Bangla and English, both first-class.

Before any significant change, read the relevant documents. Never contradict them silently.

==================================================
4. SCOPE
==================================================

IN SCOPE
* Programs and projects (component-based, template-based), budgets and fund sources
* Staff and volunteer registration, approval, profiles, teams, ratings, categories, blocklist, application transfer, staff handover
* Beneficiary master (NID / birth registration), duplicate detection, profile merge
* Dynamic form platform with sections, versions and conditional logic; public application links
* Application lifecycle on a configurable workflow engine; priority score, quotas, waitlist
* Project workflows: distribution (winter, iftar, meat), house construction with issue log, self-reliance (স্বাবলম্বী) with zakat assessment, safe water, tree planting, Qurbani (donors and animals)
* Volunteer expense claims and payments; beneficiary support payments
* Dawah module: syllabus, classes, attendance, exams, call log
* SOP-based document register, deficiency reports, media consent, media story tracker
* Monitoring control centre, audit log, work summaries, dashboards, exports
* Offline-first mobile PWA for field volunteers
* Administration: users, roles, permissions, settings, nisab, templates, notification and SMS provider settings

OUT OF SCOPE (do not build, do not design for)
* HR, payroll, salary, staff leave or attendance
* Inventory or warehouse module (only per-project stock reconciliation, §13)
* General procurement module (the procurement team is only a role, §5)
* Accounting ledger (the finance team only views and exports)
* Notifications to beneficiaries (none for now)
* Migration of legacy data (none at launch; legacy sheets, Google Forms and Kobo data stay where they are)

==================================================
5. ORGANIZATION, ROLES AND DATA SCOPES
==================================================

Programs (from the SOP):
* Underprivileged Community Development Program — স্বাবলম্বী (self-reliance)
* Humanitarian Program — winter clothing, iftar, meat distribution, Qurbani, tree planting, safe water
* Emergency Response and Rehabilitation Program — flood/emergency relief, house construction

Official roles
| Role | Summary |
| --- | --- |
| Department Head | Highest access; creates programs, assigns PMs; approves registrations; blocklist; permission panel. This is the Main Admin / System Owner account and must not be deletable through normal CRUD. |
| Monitoring Team | Same access as Department Head everywhere; monitoring control centre, audit log, staff oversight; approvals; blocklist; permission panel |
| PM — Program Manager | Creates and configures projects in own program (components, forms, budget, deadlines, rules), assigns areas and RPMs, program dashboard; final approval in house construction; closes and reopens projects; SOP proposals, criteria and completion reports |
| RPM — Regional Program Manager | Full access to projects in own region; adds volunteers, paid volunteers and local দায়ী; brings and finally approves applications; application transfer; grants permissions to own team; collects and submits field documents |
| Project Executive | Reviews, verifies and edits applications, passes them to RPM; may bring applications from the field (house construction); approves volunteer registrations and edit requests |
| Implementer (বাস্তবায়নকারী) | SOP role: implementation and documents of the safe-water project |
| Official দায়ী | Salaried staff under RPM: conducts initial and final exams, tracks whether local দায়ীs post daily class updates, follows up beneficiaries by phone with a call log; approves zakat eligibility |
| Procurement Team | Currently only on house construction. View applications (no edit/delete); raise issues in the issue log; resolve issues raised by themselves or by paid volunteers and record the resolution |
| Media Team | View applications and beneficiary stories; read, write and edit stories; collect photos/videos; track publication. Cannot change project, application or beneficiary data |
| Finance Team | Viewer: budgets, payments, vouchers, expense claims; CSV/PDF reports. No entry, edit or approval |

Volunteer types (one registration form, type chosen there)
| Type | Work |
| --- | --- |
| General Volunteer | Submits beneficiary applications and distributes |
| Local দায়ী | Teaches basic Islamic knowledge to beneficiaries, posts daily attendance and learning updates; receives an honorarium |
| দাঈ-স্বেচ্ছাসেবক (both) | Applications, distribution and classes; may add team members. Rated per kind of work, not per role: one score set for application/distribution, a separate set for dawah; never averaged |
| Team Member | Registered with the main volunteer's NID as reference; can only create applications; the main volunteer submits them |
| Paid Volunteer | Marked by RPM on a project; posts construction/work progress with photos and raises issues; views applications, no edit |

Data scopes (permission = role × scope): GLOBAL, PROGRAM, PROJECT, REGION, DISTRICT / UPAZILA / UNION, ASSIGNED, SELF. Defaults are in the blueprint's permission matrix (A৪); the permission panel lets Department Head or Monitoring Team grant or revoke any permission for anyone, every change audited. The same person may hold different permission sets on different projects.

Field-level protection: NID numbers and NID photos, bank details, ratings, categories, donor data and the official section of forms are visible to officials only, never to volunteers, in exports as well as screens.

==================================================
6. CORE DOMAIN MODEL (summary — full detail in the blueprint, Part B)
==================================================

programs → projects → project_components, project_templates, project_quotas, fund_sources
forms → form_versions → form_sections → form_fields / options
applications → application_answers (JSONB), application_scores, workflow_transitions, activities
beneficiaries (nid / birth_reg unique) → profile_merges, media_consents, followup_evaluations
volunteers → volunteer_teams, project_volunteers (permissions per project), ratings, categories, blocklist, application_transfers
users / roles / permissions / scopes, device_sessions, handovers
distributions, stock_movements, constructions, issues, site_verifications
payments (unique transaction_id), expense_claims → expense_items, vouchers, budget_ledger
donors, animals (one animal → one volunteer), animal_shares, animal_photos
dawah: syllabus, classes, attendance, exams, calls
documents (SOP register), deficiency_reports, media_stories
locations (division → district → upazila → union → ward), notifications, audit_log

Primary keys are system ids (UUID / BEN-ID / APP-ID). Unique: NID, birth registration, payment transaction_id, client_uuid for offline records, (animal, assigned volunteer). Dynamic answers in JSONB. Audit columns everywhere. No hard delete of business data.

==================================================
7. APPROVED BUSINESS DECISIONS (never re-open without approval; seed DECISION_LOG.md with these)
==================================================

Identity and beneficiaries
BD-01 Beneficiary identity = NID or birth-registration number; one of them is mandatory in every project; each is unique; format validated (NID 10/13/17 digits, birth registration 17 digits). Mobile number is contact data, editable, not identity.
BD-02 Entering a known NID/birth number auto-fills name, father/husband name, mobile and address; name, father/husband name and the id are locked; mobile and address are editable with a change log. A locked field changes only through the official "profile correction request" flow.
BD-03 A volunteer cannot use their own mobile number as a beneficiary's number (enforced in the database too).
BD-04 Family-duplicate warning: same union+village, father/husband name or mobile as an existing beneficiary in the same project → warning at review; never auto-reject; officials decide with a reason. No household id.
BD-05 Profile merge for duplicate profiles: system suggests candidates (name+father+mobile; name+DOB+union; same mobile), officials compare and merge; both ids remain searchable; the retired BEN-ID points to the kept one; merge is logged and reversible by the Monitoring Team. Merge by PM, Monitoring Team or Department Head; RPM may propose.
BD-06 Blocklist for volunteers and beneficiaries: set and lifted by RPM or above (PM, Monitoring, Head) with a reason. Blocked volunteer: no new applications, no new assignments, loses visibility of own applications. Blocked beneficiary: no new application in any project; ongoing applications continue unchanged.
BD-07 Application transfer: RPM (or an executive with permission) adds a new volunteer and transfers all or selected applications; the new volunteer gets full prior access; the old one sees nothing; fully logged.
BD-08 Staff handover: an official's account cannot be deactivated until pending reviews/approvals, projects, documents, issues and follow-ups are reassigned; the handover record is kept.

Projects, forms, workflow
BD-09 Projects are assembled from reusable components (application form, public link, volunteer assignment and limits, dispatch/receive, distribution and photos, site verification, stage progress, issue log, dawah, exams, beneficiary payment, materials and placard photo, vouchers, volunteer expenses, donors and animals, follow-up, rating criteria, document checklist). Nothing project-specific is hard-coded; new project types need configuration, not code.
BD-10 Templates: both master templates and "copy from a previous project"; copies are independent snapshots; any user with project-creation access may create templates. Copied: components, form (as v1), workflow stages, photo rule, rating criteria, issue types, expense categories, syllabus, document checklist, scoring criteria. Not copied: applications, beneficiaries, budget amounts, dates, volunteer assignments, ratings, logs, quota targets.
BD-11 Workflow states and transitions are configuration, not code. Common states: Draft → Submitted → Under Review → Reviewed → Approved / Rejected → Implementation or Distribution → Completed → Closed; per-template stages after approval.
BD-12 Forms are built from a section library (basic info, address, family and income, livelihood, project questions, financial status, loans, zakat assessment, official section, attachments) and a field library; sections and fields have visibility (volunteer / official only) and conditions. A published form is immutable; changes create a new version; old applications keep their version.
BD-13 Mandatory in every project: NID/birth registration, name, father/husband name, mobile, gender, division → district → upazila → union, village. Everything else per project (toggle per field).
BD-14 Beneficiary type options default to: বৃদ্ধ, বিধবা, এতিম, প্রতিবন্ধী, অসুস্থ, শ্রমজীবী, অতিদরিদ্র, অন্যান্য; editable per project; "অন্যান্য" opens a text box on the same field. Branching questions are one field whose options depend on the previous answer.
BD-15 No spot or community code field.
BD-16 Per-volunteer application limit and project deadline are enforced; PM may extend the deadline with a reason (logged).
BD-17 Over-subscription: priority score computed from PM-defined criteria (e.g. income, family size, beneficiary type, not previously assisted, housing), area quotas shown at review, outcomes approved / waitlist / rejected with reason; deciding against the score requires a comment; waitlist is pulled in one click; the score never approves or rejects by itself.
BD-18 Field unlock on approved applications: officials unlock one field, old and new values and reason are logged.
BD-19 Follow-up evaluation is continuous work with no fixed schedule or reminders; officials add evaluations whenever they check on a beneficiary, also after project close.
BD-20 Close/reopen: only PM closes (everything read-only except follow-ups); PM may reopen with a reason.

Distribution and construction
BD-21 Photo rule is set per project: door-to-door → one photo per beneficiary; gathered distribution → group photo only. No completion without the required photos. Photos keep capture date/time and GPS; duplicate uploads trigger a warning.
BD-22 Stock reconciliation per distribution project: sent = distributed + remaining + damaged must balance before completion; differences need a reason and raise a monitoring alert.
BD-23 Distribution edge states: absent, later distribution (same application), not distributed (closed, no cost), shortage (waitlist), damaged/lost (with photos), partial, beneficiary death/relocation (status change; PM decides on reassignment with reason).
BD-24 House construction: applications from volunteers or any assigned official; selection with PM final approval; one local দায়ী per area (e.g. 10 houses); 2–3 paid volunteers per district post daily stage progress with photos and raise issues; procurement team views and resolves issues; vouchers optional.
BD-25 Issue log: raise (with photos), assign, resolve with an entry visible to everyone on the project.

Self-reliance, dawah, zakat
BD-26 Dawah classes cover the whole family; female দায়ীs serve female beneficiaries (assignment can be split by gender); daily attendance with absence reasons and learning progress; initial and final exams by the Official দায়ী; separate results side by side.
BD-27 Beneficiary support payment in self-reliance is gated on passing the exam; date, amount and transaction id are stored on the application; then materials are purchased, placard photo and vouchers submitted, verified and locked.
BD-28 Zakat: the system computes total assets, debts and net assets and compares with the nisab to suggest eligibility; the Official দায়ী (as the approving আলেম) decides. Nisab is set by PM or above and versioned; each application stores the nisab used at verification so later changes never affect old data. Names of the implementing officer and the approving আলেম come from assignments, never typed.

Money
BD-29 Budget = target beneficiaries × cost per beneficiary, plus ledger-based buckets: allocated, approved, spent/distributed, remaining, beneficiary support, advance, actual expense, voucher submitted/verified, returned, volunteer expense claimed, volunteer expense paid. Advance ≠ actual expense. Volunteer operational expenses (decoration, transport, food, photocopy, banner) are never mixed with per-beneficiary cost.
BD-30 Fund-source tags on every project budget (zakat / sadaqah / general donation / specific donor); zakat funds only for zakat-eligible beneficiaries; reports by source.
BD-31 No approval thresholds. Every payment transaction id is unique; a second payment on the same claim is rejected. Payments to volunteers go by bKash and are recorded with date, amount and transaction id. Finance team views and exports; it does not enter or approve.

Qurbani
BD-32 Donor data comes from two sources — the SSL Excel/sheet (Transaction ID, Name, Phone, Email, Amount, cow shares, goats) and the system's own form for cash donors (name, mobile, email, amount, purpose, approval status, approver, comment, cow shares, goat count) — merged into one list.
BD-33 Animal numbers and share allocation are generated from donor data (a cow = 7 shares; status empty / full). Assignment of animals to volunteers is MANUAL, done on the volunteer's profile: multiple cows, or 1–4 goats; an allocated animal can never be given to another volunteer until the allocation is cancelled.
BD-34 Three photos per animal (animal, meat, packet) are emailed to donors with sent-status tracking; pre-notification by email/SMS with status.

Documentation (SOP v2.3, September 2026)
BD-35 Per-project document checklists come from templates: name, required / if needed / optional, responsible official role, deadline, status, soft-copy file, hard-copy location code (CSS-ALM-… / CSS-LKR-…), retention 5 years from submission. Soft copies follow Program → Project → Year → District.
BD-36 Missed deadline → soft warning notification and a 3-working-day countdown; still missing → marked non-compliance for that official; monitoring alert. Applies to officials only; documents are never submitted by volunteers and never affect volunteer ratings.
BD-37 Deficiency reports (11 fields of SOP 7.4) with a central log; a second report by the same person within a year is escalated automatically; legacy (pre-SOP) deficiencies are marked separately and exempt from non-compliance.
BD-38 Media consent (SOP 12) is adopted: consent status and channels on the beneficiary profile; without consent a photo cannot enter the "publishable" list.
BD-39 The document register replaces the SOP tracking sheet; quarterly audit report in one click.

Volunteers, ratings, monitoring
BD-40 Ratings: at project close the system proposes a score per criterion (max 5 criteria, 1–5 each) from work data; officials (PM / RPM / Executive) finalize. Categories A / B / C / D plus an "inactive" flag. Volunteers never see ratings or categories; a category change requires a comment.
BD-41 Work summary per staff member and volunteer (applications, approvals, distributions, photos, classes, timing) filterable by year, project and date, exportable to CSV/PDF.
BD-42 Monitoring control centre alerts: approvals pending beyond N days, missing photos, inactive volunteers, budget use, duplicate NID attempts, unbalanced stock, overdue documents, repeated deficiency reports.
BD-43 Dashboards: project, program, central, dawah; start with the 7 KPI groups of the blueprint (A১১); more can be added later.

Platform
BD-44 Registration: mobile and email verified by two separate OTPs, then the form (name, father's and mother's name, NID, WhatsApp, address, education, experience, work details, previous projects, Facebook id, optional bank details, reference, photo, NID photo). OTP is a fixed dummy code in dev/test and must be replaced by real gateways before production.
BD-45 Hosting on the organization's own server; development by the in-house team; PostgreSQL; nothing cloud-dependent.
BD-46 Retention: no limit; audit log, beneficiary history, photos and documents are permanent. Storage sizing and backups are handled by the IT team; the system must report storage growth.
BD-47 Notifications: in-app for staff and volunteers; email via the organization's SMTP; SMS via a provider-agnostic adapter (provider chosen before production); none to beneficiaries for now.
BD-48 Offline conflicts: server value wins on approved data; last write wins on drafts and field updates; both logged. Offline NID lookup is impossible; on sync, an already-existing NID sends the application to "needs verification" instead of rejecting it.
BD-49 Testing data and OTP: dummy OTP and seed data never reach production.

==================================================
8. MODULES AND ROADMAP
==================================================

Build in these phases; each phase ends with a gate where real users test and give feedback before the next starts. Field use starts at Phase 3.

Phase 0 — Requirement & Architecture Freeze: project documents from the blueprint, ERD and API contract, main screen mockups, workflow template definitions, open questions answered by the project owner. No code before sign-off.
Phase 1 — Foundation: auth and sessions, roles and scopes, permission panel, staff and volunteer registration and approval, volunteer and beneficiary tabs, program and project setup (draft save, components, templates), locations master, audit log, i18n, admin settings, staff handover.
Phase 2 — Beneficiary + Application + Form Platform: beneficiary master with NID logic, duplicate warning and merge, form platform, common workflow, field unlock, team members, priority score and waitlist, application transfer, offline PWA and sync, exports.
Phase 3 — Winter/Iftar pilot: distribution template, limits and deadlines, dispatch/receive, photo rules with metadata, today's distribution bulk screen, edge states, stock reconciliation, volunteer expense claims and payments, project dashboard and budget; pilot in one region, then all.
Phase 4 — Project-specific workflows: house construction (stages, paid volunteers, issue log, procurement role), safe water (advance, vouchers, return), self-reliance (zakat with nisab snapshot, exam-gated payment, evidence), tree planting (public form, site verification), Qurbani (donor import, animals, manual allocation, photo emails). Order may change by priority.
Phase 5 — Dawah + Monitoring + Follow-up: dawah module, monitoring control centre, work summaries, ratings and categories, project closing and continuous follow-up, document register (SOP), media consent and stories.
Phase 6 — Central reporting & optimization: program/central/dawah dashboards, beneficiary journey report, fund-source reports, performance and security hardening, backup/restore drill, deployment documentation.

Within a phase, work module by module. Each task prompt from the project owner is one controlled change; do not expand scope.

==================================================
9. ARCHITECTURE (approved parts and parts to confirm)
==================================================

Approved
* Database: PostgreSQL with JSONB for dynamic answers and component settings.
* Frontend: React (a Vite single-page application; D-073) delivered as an installable, offline-first PWA; one codebase for desktop and mobile; volunteers work mainly on phones and officials work equally on desktop and phone (UX-03); mobile-first.
* API: versioned REST (/api/v1), documented in openapi.yaml; server-side authorization on every endpoint.
* Files: object/file storage on the own server; private files only via signed, expiring URLs after an authorization check; images compressed on the phone, resumable uploads.
* Background jobs for sync processing, notifications, deadline warnings, score computation, report generation.
* Environments: development, test, staging, production on the organization's server. Secrets never committed. Production data never used in tests.

Proposed stack (recorded in DECISION_LOG.md as D-050…D-053 with status "proposed" at startup; it becomes approved only when the project owner confirms it in chat; do not substitute anything else silently)
* Backend: Node.js 24 LTS + TypeScript + NestJS (REST under /api/v1, OpenAPI generated with @nestjs/swagger and checked against docs/api/openapi.yaml), Prisma ORM on PostgreSQL 16. Every migration ships with a hand-written down.sql so it is reversible.
* Frontend: Vite + React 19 + TypeScript single-page application as the installable offline-first PWA (React Router, TanStack Query, Serwist service worker, Dexie/IndexedDB outbox for offline records and a separate photo queue), Tailwind CSS bound to the §12 tokens as CSS variables, use-intl for bn/en (D-073, replaces Next.js of D-052).
* Monorepo: pnpm workspaces — apps/web, apps/api, packages/shared (zod schemas, permission names, i18n keys, pure business-rule functions such as score, zakat and budget math), packages/ui (design system), packages/config.
* Background jobs: pg-boss (PostgreSQL-backed queue, no Redis). Object storage: MinIO (self-hosted, S3-compatible, presigned expiring URLs) with a local-filesystem adapter for tests. Email: Nodemailer over the organization's SMTP (Mailpit in dev). SMS: provider-agnostic adapter with a logging stub in dev; the real provider is chosen before production (needed before Qurbani).
* Dev/test infrastructure: Docker Compose (postgres, minio, mailpit); CI on the organization's Git hosting running lint, typecheck, unit, API and E2E tests.
Still to confirm with the project owner: SMS provider (before production); brand assets; server details for deployment.

Offline-first rules (blueprint B৭): every offline record carries a client_uuid (idempotent on the server); sync_status pending → syncing → synced / failed with automatic retry and backoff; separate compressed photo queue; text syncs before photos; no completion while photos are pending; local data encrypted and wiped on logout; sessions revocable per device for lost phones.

==================================================
10. NON-FUNCTIONAL REQUIREMENTS
==================================================

* Concurrency: about 2,000 volunteers at once on a distribution day; load-test before each field rollout.
* Devices: low-cost Android phones (2 GB RAM), some iPhones (UX-06) and older browsers; light initial load; paginated lists; minimal data use.
* Network: 2G/3G and intermittent; everything field-facing works offline.
* Retention: permanent; design for growing storage; report growth to the IT team.
* Availability and backup targets (RPO/RTO): proposed by you, approved by the IT team.
* Accessibility: keyboard navigation, visible focus, semantic HTML, labels, contrast, screen-reader names.
* Performance: measure first (query plans, N+1, bundle size), then optimize; dashboards and reports must paginate and cache sensibly.

==================================================
11. LOCALIZATION
==================================================

* Bangla (bn) and English (en), both first-class, switchable per user.
* No hard-coded user-facing text; central i18n keys (t("application.approve")). Covers labels, buttons, validation, notifications, errors, statuses, menus, reports, email/SMS templates.
* All numbers (amounts, dates, counts, ids, phone numbers) use English digits 0-9 in both languages (owner decision UX-05). Formatting stays in one central utility, so Bengali digits could be added later by a new decision. A Hijri date may be shown beside a Gregorian date through a setting that is off by default.
* Form field labels, section names, option lists, status names and workflow stage names are bilingual data.
* Adding a third language later must not require rewriting the application.

==================================================
12. DESIGN SYSTEM (starting tokens — use these; do not invent new ones per page)
==================================================

Colors (brand palette taken from the website https://assunnahfoundation.org/ on 2026-10-10; derivations and contrast checks in docs/ui/brand/colors.md)
* bg/canvas #F2F3F7 · bg/surface #FFFFFF · bg/muted #EEF2F0 · bg/brand-soft #CEF5E3
* border/default #DFE3E8 · border/strong #7F8E9D
* text/primary #0F2920 · text/secondary #526961 · text/on-brand #FFFFFF
* brand/primary #008E48 (green, for large surfaces, icons and charts) · brand/primary-dark #007B3E (filled buttons and links with small text, 4.5:1 or better with white) · brand/ink #0F2920 · brand/accent #E8B65D (amber, decoration only) · brand/accent-ink #9B6119 (amber as small text)
* status/success #2E7D4F · status/warning #B9770E · status/danger #C0392B · status/info #2B6CB0 (unchanged; status only, always with an icon and a label)
Spacing scale: 4, 8, 12, 16, 24, 32 px. Radius: 6 (small), 10 (medium), 16 (large); the website uses 8 px for controls and 20 px for cards, and task T0.19 decides whether to align.
Typography: UI text in the font stack UbuntuSans, Bornomala, sans-serif (the website's stack), weights 400 and 700 only, self-hosted. UbuntuSans draws Latin letters and digits, Bornomala draws Bengali. Medium and SemiBold are not available, so Bold replaces them for emphasis. Sizes Display 20 Bold, Title 16 Bold, Body 14 Regular, Label 12 Bold, Caption 11 Regular; line-height 150%. Task T0.19 confirms the mapping and tests a 16 px body on phones. The Bornomala licence is not yet verified (docs/ui/brand/colors.md).
Base components to build once and reuse: Button (primary/secondary), Badge/Status, Card/Stat, Field/Text (and select, date, number, file), Nav/Item, Row/Toggle, Table with filters/search/pagination, Modal, Drawer, Confirm dialog, File upload with preview, Alert, Tabs, Breadcrumb, Empty/Loading/Error states, Offline banner, Bulk-update list row with checkbox, Step/timeline, Progress bar.
Look: professional, calm, institutional; green is the action colour and amber is a decorative accent; status colors only for status. The colours and fonts come from the Foundation's website (docs/ui/brand/colors.md); the logo file is still to be supplied in /docs/ui/brand/. Full direction: docs/ui/DESIGN_BRIEF.md.

Key screens (no mockups exist yet; they are built as clickable HTML in task T0.19b, see docs/ui/DESIGN_BRIEF.md): project setup with component toggles; form builder (section library, preview, field settings, versions); application review list with detail panel, step timeline and change log; project dashboard with budget bars, funnel, monitoring alerts, volunteer summary; mobile volunteer home with offline banner; mobile new application with NID lookup and auto-fill; mobile today's distribution bulk screen; volunteer profile with permissions, work summary, ratings, animal allocation, blocklist/transfer; registration with OTP; document register; issue log; donor list.

==================================================
13. STANDARDS
==================================================

API: consistent envelope, pagination, filtering, sorting, searching, validation errors with codes, localized messages, idempotency keys for sync and payments, rate limiting on auth and public forms; every endpoint documents auth, permission name, request, response, errors; breaking changes need impact analysis, approval, OpenAPI update, migration and tests.

Database: normalization where appropriate, foreign keys, unique and check constraints, indexes on query paths, transactions, audit columns (created_by/at, updated_by/at), soft-delete only where approved, reversible migrations, never fix bugs by editing production data.

Audit log: actor, action, entity, entity id, timestamp, IP/device where appropriate, before and after state, reason. Always for: permission and role changes, approvals and rejections, field unlock, blocklist, transfer, handover, merge and merge reversal, payments and expense verification, animal allocation, nisab changes, deletion, template changes, document deadline extensions, deficiency reports, media consent, exports of sensitive data.

Security: OWASP baseline; object- and function-level authorization checks; no IDOR; input validation; safe file upload (type, size, virus-scan hook); CSRF/XSS protection; session hardening; no secrets in code or logs; dependency scanning; errors never leak stack traces or SQL.

Code: TypeScript where applicable; small focused modules; domain-oriented business logic in one place (no duplicated calculations across UI, API, database and reports); no magic numbers; no hard-coded permissions or strings; reusable services and components.

Git: small coherent commits — feat(application): …, fix(sync): …, test(payment): …, docs(erd): …; no history rewriting; no secrets or .env with secrets.

==================================================
14. TESTING
==================================================

Testing is part of every task, not a final activity. Testing pyramid: unit tests for every testable business rule (BR-nnn), integration tests for cross-module behavior, API/contract tests against openapi.yaml, Playwright end-to-end for critical journeys, k6 load tests for distribution-day concurrency, axe for accessibility, visual regression for key screens, security tests (authorization matrix, IDOR, upload), data-integrity tests (unique constraints, idempotency), smoke tests per deployment.

Critical E2E journeys: login/logout and role-based denial; volunteer registration with OTP and approval; mobile application with NID auto-fill, offline capture and sync; review, score, waitlist, approval, field unlock; application transfer; today's distribution with photos and reconciliation; expense claim and payment with unique transaction id; house-construction issue raise/resolve; self-reliance exam → payment → voucher lock; Qurbani allocation exclusivity; document deadline warning and deficiency report; language switch.

==================================================
15. DEVELOPMENT PROCESS
==================================================

For every task prompt:
1. Read the relevant documents and current code.
2. Identify dependencies and conflicts.
3. Before coding, state briefly: what you found, what you will change, what you will NOT change, risks, tests to add.
4. Implement only the requested scope; reuse existing architecture.
5. Add or update tests and documentation in the same change.
6. Verify by running tests.
7. Report using this template:

### Changed
### Files
### Database (schema / migrations)
### API (contract changes)
### Security (permissions, sensitive data)
### Tests (created, executed, results)
### Documentation updated
### Decisions needed / open questions
### Remaining issues

Definition of Done: requirement satisfied; business rule documented; database, API, authorization, validation, UI, localization and audit implemented where applicable; unit, integration, API and relevant E2E tests executed and passing; security and accessibility checks passed; documentation updated; no known critical regression.

Change impact analysis for significant changes: database, API, UI, security, tests, existing modules, migration, deployment.

Never: delete or overwrite data to make a feature work; weaken a security check to pass a test; introduce a new UI pattern when one exists; claim untested work as done; expand scope beyond the prompt.

==================================================
16. STARTUP PROCEDURE (first session only)
==================================================

Do not write application code in the first response.
1. Read /docs/source/ERP_BLUEPRINT_BN.md completely.
2. Inspect the repository: existing stack, code, database, documents, dependencies, deployment and test configuration (the repository may be empty).
3. Summarize the current technical state.
4. Create the documentation structure of §3 and write first drafts of MASTER_SPEC.md (faithful English summary of the blueprint), PROJECT_RULES.md, MODULE_CATALOG.md, BUSINESS_RULES.md (every rule as BR-nnn), DECISION_LOG.md (seeded with BD-01…BD-49), NON_FUNCTIONAL_REQUIREMENTS.md, and outlines for architecture, ERD, API, security and test strategy.
5. List what is missing or ambiguous in the blueprint — only items that need the project owner's decision — with your recommendation for each. Do not restart discovery; the blueprint is the discovery.
6. Stop and wait for the project owner's answers before Phase 1 design.

==================================================
17. INFORMATION THE PROJECT OWNER WILL PROVIDE
==================================================

Already available: the blueprint (/docs/source/ERP_BLUEPRINT_BN.md), the department SOP v2.3, the design tokens above, the Qurbani donor sheet formats.
To be provided when asked: backend stack choice; brand assets (logo, official colors) if different from the tokens above; server details for deployment; SMTP details; SMS provider and credentials before production; sample filled forms for testing (anonymized).

==================================================
18. FINAL PRINCIPLES
==================================================

NO GUESSING. NO SILENT CHANGES. NO UNTRACKED DECISIONS. NO UNDOCUMENTED BUSINESS RULES. NO BROKEN CONTRACTS. NO UNTESTED CRITICAL FEATURES. NO UNAUTHORIZED ACCESS. NO DATA LOSS. NO UNNECESSARY REWRITES. NO DEADLINE PRESSURE OVER QUALITY.

Build deliberately. Read before changing. Ask before guessing. Document before forgetting. Test before declaring done. Keep the whole system consistent.

If /docs/STATUS.md is missing or says that Phase 0 has not started, begin with the STARTUP PROCEDURE (§16) when the owner asks for it. Otherwise follow the session ritual in CLAUDE.md, summarize where the project stands, and wait for the owner's task prompt.
