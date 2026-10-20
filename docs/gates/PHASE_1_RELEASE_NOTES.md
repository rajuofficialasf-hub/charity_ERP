# Phase 1 release notes — Foundation

## সংক্ষেপে (বাংলা)

Phase 1-এ ERP-র ভিত তৈরি হয়েছে: লগইন ও ডিভাইস সেশন, ভূমিকা ও পারমিশন প্যানেল, স্বেচ্ছাসেবকের নিবন্ধন-সংশোধন-অনুমোদন, অ্যাডমিনের তৈরি অফিসিয়াল অ্যাকাউন্ট ও অর্গানোগ্রাম, কর্মী নিষ্ক্রিয়ের আগে হ্যান্ডওভার, স্বেচ্ছাসেবক ও উপকারভোগীর তালিকা ও প্রোফাইল, প্রোগ্রাম ও প্রকল্প সেটআপ (টেমপ্লেট, কপি, সক্রিয়-বন্ধ-আবার খোলা), নিয়মাবলিতে সম্মতি ও স্বেচ্ছাসেবক অ্যাসাইন, অ্যাডমিন সেটিংস ও নিসাব, অডিট লগ, নোটিফিকেশন, ভূমিকাভিত্তিক "আমার কাজ" হোম, আর বাংলা-ইংরেজি দুই ভাষা। ডিজাইন এখন MUI-ভিত্তিক নিজস্ব component set-এ, তালিকা ও প্রোফাইলের নতুন পরিষ্কার নকশাসহ।

গেটের পর্যালোচনায় ছয়টি ত্রুটি পাওয়া গিয়ে ঠিক করা হয়েছে (বাজেটের অঙ্ক ভুল ভূমিকার কাছে যাওয়া, পাসওয়ার্ড বদলের সীমা সবার মধ্যে ভাগ হওয়া, RPM-এর অন্য অফিসিয়ালের ডিভাইস দেখতে পারা ইত্যাদি)। একটি বিষয়ে মালিকের সিদ্ধান্ত লাগবে: প্রকল্প সেটআপে তিনটি জায়গায় সারি মুছে ফেলা হয়, অথচ production-এর ডাটাবেস ভূমিকায় মোছার অনুমতি নেই। পরের ধাপ: অফিসিয়াল টিমের UAT (`docs/testing/uat/PHASE_1_UAT_BN.md`), তারপর মালিকের সই ও `gate-phase-1` ট্যাগ। Phase 2 (উপকারভোগী মাস্টার, ফর্ম, আবেদন, অফলাইন) শুরু হবে সইয়ের পরে।

## 1. Scope

Phase 1 (Foundation) of the roadmap (constitution §8, `docs/PLAN.md` T1.1 to T1.17), built from 2026-10-11 to 2026-10-20. Testers for the gate: the official team (Department Head, Monitoring Team, PM, RPM, Project Executive) with the demo accounts of `docs/testing/DEMO_ACCOUNTS.md`.

## 2. What is in this release

