# MODULE CATALOG

Status: complete first draft, task T0.1 (2026-10-10). Sources: blueprint B১ (ten core modules), Part A chapters, constitution §4 (scope), §8 (phases), `docs/MASTER_SPEC.md`, `docs/PLAN.md` §4 (task ids). "Needs decision" entries point to the numbered open questions in `docs/DECISION_LOG.md` (section "Open").

## 1. Blueprint core modules (B1) and how this catalogue maps to them

| B1 # | Core module | Catalogue modules below |
|---|---|---|
| 1 | Program & Project | M06 Programs & Projects |
| 2 | Beneficiary | M05 Beneficiary Master |
| 3 | Volunteer | M03 Registration & Approval, M04 Volunteer Management |
| 4 | Application & Form Platform | M07 Form Platform, M08 Application Workflow (application entity) |
| 5 | Workflow & Approval | M08 Application Workflow |
| 6 | Project Activities | M09 Project Activities, M11 Qurbani |
| 7 | Dawah | M12 Dawah |
| 8 | Budget & Project Accounts | M10 Budget & Ledger |
| 9 | Monitoring & Follow-up | M14 Monitoring & Follow-up |
| 10 | Reports & Audit | M15 Audit Log, M16 Dashboards, Reports & Exports |
| — | Shared services | M01 Auth & Sessions, M02 Users, Roles & Permissions, M13 Documents (SOP), M17 Notifications, M18 Files & Media, M19 Locations, M20 i18n, M21 Admin & Settings, M22 Offline Sync |

Out of scope (constitution §4, blueprint A1): HR, payroll, leave, attendance of staff; inventory/warehouse; general procurement; accounting ledger; notifications to beneficiaries; legacy data migration.

## 2. Module catalogue

Columns: purpose · primary users · key entities · depends on · B1 core module · phase (constitution §8) · blueprint sections · PLAN.md tasks · needs decision.

### M01 Auth & Sessions
- Purpose: login with mobile/email and password, OTP for registration (dummy in dev/test), device sessions, revocation for lost phones, lockout, session refresh on role change.
- Primary users: everyone.
- Key entities: users, device_sessions, otp_codes (dev dummy), password resets.
- Depends on: M02, M17 (OTP delivery), M21 (settings).
- B1: shared service. Phase: 1. Blueprint: A5 (OTP), B8 (session and login), B10 (account security). Tasks: T0.9, T1.7.
- Needs decision: resolved 2026-10-10 by O-id = question number; was open question(s) 5 (password rules, token lifetimes, lockout, OTP at login).

### M02 Users, Roles & Permissions
- Purpose: roles, permission names, data scopes (GLOBAL … SELF), permission = role × scope, project-level permission sets, permission panel with full audit, field-level protection rules.
- Primary users: Department Head, Monitoring Team (panel); every request (enforcement).
- Key entities: roles, permissions, user_roles, user_permissions (overrides), scopes, project_volunteers.permission_set, project staff access.
- Depends on: M01, M15, M06 (project assignments).
- B1: shared service (B4). Phase: 1. Blueprint: A4 (both matrices, permission panel), B4, B8 (field-level). Tasks: T0.10, T1.8.
- Needs decision: none beyond permissions.yaml authoring (T0.10).

### M03 Registration & Approval
- Purpose: staff and volunteer registration forms, two-OTP verification, pending state in the volunteer tab, field-level correction requests, approval and activation, profile edit requests, staff handover before deactivation.
- Primary users: volunteers (self-registration), Department Head/Monitoring Team (staff), Project Executive/RPM/PM/Monitoring/Head (volunteer approval).
- Key entities: volunteers, users (staff), registration_requests, correction_requests, edit_requests, handovers.
- Depends on: M01, M02, M18 (photo, NID photo), M17, M19.
- B1: 3 Volunteer. Phase: 1. Blueprint: A5 (registration, verification and approval, profile rules, staff exit and handover), Q-19, Q-42; BD-08, BD-44. Tasks: T1.9.
- Needs decision: resolved 2026-10-10 by O-id = question number; was open question(s) 20 (volunteer NID uniqueness, volunteer also a beneficiary).

