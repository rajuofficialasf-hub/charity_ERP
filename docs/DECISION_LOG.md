# DECISION LOG

Status: seeded in task T0.1 (2026-10-10). This log is the third authority after the owner's latest instruction and the blueprint (constitution §0). It holds four series plus an "Open" section:

- **Q-01 … Q-47**: the blueprint's Part C questions (C১ and C২), one row each, as decided by the department.
- **BD-01 … BD-49**: the constitution's approved business decisions (§7), each cross-referenced to the Q-ids and blueprint sections it derives from.
- **D-050 …**: technical decisions; D-050…D-053 are the constitution §9 stack proposals, status "proposed — awaiting owner".
- **UX-01 … UX-13**: the owner's design decisions from the interview of 2026-10-10 (`docs/ui/DESIGN_BRIEF.md`), status approved.
- **O-01 … O-23**: the owner's answers of 2026-10-10 to the T0.1 open questions (task T0.7); the id number equals the question number.
- **Open**: numbered questions and their state; new questions continue the numbering (24 …).

## Rule for this log

Every new architectural or business decision is appended here **before implementation** with: id, date, decision, rationale, affected modules and documents, approved by. A proposal carries status "proposed" until the owner confirms in chat; then the status becomes "approved" with the date and the row is never deleted. BD-01…BD-49 are never reopened without the owner's approval. New ids continue the D series (D-054 …) for technical decisions and start a new series O-nn for owner answers to open questions (O-01 answers open question 1, and so on), so that question numbers and decision ids match. A superseded decision keeps its row with status "superseded by …".

## 1. Blueprint decisions Q-01 … Q-47 (Part C)

Source: `docs/source/ERP_BLUEPRINT_BN.md` C১ (1–34) and C২ (35–47). All carry the blueprint status "সিদ্ধান্ত হয়েছে" (decided). The English text is in `docs/MASTER_SPEC.md` Part C.

