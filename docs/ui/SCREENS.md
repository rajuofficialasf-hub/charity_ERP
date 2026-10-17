# SCREEN INVENTORY

Status: complete for Phase 0, written in task T0.19 (2026-10-10). Mockups of the pilot set are built in task T0.19b under `docs/ui/mockups/`. Components, layouts and states refer to `docs/ui/DESIGN_SYSTEM.md` (DS). Owner decisions: `docs/ui/DESIGN_BRIEF.md` (UX-01 to UX-13). Permissions: `docs/security/permissions.yaml`. API: `docs/api/openapi.yaml` (tags named per screen).

## 1. Conventions

- **Id.** Every screen has an id `SCR-nnn`. Ids are never reused; a removed screen is marked "withdrawn".
- **Device priority.** One of three values:
  - `phone-first`: volunteers' field work.
  - `parity`: fully usable at 360 px and on desktop (UX-03, NFR-17).
  - `desktop-first`: setup screens with a "best on a larger screen" notice on phones (UX-04, DS §4.4).
- **Permissions.** Every action names a permission from permissions.yaml, or one of the markers `public`, `authenticated` (any active user, own data) and `workflow`.
  - For application actions, the permission is taken from the project's workflow snapshot; the default permission of the common cycle is named here (`workflow-templates/_common.yaml`).
  - Scope (GLOBAL … SELF) and conditions come from permissions.yaml. An action the user lacks is not rendered; the server still denies by default.
- **Sensitive fields.** Masking follows the `sensitive_fields` classes of permissions.yaml (DS §6.7):
  - `beneficiary.nid`
  - `volunteer.identity`
  - `volunteer.bank`
  - `volunteer.rating`
  - `donor.data`
  - `application.official_section`
  - `blocklist.reason`
  - `audit.detail`
- **States.** Every screen supports the standard states of DS §8: empty, loading, error, offline, pending sync, denied (shown as not found), read-only and stale version. Each entry lists only what is specific to it.
- **Layouts.** Phone below 640 px, tablet 640 to 1023 px, desktop 1024 px and up (DS §2.8, §4).
- **Phase and task.** The roadmap phase (constitution §8) and the PLAN task that builds the screen.
- **Role labels.** Tables use short labels for the roles of `permissions.yaml`: Head = Department Head (`department_head`), Monitoring = Monitoring Team (`monitoring_team`), PM = Program Manager, RPM = Regional Program Manager, Executive = Project Executive, Finance, Procurement and Media = the Finance, Procurement and Media Teams; volunteer types use their full names (General Volunteer, Local দায়ী, দাঈ-স্বেচ্ছাসেবক (both), Team Member, Paid Volunteer).
- **Detail level.**
  - Section 3 to 9 entries are full specifications.
  - Section 10 rows are short and are expanded into full entries at the start of their phase, together with their mockups (DESIGN_BRIEF §6).

## 2. Screen index

| Id | Screen | Priority | Main roles | Phase · task |
|---|---|---|---|---|
| SCR-001 | Login and password reset | parity | everyone | 1 · T1.7 |
| SCR-002 | Registration with two OTP steps | phone-first | new volunteers (officials since D-097: created by the admin, SCR-063) | 1 · T1.9 |
| SCR-003 | Registration status and correction | phone-first | applicants | 1 · T1.9 |
| SCR-004 | Notifications inbox | parity | everyone | 1 · T1.14 |
| SCR-005 | Sync status and outbox | phone-first | volunteers, field officials | 2 · T2.7 |
| SCR-006 | My profile, edit request, device sessions, language | parity | everyone | 1 · T1.7, T1.9 |
| SCR-010 | My Work: Volunteer (General and Both) | phone-first | volunteer_general, volunteer_both | 1 · T1.15 (widgets grow per phase) |
| SCR-011 | My Work: Team Member | phone-first | volunteer_team_member | 1 · T1.15 |
| SCR-012 | My Work: Local দায়ী | phone-first | volunteer_local_daee | 1 · T1.15; class widgets 5 · T5.1 |
| SCR-013 | My Work: Paid Volunteer | phone-first | volunteer_paid | 1 · T1.15; work widgets 4 · T4.1 |
| SCR-014 | My Work: Official দায়ী | parity | official_daee | 1 · T1.15; dawah widgets 5 · T5.1 |
| SCR-015 | My Work: Project Executive and RPM | parity | project_executive, regional_program_manager | 1 · T1.15 |
| SCR-016 | My Work: PM | parity | program_manager | 1 · T1.15 |
| SCR-017 | My Work: Department Head and Monitoring Team | parity | department_head, monitoring_team | 1 · T1.15; full in 3 · T3.3 and 6 · T6.1 |
| SCR-018 | My Work: Implementer (derived) | parity | implementer | 1 · T1.15; safe water 4 · T4.3 |
| SCR-019 | My Work: Media Team (derived, Media tab) | parity | media_team | 5 · T5.5 (placeholder in T1.15) |
| SCR-020 | My Work: Finance Team (derived) | parity | finance_team | 3 · T3.2 (placeholder in T1.15) |
| SCR-021 | My Work: Procurement Team (derived) | parity | procurement_team | 4 · T4.1 (placeholder in T1.15) |
| SCR-030 | My projects and project rules consent | phone-first | volunteers | 1 · T1.12 |
| SCR-031 | New application with NID lookup | phone-first | volunteers, team members, RPM, Executive | 2 · T2.2, T2.4, T2.5 |
| SCR-032 | My applications and application detail | phone-first | volunteers, team members | 2 · T2.5 |
| SCR-033 | Today's distribution (bulk) | phone-first | volunteers, RPM, Executive | 3 · T3.1 |
| SCR-034 | Today's class (bulk) | phone-first | Local দায়ী | 5 · T5.1 |
| SCR-035 | My team | phone-first | volunteer_general, volunteer_both | 1 · T1.12 |
| SCR-040 | Registration approval queue | parity | Head, Monitoring, PM, RPM, Executive | 1 · T1.9 |
| SCR-041 | Application review list and detail | parity | Executive, RPM, PM | 2 · T2.5, T2.6 |
| SCR-042 | Volunteer tab | parity | officials | 1 · T1.10 |
| SCR-043 | Volunteer profile | parity | officials | 1 · T1.10, T1.12; later tabs per phase |
| SCR-044 | Beneficiary tab | parity | officials, Media | 1 · T1.10 (list), 2 · T2.2 |
| SCR-045 | Beneficiary 360 profile and merge | parity | officials | 2 · T2.2 |
| SCR-050 | Project dashboard | parity | PM, RPM, Executive, Head, Monitoring, Finance | 3 · T3.3 |
| SCR-051 | Admin area shell (`/admin`) with the dashboard placeholder | parity (notice on phones) | Head, Monitoring, PM | 1 · T1.7d (UX-15); pages in T1.13, T3.3, T6.1 |
| SCR-060 | Project setup with component toggles | desktop-first | PM | 1 · T1.11, T1.12 |
| SCR-061 | Form builder | desktop-first | PM | 2 · T2.4 |
| SCR-062 | Permission panel | desktop-first | Head, Monitoring | 1 · T1.8 |
| SCR-063 | Officials: department staff, other departments, partners; new official, link, profile | parity | Head, Monitoring (writes); PM, RPM (read) | 1 · D-097 |
| SCR-064 | Organogram | parity | Head, Monitoring, PM, RPM | 1 · D-097 |
| SCR-065 | Set-password link of a new official (`/invite`) | phone-first | the new official | 1 · D-097 |
| SCR-070 | Issue log | parity | Paid Volunteer, Procurement, RPM, Executive, PM | 4 · T4.1 |
| SCR-071 | Donor list | parity | PM, RPM, Executive | 4 · T4.4 |
| SCR-072 | Document register | parity | officials | after 6 · T6.1: T5.4 (built last, O-34) |
| SCR-080 … SCR-112 | Remaining screens (section 10) | per row | per row | per row |

## 3. Shared screens

### SCR-001 Login and password reset

- **Built (T1.7).** `/login` and `/login/reset` in apps/web (centered card on the brand wash of mockup 01; the reset flow is login id → code and new password → done; the dummy-OTP note appears only in development and E2E builds). Not yet: install state on iOS, the 426 banner (T1.13), registration link (T1.9).

- **Purpose.** Sign in with mobile number and password; reset a forgotten password by OTP (AUTH.md).
- **Roles.** Everyone.
- **Priority.** parity.
- **Data shown.**
  - Logo (SVG) and the system name (UX-09).
  - Language toggle in the top bar (UX-19).
  - Mobile number or email, and password fields (AUTH.md §4).
  - Lockout message with the remaining time.
  - On the installed iOS PWA, the install state.
- **Actions.**

| Action | Permission |
|---|---|
| Sign in | `public` (rate class login) |
| Start password reset, verify OTP, set new password | `public` (rate classes password-reset, otp-request, otp-verify) |
| Go to registration | `public` |

- **States.**
  - Wrong credentials: a generic message with no hint which field was wrong.
  - Locked: the time until unlock.
  - Offline: sign-in is impossible. A user with a valid session goes straight to the cached home.
  - Rate-limited: 429 with the retry time.
  - Upgrade required: 426 banner.
- **Components.** Field (phone, password with show/hide), Button primary, Alert, logo.
- **Layouts.**
  - Phone: single column, logo 72 px high, primary button full width.
  - Tablet and desktop: centered card 400 px on canvas.
- **Phase · task.** 1 · T1.7. **API.** tag auth.

### SCR-065 Set-password link of a new official

- **Purpose.** An official created by the admin chooses the first password (AUTH.md 2.2, BR-262).
- **Route.** `/invite#<token>`: the token is read from the fragment, sent only in request bodies and cleared from the address bar at once.
- **Data shown.** Greeting with the name, the job ID to log in with, the password and its repetition with the rule checklist of the account (12 characters for a global role).
- **States.** Done: "লগইনে যান"; a used, replaced or expired link and an unknown one: the server message and "ask the Department Head or the Monitoring Team for a new link"; no token: the link is incomplete.
- **Built.** `apps/web/src/features/auth/InvitePage.tsx`; tests `InvitePage.test.tsx`, E2E `staff-accounts.spec.ts`.

### SCR-002 Registration with two OTP steps

- **Since D-097 (2026-10-17).** Volunteers only: the page names no kind and says that officials do not register here; the admin creates their accounts (SCR-063) and they set the password through a link (SCR-065). Staff drafts are refused by the API (`registration.staff_by_invitation`).
- **Purpose.** Volunteer and staff registration (BD-44, blueprint A5):
  1. Verify the mobile number by OTP.
  2. Verify the email by a second OTP.
  3. Fill in the registration form.
  4. Submit for approval.

  The steps can be resumed for 24 hours (O-25).