| Area | Delivered | Main records |
|---|---|---|
| Platform | pnpm monorepo (`apps/api` Express 5, `apps/web` Vite + React 19 PWA, `packages/shared`, `packages/ui`, `packages/config`), PostgreSQL 17 through Prisma 7 with reversible migrations, pg-boss jobs, storage adapter (S3 on MinIO, filesystem for tests), Docker Compose, GitHub Actions CI | D-050, D-073, D-074, ADR-013, ADR-014 |
| Design system | The component set `@css/ui` on MUI core behind a contract and one template line; brand tokens; Tailwind and React Aria removed; the clean list layout and the one profile layout | D-103, D-104, ADR-015, UX-21, UX-22 |
| i18n | Bengali and English for every text, English digits everywhere, the central formatter, a lint rule against hard-coded text | I18N.md, UX-05 |
| Auth and sessions | Login by job ID, email or mobile; Argon2id; rotating refresh cookie; device sessions with remote logout; lockout; password change and OTP reset; dummy OTP refused in production | AUTH.md, O-05, O-25, D-097 |
| Roles and permissions | 17 roles and 150 permissions from `permissions.yaml`; scopes (GLOBAL, PROGRAM, PROJECT, REGION, SELF); field classes for NID, bank, ratings, categories; the permission panel with reasons and audit | RBAC.md, T1.8 |
| Registration and approval | Volunteer self-registration with two OTPs and photos; corrections and resubmit; approval by RPM or Project Executive; blocklist; edit requests; officials created by the admin with a one-time set-password link | BD-44, O-65, O-67, D-097 |
| Staff handover | Pending work by category, reassignment, completion; deactivation refused while work is pending | BD-08, BR-034 |
| People tabs | Nationwide volunteer and beneficiary lists with counts, filters in the URL, numbered pages; the volunteer profile, the beneficiary 360° profile shell and the official profile | D-094, D-105, UX-21, UX-22 |
| Programs and projects | Programs with their PM; projects from a workflow, a template or a copy; the setup wizard (components, budget and fund sources, areas and RPMs, staff, application window, rules, syllabus); activation check, two-step close, reopen, deadline extension | BD-09, BD-10, BD-16, BD-20, D-095 |
| Rules, consent, assignment | Versioned project rules, the volunteer's consent part by part, assignment with limits, teams and team members | T1.12 |
| Admin and settings | Organisation, language, thresholds, reference lists, notification channels, nisab versions, the audit viewer, active sessions, system health | D-098, BD-28 |
| Notifications | In-app inbox and email outbox with retries, throttle and templates in both languages; none to beneficiaries | D-099, BD-47 |
| Home and shell | One app shell, role-based "My Work" home with the counted attention items, phone tabs and desktop sidebar | D-100, T1.15 |

## 3. Fixed at the gate

The gate review (six read-only reviewers over the Phase 1 modules and the documents) found no critical issue. These were fixed with tests on branch `chore/phase1-gate`:

| Finding | Fix | Commit |
|---|---|---|
| Project budget amounts reached roles without `budget.view` (Media, Implementer, Official দায়ী, Procurement) | Amounts only inside the caller's `budget.view` scope | `fix(api): project budget amounts only inside the caller's budget.view scope` |
| The password change shared one rate window of 5 per hour across all users | Counted per signed-in user | `fix(api): the password change counts its rate window per user` |
| An RPM could list and end another official's device sessions in the same area | Below the global roles, volunteers' sessions only; the official profile shows devices to global roles | `fix(api): an RPM sees and ends only volunteers' device sessions` |
| Parallel wrong passwords could slip past the five-failure lock | Counter read again under a row lock | `fix(api): wrong passwords in parallel are counted one by one toward the lock` |
| Ten refused correction answers in an account's lifetime locked the answer for good | Counted within the last hour | `fix(api): refused correction answers count within the hour only` |
| Replacing a template lost its old contents | The old definition kept in the audit entry | `fix(api): replacing a template keeps its old contents in the audit entry` |

Documentation brought to the code: ERD at 95 tables, superseded stack decisions marked, signed-URL wording removed where it contradicted D-074, drifted test titles in the rule register, screen index, module status, the repository map.

## 4. Test results at the gate

Executed 2026-10-20 on the final state of `chore/phase1-gate` (also in `docs/testing/TEST_STRATEGY.md` section 9.3):