| Id | Question (short) | Decision | Status | Blueprint sections |
|---|---|---|---|---|
| Q-01 | Regional Manager vs Regional Officer | Same role: RM = RPM | approved | A2, A4 |
| Q-02 | Monitoring Officer's reach | All programs; access equal to the Department Head everywhere | approved | A2, A4, B4 |
| Q-03 | Program of tree planting and safe water | Humanitarian Program | approved | A2 |
| Q-04 | Who reviews applications | Whoever the RPM grants review permission | approved | A7 |
| Q-05 | Field-level correction requests before approval | No; the official edits the whole form during review | approved | A7 |
| Q-06 | Team member edits before submission | Yes before submission; after submission only the main volunteer | approved | A5 |
| Q-07 | Paid volunteer as a registration type | Same form, separate type; RPM marks paid per project | approved | A4, A5 |
| Q-08 | Several RPMs in one division | Equal by default; PM may split districts, giving separate views | approved | A6 |
| Q-09 | Who approves a volunteer's edit request | RPM or Project Executive, either | approved | A5 |
| Q-10 | Tree planting open application | Yes, public link; enters after verification | approved | A6, A8.5 |
| Q-11 | Qurbani donor sheet format; SMS and email services | Import per last year's sheet; email via own SMTP; provider-agnostic SMS gateway settings | approved | A8.6, B9 |
| Q-12 | Photo rule options | Group / individual / both are enough | approved | A6, A8.1 |
| Q-13 | Central dashboard content | Start with the seven KPI groups of A11 (see Q-41) | approved | A11 |
| Q-14 | Documentation SOP availability | SOP v2.3 (September 2026) available; mapping in A10 | approved | A10 |
| Q-15 | Separate mobile app or mobile web | PWA, installable; no separate app | approved | B7, D2 |
| Q-16 | One volunteer in several projects | Yes; permissions per project | approved | A5, B4 |
| Q-17 | Interface language | Bangla and English from the start | approved | B9 |
| Q-18 | Project Officer vs Project Executive | Same post | approved | A2, A4 |
| Q-19 | Who approves volunteer registrations | Project Executive, RPM, PM, Monitoring Team, Department Head: any | approved | A5 |
| Q-20 | Nationwide tabs vs regional project work | Tabs nationwide; assignment and applications by region | approved | A5, A7, B4 |
| Q-21 | Beneficiary identification | NID or birth registration mandatory and the profile basis; auto-fill; name and NID locked; volunteer's own number blocked | approved | B3, A7 |
| Q-22 | General volunteer's work in safe water | Detailed application; advance after approval; updates; final photo, vouchers, account | approved | A8.4 |
| Q-23 | Offline in the PWA | Yes; capture and save offline, submit on reconnect; nothing lost | approved | B7 |
| Q-24 | Budget computation | Cost per beneficiary × number, at project creation | approved | A6, B6 |
| Q-25 | Both-type volunteers add team members | Yes | approved | A5 |
| Q-26 | Spot code and community number | Dropped; custom field later if needed | approved | App B |
| Q-27 | Beneficiary class options | Eight defaults, editable per project; "other" opens a text box | approved | App B.1 |
| Q-28 | Duplicated branching questions | One field with options depending on the previous answer; "other" adds a text box | approved | App B.2 |
| Q-29 | System computes net assets and zakat status | Yes, proposal only; আলেম decides; nisab set by PM or above; nisab snapshot on the application | approved | A8.3, App B.2(g) |
| Q-30 | Dawah representative and zakat-approving আলেম | The Official দায়ী; names from assignments, never typed; approver recorded automatically | approved | App B.2(a) |
| Q-31 | Mandatory fields | NID/birth registration, name, father/husband name, mobile, gender, division→union, village; the rest per project | approved | B3, App B |
| Q-32 | Rating: automatic or manual, when | System proposes per criterion at close from work data; PM/RPM/Executive finalize | approved | A5 |
| Q-33 | Reopen closed project; follow-up schedule | PM reopens with reason, logged; follow-up continuous, no schedule or reminders, also after close | approved | A6 |
| Q-34 | Volunteer category list | A, B, C, D plus a separate "inactive" flag | approved | A5 |
| Q-35 | Configurable workflow engine | Yes; states and stages are settings: common states + project templates and components | approved | B5, A6 |
| Q-36 | Permission = role × scope | Yes; A4 default matrix, changeable in the permission panel | approved | B4, A4 |
| Q-37 | Budget bucket model | Yes; ledger-based; advance ≠ actual expense; volunteer expenses in a separate bucket | approved | B6 |
| Q-38 | Project templates and components | Master templates and copy of a previous project; copy list in A6; anyone with project-creation access builds templates | approved | A6 |
| Q-39 | Audit fields and retention | No time limit; audit log, history, photos and documents permanent | approved | B8 |
| Q-40 | Stack and hosting | Own server; own team; stack (PostgreSQL + JSONB, React/Next.js PWA, REST) finalized with the team | approved (stack detail: D-050…D-053) | B9 |
| Q-41 | Central KPI list | Seven KPI groups of A11 to start | approved | A11 |
| Q-42 | Registration form fields and OTP | Mobile and email OTP, then the form; fields in A5 | approved | A5 |
| Q-43 | Offline conflict rule | Server wins on approved data; last write on drafts and field updates; both logged | approved | B7 |
| Q-44 | Beneficiaries without NID | Birth registration suffices; one of the two mandatory; field added to the distribution form | approved | B3, App B.1 |
| Q-45 | Blocklist actors and ongoing applications | RPM or above with reason; ongoing applications unchanged; new volunteer manages after transfer | approved | A5, A7 |
| Q-46 | Procurement Team rights | View applications only; raise and resolve issues | approved | A4, A8.2 |
| Q-47 | Qurbani animal allocation | Numbers from donor data; manual allocation on the volunteer profile; several cows or 1–4 goats; exclusive once allocated | approved | A8.6 |

## 2. Constitution decisions BD-01 … BD-49 (§7)

Source: `docs/MASTER_PROMPT.md` §7, approved by the owner. "Derived from" names the Q-ids and blueprint sections; where the blueprint marks an item "(প্রস্তাবিত)", the BD makes it approved (constitution outranks blueprint proposals, §0). Full wording in the constitution; summaries here.

