# BUSINESS RULES — catalogue BR-001 …

Status: complete first draft, task T0.1 (2026-10-10). Every rule is extracted from the blueprint (`docs/source/ERP_BLUEPRINT_BN.md`), the constitution §5, §7, §13 or the owner's design decisions (`docs/ui/DESIGN_BRIEF.md`). Nothing is invented; gaps are listed in section 20. Rule ids are stable: never renumber; retire a rule by setting its status to "retired" with the reason.

Columns:
- **Source**: blueprint section (A5, B3 …) with table or paragraph where useful; "App B" = appendix খ; "§n" = constitution section; "UX-nn" = design brief.
- **BD**: constitution §7 decision the rule derives from, if any.
- **Enforcement**: DB (constraint, trigger, unique index) · service (domain service, workflow guard) · UI · job (background job) · report (reporting/export layer) · config (seed or settings data) · policy (process, not code).
- **Test**: unit · integration · API · E2E · manual · none. "Test status" starts as "not yet" for every rule; it is updated when the test exists and runs.
- **Status**: approved (decided in the blueprint or by constitution precedence) · proposed (blueprint "(প্রস্তাবিত)" not covered by a BD) · open (needs an owner decision; see the open-question number).

Module codes refer to `docs/MODULE_CATALOG.md` (M01…M22).

## 1. Beneficiary identity and master (M05)

| Id | Rule | Source | BD | Module | Entities | Enforcement | Test | Status |
|---|---|---|---|---|---|---|---|---|
| BR-001 | A beneficiary is identified by NID or birth-registration number; one of the two is mandatory in every project; no application is accepted without one | B3 (NID identification), Q-21, Q-44 | BD-01 | M05 | beneficiaries, applications | DB + service | unit, API | approved |
| BR-002 | NID must be 10, 13 or 17 digits; birth registration must be 17 digits; validated in the form and on the server | A7 (merge paragraph), B3 | BD-01 | M05, M07 | beneficiaries | UI + service | unit | approved |
| BR-003 | NID is unique across beneficiaries; birth-registration number is unique across beneficiaries; a second profile on the same number is never created | B2 (key rules), B3 | BD-01 | M05 | beneficiaries | DB unique index | integration | approved |
| BR-004 | Mobile number is contact data, not identity; it may change; each change is logged | B3, Q-21 | BD-01, BD-02 | M05 | beneficiaries, beneficiary_contact_changes | service + audit | API | approved (see open question 2 for the contradicting B3 table) |
| BR-005 | Entering a known NID or birth number auto-fills name, father/husband name, mobile, address and other basic data; the volunteer does not retype them | B3, Q-21 | BD-02 | M05, M07 | beneficiaries | service + UI | API, E2E | approved |
| BR-006 | Name, father/husband name and the identity number are locked after the profile exists; they change only through the official "profile correction request" flow | B3 (PROPOSED), Q-21 | BD-02 | M05 | beneficiaries, profile_correction_requests | service | API | approved by BD-02 |
| BR-007 | Mobile and address may be updated by the volunteer on a later application; every change is logged with old and new value | B3 | BD-02 | M05 | beneficiary_contact_changes | service + audit | API | approved |
| BR-008 | A volunteer cannot enter own mobile number as a beneficiary's mobile; enforced in the service and as a database constraint | B3 | BD-03 | M05 | beneficiaries, volunteers | DB + service | integration | approved |
| BR-009 | The same mobile number may exist on several beneficiary profiles (e.g. one family); the system warns when it happens | B3 | BD-01 | M05 | beneficiaries | service + UI | unit | approved |
| BR-010 | A blocklisted NID or birth number is refused for any new application in any project; the form shows the volunteer a message | A7 (beneficiary blocklist), B3 | BD-06 | M05, M08 | blocklist, applications | service + UI | API | approved |
| BR-011 | Family-duplicate warning at review: within the same project, an application whose union + village, father/husband name or mobile matches an existing beneficiary triggers the warning "A member of this family already exists — [name, BEN-ID]"; never auto-rejected; the official decides and writes a reason; no household id exists | A7 (duplicates) | BD-04 | M08, M05 | applications, beneficiaries | service + UI | integration | approved |
| BR-012 | Duplicate-profile candidates are detected by: name + father/husband name + mobile; or name + date of birth + union; or several profiles on one mobile; an official may also request a merge of two BEN-IDs | A7 (merge table) | BD-05 | M05 | beneficiaries, profile_merges | job + service | unit | approved |
| BR-013 | On merge the official chooses the kept profile; all applications, support, dawah, photos and follow-ups are combined on it; both NID and birth registration stay searchable; the retired BEN-ID is not deleted and points to the kept profile | A7 (merge table) | BD-05 | M05 | profile_merges, beneficiaries | service + DB | integration | approved |
| BR-014 | Merge is performed by PM, Monitoring Team or Department Head; the RPM may propose; every merge is audited and the Monitoring Team can revert it | A7 | BD-05 | M05, M02 | profile_merges | permission + audit | API | approved |
| BR-015 | Beneficiary blocklist: set and lifted by RPM or above (PM, Monitoring Team, Department Head) with a reason; date, reason and actor logged; filter in the beneficiary tab; reason and comments visible to officials only; ongoing applications continue unchanged | A7 (beneficiary blocklist), Q-45 | BD-06 | M05 | blocklist | service + audit | API | approved |
| BR-016 | One application per beneficiary per project | B2 (applications row) | — | M08 | applications | DB unique (project_id, beneficiary_id) | integration | approved |
| BR-017 | Reports count unique beneficiaries (BEN-ID) and total applications separately | B2 (key rules), A11 | — | M16 | — | report | unit | approved |
| BR-018 | Standard identity, address, family and income fields are columns of the beneficiary table (plus sub-table for earners); project-specific answers are stored in application_answers (JSONB), never as new columns | B2, B3 (hybrid storage) | — | M05, M07 | beneficiaries, application_answers | DB | integration | approved |
| BR-019 | The beneficiary 360° profile shows basic data, project list by year, application history (who brought, reviewed, approved, when), distribution/implementation progress, photos, vouchers, documents, dawah data, call log, follow-up evaluations and activity history | A7 (360°) | — | M05, M16 | — | UI + report | E2E | approved |
| BR-020 | The beneficiary tab lists all beneficiaries nationwide for officials with every filter and statistics; any profile opens from it | A7, Q-20, B4 | — | M05 | — | service (GLOBAL read scope) | API | approved |
| BR-021 | Death or relocation of a beneficiary changes the profile status; in long projects such as house construction the PM decides with a reason whether a family member receives instead | A8.1 (edge table) | BD-23 | M05, M09 | beneficiaries, applications | service + audit | API | approved (status list is open question 18) |
| BR-022 | Media consent (status, allowed channels, date, recorded by) lives on the beneficiary profile; without consent a photo cannot enter the "publishable" list | A10 (SOP clause 12) | BD-38 | M05, M18 | media_consents, files | service | unit | approved (capture process is open question 17) |

## 2. Registration, approval and profiles (M03)

