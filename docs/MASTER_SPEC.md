# MASTER SPECIFICATION — Charity & Social Service ERP

As-Sunnah Foundation · Charity & Social Service Department

Status: first complete draft, task T0.1 (2026-10-10). Derived from the business blueprint `docs/source/ERP_BLUEPRINT_BN.md` (version 2, 5 Oct 2026, Bengali), which remains the business authority (constitution §0). Section numbers mirror the blueprint (A1 = A১, B3 = B৩, Appendix B = পরিশিষ্ট খ) so that cross-references in other documents resolve in both languages.

Reading conventions:

- **Decided** statements are written plainly. They were confirmed by the department.
- **PROPOSED** marks what the blueprint labels "(প্রস্তাবিত)": an architecture or design suggestion that becomes a decision only when approved. Where the constitution (§7, BD-01…BD-49) has already approved such a proposal, the text says "approved by BD-nn".
- **Q-nn** cites a Part C question "(প্রশ্ন N)". All 47 carry the status "decided" in the blueprint (see C1 and C2).
- Naming (constitution, CLAUDE.md): RM = RPM = Regional Program Manager; Monitoring Officer = Monitoring Team; Project Officer = Project Executive. Bengali role names kept where no English term exists: দায়ী (daee), স্বাবলম্বী (self-reliance).
- Nothing is invented here. Where the blueprint is silent or contradicts itself, the item is listed in the final section "Open questions" and in `docs/DECISION_LOG.md` (section "Open").

Diagrams referenced: `docs/source/images/image1.png` (organization), `image2.png` (core lifecycle), `image3.png` (application status cycle), `image4.png` (data model), `image5.png` (offline PWA), `image6.png` (roadmap).

Table of contents:

- Part A — Operational blueprint: A1 purpose and principles · A2 department, programs and projects · A3 core lifecycle · A4 users, roles and permissions · A5 registration, profiles and volunteer management · A6 program and project setup · A7 application and approval workflow · A8 project-type workflows · A9 dawah module · A10 monitoring control centre, audit log, documentation and media · A11 dashboards, reports and downloads
- Part B — System and technical architecture: B1 architecture overview and core modules · B2 data model · B3 dynamic form platform · B4 roles, permissions and data scopes · B5 workflow and activity engine · B6 budget and accounts model · B7 offline PWA and sync · B8 security, audit and data protection · B9 technology stack · B10 performance and field reality
- Part C — Decisions: C1 questions 1–34 · C2 technical decisions 35–47 · C3 must be final before development
- Part D — Roadmap: D1 phases 0–6 · D2 way of working
- Appendix A glossary · Appendix B current form fields and mapping · Open questions

---

## Part A — Operational blueprint

### A1. Introduction, purpose and core principles

The ERP brings every project of the Charity & Social Service Department into one place: volunteer registration, beneficiary applications, verification, approval, distribution or implementation, dawah classes, budget and accounts, monitoring, follow-up and reporting. At any time it is visible who did what, when, and how far each piece of work has progressed.

#### Scope

The centre of the system is only this department's work: projects, beneficiaries, applications, volunteers, workflows, project activities, dawah, monitoring, follow-up and reporting. General enterprise modules such as HR, payroll, procurement and inventory are out of scope; if ever needed they are separate modules, not part of the core architecture. There is, however, a viewer role for the Procurement Team (A4) so that they can resolve house-construction issues; this is a role, not a procurement module.

#### Purpose of the blueprint

Before development starts, management approves the business process, MEAL understands monitoring and reporting, the project team understands the workflows, and the developer can start database, API and module design. Part C lists what is not yet final.

#### Core principles of the system

1. All work lives inside the program → project structure; a new project every year, with setup copied from the previous year's template.
2. Beneficiary and application are separate: one permanent profile per person (BEN-ID) based on NID or birth-registration number; many applications across years and projects, one profile.
3. Permissions depend on role and data scope and are project-based; nothing is hard-coded, everything can be changed from the permission panel.
4. Nobody edits approved data directly; corrections happen only through field unlock, with old and new value and a reason in the log.
5. Project work is organized by region; the central volunteer and beneficiary lists are visible nationwide to all officials.
6. Every project's budget is in the system: cost per beneficiary × number = planned budget; distributed and remaining are always visible.
7. Field updates are done from one screen in bulk; mobile PWA works without network; the interface is Bangla and English from the start.
8. Dawah is an optional project component; when enabled, syllabus, classes, attendance, exams and call log become active.
9. Monitoring is an operational control centre, not just reports: stuck work and problems are flagged automatically. After project close, follow-up evaluations measure the outcome of the support.
10. Permanent audit log of every step; every list and report downloadable as Excel/CSV and PDF.

### A2. Department, programs and project structure

The department works with poor people across Bangladesh; work is organized as program → project. Currently three programs, each with one or more projects; wings outside programs exist, such as the Media Team.

| Program | Projects | Workflow type |
|---|---|---|
| Humanitarian Program | Winter clothing, iftar, Qurbani, tree planting, safe water, etc. | Distribution; donors and animals in Qurbani; open application and visit in tree planting; advance and vouchers in safe water |
| Underprivileged Community Development Program | স্বাবলম্বী (self-reliance) project | Implementation, evidence (vouchers, photos), dawah, follow-up |
| Emergency Response and Resilience Program | Flood project, semi-pucca house construction, tin house construction | Construction stages, paid volunteers, dawah |

Tree planting and safe water belong to the Humanitarian Program (Q-03).

#### Organizational structure (diagram image1)

- Department Head: top of everything; creates programs and assigns Program Managers.
- Program Manager (one per program) and Monitoring Team: under the Department Head. The Monitoring Team's access equals the Department Head's everywhere (Q-02).
- Regional Program Manager (RPM; "Regional Officer" is the same role, Q-01): under the PM; number varies by program, e.g. six in the self-reliance project.
- Project Executive ("Project Officer" is the same post, Q-18) and Official দায়ী: salaried staff under the RPM. Some programs have a team of 2–3, some stop at the RPM; may grow later.

Project Executives verify, screen and review applications sent by volunteers. Two kinds of দায়ী: the Official দায়ী (salaried staff) conducts the initial and final exams, tracks whether Local দায়ীs post daily class updates, and follows up beneficiaries by phone; the Local দায়ী (field level, paid an honorarium like a paid volunteer) teaches beneficiaries and posts what was taught each day.

The top four levels are salaried staff of the department; field-level volunteers, team members, Local দায়ীs and paid volunteers are assigned to projects and supervised by the RPM.

#### Three master records

| Master | What | Detail |
|---|---|---|
| Beneficiary master | One permanent profile per person (BEN-ID): name, mobile, NID/birth registration, address, GPS, photo, family, income; history of support, dawah and follow-up across all years | A7, B2 |
| Volunteer master | Every registered volunteer; may be in several projects with project-specific permissions; teams, ratings and categories | A5 |
| Project | Centre of the whole operation: program → project → region → volunteer → application; setup defines the project's rules | A6 |

### A3. Core business lifecycle (diagram image2)

All work runs in one cycle: program → project → beneficiary → application → review/approval → project activity → completed → monitoring → follow-up → reporting. The project is the centre, the beneficiary is the data backbone, the application is each project's operational transaction; the volunteer is the main field worker, the workflow is the control layer, monitoring is the management layer.

| Step | What happens | Who | Chapter |
|---|---|---|---|
| Program | Department Head opens a program and assigns a PM | Department Head | A2, A6 |
| Project | PM creates and configures: areas, RPMs, form, budget, rules, workflow template | PM | A6 |
| Beneficiary | Identified by NID or birth registration; basic data auto-fills if the person applied before | Volunteer, system | A7, B3 |
| Application | Volunteer or team creates and submits on the project's form | Volunteer, RPM, officials | A7 |
| Review and approval | Verify, edit, approve or reject in the configured workflow | Executive, RPM (PM in house construction) | A7, B5 |
| Project activity | Distribution, construction, payment, vouchers, visits, dawah classes; bulk updates and photos | Volunteer, paid volunteer, দায়ী | A8, A9 |
| Completed | Work and vouchers verified, application "Completed"; PM closes the project at the end | Officials, PM | A6, A7 |
| Monitoring | Audit log at every step, stuck work, alerts, work summaries | Monitoring Team, Department Head | A10 |
| Follow-up | Continuous: an evaluation is added whenever someone checks on a beneficiary, also after close | Officials, Official দায়ী | A6 |
| Reporting | Project, program, central and dawah dashboards; Excel/CSV/PDF | Everyone within scope | A11 |

### A4. Users, roles and permissions

Two kinds of users: officials (staff) and volunteers. Every role's permissions are project-based; the same person can be a reviewer in one project and a viewer in another. What a person may see or change is decided by role and data scope together (nationwide, program, project, region, district, own) (B4).

#### Official roles