| Id | Decision (summary) | Derived from | Status | Documents |
|---|---|---|---|---|
| BD-01 | Identity = NID or birth registration, one mandatory, each unique, format 10/13/17 and 17 digits; mobile is contact data | Q-21, Q-44, B3, A7 | approved | BR-001…004 |
| BD-02 | Known id auto-fills; name, father/husband name and id locked; mobile and address editable with change log; locked fields change only via profile correction request | Q-21, B3 (PROPOSED correction request) | approved | BR-005…007 |
| BD-03 | A volunteer cannot use own mobile as a beneficiary's; enforced in the database | Q-21, B3 | approved | BR-008 |
| BD-04 | Family-duplicate warning (union+village, father/husband, mobile) in the same project; never auto-reject; no household id | A7 (duplicates) | approved | BR-011 |
| BD-05 | Profile merge with system candidates, side-by-side compare, both ids searchable, retired id points to kept, logged and reversible by Monitoring; by PM/Monitoring/Head, RPM proposes | A7 (merge, PROPOSED) | approved | BR-012…014 |
| BD-06 | Blocklist for volunteers and beneficiaries by RPM or above with reason; effects as defined | Q-45, A5, A7 | approved | BR-010, BR-015, BR-047, BR-048 |
| BD-07 | Application transfer with full access to the new volunteer, none to the old, fully logged | A5 (transfer) | approved | BR-049 |
| BD-08 | Staff handover before deactivation; handover record kept | A5 (handover) | approved | BR-034 |
| BD-09 | Projects assembled from reusable components; nothing project-specific hard-coded | Q-35, Q-38, A6 | approved | BR-062, BR-063 |
| BD-10 | Master templates and copy-from-project as independent snapshots; copy / not-copy lists | Q-38, A6 | approved | BR-064, BR-065 |
| BD-11 | Workflow states and transitions are configuration; common states Draft → … → Closed incl. Rejected, Implementation, Completed (blueprint PROPOSED) | Q-35, A7, B5 | approved | BR-090, BR-091 |
| BD-12 | Section and field libraries, visibility and conditions; published forms immutable, versioned | B3 | approved | BR-072, BR-073, BR-077 |
| BD-13 | Mandatory fields in every project; everything else per project | Q-31 | approved | BR-078 |
| BD-14 | Beneficiary type defaults, editable per project; "other" text box; branching questions as one field | Q-27, Q-28 | approved | BR-079, BR-080 |
| BD-15 | No spot or community code field | Q-26 | approved | BR-081 |
| BD-16 | Per-volunteer limit and deadline enforced; PM extends with reason | A6, A8.1 | approved | BR-058, BR-059 |
| BD-17 | Priority score from PM criteria, quotas, approved/waitlist/rejected, comment against the score, one-click waitlist; score never decides | A7 (priority score) | approved | BR-097…101 |
| BD-18 | Field unlock with logged old/new/reason | A7 (field unlock) | approved | BR-095, BR-096 |
| BD-19 | Follow-up continuous, no schedule or reminders, also after close | Q-33, A6 | approved | BR-070, BR-176 |
| BD-20 | Only PM closes; read-only except follow-ups; PM reopens with reason | Q-33, A6 (PROPOSED reopen) | approved | BR-056, BR-057 |
| BD-21 | Photo rule per project; no completion without photos; capture metadata; duplicate warning | Q-12, A8.1 | approved | BR-066, BR-108, BR-109 |
| BD-22 | Stock reconciliation must balance before completion; differences need a reason and raise an alert | A8.1 (reconciliation) | approved | BR-110 |
| BD-23 | Distribution edge states (absent, later, not distributed, shortage, damaged, partial, death/relocation) | A8.1 (edge table) | approved | BR-111…116, BR-021 |
| BD-24 | House construction: applications by volunteers or officials, PM final approval, one Local দায়ী per area, 2–3 paid volunteers per district, procurement resolves issues, vouchers optional | A8.2 | approved | BR-094, BR-117 |
| BD-25 | Issue log: raise with photos, assign, resolve visibly | A8.2, Q-46 | approved | BR-118 |
| BD-26 | Dawah for the whole family; gender split; daily attendance and progress; exams by the Official দায়ী; results side by side | A9 | approved | BR-154…157 |
| BD-27 | Self-reliance payment gated on passing the exam; then purchase, placard photo, vouchers, verify and lock | A8.3 | approved | BR-121, BR-122 |
| BD-28 | Zakat computation, nisab versioned by PM or above, snapshot per application; names from assignments | Q-29, Q-30, A8.3 | approved | BR-211, BR-212, BR-082 |
| BD-29 | Budget = target × cost plus ledger buckets; advance ≠ actual; volunteer expenses never mixed with per-beneficiary cost | Q-24, Q-37, B6 | approved | BR-128…132 |
| BD-30 | Fund-source tags; zakat funds only for zakat-eligible beneficiaries; reports by source | B6 | approved | BR-071, BR-133 |
| BD-31 | No approval thresholds; unique transaction id; bKash payments to volunteers; Finance views and exports only | B6, A4 | approved | BR-134…139 |
| BD-32 | Qurbani donor data from the SSL sheet and the cash-donor form, merged | Q-11, A8.6 | approved | BR-142 |
| BD-33 | Animals and shares from donor data (cow = 7); manual exclusive allocation on the volunteer profile | Q-47, A8.6 | approved | BR-143…146 |
| BD-34 | Three photos per animal emailed with sent status; pre-notification by email/SMS | A8.6 | approved | BR-147, BR-148 |
| BD-35 | Per-project document checklists from templates with the SOP columns; 5-year retention; folder structure | A10 (SOP 5, 8–10) | approved | BR-162, BR-164, BR-168 |
| BD-36 | Soft warning, 3-working-day countdown, non-compliance for officials only; never affects volunteers | A10 (SOP 6) | approved | BR-163, BR-166 |
| BD-37 | Deficiency reports (11 fields), central log, automatic escalation on the second report within a year; legacy exempt | A10 (SOP 7) | approved | BR-167 |
| BD-38 | Media consent on the profile gates "publishable" | A10 (SOP 12) | approved | BR-022 |
| BD-39 | Document register replaces the tracking sheet; quarterly audit report | A10 (SOP 11, 13) | approved | BR-169, BR-170 |
| BD-40 | Ratings proposed by the system at close, finalized by officials; categories A/B/C/D + inactive; never visible to volunteers; category change needs a comment; separate score sets per kind of work, never averaged | Q-32, Q-34, A4, A5 | approved | BR-042…046 |
| BD-41 | Work summary per staff and volunteer, filterable, exportable | A10 (work summary) | approved | BR-175 |
| BD-42 | Monitoring alerts list (pending approvals, missing photos, inactive volunteers, budget, duplicate NID attempts, unbalanced stock, overdue documents, repeated deficiencies) | A10 (alert table, partly PROPOSED) | approved | BR-173 |
| BD-43 | Four dashboards; start with the seven KPI groups | Q-13, Q-41, A11 | approved | BR-225 |
| BD-44 | Registration with two OTPs then the form; dummy OTP in dev/test | Q-42, A5 | approved | BR-023, BR-024, BR-026 |
| BD-45 | Hosting on the organization's own server; in-house development; PostgreSQL; nothing cloud-dependent | Q-40, B9 | approved | D-050…D-053 |
| BD-46 | Permanent retention; storage growth reported | Q-39, B8, B10 | approved | BR-177, BR-207, BR-208 |
| BD-47 | In-app notifications for staff and volunteers; email via SMTP; provider-agnostic SMS; none to beneficiaries | B9, Q-11 | approved | BR-214, BR-215 |
| BD-48 | Offline conflicts: server wins on approved, last write on drafts; both logged; NID collision at sync → needs verification | Q-43, B7 | approved | BR-104, BR-194, BR-199 |
| BD-49 | Dummy OTP and seed data never reach production | A5, B9 | approved | BR-024 |