### M04 Volunteer Management
- Purpose: volunteer tab (nationwide list, filters, statistics), assignment to projects by region with permission sets and the paid flag, rules-and-consent acceptance, team management by NID reference, ratings (max 5 criteria, 1–5, proposed from work data at close), categories A/B/C/D plus inactive flag with mandatory comment, blocklist, application transfer, work summary link.
- Primary users: RPM, Project Executive, PM; volunteers (team assignment, consent).
- Key entities: volunteers, project_volunteers, volunteer_teams, ratings, rating_criteria, categories (log), blocklist, application_transfers, consents.
- Depends on: M03, M06, M08 (transfers), M14 (work summary), M15.
- B1: 3 Volunteer. Phase: 1 (tab, assignment, teams, blocklist, transfer basics), 2 (transfer of applications), 5 (ratings and categories). Blueprint: A5, A4 volunteer types, Q-07, Q-16, Q-20, Q-25, Q-32, Q-34, Q-45; BD-06, BD-07, BD-40. Tasks: T1.10, T1.12, T2.6, T5.3.
- Needs decision: resolved 2026-10-10 by O-id = question number; was open question(s) 10 (rating averages).

### M05 Beneficiary Master
- Purpose: permanent BEN-ID profile keyed by NID or birth registration (format validation), auto-fill and locked fields, profile correction request, mobile and address change log, volunteer-own-number block, family-duplicate warning at review, duplicate-candidate detection and profile merge with reversal, beneficiary blocklist, profile statuses, beneficiary tab and 360° profile, media consent status.
- Primary users: volunteers (lookup and auto-fill), officials (tab, merge, blocklist), PM/Monitoring/Head (merge).
- Key entities: beneficiaries, beneficiary_contact_changes, profile_correction_requests, profile_merges, blocklist, media_consents, family sub-table (earners).
- Depends on: M07 (standard fields), M08, M19, M15, M18 (photo).
- B1: 2 Beneficiary. Phase: 1 (tab shell), 2 (full master). Blueprint: A7 (360°, blocklist, duplicates and merge), B2, B3 (NID identification), Q-21, Q-44, Q-45; BD-01…BD-06. Tasks: T1.10, T2.2.
- Needs decision: resolved 2026-10-10 by O-id = question number; was open question(s) 2 (mobile uniqueness), 3 (BEN-ID format), 18 (profile status list), 17 (media consent capture).

### M06 Programs & Projects
- Purpose: programs with PM assignment; project setup with draft save; configuration groups (basic data, budget, deadline, areas and RPMs with district split, staff access, form, rules and consent, dawah toggle and syllabus, photo rule and source, rating criteria, limits and stages, document checklist); components with settings (project_components); master templates and copy-from-project with the copy/not-copy list; lifecycle draft → active → closing → closed and reopen; deadline extension with reason; project code.
- Primary users: Department Head (programs), PM (projects), Monitoring/Head (templates).
- Key entities: programs, projects, project_settings, project_areas, project_components, project_templates, project_quotas, rules_consent texts, fund_sources (with M10).
- Depends on: M02, M07, M10, M19, M15.
- B1: 1 Program & Project. Phase: 1 (core setup, templates, consent, assignment), 5 (close/reopen complete). Blueprint: A2, A6, Q-08, Q-12, Q-33, Q-35, Q-38; BD-09, BD-10, BD-16, BD-20, UX-11. Tasks: T1.11, T1.12, T5.3.
- Needs decision: resolved 2026-10-10 by O-id = question number; was open question(s) 3 (project code), 12 (Closing state), 23 (follow-up template).

### M07 Form Platform
- Purpose: section library, standard field library (Appendix B), custom fields, field types incl. Bangladesh address, repeat group, calculation; bilingual labels; visibility (volunteer / official only); no-code conditional logic; mandatory toggles with the fixed mandatory set; "অন্যান্য" text box; immutable published versions; public application link; shared evaluator used by server and client.
- Primary users: PM (builder), volunteers and public (filling), officials (official section).
- Key entities: forms, form_versions, form_sections, form_fields, field_options, field_library, section_library, public_form_links.
- Depends on: M06, M19, M05 (standard columns), M22 (evaluator offline).
- B1: 4 Application & Form Platform. Phase: 2. Blueprint: B3, A6 (form group), Appendix B, Q-26…Q-31; BD-12…BD-15. Tasks: T2.3, T2.4.
- Needs decision: resolved 2026-10-10 by O-id = question number; was open question(s) 8 (public link abuse rules).