| Role | Main responsibilities |
|---|---|
| Department Head | Highest access: all programs, wings and the central dashboard; creates programs and assigns PMs; approves staff and volunteer registrations; blocklist; permission panel |
| Program Manager (PM) | Creates and sets up projects in own program (component selection, application form, budget, deadlines, rules), assigns areas and RPMs, program dashboard; final approval of applications in house construction; closes projects; responsible for the proposal, criteria and completion report under the SOP |
| Monitoring Team (Monitoring Officer) | Same access as the Department Head everywhere; monitoring control centre, audit log and staff oversight; approves registrations; blocklist; permission panel |
| Regional Program Manager (RPM) | The SOP's RPM; full access to projects in own region; adds volunteers, paid volunteers and Local দায়ীs; brings applications and gives final approval; application transfer; grants any permission, including approval, to own team; collects and submits field documents |
| Project Executive (Project Officer) | Verifies, reviews and edits applications; passes them to the RPM after review; may bring applications from the field (house construction); approves volunteer registrations and edit requests |
| Implementer (বাস্তবায়নকারী) | SOP title; overall implementation of the safe-water project and all related documents |
| Official দায়ী | Salaried staff under the RPM: conducts initial and final exams; tracks whether Local দায়ীs post daily class updates; follows up beneficiaries by phone and keeps a call log |
| Procurement Team | Currently only on house construction. May only view applications (no edit or delete); may raise issues in the issue log and resolve, with an entry, issues raised by themselves or by paid volunteers (Q-46) |
| Media Team: Media Director, Media Assistant Director, members | Works on applications an RPM or a PM referred as publishable (D-101). The director (at the PM's level, under the Department Head) and the assistant director accept, send back or reject a referral, assign members and run the works; the director does the final review before publication. The team writes scripts and stories, records the publications on the platforms and sees the referred beneficiaries' contact and occupation; it never changes project, application or beneficiary data and never sees NID, ratings, categories or donor data
| Finance Team | Viewer: budgets, payments, vouchers and expense accounts; CSV/PDF reports. No entry, edit or approval |

#### Volunteer types

| Type | Work |
|---|---|
| General | Submits beneficiary applications and distributes in all projects |
| দায়ী (Local দায়ী) | Classes on basic Islamic knowledge for beneficiaries; daily attendance and what-was-taught updates; receives an honorarium like a paid volunteer |
| দাঈ-স্বেচ্ছাসেবক (Both) | Applications, distribution and classes; may add team members. Rated by kind of work, not by role: one score set for application/distribution, a separate set for dawah; shown separately on the profile, never averaged |
| Team Member | Registered with the main volunteer's NID as reference; can only create applications |
| Paid Volunteer | Separate type on the same registration form; the RPM marks them paid on a project (Q-07). Posts work progress and raises issues in house construction and safe water; may view applications, not edit |

#### Default permission matrix (inside one project)

"If RPM grants" means not by default; granted by the RPM. Department Head and Monitoring Team have maximum access everywhere and therefore have no column. "Volunteer" covers General and Both; "দায়ী" is the Local দায়ী.

| Task | PM | RPM | Executive | Volunteer | Team Member | দায়ী | Paid Vol. |
|---|---|---|---|---|---|---|---|
| Create project; choose components, application form, budget, deadlines, rules, syllabus, rating criteria, settings | ✓ | — | — | — | — | — | — |
| Extend application deadline; close project | ✓ | — | — | — | — | — | — |
| Assign areas and RPMs; split districts among RPMs | ✓ | — | — | — | — | — | — |
| Give staff view/edit/delete access | ✓ | ✓ | — | — | — | — | — |
| Approve volunteer registration (also Department Head and Monitoring Team) | ✓ | ✓ | ✓ | — | — | — | — |
| Add volunteers, Local দায়ীs, paid volunteers to the project | — | ✓ | if RPM grants | — | — | — | — |
| View and give volunteer rating and category | ✓ | ✓ | ✓ | — | — | — | — |
| Put a volunteer or beneficiary on the blocklist and lift it (with reason; also Head and Monitoring Team) | ✓ | ✓ | — | — | — | — | — |
| Transfer applications to another volunteer | — | ✓ | if RPM grants | — | — | — | — |
| Add team members | — | — | — | ✓ | — | ✓ if type Both | — |
| Create application | — | ✓ | ✓ | ✓ | ✓ | — | — |
| Submit application to the office | — | ✓ | ✓ | ✓ | — | — | — |
| Review application and edit the whole form | — | ✓ | ✓ | — | — | — | — |
| Site verification: comment and recommendation (tree planting) | — | ✓ | ✓ | ✓ | — | — | — |
| Approve application | ✓ in house construction | ✓ | if RPM grants | — | — | — | — |
| Unlock a field after approval | — | ✓ | ✓ | — | — | — | — |
| Approve a volunteer's edit request | — | ✓ | ✓ | — | — | — | — |
| View all applications | ✓ | ✓ | ✓ | own | own | own beneficiaries | ✓ |
| Nationwide volunteer and beneficiary tabs | ✓ | ✓ | ✓ | — | — | — | — |
| Distribution update and photos | — | ✓ | ✓ | ✓ | — | — | — |
| Construction/work progress update | — | ✓ | ✓ | ✓ in safe water | — | — | ✓ |
| Raise an issue in the issue log (with photos; also Procurement Team) | — | ✓ | ✓ | ✓ | — | ✓ | ✓ |
| Resolve an issue and post the resolution (also Procurement Team) | ✓ | ✓ | ✓ | — | — | — | — |
| Record a payment to a beneficiary (date, amount, transaction id) | ✓ | ✓ | ✓ | — | — | — | — |
| Submit vouchers and photos (self-reliance, safe water, Qurbani) | — | ✓ | ✓ | ✓ | — | — | — |
| Submit own operational expense claim and vouchers | — | — | — | ✓ | — | ✓ | ✓ |
| Verify expenses and record payment (bKash transaction id) | ✓ | ✓ | ✓ | — | — | — | — |
| Class attendance and learning updates | — | — | — | — | — | ✓ | — |
| Initial and final exams | — | ✓ | — | — | — | Official দায়ী; Local দায়ী if RPM grants | — |
| Follow-up calls to beneficiaries and call log | — | — | — | — | — | Official দায়ী ✓ | — |
| Add follow-up evaluation after close (PROPOSED) | — | ✓ | ✓ | — | — | Official দায়ী ✓ | — |
| Work summary of staff and volunteers (CSV/PDF) | ✓ | own region | — | — | — | — | — |
| Project dashboard, budget and reports | ✓ | own region | own region | — | — | — | — |

Media, Finance and Procurement Teams do not do project work, so they have no column above; their access:

| Task | Media Team | Finance Team | Procurement Team |
|---|---|---|---|
| View applications and beneficiary data | ✓ | — | ✓ in house construction |
| Create, edit or delete applications | — | — | — |
| Read, write and edit beneficiary stories | ✓ | — | — |
| Collect photos and videos; publication tracker | ✓ | — | — |
| View media-consent status | ✓ | — | — |
| View budget, payments, vouchers and expense accounts | — | ✓ | — |
| Download reports (CSV/PDF) | own part | ✓ | own part |
| Pay or approve money | — | — | — |
| Raise an issue in the issue log | — | — | ✓ |
| Resolve an issue and post the entry | — | — | ✓ |
| Ratings, categories, NID and donor data | — | — | — |

The Media Team changes only its own stories and media content, never project, application or beneficiary data.

#### Permission panel

The matrix is only the default; no permission is hard-coded. The Department Head or Monitoring Team can grant or revoke any responsibility or permission for anyone from a separate permission panel; every change is in the audit log.

#### Role-based work screen ("My Work", PROPOSED layout)

One system, but everyone sees their own work screen after login:

| Role | What they see on login |
|---|---|
| Volunteer | My projects, my applications (draft / pending / approved), today's distribution, my team, notifications |
| Team Member | The main volunteer's projects, own created applications |
| Local দায়ী | My beneficiaries, today's class, attendance, learning progress, pending updates |
| Paid Volunteer | Assigned beneficiaries, current stage, progress updates, issues, photos |
| Official দায়ী | Tracking of Local দায়ীs, exam schedule, call log, follow-up |
| Project Executive / RPM | Applications waiting for review and approval, volunteer assignment, regional progress, edit requests |
| PM | Project setup and templates, program dashboard, budget, deadlines and closing |
| Department Head / Monitoring Team | Central dashboard, monitoring control centre, permission panel, work summaries |

### A5. Registration, profiles and volunteer management

Entry into the system starts with two forms: staff registration and volunteer registration; work is possible only after approval. The volunteer form's fields are below (Q-42); staff registration uses the same form plus post and workplace.

#### Staff registration

Name, photo, contact details, designation, program and region. Approval and role assignment by the Department Head or Monitoring Team.

Amended by the owner on 2026-10-17 (DECISION_LOG D-097): officials no longer register themselves. The Department Head or the Monitoring Team creates the account with the job ID, name, designation, email, mobile, affiliation (the department, another department of the Foundation, or an outside partner), program, division, supervisor and role, and the official sets the password through a single-use link (72 hours, emailed and copyable); afterwards the official logs in with the job ID (or the email or mobile). Only the department's own staff appear in the staff list and the organogram, which is computed by program from roles and supervisors. Volunteer registration below is unchanged.

#### Volunteer registration

During testing (Phases 1–2) the OTP is a dummy: one fixed code, so that registration can be tested without SMS or email services. Before production the real SMS and email gateways are connected and the dummy code is switched off (B9). (Approved by BD-44 and BD-49.)

Registration starts with verification: first mobile number and email, each receives a separate OTP; only when both OTPs match does the rest of the form open. This blocks wrong or fake numbers, and the mobile number later serves as the login id.

| Part | Fields |
|---|---|
| Verification | Mobile number (OTP), email (OTP) |
| Identity | Name, father's name, mother's name, NID number, WhatsApp number, address |
| Education and experience | Highest education, experience, description of work, previous projects worked on |
| Contact | Facebook id |
| Bank details (optional) | Bank name, account name, account number, routing number |
| Reference | Through whom they came (for a team member: the main volunteer's NID) |
| Attachments | Own photo, NID photo |

Bank details are not mandatory but are used when operational expenses are paid (B6). Bank and NID data are sensitive, so only authorized officials see them (B8).

Summary of what the form captures:

- Personal data, photo, NID number, mobile
- Address: division, district, upazila, union (everything is filtered by these later)
- Type: General / দায়ী / Both / Paid Volunteer
- Reference (at the end of the form): for a team member, the main volunteer's NID; when the number matches, the system shows that volunteer's name

(The blueprint places two entity tables here, "documentation" and "latest additions"; they are reproduced in B2 of this specification.)

#### Verification and approval

1. After registration the application is "pending" and appears in the volunteer tab.
2. Any of Project Executive, RPM, PM, Monitoring Team or Department Head can verify and approve from there (Q-19).
3. If a field is wrong (wrong name, missing photo) the whole form is not returned; a correction request goes out for that field only; the volunteer fixes the field and resubmits.
4. When everything is right: approval; the volunteer becomes active.

#### Volunteer tab (central list)

- All registered volunteers in one tab; new registration requests also sit here as pending. Approval or field-level correction requests are sent from here.
- Any official or Official দায়ী sees all volunteers nationwide; filterable by division, district, upazila, union, type, status, project and more.
- Statistics on top: total volunteers, total applications, approved, under review, etc.
- Next to each person: category and rating (officials only) and the work summary (A10); filterable by category and rating.
- Assignment to projects and application work still happens by region (Q-20).

#### Profile rules

- Before approval the volunteer sees only their own profile; the project section reads "You have not participated in any project yet".
- After approval the volunteer cannot edit own data directly; they can send an "edit request".
- The edit request is approved by the RPM or Project Executive, either (Q-09); the field is opened, changed, and locked again.
- Every registration, correction and approval is in the audit log.

#### Assigning volunteers to a project

The core work of a project is bringing applications, and all applications come through volunteers; so the first task after creating a project is adding volunteers. RPMs and officers may also create applications.

- Although the volunteer tab is nationwide, volunteers and applications come into a project by region: when assigning, the RPM sees the approved volunteers of own region.
- Filter by district, upazila, union and assign one or many at once.
- At assignment a permission set is given by volunteer type; the RPM marks paid volunteers as paid here. One volunteer can be assigned to several projects at once; permissions are per project (Q-16).

| Permission set | For whom | What they can do |
|---|---|---|
| Application + distribution | General | Submit beneficiary applications, confirm package receipt, post distribution updates |
| Application + distribution + dawah | Local দায়ী / Both | All of the above plus classes, attendance, learning progress and exam updates |
| Work progress | Paid Volunteer | Stage-based updates and issues for construction or water work; view applications, not edit |

#### Team management (NID reference)

One volunteer cannot do everything alone; they may have a team of 4–5 or 10.

1. A team member registers on the ordinary volunteer form and gives the main volunteer's NID in the reference part. When the number matches, the main volunteer's name is shown.
2. The main volunteer assigned to a project opens "assign team members" and sees everyone who registered with their NID as reference.
3. They select whom they want and add them to this project's team. Both General and Both volunteers can add team members; the same rule in every project (Q-25).

| Task | Main volunteer | Team member |
|---|---|---|
| Create application | ✓ | ✓ |
| Edit application before submission (draft) | ✓ | own created |
| Submit application to the office | ✓ | — |
| Edit and delete submitted (pending) application | ✓ | — |
| View basic data of an approved application | ✓ | own created |

(Q-06: a team member may edit own draft before submission; after submission only the main volunteer.)

#### Volunteer rating and category (officials only)

- Rating criteria: at project creation the PM sets at most 5 criteria (e.g. timely submission, accuracy of data, distribution photos and updates, following the rules); each rated 1 to 5.
- Ratings are per project; the profile shows the ratings of all projects and an average. The system may propose the rating from work data, or an official enters it by hand (Q-32: at project close the system proposes a score per criterion from work data; PM/RPM/Executive finalize, changing it if they wish). The "average" wording versus BD-40 ("never averaged" across kinds of work) is resolved by O-10: averages only within the same kind of work.
- Volunteer category: every volunteer in the list has a category; the list of categories is set by the department (Q-34: A excellent, B good, C weak, D risky, plus a separate "inactive" flag). A category is never automatic: an official sets or changes it by hand and must give a comment; who, when, from what to what, with comment, is logged.
- Ratings, categories and their comments are visible to officials only; a volunteer sees neither own nor others'.

#### Blocklist (volunteer)

- The RPM or anyone above (PM, Monitoring Team, Department Head) can put a volunteer on the blocklist at any time with a written reason; lifting follows the same rule (Q-45).
- A blocked volunteer cannot create new applications, is not assigned to new projects, and can no longer see own earlier applications; on login they see the block message.
- Date, reason, who blocked and who lifted are in the audit log; the volunteer tab has a blocklist filter.
- Their ongoing applications remain as they are; when a new volunteer is added and the applications transferred, the new volunteer manages them (below).

#### Application transfer (change of volunteer)

So that work does not stop when a volunteer is blocked, cancelled or absent:

1. The RPM (or an Executive with permission) adds a new volunteer to the project.
2. The old volunteer's applications, all at once or selected ones, are transferred to the new one.
3. The new volunteer gets exactly the previous full access: view and edit by status, distribution and progress updates, photos, vouchers and expense claims.
4. The old volunteer can no longer see anything of those applications.
5. Who, from whom, when, with whose approval and for what reason is recorded on the application and in the audit log; the beneficiary history is untouched.

The same applies to team members; whether the old volunteer's team moves under the new one is decided by the RPM.

#### Staff exit and handover

When an official (RPM, Executive, Official দায়ী) leaves or is transferred, the account cannot simply be closed; a handover comes first, otherwise their pending work gets stuck:

1. Marking the account "to be deactivated" shows the list of outstanding work: pending reviews and approvals, ongoing projects of their district or region, documents in their name (SOP clause 7.3), issues and follow-ups.
2. A new responsible person is chosen for each item; the whole list can also be given to one person in one click.
3. When the handover is complete the account is deactivated: login is closed, but all their work and audit entries remain (never deleted).
4. A handover record is kept: who took which responsibilities from whom.

For volunteers this is done by application transfer; for officials, approval responsibilities and documents go along as well.

### A6. Program and project setup (project configuration)

The Department Head opens programs and assigns PMs; under each program the PM creates projects. Project setup is the most important configuration screen: what is set here governs the whole project. Creation is a long process, so progress is saved as a draft; when all steps are done the PM activates the project. Only officials see the program list; volunteers see only the project they are assigned to, once it is active.

#### Project configuration structure

| Setting group | What is set | Note |
|---|---|---|
| Basic data | Name, year, program, description, workflow template (distribution / construction / advance + voucher / implementation / Qurbani / open application) | Templates: PROPOSED, B5 |
| Budget | Cost per beneficiary × target beneficiaries = planned budget; in advance-based projects advance and actual expense are separate | B6 |
| Application deadline | Start and end date; after the end date the system accepts no applications; the PM may extend with a reason, logged | |
| Areas and RPMs | A division or one/more districts; an RPM per area. Several RPMs in one division are equal at first; the PM may split districts, giving separate views (Q-08) | |
| Staff assignment | View / edit / delete access for staff under the RPM (by PM or RPM); the RPM has full access | |
| Application form | This project's form in the form builder: field library + custom fields, logic, versions | B3 |
| Rules and consent | Four parts (below); a volunteer enters the project only after reading and accepting | |
| Dawah | Dawah Enabled = yes/no; if yes, the syllabus topic list | A9 |
| Photo rule | Group / individual / both; no distribution is "completed" without photos (Q-12) | |
| Rating criteria | At most 5 criteria for volunteer rating, each 1–5 | A5 |
| Limits and stages | Application limit per volunteer (e.g. 50; no way to take more), names and order of work-progress stages (house, water), application types (tree planting) | |
| Follow-up schedule | Follow-up is continuous: no fixed schedule or reminders (decided, Q-33) | Q-33 |

#### A project is a combination of reusable components

How a project runs today may differ next year. Therefore projects are not coded individually; a project is built by switching small components on or off and setting them. Components are reused across projects, so a new project type needs no new code and old projects do not break. (Approved by BD-09.)

| Component | What it brings when enabled | Used today in |
|---|---|---|
| Application form (section selection) | Sections and fields from the form builder; versioned | All projects |
| Public application link | Anyone can apply without a volunteer; enters the system after verification | Tree planting; any project if wanted |
| Volunteer assignment and application limit | Region-based list, per-volunteer limit, team members | All projects |
| Dispatch and receive confirmation | Goods sent by courier/to the spot, volunteer confirms receipt, distribution date | Winter clothing, iftar, Qurbani, saplings |
| Distribution and photos | Distribution updates; group or individual photo rule | Distribution projects |
| Site verification (field visit) | Visit by volunteer or official, comment, photos and recommendation | Tree planting, self-reliance, house construction |
| Stage-based work progress | Updates and photos along stages written by the PM | House construction, safe water |
| Issue log | Report problems (with photos), assign, resolution updates | House construction |
| Dawah (classes and attendance) | Syllabus, today's class, attendance and absence reasons, learning progress | Self-reliance, house construction |
| Exams | Initial and final exams; next step based on the result (e.g. payment) | Self-reliance |
| Beneficiary payment | Date, amount, method and transaction id stored with the application | Self-reliance, safe water |
| Materials purchase and placard photo | Proof of purchase, photo of the beneficiary with materials | Self-reliance |
| Voucher submission and verification | Voucher upload, official verification, then lock | Self-reliance, safe water, Qurbani; optional in house construction |
| Volunteer operational expenses | Itemized expense claims (decoration, transport, food, photocopy, banner), vouchers, verification and bKash payment | Almost all: winter, iftar, Qurbani, tree planting |
| Donor and animal management | Donor import, animal numbers from donor data, manual animal allocation on the volunteer profile, SMS/email, photo sending | Qurbani |
| Follow-up evaluation | Continuous checks and evaluations after close, as often as needed | Self-reliance, house construction |
| Rating criteria | Volunteer rating on at most 5 criteria | All projects |

(The document checklist is also a project component; see A10.)

#### Project templates (decided, Q-38)

When creating a project both options exist:

1. **From a master template** — a standard mould per project type (winter clothing, iftar, meat distribution, Qurbani, self-reliance, house construction, safe water, tree planting). Templates live separately; a change in one year's project does not change the template.
2. **Copy from a previous project** — e.g. "Winter Clothing 2026" → "Winter Clothing 2027".

In both cases the new project receives an independent copy of the setup: later template changes do not affect old projects. An active or finished project can also be "saved as template", keeping a good setup for next year.

| Copied | Not copied |
|---|---|
| Component list and settings | Application and beneficiary data |
| Form sections, fields and logic (as version 1 in the new project) | Budget amounts |
| Workflow stages and photo rule | Dates and deadlines |
| Rating criteria, issue types, expense categories | Volunteer assignments |
| Dawah syllabus | Ratings, categories and logs |

Templates can be created and edited by everyone with project-creation access (PM, Department Head, Monitoring Team); who changed what and when is in the audit log.

Rule: no component is hard-coded. Stage names and order, statuses, form sections, photo rules, issue types, expense categories: all are data. In a new project the PM only chooses components and settings; the developer writes no new code (B5, Q-35 and Q-38).

#### Rules and consent

At project creation four texts are written: volunteers' duties and responsibilities; implementation process; Local দায়ীs' duties and responsibilities; what action is taken against anyone involved in dishonesty or irregularity. Before entering the project the volunteer reads each part, accepts and goes Next; at the end ticks "I agree and am interested in working in this project" and confirms. On reject they get no project access and remain pending. Who consented when is logged.

#### Budget and accounts (summary)

At project creation the total budget is set from cost per beneficiary and number of beneficiaries: e.g. one winter package 1,000 taka, 100 people → total budget 100,000 taka (Q-24). The system shows how many people were served and how much was distributed (beneficiaries with completed distribution × cost per beneficiary) and how much remains. In projects where money is sent to the volunteer (safe water) the advance sent and the actual expense from submitted vouchers are kept separately; self-reliance and Qurbani vouchers also enter the accounts. The bucket model is in B6.

#### Templates and yearly copies

Projects are run anew every year, so a new project is created every year. "Copy from previous project" copies name, application form, rules, syllabus, budget settings and other settings; beneficiary applications are collected afresh. This copy feature is the basis of the project-template system (Q-38): new-year projects for winter clothing, iftar, self-reliance, house construction, safe water and Qurbani come from templates; the PM changes only year, budget, areas and dates.

#### Project lifecycle: Draft → Active → Closing → Closed

- Draft: setup in progress; saved, volunteers do not see it.
- Active: applications, review, approval and activities run.
- Closing (adopted by O-12): new applications stop; remaining work, photos and voucher verification are finished; unfinished applications are listed as a warning (O-49).
- Closed: only the PM can close (approved by BD-20). All activity stops: no new application, edit, delete, distribution or progress update; everything read-only; dashboards and reports still viewable and downloadable. Every unfinished application moves to Closed with its prior state kept in the history, and a reopen restores it (O-49). Only beneficiary follow-up evaluations can still be added, as often as someone checks; each evaluation records date, who checked, method (visit/phone), result and comments, photos; stored on the beneficiary profile. For self-reliance, for example: has the business started, current income, is the business running, profit, main problem (adopted by O-23 as the editable default template).
- Who closed when is logged; a wrong close is undone by a controlled reopen with a reason, logged (Q-33, approved by BD-20).

### A7. Application and approval workflow

Every application passes through a fixed status cycle; as the status changes, so does who may do what. There is no separate "needs correction" step before approval: during review the official may edit the whole form (Q-05). The common cycle below is the same in every project; the steps after approval differ per workflow template (A8, B5).

| Status | Meaning | Who may do what |
|---|---|---|
| Draft | Created by the volunteer or team member, not yet submitted; if created offline it is saved on the phone and synced when the network returns | Main volunteer: edit, delete, submit; team member: edit own created application |
| Needs verification | Offline NID collision or public-link entry waiting for an official to link the profile (BD-48, O-08) | RPM or Executive of the region: link or reject with reason; volunteer: view status only |
| Pending (Submitted) | Sent to the office, review not started | Main volunteer: edit and delete |
| Under review | An official is verifying | Official: verify and edit the whole form if needed; volunteer: view only |
| Awaiting approval (Reviewed) | Review done, sent to the approver | RPM (PM in house construction) or staff with approval permission: approve or reject |
| Waitlisted | Reviewed but over quota (BD-17) | Approver: pull from the waitlist in one click or reject with reason |
| Approved | Final; data locked | Volunteer: view basic data only; corrections only by field unlock |
| Rejected (PROPOSED; approved by BD-11) | Not accepted, with reason | View only |
| Implementation / Distribution in progress (PROPOSED; approved by BD-11) | The project's activity stage: package receipt, construction stage, payment, etc. | Volunteer / paid volunteer / official per template |
| Completed (PROPOSED; approved by BD-11) | Support delivered, photos and vouchers verified | View only; add follow-up |
| Closed | When the project closes, every application is read-only; unfinished applications keep their prior state for a reopen (O-49) | View only; follow-up evaluations |
| Deleted | Draft or pending application removed by its owner before review | No access; kept for audit |

Diagram image3: main cycle top to bottom; two branches on the right: reject instead of approve, and the field-unlock loop after approval. The steps after approval (implementation, completed) follow the project's template.

#### Review and approval permissions

Review is done by the Project Executive or anyone in the RPM's team to whom the RPM gives review permission (Q-04). After review the application goes to the RPM; in house construction the PM gives final approval. The RPM may at any time give approval permission to anyone in own team; who approved is logged.

#### Field unlock and change control

When new or updated data is needed after approval, the official opens only that field for the volunteer → the volunteer updates → the official verifies and approves → the field is locked again. For sensitive fields (name, NID, mobile, address, approved amount, approval date, vouchers, distribution status) every change is recorded: old value, new value, who requested, who approved, reason, time. Once the project is closed, no field unlock is possible either. (Approved by BD-18.)

#### Priority score, quotas and waitlist

When more applications arrive than the target (e.g. 60–70 in one district for house construction) selection used to be manual. In the new system selection is transparent and explainable in audit, but the decision stays with people (approved by BD-17):

1. **Priority score (set at project setup)**: the PM decides how many points each data item carries and it is stored in the template. Example (winter clothing): low daily income up to 30, more family members up to 20, class (widow, disabled, elderly) 20, not previously assisted 20, housing type 10. As soon as an application is submitted the system assigns a score out of 100.
2. **Quota**: the review screen sorts applications by score and shows district- and union-based quotas (e.g. target 50 in this union, 72 received) so that one area does not take everything while another stays empty.
3. **Three outcomes**: approved / waitlist / rejected (with reason). A decision against the score requires a comment so the reason can be seen later.
4. **Using the waitlist**: when someone drops out, goods are left over or someone is absent on distribution day, the next person is pulled from the waitlist in one click. Those who did not receive by project end get "not previously assisted" points in next year's project.

The score never approves or rejects anyone by itself; it only sorts and recommends.

#### Beneficiary 360° profile and beneficiary tab

Every beneficiary has one permanent profile based on NID or birth registration (B3). Opening it shows the whole lifecycle in one place:

- Basic data and address; project list (e.g. Iftar 2025, Winter 2025, Qurbani 2026, Self-reliance 2026); what support in which year
- Application history: who brought it, who reviewed and approved, when
- Distribution and implementation progress, photos, vouchers, documents
- Dawah: classes, attendance, learning progress, initial and final exams; the Official দায়ী's call log
- Follow-up evaluations (continuous) and activity history

This "beneficiary journey" is the department's most valuable report: who was identified when → what support → dawah or not → what the follow-up found. Like the volunteer tab there is a beneficiary tab: nationwide list of all beneficiaries, every filter and statistic; any profile opens from there.

#### Blocklist (beneficiary)

- The RPM or anyone above can put a beneficiary on the blocklist with a written reason (e.g. false information, repeated irregularity).
- When blocked, no new application in any project is accepted with their NID or birth registration; the form itself shows the volunteer a message.
- Reason, date and who blocked are logged; filter in the beneficiary tab; lifting with reason is possible.
- Reason and comments are visible to officials only, not volunteers.
- Earlier approved or ongoing applications continue unchanged; only new applications stop. (Approved by BD-06.)

#### Duplicate checks and profile merge

One NID never creates two profiles, but two kinds of duplicates remain in practice, so there are two separate mechanisms:

- **Several applications from one family**: in the same project, when an application's address (union and village), father/husband name or mobile number matches an existing beneficiary, the system warns at review: "A member of this family already exists — [name, BEN-ID]". The application is not rejected automatically; the official decides and writes a reason. No separate family id is kept. (Approved by BD-04.)
- **Two profiles for one person**: when someone applied once with birth registration and later with NID, or a typo in the number, two profiles may exist. For this officials have **profile merge**.

Merge rules (PROPOSED; approved by BD-05):

| Step | What happens |
|---|---|
| Suspicion | The system finds matches and lists them: name + father/husband name + mobile; or name + date of birth + union; or several profiles on one mobile. An official can also request a merge of two BEN-IDs |
| Verification | Both profiles side by side (data, photo, application history); the official chooses which one stays |
| Merge | All applications, support, dawah, photos and follow-ups of both are combined on the kept profile; both NID and birth registration stay on it (searchable by either number); the retired BEN-ID is not deleted but points to the kept profile so old reports do not break |
| Log | Who, when, which two profiles, why: all in the audit log; the Monitoring Team can revert a wrong merge |

Merge by PM, Monitoring Team and Department Head; the RPM can propose. NID format 10/13/17 digits and birth registration 17 digits are validated in the form so typos are caught early (approved by BD-01).

### A8. Project-type workflows

The common application and approval cycle (A7) is the same in every project; the steps after approval differ. At project creation a workflow template is chosen (PROPOSED, B5; approved by BD-11):

| Template | Projects | Steps after approval |
|---|---|---|
| Distribution | Winter clothing, iftar, Qurbani (beneficiary side) | Package sent → received → distribution and photos → completed |
| Construction | Semi-pucca and tin houses | Paid volunteer and Local দায়ী appointment → stage progress (e.g. foundation, walls, roof) → final photo → completed |
| Advance + construction + voucher | Safe water | Money sent → work started → stage progress → photo of the tube well → vouchers and accounts → verification → completed |
| Implementation + evidence + follow-up | Self-reliance | Purchase → vouchers and placard photo → approval (lock) → dawah → follow-up |
| Beneficiary + donor + animal | Qurbani | Distribution template plus donor import, animal allocation, SMS/email, photos, vouchers |
| Open application + visit | Tree planting | Public form → verification → visit → distribution and photos |

#### A8.1 Winter clothing, iftar and meat distribution (distribution-based)

1. Project setup decides which volunteers work this time; they are told the instructions, the application limit (e.g. 50) and the deadline. When the limit is full or the end date has passed the system accepts no more applications (unless the PM extends the date). (Approved by BD-16.)
2. The volunteer submits applications on the project form; the office reviews, corrects if needed, then approves.
3. Goods for the approved number are sent to the volunteer's courier spot; on receipt the volunteer confirms "received" and the distribution date is set.
4. Distribution happens on the set day; the volunteer posts updates and photos together from the "today's distribution" screen. The number served goes to the beneficiary profiles and the project budget.
5. Finally the accounts: the volunteer submits own operational expenses (decoration, vehicle hire, food, document photocopies, banner printing, etc.) by category with vouchers; after an official verifies and approves, money is sent by bKash and the payment date, amount and transaction id are recorded (B6).

The photo rule is set at the start of the project because it depends on how distribution happens: door to door needs a separate photo per beneficiary; when everyone is gathered in one place a group photo is enough and nobody's individual photo is needed. The system asks for photos by the setting and shows no distribution as "completed" without them. Each photo stores capture date-time and GPS (when taken from the app), and when the same photo is uploaded a second time the system warns, so old photos cannot be reused. (Approved by BD-21; photo source setting UX-11.)

#### Stock reconciliation (every distribution project)

Not an inventory module; a simple project-level account, and the first thing asked in an audit:

| Cell | What | Who enters |
|---|---|---|
| Sent | How many packages/saplings/animals were sent to which volunteer | Office (RPM/Executive) |
| Received | How many they confirmed receiving | Volunteer |
| Distributed | How many beneficiaries received | Volunteer (today's distribution screen) |
| Remaining and damaged | How many remained, how many were damaged or short, what was done | Volunteer; officials verify |

If sent ≠ distributed + remaining + damaged the project cannot be "completed"; a difference needs a written reason and raises an alert in the monitoring control centre. In Qurbani the count is animals, in tree planting saplings. (Approved by BD-22.)

#### Edge cases on distribution day

They happen in almost every project, so "completed" and "not received" must not be confused (approved by BD-23):

| Situation | What happens in the system |
|---|---|
| Beneficiary did not come | Marked "not received — absent" with reason; the package returns to remaining |
| Came later and received | "Later distribution" with date on the same application; no new application needed |
| Could not be found again | Closed as "not distributed" at closing; no cost charged to the budget |
| Goods ran short | Those who did not receive stay on the waitlist; the shortage appears in reconciliation |
| Goods damaged or lost | Number, reason and photos in the "damaged/lost" cell; monitoring alert |
| Received partially | Tick what was received; the rest can be given later |
| Beneficiary died or left the area | Profile status changes; in long projects such as house construction the PM decides, with reason, whether a family member receives instead |

#### A8.2 House construction (semi-pucca and tin houses)

1. Applications can be brought by volunteers and by any assigned official; e.g. 60–70 applications in one district.
2. After screening, specific beneficiaries are selected and the rest rejected with reasons; in this project the PM gives final approval.
3. For the selected houses an area-based দায়ী is appointed (e.g. one per 10 houses), who teaches classes like in self-reliance and posts daily updates (A9).
4. Per district 2–3 paid volunteers are appointed; they visit beneficiaries' homes daily and post two kinds of data: (a) work progress: materials arrived, earth filling done, roof cast, etc., stage by stage with photos; (b) issue log: materials stolen, mason not coming, etc., with photos if possible.
5. Issues are seen by officials and the Procurement Team; they resolve and post the resolution in the system so everyone in the field sees it. The Procurement Team may only view applications, not edit or delete; but they may raise issues themselves and post resolutions.
6. After construction a photo of the beneficiary with the house is taken. A voucher field may exist but is not mandatory in this project.

Paid volunteers can see all applications, edit nothing. Local দায়ী and paid volunteer may be the same person; then they see both sections, otherwise each sees only own section. (Approved by BD-24, BD-25.)

#### A8.3 Self-reliance (স্বাবলম্বী) project

1. Volunteer selection and assignment; applications submitted by volunteers, officials may also bring them. The form contains a zakat assessment part (Appendix B): the system computes net assets, compares with the nisab and shows a proposal; the আলেম (Official দায়ী) finalizes. The nisab value is set by the PM or above and the value at verification time is saved with the application, so later nisab changes do not affect old applications. (Q-29, Q-30; approved by BD-28.)
2. The office reviews, makes a field visit if needed, then approves or rejects.
3. After approval the volunteer starts classes. Not only the beneficiary but the whole family receives religious education; at many spots female দায়ীs serve female beneficiaries.
4. At the end of the day everyone posts updates: who was present, who absent and why, what today's attendees learned (A9).
5. Exams before and after the classes; taken by the Official দায়ী.
6. Money is sent according to the list of those who passed; date, amount and transaction id are stored with the application. (Approved by BD-27.)
7. With the money the volunteer buys the beneficiary's materials, sends a photo of the beneficiary with placard and materials, and submits all vouchers; officials verify. After verification photos and vouchers can no longer be changed or deleted.
8. The Local দায়ী's work is as in house construction; volunteer and দায়ী may be the same person (type Both). After project close, follow-up evaluations show the outcome of the support (A6).

#### A8.4 Safe water project

Stage-based like house construction, but here ordinary volunteers do the work (paid volunteers, if any, at the same stages); the PM writes the names and order of progress stages at project creation.

1. The volunteer applies with detailed data: where, for whom, why a tube well is needed. (Q-22)
2. The application is verified and approved in the main cycle.
3. After approval the office sends money to the volunteer; how much and when is recorded on the application and in the budget's advance bucket.
4. The volunteer posts regular progress updates along the configured stages.
5. At the end the volunteer submits the tube-well photo, vouchers and the full account; when an official verifies and approves, the work is "completed", photos and vouchers lock; the voucher amount enters the accounts as actual expense and the rest of the advance as returned.

#### A8.5 Tree planting project

1. Applications are taken on a public link, an open form without a volunteer (Q-10); two types: for educational institutions and for personal gardens (sometimes there may be no garden).
2. A volunteer of that area is set for verification; they visit the garden, write a comment, send garden photos and recommend approval or rejection (with RPM permission they may decide directly).
3. The responsible official sees the verification and photos and approves, re-reviews or rejects.
4. Saplings are sent; the responsible volunteer updates receipt and which day saplings go where.
5. Photos after distribution: group photo at institutions, garden photo with placard for personal gardens.
6. The volunteer's expense statement and vouchers → official verification → bKash payment → the PM closes the project.

#### A8.6 Qurbani project

The most challenging project because two sides run together. The beneficiary side is like winter clothing and iftar (A8.1, same form). In addition, donor and animal management:

1. First fund collection, alongside the list of which volunteers work this time. Each volunteer is told their cow or goat number and the Qurbani place, and asked to submit beneficiary applications on the distribution form.
2. Donor data comes from two sources, merged by the system into one list: (a) SSL's Excel or sheet: transaction id, name, phone, email, amount, cow shares, goats; (b) the system's own form for cash or non-SSL donors (previously a Google Form): name, mobile, email, amount, purpose, approval status, approver, comment, cow shares and goat count. Excel column format: Q-11 (import format as last year's sheet). (Approved by BD-32.)
3. The animal list is generated from donor data: cow numbers and share descriptions by share count (e.g. "Cow-3: 2 shares"); when 7 shares are full the cow's status is "full"; goat numbers come the same way. This whole account used to be done in Google Sheets. (Approved by BD-33; goat share model decided by O-19: a goat is one whole animal.)
4. Animal allocation is not automatic; officials do it by hand: on the volunteer's profile the animal number is entered (e.g. Cow-3 on Abdur Rahim's profile). One person may get several cows; for goats one, two, three or four, as many as needed. (Q-47)
5. Once an animal is assigned to someone it cannot be given to anyone else; it shows as allocated in the list and becomes free only when the allocation is cancelled, so one animal is never given to two people.
6. Every cow and goat carries the responsible volunteer's name, mobile and Qurbani spot (district, upazila, union); the donor is also matched to the animal number, so whose share is in which animal and in whose hands is seen on one screen.
7. When allocation is final, donors receive a pre-SMS or email; who was notified is marked in the list (gateway: Q-11).
8. On Qurbani day three kinds of photos per animal are uploaded: animal, meat and packet. The system emails them to the donor and keeps a "sent" status. (Approved by BD-34.)
9. The beneficiary side is like winter clothing and iftar (A8.1): same form, approval, meat distribution and photos.
10. Finally the volunteer submits all expenses and vouchers; after verification payment is made and enters the project budget and accounts.

### A9. Dawah module (optional project component)

Not every project has dawah; when Dawah Enabled = yes in project setup, syllabus, classes, attendance, learning progress, initial and final exams, call log and follow-up are enabled. Two kinds of দায়ী (A2): the Local দায়ী teaches and posts daily updates; the Official দায়ী takes exams, watches how many classes happen (the system counts) and follows up beneficiaries by phone.

Not only the beneficiary but family members attend; so attendance and learning progress may be kept for family members too (decided by O-11: attendance may be recorded for family members). At many spots female দায়ীs serve female beneficiaries, so at assignment it can be set which দায়ী sees which beneficiaries. (Approved by BD-26.)

#### Progress tracking by syllabus

- The list of learning topics is set at project creation (e.g. rules of salah, rules of wudu, memorizing 4 surahs).
- In each class the Local দায়ী takes attendance and selects from the list what each beneficiary was taught today; for absentees a reason is written.
- Each topic has two states: "in progress" or "learned". In progress can be selected again in the next class; once learned, the topic no longer appears as an option, the others do.

#### Bulk update: today's class / today's work

Updating each beneficiary's profile separately is cumbersome. So one "today's class" screen: all beneficiaries under the দায়ী in one list with the latest progress; next to each, present/absent and today's topic and state; one save updates every profile and writes the log. Paid volunteers' construction progress, volunteers' distribution, visits and follow-up updates follow the same pattern (B5).

#### Exams

- Two exams: initial and final. Official দায়ীs take them; the RPM may give Local দায়ীs the exam duty.
- The two results are shown side by side: how much each person improved; PDF download by beneficiary, দায়ী or area. In projects like self-reliance the payment step starts from the list of those who passed (A8.3).

#### Official দায়ী's tracking view and call log

The Official দায়ী sees on one screen, for every Local দায়ী in their area, the date of the last class update, number of classes held, how many beneficiaries have progress entries; an alert when there has been no update for a long time. When calling a beneficiary they keep a call log: date, duration, topic, comments; the log appears on the beneficiary profile and in the দায়ী's work summary.

#### Dawah dashboard

How many learned which topic, total classes, attendance rate, regularity of Local দায়ীs, exam comparison (A11); each beneficiary's own classes and progress on their profile.

### A10. Monitoring control centre, audit log, documentation and media

Monitoring is not just reports; it is an operational control centre: the system itself records every step and shows, as alerts, where work is stuck or rules are not followed; no separate report has to be requested.

#### Control centre screens

- Project progress: target vs applications, reviewed, approved, distributed or completed; budget vs expense.
- Stuck work: which application has been waiting for review or approval for how long, with whom.
- Regularity of Local দায়ীs and volunteers: last update, number of classes, attendance rate.

| Automatic alert | When | Status |
|---|---|---|
| Review pending | Application under review longer than N days | PROPOSED (days in settings) |
| Approval pending | Review done, approval pending longer than N days | PROPOSED |
| No update for a long time | Updates from a দায়ী, volunteer or paid volunteer have stopped | Decided |
| Distribution without photo | Marked distributed but no photo | Decided |
| Budget nearly exhausted | Use above a set percentage (e.g. 90%) | PROPOSED |
| Incomplete activity | A stage started and not finished for many days | PROPOSED |
| Inactive volunteer | Assigned but no work | PROPOSED |
| Implementation delayed | Behind the planned time | PROPOSED |

The system refuses applications beyond the limit, so no alert is needed for that. (Alert list approved by BD-42; thresholds decided by O-04.)

#### Audit log

Every step is logged permanently: who, when, what (create, edit, status change, approve, delete, field unlock, permission grant, category change, close). The log is never deleted; it can be viewed and downloaded by project, beneficiary or person. Record structure in B8.

#### Work summary per staff member and volunteer

Opening any volunteer's or official's profile, the Department Head or Monitoring Team (and officials with permission) see at a glance what the person does and how much: how many applications brought per project, reviewed or approved, how many distributions, classes or calls, last work date, how long each task took (e.g. days from application receipt to end of review). Filterable by year, project and date range; exportable to CSV and PDF. (Approved by BD-41.)

#### Documentation

The department has its own documentation SOP (version 2.3, September 2026). The ERP digitizes that SOP so that no paper has to be searched at audit time and it is always visible which document is pending with whom.

**Project document checklist** is a project component (A6): per SOP clause 5, the list of documents each project needs is in the template and copied into new projects. Each row: document name, requirement (required / if needed / not required), responsible designation, submission deadline, status, soft-copy file, hard-copy location code.

Submitting documents is entirely the responsibility of officials (PM, RPM, Project Executive, the safe-water Implementer). Volunteers have nothing to do with it: they submit nothing to the document register and cannot see it. Hence the soft-warning and non-compliance policy of SOP clause 6 applies only to officials; it never affects volunteer ratings or categories (A5). Photos, vouchers or forms from the field are submitted by volunteers with the application; they are part of project work, not a separate register submission; officials attach them to the register as needed. (Approved by BD-35, BD-36.)

| SOP clause | How it appears in the ERP |
|---|---|
| 3 · Designations (PM, RPM, Implementer) | Match the A4 roles: RPM = Regional Program Manager; the safe-water "Implementer" is the responsible person assigned on the project |
| 4 · Document chain | Each document has its own status: collected → verified → approved → archived; who moved it to which step, when, is logged |
| 5 · Project checklist | Part of the project template; the lists for the seven projects are pre-seeded |
| 6 · Deadlines and non-compliance | Every document has a due date; when it passes, the responsible person gets a soft-warning notification and a 3-working-day countdown; alert in the monitoring control centre |
| 7 · Deficiency management | Deficiency report form (the 11 items of SOP 7.4) and a central log; a second report on the same person within a year is escalated automatically to a superior's review; legacy deficiencies marked separately |
| 8–9 · Archiving and coding | Every document has a hard-copy location code (e.g. CSS-ALM-1-2-3-01, CSS-LKR-4-1-2-02) and a 5-year retention computed from the submission date |
| 10 · Cloud folder | Soft copies in the same structure: program → project → year → district; the system places uploads on this path |
| 11 · Tracking sheet | No separate sheet: the document register holds all sheet columns, with Excel/CSV export |
| 12 · Media consent | Adopted: consent status and allowed channels on the beneficiary profile; without consent a photo does not enter the "publishable" list |
| 13 · Quarterly audit checklist | One-click audit report: pending documents, on-time submission rate, deficiency report summary, hard copies past 5 years |

Per SOP clause 7.1 the legacy (pre-SOP) document audit can also be recorded: recoverable / not recoverable mark and an attached "deficiency acknowledgement note"; the non-compliance policy does not apply to these. (Approved by BD-37, BD-38, BD-39.)

#### Media Team

The Media Team keeps a tracker of which stories are being worked on, which are in progress, which are done and which were published. Each story: title, related project and beneficiary, responsible member, status (planned / in progress / done / published), publication channel and date.

Owner decision D-101 (2026-10-18, replacing O-28): the Media Team's work starts with a referral. A PM (own program) or an RPM (own region) refers an approved application as publishable, with a priority (high, normal, low) and a note; the beneficiary must have a recorded media consent (BD-38, O-17). The Media Director or the Media Assistant Director accepts the referral, sends it back for review with a comment or rejects it with a reason; a returned or rejected referral may be corrected and sent again. On a referred application the team sees the beneficiary's name, mobile number, full address, occupation, program, the official's comment and the story (BR-265). An accepted work moves through editable stages (accepted, planning and assignment, script, shooting preparation, shooting done, editing, internal review, ready to publish, published, done; in review, cancelled and on hold as special states), has an optional script with the states draft, in review and final, members with production roles (Production Manager, Director, Scriptwriter, Cinematographer, Video Editor, Production Assistant; one person may hold several), a content type (video, photo, both) and publications on one or more platforms (As-Sunnah Foundation Facebook, Ahmadullah Facebook, As-Sunnah Foundation YouTube, Ahmadullah YouTube), each with its state, date, link and note; each platform maps to a consent channel of O-17, and publishing needs the consent for it. Photo files are not stored for media content; videos open by link. The media status sits beside the application and never changes its workflow state (BD-11). The team's home shows counts by program and overall and the works list; every member has a profile with a portfolio; a published or done work appears on the beneficiary's profile and on the portfolio of each member. The stages, roles and platforms are reference lists in admin settings. Built in Phase 2 as task T2.8b.

### A11. Dashboards, reports and downloads

Four levels of dashboards: project, program, central and dawah; with charts and cards, interactive filters by year and area; everyone sees data within own scope.

| Dashboard | Shows | Filters |
|---|---|---|
| Project dashboard | This project's beneficiaries, application statuses, distribution or work progress, volunteer and team counts; budget: planned, distributed, remaining | Year, division, district, upazila, union |
| Program dashboard | Summary of all projects of the program: which year, which division, what was done; budget and expense per project, project comparison | Year, project, area |
| Central dashboard | Combined picture of all programs; KPI list below (PROPOSED) | Year, program, area |
| Dawah dashboard | Classes, attendance, learning progress, regularity of Local দায়ীs, initial vs final | Project, area, দায়ী |

#### Proposed KPIs of the central dashboard (Q-13, Q-41: start with these seven groups; approved by BD-43)

- Total beneficiaries (unique BEN-ID) and total applications: by year, program, project, division, district
- Application funnel: submitted → reviewed → approved → completed; average time per step
- Budget: planned, distributed/spent, remaining; program and project comparison
- Volunteers: active count by region; category and average rating (officials only)
- Dawah: classes, attendance rate, initial vs final improvement
- Follow-up: how many beneficiaries were checked on, result summary
- Alerts: stuck work, distribution without photo, inactive volunteers

#### Statistics everywhere

Every list and screen (including the volunteer and beneficiary tabs) carries its statistics: how many beneficiaries, how many districts, upazilas and unions, how many volunteers, how many applications in which status, and whatever else can be shown.

#### Downloads

- All form data (including forms filled by volunteers) as Excel/CSV and PDF.
- Any filtered list as Excel/CSV; beneficiary profile (360°), exam comparison and work summary as PDF.
- Qurbani donor list imported from Excel and exported to Excel with animal allocations.

---

## Part B — System and technical architecture

### B1. Architecture overview and core modules

From the development side the system is divided into 10 core domain modules; notifications, documents and media are shared services. Each module implements the Part A chapters listed.

| # | Core module | Main work | Part A |
|---|---|---|---|
| 1 | Program & Project | Programs, project setup, templates, areas and RPMs, rules, deadlines, closing | A2, A6 |
| 2 | Beneficiary | Central beneficiary master (BEN-ID), mobile matching, 360° profile, beneficiary tab | A7, B2 |
| 3 | Volunteer | Registration, approval, assignment, teams, ratings and categories, volunteer tab | A5 |
| 4 | Application & Form Platform | Dynamic forms, form versions, applications, answers, public form (tree planting) | A7, B3 |
| 5 | Workflow & Approval | Configurable statuses, review, approval, rejection, field unlock and change log | A7, B5 |
| 6 | Project Activities | Activity engine: distribution, construction, payments, vouchers, visits, follow-up; bulk updates; Qurbani donors and animals | A8, B5 |
| 7 | Dawah | Syllabus, classes, attendance, learning progress, exams, call log | A9 |
| 8 | Budget & Project Accounts | Planned budget, buckets (advance, actual expense, vouchers, returns), ledger | A6, B6 |
| 9 | Monitoring & Follow-up | Control centre, alerts, work summaries, follow-up evaluations | A10, A6 |
| 10 | Reports & Audit | Four-level dashboards, exports, audit log | A11, B8 |
| — | Shared services | Notifications (app, SMS, email), document/file storage, media tracker, locations master, i18n (Bangla/English) | A10 |

#### Layering (PROPOSED)

One web ERP on desktop and mobile (PWA) → API layer (permission and scope checks, validation) → domain services (workflow engine, activity engine, form engine, budget ledger, notifications) → PostgreSQL (relational tables + JSONB) and file storage (photos, vouchers, documents). Every write goes to the audit log.

### B2. Data model and relationships (diagram image4)

| Entity | Main fields | Relationships and rules |
|---|---|---|
| programs | id, name, pm_user_id | One program has many projects |
| projects | id, program_id, year, status (draft / active / closing / closed), template, budget_planned, apply_from, apply_to | The centre; all operational data sits under a project |
| project_settings / project_areas | rules, consent, syllabus, photo_rule, limits, stages, rating_criteria, followup_schedule; division/district, rm_user_id | Project configuration (A6) |
| beneficiaries | id (BEN-ID), nid / birth_reg (unique), name, father/husband, mobile, dob, gender, address ids, gps, photo, blocked | Permanent master; NID or birth certificate unique and the basis of the profile; mobile may change |
| volunteers | id, user_id, mobile (unique), nid, type, status, category, reference_nid | Master; type: general / daee / both / paid |
| project_volunteers | project_id, volunteer_id, region, permission_set, is_paid, consent_at | One volunteer in many projects; project-based permissions |
| volunteer_teams | lead_volunteer_id, member_volunteer_id, project_id | Teams by NID reference |
| forms → form_versions → form_sections → form_fields → field_options | project_id, version_no, published_at; field_key, type, required, logic (JSONB) | A change to a published form creates a new version |
| applications | id, project_id, beneficiary_id, form_version_id, submitted_by (volunteer), status, approved_by, approved_at | Project transaction; one per beneficiary per project |
| application_answers | application_id, field_id, value (JSONB) | Answers to custom fields; no new columns |
| workflow_templates / workflow_transitions | template, from_state, to_state, allowed_roles, condition | Configurable workflow (B5) |
| project_activities | application_id, type (distribution / construction / payment / voucher / visit / follow-up …), stage, status, photos, done_by, done_at | Activity engine |
| budget_ledger | project_id, application_id (optional), bucket, amount, voucher_id, created_by | Bucket-based accounts (B6) |
| dawah_classes, class_attendance, learning_progress, exams, call_logs | application_id, daee_id, date, topic_id, status; exam_type, score; call duration, topic, remarks | When Dawah Enabled |
| followup_evaluations | beneficiary_id, project_id, done_at, by, method, result, remarks, photos | Writable after close |
| field_changes | entity, entity_id, field, old_value, new_value, requested_by, approved_by, reason, at | Field unlock and change control |
| audit_log | who, when, action, entity, entity_id, old, new, reason, ip/device | Permanent, never deleted |
| donors, animals, animal_shares | donor info, amount; animal no, type, spot; share allocation, volunteer_id | Qurbani |
| locations | division → district → upazila → union → ward (ward dropped by O-09: four levels) | System master, cascading |

Physical names: this section keeps the blueprint's entity names because it translates the blueprint. The logical model with physical names (for example `activities` for project_activities, `workflow_definitions` for workflow_templates, project_settings folded into `projects` and `project_components`) is `docs/database/ERD.md`, whose section 19 maps every name.

Note on the diagram: image4 marks `mobile*` as unique on both volunteers and beneficiaries. For beneficiaries this contradicts B3 (end), Q-21 and BD-01; resolved by O-02: the beneficiary mobile is not unique (warning only). The locations row's ward level is dropped by O-09 (four levels, managed from the admin panel). BEN-ID is a UUID v7 by O-03.

#### Key rules

- Beneficiary master and project application are separate entities; each application is bound to one project, one beneficiary and one form version.
- The same person applying in four projects gives four applications, one profile; reports count unique beneficiaries and total applications separately.
- Standard identity, address, family and income fields are columns of the beneficiary table (fast filters and reports); project-specific custom answers go to application_answers (hybrid model, B3).
- Primary keys are system ids (UUID/BEN-ID); unique index on NID and birth registration, so one person never has two profiles. Since a mobile number can change it is not an identity key, only contact data.

#### Additional entities for the new processes

| Entity | Main fields | Purpose |
|---|---|---|
| project_components | project_id, component, enabled, settings (JSONB) | Which components are enabled in a project and their settings (A6); a new project type adds rows, not code |
| form_sections | form_version_id, name, order, visibility (volunteer / official only), condition | Form sections or blocks (B3) |
| payments | project_id, application_id, type (beneficiary_support / advance / volunteer_reimbursement), date, amount, method (bKash/bank), transaction_id, paid_by, verified_by | Payments to beneficiaries, advances, and volunteer expense reimbursements |
| expense_claims → expense_items | volunteer_id, project_id, status; category (decoration, vehicle hire, food, photocopy, banner …), amount, voucher_file | Volunteer operational expense claims and verification (B6) |
| issues | project_id, application_id, type, description, photos, status (new / in progress / resolved), raised_by, assigned_to, resolution, resolved_by, at | Issue log (A8.2) |
| blocklist | subject_type (volunteer / beneficiary), subject_id, reason, blocked_by, blocked_at, released_by, released_at, active | Blocklist (A5, A7) |
| application_transfers | application_id, from_volunteer_id, to_volunteer_id, approved_by, reason, at | Application transfer (A5) |
| donors | source (ssl / manual), transaction_id, name, mobile, email, amount, purpose, approved_by, comment | Qurbani donors, two sources in one list |
| animals → animal_shares, animal_photos | type (cow/goat), number, total_shares, status (empty / full / allocated), assigned_volunteer_id (one animal, one volunteer), spot; donor_id + shares; kind (animal/meat/packet), url, emailed_at | Animal allocation, shares and the three kinds of photos (A8.6) |
| site_verifications | application_id, by, date, comment, photos, recommendation (approve/reject) | Site verification (tree planting, A8.5) |

#### Documentation entities (placed in A5 of the blueprint)

| Entity | Main fields | Purpose |
|---|---|---|
| documents | project_id, district, checklist_item, name, required, owner_role, due_date, submitted_at, status, soft_copy_file, hard_copy_code, retain_until | SOP document register; replaces the tracking sheet (A10). owner_role is an official role only, never a volunteer |
| deficiency_reports | document_id, reported_by, event_date, description, loss_type, recovery_steps, evidence, prior_count, pm_decision, at | Deficiency report and central log (SOP clause 7) |

#### Latest additions (placed in A5 of the blueprint)

| Entity | Main fields | Purpose |
|---|---|---|
| application_scores | application_id, criteria (JSONB), total_score, computed_at | Priority score and sorting (A7) |
| project_quotas | project_id, level (district/union), area_id, target, approved_count | Area quotas (A7) |
| stock_movements | project_id, volunteer_id, item, sent, received, distributed, remaining, damaged, note | Stock reconciliation (A8.1) |
| profile_merges | kept_ben_id, merged_ben_id, reason, by, at, reverted_at | Profile merge record and reversal (A7) |
| handovers | from_user_id, to_user_id, scope (JSONB), approved_by, at | Staff exit and handover (A5) |
| fund_sources | project_id, source (zakat / sadaqah / general / specific donor), amount | Fund-source tags and separate accounts (B6) |
| media_consents | beneficiary_id, granted, channels, date, by | Media-use consent (A10, SOP clause 12) |
| media_stories | title, project_id, beneficiary_id, author, status, published_at, channel | Media Team stories and publication tracker |
| device_sessions | user_id, device, last_seen, revoked_at | Session revocation for lost phones (B10) |

### B3. Dynamic form platform (beneficiary + application + dynamic form)

Not just a form builder: a platform of beneficiary, application and dynamic form on which Qurbani, iftar, winter clothing, self-reliance and house construction all run in one system. Structure: project → form → form version → section → field → option → application → answer. The PM's job: project → create form → pick fields → set mandatory → set logic → publish; no coding.

| Layer | What | Example |
|---|---|---|
| 1. Beneficiary master profile | One profile per person; mobile number unique (blueprint wording; contradicts the rules below and Q-21; resolved by O-02: not unique, warning only) | BEN-000123: Abdur Rahim, 017XXXXXXXX (example id style superseded by O-03: UUID v7) |
| 2. Project application | A separate application per project, linked to the same profile | Iftar 2026, Qurbani 2026, Winter 2026, Winter 2027: 4 applications, 1 person |
| 3. Dynamic form (versioned) | The PM-built form for the project's needs | Qurbani 2026 form v1, v2 |
| 4. Dynamic answers | Answers to project questions, with the application | Family members 6, occupation farmer |

#### Standard field library + custom fields (hybrid storage)

The PM does not write fields from scratch; they tick fields from a ready library and add project-specific questions as custom fields. The real library from the two current forms and each field's mapping are in Appendix B.

| Kind | Examples | Stored where |
|---|---|---|
| Identity (standard) | Beneficiary name, father/husband and mother's name, mobile, NID/birth registration, date of birth/age, gender, marital status, education, class, occupation, photo | Columns of the beneficiary table |
| Address (standard) | Division, district, upazila, union, ward (dropped by O-09), village, post office, post code, house/landmark, GPS | Beneficiary table, referencing locations |
| Family and income (standard) | 14+ members, children under 14, total members (calculated), daily/monthly income, monthly expense, multiple earners (repeat group) | Beneficiary table + sub-table |
| Custom (project) | Qurbani: received meat last year; winter: jacket size; self-reliance: business type, capital, zakat assessment | application_answers (JSONB), question–answer rows; no new columns |

#### Form section (block) library

Fields are not picked one by one; the form is built from reusable sections or blocks. The PM adds a whole section in one click, then removes or adds fields inside it. (Approved by BD-12.)

| Section | Contents |
|---|---|
| Basic information | NID, name, father/husband name, mobile, gender, age/date of birth, occupation, photo |
| Address | Division → district → upazila → union → village, post office, landmark, GPS |
| Family and income | 14+ members, children under 14, total members, daily/monthly income, expense, multiple earners (repeat group) |
| Livelihood | Occupation details, kind of business or day labour |
| Project questions | Custom per project (winter size, self-reliance business plan, etc.) |
| Financial status | House and land, livestock, remittance, allowances |
| Loan information | Loan type, purpose, amount, comments |
| Zakat assessment | Cash, bank, gold and silver, investments, debts; total assets, total debts, net assets (calculated) |
| Official section | Imam and আলেম data, eligibility, approval date, official comments |
| Attachments | Photo with house, papers, photo with placard |

Each section has its own settings: order, who sees it (volunteer or official only), and the condition under which it appears. So the volunteer part and the official part of one form stay separate (Appendix B.2).

#### Field types

Short and long text, number, decimal, money, phone, email, date, time, date-time; single and multiple select, radio, checkbox; photo, file, signature; GPS location; Bangladesh address (system component: division → district → upazila → union; the blueprint's ward level is dropped by O-09; the list of 64 districts and 495 upazilas in one place, the PM does not build it); repeat group (e.g. every family member, "+ add another"); calculation; information/note.

#### Field settings and no-code logic

Every field's ⚙ settings: label (Bangla and English), type, mandatory, placeholder, help text, default value, validation, min/max, options, conditional logic, calculation. The PM composes logic by selection: show "business type" when "has business? = yes"; show "type of disability" when "disability = yes"; NID mandatory when "age ≥ 18". Field library on the left, live preview on the right; fields added by drag or tick.

#### Form versions (mandatory)

When the PM adds or changes a question on a published form a new version (v2, v3) is created; applications submitted under the previous version keep their previous data structure unchanged. Every application stores form_version_id; reports align fields across versions. (Approved by BD-12.)

#### Identifying beneficiaries by NID and auto-fill

The basis of beneficiary identity is the NID or birth-registration number, and one of the two is mandatory in every project. The first field of the application form is this number; the system checks whether it exists. (Approved by BD-01, BD-02, BD-03; Q-21, Q-44.)

- Not found: new beneficiary; on submission with name, father/husband name, mobile, address, etc., the profile and BEN-ID are created.
- Found: previous profile found; name, father/husband name, mobile, address and other basic data auto-fill; the volunteer does not retype them.
- What can change: data that may change, such as mobile and address, can be updated by the volunteer, every change logged. NID, name and father/husband name are locked; if wrong, they change only through the official's controlled "profile correction request" process (PROPOSED; approved by BD-02).
- One NID or birth registration = one beneficiary profile; no second profile on the same number. The same mobile number may belong to several beneficiaries (e.g. one family), but the system warns.
- If the volunteer enters own mobile number as the beneficiary's, the system blocks it; this check also exists at database level (constraint).
- An NID or birth registration on the blocklist is refused for new applications (A7).
- Someone without an NID (a child, or NID not yet issued) gets a profile with the birth-registration number; either of the two suffices, but no application is accepted without one.

### B4. Roles, permissions and data scopes

Permissions are not only role-based but scope-based: which user may view, edit or approve which data is decided by role × scope. The A4 matrix is the default; from the permission panel the Department Head or Monitoring Team can grant or revoke any responsibility for anyone, every change audited. (Q-36.)

| Scope | Meaning | Default holders |
|---|---|---|
| GLOBAL | Whole country, all programs | Department Head, Monitoring Team |
| PROGRAM | All projects of own program | PM |
| PROJECT | A specific project | Everyone assigned to the project (by role) |
| REGION | Own region (division) inside the project | RPM, Project Executive, Official দায়ী |
| DISTRICT / UPAZILA / UNION | When the PM splits districts, or by assignment and filters | RPM (when districts are split), Local দায়ী, Paid Volunteer |
| ASSIGNED | Only own assigned beneficiaries or applications | Local দায়ী, Paid Volunteer |
| SELF | Only own created applications and own profile | Volunteer, Team Member |

#### Implementation rules (PROPOSED)

- On every API request the server checks the user's role, project assignment and scope before returning data; hiding in the UI alone is not enough.
- The central volunteer and beneficiary tabs are GLOBAL read scope (all officials); project work is REGION / ASSIGNED scope.
- Ratings, categories and official-section fields are never returned outside official roles (field-level protection).
- Permission sets (application + distribution, + dawah, work progress) are stored with the project assignment; the same person gets different sets in different projects.

### B5. Workflow engine and project activity engine

#### Configurable workflow (PROPOSED, Q-35; approved by BD-11)

Application statuses are not hard-coded. For each template the states, transitions (from which state to which), who may perform them and conditions (e.g. no "completed" without photos) are configured in the database; new templates or steps for new projects are added without code changes. The common part is the same in every template: Draft → Submitted → Under Review → Reviewed → Approved / Rejected → Implementation/Distribution → Completed → Closed (A7), plus Needs verification (offline NID collision and public-link entries, BD-48, O-08), Waitlisted (BD-17) and Deleted (drafts and pending applications removed by their owner) from `workflow-templates/_common.yaml`.

| Template | States after approval (example) | Activity types |
|---|---|---|
| Winter clothing / iftar | Package Sent → Received → Distributed → Completed | Distribution |
| House construction | Worker Assigned → Foundation → Wall → Roof → Completed (stages written by the PM) | Construction, Inspection |
| Safe water | Fund Sent → Work Started → Work Completed → Voucher → Verified → Completed | Payment, Construction, Voucher |
| Self-reliance | Purchase → Evidence (Voucher, Photo) → Verified → Completed → Follow-up | Purchase, Voucher, Training (dawah), Follow-up |
| Qurbani | Beneficiary: distribution template; donor: Imported → Animal Allocated → Notified → Photos Sent → Voucher | Distribution, Payment, Voucher |
| Tree planting | Verified → Visit → Distributed → Completed | Visit, Distribution |

#### Activity engine (PROPOSED)

One common activity model for all projects: Distribution, Construction, Purchase, Training (dawah class), Visit (site verification), Payment (advance or support), Voucher, Expense (volunteer expense), Issue (issue log), Inspection, Follow-up. Each activity records: which application, type, stage, who, when, photos/files, comments, status. The project workflow sits on top of these activities, so dashboards and monitoring work the same way in every project.

#### Bulk-update screens (the central feature of field work)

| Screen | For whom | Columns (example) |
|---|---|---|
| Today's distribution | Volunteer | Beneficiary, received ✓, photo, status |
| Today's class | Local দায়ী | Beneficiary, present, today's topic, in progress/learned |
| Today's construction | Paid Volunteer | Beneficiary, current stage, progress %, issue, photo |
| Today's visit | Official / volunteer | Beneficiary, visited, result, photo |
| Today's follow-up | Official / Official দায়ী | Beneficiary, method, result, comments |

Each screen: one list, tick per row, one save; works offline (B7); on save the profile, activity and audit log are updated at once.

### B6. Budget and accounts model

Planned budget: target beneficiaries × cost per beneficiary (decided, Q-24; e.g. 100 × 1,000 = 100,000 taka). On top, a bucket-based project-level account (PROPOSED, Q-37; approved by BD-29):

| Bucket | Meaning | Written when |
|---|---|---|
| Allocated | The project's total budget | Project setup |
| Approved | Approved applications × cost per beneficiary | On application approval |
| Spent / Distributed | Beneficiaries with completed distribution × cost | When distribution is "completed" |
| Remaining | Allocated − Spent (reports also show Allocated − Approved) | Calculated |
| Beneficiary Support | Money sent directly for the beneficiary; date, amount and transaction id with the application | Self-reliance payment after passing the exam |
| Advance | Money sent in advance to a volunteer (safe water) | On the payment record |
| Actual Expense | Expense per submitted vouchers | On voucher verification |
| Voucher Submitted / Verified | Voucher amount submitted, amount verified | On voucher submission and verification |
| Returned | Advance − actual expense, returned | On reconciliation |
| Volunteer Expense Claimed | Volunteer operational expenses by category: decoration, vehicle hire, food, photocopy, banner, etc. | On expense statement and voucher submission |
| Volunteer Expense Paid | Paid by bKash after verification; date, amount and transaction id | On payment |

Every project budget carries fund-source tags (zakat / sadaqah / general donation / a specific donor's fund) because different projects have different funds. Spending from the zakat fund requires the beneficiary's zakat eligibility (A8.3), and reports show separate accounts by source. (Approved by BD-30.) Every payment transaction id is unique: a second payment attempt on the same claim is blocked. Rules: advance and actual expense are never treated as one thing, and volunteer operational expenses are never mixed with the cost per beneficiary; the dashboard shows them separately; every transaction is its own ledger row (project, application, bucket, amount, reference, who, when) so the project account can be reconciled at any time. Dashboard card: planned, used, remaining (e.g. ৳10,00,000 / ৳7,20,000 / ৳2,80,000). (Approved by BD-31.)

### B7. Offline PWA and sync architecture (diagram image5)

Field volunteers are the largest group of primary users, so the offline PWA is part of the core architecture, not an optional feature: the same web ERP on desktop and mobile (installed like an app on the phone), applications captured and saved without network, submitted automatically when the network returns; no application is lost because of network trouble. (Q-15, Q-23.)

#### Offline record requirements

- Every offline record carries a client-side unique id (client_uuid) and creation time; when the server receives the same id a second time it does not create a new record (idempotent).
- Sync status on every record: pending / syncing / synced / failed; on failure the reason is shown and the system retries automatically (with backoff).
- Photos in a separate queue, compressed; text goes first, photos later; a distribution is not "completed" while photos are pending.
- Available offline: forms of assigned projects (current version), own beneficiary list, syllabus, location list; sensitive data on the phone encrypted and wiped on logout (approved by constitution §9 offline rules; scope and budgets decided by O-07 and O-29).
- Conflict rule (Q-43, approved by BD-48): the server's value stays on approved data; the last write stays on drafts and field updates, and both are in the audit log. NID lookup does not work offline, so the volunteer enters everything by hand; at sync, if that NID already exists the application is not deleted but goes to "needs verification", and an official matches it to the profile.

### B8. Security, audit log and data protection

NID/birth registration, mobile number, address-GPS and donor data are sensitive. Layers of protection:

| Control | What |
|---|---|
| Role- and scope-based access | B4; checked on the server, not only in the UI |
| Field-level protection | NID, ratings, categories, donor data, official section: visible only to authorized roles; the same rule in exports. NID number and photo are visible to all official staff (decided), not to volunteers |
| Audit log | Permanent trail of every important action (below) |
| Session and login | Mobile/email + password, OTP for registration and password reset only (O-05), session timeout, lock after several failed attempts, session refresh when the role changes |
| File access | Photos, vouchers and documents are never on public links; time-limited signed links after a permission check |
| Backup | Daily automatic backup to a separate location; regular restore tests (targets decided by O-06: RPO 24 hours, then 1 hour; RTO 4 hours; monthly drill) |
| Data retention | Audit log and beneficiary history are never deleted; no time limit: all data including photos and documents is kept permanently (decided, Q-39; approved by BD-46) |

#### Audit log record (PROPOSED structure)

| Field | Example |
|---|---|
| Who | user_id, role |
| When | timestamp |
| Action | create / update / status_change / approve / reject / unlock / permission_change / category_change / close / export |
| Entity, Entity ID | application, WNT-2026-00125 (format by O-03) |
| Old Value, New Value | {status: reviewed} → {status: approved} |
| Reason | "Field unlock: NID correction" |
| IP / Device | Where appropriate; client_uuid on mobile sync |

### B9. Technology stack (PROPOSED, Q-40)

| Layer | Proposal | Reason |
|---|---|---|
| Database | PostgreSQL + JSONB | Relational master data and dynamic answers together; strong indexing and reporting |
| Backend / API | REST (OpenAPI spec); workflow / activity / form / budget services | Language by the developer team's choice (Node.js/TypeScript or other) |
| Frontend | React/Next.js, PWA (service worker, IndexedDB) | One codebase for desktop and mobile, offline |
| File storage | Object storage (photos, vouchers, documents), signed URLs | Secure and economical |
| Notifications | In-app notifications only for staff and volunteers; nothing to beneficiaries for now. Email from the organization's own mail server (SMTP); provider-agnostic SMS settings, provider chosen before production; dummy OTP during testing | Qurbani donors, correction requests, reminders |
| Language | i18n, Bangla and English from the start; form labels in both languages | Decided (Q-17) |
| Hosting and backup | Hosting on the organization's own server; development by the organization's own team (decided, Q-40) | Where the data lives |

The concrete stack proposal of the constitution (§9: Node.js 24 LTS, NestJS, Prisma, Next.js, pnpm workspaces, pg-boss, MinIO, Nodemailer, SMS adapter, Docker Compose; the frontend moved to a Vite React SPA by D-073 and the backend to Express 5 by D-074) is recorded as D-050…D-053 in `docs/DECISION_LOG.md`, approved by the owner on 2026-10-10 (O-01).

### B10. Performance and field reality

Field users are the majority and their phones and networks are weak, so these are design conditions, not later fixes.

| Topic | Target |
|---|---|
| Concurrent users | About 2,000 volunteers at once on a distribution day; server and database designed for this load, load test before project start |
| Phones | Runs on cheap Android (2 GB RAM) and older browsers; heavy libraries and big screens avoided |
| First load | The app's core kept light so it opens fast on slow networks; the rest loads on demand |
| Network | 2G/3G and intermittent connectivity assumed: offline queue (B7), small requests, automatic retry |
| Photos | Compressed on the phone, uploaded in chunks; resumes where it stopped when the network drops |
| Data use | Volunteers' data use kept low; lists paginated, never everything at once |
| Account security | When a phone is lost or stolen an official can revoke that device's session; logout wipes the data on the phone |

Storage size, backups and server capacity are handled by the organization's IT team; this document only states the need (photos are permanent, so storage grows every year).

**Data for other departments**: all three ways as needed: report export (CSV/PDF), limited viewer access in a specific role (e.g. Finance Team), and an API if required. Role and scope (B4) and the sensitive-field rules (B8) apply in every case.

---

## Part C — Decisions pending approval

### C1. Decisions and questions 1–34

Numbering is kept from the previous version so that "(প্রশ্ন N)" references match. Statuses: decided (confirmed by the department, reflected in the chapters), to be fixed later (with the phase before which), discussion needed (management opinion pending). 1–17 from the draft, 18–25 from the second review, 26–31 from the current forms (Appendix B), 32–34 ratings, closing and categories. Technical decisions from the new architecture are in C2.

| Q | Question | Decision | Status |
|---|---|---|---|
| Q-01 | Are Regional Manager and Regional Officer the same role? | Same role: RM (RPM) | Decided |
| Q-02 | Does the Monitoring Officer see all programs? | All programs; the same access as the Department Head everywhere | Decided |
| Q-03 | Under which program are tree planting and safe water? | Humanitarian Program | Decided |
| Q-04 | Who reviews applications? | Whoever the RPM gives review permission | Decided |
| Q-05 | Field-level correction requests on applications before approval? | No; during review the official may edit the whole form | Decided |
| Q-06 | May a team member edit own application before submission? | Before submission yes; after submission only the main volunteer | Decided |
| Q-07 | Is paid volunteer a type of volunteer registration? | Same form, separate type; the RPM marks them paid on the project | Decided |
| Q-08 | Several RPMs in one division: how are volunteers and applications split? | Equal at first; the PM may split districts, giving separate views | Decided |
| Q-09 | Who approves a volunteer's edit request? | RPM or Project Executive, either | Decided |
| Q-10 | Does the tree-planting "open application" use a public link? | Yes; public form, enters the system after verification | Decided |
| Q-11 | Qurbani: donor Excel column format; which services for SMS and email? | Import format per last year's sheet (A8.6). Email from the organization's own mail (SMTP). SMS not yet in use: provider-agnostic gateway setting, any provider's details can be entered without code changes | Decided |
| Q-12 | Are the three photo-rule options group / individual / both enough? | Enough | Decided |
| Q-13 | What is on the central dashboard? | Start with the seven KPI groups of A11; more later if needed (Q-41) | Decided |
| Q-14 | When is the documentation SOP available? | Available: SOP version 2.3 (September 2026). How it maps to the ERP is in A10 | Decided |
| Q-15 | Separate mobile app for volunteers or mobile-friendly web? | PWA: installable web app; no separate app | Decided |
| Q-16 | Can one volunteer be assigned to several projects at once? | Yes; permissions per project | Decided |
| Q-17 | Interface language? | Bangla and English together from the start | Decided |
| Q-18 | Is "Project Officer" another name for Project Executive? | Yes, same person/post | Decided |
| Q-19 | Who approves volunteer registrations? | Project Executive, RPM, PM, Monitoring Team and Department Head: any | Decided |
| Q-20 | Volunteer and beneficiary tabs nationwide; assignment and applications by region? | Yes, in a project everything comes by region | Decided |
| Q-21 | How is a beneficiary identified? | Updated decision: NID or birth registration mandatory and the basis of the profile. A later application on the same NID auto-fills name, father/husband name, mobile (changeable) and address; name and NID locked; a volunteer cannot use own number as the beneficiary's | Decided |
| Q-22 | What does a general volunteer do in safe water? | Detailed application; money sent after approval; regular updates; at the end tube-well photo, vouchers and full account | Decided |
| Q-23 | Is offline needed in the PWA? | Yes: capture and save applications offline, submit when the network returns; nothing lost on network trouble | Decided |
| Q-24 | How is the budget computed? | Cost per beneficiary × number = total budget, set at project creation | Decided |
| Q-25 | Can "Both" volunteers also add team members? | Yes | Decided |
| Q-26 | What are spot code (distribution form) and community number (self-reliance/house), who gives them? | Dropped for now: no spot code or community number field in the forms; may be added later as a custom field | Decided |
| Q-27 | Options for "beneficiary class"? | Default: elderly, widow, orphan, disabled, sick, labourer, ultra-poor, other. The PM may change the list per project; "other" opens a text box | Decided |
| Q-28 | Duplicated questions (occupation, earner relationship, loan type, business type) turned into one field with conditional options; correct? | Yes: one field whose options change with the previous answer. The Google Form duplicated them because "other" needed a new text box; in the new system "other" adds a text box to the same field | Decided |
| Q-29 | Does the system compute net assets and zakat status (nisab in project settings, updated yearly)? | Yes: the system computes total assets, debts and net assets, compares with the nisab and shows a proposal; the আলেম/official finalizes. The nisab is set by the PM or above (Monitoring, Head). The nisab used at verification is saved with the application; later changes do not affect old data | Decided |
| Q-30 | Is the "dawah representative and zakat-approving আলেম" the Official দায়ী? Is the name taken from the assigned দায়ী automatically? | Yes: the Official দায়ী. Names and mobiles are not typed: chosen from the list of officials/দায়ীs assigned to the project; the approver's name is recorded automatically at zakat approval | Decided |
| Q-31 | Which fields are mandatory in the two forms? | NID/birth registration, name, father/husband name, mobile, gender, division → district → upazila → union, village: mandatory in every project; the rest per project, decided by the PM (toggle per field in the form builder) | Decided |
| Q-32 | Is the volunteer rating computed by the system from work data or given by hand? During or at the end of the project? | Yes: at project close the system shows a proposed score per criterion from work data; the official (PM/RPM/Executive per A4) reviews, changes if wanted and finalizes | Decided |
| Q-33 | Can the PM reopen a closed project (wrong close)? Who does follow-up evaluations, how often? | Reopen: the PM, with reason, logged. Follow-up: no fixed schedule or reminders; continuous work; an official or Official দায়ী adds an evaluation whenever they check; continues after close | Decided |
| Q-34 | Volunteer category list (e.g. A/B/C, active/inactive)? | A (excellent), B (good), C (weak), D (risky); plus a separate "inactive" flag (no work for a long time) | Decided |

### C2. New technical decisions 35–47 (from the architecture review)

The blueprint says these are Part B proposals that become decisions when management and the technical lead approve together; the C2 table itself marks each as decided.

| Q | Technical decision | Decision or proposal | Status |
|---|---|---|---|
| Q-35 | Configurable workflow engine, statuses not hard-coded (B5) | Yes, stages and statuses in settings: common states + project templates and components (A6) | Decided |
| Q-36 | Permission = role × data scope (GLOBAL … SELF) (B4) | Yes; per the A4 default matrix, changeable in the permission panel | Decided |
| Q-37 | Budget bucket model including volunteer operational expenses (B6) | Yes; ledger-based, advance ≠ actual expense, operational expenses in a separate bucket | Decided |
| Q-38 | Project templates and component-based project creation (A6) | Both options: master template and copy of a previous project; copy list in A6; everyone with project-creation access can build templates | Decided |
| Q-39 | Audit log fields and personal-data retention policy (B8) | No time limit: audit log, beneficiary history, photos and documents are all permanent | Decided |
| Q-40 | Technology stack and hosting (B9) | Hosting on own server; development by the organization's own team. Stack proposal (PostgreSQL + JSONB, React/Next.js PWA, REST API) to be finalized with the team | Decided |
| Q-41 | Central dashboard KPI list (also answers Q-13) | Start with the seven proposed KPI groups of A11; more later if needed | Decided |
| Q-42 | Staff and volunteer registration form fields and OTP verification (A5) | Decided: form after mobile and email OTP verification; full field list in A5 | Decided |
| Q-43 | Offline sync conflict rule (B7) | The server's value stays on approved data; last write on drafts and field updates; both in the audit log | Decided |
| Q-44 | How are beneficiaries without NID (e.g. children) taken? | Profile by NID or birth registration, either; no application without one; the field is added to the distribution form too | Decided |
| Q-45 | Blocklist: who can set and lift it, and what happens to ongoing applications? | RPM or above (PM, Monitoring Team, Head) with reason; ongoing applications stay as they are; a newly added volunteer manages them | Decided |
| Q-46 | How much may the Procurement Team do? | View applications only (no edit/delete); raise issues in the issue log and resolve issues with an update | Decided |
| Q-47 | How are animals allocated in Qurbani? | Animal numbers from donor data; allocation by hand on the volunteer's profile. One person may get several cows, or one to four goats; an allocated animal cannot be given to anyone else | Decided |

### C3. Must be final before development starts (Phase 0 gate)

Only the items without which architecture or code cannot start:

1. Role and data-scope model (B4, Q-36) and the default permission matrix (A4): no screen or API is designed without it.
2. Project component list and common workflow states (A6, Q-35, Q-38); exceptions such as PM approval in house construction written in the template.
3. Form platform: section library, standard fields and form versioning (mandatory fields and class options already decided: Q-31 and Q-27).
4. Budget and accounts: bucket model (Q-37), cost per beneficiary (Q-24), and the categories and approval rules of volunteer operational expenses (decided by O-14).
5. Offline sync conflict rule (Q-43).
6. Security, audit and retention policy (Q-39) and technology stack and hosting (Q-40).
7. Document checklist, deadlines and storage codes in the system (per SOP, A10): before Phase 1 design. (Overridden by O-34: the documentation SOP module is built last, after Phase 6 reporting; the data model already holds its entities.)
8. Rating method (Q-32), category list (Q-34), close/reopen and follow-up schedule (Q-33): may wait until before Phase 5, but direction is needed now to reserve room in the data model.
9. Setting the zakat nisab value (per Q-29): before self-reliance starts in Phase 4.
10. SMS provider selection and setup before Qurbani (Q-11): before Phase 4. (O-49: a real gateway before rollout beyond the Phase 3 pilot; the pilot may use the dummy OTP with the owner's written approval.)

Identity (NID/birth registration), blocklist, application transfer and Procurement Team access (Q-21, Q-44–Q-46) are decided and no longer on the gate list.

---

## Part D — Development roadmap

### D1. Development blueprint, Phases 0–6 (diagram image6)

Modules are built in seven phases, not all at once; at the end of each phase real users test and give feedback (gate), then the next phase. Field use starts from Phase 3 (winter clothing/iftar), so there is no waiting for the whole system.

| Phase | What is built | Gate / result |
|---|---|---|
| 0 · Requirement & Architecture Freeze | Approval of the Part C decisions (especially C3), ERD and API contract, mockups of the main screens, SOP and registration form fields, workflow template definitions | Management sign-off; no code before it |
| 1 · Foundation | Login and sessions, roles and data scopes, permission panel, staff and volunteer registration and approval, volunteer and beneficiary tabs, program and project setup (draft save, templates), locations master, audit log, i18n | Test by the official team |
| 2 · Beneficiary + Application + Form Builder | Beneficiary master and mobile matching, media consent and the Media Team module (D-101), form platform (library, custom, logic, cascading, versions), common workflow, field unlock and change log, team members, PWA shell and offline sync, Excel/CSV/PDF export, basic beneficiary profile | Test by volunteers and RPMs |
| 3 · Winter/Iftar Pilot | Distribution workflow template, application limit and deadline, package receipt, photo rules, today's distribution screen, project dashboard and basic budget card; pilot in one region | Corrections from the pilot region's feedback, then all regions |
| 4 · Project-specific Workflows | House construction (stages, paid volunteers), safe water (advance, vouchers, return), self-reliance (evidence, zakat computation), tree planting (public form, visit), Qurbani (donor import, animal allocation, SMS/email); activity engine and budget buckets complete | Project-wise tests; order may change by priority |
| 5 · Dawah + Monitoring + Follow-up | Dawah module (syllabus, today's class, exams, call log, Official দায়ী tracking), monitoring control centre and alerts, work summaries, ratings and categories, project closing and follow-up evaluations | Test by MEAL and the Monitoring Team |
| 6 · Central Reporting & Optimization | Program, central and dawah dashboards (approved KPIs), beneficiary journey report, SOP documentation, performance and security hardening, backup-restore drill | Management review |

Timeline and budget are not in the blueprint; the duration of Phases 1 and 2 can be set after the Phase 0 decisions. (The constitution §8 places the document register in Phase 5; by O-34 the data model is in Phase 0 and the checklist editor and full register are built last, after Phase 6 reporting.)

### D2. Way of working

- At the start of each phase, screen designs (mockups) are shown and approved, then development; form fields and rules are finalized then. (UX-08: clickable HTML mockups, no Figma.)
- At the end of each phase a pilot in one region; corrections from the feedback of RPMs, দায়ীs and volunteers, then all regions.
- Volunteers work on mobiles in the field, so the system is a PWA: installed like an app, applications captured and saved offline, submitted when the network returns; no separate mobile app. Photo upload and bulk update must be easy on mobile. Interface in Bangla and English from the start.
- NID, mobile and donor data are sensitive: protected by role- and scope-based access, regular backups and the audit log (B8).
- The system starts fresh: previous years' data (Excel, Google Forms, Kobo) stays where it is and is not imported. If needed later, a separate decision; then NID matching prevents duplicates.
- In every phase the developer team documents database migrations, API specs and test cases so that later phases and maintenance are easier (PROPOSED; made mandatory by the constitution).

#### Training and support

- Before each phase's pilot, one training session for RPMs and 20–30 volunteers; short videos and a Bangla guide inside the system.
- 1–2 "champion" volunteers per region who learn first and help the others; the most effective approach in the field.
- A "report a problem" button in the app: a ticket with screenshot and device data goes to the IT team; a helpline number during distribution season.
- When a new project starts in the system, that project's old Google Form is closed; running both in parallel splits the data.

---

## Appendix A — Glossary (পরিশিষ্ট ক)

| Term | Meaning |
|---|---|
| Program | Umbrella of several projects of the same kind, e.g. Humanitarian Program |
| Project | A specific activity in a specific year, e.g. Iftar Project 2026; the centre of the system |
| Beneficiary | The person who receives support; identified by NID or birth registration; one profile with all years' history |
| BEN-ID | The beneficiary's permanent system id (e.g. BEN-000123); the profile is based on NID or birth registration |
| Beneficiary 360° / journey | Full history on one profile: applications, support, dawah, call log, follow-up, photos and documents |
| Application | Project-based form for a beneficiary (transaction); support is given after review and approval |
| Volunteer (General) | Submits applications and distributes |
| Local দায়ী | Teaches beneficiaries basic Islamic knowledge in the field and posts daily updates; receives an honorarium |
| Official দায়ী | Salaried staff under the RPM; takes exams, tracks Local দায়ীs' classes, follows up beneficiaries by phone |
| Team Member | Assistant registered with the main volunteer's NID as reference; only creates applications |
| Paid Volunteer | Supervises work progress in house construction and safe water; receives an honorarium |
| PM | Program Manager |
| RM | Regional Program Manager (the SOP's RPM); wherever the older text says RM it is the same role |
| MEAL | Monitoring, Evaluation, Accountability and Learning: the team responsible for monitoring and evaluation |
| Permission panel | Where the Department Head or Monitoring Team grants or revokes any permission for anyone |
| Data scope | The range of data that may be viewed/changed: GLOBAL, PROGRAM, PROJECT, REGION, DISTRICT/UPAZILA/UNION, ASSIGNED, SELF |
| Form builder / form platform | Tool for building a project's application form without coding: field library, custom fields, logic, cascading, versions |
| Form version | A new version when a published form changes; earlier applications stay unchanged on the earlier version |
| Cascading dropdown | The next list narrows by the previous choice: division → district → upazila → union |
| Workflow template | Configuration of the steps after approval by project type (distribution, construction, advance + voucher, etc.) |
| Activity engine | Common work model for all projects: distribution, construction, payment, voucher, visit, follow-up |
| Project template | Basis for creating a new year's project from the previous year's setup |
| Field unlock | Temporarily opening one specific field of an approved application for correction; old and new values logged |
| Bulk update | Updating many beneficiaries from one screen (today's distribution / class / construction / visit / follow-up) |
| Budget bucket | Separate accounting cells: allocated, approved, distributed, remaining, advance, actual expense, voucher, returned |
| Advance and actual expense | Advance = money sent to a volunteer; actual expense = expense per verified vouchers; two different things |
| Rating criteria | At most 5 criteria for measuring a volunteer's work in a project; each 1–5 |
| Volunteer category | Class given by an official in the volunteer list; a change needs a comment; volunteers do not see it |
| Monitoring control centre | Operational screen with automatic alerts on stuck work and problems |
| Project close | When the PM closes a project all activity stops and all data is read-only |
| Follow-up evaluation | Record written after checking on a beneficiary; continuous, also after close |
| Call log | Record of the Official দায়ী's phone call to a beneficiary: date, duration, topic, comments |
| Audit log | Permanent record of who did what when, with old and new values and reason |
| JSONB | PostgreSQL field type in which project-specific custom answers are stored without new columns |
| PWA | Progressive Web App: a website that installs like an app on the phone and works offline |
| client_uuid / sync | Unique id created on the phone for an offline record; submitted to the server (synced) when the network returns, without duplicates |
| SOP | Standard Operating Procedure: the defined rules of work |

## Appendix B — Current form fields and mapping to the new system (পরিশিষ্ট খ)

Two application forms are in use today: one for distribution projects such as Qurbani, iftar and winter clothing, the other for self-reliance and house construction. Below, where each field goes in the new system: **Standard** (field library, stored on the beneficiary profile), **Custom** (project-specific answer), **System** (filled automatically, never typed), **Calculated** (from other fields), **Official section** (seen and filled by officials only). Questions are Q-26…Q-31. The mapping follows the B3 structure (section → field → option → answer): standard fields in the beneficiary table, custom answers in application_answers.

### B.1 Qurbani, iftar and winter clothing (distribution) form

In Qurbani this form is for meat-distribution beneficiaries; donor and animal management is separate (A8.6). In the new system NID (or birth registration) is added as the first field, because identity is based on it (B3).

| Current field | New system | Type and comment |
|---|---|---|
| Spot code | Custom (proposal: dropdown from project settings) | Dropped (decided, Q-26); the courier address comes from the volunteer's profile |
| Volunteer name | System | From the logged-in volunteer |
| Volunteer mobile number | System | Same |
| Official member | System | From the RPM/Executive assigned to the project |
| Beneficiary id | System | BEN-… assigned by the system |
| Mobile number | Standard | Phone; changeable; auto-fills from NID |
| Beneficiary name | Standard | Text; read-only when the number is known |
| Gender | Standard | Select |
| Father/husband name | Standard | Text |
| Beneficiary class | Standard | Select; default 8 options (elderly … other), changeable per project (Q-27) |
| Age | Standard | Number; computed when the date of birth exists |
| Occupation | Standard | Select + "other" |
| Family members aged 14 or more (including self) | Standard | Number |
| Children under 14 in the family | Standard | Number |
| Total family members | Calculated | Sum of the two above |
| Total daily family income (taka) | Standard | Money; the self-reliance form has monthly income, so daily and monthly are two separate fields |
| Division, district, upazila, union | Standard | Cascading address component |
| Village (write in Bangla) | Standard | Text, Bangla-script validation |

### B.2 Self-reliance and house construction form

The first page of the form is for officials; the rest is filled by the volunteer from the beneficiary. In the new system the official section is a separate tab of the application; volunteers do not see it.

#### (a) Official section

| Current field | New system | Type and comment |
|---|---|---|
| Community number | Custom (proposal: dropdown from project settings) | Q-26 (dropped for now) |
| Local imam's name and phone | Official section | Text, phone |
| Beneficiary's eligibility for zakat support | Official section | Select; system proposal from the zakat assessment, the আলেম (Official দায়ী) finalizes; the nisab used at verification saved with the application (Q-29) |
| Approval date | System | Set automatically at approval |
| Implementing officer's name and mobile | System | From the staff assigned to the project |
| Dawah representative and zakat-approving আলেম's name and mobile | System (proposal) | From the assigned Official দায়ী (Q-30) |
| Self-reliance id number | System | Project-based application number, e.g. SBL-2026-00012 |
| Application status | System | Status cycle (A7) |
| Official staff comment | Official section | Long text |

#### (b) Personal information

| Current field | New system | Type and comment |
|---|---|---|
| Mobile number | Standard | Phone; changeable; auto-fills from NID |
| Beneficiary name, father/husband name, mother's name | Standard | Text |
| Gender, marital status, education level | Standard | Select |
| National id / birth certificate number | Standard | Text; first field of the form and basis of the profile; mandatory in every project |
| Date of birth | Standard | Date; age computed |
| Division, district, upazila, union, village | Standard | Cascading address + text |
| Post office name, post code | Standard | Text, number |
| House name/number/landmark (if any) | Standard | Text, optional |
| Beneficiary location | Standard | GPS location from the mobile |
| Family 14+ members, children under 14, total members | Standard + calculated | As in the distribution form |

#### (c) Livelihood and income stability

| Current field | New system | Type and comment |
|---|---|---|
| Beneficiary's occupation? (appears twice) | Standard | One select field; options by branch (Q-28) |
| What business do you do? | Custom | Shown when occupation = business |
| Which day-labour work do you do most? | Custom | Shown when occupation = day labourer |
| Beneficiary's monthly income | Standard | Money |
| Family's monthly expense | Custom | Money |
| More than one earner in the family? | Standard | Yes/no |
| Earner's name, relationship (appears twice), occupation, monthly income | Standard | Repeat group: several earners can be added; relationship is one field |
| Total family income | Calculated | Beneficiary's plus all earners' income |

#### (d) Project questions (self-reliance)

| Current field | New system | Type and comment |
|---|---|---|
| Previously involved in a business? | Custom | Yes/no |
| What kind of business? (+ write if other) | Custom | Select + "other" text; shown when yes |
| Years of business experience? | Custom | Number; shown when yes |
| How do you want to become self-reliant? | Custom | Select: business / rearing / other |
| What kind of business do you want to do? (appears twice) | Custom | One select field; shown when business is chosen (Q-28) |
| How much money is needed for the business? | Custom | Money |
| What do you want to rear? | Custom | Select; shown when rearing is chosen |
| How much capital do you have? | Custom | Money |

#### (e) Financial status

| Current field | New system | Type and comment |
|---|---|---|
| Type of house; type of homestead ownership | Custom | Select |
| Homestead land; total agricultural land; sharecropped/leased/mortgaged land (decimals) | Custom | Decimal number |
| Mortgaged against how much; leased for how much | Custom | Money; shown when mortgage/lease exists |
| Which crops do you sell? | Custom | Multiple select |
| Livestock? Number of cows/buffaloes and goats/sheep | Custom | Yes/no, then numbers |
| Family member abroad? Receive money from abroad? | Custom | Yes/no, conditional |
| Receive disability/old-age/widow allowance? | Custom | Multiple select |

#### (f) Loan information

| Current field | New system | Type and comment |
|---|---|---|
| Loan/instalment? | Custom | Yes/no; when yes the fields below are shown |
| What kind of loan? (appears twice) | Custom | One select field (Q-28) |
| Purpose of the loan; purpose fulfilled? | Custom | Text; yes/no |
| Total loan amount | Custom | Money; added as debt in the zakat computation |
| Comment on taking an interest-bearing loan | Custom | Long text, optional |

#### (g) Zakat assessment

| Current field | New system | Type and comment |
|---|---|---|
| Cash; deposits at a bank/financial institution | Custom | Money |
| Gold amount, carat, market price per ana | Custom + calculated | The system computes the total gold value |
| Silver amount, carat, market price per ana | Custom + calculated | The system computes the total silver value |
| Purchase price of savings certificates/bonds/debentures/treasury bills | Custom | Money |
| Sale value of goods and raw materials held in stock for sale | Custom | Money |
| Money receivable from others | Custom | Money |
| Annual income from rent or surplus crops | Custom | Yes/no, then money |
| Current value of land bought for resale | Custom | Yes/no, then money |
| Refundable money given as deposit/security | Custom | Money |
| Loans taken for medical/household/personal needs; unpaid dower; outstanding bills and expenses | Custom | Money (debts) |
| Total assets, total debts, net assets | Calculated | The system adds and subtracts |
| Zakat status | Calculated (proposal) | The system compares with the nisab and proposes; the আলেম (Official দায়ী) finalizes; the nisab at verification saved with the application (Q-29) |

#### (h) Attachments

| Current field | New system | Type and comment |
|---|---|---|
| Photo of the beneficiary with the house | Standard | Photo field; directly from the mobile camera |

### B.3 Standard field library from the two forms

| Group | Fields |
|---|---|
| Identity | Beneficiary name, father/husband name, mother's name, gender, age, date of birth, marital status, education level, NID/birth certificate number, mobile number, beneficiary class, occupation, photo |
| Address | Division, district, upazila, union, village, post office, post code, house name/landmark, GPS location |
| Family and income | 14+ members, children under 14, total members (calculated), daily income, monthly income, family monthly expense, multiple earners (repeat group), total family income (calculated) |

All other fields are project-specific custom fields. Never typed (filled by the system): volunteer name and mobile, official member, beneficiary id, self-reliance id, application status, approval date, implementing officer. When a known beneficiary's NID is entered, name, father/husband name, mobile and address also auto-fill. Computed by the system: total family members, total family income, gold and silver value, total assets, total debts, net assets, zakat status (proposal). Staff and volunteer registration form fields are in A5.

---

## Open questions

Items where the blueprint is silent or contradicts itself, or where a proposal needs the owner's decision, limited to business rules, data structure, API contracts, security, permissions, workflows, money and major UX. This section keeps questions 1–23 as raised in T0.1 for traceability. Section 6 of `docs/DECISION_LOG.md` is the complete list (questions 1–30) with the answering decision of each; all 30 are answered.

**Resolution (2026-10-10, task T0.7):** the owner answered all 23 questions; the decisions are recorded as O-01 … O-23 in `docs/DECISION_LOG.md` section 5. The recommendation column below became the decision except where noted here:

- 3: BEN-ID is a UUID version 7 (the primary key itself), not a "BEN-" sequence; the application id format stands as recommended (O-03).
- 9: four levels only (division → district → upazila → union, no ward); the admin panel manages the master (add upazila/union, rename, deactivate; nothing hard-deleted); initial load from an open dataset (O-09).
- 16: Friday is the only weekly holiday; public holidays from an admin holiday calendar (O-16).
- 22: the ERP never pays; the accounts team pays, mostly by mobile banking, and sends the transaction id; the ERP records date, amount, method and id with an optional copy; method list admin-editable, defaults bKash, Nagad, Rocket, bank transfer (O-22). Question 24 (answered by O-24): whether the accounts team may enter payment records themselves.

These resolutions supersede the following blueprint wording: the "মোবাইল নম্বর ইউনিক" cell of the B3 layer table and diagram image4 (O-02); the ward level in B2 locations, B3 address component and constitution §6 (O-09); the "BEN-000123" style examples in A7, Appendix A and B.3 (O-03); the "OTP (PROPOSED)" login row in B8 (O-05, OTP at registration and reset only).

| # | Question | Source of the gap | Recommendation |
|---|---|---|---|
| 1 | Technical stack D-050…D-053 (constitution §9): approve or change? | B9, Q-40 leave the stack to the team | Approve as proposed |
| 2 | Is the beneficiary mobile number unique? | B3 layer table and diagram image4 say "mobile unique"; B3 rules, Q-21 and BD-01 say mobile is contact data and may repeat | Not unique; same mobile on several profiles gives a warning only; the volunteer's own number is blocked (BD-03). Treat the table wording as legacy |
| 3 | Formats of BEN-ID and application id | Examples BEN-000123, APP-2026-00125, SBL-2026-00012 without a rule | BEN-ID = "BEN-" + 7-digit sequence, never reused, no year; application id = project code + year + 5-digit sequence (e.g. WNT-2026-00125); the project code is set in project setup and unique; proposed codes WNT, IFT, MEAT, QRB, SBL, HSE, SWT, TRP |
| 4 | Monitoring thresholds: N days for review pending, approval pending, no update, inactive volunteer; budget percentage | A10 alert table marks them PROPOSED | Review 7 days, approval 5 days, no update 7 days, inactive volunteer 14 days, budget alert at 90%; all editable in admin settings |
| 5 | Password rules, session lifetime, lockout; is OTP required at login? | B8 session row: "OTP (PROPOSED)", "session timeout", "lock after several failed attempts" without values | Minimum 8 characters with at least one letter and one digit; access token 15 minutes; refresh token 30 days bound to the device session and revocable; lock 15 minutes after 5 failed attempts; role or permission change forces a session refresh; OTP only for registration and password reset, not at every login |
| 6 | Backup targets RPO/RTO, restore-drill cadence | B8 backup row PROPOSED; constitution §10 asks for a proposal to the IT team | RPO 24 hours initially (daily backup), 1 hour once WAL archiving is enabled; RTO 4 hours; monthly restore drill |
| 7 | What stays on the phone offline, and the photo-queue budget | B7 lists the data sets, no size limits | Assigned projects' current form versions, the volunteer's own beneficiaries and applications, syllabus, locations; photo queue up to 200 MB; everything wiped on logout or remote revocation |
| 8 | Abuse protection for the public application link | A8.5 and Q-10 say public form, verification after | Rate limiting; repeated NID/mobile entries go to "needs verification"; no CAPTCHA for now |
| 9 | Source of the locations master (divisions, 64 districts, 495 upazilas, unions, wards) | B3 says the list is a system component; no source | Load from an open dataset (division → district → upazila → union; ward optional, may be empty); the department verifies against the latest official list later |
| 10 | Rating averages | A5 "ratings of all projects and an average" vs BD-40 "never averaged" | Ratings are per project; averages only within the same kind of work (application/distribution vs dawah), never across the two kinds |
| 11 | Attendance for family members in dawah classes | A9 marks it PROPOSED | Yes: attendance may be recorded for family members listed in the application's family repeat group; reports count beneficiaries and family members separately |
| 12 | Project "Closing" state between Active and Closed | A6 marks it PROPOSED; BD-20 only covers close and reopen | Adopt: Closing stops new applications and lets remaining work, photos and vouchers be verified; only the PM moves a project to Closing and Closed |
| 13 | Application limit per volunteer: which states count, and how offline drafts synced after the deadline are treated | A6, A8.1, BD-16 state the limit and deadline without these rules | Count every application that is not Rejected and not deleted, drafts included; a draft synced after the deadline is accepted only if its client creation time is before the deadline and is flagged "needs verification" |
| 14 | Volunteer operational expense claims: default categories, per-project editability, separate verify and pay steps, several claims per volunteer per project, any cap | C3 item 4 says the categories and approval rules must be final; BD-31 says no thresholds | Default categories decoration, vehicle hire, food, photocopy, banner, editable per project; a claim is verified by an Executive/RPM and the payment is recorded separately (date, amount, bKash transaction id); several claims per volunteer per project allowed, each paid at most once; no amount cap |
| 15 | Where the nisab is stored: one global versioned value or a per-project setting | Q-29 question text says "project settings"; the decision says PM or above sets it and the value at verification is saved; BD-28 says versioned | One global versioned nisab table (value, effective date, set by); every application stores the nisab value used at verification |
| 16 | Definition of "working days" for the 3-working-day document countdown | A10 SOP clause 6 | Friday and Saturday are the weekend plus a holiday calendar maintained in admin settings |
| 17 | Media consent: who records it, when, and the list of channels | A10 SOP clause 12 and media_consents entity give status, channels, date, by | An official records consent on the beneficiary profile (attached signed form or photo optional); channel list: website, Facebook, print, video, donor report; editable in admin settings |
| 18 | Beneficiary profile status list | A8.1 edge-state table mentions death and relocation changing the profile status | Statuses active, deceased, relocated; blocklist stays a separate flag |
| 19 | Qurbani share model for goats and multiple goats per donor | A8.6 gives cow = 7 shares; goats are counted, not shared | A goat is a whole animal (one share, status full on allocation to a donor); a donor's goat count creates that many goat numbers |
| 20 | Is a volunteer's NID unique among volunteers, and may a volunteer also be a beneficiary? | B2 volunteers: mobile unique, nid not marked | NID unique among volunteers; a volunteer may exist as a beneficiary in another project but the review screen flags it |
| 21 | When is the priority score computed and recomputed? | A7 says "as soon as the application is submitted" | Computed at submission and recomputed on every answer change until the decision; the score and criteria used are snapshotted at the decision |
| 22 | Payment method list | B2 payments: method (bKash/bank); BD-31: volunteers by bKash | Methods bKash, Nagad, Rocket, bank, cash as an admin-editable list; default bKash and bank |
| 23 | Default follow-up evaluation questions for self-reliance | A6 marks the five questions PROPOSED | Adopt the five questions (business started, current income, business running, profit, main problem) as the default template, editable per project |

Input dependency, not a decision: the SOP v2.3 text (`docs/source/SOP_v2.3_BN.md` or `.pdf`) is needed to detail the hard-copy code segments, the 11 deficiency-report items and the seven project checklists (tasks T0.4, T1.13, T5.4).