## 3. Technical decisions D-050 … (constitution §9 proposals)

Status "proposed — awaiting owner" until confirmed in chat (open question 1). Rationale and alternatives: `docs/PLAN.md` §2.1. Approved parts of §9 (PostgreSQL with JSONB, React/Next.js PWA, versioned REST with openapi.yaml, own-server file storage with signed URLs, background jobs, four environments) are not repeated here; they are already approved by the constitution.

| Id | Date | Decision | Rationale | Affects | Status |
|---|---|---|---|---|---|
| D-050 | 2026-10-10 | Monorepo with pnpm workspaces: `apps/web`, `apps/api`, `packages/shared` (zod schemas, permission names, i18n keys, pure business rules: score, zakat, budget math, form evaluator), `packages/ui`, `packages/config` | One place for business logic used by API and UI (§13: no duplicated calculations); contracts stay in sync | SYSTEM_ARCHITECTURE, T1.1 | approved 2026-10-10 by the owner (O-01) |
| D-051 | 2026-10-10 | Backend: Node.js 24 LTS + TypeScript + NestJS (REST under `/api/v1`, OpenAPI generated with `@nestjs/swagger` and checked against `docs/api/openapi.yaml`), Prisma ORM on PostgreSQL 16; every migration ships a hand-written `down.sql` | NestJS modules map to the ten core modules; guards express permission × scope; Prisma schema mirrors the ERD; reversible migrations | SYSTEM_ARCHITECTURE, API_STANDARDS, DATABASE_SCHEMA | approved 2026-10-10 by the owner (O-01) |
| D-052 | 2026-10-10 | Frontend: Next.js (App Router) + React + TypeScript as the installable offline-first PWA; Serwist service worker; Dexie/IndexedDB outbox and separate photo queue; Tailwind CSS bound to the design tokens as CSS variables; next-intl for bn/en | §9 already approves Next.js; mature offline tooling; one codebase for desktop and phone | OFFLINE_SYNC, DESIGN_SYSTEM, I18N | approved 2026-10-10 by the owner (O-01) |
| D-053 | 2026-10-10 | Background jobs with pg-boss (PostgreSQL-backed, no Redis); object storage MinIO (self-hosted, S3-compatible, presigned expiring URLs) with a local-filesystem adapter for tests; email with Nodemailer over the organization's SMTP (Mailpit in dev); SMS through a provider-agnostic adapter with a logging stub in dev; Docker Compose for dev/test (postgres, minio, mailpit); CI on the organization's Git hosting running lint, typecheck, unit, API and E2E tests | Simplest adequate architecture (§2): no extra queue service; signed URLs and storage growth handled by MinIO; providers swappable without code changes (Q-11) | FILES_AND_DOCUMENTS, NOTIFICATIONS, DEPLOYMENT | approved 2026-10-10 by the owner (O-01) |