- **Eight steps (T1.9f, O-66; plan `docs/plans/2026-10-14-1400-feat-volunteer-form-refine-plan.md`).** A volunteer has eight steps: contacts, identity (mother's name, NID, the Facebook account link, WhatsApp, date of birth, blood group, T-shirt size), address (the present address and where the person wants to serve; the permanent address is optional and a ticked box "my present address is my permanent address", on by default, copies the present one), education (its own step: the highest qualification, the institution, the subject, the passing year, the result and whether the person is still studying; all optional), profession (the choice and its own fields only), skills (areas of interest, vehicle, swimming, availability and whether the person can give full time in an emergency), account, photos. There is no emergency contact, and no earlier education text, earlier projects or Facebook id in the profession step. The Facebook link is checked for https and a Facebook host; the profile draws it as a link only when it passes the same check (older plain ids are shown as text).
- **One form with the profile (T1.9e, O-65, D-092; plan `docs/plans/2026-10-14-0900-feat-volunteer-form-merge-plan.md`).** A volunteer has seven steps: contacts (unchanged), identity (mother's name, NID, WhatsApp, date of birth, blood group, T-shirt size), address (the cascade, the village or house, where the person wants to serve), profession (the choice, the fields of that profession only, then the education, the earlier projects and the Facebook id), skills (areas of interest, vehicle, swimming, availability, the emergency contact), account, photos. Mandatory: the name, the parents' names, the mobile, the email, the NID, the address to the union and the profession; the rest is optional. A new profession drops the fields of the old one; the submit has the profession details as one nested object (`professionDetails`). The experience and the work description are no longer asked.
- **Rebuilt (T1.9c, O-64, UX-19; plan `docs/plans/2026-10-13-1130-feat-registration-simplify-plan.md`).** Nothing is asked that the person cannot know: a volunteer registers as a general volunteer with no type and no reference, an official gives the designation with the name and no program or workplace, nobody gives bank details (they are added later from the profile, now with a branch). The password step shows the three rules (8 characters, one upper-case letter, one digit) as a checklist that ticks while typing; nothing else is checked. The volunteer has five steps (contacts, identity and address, work, account, photos), the official three (contacts with the designation, account, photo). The language toggle sits in the top bar above the page.
- **Roles.** New volunteers and new officials.
- **Priority.** phone-first.
- **Data shown.**
  - A step indicator showing the four steps.
  - The form fields:
    - name, father's and mother's name, NID
    - WhatsApp, address (bd_address)
    - education (qualification, institution, subject, year, result, status), the profession and its details
    - Facebook account link, present and permanent address
    - photo and both pages of the NID card
  - No volunteer type, reference, bank details, program or workplace (O-64).
- **Actions.**

| Action | Permission |
|---|---|
| Request OTP (mobile, email) | `public` (otp-request) |
| Verify OTP | `public` (otp-verify) |
| Upload photo and NID photo | `public` within the registration session (quarantined until scanned, O-30) |
| Submit registration | `public` (rate class public-form) |

- **States.**
  - Wrong OTP: shows the remaining attempts.
  - Expired OTP: offers resend after the cooldown.
  - The dummy OTP note appears only in dev and test, never in production (BD-49).
  - Duplicate NID or mobile: a generic "already registered" message with the login link.
  - The partial form is kept locally until it is submitted.
- **Components.** Step / timeline (horizontal), Field (all types), File upload (camera or gallery), Alert, Button.
- **Layouts.**
  - Phone: one step per screen, sticky next button.
  - Tablet and desktop: centered column 720 px, the same steps.
- **Phase · task.** 1 · T1.9. **API.** tags auth, registration.
- **Rebuilt (T1.9b, UX-16, UX-18; plan `docs/plans/2026-10-13-0922-feat-registration-redesign-plan.md`, U4).** One page `/register`: the green title band with the kind switch, a step indicator and one card per step. Step 1 has the name, the father's name, the mobile and the email; each contact is verified inside its own field ("যাচাই করুন", the code below the field, "যাচাই হয়েছে"; D-090), and the next step opens once both are. Volunteer steps: contact, identity and address, work, account (bank and password), photos (own photo and both pages of the NID card); official steps: contact, workplace, account, photo. A server error returns to the step of its field. Tests `registration.test.tsx`, `apps/web/e2e/registration.spec.ts`.
- **Built (T1.9).** `/register` in apps/web (`apps/web/src/features/registration/`; plan `docs/plans/2026-10-12-1541-feat-registration-approval-handover-plan.md`, U11): kind and contacts, then the mobile code and the email code on two screens checked by one API call, then the form of the kind (volunteer or official; the address cascade from the public `/locations`; photo and NID photo compressed on the phone, at most 1600 px, and uploaded at once), then the "submitted" page. The draft is resumed by starting again with the same mobile and email and verifying both codes (AUTH.md 2); the partial form is not stored on the device. Photos are not scanned before T2.1 (D-087). Tests `registration.test.tsx`, `apps/web/e2e/registration.spec.ts`.

### SCR-003 Registration status and correction

- **Purpose.** After submission the applicant sees the status (pending, correction requested, approved, rejected; display wording over the account state `pending` and the registration review outcome, AUTH.md §7). They answer correction requests by editing the requested fields.
- **Roles.** Applicants with an unapproved account.
- **Priority.** phone-first.
- **Data shown.**
  - Status badge and submission date.
  - The official's correction message, with the fields to fix highlighted.
  - The rejection reason, if rejected.
- **Actions.**

| Action | Permission |
|---|---|
| View own registration | `authenticated` (limited pre-approval session) |
| Resubmit corrected fields | `authenticated` |

- **States.**
  - Waiting: an empty state that explains approval takes time.
  - Auto-deactivated: the registration expired unapproved (AUTH.md).
- **Components.** Badge, Alert, Field, Button.
- **Layouts.** Single column on every size.
- **Phase · task.** 1 · T1.9. **API.** tag registration.
- **Built (T1.9).** Inside `/account/profile` (SCR-006): a pending registrant sees the waiting notice, the "no project yet" message and only the requested correction rows, each with the approver's note and an input for its field; "Submit again" appears once every row is answered (BR-030; plan `docs/plans/2026-10-12-1541-feat-registration-approval-handover-plan.md`, U12). The rejection reason is not shown on the device (the person may register again, D-086).

### SCR-004 Notifications inbox

- **Purpose.** In-app notifications for staff and volunteers (BD-47, UX-12). This is the only channel for volunteers' operational messages.
- **Roles.** Everyone with an account.
- **Priority.** parity.
- **Data shown.**
  - A list grouped by day: icon, title, one line, time, unread dot, and a link to the record.
  - Filter by unread and by kind.
- **Actions.**

| Action | Permission |
|---|---|
| Read list, open record | `notification.read_own` |
| Mark read, mark all read | `notification.read_own` |
| Notification preferences (email digest, Web Push per device, O-35) | `notification.read_own` |

- **States.**
  - Empty: "no notifications".
  - Offline: the cached list is shown, read state syncs later.
  - Opening a record the user can no longer see shows "not found".
- **Components.** Table (card list), Badge, Tabs (all, unread), Row / Toggle (preferences), EmptyState.
- **Layouts.**
  - Phone: full-screen list from the bell or the notifications tab.
  - Tablet: drawer from the bell.
  - Desktop: a dropdown panel with the last 10, and a full page.
- **Phase · task.** 1 · T1.14. **API.** tag notifications.

### SCR-005 Sync status and outbox

- **Purpose.** Shows what is waiting on this device, what failed and why, and lets the user retry. Explains the iOS limits (OFFLINE_SYNC.md, O-29, UX-06).
- **Roles.** Volunteers and field officials using the PWA.
- **Priority.** phone-first.
- **Data shown.**
  - Counts of records by state: pending, syncing, synced, failed.
  - Photos queued, with their size.
  - The storage used against the photo budget (100 MB on iOS, 200 MB on Android).
  - The last successful sync time.
  - For each failed record: the error key, translated.
- **Actions.**

| Action | Permission |
|---|---|
| Sync now, retry a failed record | `sync.batch` |
| Open the record | permission of the record (for example `application.edit_draft`) |
| Discard a failed draft (with confirm) | `application.delete_pending` |

- **States.**
  - All synced: an empty state.
  - Token expired: the outbox is kept and the user is asked to sign in again (O-29).
  - Storage nearly full: a warning Alert.
- **Components.** Card/Stat, Progress bar, Table (card list), Badge (sync), Alert, Confirm dialog.
- **Layouts.**
  - Phone: a full page reached from the sync indicator.
  - Tablet and desktop: a drawer.
- **Phase · task.** 2 · T2.7. **API.** tag sync.

### SCR-006 My profile, edit request, device sessions, language

- **Built in part (T1.7).** `/account/sessions` (device list, current marker, log out another device with confirm) and `/account/password`; the placeholder home links them with language and logout until the app shell (T1.15). Profile and edit requests come in T1.9; the unsynced-records warning at logout with the outbox (T2.7).
- **Refined (T1.9f, O-66).** Education is a section of its own (the education group of the registration, plus the earlier plain text only when filled), the permanent address sits in the address section, the Facebook link in the personal section, and the emergency contact is gone (the full-time answer is part of the skills). A volunteer who ticked details and then chooses another section is asked first ("Leave without sending?"); an untouched edit mode is left without a question. A staff member approved with a global role is taken to the change-password screen at the next sign-in, with a short note, and works only after choosing a password of 12 characters.
- **Extended (T1.9e, O-65).** The sections are personal (with the date of birth, blood group, T-shirt size), contact (with the emergency contact), address (with the volunteering area), work (the type, the profession with its details, the education, the earlier projects; the earlier experience and work description only when filled), skills (new), bank, photos. A group (the profession, the skills, the emergency contact) is edited with the same inputs as the registration, starting from the current values, and sent as one request; the blood group, the date of birth, the T-shirt size and the volunteering area are single requests. The registration an approver opens shows the new data; the blood group, the date of birth and the emergency contact only with the identity class.
- **Rebuilt (T1.9d, plan `docs/plans/2026-10-13-1500-feat-profile-redesign-plan.md`).** `/account/profile` has a header card (own photo as a round avatar, the name, the type and the state badge), the six sections as a navigation (a column from 768 px, a swipeable row of chips on phones; a dot marks a section with a request waiting for the person) and only the open section's details in a card. An active volunteer has one "সম্পাদনা" button in the open section: it starts an edit mode where each changeable detail has a checkbox, a ticked detail shows its input, one optional reason applies, and "অনুরোধ পাঠান" sends one request per ticked detail through the same endpoint (a refused one stays ticked with its message). The type has no checkbox; a detail with a request waiting shows its state, the code input (mobile, email) or the photo upload as before. The per-detail edit buttons and the dialog are gone.
- **Changed (T1.9c, O-64).** The bank section has a branch beside the bank name, account name, account number and routing number; a volunteer who gave no bank details at registration adds them from the edit button of that section (an edit request, D-085). The language toggle is in the top bar of the page.
- **Rebuilt (T1.9b, UX-18; plan `docs/plans/2026-10-13-0922-feat-registration-redesign-plan.md`, U5).** `/account/profile` shows the own details in six section cards (personal, contact, address, work, bank, photos with the three images); after approval each detail but the volunteer type has "সম্পাদনা" beside it, which opens the request dialog with the new value and an optional reason; a detail with an open request shows "আপনার অপেক্ষায়" (with the code or the photo upload below it) or "অনুমোদনের অপেক্ষায়" instead.
- **Built (T1.9).** `/account/profile` for volunteers (`apps/web/src/features/account/ProfileView.tsx`, `ChangeRequests.tsx`; plan `docs/plans/2026-10-12-1541-feat-registration-approval-handover-plan.md`, U12): the own details in full, and after approval an edit request with the new value of one field (text, address cascade, bank details, photo upload); a new mobile or email waits for a code to the new address before it reaches the approver (D-085). The home page links the profile for volunteers.

- **Purpose.** Shows the user's own data and lets them ask for changes. Approved volunteers change their profile only through an edit request. It also lists device sessions and sets language and preferences.
- **Roles.** Everyone.
- **Priority.** parity.
- **Data shown.**
  - Profile fields, with the user's own sensitive fields shown to the user.
  - Pending edit requests.
  - Device sessions: device, last seen, current device marker.
  - Language (bn or en).
- **Actions.**

| Action | Permission |
|---|---|
| View own profile | `authenticated` |
| Submit edit request | `edit_request.submit` |
| Revoke one of own sessions | `session.revoke_own` |
| Change password | `authenticated` |
| Switch language | `authenticated` |
| Log out (wipes local data, OFFLINE_SYNC.md) | `authenticated` |

- **States.**
  - Edit request pending: the fields show "change requested".
  - Logout with unsynced records: a warning Confirm dialog that names the count.
- **Components.** Card, Field (read and edit), Tabs (profile, sessions, settings), Row / Toggle, Confirm dialog.
- **Layouts.**
  - Phone: tabs as a segmented list.
  - Desktop: a two-column card layout.
- **Phase · task.** 1 · T1.7, T1.9. **API.** tags auth, sessions, volunteers.

## 4. My Work home per role (blueprint A4)

Every role opens the app on its My Work home (BR-226). The home is a list of widgets in a fixed order, beginning with "needs your attention".

**Shared shell.** DS §4.1, with role-dependent bottom tabs on phones and a sidebar on desktop.

**Shared rules.**
- **First widget.** Every home starts with **Needs your attention**. It holds attention cards (DS §5.3) for corrections, returned items, pending approvals, unsynced and failed records and deadlines. Each card links to the record.
- **Multiple roles.** A user with several roles or projects sees the union of their widgets, grouped by project. A project switcher sits at the top when the user has more than one project.
- **Placeholders.** Widgets whose module arrives in a later phase are not shown before that phase. T1.15 builds the frame and the widgets that exist by Phase 1.
- **Layouts.**
  - Phone: one column of cards.
  - Tablet: two columns.
  - Desktop: a 12-column grid. The attention list sits at the top or on the left and the stat cards sit on the right.

### SCR-010 My Work: Volunteer (General and Both)

Blueprint A4: my projects, my applications (draft, pending, approved), today's distribution, my team, notifications. The Both type also gets the Local দায়ী widgets of SCR-012.

| Widget | Data | Action and permission | From phase |
|---|---|---|---|
| Needs your attention | Correction requests, returned applications, pending consent, failed sync, deadline in 3 days | Open record; `application.edit_pending`, `volunteer.consent.accept`, `sync.batch` | 1 (grows) |
| My projects | Assigned projects with deadline and my limit used ("18 of 25") | Open project; `project.view` | 1 |
| My applications | Counts by status (draft, pending, approved), linked to SCR-032 | `application.view` (SELF) | 2 |
| New application | Primary button | `application.create` | 2 |
| Today's distribution | Today's assigned beneficiaries, done or remaining, stock summary | Open SCR-033; `distribution.update` | 3 |
| My team | Team members and their draft applications awaiting submission | Open SCR-035; `volunteer.team.manage` | 1 |
| Expenses | My claims and their status | `expense.claim.submit` | 3 |

- **Priority.** phone-first.
- **Bottom tabs.** home, applications, today, notifications, more.
- **Offline.** Widgets come from the local cache, and the offline banner shows the pending count.
- **Hidden from volunteers.** Ratings and categories are never shown (BD-40).

### SCR-011 My Work: Team Member

Blueprint A4: the main volunteer's projects, and the applications the team member created.

| Widget | Data | Action and permission | From phase |
|---|---|---|---|
| Needs your attention | Applications returned by the main volunteer, failed sync | `application.edit_draft` (own_created) | 2 |
| Projects | The main volunteer's projects | `project.view` | 1 |
| My created applications | Drafts and their submission state | `application.view` (own_created) | 2 |
| New application | Primary button | `application.create` | 2 |

- **Priority.** phone-first.
- **Submission.** Team members cannot submit. The main volunteer submits their applications (BR-041).

### SCR-012 My Work: Local দায়ী

Blueprint A4: my beneficiaries, today's class, attendance, learning progress, pending updates.

| Widget | Data | Action and permission | From phase |
|---|---|---|---|
| Needs your attention | Class updates not yet posted, failed sync, exam assignments if granted | `class.record` | 5 |
| Today's class | Today's class, place and time, attendance not yet taken | Open SCR-034; `class.record` | 5 |
| My beneficiaries | Assigned families with attendance rate and syllabus progress | `application.view` (ASSIGNED) | 5 |
| Learning progress | Syllabus topics covered, as a Progress bar | `class.record` | 5 |
| Exams (only if the RPM granted it) | Scheduled exams | `exam.record` (if_rpm_grants) | 5 |
| Expenses and honorarium claims | Claim status | `expense.claim.submit` | 3 |
| Issues | Issues I raised | `issue.raise` | 4 |

- **Priority.** phone-first.
- **Phase 1.** In Phase 1 only the attention list and the projects list exist.

### SCR-013 My Work: Paid Volunteer

Blueprint A4: assigned beneficiaries, current stage, progress updates, issues, photos.

| Widget | Data | Action and permission | From phase |
|---|---|---|---|
| Needs your attention | Stages overdue, issues waiting for me, photos pending upload | `progress.update` | 4 |
| Today's work | Assigned houses or sites with the current stage | Open the construction bulk screen (SCR-080); `progress.update` | 4 |
| Assigned beneficiaries | List with stage badges | `application.view` (PROJECT, read only) | 4 |
| Issues | Open issues I raised, plus a "raise issue" button | Open SCR-070; `issue.raise` | 4 |
| Expenses | Claims | `expense.claim.submit` | 3 |

- **Priority.** phone-first.

### SCR-014 My Work: Official দায়ী

Blueprint A4: tracking of Local দায়ীs, exam schedule, call log, follow-up. O-27: the RPM may grant application approval.

| Widget | Data | Action and permission | From phase |
|---|---|---|---|
| Needs your attention | Local দায়ীs with missing class updates, exams due, follow-up calls due, zakat decisions waiting | `dawah.tracking.view`, `zakat.decide` | 4–5 |
| Local দায়ী tracking | Regularity per Local দায়ী (posted, missed days) | Open SCR-091; `dawah.tracking.view` | 5 |
| Exam schedule | Initial and final exams by date | Open SCR-090; `exam.record` | 4 |
| Call log | Calls due and recent calls | Open SCR-092; `call_log.record` | 5 |
| Follow-up | Beneficiaries due for follow-up | `followup.record` | 5 |
| Zakat decisions | Applications waiting for the zakat eligibility decision | Open SCR-089; `zakat.decide` | 4 |
| Approvals (only if granted, O-27) | Reviewed applications awaiting decision | Open SCR-041; `application.approve` (if_rpm_grants) | 2 |

- **Priority.** parity.

### SCR-015 My Work: Project Executive and RPM

Blueprint A4: applications waiting for review and approval, volunteer assignment, regional progress, edit requests.

| Widget | Data | Action and permission | From phase |
|---|---|---|---|
| Needs your attention | Waiting applications, with the oldest first and the waiting time (UX-07); pending registrations; edit requests; correction requests from volunteers; needs-verification records | Open SCR-041 or SCR-040; `application.review`, `application.approve`, `registration.approve`, `edit_request.approve`, `application.verify_needs_verification` | 1 (grows) |
| Review queue counts | Submitted, under review, reviewed, waitlisted, per project | `application.view` | 2 |
| Volunteer assignment | Unassigned areas, volunteers without a project, recent assignments | Open SCR-043; `volunteer.assign_project` (Executive: if_rpm_grants) | 1 |
| Regional progress | Stat cards: applications, approved, distributed or completed against target for my region | `dashboard.project.view` (REGION) | 3 |
| Payments and expenses to verify | Expense claims waiting; payment records to enter (O-24) | `expense.claim.verify`, `payment.record` | 3 |
| My projects | Projects in my region | `project.view` | 1 |

- **Priority.** parity.
- **Bottom tabs.** home, review, people, projects, more.

### SCR-016 My Work: PM

Blueprint A4: project setup and templates, program dashboard, budget, deadlines and closing.

| Widget | Data | Action and permission | From phase |
|---|---|---|---|
| Needs your attention | Draft projects not activated, deadlines within 7 days, house-construction final approvals, projects ready to close, overdue documents | `project.activate`, `project.deadline.extend`, `application.approve` (house_construction_only), `project.close` | 1 (grows) |
| Projects | My program's projects by lifecycle (draft, active, closing, closed) with progress | Open SCR-060 or SCR-050; `project.view`, `project.create` | 1 |
| Templates | Master templates and recent copies | Open SCR-097; `project.template.manage` | 1 |
| Program dashboard | Progress-first stat cards for the program | Open SCR-101; `dashboard.program.view` | 3 (full in 6) |
| Budget | Allocated, spent and remaining per project | `budget.view` | 3 |

- **Priority.** parity. Setup actions open desktop-first screens.

### SCR-017 My Work: Department Head and Monitoring Team

Blueprint A4: central dashboard, monitoring control centre, permission panel, work summaries. UX-10 decides the order:
1. Progress first.
2. Then alerts.
3. Then budget.
4. Then the area view.

| Widget | Data | Action and permission | From phase |
|---|---|---|---|
| Work progress | Applications, approved, distributed or completed against target, across all programs | `dashboard.central.view` | 3 (full in 6) |
| Alerts | Monitoring alerts by kind with counts (BD-42) | Open SCR-095; `monitoring.view` | 3 (full in 5) |
| Budget | Program budget buckets | `budget.view` | 3 |
| Area view | Progress by division and district | `dashboard.central.view` | 6 |
| Needs your attention | Pending staff registrations, handovers waiting, merge reversals requested, blocklist proposals | `staff.registration.approve`, `user.handover`, `beneficiary.merge.revert` | 1 |
| Shortcuts | Permission panel, work summaries, audit log | `permission.panel.manage`, `work_summary.view`, `audit.view` | 1 (summaries 5) |

- **Priority.** parity.
- **Phase 1.** In Phase 1 the home shows the attention list and the shortcuts. The progress block comes with the dashboards.

### SCR-018 My Work: Implementer (derived)

This home is derived from O-26: Project Executive-level rights on safe-water projects, plus the document register. The owner may adjust it.

| Widget | Data | Action and permission | From phase |
|---|---|---|---|
| Needs your attention | Safe-water applications to review, vouchers to verify, documents due | `application.review`, `voucher.verify`, `document.submit` | 2–5 |
| Safe-water projects | Progress per site | `project.view`, `progress.update` | 4 |
| Documents | My checklist items and deadlines | Open SCR-072; `document.register.view` | documentation module (O-34) |

- **Priority.** parity.

### SCR-019 My Work: Media Team (derived, the Media tab)

This home is derived from O-28 and the second A4 table. The Media tab is the team's home. The owner may adjust it.

| Widget | Data | Action and permission | From phase |
|---|---|---|---|
| Media work list | Selected beneficiaries with media status (planned, in progress, published) | Open SCR-108; `media.subject.manage` | 5 |
| Add beneficiary | Search the nationwide beneficiary list, with NID, bank, rating and donor data masked | `media.subject.manage`, `beneficiary.view_all` | 5 |
| Stories | Drafts and published stories | `story.manage`, `story.view` | 5 |
| Publishable photos | Only beneficiaries with media consent (BD-38) | `media.publishable.manage`, `beneficiary.consent.view` | 5 |

- **Priority.** parity.
- **Before Phase 5.** The home is the notification list with a "coming later" empty state.

### SCR-020 My Work: Finance Team (derived)

This home is derived from blueprint A4, which makes the Finance Team a viewer. The owner may adjust it.

| Widget | Data | Action and permission | From phase |
|---|---|---|---|
| Budget overview | Budget buckets per program and project | `budget.view` | 3 |
| Ledger and payments | Payments, vouchers and expense claims, view only | `ledger.view` | 3 |
| Reports | Finance exports in CSV and PDF | `export.finance`, `export.list` | 3 |

- **Priority.** parity.
- **No write actions.** There is no entry, edit or approval for the Finance Team (BD-31).
- **Bank details.** Volunteer bank details are visible under `volunteer.bank`.

### SCR-021 My Work: Procurement Team (derived)

This home is derived from blueprint A4 and Q-46. The team works only on house-construction projects. The owner may adjust it.

| Widget | Data | Action and permission | From phase |
|---|---|---|---|
| Issues to resolve | Issues raised by the team or by paid volunteers | Open SCR-070; `issue.resolve` (own_or_paid_volunteer_issues) | 4 |
| Raise issue | Button | `issue.raise` (house_construction_project) | 4 |
| Applications | House-construction applications, view only | `application.view` | 4 |

- **Priority.** parity.

## 5. Volunteer field screens

### SCR-030 My projects and project rules consent

- **Built (T1.12).** `/my-projects` (from the home, "আমার প্রকল্প" for an active volunteer) lists the running projects with "নিয়মাবলিতে সম্মতির অপেক্ষায়" or "সক্রিয়"; `/my-projects/:projectId` walks the rules part by part (the Local দায়ী part only while dawah is on), each confirmed with "আমি পড়েছি এবং মেনে চলব", then "আমি রাজি এবং এই প্রকল্পে কাজ করতে আগ্রহী" and "সম্মতি দিন"; "প্রত্যাখ্যান করুন" keeps the project waiting; after consent it shows the work facts with the applications counted against the limit. A rules change asks again. The server refuses every project action without the accepted current version.

- **Purpose.** Lists the volunteer's projects. Before the first work on a project, the volunteer reads and accepts the project rules (blueprint A6 "rules and consent", guard `consent.accepted`).
- **Roles.** All volunteer types.
- **Priority.** phone-first.
- **Data shown.**
  - For each project:
    - name, program and area
    - role in the project (permission set)
    - deadline
    - application limit used
    - consent state
  - The consent page shows the rules text (bilingual), the version, and an "I agree" checkbox.
- **Actions.**

| Action | Permission |
|---|---|
| View my projects | `project.view` |
| Accept the rules | `volunteer.consent.accept` |
| Decline (the assignment stays pending; the RPM is notified) | `volunteer.consent.accept` |

- **States.**
  - Consent pending: an attention card on the home, and project work blocked with an explanation.
  - Rules changed: consent is asked again.
  - Project closed: read-only.
- **Components.** Card, Badge, Alert, Field (checkbox), Button, Confirm dialog.
- **Layouts.**
  - Phone: a list of cards. Consent opens full screen with a sticky accept button.
  - Desktop: a list and a modal.
- **Phase · task.** 1 · T1.12. **API.** tags projects, volunteers.

### SCR-031 New application with NID lookup

- **Purpose.** Create a beneficiary application in the field, offline or online. Steps (DS §6.4, §6.3; BD-01 to BD-04, BD-06, BD-13, BD-48):
  1. Identify the beneficiary by NID or birth registration.
  2. Auto-fill the known data and lock the identity fields.
  3. Fill in the project form.
  4. Save as a draft or send to the office.
- **Roles.**
  - Volunteers, General and Both.
  - Team Members, who can save drafts only.
  - RPM and Project Executive.
  - Implementer, on safe-water projects only.
- **Priority.** phone-first.
- **Data shown.**
  - Project and form version.
  - Identity step and lookup result.
  - Form sections, one per screen on phones.
  - Photos with metadata.
  - Limit used ("18 of 25") and deadline.
  - Duplicate and blocklist alerts.
- **Actions.**

| Action | Permission |
|---|---|
| Lookup by NID or birth registration (online only) | `beneficiary.lookup` |
| Create draft (works offline, client_uuid) | `application.create` |
| Edit draft | `application.edit_draft` |
| Take or choose photos (source per project, UX-11) | `file.upload` |
| Send to office | `application.submit` (workflow) |
| Request correction of a locked field | `beneficiary.correction.request` |

- **States.**
  - Offline: lookup is disabled and a note says the number will be checked on sync.
  - Blocked beneficiary: stops the application (BD-06), with no reason shown to volunteers.
  - Possible duplicate: a warning, the volunteer may continue (BD-04).
  - Own mobile number: an inline error (BD-03).
  - Limit reached or deadline passed: submission is blocked with an explanation (BD-16).
  - Draft autosaved.
  - Photos pending upload.
  - Project closed: creation is hidden.
- **Components.** Field (all types), Form renderer, Alert, Step indicator, File upload, Photo tile, Button, sticky action bar, Offline banner.
- **Layouts.**
  - Phone: the identity step, then one section per screen with next and back, and a sticky "save" and "send" bar.
  - Tablet: the same in a 720 px column.
  - Desktop: all sections on one page with a section index on the left. Officials entering from the office use this layout.
- **Phase · task.** 2 · T2.2 (lookup), T2.4 (renderer), T2.5 (create, submit), T2.7 (offline). **API.** tags beneficiaries, applications, files, sync.

### SCR-032 My applications and application detail

- **Purpose.** The volunteer's own applications by status, and a read view of one application with its step timeline.
- **Roles.** Volunteers and Team Members (own_created). Paid Volunteers see project applications read-only, through SCR-013.
- **Priority.** phone-first.
- **Data shown.**
  - Tabs: draft, pending (submitted, under review, reviewed, waitlisted), approved, rejected.
  - Each card shows:
    - beneficiary name and app number
    - project and village
    - status badge
    - sync badge
  - The detail shows:
    - answers, without official-only sections
    - photos
    - Step / timeline of states, without official actor names (DS §5.18)
    - correction requests
    - the rejection reason where policy allows
- **Actions.**

| Action | Permission |
|---|---|
| View own applications | `application.view` (SELF) |
| Edit draft | `application.edit_draft` |
| Edit pending (before review) | `application.edit_pending` |
| Delete draft or pending | `application.delete_pending` (workflow) |
| Send to office | `application.submit` (workflow) |
| Update an unlocked field | `application.update_unlocked_field` |

- **States.**
  - Empty per tab.
  - Pending sync per card.
  - Blocked volunteer: a notice, and own applications are hidden (BD-06).
  - Transferred applications disappear from the old volunteer's list (BD-07).
- **Components.** Tabs, Table (card list), Badge, Step / timeline, Form renderer (read), Photo tile, Button, Confirm dialog.
- **Layouts.**
  - Phone: a list, then a full-screen detail.
  - Tablet: a list with a drawer.
  - Desktop: a split view.
- **Phase · task.** 2 · T2.5. **API.** tag applications.

### SCR-033 Today's distribution (bulk)

- **Purpose.** The distribution-day screen (blueprint B5, A8.1; BD-21 to BD-23). Pattern: DS §6.1.
- **Roles.** Volunteers (General and Both), RPM and Project Executive.
- **Priority.** phone-first.
- **Data shown.**
  - Header: project, date, area.
  - Stats: assigned, done, remaining, photos pending.
  - Stock summary: received, distributed, remaining, damaged.
  - List of approved beneficiaries in the volunteer's assignment.
  - For each row:
    - item state
    - photo state
    - sync state
- **Actions.**

| Action | Permission |
|---|---|
| Receive stock (dispatch receipt) | `stock.receive` |
| Mark distributed (per row or in bulk) | `distribution.update` |
| Edge state per row: absent, later, not distributed, shortage, damaged or lost, partial, death or relocation (BD-23) | `distribution.update` |
| Take photo or group photo (photo rule per project) | `file.upload` |
| Finish today, with stock reconciliation | `distribution.update`. Officials reconcile with `stock.reconcile` |

- **States.**
  - Offline: everything works and the pending counter is visible.
  - Required photo missing: the row cannot be marked done.
  - Unbalanced stock: finishing needs a reason, and a monitoring alert is raised (BD-22).
  - Approved data changed on the server: the server value wins, with a notice (BD-48).
- **Components.** Card/Stat, Progress bar, Bulk-update list row, sticky bulk action bar, File upload (camera), Photo tile, Alert, Confirm dialog, Offline banner.
- **Layouts.**
  - Phone: stats strip, chips, a list of rows, and a sticky bulk bar.
  - Tablet: two-column rows.
  - Desktop: a table with the same columns, used by officials in the office.
- **Phase · task.** 3 · T3.1. **API.** tags activities, files, sync.

### SCR-034 Today's class (bulk)

- **Purpose.** The Local দায়ী posts the daily class: attendance per family member with absence reasons, and the topics taught from the syllabus (blueprint A9, BD-26; family attendance O-11).
- **Roles.** Local দায়ী, and Both volunteers on their dawah assignments.
- **Priority.** phone-first.
- **Data shown.**
  - Header: class, date, place.
  - Syllabus topic picker.
  - A list of assigned families. Each family expands to its members, each with present or absent and a reason.
  - Totals: present, absent, not yet marked.
- **Actions.**

| Action | Permission |
|---|---|
| Mark attendance (per member or "all present") | `class.record` |
| Record topics taught and learning notes | `class.record` |
| Class photo (if required by the project) | `file.upload` |
| Raise an issue | `issue.raise` |

- **States.**
  - No class scheduled today: an empty state.
  - Offline: works fully.
  - Late posting: an attention item for the Official দায়ী's tracking (SCR-091).
- **Components.** Bulk-update list row (expandable), Field (select, radio), Card/Stat, sticky bulk bar, Offline banner.
- **Layouts.**
  - Phone: the list with expandable families.
  - Desktop: a table with member columns.
- **Phase · task.** 5 · T5.1. **API.** tags activities, sync.

### SCR-035 My team

- **Built (T1.12).** `/my-projects/:projectId/team` for a General or দাঈ-স্বেচ্ছাসেবক volunteer working on the project: the members with their own consent state, remove; the volunteers registered with the caller as reference (name only) to add. A member works only after their own consent and while the main volunteer's assignment lasts.

- **Purpose.** The main volunteer adds Team Members registered with the main volunteer's NID as reference. They see and submit the team's drafts (blueprint A5 "teams"; BR-041).
- **Roles.** volunteer_general and volunteer_both (Local দায়ী only if type Both).
- **Priority.** phone-first.
- **Data shown.**
  - Team members with their status.
  - Drafts created by each member, waiting for submission.
- **Actions.**

| Action | Permission |
|---|---|
| Add or remove a team member | `volunteer.team.manage` |
| Review and submit a member's draft | `application.submit` (workflow) |
| Edit a member's draft before submission | `application.edit_draft` |

- **States.**
  - No members: an empty state with "add member".
  - Member pending approval.
- **Components.** Table (card list), Badge, Button, Confirm dialog.
- **Layouts.**
  - Phone: a list.
  - Desktop: a table.
- **Phase · task.** 1 · T1.12 (team), 2 · T2.5 (draft submission). **API.** tag volunteers.

## 6. Official screens

### SCR-040 Registration approval queue

- **Purpose.** Review volunteer and staff registrations: approve, reject, or request a correction (blueprint A5 "verification and approval").
- **T1.10.** Narrowed in T1.10 (O-67): the page keeps only the staff registrations; volunteer registrations live in the volunteer tab under the "pending" state, and old volunteer links redirect there. Edit requests keep their own page.
- **Roles.**
  - Volunteers: Department Head, Monitoring Team, PM, RPM and Project Executive.
  - Staff: Department Head and Monitoring Team only.
- **Priority.** parity.
- **Data shown.**
  - Queue: name, type, district, submitted date, and waiting time.
  - Detail: all registration fields, with NID and the NID photo under `volunteer.identity` and bank details under `volunteer.bank`.
  - Duplicate checks: the same NID or mobile among volunteers, and whether the person is also a beneficiary (O-20).
- **Actions.**

| Action | Permission |
|---|---|
| Approve volunteer registration | `registration.approve` |
| Approve staff registration and assign a role | `staff.registration.approve` |
| Request correction | `registration.request_correction` |
| Reject with reason | `registration.approve` |

- **States.**
  - Empty queue.
  - Already decided by someone else: the stale-version notice.
- **Components.** Table, split view, Badge, Field (read), Photo tile, Confirm dialog with reason, Alert.
- **Layouts.**
  - Phone: cards, then a full-screen detail with a sticky approve or reject bar.
  - Tablet: a drawer.
  - Desktop: a split view.
- **Phase · task.** 1 · T1.9. **API.** tag registration.
- **Built (T1.9).** `/admin/registrations` in the admin area (`apps/web/src/admin/registrations/`; plan `docs/plans/2026-10-12-1541-feat-registration-approval-handover-plan.md`, U13), open to the Department Head, Monitoring Team, PM, RPM and Project Executive: the pending registrations in scope (name, kind and type, status, district, submitted) and, for the edit approvers, a tab of edit requests with who asked, the field, the new value and the reason (approve, or refuse with a reason). The detail `/admin/registrations/{userId}` shows the details with the address names, the photos streamed by the API (a hidden NID or bank value reads "not visible to you"), the correction rows and the actions: approve (not while blocklisted or in correction), ask for corrections (checked fields and one note), reject with a reason, blocklist or lift with a reason (PM, RPM and the global roles), and for an official the staff decision with a role. Not yet: the split view and the stale-version notice (the decisions are guarded by row locks on the server), filters and paging beyond 100 rows (the volunteer tab of T1.10 takes the list over). Tests `registrations.test.tsx`, `apps/web/e2e/registration.spec.ts`.

### SCR-041 Application review list and detail

- **Purpose.** The officials' main work screen. Review, score, waitlist, approve or reject applications; unlock fields; see the timeline and change log. Blueprint A7; BD-04, BD-17, BD-18; UX-07 (stuck approvals). Pattern: DS §6.2.
- **Roles.**
  - Project Executive: review, with approve if_rpm_grants.
  - RPM: review and approve.
  - PM: house construction final approval.
  - Official দায়ী: if granted (O-27).
  - Implementer: safe water.
  - Department Head and Monitoring Team: everywhere.
  - Procurement Team and Media Team: view only, where their scope allows.
- **Priority.** parity.
- **Data shown.**
  - List columns:
    - app number, beneficiary name, village and union
    - volunteer
    - status badge
    - waiting time
    - priority score
    - duplicate flag
    - photo state
  - Filters: project, status, area, volunteer, score range, flags, waiting more than N days.
  - Quota bars per area above the list (BD-17).
  - Detail: header, signals, score breakdown, answers including official sections (`application.official_section`), photos, timeline and change log.
- **Actions.**

| Action | Permission |
|---|---|
| View | `application.view`, official sections `application.view_official_section` |
| Start review, mark reviewed (send for approval) | `application.review` (workflow) |
| Edit answers during review | `application.review` (workflow) |
| Approve | `application.approve` (workflow; comment required against the score order) |
| Waitlist, with reason; pull from waitlist | `application.waitlist` (workflow) |
| Reject, with reason | `application.reject` (workflow) |
| Link or reject a needs-verification record | `application.verify_needs_verification` (workflow) |
| Unlock a field on an approved application | `application.unlock_field` |
| Transfer applications to another volunteer | `application.transfer` |
| Export the list | `export.forms` |

- **States.**
  - Empty queue: "nothing waiting".
  - Stale version (412).
  - Closed project: read-only (BD-20).
  - Quota exceeded: a warning tone on the quota bar.
  - Zakat fund project with no zakat decision: approve is disabled with the reason (guard `zakat.eligible_if_zakat_fund`).
  - Offline: read from cache, actions disabled.
- **Components.** Table with filters, search and pagination; split view; Badge; Progress bar (quota, score); Alert (signals); Form renderer (read); Step / timeline; Photo tile; sticky action bar; Confirm dialog with reason; Modal (field unlock); Drawer (filters).
- **Layouts.**
  - Phone: cards with status, waiting time and score; filters in a bottom sheet; full-screen detail with a sticky approve, waitlist and reject bar.
  - Tablet: a compact table with the detail in a drawer.
  - Desktop: a split view with the list on the left and the detail on the right; keyboard selection.
- **Phase · task.** 2 · T2.5 (workflow), T2.6 (score, quota, waitlist, unlock). **API.** tags applications, activities.

### SCR-042 Volunteer tab

- **Purpose.** The central, nationwide volunteer list (blueprint A5 "volunteer tab").
- **T1.10.** Built in T1.10 (O-67; plan `docs/plans/2026-10-15-1030-feat-volunteer-beneficiary-tabs-plan.md`; `apps/web/src/admin/volunteers/`, E2E `apps/web/e2e/volunteers.spec.ts`): every volunteer in every state for each holder of `volunteer.view_all`, at `/admin/volunteers`. Filters (division to union, type, state, project, category, blocklisted) are kept in the URL; the search (name, mobile; NID only inside the `volunteer.view_sensitive` scope) is not. The statistics above the list follow the filters: volunteers (total, active, pending, blocked, deactivated; inactive only for those who see categories) and applications (total, approved, under review). The category column and filter appear only with `volunteer.rating.view`. The rating filter comes in Phase 5.
- **Roles.** Officials with `volunteer.view_all`.
- **Priority.** parity.
- **Data shown.**
  - For each volunteer:
    - name and photo
    - type
    - district and upazila
    - projects
    - state: active, inactive or blocklisted
  - Category: officials only (`volunteer.rating`).
  - Filters: type, area, project, category, state.
- **Actions.**

| Action | Permission |
|---|---|
| View the list and open a profile | `volunteer.view_all` |
| Export volunteers | `export.volunteers` |

- **States.**
  - Empty filter result.
  - Blocklisted badge.
- **Components.** Table with filters, Badge, Avatar, Drawer (filters).
- **Layouts.**
  - Phone: cards.
  - Tablet: a compact table.
  - Desktop: a dense table opening SCR-043 in the split view.
- **Phase · task.** 1 · T1.10. **API.** tag volunteers.

### SCR-043b Volunteers of a project (assignment)

- **Built (T1.12).** `/admin/projects/:projectId/volunteers` ("স্বেচ্ছাসেবক" on the project page): the assignments in the caller's areas with permission set, paid flag and consent state; "স্বেচ্ছাসেবক অ্যাসাইন করুন" for the RPM, the executive with the RPM's grant and the global roles (approved, not blocked volunteers of the caller's areas, filtered by area and searched by name or mobile, several at once, one set by type or a chosen one, the paid flag for the RPM); change the set (only the sets of the type) or the paid flag; end with a reason; the RPM's switch per executive "স্বেচ্ছাসেবক অ্যাসাইন করতে পারবেন" with a reason. Works at 360 px.

### SCR-043 Volunteer profile

- **Purpose.** Everything about one volunteer (constitution §12 key screen): data, projects and permissions, team, work summary, ratings and categories, animal allocation, blocklist and transfer.
- **T1.10.** Built in T1.10 (O-67, D-094): `/admin/volunteers/:volunteerId` (a pending volunteer the caller decides on opens as the registration review, which stays open with approval held back while a correction is open) with the sections identity, address, education, profession and skills, projects and permission sets, team (name, type and state of each member), work summary placeholder, ratings and category, blocklist, device sessions. NID, NID photos, date of birth, blood group and bank appear only inside the caller's `volunteer.view_sensitive` scope. Each action button (approve, request correction, block, unblock, revoke a session) appears only when the server says the caller may do it to this volunteer.
- **Roles.** Officials. Sensitive parts follow the field classes.
- **Priority.** parity.
- **Data shown, by tab.**
  - Overview: data, with NID under `volunteer.identity` and bank under `volunteer.bank`.
  - Projects and permissions: assignments, permission set, paid flag.
  - Team.
  - Work summary: applications, approvals, distributions, photos, classes and timing, filterable by year and project (BD-41; Phase 5).
  - Ratings and categories (`volunteer.rating`): separate score sets for application and distribution work and for dawah, never averaged (Phase 5).
  - Animal allocation (Phase 4).
  - Activity history.
- **Actions.**

| Action | Permission |
|---|---|
| Assign to a project, end an assignment | `volunteer.assign_project` |
| Set project permissions for a volunteer | `project.volunteer_grant.manage` |
| Mark as paid volunteer on a project | `volunteer.mark_paid` |
| Move a team member to another team | `volunteer.team.transfer` |
| Transfer applications to another volunteer (BD-07) | `application.transfer` |
| Blocklist or unblock, with reason | `volunteer.block`, `volunteer.unblock` |
| Set category (with comment) | `volunteer.category.set` |
| View and finalize ratings | `volunteer.rating.view`, `volunteer.rating.set` |
| Allocate or cancel animals (BD-33) | `animal.allocate`, `animal.deallocate` |
| Approve an edit request | `edit_request.approve` |
| Deactivate a volunteer account | `user.deactivate_volunteer` |

- **States.**
  - Blocklisted: a danger Alert with the reason for officials (`blocklist.reason`).
  - Deactivation blocked by open applications: an explanation with a transfer link (O-25 `no_open_applications`).
  - Edit request pending: a diff view.
- **Components.** Tabs, Card, Field (read), Badge, Table, Row / Toggle (permissions), Confirm dialog with reason, Modal (transfer with selection), Avatar.
- **Layouts.**
  - Phone: a header card, then scrollable tabs, with actions in a "more" sheet.
  - Tablet: tabs in full width.
  - Desktop: a header with actions, tabs, and two-column content.
- **Phase · task.** 1 · T1.10, T1.12; work summary and ratings 5 · T5.3; animals 4 · T4.4. **API.** tags volunteers, access.

### SCR-044 Beneficiary tab

- **Purpose.** The central list of beneficiary profiles across years and projects (blueprint A7 "beneficiary tab").
- **T1.10.** Built in T1.10 (O-67; `apps/web/src/admin/beneficiaries/`, E2E `apps/web/e2e/beneficiaries.spec.ts`; the 360° shell at `/admin/beneficiaries/:beneficiaryId`, merge in T2.2): `/admin/beneficiaries`, the same filter pattern (area, type, project, year, blocklisted), search by name, by mobile with the contact class, by NID inside the `beneficiary.view_nid` scope; statistics (total, assisted this year, blocked). The Media and Procurement Teams get the limited view of BR-253.
- **Roles.**
  - Officials with `beneficiary.view_all`.
  - Media Team (masked).
  - Procurement Team: house construction only.
- **Priority.** parity.
- **Data shown.**
  - For each beneficiary:
    - BEN-ID
    - name
    - father or husband name
    - union and village
    - number of applications and projects
    - status: active, deceased, relocated
    - blocklist flag
  - NID only under `beneficiary.nid`.
  - Search: by name and BEN-ID, or by NID in the request body (never in the URL).
- **Actions.**

| Action | Permission |
|---|---|
| View the list and open a profile | `beneficiary.view_all` |
| Search by NID or birth registration | `beneficiary.lookup` |
| Export beneficiaries | `export.beneficiaries` |

- **States.**
  - Empty search.
  - A merged (retired) BEN-ID shows the kept profile (BD-05).
- **Components.** Table with filters and search, Badge, Drawer.
- **Layouts.**
  - Phone: cards.
  - Desktop: a table opening SCR-045 in the split view.
- **Phase · task.** 1 · T1.10 (list frame), 2 · T2.2. **API.** tag beneficiaries.

### SCR-045 Beneficiary 360 profile and merge

- **Purpose.** One beneficiary's full history (blueprint A7 "profile 360"). It covers identity, family, all applications across years, assistance received, photos, follow-ups, media consent, blocklist and status. It also hosts the merge flow for duplicates (BD-05).
- **T1.10.** A shell is built in T1.10 (O-67): `/admin/beneficiaries/:beneficiaryId` with the sections basic data and address, projects by year, application history, distribution and implementation, dawah, follow-ups and activity history, each with real data where it exists and an empty state otherwise. Merge and corrections stay in T2.2.
- **Roles.** Officials. Merge by PM, Monitoring Team and Department Head. The RPM may propose a merge. Only the Monitoring Team reverts one.
- **Priority.** parity.
- **Data shown, by tab.**
  - Overview: identity under `beneficiary.nid`, contact, address, family members.
  - Applications: a timeline across projects and years.
  - Assistance: assistance and payments.
  - Photos.
  - Follow-up evaluations.
  - Media consent and channels.
  - Change log: mobile and address changes, corrections.
  - Merge candidates: name with father, name with DOB and union, or the same mobile.
- **Actions.**

| Action | Permission |
|---|---|
| View the profile | `beneficiary.view_all`; NID `beneficiary.view_nid` |
| Request a correction of a locked field | `beneficiary.correction.request` |
| Approve a correction | `beneficiary.correction.approve` |
| Propose a merge | `beneficiary.merge.propose` |
| Merge (side-by-side comparison, choose values, confirm) | `beneficiary.merge` |
| Revert a merge | `beneficiary.merge.revert` |
| Blocklist or unblock, with reason | `beneficiary.block`, `beneficiary.unblock` |
| Change status (deceased, relocated) | `beneficiary.status.change` |
| Record media consent | `beneficiary.consent.record` |
| Add a follow-up evaluation | `followup.record` |
| Beneficiary journey report | `report.beneficiary_journey` |

- **States.**
  - Retired profile: a banner with a link to the kept profile.
  - Merge pending.
  - Blocked: a danger Alert.
  - Deceased: read-only, except follow-up.
- **Components.** Tabs, Card, Step / timeline, Table, Photo tile, Alert, Confirm dialog with reason, Modal (merge compare, two columns on desktop, stacked on phone).
- **Layouts.**
  - Phone: a header card and scrollable tabs. The merge comparison is stacked field by field.
  - Desktop: a header, tabs and two-column content. The merge comparison is shown side by side.
- **Phase · task.** 2 · T2.2. Follow-up 5 · T5.3. Consent 5 · T5.5. **API.** tag beneficiaries.

## 7. Management screens

### SCR-050 Project dashboard

- **Purpose.** One project's progress, budget and problems, with progress first (UX-10). It is a key screen in the constitution §12 list (pattern DS §6.6).
- **Roles.** PM (program), RPM and Executive (own region), Department Head, Monitoring Team, Finance Team (view).
- **Priority.** parity.
- **Data shown.** In this order:
  1. Progress stat cards: target, applications, approved, distributed or completed.
  2. Application funnel by state.
  3. Monitoring alerts for the project.
  4. Budget bars of the ledger buckets: allocated, approved, spent, remaining, advance, voucher verified, volunteer expense claimed and paid (BD-29).
  5. Area table.
  6. Volunteer summary: active volunteers and applications per volunteer.
  7. Stock reconciliation, for distribution projects.
- **Actions.**

| Action | Permission |
|---|---|
| View dashboard | `dashboard.project.view` |
| View budget and ledger detail | `budget.view`, `ledger.view` |
| Open alerts | `monitoring.view` |
| Export | `export.list`, `export.finance` |

- **States.**
  - A project without data yet shows targets only.
  - Partial data while loading per card.
  - Closed project: a read-only banner.
- **Components.** Card/Stat, Progress bar (stacked), Table, Alert, Tabs (overview, budget, areas, volunteers), chart (T3.3 library), Drawer (filters).
- **Layouts.**
  - Phone: stacked cards in the order above. Charts collapse to bars with numbers.
  - Tablet: two columns.
  - Desktop: a 12-column grid with progress across the top, alerts and budget side by side, then tables.
- **Phase · task.** 3 · T3.3. **API.** added to openapi.yaml in Phase 3.

### SCR-051 Admin area shell

- **Purpose.** The frame of the management screens and admin settings (UX-15): later admin pages (settings and audit log in T1.13, dashboards in T3.3 and T6.1) open inside it.
- **Roles.** Department Head, Monitoring Team, Program Manager, and since T1.9 the RPM and the Project Executive for the registrations page. Any other signed-in user sees a "no access" page; a signed-out visitor goes to the login screen. The server enforces every admin permission; the shell only hides.
- **Priority.** parity, with the "best on a larger screen" notice under 768 px (UX-04).
- **Data shown.** Top bar: system name, the signed-in user's name, log out. Sidebar: the admin destinations, with the language toggle as its last item (UX-19; at the end of the row on phones). Content: the dashboard placeholder with today's date (dd-mm-yyyy, English digits).
- **Actions.** Open a destination; switch language; log out (`authenticated`).
- **Entry.** The "অ্যাডমিন" / "Admin" button on the home page, shown to the three roles; the URL `/admin`.
- **Layout and components.** DS §4.5: `NavItem`, `Alert`, `Card`, the language switch and the log-out button of the account screens; lazy route chunk.
- **Built.** T1.7d (plan `docs/plans/2026-10-11-1742-chore-stack-adoption-admin-minimal-plan.md`, U11); tests `apps/web/src/admin/admin.test.tsx`, `apps/web/e2e/admin.spec.ts`.

### SCR-063 Officials

- **Purpose.** The officials of the ERP kept apart by affiliation (DECISION_LOG D-097): the department's own staff, other departments of the Foundation, outside partners; the Department Head and the Monitoring Team create an official and keep the profile.
- **Roles.** Read: Department Head, Monitoring Team, PM (program), RPM (region) through `permission.view`. Create and new link: `user.create`; profile: `user.profile.manage` (both global roles only, GLOBAL scope).
- **Priority.** parity; the title actions wrap on a phone and the tab list scrolls inside the page.
- **Data shown.** The view switch "তালিকা | অর্গানোগ্রাম" beside the title; three stat cards with the count of each affiliation; three tabs (ডিপার্টমেন্ট কর্মী, ফাউন্ডেশনের অন্য বিভাগ, বাইরের সহযোগী) with search (name, job ID, email, mobile) and the program and role filters; rows: initials and name with the job ID as a chip (or "Job ID এখনও নেই"), designation with the roles as badges, program (department) or unit (others, "—" when none), state with an icon ("পাসওয়ার্ডের অপেক্ষায়" for an account whose link is still open); a card per official on a phone.
- **Actions.** "নতুন অফিসিয়াল" in two steps with a step indicator (1 পরিচয় ও যোগাযোগ: job ID, name, designation, email, mobile, checked before the second step opens; 2 ভূমিকা ও অবস্থান: role without the Department Head role, affiliation and unit, program, division, supervisor), two columns from 640 px, a bottom sheet on a phone; the profile edit uses the same steps without email, mobile and role; after saving, the link dialog shows once whether the email went out and the link with "লিঙ্ক কপি করুন"; per row the profile edit (with the version read when it opened) and, while no password is set, "নতুন লিঙ্ক" with an optional corrected email; "অর্গানোগ্রাম" opens SCR-064.
- **States.** Loading, empty per filter, error with retry; server messages per field (`user.job_id_taken`, `user.supervisor_invalid`, …).
- **Components.** Tabs, Table with TableToolbar, Badge, Modal, TextField, Select, RadioGroup, UserSearch, Alert.
- **Built.** `apps/web/src/admin/staff/StaffPage.tsx`, `OfficialDialog.tsx`, `LinkDialog.tsx`, `RenewLinkDialog.tsx`; tests `staff.test.tsx`, `apps/web/e2e/staff-accounts.spec.ts`.

### SCR-064 Organogram

- **Purpose.** The department's structure by program, computed from roles, home programs, the programs' PMs and the supervisor line (BR-263); never drawn by hand.
- **Roles.** Department Head, Monitoring Team, PM, RPM (`permission.view`, the officials of their scope).
- **Entry and exit.** The breadcrumb কর্মী / অর্গানোগ্রাম (a back link on a phone) and the view switch "তালিকা | অর্গানোগ্রাম" beside the title.
- **Data shown.** Three stat cards (department staff, programs, not placed yet), a program filter and "সব খুলুন" / "সব গুটিয়ে নিন"; the chart: "ডিপার্টমেন্টের নেতৃত্ব" (the global roles) on top, connector lines down to a green card per program with its member count, each official nested under the supervisor (name, job ID, designation, roles, a badge while waiting for the password or suspended), "এখনও স্থান নির্ধারিত হয়নি" for officials without a place. Other departments, outside partners and deactivated officials never appear.
- **Layout.** From 768 px a chart from the top down on a dotted canvas that scrolls sideways and opens at its centre: connector lines between the levels, a fold or open button under each card with reports, the last level of only leaves standing in a column; the card shows the initials, name, designation and job ID with a colour band by role (leadership, PM, RPM, field staff). On a phone the same lists read as an indented tree with a line per level. Officials not placed yet stand in a grid of cards below.
- **Built.** `apps/web/src/admin/staff/OrganogramPage.tsx`, `organogram.css`; tests `organogram.test.tsx`, E2E above.

## 8. Setup screens (desktop first, UX-04)

### SCR-060 Project setup with component toggles

- **Built (T1.11, a wizard since UX-20).** `/admin/projects/new` starts the step-by-step setup: step 1 basic information (code, names, year, program, workflow) creates the draft with Next; `/admin/projects/:projectId/setup?step=` walks the other steps one at a time: components with their settings in a dialog, budget and fund sources saved together (the PM and the global roles only), application window and limit, areas and RPMs, staff access, the dawah syllabus while dawah is on, and the review with the project's facts, the missing items (each opens its step) and "সক্রিয় করুন". Back, Next and a step of the indicator save the step on screen first; "খসড়া সেভ করে বের হন" saves and opens the project; a return without `?step=` opens the first step with something missing. The step indicator marks the checked steps complete or missing. Read-only with a notice while closing, closed or cancelled; on a phone only the name, the dates and the switches change. The project list (`/admin/projects`, state chips and the program and year filters in the address) and the project overview (`/admin/projects/:projectId`, the facts and the lifecycle buttons with their reasons; a refused activation lists what is missing) are part of this task; the programs page is `/admin/programs`. Not yet: templates and copies, quotas, scoring, the rules texts, the form link and the document checklist (T1.12 and later), save as template.
- **Built (T1.12).** Step 1 offers three starting points: a workflow, a template of the library, or a copy of a previous project (only the projects the caller may view); a template or a copy brings the components with their settings, the syllabus and the rules, never the budget, dates, areas, staff or volunteers. A "নিয়মাবলি" step before the review edits the four rules texts in both languages (the Local দায়ী part only while dawah is on; a draft may keep them unfinished, a running project keeps every required text; each saved change is a new version that every volunteer accepts again), and the review lists the missing rules with a link to that step. The project page offers "টেমপ্লেট হিসেবে সংরক্ষণ" (a new template, or in place of an existing one). The template library is at `/admin/templates` (sidebar "টেমপ্লেট", the project-creating roles): every template of the organisation with workflow, version, last change and state; rename, describe, deactivate or activate (never delete); inactive ones on request.

- **Purpose.** The PM creates and configures a project from a template or a previous project. They turn components on and off, set the form, budget, deadlines, areas, quotas, rules and the photo rule, and save a draft before activation (BD-09, BD-10, BD-16, BD-20; blueprint A6).
- **Roles.** PM. Department Head and Monitoring Team.
- **Priority.** desktop-first.
- **Data shown.**
  - Steps or sections:
    - basics: name, year, program, fund sources
    - template or copy source
    - components, as toggle rows with their settings
    - form, linking to SCR-061
    - budget: target × cost per beneficiary
    - deadlines and the per-volunteer limit
    - areas and RPM assignment
    - quotas
    - scoring criteria
    - photo rule and photo source (UX-11)
    - rules text for consent
    - document checklist (documentation module, built last, O-34)
  - Lifecycle badge: draft, active, closing, closed.
- **Actions.**

| Action | Permission |
|---|---|
| Create a project, or copy from a template or previous project | `project.create` |
| Configure (components, settings, budget, rules) | `project.configure` |
| Assign areas and RPMs | `project.area.assign` |
| Grant staff access | `project.staff_access.manage` |
| Quotas and scoring criteria | `project.quota.manage` |
| Fund sources | `fund_source.manage` |
| Activate | `project.activate` |
| Extend deadline, with reason | `project.deadline.extend` |
| Close, reopen with reason | `project.close`, `project.reopen` |
| Save as template | `project.template.manage` |

- **States.**
  - Draft autosaved.
  - Validation before activation lists the missing items.
  - Component locked after activation: a lockedReason.
  - Closed: read-only.
  - Phone: the "best on a larger screen" Alert, with only rename, dates and toggles editable.
- **Components.** Step / timeline (section index), Row / Toggle, Field, Table, Card, Alert, Confirm dialog, Drawer (component settings).
- **Layouts.**
  - Desktop: the section index on the left and the editor in the centre, with a summary of the selected components on the right.
  - Tablet: one column with the summary in a drawer.
  - Phone: read-mostly sections.
- **Phase · task.** 1 · T1.11 (core), T1.12 (templates, consent, assignment). **API.** tags programs, projects, templates.

### SCR-061 Form builder

- **Purpose.** The PM builds the project's application form. It is assembled from the section library and the field library, with field settings, visibility, conditions, calculations, a live preview and versions (BD-12 to BD-14, blueprint B3).
- **Roles.** PM. Department Head and Monitoring Team. The library is managed with `form.library.manage`.
- **Priority.** desktop-first.
- **Data shown.**
  - Left: the section library and field library with search, and a tick to add.
  - Centre: the form outline. Sections are expandable, ordered with move-up and move-down buttons; there is no drag and drop.
  - Right: field settings:
    - label in bn and en
    - type
    - required
    - visibility (all or official only)
    - options and branching
    - conditions
    - calculation
  - A live preview that toggles between phone and desktop, in bn or en.
  - Version list with a change summary.
  - The mandatory fields (BD-13) are marked and cannot be removed.
- **Actions.**

| Action | Permission |
|---|---|
| Edit the draft version | `form.build` |
| Publish (creates an immutable version) | `form.publish` |
| Configure the public link (tree planting) | `form.public_link.manage` |
| Manage the section and field library | `form.library.manage` |

- **States.**
  - Published versions are read-only, with a "create new version" action.
  - Logic errors, such as a circular condition, show inline.
  - Unsaved changes trigger a warning on leave.
  - Phone: the notice; label and option text edits only.
- **Components.** Table (library list), Tabs, Field, Row / Toggle, Drawer (preview on tablet), Form renderer (preview), Modal (condition editor), Badge (version), Confirm dialog (publish).
- **Layouts.**
  - Desktop: three panes (library, outline, settings) with the preview as a tab or a fourth pane at 1280 px and wider.
  - Tablet: the outline with settings in a drawer.
  - Phone: read-mostly.
- **Phase · task.** 2 · T2.4. **API.** tag forms.

### SCR-062 Permission panel

- **Purpose.** The Department Head or Monitoring Team grants or revokes any permission for anyone at any scope. Every change is audited (blueprint A4 "permission panel").
- **Built (T1.8).** `/admin/permissions` in the admin area (`apps/web/src/admin/permissions/`): user search, roles read only (O-61), effective permissions grouped by module with scope and source, a dialog to grant or remove a permission with scope, reason and optional expiry, and ending a panel grant with a reason. Recent changes are read in the audit viewer of T1.13 (O-61); project staff access and project grants have their API (`POST /projects/{id}/grants`) and get their screen with the project screens. Scope references other than GLOBAL, SELF and ASSIGNED are typed as ids until the program, project and location pickers exist.
- **Roles.**
  - Department Head and Monitoring Team: the global panel.
  - PM and RPM: project staff access, through the project screens.
- **Priority.** desktop-first.
- **Data shown.**
  - User search.
  - The user's roles and effective permissions, grouped by module with their scope and source (role default, panel grant, project grant).
  - Recent changes.
- **Actions.**

| Action | Permission |
|---|---|
| View effective permissions | `permission.view` |
| Grant or revoke a permission with scope and reason | `permission.panel.manage` |
| Grant project staff access | `project.staff_access.manage` |
| Grant volunteer project permissions | `project.volunteer_grant.manage` |
| Transfer the system-owner role | `system.owner.transfer` |
| Revoke a user's sessions | `session.revoke_user` |
| Change account state (suspend, reactivate) | `user.state.change` |
| Start or complete a staff handover (BD-08) | `user.handover` |

- **States.**
  - The Main Admin account is protected and cannot lose its owner rights through the panel.
  - Grants that change take effect at the next request (permission_version).
  - Phone: the notice; view only.
- **Components.** Table, Row / Toggle, Field (search, scope select), Badge (source), Confirm dialog with reason, Tabs, Drawer.
- **Layouts.**
  - Desktop: the user list on the left and the permission matrix by module on the right.
  - Tablet: the list with the matrix in a drawer.
  - Phone: read-only cards.
- **Phase · task.** 1 · T1.8. **API.** tags access, users, sessions.

## 9. Later-phase key screens

### SCR-070 Issue log

- **Purpose.** Raise, assign and resolve issues with photos on a project. Mainly house construction; safe water as well. Each entry is visible to everyone on the project (BD-24, BD-25).
- **Roles.**
  - Raise: Paid Volunteer, volunteer, Local দায়ী, RPM, Executive, Procurement Team.
  - Resolve: PM, RPM, Executive and the Procurement Team (own_or_paid_volunteer_issues).
- **Priority.** parity. Paid volunteers raise issues on phones.
- **Data shown.**
  - For each issue:
    - title and type
    - house or site and stage
    - who raised it and when
    - photos
    - assignee
    - status: open, assigned, resolved
    - the resolution entry
- **Actions.**

| Action | Permission |
|---|---|
| Raise, with photos | `issue.raise` |
| Assign | `issue.assign` |
| Resolve, with an entry | `issue.resolve` |

- **States.**
  - No issues.
  - Offline raising, queued.
  - Resolved issues are read-only.
- **Components.** Table, split view, Badge, File upload, Photo tile, Step / timeline (issue history), Confirm dialog.
- **Layouts.**
  - Phone: cards and a "raise issue" button, with a full-screen detail.
  - Desktop: a split view.
- **Phase · task.** 4 · T4.1. **API.** added in Phase 4.

### SCR-071 Donor list

- **Purpose.** Qurbani donors, imported from the SSL sheet and added by the cash-donor form, merged into one list. It shows share allocation and the message status (BD-32 to BD-34).
- **Roles.** PM, RPM and Project Executive. Donor data is under `donor.data` and never shown to volunteers, Media, Finance or Procurement.
- **Priority.** parity.
- **Data shown.**
  - For each donor:
    - source: SSL or cash
    - transaction id
    - name, phone, email
    - amount
    - cow shares and goats
    - approval status, approver
    - animal numbers
    - pre-notification and photo-email status
  - Import history.
- **Actions.**

| Action | Permission |
|---|---|
| View donors | `donor.view` |
| Import the SSL sheet | `donor.import` |
| Add or edit a cash donor, approve | `donor.manage` |
| Send pre-notification or photo emails | `donor.message.send` |

- **States.**
  - Import preview with row errors and duplicates (by transaction id).
  - Messages failed: retry.
  - SMS provider not configured: a notice (O-33).
- **Components.** Table with filters, File upload (sheet), Modal (import preview), Badge (message status), Confirm dialog.
- **Layouts.**
  - Phone: cards.
  - Desktop: a dense table.
- **Phase · task.** 4 · T4.4. **API.** added in Phase 4.

### SCR-072 Document register

- **Purpose.** The SOP document register per project. Each checklist item shows its requirement level, responsible official role, deadline, status, the soft-copy file and the hard-copy location code. Overdue items get a countdown and a non-compliance mark, and the quarterly audit is one click (BD-35 to BD-39). Built last (O-34).
- **Roles.** Officials. Implementer. Monitoring Team for the audit.
- **Priority.** parity.
- **Data shown.**
  - Checklist per project, grouped by requirement level: required, if needed, optional.
  - Countdown of working days (BR-166).
  - The non-compliance flag.
  - The deficiency-report link.
- **Actions.**

| Action | Permission |
|---|---|
| View register | `document.register.view` |
| Submit a document (file plus hard-copy code) | `document.submit` |
| Extend a deadline, with reason | `document.deadline.extend` |
| File a deficiency report | `deficiency.report` |
| Run the quarterly audit report | `document.audit.run` |

- **States.**
  - All complete.
  - Overdue: a warning, then danger.
  - Legacy (pre-SOP) items are marked and exempt.
  - Files quarantined until scanned.
- **Components.** Table, Badge, Progress bar, File upload, Confirm dialog with reason, Alert.
- **Layouts.**
  - Phone: cards per item.
  - Desktop: a table grouped by requirement level.
- **Phase · task.** T5.4, built last after 6 · T6.1 and before the security audit T6.3 (O-34). **API.** added with the documentation module.

## 10. Remaining screens (expanded at the start of their phase)

| Id | Screen | Purpose | Main roles | Key permission | Priority | Phase · task |
|---|---|---|---|---|---|---|
| SCR-080 | Today's construction work (bulk) | Paid volunteers post daily stage progress with photos per house | Paid Volunteer, RPM, Executive | `progress.update` | phone-first | 4 · T4.1 |
| SCR-081 | Construction stages per house | Stage strip, photos, issues, vouchers, for one house | RPM, Executive, PM | `progress.update` | parity | 4 · T4.1 |
| SCR-082 | Site verification and visit (bulk) | Visit comments and recommendations (tree planting), decision | RPM, Executive, volunteers | `site_verification.record`, `site_verification.decide` | phone-first | 4 · T4.3 |
| SCR-083 | Safe-water advance, vouchers and return | Advance, voucher submission and verification, returned amount | Implementer, RPM, Executive | `voucher.submit`, `voucher.verify` | parity | 4 · T4.3 |
| SCR-084 | Stock dispatch and reconciliation | Dispatch to volunteers, reconcile sent = distributed + remaining + damaged | RPM, Executive | `stock.dispatch`, `stock.reconcile` | parity | 3 · T3.1 |
| SCR-085 | Expense claim (volunteer) | Claim operational expenses with vouchers by category | volunteers, Local দায়ী, Paid Volunteer | `expense.claim.submit` | phone-first | 3 · T3.2 |
| SCR-086 | Expense verification and payment record | Verify claims; record payment date, amount, method and transaction id (O-22, O-24) | Executive, RPM, PM | `expense.claim.verify`, `payment.record` | parity | 3 · T3.2 |
| SCR-087 | Budget and ledger | Budget buckets and ledger entries per project and fund source | PM, RPM, Finance | `budget.view`, `ledger.view` | parity | 3 · T3.2 |
| SCR-088 | Beneficiary support payment and evidence | Exam-gated payment, materials, placard photo, vouchers, lock (BD-27) | RPM, Executive, PM | `payment.record`, `voucher.verify` | parity | 4 · T4.2 |
| SCR-089 | Zakat assessment | Computed assets, debts and net against the nisab snapshot; eligibility decision (BD-28) | Official দায়ী | `zakat.decide` | parity | 4 · T4.2 |
| SCR-090 | Exams | Initial and final exam results side by side (BD-26) | Official দায়ী, RPM, Local দায়ী if granted | `exam.record`, `exam.delegate` | parity | 4 · T4.2 |
| SCR-091 | Dawah tracking view | Regularity of Local দায়ীs' daily updates | Official দায়ী, RPM | `dawah.tracking.view` | parity | 5 · T5.1 |
| SCR-092 | Call log | Follow-up calls with outcome | Official দায়ী | `call_log.record` | parity | 5 · T5.1 |
| SCR-093 | দায়ী assignment | Assign Local দায়ীs to families, split by gender (BD-26) | RPM, Official দায়ী | `daee.assign` | parity | 5 · T5.1 |
| SCR-094 | Animal allocation and photos | Animal numbers and shares; manual allocation on the volunteer profile; three photos per animal (BD-33, BD-34) | PM, RPM, Executive, volunteers | `animal.allocate`, `animal.photo.upload` | parity | 4 · T4.4 |
| SCR-095 | Monitoring control centre | Alerts, stuck work, regularity, budget use (BD-42) | Head, Monitoring | `monitoring.view`, `alert.settings.manage` | parity | 5 · T5.2 |
| SCR-096 | Audit log viewer | Filterable audit trail with before and after (`audit.detail`) | Head, Monitoring, PM, RPM | `audit.view`, `audit.export` | parity | 5 · T5.2 |
| SCR-097 | Templates | Master templates and copies (BD-10) | PM | `project.template.manage` | desktop-first | 1 · T1.12 |
| SCR-098 | Work summaries | Per staff member and volunteer, filterable, exportable (BD-41) | Head, Monitoring, PM, RPM | `work_summary.view` | parity | 5 · T5.3 |
| SCR-099 | Ratings at project close | Proposed scores per criterion, finalize, categories (BD-40) | PM, RPM, Executive | `volunteer.rating.set`, `volunteer.category.set` | parity | 5 · T5.3 |
| SCR-100 | Project closing and reopening | Close checklist, read-only after close, reopen with reason (BD-20) | PM | `project.close`, `project.reopen` | parity | 5 · T5.3 |
| SCR-101 | Program dashboard | Program progress first, budget, areas | PM, Head, Monitoring, Finance | `dashboard.program.view` | parity | 6 · T6.1 |
| SCR-102 | Central dashboard | Seven KPI groups (BD-43), progress first (UX-10) | Head, Monitoring | `dashboard.central.view` | parity | 6 · T6.1 |
| SCR-103 | Dawah dashboard | Classes, attendance, exams | Head, Monitoring, Official দায়ী, RPM | `dashboard.dawah.view` | parity | 6 · T6.1 |
| SCR-104 | Exports | Export jobs list and download (signed URLs) | officials | `export.list` | parity | 2 · T2.8 |
| SCR-105 | Staff handover | Reassign pending work before deactivation (BD-08). Built (T1.9, plan U14): `/admin/handover` finds an official, lists the pending work by category, hands one item or all to an official, completes the handover and deactivates with a reason; tests `apps/web/src/admin/handover/handover.test.tsx`, `apps/web/e2e/handover.spec.ts` | Head, Monitoring | `user.handover`, `user.state.change` | desktop-first | 1 · T1.9 |
| SCR-106 | Admin settings | Organization, nisab, holidays, providers, alert thresholds, notification templates, i18n | Head, Monitoring, PM (nisab) | `settings.manage`, `nisab.set`, `holiday.manage`, `provider.settings.manage`, `notification.template.manage`, `i18n.manage` | desktop-first | 1 · T1.13, 6 · T6.2 |
| SCR-107 | Locations and reference lists | Division to union master (four levels, O-09); reference lists (O-38) | Head, Monitoring | `location.manage`, `settings.manage` | desktop-first | 1 · T1.13 |
| SCR-108 | Media tab and story editor | Media work list, story writing, channel and date, publishable photos (O-28, BD-38) | Media Team | `media.subject.manage`, `story.manage` | parity | 5 · T5.5 |
| SCR-109 | Deficiency report | The deficiency report fields (SOP), escalation of repeats (BD-37) | officials | `deficiency.report` | parity | after 6 · T6.1: T5.4 (O-34) |
| SCR-110 | Checklist template editor | Document checklist templates (BD-35) | Head, Monitoring, PM | `template.checklist.manage` | desktop-first | after 6 · T6.1: T5.4 (moved from T1.13 by O-34) |
| SCR-111 | Public application form (tree planting) | Public link without login; entries go to needs verification (O-08, O-13) | the public | `public` | phone-first | 4 · T4.3 |
| SCR-112 | Programs | Programs list, create, assign PM | Head, Monitoring | `program.create`, `program.assign_pm`, `program.view` | desktop-first | 1 · T1.11 |

## 11. Coverage matrix

### 11.1 Constitution §12 key screens

| Key screen | Screen |
|---|---|
| Project setup with component toggles | SCR-060 |
| Form builder (section library, preview, field settings, versions) | SCR-061 |
| Application review list with detail panel, step timeline and change log | SCR-041 |
| Project dashboard with budget bars, funnel, monitoring alerts, volunteer summary | SCR-050 |
| Mobile volunteer home with offline banner | SCR-010 |
| Mobile new application with NID lookup and auto-fill | SCR-031 |
| Mobile today's distribution bulk screen | SCR-033 |
| Volunteer profile with permissions, work summary, ratings, animal allocation, blocklist/transfer | SCR-043 |
| Registration with OTP | SCR-002 |
| Document register | SCR-072 |
| Issue log | SCR-070 |
| Donor list | SCR-071 |

### 11.2 My Work per role

| Role (permissions.yaml) | Home |
|---|---|
| department_head, monitoring_team | SCR-017 |
| program_manager | SCR-016 |
| regional_program_manager, project_executive | SCR-015 |
| implementer | SCR-018 (derived) |
| official_daee | SCR-014 |
| procurement_team | SCR-021 (derived) |
| media_team | SCR-019 (derived) |
| finance_team | SCR-020 (derived) |
| volunteer_general, volunteer_both | SCR-010 (Both adds the SCR-012 widgets) |
| volunteer_local_daee | SCR-012 |
| volunteer_team_member | SCR-011 |
| volunteer_paid | SCR-013 |

### 11.3 Screens named by task T0.19

| Named screen | Screen |
|---|---|
| Registration | SCR-002, SCR-003 |
| Consent | SCR-030 (project rules); media consent in SCR-045 |
| Permission panel | SCR-062 |
| Document register | SCR-072 |
| Issue log | SCR-070 |
| Donor list | SCR-071 |
| Today's class | SCR-034 |

### 11.4 DESIGN_BRIEF §6 mockup set (T0.19b)

| Mockup | Screens |
|---|---|
| 1. Login and registration with the two OTP steps | SCR-001, SCR-002 |
| 2. Volunteer home | SCR-010 |
| 3. New application | SCR-031 |
| 4. My applications and detail | SCR-032 |
| 5. Today's distribution | SCR-033 |
| 6. Notifications inbox and sync status | SCR-004, SCR-005 |
| 7. Review queue and detail panel | SCR-041 |
| 8. Volunteer tab and profile | SCR-042, SCR-043 |
| 9. Beneficiary 360 profile | SCR-045 |
| 10. Project dashboard | SCR-050 |
| 11. Management home | SCR-017 |
| 12. Project setup | SCR-060 |
| 13. Form builder | SCR-061 |
| 14. Permission panel | SCR-062 |

## 12. Notes for the owner

- **Derived homes.** SCR-018 to SCR-021 (Implementer, Media, Finance and Procurement homes) are derived from the second A4 table and O-26, O-28. The blueprint's My Work table does not list them. The owner may adjust them when the mockups are reviewed.
- **Later-phase screens.** The section 10 screens get full entries and mockups at the start of their phase.