### M08 Application Workflow
- Purpose: configurable workflow engine (states, transitions, allowed roles, guards from YAML templates), common cycle Draft → Submitted → Under Review → Reviewed → Approved/Rejected → Implementation → Completed → Closed, per-status permissions, review with full-form edit, approval routing (RPM; PM in house construction), field unlock with change log, priority score, quotas, waitlist and mandatory comment against the score, application limit and deadline enforcement, "needs verification" state for sync conflicts, application id generation, family-duplicate warning hook, transfer of applications.
- Primary users: volunteers, team members, Project Executive, RPM, PM.
- Key entities: applications, application_answers, application_scores, workflow_templates, workflow_transitions, field_changes, application_transfers, project_quotas.
- Depends on: M05, M06, M07, M02, M15, M17.
- B1: 4 and 5. Phase: 2. Blueprint: A7, B5, Q-04, Q-05, Q-06; BD-11, BD-16, BD-17, BD-18, BD-48. Tasks: T0.11, T2.5, T2.6.
- Needs decision: resolved 2026-10-10 by O-id = question number; was open question(s) 3 (application id), 13 (limit counting and late drafts), 21 (score recomputation).

### M09 Project Activities
- Purpose: activity engine (Distribution, Construction, Purchase, Training, Visit, Payment, Voucher, Expense, Issue, Inspection, Follow-up); dispatch and receive confirmation; today's distribution bulk screen with photo rule, capture metadata and duplicate-photo warning; edge states; stock reconciliation gate; stage-based progress; issue log (raise, assign, resolve); site verification; beneficiary support payments and advances; vouchers with verification lock; materials and placard photo; volunteer expense claims and bKash payments with unique transaction id.
- Primary users: volunteers, paid volunteers, Project Executive, RPM, Procurement Team (issues), PM.
- Key entities: project_activities, stock_movements, distributions, constructions/stages, issues, site_verifications, payments, vouchers, expense_claims, expense_items.
- Depends on: M08, M10, M18, M22, M15, M17.
- B1: 6 Project Activities. Phase: 3 (distribution, expenses, payments), 4 (construction, safe water, self-reliance, tree planting). Blueprint: A8.1–A8.5, B5 (activity engine, bulk screens), Q-22, Q-46; BD-21…BD-25, BD-27, BD-31. Tasks: T3.1, T3.2, T4.1, T4.2, T4.3, T4.5.
- Needs decision: resolved 2026-10-10 by O-id = question number; was open question(s) 14 (expense claims), 22 (payment methods).

### M10 Budget & Ledger
- Purpose: planned budget = target × cost per beneficiary; bucket-based ledger (allocated, approved, spent, remaining, beneficiary support, advance, actual expense, voucher submitted/verified, returned, volunteer expense claimed/paid); fund-source tags and zakat-fund eligibility check; unique transaction ids; budget alerts; finance viewer and exports.
- Primary users: PM, RPM, Executive (entries via activities), Finance Team (view/export), dashboards.
- Key entities: budget_ledger, fund_sources, payments (shared with M09).
- Depends on: M06, M09, M16.
- B1: 8 Budget & Project Accounts. Phase: 3 (basic card and ledger), 4 (full buckets). Blueprint: A6 (budget), B6, Q-24, Q-37; BD-29, BD-30, BD-31. Tasks: T3.2, T4.6.
- Needs decision: resolved 2026-10-10 by O-id = question number; was open question(s) 4 (budget alert percentage), 14.

### M11 Qurbani
- Purpose: donor import from the SSL sheet and the system's cash-donor form merged into one list; animal and share generation (cow = 7 shares); manual exclusive allocation on the volunteer profile (several cows, 1–4 goats); animal-level spot and volunteer data; donor pre-notification by email/SMS with sent status; three photos per animal emailed to donors with status; Excel export with allocations; beneficiary side via the distribution template.
- Primary users: officials of the Qurbani project, volunteers (photos), Media/Finance (view).
- Key entities: donors, animals, animal_shares, animal_photos, donor_messages.
- Depends on: M09, M04, M17, M18, M16.
- B1: 6 Project Activities. Phase: 4. Blueprint: A8.6, Q-11, Q-47; BD-32…BD-34. Tasks: T4.4.
- Needs decision: resolved 2026-10-10 by O-id = question number; was open question(s) 19 (goat share model); SMS provider before production (C3 item 10).