## 4. Owner design decisions UX-01 … UX-13

Source: owner interview 2026-10-10, `docs/ui/DESIGN_BRIEF.md` §1. Status approved. The brief holds the full wording and effects.

| Id | Decision (summary) | Effect | Status |
|---|---|---|---|
| UX-01 | Brand colours come from the Foundation's website; logo supplied | Tokens and contrast checks in `docs/ui/brand/colors.md`; they replace the constitution §12 colour tokens | approved |
| UX-02 | Calm institutional look: white cards, light borders, green action colour, amber accent, clean tables, large touch targets | No heavy shadows, gradients or illustration; status colours only for status | approved |
| UX-03 | Officials work equally on desktop and phone | Review, approval, lookup, profiles and dashboards fully usable at 360 px; tables collapse to cards | approved |
| UX-04 | Setup screens are desktop first | Readable with small edits on phones; "best on a larger screen" notice; no drag and drop required | approved |
| UX-05 | All numbers use English digits 0–9 in both languages | Supersedes the Bengali-digit line of §11; one central formatting utility | approved |
| UX-06 | Some volunteers use iPhones; Android Chrome primary | Offline design and tests cover iOS Safari and installed iOS PWAs | approved |
| UX-07 | Four biggest problems: duplicate and wrong data, photos and proof, stuck approvals, accounts and expenses | Hero capabilities: NID lookup with duplicate warnings, photo capture with metadata and verification view, approval queue with waiting time, clear expense and ledger view | approved |
| UX-08 | Screens reviewed as clickable HTML mockups; no Figma | Task T0.19b builds them; owner approves before each phase | approved |
| UX-09 | System name চ্যারিটি ও সোশ্যাল সার্ভিস; English name proposed Charity & Social Service | Header shows the logo and the name; home-screen short name open (proposal CSS) | approved (short name open) |
| UX-10 | Management home opens with work progress against target | Then alerts, budget, area view (proposed order) | approved |
| UX-11 | Photo source is a per-project setting next to the photo rule; camera only for proof, gallery allowed for vouchers and paper | New setting in the photo-rule component; photos without capture time or GPS stay flagged | approved |
| UX-12 | Volunteers read operational messages inside the app only | Volunteer home puts "needs your attention" first; SMS stays for OTP and Qurbani donors | approved |
| UX-13 | Typography follows the website: UbuntuSans, Bornomala, sans-serif; weights 400 and 700 | Replaces Hind Siliguri; self-hosted fonts in `docs/ui/brand/fonts/`; Bornomala source still to be confirmed | approved |

## 5. Owner decisions O-01 … O-23 (answers of 2026-10-10 to the T0.1 open questions)

Approved by the owner in chat on 2026-10-10 (task T0.7). Each O-nn answers the open question with the same number in section 6. Where the owner's answer differs from the recommendation, the answer is recorded; where the owner wrote "ঠিক আছে" or "হ্যাঁ", the recommendation became the decision. Interpretations made by Claude are marked "(interpretation)" and stand unless the owner corrects them.