| Id | Rule | Source | BD | Module | Entities | Enforcement | Test | Status |
|---|---|---|---|---|---|---|---|---|
| BR-023 | Volunteer registration starts with mobile number and email; each receives a separate OTP; the rest of the form opens only when both OTPs match | A5 (volunteer registration), Q-42 | BD-44 | M03, M01 | registration_requests, otp_codes | service | E2E | approved |
| BR-024 | In development and test the OTP is one fixed dummy code; it must be disabled and real SMS and email gateways connected before production; dummy OTP and seed data never reach production | A5, B9 | BD-44, BD-49 | M01, M17, M21 | settings | config + service | integration, deployment check | approved |
| BR-025 | The verified mobile number is the volunteer's login id and is unique among volunteers | A5, B2 (volunteers row) | — | M01, M03 | volunteers, users | DB unique | integration | approved |
| BR-026 | The volunteer form captures: name, father's name, mother's name, NID number, WhatsApp number, address (division, district, upazila, union), highest education, experience, description of work, previous projects, Facebook id, optional bank details (bank name, account name, account number, routing number), reference (main volunteer's NID for a team member), own photo, NID photo, and the volunteer type | A5 (field table), Q-42 | BD-44 | M03 | volunteers | UI + validation | E2E | approved |
| BR-027 | Bank details are optional; bank and NID data of volunteers are visible only to authorized officials | A5, B8 | — | M03, M02 | volunteers | serializer | API | approved |
| BR-028 | Staff registration uses the same form plus designation, program and region; approval and role assignment by the Department Head or Monitoring Team | A5 (staff registration) | — | M03, M02 | users | service + permission | API | approved |
| BR-029 | A new registration is "pending" and appears in the volunteer tab; any of Project Executive, RPM, PM, Monitoring Team or Department Head may verify and approve it | A5 (verification), Q-19 | — | M03 | registration_requests | permission | API | approved |
| BR-030 | A problem in one field does not return the whole form: a correction request is sent for that field only; the volunteer fixes it and resubmits | A5 (verification step 3) | — | M03 | correction_requests | service | E2E | approved |
| BR-031 | Before approval a volunteer sees only own profile with the notice that they have not joined any project; after approval own data is not directly editable: an edit request is approved by the RPM or Project Executive, the field is opened, changed and locked again | A5 (profile rules), Q-09 | — | M03 | edit_requests | service + permission | API | approved |
| BR-032 | Every registration, correction, edit request and approval is written to the audit log | A5 | — | M03, M15 | audit_log | audit | integration | approved |
| BR-033 | Volunteer type is one of General, Local দায়ী, Both, Team Member, Paid Volunteer, chosen on the one registration form; "paid" is additionally marked per project by the RPM at assignment | A4 (volunteer types), Q-07 | — | M03, M04 | volunteers, project_volunteers.is_paid | DB enum + service | unit | approved |
| BR-034 | An official's account cannot be deactivated while they hold pending reviews or approvals, ongoing projects of their district or region, documents in their name, issues or follow-ups; each item must be reassigned (bulk reassignment to one person in one click allowed); then login closes, all their work and audit entries remain, and a handover record is kept | A5 (staff exit and handover) | BD-08 | M03, M15 | handovers | service | integration | approved |
| BR-035 | The Department Head account (main admin / system owner) cannot be deleted through normal CRUD | §5 | — | M02, M21 | users | service | API | approved |

## 3. Volunteer management (M04)

| Id | Rule | Source | BD | Module | Entities | Enforcement | Test | Status |
|---|---|---|---|---|---|---|---|---|
| BR-036 | The volunteer tab lists all volunteers nationwide for every official and Official দায়ী, filterable by division, district, upazila, union, type, status, project, category and rating (the last two for officials only), with statistics on top | A5 (volunteer tab) | — | M04 | volunteers | service (GLOBAL read scope) | API | approved |
| BR-037 | Volunteers are assigned to a project by region: the RPM sees approved volunteers of own region, filters by district/upazila/union and assigns one or many at once | A5 (assignment), Q-20 | — | M04 | project_volunteers | service | API | approved |
| BR-038 | At assignment one of three permission sets is given by type: "application + distribution" (General), "application + distribution + dawah" (Local দায়ী / Both), "work progress" (Paid Volunteer: stage updates and issues, view applications, no edit); the same volunteer may hold different sets in different projects | A5 (permission sets), B4, Q-16 | — | M04, M02 | project_volunteers.permission_set | DB + service | API | approved |
| BR-039 | Before working in a project the volunteer must read and accept the four rules texts (volunteer duties, implementation process, Local দায়ী duties, measures against irregularity) and confirm "I agree and am interested"; rejecting leaves the assignment pending without access; the consent and its time are logged | A6 (rules and consent) | — | M04, M06 | project_volunteers.consent_at | service | E2E | approved |
| BR-040 | A team member registers with the main volunteer's NID as reference; on match the main volunteer's name is shown; the assigned main volunteer selects members for each project from those registered under their NID; General and Both volunteers may add team members | A5 (team management), Q-25 | — | M04 | volunteer_teams | service | API | approved |
| BR-041 | Team member rights: create applications; edit own drafts before submission; cannot submit; cannot edit or delete submitted (pending) applications; view basic data of own approved applications. The main volunteer may create, edit and delete drafts, submit, edit and delete pending applications, and view basic data of approved ones | A5 (team table), A4 matrix, Q-06 | — | M04, M08 | applications | permission (workflow guards) | API | approved |
| BR-042 | Rating criteria: at most 5 per project, set by the PM; each volunteer scores 1–5 per criterion; ratings are per project | A5 (ratings), A6 | BD-40 | M04, M06 | rating_criteria, ratings | validation + service | unit | approved |
| BR-043 | At project close the system proposes a score per criterion from work data; PM, RPM or Project Executive review, change if they wish, and finalize | A5, Q-32 | BD-40 | M04 | ratings | job + service | unit, integration | approved |
| BR-044 | A volunteer of type Both is rated per kind of work: one score set for application/distribution and a separate set for dawah; the two are shown separately and never averaged with each other | A4 (volunteer types) | BD-40 | M04 | ratings | service | unit | approved (averages within a kind: open question 10) |
| BR-045 | Volunteer categories are A (excellent), B (good), C (weak), D (risky) plus a separate "inactive" flag; a category is never set automatically; an official sets or changes it by hand and must enter a comment; who, when, from what to what and the comment are logged | A5 (categories), Q-34 | BD-40 | M04 | volunteers.category, category_changes | service + audit | API | approved |
| BR-046 | Ratings, categories and their comments are visible to officials only; never to volunteers, on screens or in exports | A5, B4, B8 | BD-40 | M04, M02 | ratings, volunteers.category | serializer | API | approved |
| BR-047 | Volunteer blocklist: set and lifted by RPM or above (PM, Monitoring Team, Department Head) with a written reason; a blocked volunteer cannot create new applications, is not assigned to new projects, no longer sees own earlier applications and sees the block message on login; date, reason, who blocked and who lifted are logged; the volunteer tab has a blocklist filter | A5 (blocklist), Q-45 | BD-06 | M04 | blocklist | service + audit | E2E | approved |
| BR-048 | A blocked volunteer's ongoing applications remain as they are; a newly added volunteer manages them after transfer | A5, Q-45 | BD-06 | M04, M08 | applications | service | API | approved |
| BR-049 | Application transfer: the RPM (or a Project Executive with permission) adds a new volunteer and transfers all or selected applications; the new volunteer gets the full previous access (view and edit by status, distribution and progress updates, photos, vouchers, expense claims); the old one sees nothing of them; who, from whom, when, approved by whom and why is recorded on the application and in the audit log; the beneficiary history is untouched | A5 (application transfer) | BD-07 | M04, M08 | application_transfers | service + audit | E2E | approved |
| BR-050 | When a main volunteer is replaced, the RPM decides whether their team moves under the new volunteer | A5 | — | M04 | volunteer_teams | service | API | approved |
| BR-051 | A volunteer may be assigned to several projects at once; permissions are per project | A5, Q-16 | — | M04 | project_volunteers | DB | API | approved |

## 4. Programs and projects (M06)

| Id | Rule | Source | BD | Module | Entities | Enforcement | Test | Status |
|---|---|---|---|---|---|---|---|---|
| BR-052 | Programs are created by the Department Head, who assigns the PM; the program list is visible to officials only | A2, A3, A6 | — | M06, M02 | programs | permission | API | approved |
| BR-053 | Projects are created and configured by the PM within own program (Department Head and Monitoring Team through their global access); setup is saved as a draft and the PM activates the project when all steps are done | A4 matrix, A6 | — | M06 | projects | permission + service | API | approved |
| BR-054 | Volunteers see a project only when it is active and they are assigned to it | A6 | — | M06, M02 | projects, project_volunteers | scope | API | approved |
| BR-055 | Project lifecycle is Draft → Active → Closing → Closed; Closing (PROPOSED) stops new applications while remaining work, photos and vouchers are verified | A6 (lifecycle) | — | M06, M08 | projects.status | workflow | API | open (question 12) |
| BR-056 | Only the PM closes a project; after close everything is read-only (no new application, edit, delete, distribution or progress update, no field unlock); dashboards and reports stay available; only follow-up evaluations may be added | A6, A7 (field unlock), Q-33 | BD-20 | M06, M08 | projects | workflow guards | API, E2E | approved |
| BR-057 | A closed project may be reopened only by the PM with a reason; close and reopen are logged | A6, Q-33 | BD-20 | M06 | projects, audit_log | service + audit | API | approved |
| BR-058 | Applications are accepted only between the project's start and end dates; after the end date the system refuses applications; the PM may extend the deadline with a reason, which is logged | A6 (deadline), A8.1 | BD-16 | M06, M08 | projects.apply_from/apply_to | service + audit | API | approved |
| BR-059 | The per-volunteer application limit (e.g. 50) is enforced by the system: no application beyond the limit can be created | A6 (limits), A8.1 | BD-16 | M08 | project_settings.limits, applications | service | API | approved (which states count and late offline drafts: open question 13) |
| BR-060 | Project areas are a division or one or more districts, each with an RPM; several RPMs in one division are equal by default; the PM may split districts among them, after which each sees own districts | A6 (areas), Q-08 | — | M06, M02 | project_areas | service + scope | API | approved |
| BR-061 | View / edit / delete access for staff under the RPM is given by the PM or RPM; the RPM has full access in own region | A6 (staff assignment), A4 matrix | — | M06, M02 | project staff access | permission | API | approved |
| BR-062 | A project is assembled from components enabled per project with settings stored as data (project_components); nothing project-specific is hard-coded; a new project type needs configuration, not code | A6 (components), Q-35, Q-38 | BD-09 | M06 | project_components | DB + service | integration | approved |
| BR-063 | The component list is: application form, public application link, volunteer assignment and limits, dispatch and receive, distribution and photos, site verification, stage-based progress, issue log, dawah, exams, beneficiary payment, materials and placard photo, vouchers, volunteer expenses, donors and animals, follow-up, rating criteria, document checklist | A6 (component table), A10 | BD-09 | M06 | project_components | config | unit | approved |
| BR-064 | A new project is created from a master template or by copying a previous project; the result is an independent snapshot (later template changes do not affect it); an active or finished project can be saved as a template; templates are created and edited by anyone with project-creation access and every change is audited | A6 (templates), Q-38 | BD-10 | M06 | project_templates | service + audit | API | approved |
| BR-065 | Copied into a new project: component list and settings, form sections/fields/logic (as version 1), workflow stages and photo rule, rating criteria, issue types, expense categories, dawah syllabus, scoring criteria, document checklist. Not copied: applications and beneficiary data, budget amounts, dates and deadlines, volunteer assignments, ratings, categories, logs, quota targets | A6 (copy table), A10 | BD-10 | M06 | project_templates | service | unit | approved |
| BR-066 | The photo rule is set per project: group / individual / both (door-to-door = one photo per beneficiary; gathered distribution = group photo only); the photo source (camera only or gallery allowed) is set per project next to the photo rule, defaulting to camera only for distribution and construction proof and gallery allowed for vouchers and paper documents | A6, A8.1, Q-12, UX-11 | BD-21 | M06, M18 | project_components.settings | config | unit | approved |
| BR-067 | Dawah Enabled is a per-project toggle; when yes, the syllabus topic list is configured and the dawah features become active | A6, A9 | — | M06, M12 | project_components | config | unit | approved |
| BR-068 | Stage names and their order (house construction, safe water) and application types (tree planting) are configured by the PM per project | A6 (limits and stages), A8.4 | BD-09 | M06, M09 | project_settings.stages | config | unit | approved |
| BR-069 | Planned budget = cost per beneficiary × target beneficiaries, set at project creation; in advance-based projects advance and actual expense are separate | A6 (budget), B6, Q-24 | BD-29 | M06, M10 | projects.budget_planned | service | unit | approved |
| BR-070 | Follow-up has no fixed schedule and no reminders; an official or Official দায়ী adds an evaluation whenever they check on a beneficiary, also after project close; each evaluation records date, who checked, method (visit/phone), result, comments and photos and is stored on the profile | A6 (lifecycle), Q-33 | BD-19 | M14, M06 | followup_evaluations | service | API | approved (default questions: open question 23) |
| BR-071 | Every project budget carries fund-source tags (zakat / sadaqah / general donation / specific donor) | B6 | BD-30 | M06, M10 | fund_sources | DB | unit | approved |

## 5. Form platform (M07)

| Id | Rule | Source | BD | Module | Entities | Enforcement | Test | Status |
|---|---|---|---|---|---|---|---|---|
| BR-072 | Forms are built from a reusable section library (basic information, address, family and income, livelihood, project questions, financial status, loan information, zakat assessment, official section, attachments) and a field library; the PM adds whole sections then removes or adds fields | B3 (section library) | BD-12 | M07 | section_library, form_sections | config + UI | unit | approved |
| BR-073 | Every section has order, visibility (volunteer or official only) and a display condition; official-only sections are never returned to volunteers | B3, B4, App B.2 | BD-12 | M07, M02 | form_sections | DB + serializer | API | approved |
| BR-074 | Supported field types: short and long text, number, decimal, money, phone, email, date, time, date-time, single and multiple select, radio, checkbox, photo, file, signature, GPS location, Bangladesh address (system component), repeat group, calculation, information/note | B3 (field types) | — | M07 | form_fields | engine | unit | approved |
| BR-075 | Field settings: label in Bangla and English, type, mandatory, placeholder, help text, default value, validation, min/max, options, conditional logic, calculation | B3 (field settings), §11 | — | M07 | form_fields | engine + UI | unit | approved |
| BR-076 | Conditional logic and calculations are configured without code and are evaluated by one shared evaluator used identically on the client (offline) and the server | B3, §13 (no duplicated calculations) | — | M07, M22 | form_fields.logic | shared package | unit | approved |
| BR-077 | A published form version is immutable; any change creates a new version; every application stores its form_version_id and keeps its data structure; reports align fields across versions | B3 (form versions) | BD-12 | M07, M08 | form_versions, applications | service + DB | integration | approved |
| BR-078 | Mandatory in every project: NID/birth registration, name, father/husband name, mobile, gender, division → district → upazila → union, village; every other field is mandatory or optional per project by a toggle in the form builder | Q-31 | BD-13 | M07 | form_fields.required | validation | unit | approved |
| BR-079 | Beneficiary class defaults to বৃদ্ধ, বিধবা, এতিম, প্রতিবন্ধী, অসুস্থ, শ্রমজীবী, অতিদরিদ্র, অন্যান্য; the PM may change the list per project; choosing "অন্যান্য" opens a text box on the same field | Q-27, App B.1 | BD-14 | M07 | field_options | config + UI | unit | approved |
| BR-080 | A branching question (occupation, earner relationship, loan type, business type) is one field whose options depend on the previous answer; "other" adds a text box to the same field instead of a second question | Q-28, App B.2 | BD-14 | M07 | form_fields, field_options | engine | unit | approved |
| BR-081 | No spot-code or community-number field exists in any form; if ever needed it is added as a custom field | Q-26, App B | BD-15 | M07 | — | config | manual | approved |
| BR-082 | System-filled fields are never typed: volunteer name and mobile (from login), official member and implementing officer (from project assignment), beneficiary id, project application id, application status, approval date, and the dawah representative / zakat-approving আলেম (from the assigned Official দায়ী) | App B.1, B.2(a), B.3, Q-30 | BD-28 | M07, M08 | applications | service | unit | approved |
| BR-083 | Calculated fields are computed by the system: total family members (14+ plus under-14), total family income (beneficiary plus all earners), age from date of birth, gold value, silver value, total assets, total debts, net assets, and the zakat status proposal | App B.1, B.2(c), B.2(g), B.3 | BD-28 | M07 | form_fields (calculation) | shared package | unit | approved |
| BR-084 | The Bangladesh address is a cascading system component (division → district → upazila → union → ward) backed by the locations master; the village field validates Bangla script | B3, App B.1 | — | M07, M19 | locations | engine | unit | approved |
| BR-085 | Repeat groups ("+ add another") are supported, e.g. family members and earners | B3 | — | M07 | application_answers | engine | unit | approved |
| BR-086 | The identity number is the first field of the application form; the lookup happens as soon as it is entered | B3 | BD-02 | M07 | — | UI | E2E | approved |
| BR-087 | A public application link lets anyone apply without a volunteer; the application enters the system only after verification | A6 (components), A8.5, Q-10 | — | M07, M08 | public_form_links, applications | service | API | approved (abuse protection: open question 8) |
| BR-088 | Daily income and monthly income are two separate standard fields (distribution form uses daily, self-reliance monthly) | App B.1 | — | M07 | beneficiaries | config | unit | approved |
| BR-089 | The two current forms of appendix খ are seeded as master form templates; standard fields of appendix খ.৩ form the initial field library | App B, PLAN §2.5 | — | M07, M21 | field_library | config (seed) | manual | approved |

## 6. Application workflow (M08)

| Id | Rule | Source | BD | Module | Entities | Enforcement | Test | Status |
|---|---|---|---|---|---|---|---|---|
| BR-090 | Workflow states, transitions, allowed roles and guard conditions are configuration (per template), not code; the common cycle in every template is Draft → Submitted → Under Review → Reviewed → Approved / Rejected → Implementation or Distribution → Completed → Closed; template-specific stages follow approval | A7, B5, Q-35 | BD-11 | M08 | workflow_templates, workflow_transitions | engine | unit, integration | approved |
| BR-091 | Per-status permissions: Draft — main volunteer edits, deletes, submits, team member edits own; Submitted — main volunteer edits and deletes; Under Review — official verifies and may edit the whole form, volunteer views only; Reviewed — approver approves or rejects; Approved — locked, volunteer sees basic data only; Rejected, Completed, Closed — view only (follow-ups allowed on Completed and Closed) | A7 (status table) | BD-11 | M08 | applications | engine guards | API | approved |
| BR-092 | There is no field-level "needs correction" step before approval; during review the official edits the whole form if needed | A7, Q-05 | — | M08 | applications | engine | API | approved |
| BR-093 | Review is done by the Project Executive or any team member to whom the RPM gives review permission; after review the application goes to the RPM; the RPM may grant approval permission to anyone in own team; who approved is logged | A7 (review and approval), Q-04 | — | M08, M02 | applications, audit_log | permission + audit | API | approved |
| BR-094 | In house-construction projects the final approval is given by the PM | A4 matrix, A8.2 | BD-24 | M08 | workflow_templates | engine (template) | API | approved |
| BR-095 | Approved data is locked; corrections happen only by field unlock: an official opens one field for the volunteer → the volunteer updates → the official verifies and approves → the field locks again; old value, new value, requester, approver, reason and time are recorded; no unlock after project close | A7 (field unlock) | BD-18 | M08 | field_changes | service + audit | E2E | approved |
| BR-096 | Sensitive fields whose every change is recorded: name, NID, mobile, address, approved amount, approval date, vouchers, distribution status | A7 (field unlock) | BD-18 | M08 | field_changes | service | integration | approved |
| BR-097 | A priority score out of 100 is computed from PM-defined criteria and weights stored in the project template (e.g. low income up to 30, family size up to 20, class 20, not previously assisted 20, housing 10) as soon as the application is submitted | A7 (priority score) | BD-17 | M08 | application_scores | shared package + job | unit | approved (recomputation and snapshot: open question 21) |
| BR-098 | The review screen sorts applications by score and shows district and union quotas (target vs received) | A7 | BD-17 | M08 | project_quotas | service + UI | API | approved |
| BR-099 | Review outcomes are approved / waitlist / rejected with reason; a decision against the score order requires a comment | A7 | BD-17 | M08 | applications | engine guard | API | approved |
| BR-100 | The waitlist is pulled in one click when someone drops out, goods are left over or someone is absent; applicants not served by project end receive "not previously assisted" points in next year's project | A7 | BD-17 | M08 | applications, application_scores | service | integration | approved |
| BR-101 | The score never approves or rejects by itself; it only sorts and recommends | A7 | BD-17 | M08 | — | engine | unit | approved |
| BR-102 | Applications can be created by volunteers, team members, RPMs and Project Executives (and any assigned official in house construction); submission to the office by the main volunteer, RPM or Executive, never by a team member | A4 matrix, A8.2 | — | M08, M02 | applications | permission | API | approved |
| BR-103 | Every application is bound to exactly one project, one beneficiary and one form version | B2 (key rules) | — | M08 | applications | DB foreign keys | integration | approved |
| BR-104 | An application created offline whose NID already exists on the server is not deleted at sync; it enters "needs verification" and an official matches it to the existing profile | B7, Q-43 | BD-48 | M08, M22 | applications | sync service | integration | approved |
| BR-105 | Application ids are project-scoped (examples APP-2026-00125, SBL-2026-00012) and BEN-IDs are permanent system ids (example BEN-000123) | A7, App A, App B.2(a) | — | M08, M05 | applications, beneficiaries | service | unit | open (question 3: exact formats) |
| BR-106 | Site verification (tree planting, self-reliance, house construction) records who, date, comment, photos and a recommendation (approve/reject); the responsible official then approves, re-reviews or rejects; a volunteer may decide directly only if the RPM grants it | A8.5, B2 (site_verifications), A4 matrix | — | M08, M09 | site_verifications | service + permission | API | approved |

## 7. Project activities, distribution and construction (M09)

| Id | Rule | Source | BD | Module | Entities | Enforcement | Test | Status |
|---|---|---|---|---|---|---|---|---|
| BR-107 | Distribution flow after approval: goods for the approved number are dispatched to the volunteer's spot (entered by RPM/Executive) → the volunteer confirms receipt and the distribution date → today's distribution bulk update with photos → expense claim and payment | A8.1, B5 | — | M09 | stock_movements, project_activities | workflow template | E2E | approved |
| BR-108 | A distribution cannot be marked "completed" without the photos required by the project's photo rule | A8.1 | BD-21 | M09, M18 | project_activities, files | engine guard | integration | approved |
| BR-109 | Every photo stores capture date-time and, when captured in the app, GPS; a second upload of the same photo triggers a warning; photos without capture time or GPS remain flagged | A8.1, UX-11 | BD-21 | M18 | photo_metadata | file service | unit | approved |
| BR-110 | Stock reconciliation per distribution project: sent (office), received (volunteer), distributed (today's distribution), remaining and damaged (volunteer, verified by an official); sent must equal distributed + remaining + damaged before the project can be completed; a difference needs a written reason and raises a monitoring alert; Qurbani counts animals, tree planting counts saplings | A8.1 (reconciliation table) | BD-22 | M09, M14 | stock_movements | engine guard + job | integration | approved |
| BR-111 | Edge state "absent": marked "not received — absent" with reason; the package returns to remaining | A8.1 (edge table) | BD-23 | M09 | project_activities, stock_movements | engine | API | approved |
| BR-112 | Edge state "later distribution": recorded on the same application with the date; no new application | A8.1 | BD-23 | M09 | project_activities | engine | API | approved |
| BR-113 | Edge state "not distributed": closed as not distributed at closing; no cost charged to the budget | A8.1 | BD-23 | M09, M10 | applications, budget_ledger | engine + ledger | unit | approved |
| BR-114 | Edge state "shortage": those not served stay on the waitlist; the shortage appears in reconciliation | A8.1 | BD-23 | M09, M08 | applications | engine | API | approved |
| BR-115 | Edge state "damaged or lost": number, reason and photos in the damaged cell; monitoring alert | A8.1 | BD-23 | M09, M14 | stock_movements | engine + job | API | approved |
| BR-116 | Edge state "partial": items received are ticked; the rest can be given later | A8.1 | BD-23 | M09 | project_activities | engine | API | approved |
| BR-117 | House construction: applications from volunteers or any assigned official; selected beneficiaries approved by the PM, the rest rejected with reasons; one Local দায়ী per area (e.g. per 10 houses); 2–3 paid volunteers per district post daily stage progress with photos and raise issues; a final photo of the beneficiary with the house is taken; vouchers are optional | A8.2 | BD-24 | M09, M06 | project_activities, issues | config + workflow | E2E | approved |
| BR-118 | Issue log: issues are raised with photos by volunteers, Local দায়ীs, paid volunteers, RPM, Executive and the Procurement Team; assigned; resolved with an entry by PM, RPM, Executive or the Procurement Team; the resolution is visible to everyone on the project | A8.2, A4 matrix, Q-46 | BD-25 | M09, M02 | issues | permission + service | API | approved |
| BR-119 | The Procurement Team may view applications in house construction only, never edit or delete; it may raise issues and resolve issues raised by itself or by paid volunteers | A4, Q-46 | — | M02, M09 | issues, applications | permission | API | approved |
| BR-120 | A paid volunteer sees all applications of the project and edits nothing; if the same person is also the Local দায়ী they see both sections, otherwise each sees only own section | A8.2, A4 | — | M02, M09 | project_volunteers | scope + permission | API | approved |
| BR-121 | Self-reliance: the beneficiary support payment is made only for beneficiaries who passed the exam; date, amount and transaction id are stored on the application | A8.3, A9 (exams) | BD-27 | M09, M12, M10 | payments, exams | engine guard | integration | approved |
| BR-122 | After the payment the volunteer buys the materials, submits the placard photo with the beneficiary and materials and all vouchers; officials verify; after verification photos and vouchers can no longer be changed or deleted | A8.3 | BD-27 | M09, M18 | vouchers, files | engine guard | integration | approved |
| BR-123 | Safe water: after approval the advance to the volunteer is recorded on the application and in the advance bucket; progress follows the configured stages; at the end the tube-well photo, vouchers and full account are submitted; after official verification the work is "completed", photos and vouchers lock, the voucher amount is booked as actual expense and the remainder of the advance as returned | A8.4, Q-22 | BD-29 | M09, M10 | payments, vouchers, budget_ledger | workflow + ledger | integration | approved |
| BR-124 | Tree planting: two application types (educational institution, personal garden) on the public form; an area volunteer performs the site verification; sapling receipt and daily destinations are updated; photos are a group photo at institutions and a placard garden photo for personal gardens; expenses are verified and paid before the PM closes | A8.5 | — | M09, M07 | applications, site_verifications | workflow | E2E | approved |
| BR-125 | The activity engine uses one common model for all projects with types Distribution, Construction, Purchase, Training, Visit, Payment, Voucher, Expense, Issue, Inspection, Follow-up; each activity records application, type, stage, who, when, photos/files, comments and status | B5 (activity engine, PROPOSED) | BD-09 | M09 | project_activities | DB | unit | approved by BD-09/BD-11 |
| BR-126 | Bulk-update screens (today's distribution / class / construction / visit / follow-up) present one list with a tick per row and one save; they work offline; a save updates the profiles, activities and audit log together | B5 (bulk screens), A9 | — | M09, M12, M22 | project_activities | service | E2E | approved |
| BR-127 | Dispatch ("sent") is entered by the office (RPM/Executive); "received" is confirmed by the volunteer | A8.1 (reconciliation table) | BD-22 | M09 | stock_movements | permission | API | approved |

## 8. Budget, ledger and payments (M10)

| Id | Rule | Source | BD | Module | Entities | Enforcement | Test | Status |
|---|---|---|---|---|---|---|---|---|
| BR-128 | The project account is bucket-based: Allocated, Approved, Spent/Distributed, Remaining, Beneficiary Support, Advance, Actual Expense, Voucher Submitted, Voucher Verified, Returned, Volunteer Expense Claimed, Volunteer Expense Paid, each written at the event listed in B6 | B6 (bucket table), Q-37 | BD-29 | M10 | budget_ledger | ledger service | unit | approved |
| BR-129 | Allocated is written at project setup; Approved = approved applications × cost per beneficiary at approval; Spent = beneficiaries with completed distribution × cost at completion; Remaining = Allocated − Spent (reports also show Allocated − Approved) | B6 | BD-29 | M10 | budget_ledger | ledger service | integration | approved |
| BR-130 | Advance and actual expense are never treated as one amount; Returned = Advance − Actual Expense on reconciliation | B6 | BD-29 | M10 | budget_ledger | ledger service | unit | approved |
| BR-131 | Volunteer operational expenses (decoration, vehicle hire, food, photocopy, banner, …) are never mixed with the per-beneficiary cost; dashboards show them separately | B6 | BD-29 | M10, M16 | budget_ledger | ledger + report | unit | approved |
| BR-132 | Every money movement is its own ledger row (project, application if any, bucket, amount, reference, who, when) so the project account can be reconciled at any time | B6 | BD-29 | M10 | budget_ledger | DB | integration | approved |
| BR-133 | Spending from the zakat fund requires the beneficiary's zakat eligibility; reports show separate accounts per fund source | B6, A8.3 | BD-30 | M10 | fund_sources, applications | engine guard + report | integration | approved |
| BR-134 | Every payment transaction id is unique; a second payment on the same claim is rejected | B6 | BD-31 | M10 | payments | DB unique + service | integration | approved |
| BR-135 | There are no approval thresholds for payments | §7 | BD-31 | M10 | — | policy | manual | approved |
| BR-136 | Payments to volunteers are made by bKash and recorded with date, amount and transaction id after the expense claim is verified | A8.1, B6 | BD-31 | M10, M09 | payments, expense_claims | service | API | approved (method list: open question 22) |
| BR-137 | Volunteer expense claims are itemized by category (decoration, vehicle hire, food, photocopy, banner, …) with vouchers; submitted by volunteers, Local দায়ীs and paid volunteers; verified and paid by PM, RPM or Project Executive | A8.1, A4 matrix, B6 | BD-31 | M09, M10 | expense_claims, expense_items | workflow + permission | E2E | approved (categories per project, steps and multiplicity: open question 14) |
| BR-138 | Beneficiary payment records (date, amount, method, transaction id) are entered by PM, RPM or Project Executive only | A4 matrix | — | M10, M02 | payments | permission | API | approved |
| BR-139 | The Finance Team views budgets, payments, vouchers and expense accounts and downloads CSV/PDF; it never enters, edits or approves anything | A4 (second table) | BD-31 | M02, M10 | — | permission | API | approved |
| BR-140 | Applications closed as "not distributed" carry no cost in the budget | A8.1 (edge table) | BD-23 | M10 | budget_ledger | ledger service | unit | approved |
| BR-141 | The budget card shows planned, used and remaining amounts; a budget alert fires above a configured percentage of use | B6, A10 | BD-42 | M10, M14 | — | report + job | unit | approved (percentage: open question 4) |

## 9. Qurbani (M11)

| Id | Rule | Source | BD | Module | Entities | Enforcement | Test | Status |
|---|---|---|---|---|---|---|---|---|
| BR-142 | Donor data comes from the SSL Excel/sheet (transaction id, name, phone, email, amount, cow shares, goats) and from the system's cash-donor form (name, mobile, email, amount, purpose, approval status, approver, comment, cow shares, goat count); both are merged into one donor list; the import format follows last year's sheet | A8.6, Q-11 | BD-32 | M11 | donors | import service | integration | approved |
| BR-143 | Animal numbers and share allocations are generated from donor data: a cow has 7 shares, its status is empty or full; goat numbers are generated likewise | A8.6 | BD-33 | M11 | animals, animal_shares | service | unit | approved (goat share model: open question 19) |
| BR-144 | Animal assignment to volunteers is manual, done on the volunteer's profile; one volunteer may receive several cows, or one to four goats | A8.6, Q-47 | BD-33 | M11, M04 | animals.assigned_volunteer_id | service | API | approved |
| BR-145 | An allocated animal can never be given to another volunteer until the allocation is cancelled; the list shows it as allocated | A8.6, Q-47 | BD-33 | M11 | animals | DB constraint + service | integration | approved |
| BR-146 | Each animal carries the responsible volunteer's name, mobile and Qurbani spot (district, upazila, union); donors are matched to animal numbers so share, animal and volunteer appear on one screen | A8.6 | BD-33 | M11 | animals, animal_shares | DB | unit | approved |
| BR-147 | When allocation is final, donors receive a pre-notification by email or SMS; the sent status is tracked per donor | A8.6 | BD-34 | M11, M17 | donor_messages | notification service | integration | approved |
| BR-148 | Three photos per animal (animal, meat, packet) are uploaded on Qurbani day and emailed to the donors with a "sent" status | A8.6 | BD-34 | M11, M18, M17 | animal_photos | service | integration | approved |
| BR-149 | The donor list is importable from Excel and exportable to Excel with animal allocations | A11 (downloads) | — | M11, M16 | donors | export | API | approved |
| BR-150 | Donor data is visible to authorized officials only; never to volunteers, Media, Finance or Procurement Teams | A4 (second table), B8 | — | M02, M11 | donors | serializer | API | approved |
| BR-151 | Every animal allocation and cancellation is audited | §13 | — | M11, M15 | audit_log | audit | integration | approved |

## 10. Dawah (M12)

| Id | Rule | Source | BD | Module | Entities | Enforcement | Test | Status |
|---|---|---|---|---|---|---|---|---|
| BR-152 | Dawah features (syllabus, classes, attendance, learning progress, exams, call log, follow-up) are active only in projects with Dawah Enabled = yes | A9 | — | M12 | project_components | config | unit | approved |
| BR-153 | The syllabus topic list is set at project creation and copied with templates | A9, A6 | — | M12, M06 | syllabus_topics | config | unit | approved |
| BR-154 | In each class the Local দায়ী records attendance, an absence reason for absentees, and the topics taught per beneficiary; a topic is "in progress" or "learned"; learned topics disappear from the options, the rest remain | A9 (syllabus tracking) | BD-26 | M12 | class_attendance, learning_progress | service | unit | approved |
| BR-155 | Classes cover the whole family; attendance and progress may be recorded for family members too | A9 (PROPOSED) | BD-26 | M12 | class_attendance | service | unit | open (question 11 on the data source for members) |
| BR-156 | দায়ী assignment can be split by gender so that female দায়ীs serve female beneficiaries | A9, A8.3 | BD-26 | M12 | daee_assignments | config | API | approved |
| BR-157 | Two exams (initial and final) are conducted by the Official দায়ী; the RPM may delegate exam duty to Local দায়ীs; results are shown side by side and downloadable as PDF by beneficiary, দায়ী or area | A9 (exams), A4 matrix | BD-26 | M12, M16 | exams, exam_results | service + permission | API | approved |
| BR-158 | The Official দায়ী's tracking view shows, per Local দায়ী, the last class update, number of classes and number of beneficiaries with progress; a long gap without updates raises an alert | A9 | BD-42 | M12, M14 | — | job + UI | integration | approved |
| BR-159 | The Official দায়ী keeps a call log per beneficiary call (date, duration, topic, comments); it appears on the beneficiary profile and in the দায়ী's work summary; only the Official দায়ী makes follow-up calls | A9, A4 matrix | — | M12 | call_logs | permission + service | API | approved |
| BR-160 | A Local দায়ী sees only own assigned beneficiaries (ASSIGNED scope) | A4 matrix, B4 | — | M02, M12 | — | scope | API | approved |
| BR-161 | The number of classes held is counted by the system, not entered | A9 | — | M12 | dawah_classes | report | unit | approved |

## 11. Documentation per SOP (M13)

| Id | Rule | Source | BD | Module | Entities | Enforcement | Test | Status |
|---|---|---|---|---|---|---|---|---|
| BR-162 | Every project has a document checklist from its template; each row has name, requirement (required / if needed / not required), responsible official designation, deadline, status, soft-copy file and hard-copy location code; retention is 5 years from submission | A10 (documentation), SOP 5, 8–9 | BD-35 | M13 | documents, document_checklist_templates | DB + config | unit | approved |
| BR-163 | Responsibility for documents lies with officials only (PM, RPM, Project Executive, Implementer); volunteers never submit to, and cannot see, the document register; field photos, vouchers and forms stay with the application and are attached to the register by officials | A10 | BD-36 | M13, M02 | documents.owner_role | permission | API | approved |
| BR-164 | Each document moves through collected → verified → approved → archived; who moved it when is logged | A10 (SOP 4) | BD-35 | M13 | documents.status | workflow + audit | unit | approved |
| BR-165 | The checklists of the seven projects are pre-seeded in the master templates | A10 (SOP 5) | BD-35 | M13, M21 | document_checklist_templates | config (seed) | manual | approved (needs the SOP text) |
| BR-166 | When a document deadline passes, the responsible official receives a soft-warning notification and a 3-working-day countdown starts; if still missing, the document is marked non-compliance for that official and a monitoring alert is raised; this never affects volunteer ratings or categories | A10 (SOP 6) | BD-36 | M13, M14, M17 | documents, alerts | job | integration | approved (working days: open question 16) |
| BR-167 | Deficiency reports use the 11 items of SOP 7.4 and feed a central log; a second report on the same person within one year is escalated automatically to a superior's review; legacy (pre-SOP) deficiencies are marked separately and are exempt from non-compliance | A10 (SOP 7, 7.1) | BD-37 | M13 | deficiency_reports | service + job | integration | approved (field list needs the SOP text) |
| BR-168 | Soft copies are stored automatically under program → project → year → district | A10 (SOP 10) | BD-35 | M13, M18 | files | file service | unit | approved |
| BR-169 | The document register replaces the SOP tracking sheet and exports its columns to Excel/CSV | A10 (SOP 11) | BD-39 | M13, M16 | documents | export | API | approved |
| BR-170 | A quarterly audit report is produced in one click: pending documents, on-time submission rate, deficiency summary, hard copies past 5 years | A10 (SOP 13) | BD-39 | M13, M16 | — | report | API | approved |
| BR-171 | Document deadline extensions and deficiency reports are audited | §13 | — | M13, M15 | audit_log | audit | integration | approved |

## 12. Monitoring, follow-up and work summaries (M14)

| Id | Rule | Source | BD | Module | Entities | Enforcement | Test | Status |
|---|---|---|---|---|---|---|---|---|
| BR-172 | The monitoring control centre shows project progress (target vs applications, reviewed, approved, distributed/completed; budget vs expense), stuck work (which application waits how long with whom) and regularity of Local দায়ীs and volunteers | A10 (control centre) | BD-42 | M14 | — | UI + report | manual | approved |
| BR-173 | Automatic alerts: review pending beyond N days; approval pending beyond N days; no update from a দায়ী, volunteer or paid volunteer; distribution without photo; budget use above a percentage; incomplete activity; inactive volunteer; implementation delayed; duplicate NID attempts; unbalanced stock; overdue documents; repeated deficiency reports | A10 (alert table), §7 | BD-42 | M14 | alerts, alert_settings | job | integration | approved (thresholds: open question 4) |
| BR-174 | No alert exists for applications beyond the limit because the system refuses them | A10 | BD-16 | M14 | — | none | none | approved |
| BR-175 | Work summary per staff member and volunteer: applications brought per project, reviewed or approved, distributions, classes, calls, photos, last work date and time taken per step; filterable by year, project and date range; exportable to CSV and PDF; visible to the Department Head, Monitoring Team and permitted officials; PM for all, RPM for own region | A10 (work summary), A4 matrix | BD-41 | M14, M16 | — | report + scope | API | approved |
| BR-176 | Follow-up evaluations after close are added by RPM, Project Executive or Official দায়ী (matrix row marked PROPOSED; approved by BD-19) | A4 matrix, A6 | BD-19 | M14, M02 | followup_evaluations | permission | API | approved |

## 13. Audit log (M15)

| Id | Rule | Source | BD | Module | Entities | Enforcement | Test | Status |
|---|---|---|---|---|---|---|---|---|
| BR-177 | The audit log is permanent and append-only; it is never deleted; it can be viewed and downloaded by project, beneficiary or person | A10 (audit log), B8, Q-39 | BD-46 | M15 | audit_log | DB (no update/delete) | integration | approved |
| BR-178 | Each audit record holds actor (user id, role), timestamp, action (create / update / status_change / approve / reject / unlock / permission_change / category_change / close / export …), entity and entity id, old and new value, reason, IP/device (client_uuid for mobile sync) | B8 (audit record, PROPOSED), §13 | BD-46 | M15 | audit_log | DB | unit | approved by §13 |
| BR-179 | Always audited: permission and role changes, approvals and rejections, field unlock, blocklist, transfer, handover, merge and merge reversal, payments and expense verification, animal allocation, nisab changes, deletion, template changes, document deadline extensions, deficiency reports, media consent, exports of sensitive data | §13 | — | M15 | audit_log | service | integration | approved |

## 14. Roles, permissions and scopes (M02)

| Id | Rule | Source | BD | Module | Entities | Enforcement | Test | Status |
|---|---|---|---|---|---|---|---|---|
| BR-180 | Permission = role × data scope; the A4 matrices are the defaults; no permission is hard-coded; the Department Head or Monitoring Team may grant or revoke any permission for anyone from the permission panel; every change is audited; the same person may hold different permission sets on different projects | A4, B4, Q-36 | — | M02 | roles, permissions, user_permissions | service + audit | API (authorization matrix test) | approved |
| BR-181 | Data scopes are GLOBAL (Head, Monitoring), PROGRAM (PM), PROJECT (everyone assigned), REGION (RPM, Executive, Official দায়ী), DISTRICT / UPAZILA / UNION (RPM when split, Local দায়ী, Paid Volunteer), ASSIGNED (Local দায়ী, Paid Volunteer), SELF (Volunteer, Team Member) | B4 (scope table) | — | M02 | scopes | DB + service | unit | approved |
| BR-182 | On every API request the server verifies role, project assignment and scope before returning or changing data; default deny; hiding in the UI is never sufficient | B4 (implementation rules), §2 | — | M02 | — | middleware | API | approved |
| BR-183 | Field-level protection: NID numbers and photos, bank details, ratings, categories, donor data and the official section are returned only to authorized official roles, in exports as well as screens; NID numbers and photos are visible to all official staff roles that do project work, never to volunteers, Media, Finance or Procurement Teams | B4, B8, A4 (second table), §5 | — | M02, M16 | — | serializer + export | API | approved |
| BR-184 | The Monitoring Team has the same access as the Department Head everywhere | A2, A4, Q-02 | — | M02 | roles | config | API | approved |
| BR-185 | The volunteer and beneficiary tabs are GLOBAL read scope for all officials; project work runs in REGION or ASSIGNED scope | B4 | — | M02 | — | scope | API | approved |
| BR-186 | The Media Team may view applications and beneficiary stories, read, write and edit own stories, collect photos and videos into the publication tracker and view consent status; it may not change project, application or beneficiary data | A4 (Media Team, second table) | — | M02, M18 | media_stories | permission | API | approved |
| BR-187 | Only the PM (within own program) creates projects, chooses components, forms, budgets, deadlines, rules, syllabus, rating criteria and settings, extends deadlines, closes projects, assigns areas and RPMs and splits districts | A4 matrix rows 1–3 | — | M02 | — | permission | API | approved |
| BR-188 | Blocklisting (volunteer or beneficiary) is available to PM, RPM, Monitoring Team and Department Head, not to the Project Executive | A4 matrix, Q-45 | BD-06 | M02 | blocklist | permission | API | approved |
| BR-189 | Adding volunteers, Local দায়ীs and paid volunteers to a project and transferring applications are RPM rights; the Project Executive gets them only if the RPM grants | A4 matrix | — | M02 | — | permission | API | approved |
| BR-190 | A Local দায়ী may raise issues but not resolve them; resolution is for PM, RPM, Executive and the Procurement Team | A4 matrix | BD-25 | M02 | issues | permission | API | approved |
| BR-191 | Construction or work-progress updates are posted by paid volunteers, RPM and Executive, and by general volunteers in safe water | A4 matrix | — | M02, M09 | project_activities | permission | API | approved |
| BR-192 | Project dashboards, budgets and reports are visible to the PM for the program and to RPM and Executive for own region | A4 matrix | — | M02, M16 | — | scope | API | approved |
| BR-193 | Every endpoint declares its permission name and scope; permission names live in one source of truth (`docs/security/permissions.yaml`) | §13, CLAUDE.md | — | M02 | — | policy + code | API | approved |

## 15. Offline PWA and sync (M22)

| Id | Rule | Source | BD | Module | Entities | Enforcement | Test | Status |
|---|---|---|---|---|---|---|---|---|
| BR-194 | Every offline record carries a client-generated unique id (client_uuid) and creation time; the server treats a repeated client_uuid as the same record and never creates a duplicate (idempotent) | B7 | BD-48 | M22, M08 | applications.client_uuid, project_activities | DB unique + service | integration | approved |
| BR-195 | Each offline record has sync_status pending → syncing → synced / failed; a failure shows its reason and is retried automatically with backoff | B7 | BD-48 | M22 | outbox | client | unit, E2E | approved |
| BR-196 | Photos go through a separate compressed queue; text syncs before photos; a distribution is not "completed" while its photos are pending | B7, §9 | BD-21, BD-48 | M22, M09 | photo queue | client + engine guard | E2E | approved |
| BR-197 | Available offline: forms of the assigned projects (current version), the volunteer's own beneficiary and application list, syllabus and locations | B7 | — | M22 | — | client | E2E | approved (size budget: open question 7) |
| BR-198 | Sensitive data on the phone is encrypted and wiped on logout or remote revocation | B7 (PROPOSED), B10, §9 | — | M22, M01 | — | client | E2E | approved by §9 |
| BR-199 | Conflict rule: on approved data the server's value wins; on drafts and field updates the last write wins; both outcomes are written to the audit log | B7, Q-43 | BD-48 | M22, M15 | audit_log | sync service | integration | approved |
| BR-200 | No application is ever lost because of network trouble; the queue is cleared only after the server confirms | B7, Q-23 | — | M22 | outbox | client | E2E | approved |
| BR-201 | An official can revoke the session of a specific device (lost or stolen phone); the device then loses access and local data is wiped | B10, B2 (device_sessions) | — | M01, M22 | device_sessions | service | API, E2E | approved |
| BR-202 | Offline and PWA behaviour must work on Android Chrome (primary) and on iOS Safari and installed iOS PWAs (storage eviction, no background sync, push only when installed, install guidance in Bangla) | UX-06 | — | M22 | — | client | E2E, manual | approved |

## 16. Security, retention and platform (M01, M18, M21)

| Id | Rule | Source | BD | Module | Entities | Enforcement | Test | Status |
|---|---|---|---|---|---|---|---|---|
| BR-203 | Login uses mobile or email plus password; sessions time out; several failed attempts lock the account; a role or permission change forces a session refresh | B8 (session row) | — | M01 | users, device_sessions | service | API | approved (values and login OTP: open question 5) |
| BR-204 | Photos, vouchers and documents are never on public links; they are served through time-limited signed links only after an authorization check | B8 (file access), §9 | — | M18 | files | file service | API | approved |
| BR-205 | Uploads are validated for type and size and pass a virus-scan hook; images are compressed on the phone and uploaded resumably | §13, B10 | — | M18 | files | file service | API | approved |
| BR-206 | Daily automatic backup to a separate location with regular restore tests | B8 (backup, PROPOSED), §9 | — | ops | — | ops | manual | open (question 6: RPO/RTO, cadence) |
| BR-207 | Retention is unlimited: audit log, beneficiary history, photos and documents are permanent; business data is never hard-deleted (soft delete only where approved) | B8, Q-39, §2, §13 | BD-46 | all | — | DB + policy | integration | approved |
| BR-208 | Storage growth is reported to the IT team | B10, §10 | BD-46 | M16, M21 | — | job + report | manual | approved |
| BR-209 | Rate limiting applies to authentication endpoints and public forms | §13 | — | M01, M07 | — | middleware | API | approved |
| BR-210 | Errors never expose stack traces or SQL; secrets never appear in code, logs or commits | §13 | — | all | — | policy + middleware | API | approved |
| BR-211 | The zakat nisab is set by the PM or above (Monitoring Team, Department Head), versioned; every self-reliance application stores the nisab value used at verification so later changes never affect old data; nisab changes are audited | A8.3, Q-29, §13 | BD-28 | M21, M09 | nisab_versions, applications | service + audit | integration | approved (storage model: open question 15) |
| BR-212 | The zakat assessment computes total assets, total debts and net assets from the form (loans count as debts) and proposes eligibility against the nisab; the Official দায়ী as approving আলেম decides; the approver's name is recorded automatically from the assignment | A8.3, Q-29, Q-30, App B.2(g) | BD-28 | M07, M09 | application_answers, applications | shared package + service | unit, integration | approved |
| BR-213 | Monitoring thresholds, photo defaults, expense categories, payment methods, holiday calendar and provider settings are admin settings, not code | A10, B9, §7 | BD-42, BD-47 | M21 | settings | config | unit | approved (initial values: open questions 4, 14, 16, 22) |

## 17. Notifications (M17)

| Id | Rule | Source | BD | Module | Entities | Enforcement | Test | Status |
|---|---|---|---|---|---|---|---|---|
| BR-214 | In-app notifications go to staff and volunteers only; nothing is sent to beneficiaries for now | B9 (notifications) | BD-47 | M17 | notifications | service | API | approved |
| BR-215 | Email is sent through the organization's own SMTP server; SMS through a provider-agnostic adapter whose provider is configured in settings before production (needed before Qurbani) | B9, Q-11 | BD-47 | M17, M21 | provider settings | adapter | integration | approved |
| BR-216 | Volunteers receive operational messages (correction requests, approvals, assignments) inside the app only; no SMS, WhatsApp or email for these; SMS remains for OTP and Qurbani donors | UX-12 | BD-34, BD-44 | M17 | notifications | service | API | approved |
| BR-217 | Notification and message templates exist in bn and en | §11 | — | M17, M20 | notification_templates | config | unit | approved |

## 18. Localization and UI (M20)

| Id | Rule | Source | BD | Module | Entities | Enforcement | Test | Status |
|---|---|---|---|---|---|---|---|---|
| BR-218 | Bangla and English are both first-class and switchable per user; no user-facing text is hard-coded; labels, buttons, validation, notifications, errors, statuses, menus, reports and message templates use central i18n keys; the default interface language is Bangla | B9, Q-17, §11, DESIGN_BRIEF §2 | — | M20 | i18n keys | UI + lint | E2E | approved |
| BR-219 | All numbers (amounts, dates, counts, ids, phone numbers) use English digits 0–9 in both languages; formatting lives in one central utility | UX-05, §11 | — | M20 | — | shared package | unit | approved |
| BR-220 | Form labels, section names, option lists, status names and workflow stage names are bilingual data | §11, B3 | — | M20, M07 | bilingual columns | DB | unit | approved |
| BR-221 | A Hijri date may be shown beside the Gregorian date through a setting that is off by default | §11, DESIGN_BRIEF §2 | — | M20, M21 | settings | config | unit | approved |
| BR-222 | The system is one installable offline-first PWA for desktop and mobile; no separate mobile app | Q-15, Q-23, D2 | — | M22 | — | client | E2E | approved |
| BR-223 | Review, approval, lookup, profiles and dashboards are fully usable at 360 px; setup screens (form builder, project setup, permission panel, template and checklist editors) are desktop first and show a notice on phones | UX-03, UX-04 | — | UI | — | UI | visual, E2E | approved |
| BR-224 | Every list and screen shows its statistics; every filtered list exports to Excel/CSV; beneficiary profile, exam comparison and work summary export to PDF; all form data exports to Excel/CSV and PDF; exports apply the same field-level protection as screens | A11 (statistics, downloads), B8 | — | M16 | — | report | API | approved |
| BR-225 | Dashboards exist at project, program, central and dawah level with year and area filters; everyone sees only data within own scope; the central dashboard starts with the seven KPI groups of A11 | A11, Q-13, Q-41 | BD-43 | M16 | — | report + scope | API | approved |
| BR-226 | The management home (Department Head, Monitoring Team) opens with work progress first (applications, approved, distributed or completed against target); each role's home opens with what needs that person now | UX-10, A4 (My Work) | — | UI | — | UI | E2E | approved |
| BR-227 | When a project starts in the system, its old Google Form is closed; legacy data (Excel, Google Forms, Kobo) is not imported at launch | D2 | — | policy | — | policy | manual | approved |

## 19. Test-status register

Every rule above starts with test status "not yet". When a test exists, record it here as `BR-nnn: <test file>::<test name> — passing/failing (date)`. Update this register in the same commit as the test.

(Empty: no code exists yet. Phase 0.)

## 20. Gaps and ambiguities

Items where the blueprint is silent or inconsistent. Numbers refer to the open questions in `docs/DECISION_LOG.md` (section "Open") and `docs/MASTER_SPEC.md` (final section).

| # | Gap | Rules affected |
|---|---|---|
| 2 | B3 layer table and diagram image4 say the beneficiary mobile is unique; B3 rules, Q-21 and BD-01 say it is contact data and may repeat | BR-004, BR-009 |
| 3 | No rule for BEN-ID and application id formats | BR-105 |
| 4 | Alert thresholds (days, budget percentage) not set | BR-141, BR-173, BR-213 |
| 5 | Password, session, lockout values and whether OTP is needed at login | BR-203 |
| 6 | Backup RPO/RTO and restore cadence | BR-206 |
| 7 | Offline storage and photo-queue budget | BR-197 |
| 8 | Abuse protection for the public application link | BR-087 |
| 9 | Source of the locations master | BR-084 |
| 10 | Rating averages across projects vs "never averaged" | BR-044 |
| 11 | Family-member attendance in dawah and where the member list comes from | BR-155 |
| 12 | Whether the Closing state is adopted | BR-055 |
| 13 | Which application states count toward the limit; late-synced offline drafts | BR-059, BR-058 |
| 14 | Expense-claim categories, verify/pay steps, several claims per project, caps | BR-137, BR-136 |
| 15 | Nisab storage model | BR-211 |
| 16 | Working days for the 3-working-day countdown | BR-166 |
| 17 | Who records media consent and the channel list | BR-022 |
| 18 | Beneficiary profile status list | BR-021 |
| 19 | Goat share model | BR-143 |
| 20 | Volunteer NID uniqueness; volunteer as beneficiary | BR-025, BR-026 |
| 21 | Score recomputation and snapshot timing | BR-097 |
| 22 | Payment method list | BR-136, BR-138 |
| 23 | Default follow-up questions | BR-070 |
| — | SOP v2.3 text needed for the seven checklists, the 11 deficiency items and the hard-copy code structure | BR-165, BR-167, BR-162 |