### M12 Dawah
- Purpose: syllabus per project; দায়ী assignment per beneficiary group (gender split); today's class bulk screen (attendance, absence reason, topic, in progress/learned); family-member attendance; initial and final exams with side-by-side results and PDF; exam-gated payment hook for self-reliance; Official দায়ী tracking view with no-update alert; call log; dawah dashboard.
- Primary users: Local দায়ী, Official দায়ী, RPM.
- Key entities: syllabus_topics, dawah_classes, class_attendance, learning_progress, exams, exam_results, call_logs, daee_assignments.
- Depends on: M06 (Dawah Enabled), M08, M04, M14, M16, M22.
- B1: 7 Dawah. Phase: 4 (minimal exam activity for the self-reliance gate), 5 (full module). Blueprint: A9, A8.2–A8.3, Q-30; BD-26, BD-27. Tasks: T4.2 (exam minimum), T5.1.
- Needs decision: resolved 2026-10-10 by O-id = question number; was open question(s) 11 (family-member attendance).

### M13 Documents (SOP)
- Purpose: project document checklist templates (seven projects pre-seeded), document register with status chain collected → verified → approved → archived, responsible official role, due dates, soft warning and 3-working-day countdown, non-compliance marking, hard-copy location codes, 5-year retention, cloud folder path program → project → year → district, deficiency reports (11 SOP items) with automatic escalation on the second report within a year, legacy audit marks, quarterly audit report, CSV export.
- Primary users: PM, RPM, Project Executive, Implementer; Monitoring Team; volunteers never.
- Key entities: document_checklist_templates, documents, deficiency_reports, holiday_calendar (with M21).
- Depends on: M06, M18, M17, M14, M21.
- B1: shared service (documents). Phase: 0 (data model), 1 (checklist template editor in admin), 5 (full register). Blueprint: A10 (documentation, SOP mapping table, legacy audit), Q-14; BD-35…BD-39. Tasks: T0.13, T1.13, T5.4.
- Needs decision: resolved 2026-10-10 by O-id = question number; was open question(s) 16 (working days); input dependency SOP v2.3 text.

### M14 Monitoring & Follow-up
- Purpose: monitoring control centre (project progress, stuck work, regularity), automatic alerts (review/approval pending, no update, distribution without photo, budget, incomplete activity, inactive volunteer, delay, duplicate NID attempts, unbalanced stock, overdue documents, repeated deficiency reports), work summaries per staff and volunteer with CSV/PDF, continuous follow-up evaluations also after close.
- Primary users: Monitoring Team, Department Head, PM, RPM, Official দায়ী.
- Key entities: alerts, alert_settings (thresholds), followup_evaluations, work_summary (computed).
- Depends on: M08, M09, M12, M13, M10, M16, M17.
- B1: 9 Monitoring & Follow-up. Phase: 5. Blueprint: A10 (control centre, alerts, work summary), A6 (follow-up), Q-33; BD-19, BD-41, BD-42. Tasks: T5.2, T5.3.
- Needs decision: resolved 2026-10-10 by O-id = question number; was open question(s) 4 (thresholds), 23 (follow-up template).

### M15 Audit Log
- Purpose: permanent append-only log of every important action (actor, role, time, action, entity, id, old and new state, reason, IP/device, client_uuid); viewer and download by project, beneficiary or person; export logging for sensitive data.
- Primary users: Monitoring Team, Department Head; every module writes to it.
- Key entities: audit_log.
- Depends on: M01 (actor), M02.
- B1: 10 Reports & Audit. Phase: 1 (writer and basic viewer), 5 (viewer complete). Blueprint: A10 (audit log), B8 (record structure), Q-39; BD-46, constitution §13 audit list. Tasks: T1.6, T5.2.
- Needs decision: none.