| Id | Date | Decision | Rationale / note | Affects |
|---|---|---|---|---|
| O-01 | 2026-10-10 | Technical stack D-050…D-053 approved as proposed | Owner confirmation; D rows updated | All architecture documents, ADR-001…006, T1.1 |
| O-02 | 2026-10-10 | The beneficiary mobile number is not unique and is not identity; the same mobile on several profiles gives a warning only; the volunteer's own mobile is blocked (BD-03). The "মোবাইল নম্বর ইউনিক" wording of the blueprint B3 layer table and diagram image4 is legacy | Consistent with BD-01, Q-21 | BR-004, BR-009, ERD |
| O-03 | 2026-10-10 | BEN-ID is a UUID version 7 generated by the system (the primary key itself); there is no separate human-readable "BEN-" sequence. Application id = project code + year + 5-digit sequence (e.g. WNT-2026-00125); the project code is set in project setup and unique; proposed codes WNT winter, IFT iftar, MEAT meat distribution, QRB Qurbani, SBL self-reliance, HSE house construction, SWT safe water, TRP tree planting | Owner asked for UUID v7 as the BEN-ID. (interpretation) On screens and in reports people find a beneficiary by NID/birth number and name; the UUID is shown where an id is required (profile, merge pointer, exports). A short display form can be added later by a new decision if the field finds the UUID unwieldy | BR-105, ERD, API, ADR-010 |
| O-04 | 2026-10-10 | Monitoring thresholds: review pending 7 days, approval pending 5 days, no update from a Local দায়ী / volunteer / paid volunteer 7 days, inactive volunteer 14 days, budget alert at 90%; all editable in admin settings | Recommendation accepted | BR-141, BR-173, BR-213, NFR |
| O-05 | 2026-10-10 | Authentication: minimum password 8 characters with at least one letter and one digit; access token 15 minutes; refresh token 30 days bound to the device session and revocable; lock for 15 minutes after 5 failed attempts; a role or permission change forces a session refresh; OTP is used for registration and password reset only, not at every login | Recommendation accepted; the blueprint B8 "OTP (PROPOSED)" at login is not adopted | BR-203, AUTH.md, SECURITY_POLICY, NFR-40 |
| O-06 | 2026-10-10 | Backup targets: RPO 24 hours initially (daily backup), 1 hour once WAL archiving is enabled; RTO 4 hours; restore drill monthly | Recommendation accepted; the IT team is informed through DEPLOYMENT.md and RUNBOOK.md | BR-206, NFR-35, RUNBOOK |
| O-07 | 2026-10-10 | Offline scope on the phone: the assigned projects' current form versions, the volunteer's own beneficiaries and applications, syllabus and locations; photo queue up to 200 MB; everything wiped on logout or remote revocation | Recommendation accepted | BR-197, NFR-22, OFFLINE_SYNC |
| O-08 | 2026-10-10 | Public application link: rate-limited; repeated NID or mobile entries go to "needs verification"; no CAPTCHA for now | Recommendation accepted | BR-087, SECURITY_POLICY, NFR-41 |
| O-09 | 2026-10-10 | Locations master has four levels: division → district → upazila → union (no ward level). The admin panel has full management of the master: add a new upazila or union, rename any level, and deactivate; nothing is hard-deleted because beneficiary addresses reference it; every change is audited. (interpretation) Initial load from an open dataset, as recommended; the department corrects it from the admin panel | Owner: four levels and full admin control for new upazilas/unions and renames. Supersedes the ward level named in blueprint B2/B3 and constitution §6 | BR-084, new BR-228, M19, M21, ERD, T1.2 |
| O-10 | 2026-10-10 | Ratings are per project; averages are shown only within the same kind of work (application/distribution vs dawah), never across the two kinds | Recommendation accepted; reconciles A5 "গড়" with BD-40 | BR-044 |
| O-11 | 2026-10-10 | Dawah attendance may be recorded for family members listed in the application's family repeat group; reports count beneficiaries and family members separately | Recommendation accepted | BR-155, ERD |
| O-12 | 2026-10-10 | The project lifecycle includes a Closing state between Active and Closed: new applications stop while remaining work, photos and vouchers are verified; only the PM moves a project to Closing and to Closed | Recommendation accepted; blueprint A6 proposal adopted | BR-055, WORKFLOW_ENGINE |
| O-13 | 2026-10-10 | The per-volunteer application limit counts every application that is not Rejected and not deleted, drafts included. A draft synced after the deadline is accepted only if its client creation time is before the deadline, and it is flagged "needs verification" | Recommendation accepted | BR-058, BR-059, OFFLINE_SYNC |
| O-14 | 2026-10-10 | Volunteer operational expense claims: default categories decoration, vehicle hire, food, photocopy, banner, editable per project; verification (Project Executive or RPM) and the payment record are separate steps; several claims per volunteer per project are allowed, each paid at most once; no amount cap (BD-31) | Recommendation accepted; closes C3 item 4 | BR-136, BR-137, ERD |
| O-15 | 2026-10-10 | The zakat nisab is one global versioned table (value, effective date, set by PM or above); every self-reliance application stores the nisab value used at verification | Recommendation accepted | BR-211, ERD, M21 |
| O-16 | 2026-10-10 | Working days for the 3-working-day document countdown: Friday is the only weekly holiday. (interpretation) Public holidays come from an admin-maintained holiday calendar, as recommended | Owner: only Friday is the weekend (not Friday and Saturday) | BR-166, M21 |
| O-17 | 2026-10-10 | Media consent is recorded on the beneficiary profile by an official (an attached signed form or photo is optional); channel list website, Facebook, print, video, donor report; the list is editable in admin settings | Recommendation accepted | BR-022, FILES_AND_DOCUMENTS |
| O-18 | 2026-10-10 | Beneficiary profile statuses: active, deceased, relocated; the blocklist stays a separate flag | Recommendation accepted | BR-021, ERD |
| O-19 | 2026-10-10 | Qurbani: a goat is a whole animal (one share, full when allocated to a donor); a donor's goat count creates that many goat numbers; a cow has 7 shares | Recommendation accepted | BR-143 |
| O-20 | 2026-10-10 | A volunteer's NID is unique among volunteers; a volunteer may also exist as a beneficiary (in another project), and the review screen flags it | Recommendation accepted | BR-025, BR-026, ERD |
| O-21 | 2026-10-10 | The priority score is computed at submission and recomputed on every answer change until the decision; the score and the criteria used are snapshotted at the decision | Recommendation accepted | BR-097 |
| O-22 | 2026-10-10 | The ERP never initiates or executes payments. The accounts team pays, mostly by mobile banking, and sends the transaction id (often a copy/screenshot) to the department; an official records the payment in the ERP with date, amount, method and transaction id and may attach the copy. Payment methods are an admin-editable list, defaults bKash, Nagad, Rocket, bank transfer | Owner: "we do not pay directly; the accounts team does, mostly mobile banking, and sends us the transaction id." (interpretation) Entry stays with PM/RPM/Project Executive per BD-31 and A4; the Finance Team remains a viewer. Whether the accounts team should enter transaction ids themselves is a new open question (section 6, item 24) | BR-136, BR-138, new BR-229, M10, ERD |
| O-23 | 2026-10-10 | The five follow-up questions of blueprint A6 (business started, current income, business running, profit, main problem) are the default follow-up evaluation template for self-reliance, editable per project | Recommendation accepted | BR-070 |

