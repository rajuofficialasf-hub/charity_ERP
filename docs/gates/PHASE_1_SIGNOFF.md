# Phase 1 sign-off — Foundation

| Item | Value |
|---|---|
| Phase | 1 — Foundation (constitution §8) |
| Gate task | T1.17, 2026-10-20 |
| Scope | T1.1 to T1.16 and the owner's design work after them (D-103, D-104, UX-21, UX-22, D-105) |
| Baseline | Branch `chore/phase1-gate`; the tag `gate-phase-1` is set on the signed-off commit |
| Testers | The official team: Department Head, Monitoring Team, PM, RPM, Project Executive (`docs/testing/uat/PHASE_1_UAT_BN.md`) |
| UAT | **Pending** — feedback through `/css-uat Phase 1` |
| Owner sign-off | **Pending** — signature lines at the end of the Bengali summary |
| Next task after sign-off | T2.1 (file service), the first task of Phase 2 |

## 1. Gate steps (`/css-gate 1`)

| Step | Result |
|---|---|
| 1. Documentation sync | Done: ERD and erd.mermaid at 95 tables, DATABASE_SCHEMA header, superseded stack decisions marked in DECISION_LOG, MASTER_SPEC and TEST_STRATEGY without signed URLs, drifted test titles in the BUSINESS_RULES register, the SCREENS index (SCR-076 official profile, SCR-077 project list and page), MODULE_CATALOG Phase 1 status, the CLAUDE.md map. OpenAPI drift test 7 of 7, i18n check clean, permissions.yaml and RBAC.md at 150 permissions |
| 2. Module review | Six read-only reviewers: auth and staff accounts; access, panel and audit; registration, people and handover; programs and projects; admin, notifications and shell; documents against code. No critical finding; six findings fixed with tests (section 2); the rest in STATUS known issues and the release notes section 6 |
| 3. Complete test suite | All green (section 3) |
| 4. Bengali UAT script | `docs/testing/uat/PHASE_1_UAT_BN.md`: eleven scenarios for the five testers, the demo accounts, the expected result of every step and the feedback table |
| 5. Release notes | `docs/gates/PHASE_1_RELEASE_NOTES.md` |
| 6. STATUS, commit, tag | STATUS updated and committed; the tag waits for the owner's sign-off (section 6) |

## 2. Findings fixed at the gate

| Finding | Severity | Fix and test |
|---|---|---|
| Project budget amounts reached roles without `budget.view` | high | Amounts only inside the caller's `budget.view` scope; `projects.test.ts` |
| One password-change rate window for all users | high | Counted per user; `password.test.ts` with the real limits |
| An RPM reached other officials' device sessions in the same area | medium | Volunteers only below the global roles; `sessions-users.test.ts`, `staff.test.tsx` |
| Parallel wrong passwords slipped past the lock | medium | Counter read under a row lock; `auth.test.ts` |
| Refused correction answers counted for the account's lifetime | medium | Counted within the hour; `registration-approval.test.ts` |
| A replaced template lost its old contents | medium | Old definition in the audit entry; `templates.test.ts` |

## 3. Verification (executed 2026-10-20)

| Command | Output |
|---|---|
| `pnpm typecheck` | every package `Done`, no error |
| `pnpm lint` | ESLint 0 errors (163 warnings, all `security/*` advisories); Prettier clean; i18n 0 errors, 152 error codes |
| `pnpm docs:check` | `All document checks passed.` |
| `pnpm test` | 184 files, 1666 tests passed |
| `pnpm --filter @css/api contract:coverage --no-run` | 132 of 132 operations |
| `pnpm rules:status --phase 1 --report-only` | tested 104, deferred 32, manual 0, untested 0 |
| `pnpm e2e` | 156 passed, 21 skipped, 0 failed (mobile, desktop, iphone; axe sweep in both languages) |
| `pnpm --filter @css/web bundle:report` | first route 212.8 KB gzip of 250 KB |