### M16 Dashboards, Reports & Exports
- Purpose: project, program, central and dawah dashboards with year/area filters; the seven KPI groups; statistics on every list; Excel/CSV and PDF exports with field-level protection; beneficiary journey report; fund-source reports; exam comparison PDF; work summary export; storage growth report.
- Primary users: everyone within scope; Finance, Media, Procurement for own parts.
- Key entities: report definitions, export jobs, cached aggregates.
- Depends on: all domain modules, M02 (scope and field protection), M18 (fonts for PDF), M20.
- B1: 10 Reports & Audit. Phase: 2 (export service), 3 (project dashboard), 6 (program, central, dawah, journey). Blueprint: A11, B10 (data for other departments), Q-13, Q-41; BD-43, UX-10. Tasks: T2.8, T3.3, T6.1.
- Needs decision: none.

### M17 Notifications
- Purpose: in-app notifications for staff and volunteers (correction requests, approvals, assignments, soft warnings, alerts), email via the organization's SMTP (Mailpit in dev), SMS through a provider-agnostic adapter (logging stub in dev) for OTP and Qurbani donors, templates in bn/en, delivery status; none to beneficiaries.
- Primary users: all staff and volunteers; donors (email/SMS only).
- Key entities: notifications, notification_templates, outbound_messages, provider settings (M21).
- Depends on: M21, M20, background jobs.
- B1: shared service. Phase: 1 (in-app, email, SMS adapter), 4 (donor messaging). Blueprint: B9 (notifications), A8.6, Q-11; BD-34, BD-47, UX-12. Tasks: T0.14, T1.14.
- Needs decision: Web Push (DESIGN_BRIEF open item, T0.14); SMS provider before production.

### M18 Files & Media
- Purpose: object storage adapter (MinIO; filesystem in tests), signed expiring URLs after authorization, upload validation (type, size, virus-scan hook), client-side compression and resumable upload, photo metadata (capture time, GPS, source camera/gallery per project setting), duplicate-photo detection, voucher and document files, media consent gating of the "publishable" list, and the Media tab (O-28): a media work list of selected beneficiaries (`media_subjects`) with per-beneficiary media status, stories, channel and date and a writing area.
- Primary users: volunteers and paid volunteers (photos, vouchers), officials (documents), Media Team (stories, publishable list).
- Key entities: files, photo_metadata, media_subjects, media_stories, media_consents (owned by M05).
- Depends on: M02, M15, M05.
- B1: shared service. Phase: 2 (file service), 3 (photo rules), 5 (media tracker). Blueprint: B8 (file access), B10 (photos), A8.1 (photo rule and metadata), A10 (media team), Q-12; BD-21, BD-38, UX-11. Tasks: T0.13, T2.1, T3.1, T5.5.
- Needs decision: resolved 2026-10-10 by O-id = question number; was open question(s) 17 (consent capture and channels).

### M19 Locations
- Purpose: cascading master with four levels, division → district → upazila → union (no ward, O-09), used by forms, filters, quotas and scopes; offline copy on phones; admin-panel management (add upazila/union, rename, deactivate; never hard-deleted; audited); initial load from an open dataset.
- Primary users: all forms and filters; Department Head and Monitoring Team for management.
- Key entities: locations (hierarchical, with active flag).
- Depends on: M15 (audit), M21 (admin).
- B1: shared service. Phase: 1. Blueprint: B2 (locations), B3 (address component); O-09; BR-084, BR-228. Tasks: T1.2, T1.13.
- Needs decision: none (resolved by O-09).

### M20 i18n
- Purpose: bn and en as first-class languages, per-user switch, central message catalogue, bilingual data fields (labels, options, statuses, stages), one formatting utility with English digits, optional Hijri display setting, third language without rewrite.
- Primary users: everyone.
- Key entities: i18n keys (packages/shared), bilingual columns.
- Depends on: none.
- B1: shared service. Phase: 1. Blueprint: B9 (language), Q-17; constitution §11, UX-05. Tasks: T0.20, T1.5.
- Needs decision: none.

### M21 Admin & Settings
- Purpose: system settings (monitoring thresholds, photo defaults, payment methods, expense categories defaults, holiday calendar, nisab versions, SMS/SMTP provider settings, dummy OTP toggle restricted to non-production), master template editors (project, document checklist, rating criteria), Department Head account protection (not deletable).
- Primary users: Department Head, Monitoring Team, PM (nisab).
- Key entities: settings, nisab_versions, holiday_calendar, provider_settings.
- Depends on: M02, M15.
- B1: shared service. Phase: 1 (core), 6 (rest). Blueprint: A6 (templates), A8.3 (nisab), B9; BD-28, BD-44, BD-49, constitution §5 (Head account). Tasks: T1.13, T6.2.
- Needs decision: resolved 2026-10-10 by O-id = question number; was open question(s) 4, 15, 16, 22.