| Command | Output |
|---|---|
| `pnpm typecheck` | every package `Done`, no error |
| `pnpm lint` | ESLint 0 errors (163 warnings, all `security/*` advisories); Prettier clean; `i18n check: 0 error(s), 0 warning(s); 152 error codes checked` |
| `pnpm docs:check` | `All document checks passed.` (incl. the Phase 1 rules check, 136 rules) |
| `pnpm test` | `Test Files  184 passed (184)`, `Tests  1666 passed (1666)` (shared, ui, api, api-db, web) |
| `pnpm --filter @css/api contract:coverage --no-run` | `contract coverage: 132 of 132 operations answered their success status in a test` |
| `pnpm rules:status --phase 1 --report-only` | `Phase 1 rules: tested 104, deferred 32, manual 0, untested 0` |
| `pnpm e2e` | `156 passed`, `21 skipped`, 0 failed on `mobile`, `desktop` and `iphone`; the axe sweep `a11y.spec.ts` of every Phase 1 screen in both languages included |
| `pnpm --filter @css/web bundle:report` | first route 212.8 KB gzip of 250 KB; the signed-in home adds 62.3 KB |

## 5. Decisions taken at the gate (owner in chat, 2026-10-20)

D-106 grants the deletion below as recommended; D-072, D-079 and D-102 are approved; D-107 lets Phase 2 start after the merge while the UAT runs. The questions as they were put:

1. **Deletion in project setup.** Saving fund sources, removing a project area and editing the dawah syllabus delete rows (`apps/api/src/services/project-setup.ts`), but the production database role `css_app` has no DELETE (`apps/api/prisma/sql/roles.sql`, DATABASE_SCHEMA section 21). Under the real role these three actions would fail; the tests run as a superuser. Recommendation: grant DELETE on exactly `fund_sources`, `project_areas` and `dawah_syllabus_topics` to `css_app` (they are setup rows of a project, deleted only while unused, foreign keys protect used rows, every deletion is audited with its before state; D-095 already approved removing an area), recorded as a new decision with the role script, DATABASE_SCHEMA section 21 and a test under the real role. Alternative: end the rows instead of deleting them (a migration and more code).
2. **Proposed decisions to confirm:** D-072 (trusted proxy and relaxed limits for E2E), D-079 (optional `EffectivePermission` field), D-102 (relaxed device limit for E2E).
3. **The `gate-phase-1` tag** after the UAT and the owner's sign-off.

## 6. Known issues carried into Phase 2

Recorded in `docs/STATUS.md` (known issues) with their finding; none blocks the UAT. The main ones:

- Notifications: `staff_registration_pending` has no publisher since officials no longer self-register (D-097); the block notification reaches the blocked person but not the Monitoring Team; the fan-out to a project's volunteers runs inside the lifecycle transaction (bulk insert or a job before large projects); email delivery holds its row lock across the SMTP call (single worker until changed).
- Access: a panel revoke of a program, project or region does nothing for a user holding GLOBAL (should be refused); audit entries are filtered for secrets only when read (redact on write too); the effective access is recomputed on every request (measure, then cache by permission version); conditional grants are not yet evaluated (Phase 2 conditions).
- Auth: a refresh that loses a parallel-tab race clears the cookies (the 30-second grace is not fully used).
- Registration: the pending-registration detail does not apply the `volunteer.view_sensitive` scope as the profile does (same result with default roles); edit requests for NID and bank can be decided without the field class; deactivation does not lock the user row against a concurrent handover assignment.
- Projects: `If-Match` missing on fund sources, rules, syllabus, template and project-volunteer changes; a deadline extension accepts a date already past; the close guards for stock and animal photos wait for their modules (D-095).
- Settings: the nisab list is readable by every signed-in user; a template edit can use a variable its publisher does not send; the organisation phone accepts only a mobile number.
- Web: the phone notice "এই পর্দা বড় স্ক্রিনে ভালো চলে।" shows on every admin page, the profiles included.

## 7. Not in Phase 1

Beneficiary master with NID logic, forms and applications, workflow engine, offline sync, exports (Phase 2); distribution, expenses and payments (Phase 3); project-specific workflows (Phase 4); dawah, monitoring, ratings, documents (Phase 5); dashboards and production hardening (Phase 6). Before production: a real SMS provider and OTP, the NAS storage driver, the server details, the Bornomala font licence.