Rules not tested in Phase 1: none untested. The 32 deferred rules belong to features of later phases — BR-014 (profile merge), BR-043 to BR-045 (ratings and categories), BR-048 to BR-050 (application transfer), BR-070 and BR-176 (follow-up), BR-073 (forms), BR-093 and BR-102 (applications), BR-117, BR-118, BR-120, BR-190, BR-191 (construction, issue log, progress), BR-138 (payments), BR-144, BR-147, BR-148, BR-150, BR-151 (Qurbani), BR-160 (dawah), BR-163, BR-166, BR-171 (documents), BR-192 (dashboard), BR-199 and BR-238 (offline sync), BR-241 (photo quality and alerts), BR-268 (Media Team module) — each with its phase in `docs/BUSINESS_RULES.md` section 19.

## 4. Decisions needed before the sign-off

1. The deletion in project setup against the `css_app` role (release notes section 5, item 1).
2. Confirm or change the proposed D-072, D-079 and D-102.

## 5. Deferred to after the UAT

- Visual regression baselines (TEST_STRATEGY 3.7) and a recorded keyboard walkthrough of the Phase 1 screens: the owner is still reviewing the new list and profile layouts, so baselines taken now would be retaken; they follow the owner's review and the UAT fixes.
- The known issues of the gate review (STATUS, release notes section 6), none blocking the UAT.

## 6. Git

The Phase 1 work after T1.8 is not merged into `main`: PRs #2 to #11 are open, and `feat/people-list-redesign`, `feat/profile-layout` and `chore/phase1-gate` are not pushed. The owner decides the pushes and merges; the tag `gate-phase-1` is set on the signed-off commit after the owner's sign-off.

## বাংলা সারাংশ (ম্যানেজমেন্টের জন্য)

Phase 1-এর ভিত তৈরি হয়েছে এবং গেটের সব যাচাই পাস করেছে। যা আছে: লগইন ও ডিভাইস সেশন, ভূমিকা ও পারমিশন প্যানেল, স্বেচ্ছাসেবকের নিবন্ধন-সংশোধন-অনুমোদন, অ্যাডমিনের তৈরি অফিসিয়াল অ্যাকাউন্ট, হ্যান্ডওভার, স্বেচ্ছাসেবক-উপকারভোগী-কর্মীর তালিকা ও প্রোফাইল, প্রোগ্রাম ও প্রকল্প সেটআপ (টেমপ্লেট, কপি, সক্রিয়-বন্ধ-আবার খোলা), নিয়মাবলিতে সম্মতি ও অ্যাসাইন, অ্যাডমিন সেটিংস ও নিসাব, অডিট লগ, নোটিফিকেশন, "আমার কাজ" হোম, বাংলা ও ইংরেজি।

গেটের পর্যালোচনায় কোনো গুরুতর ত্রুটি পাওয়া যায়নি। ছয়টি ত্রুটি ঠিক করা হয়েছে, প্রতিটির টেস্টসহ। সব টেস্ট পাস: 1666টি unit ও API টেস্ট, 156টি end-to-end যাত্রা (ফোন, ডেস্কটপ, iPhone; অ্যাক্সেসিবিলিটি যাচাইসহ)। Phase 1-এর পরীক্ষাযোগ্য প্রতিটি নিয়মের টেস্ট আছে; বাকি 32টি নিয়ম পরের ফেজের কাজের।

সইয়ের আগে দরকার: অফিসিয়াল টিমের UAT (`docs/testing/uat/PHASE_1_UAT_BN.md`), প্রকল্প সেটআপে সারি মোছার বিষয়ে সিদ্ধান্ত, আর তিনটি প্রস্তাবিত সিদ্ধান্ত (D-072, D-079, D-102) নিশ্চিত করা।

| ভূমিকা | নাম | স্বাক্ষর | তারিখ |
|---|---|---|---|
| ডিপার্টমেন্ট হেড |  |  |  |
| মনিটরিং টিম |  |  |  |