### M22 Offline Sync
- Purpose: installable PWA, IndexedDB outbox with client_uuid and sync_status, separate compressed photo queue, text before photos, retry with backoff, server-side idempotency, conflict rules (server wins on approved, last write on drafts and field updates, both logged), "needs verification" on NID collision, offline data set (forms, own beneficiaries and applications, syllabus, locations), encrypted local data wiped on logout or revocation, iOS Safari constraints.
- Primary users: volunteers, Local দায়ীs, paid volunteers.
- Key entities: outbox records, sync batches, photo queue, device_sessions (M01).
- Depends on: M07 (evaluator), M08, M09, M12, M18, M01.
- B1: shared/core architecture (B7). Phase: 2. Blueprint: B7, B10, Q-15, Q-23, Q-43; BD-48, UX-06. Tasks: T0.12, T2.7, T2.10.
- Needs decision: resolved 2026-10-10 by O-id = question number; was open question(s) 7 (offline scope and photo budget).

## 3. Dependency overview

```
M19 Locations, M20 i18n, M21 Admin ──► used by everything
M01 Auth ──► M02 Permissions ──► every endpoint
M03 Registration ──► M04 Volunteer ──► M08 Workflow (transfer)
M06 Projects ──► M07 Form Platform ──► M08 Application Workflow ──► M09 Activities ──► M10 Ledger
M05 Beneficiary ◄──► M07 / M08 (standard fields, lookup, needs verification)
M09 Activities ──► M11 Qurbani, M12 Dawah (exam gate), M13 Documents (attachments)
M14 Monitoring ◄── M08, M09, M12, M13, M10
M15 Audit ◄── every write
M16 Dashboards ◄── every domain module
M17 Notifications ◄── M03, M08, M13, M14, M11
M18 Files ◄── M03, M09, M11, M12, M13
M22 Offline ◄── M07, M08, M09, M12, M18
```

## 4. Phase map (constitution §8, PLAN.md §2.4)

| Phase | Modules delivered (or started) |
|---|---|
| 0 | Documents only: data model for all modules (ERD), workflow templates, permissions.yaml, screens |
| 1 | M01, M02, M03, M04 (tab, assignment, teams, blocklist, consent), M06 (core setup, templates), M13 (checklist template editor), M15 (writer), M17, M19, M20, M21 (core); My Work home |
| 2 | M05, M07, M08, M04 (application transfer), M16 (export service), M18 (file service), M22 |
| 3 | M09 (distribution, dispatch/receive, reconciliation, expense claims and payments), M10 (basic), M16 (project dashboard), M18 (photo rules); deployment pipeline; load test; pilot |
| 4 | M09 (construction, safe water, self-reliance, tree planting), M10 (full buckets), M11, M12 (exam minimum) |
| 5 | M12 (full), M14, M15 (viewer), M04 (ratings, categories), M06 (close/reopen), M13 (full register), M18 (media tracker) |
| 6 | M16 (program, central, dawah dashboards, journey report), M21 (rest), hardening, backup drill, manuals |

## 5. Needs-decision index

All "Needs decision" references to open questions 1–23 in the module entries above were resolved on 2026-10-10 by decisions O-01…O-23 (`docs/DECISION_LOG.md` section 5); the module entries keep the question numbers for traceability. Still open:

| Module | Open item |
|---|---|
| M10, M02 | Question 24 answered by O-24 (2026-10-10): officials enter payment records manually; the accounts team does not use the ERP for now |
| M17 | Web Push and PWA short name (DESIGN_BRIEF open items, T0.14) |
| M11, M17 | SMS provider before Qurbani (C3 item 10) |
| M13 | SOP v2.3 text (input dependency) |

Decisions that changed module scope: M19 has four levels and admin management (O-09); M10 records payments made by the accounts team and never executes them (O-22, BR-229); M05 uses UUID v7 as BEN-ID (O-03); M06 includes the Closing state (O-12); M21 holds the global nisab table, the holiday calendar (Friday weekend, O-16), payment methods and expense categories (O-14, O-22).