## 6. Open — questions and their state

Questions 1–23 were raised in T0.1 and answered on 2026-10-10 (section 5). They stay here for traceability with the answering decision id. Item 24 is new and awaits the owner. Full wording and the source of each gap are in `docs/MASTER_SPEC.md`, final section.

| # | Question | Recommendation (as raised) | Affects |
|---|---|---|---|
| 1 | Technical stack D-050…D-053: approve or change? | Approve as proposed | All architecture docs, T1.1 |
| 2 | Is the beneficiary mobile number unique? (B3 table says yes; B3 rules, Q-21, BD-01 say no) | Not unique; warning only; volunteer's own number blocked (BD-03); treat the table wording as legacy | BR-004, BR-009, ERD |
| 3 | BEN-ID and application id formats; project codes | BEN-ID = "BEN-" + 7-digit sequence, no year, never reused; application id = project code + year + 5-digit sequence (WNT-2026-00125); project code set in setup and unique; codes WNT, IFT, MEAT, QRB, SBL, HSE, SWT, TRP | BR-105, ERD, API |
| 4 | Monitoring thresholds and budget alert percentage | Review 7 days, approval 5 days, no update 7 days, inactive volunteer 14 days, budget 90%; all admin-editable | BR-141, BR-173, BR-213, NFR |
| 5 | Password rules, token lifetimes, lockout; OTP at login? | Min 8 chars with a letter and a digit; access token 15 min; refresh 30 days bound to the device, revocable; 15-min lock after 5 failures; role change forces refresh; OTP only for registration and password reset | BR-203, AUTH.md, SECURITY_POLICY |
| 6 | Backup RPO/RTO and restore-drill cadence | RPO 24 h initially, 1 h with WAL archiving; RTO 4 h; monthly restore drill | BR-206, NFR, RUNBOOK |
| 7 | Offline data scope and photo-queue budget | Assigned projects' current forms, own beneficiaries and applications, syllabus, locations; photo queue up to 200 MB; wiped on logout or revocation | BR-197, OFFLINE_SYNC, NFR |
| 8 | Public application link abuse protection | Rate limit; repeated NID/mobile → needs verification; no CAPTCHA for now | BR-087, SECURITY_POLICY |
| 9 | Locations master source | Open dataset (division → district → upazila → union; ward optional); department verifies later | BR-084, T1.2 |
| 10 | Rating averages | Per project; averages only within the same kind of work; never across application/distribution and dawah | BR-044 |
| 11 | Family-member attendance in dawah | Yes, for members listed in the application's family repeat group; counted separately in reports | BR-155, ERD |
| 12 | Adopt the Closing project state? | Yes: stops new applications while remaining work and vouchers are verified; only the PM moves to Closing and Closed | BR-055, WORKFLOW_ENGINE |
| 13 | Application limit: which states count; offline drafts synced after the deadline | Count all applications not Rejected and not deleted, drafts included; a late-synced draft is accepted only if its client creation time is before the deadline and is flagged needs verification | BR-058, BR-059, OFFLINE_SYNC |
| 14 | Volunteer expense claims: default categories editable per project, separate verify and pay steps, several claims per project, any cap | Yes to all; categories decoration, vehicle hire, food, photocopy, banner; verify by Executive/RPM, payment recorded separately; several claims allowed, each paid once; no cap (BD-31) | BR-136, BR-137, ERD |
| 15 | Nisab storage: global versioned table or per-project setting | One global versioned table (value, effective date, set by); each application stores the value used | BR-211, ERD |
| 16 | Working days for the 3-working-day countdown | Friday and Saturday weekend plus an admin holiday calendar | BR-166, M21 |
| 17 | Media consent: who records it, when, channel list | An official records it on the profile (signed form or photo optional); channels website, Facebook, print, video, donor report; list editable in admin | BR-022, FILES_AND_DOCUMENTS |
| 18 | Beneficiary profile status list | active, deceased, relocated; blocklist stays a separate flag | BR-021, ERD |
| 19 | Qurbani goat share model | A goat is a whole animal (one share); a donor's goat count creates that many goat numbers | BR-143 |
| 20 | Volunteer NID unique among volunteers? May a volunteer also be a beneficiary? | NID unique among volunteers; allowed as a beneficiary elsewhere but flagged at review | BR-025, BR-026, ERD |
| 21 | Priority score computation timing | At submission and on every answer change until the decision; score and criteria snapshotted at the decision | BR-097 |
| 22 | Payment method list | bKash, Nagad, Rocket, bank, cash as an admin-editable list; default bKash and bank | BR-136, BR-138 |
| 23 | Default follow-up questions for self-reliance | Adopt the five proposed questions as an editable per-project template | BR-070 |

State: 1–23 answered by O-01…O-23 on 2026-10-10.

| # | Question | Recommendation | Affects | State |
|---|---|---|---|---|
| 24 | Should the accounts (Finance) team be allowed to enter payment records (date, amount, method, transaction id, copy) themselves, instead of only viewing? Today A4 and BD-31 make the Finance Team a viewer and give entry to PM/RPM/Project Executive (O-22) | Keep entry with PM/RPM/Executive for now (no change to BD-31); if the accounts team enters directly later, add a permission `payment.record` grantable to the Finance Team through the permission panel, with the same audit | BR-138, BR-139, permissions.yaml | open |

Also open, from `docs/STATUS.md` and the design brief (not decisions of this task): PWA short name (proposal CSS) and Web Push (T0.14); confirmation of the Bornomala font source (UX-13); SMS provider before Qurbani (C3 item 10); SOP v2.3 text to be supplied (`docs/source/README.md`).
