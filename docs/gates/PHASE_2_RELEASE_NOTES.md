# Phase 2 release notes — Beneficiary, Application, Form Platform and Offline

## সংক্ষেপে (বাংলা)

Phase 2-এ ERP-র মূল কাজ তৈরি হয়েছে:
- **উপকারভোগী:** NID বা জন্মনিবন্ধন দিয়ে খোঁজা ও তথ্য আপনা থেকে বসা, 360° প্রোফাইল, ডুপ্লিকেট খোঁজা ও একীভূতকরণ।
- **ফর্ম:** অংশ, শর্ত, হিসাব আর সংস্করণসহ ফর্ম-নির্মাতা, তৈরি ফর্ম আর পাবলিক লিংক।
- **আবেদন:** রিভিউ থেকে অনুমোদন পর্যন্ত পুরো চক্র, অগ্রাধিকার স্কোর, কোটা, অপেক্ষমাণ তালিকা, উত্তর খোলা আর হস্তান্তর।
- **অফলাইন আর অন্যান্য:** অফলাইনে আবেদন নেওয়া ও পরে সিঙ্ক, ফাইল সার্ভিস, Excel/CSV/PDF এক্সপোর্ট আর মিডিয়া টিমের কাজ।
- **নতুন চেহারা:** পুরো অ্যাপ এখন asf UI system-এ, light ও dark mode-এ।

গেটের পর্যালোচনায় চারজন পর্যালোচক 31টি বিষয় পেয়েছেন। গুরুতরগুলো এই গেটেই পরীক্ষাসহ ঠিক করা হয়েছে:
- অন্য স্বেচ্ছাসেবকের কাছে আবেদনকারীর NID, মোবাইল আর বাতিলের বার্তা যাওয়া।
- অফিসের অংশের ছবি স্বেচ্ছাসেবকের কাছে যাওয়া।
- স্বেচ্ছাসেবকের পেমেন্টের কপি জমা দিতে পারা।
- ভিড়ের মোবাইলে উপকারভোগীর তথ্য সংরক্ষণ বাতিল হয়ে যাওয়া।
- ফোনে পূরণাধীন ফর্মের উত্তর এনক্রিপ্ট ছাড়া থাকা।
- কয়েকটি নিয়মের ফাঁক।

বাকিগুলো, মূলত গতি আর ছোটখাটো বিষয়, Phase 3-এর আগে আলাদা কাজ হিসেবে লেখা আছে। UAT হবে অফিসের Wi-Fi-তে। ফোনে অ্যাপ ইনস্টল আর অফলাইনের পরীক্ষা staging সার্ভার এলে হবে (D-159)।

## 1. Scope

Phase 2 of the roadmap (constitution §8, `docs/PLAN.md` T2.1 to T2.10), built from 2026-10-20 to 2026-11-07, including the move of the web app to the asf UI system (D-150, ADR-016) and an official's own profile (D-147, D-148). Testers for the gate: 20 to 30 volunteers on their own phones and two RPMs, with the PM, the Monitoring Team, the Project Executive and the Media Team, following `docs/testing/uat/PHASE_2_UAT_BN.md`.

## 2. What is in this release

| Area | Delivered | Main records |
|---|---|---|
| File service | Chunked resumable uploads, magic-byte type checks, virus-scan hook with quarantine, thumbnails, capture time and position, duplicate-photo flags, private buckets streamed by the API | T2.1, D-074, D-111 |
| Beneficiary master | Lookup by NID, birth registration or BEN number with auto-fill and locked identity; contact changes with a change log; locked-field correction requests; family matches at review; duplicate pairs, merge and revert | BD-01 to BD-05, T2.2 |
| Form platform | Section and field libraries, the builder (conditions, calculations, number tables, repeat groups, scoring points), versions, ready forms placed on projects, the question library, the public application link | BD-12 to BD-14, T2.3, T2.4, T2.4b to T2.4d |
| Applications | The workflow engine on configurable templates; create, edit by state, submit, review, approve, reject with two texts, return from rejection; bulk review; limits and deadlines; priority score, quotas, waitlist and one-click pull; comments asked against the score, at a full quota and at a family match; field unlock; application transfer; verification of public and offline entries | BD-16 to BD-18, BD-07, T2.5, T2.6, D-157 |
| Offline PWA | The installable app; an encrypted device store (AES-GCM, key ring per session); outbox with retry ladder and idempotent batches; photo queue; conflict rules; the sync centre; logout warnings; remote wipe | BD-48, T2.7, T2.7b, D-139, D-142 |
| Exports | Lists as CSV and Excel with form questions as columns, per-role columns and masks, the profile and application PDFs with embedded Bengali fonts, My exports | T2.8, D-143 |
| Media Team | Referrals from approved applications, the work's stages, team, script and publications, the published works on the person's profile, members' portfolios | T2.8b, D-101, D-136, D-137 |
| Official's own profile | Profile by section, change requests decided by the global roles, projects by year with the figures of the official's work | D-147, D-148 |
| UI | The asf UI system in light and dark, Public Sans with Noto Sans Bengali, Solar icons | D-150 to D-156, ADR-016 |

## 3. Fixed at the gate

The gate review (four reviewers, one per area) found these, each fixed with tests:

1. **Applications seen by another volunteer:** a paid volunteer, a Local দায়ী or the Procurement Team reading a project's applications received the applicant's identity number, mobile and the rejection message. Now they are withheld unless the role holds the class, and the message reaches only the one who brought the application and the office (BR-183, BR-269). The stored identity answer keeps the number the volunteer typed.
2. **Files:** a volunteer could upload a payment copy or a document to their own application, and read the payment copy the office attached there. These kinds are now uploaded and read by officials only (an uploader keeps their own file). A photo answering an official-only question is now streamed and listed only with the official section's permission.
3. **Duplicate pairs:** on a mobile shared by more than 20 profiles, the per-profile refresh could write an empty pair, which the database refused; that rolled back the profile's own write.
4. **Device storage:** the answers being typed (the identity number among them, and in the storage key) were kept unencrypted in the tab's storage. Now they stay in memory only, and copies an earlier version left are removed.
5. **Rule gaps:**
   - The pull of one chosen application now needs the waitlist permission.
   - A project's decisions run one at a time, so the score order and a full quota are read correctly.
   - A verification takes the owner's limit lock.
   - A return from rejection counts against the limit.
   - An application already on its way continues after a block (D-158).
   - The profile shows only media works that went out, of the projects the caller reaches.
   - A late field fill from a phone is recorded as a server-won conflict.
   - A closed key ring on the phone is reported instead of leaving the outbox silent.

## 4. Test results at the gate

Run on the final state of branch `chore/phase2-gate` on the owner's machine, 2026-11-07 (D-138):

| Command | Output |
|---|---|
| `pnpm typecheck` | every package `Done`, no error |
| `npx eslint apps packages scripts` | 0 errors (275 warnings, all `security/*` advisories) |
| `pnpm exec prettier --check .` | all files formatted |
| `pnpm i18n:check` | `0 error(s), 0 warning(s); 161 error codes checked` |
| `pnpm docs:check` | `All document checks passed.` |
| `pnpm rules:status --phase 2 --report-only` | `Phase 2 rules: tested 131, deferred 23, manual 0, untested 0` |
| `pnpm test` | 3122 of 3134 passed. One API test expected the old block rule and was updated to D-158 (4 of 4). The other 11 were web component tests that timed out under the machine's load; their 7 files pass on a rerun with two workers (132 of 132) |
| `pnpm --filter @css/api contract:coverage` | `contract coverage: 224 of 224 operations answered their success status in a test` (one Vitest worker exited on the machine during that run, the known issue of TEST_STRATEGY section 10; every operation was still answered) |
| E2E without the axe sweep (two workers) | 190 passed, 34 skipped by project. One offline journey failed (the address list not yet on the phone's store), and 3 serial followers did not run. In five later runs of the offline file alone: 3 passed, 2 failed at a different step each. This is a known flaky test (section 6) |
| `npx playwright test e2e/a11y.spec.ts --workers 1` | `36 passed` (light and dark, bn and en, both Chromium projects) |
| `pnpm --filter @css/web bundle:report` | first route 381.6 KB gzip of 400 KB (D-154) |

## 5. Decisions taken at the gate (owner in chat, 2026-11-07)

- **D-157:** an approval of a person with a family match asks for a reason (T2.9).
- **D-158:** BR-015 reads literally; a block refuses new applications only.
- **D-159:** the Phase 2 UAT runs on the office network without installing the app or the offline scenarios; those are tested on real phones once the staging server of T3.0 exists.

## 6. Known issues carried into Phase 3

The rest of the gate review, listed in `docs/STATUS.md` (known issues) for a task before the field pilot:

- **Performance:**
  - The upload finalize holds a database transaction while it joins the parts.
  - Every list row loads the project's workflow definition.
  - The phone's photo queue reads the photo bytes to sum sizes.
  - The form draft autosave rewrites the whole form row by row.
  - The public form re-reads its definition on every request.
  - The export count runs without a time limit.
  - The media summary reads every referral.
- **Public link:**
  - The per-link photo ceiling can be filled by one sender.
  - The per-IP limit is tight behind shared mobile networks.
  - Re-enabling the link for another form replaces the live link without a confirmation.
  - Unpublished drafts are readable by people on the project.
  - Changing these needs a decision, because O-08 set the limits.
- **Gender codes of builder-made forms (the known issue of T2.5):** a question the builder makes for a standard column of a reference list (gender, marital status, education, relationship) carries option codes of its own, which the profile's foreign key refuses. A submission or the creation of a profile from a public entry is then refused. A publish-time check was tried at the gate and withdrawn: the builder's library is empty, so every builder-made application form would have been unpublishable. The fix is a builder change: a question marked with such a column takes its options from the reference list.
- **Accepted at the gate's own review:**
  - A crowded mobile's earlier pairs stay listed until the nightly refresh.
  - On the public page a reload loses the photos not yet sent with the entry (the sweep removes them).
  - An uploader keeps reading their own file in an official-only slot.
- **Smaller items:**
  - A transfer may go to a volunteer whose consent is pending.
  - The beneficiary merges list is capped at 100.
  - The 360° profile's projects by year come from the first 20 applications.
  - The lookup's daily cap answers differently for a found and an unknown number.
  - A few duplicated date helpers.
- **Offline journey flaky:** in a long run the offline spec sometimes finds the address list not yet on the phone's store (the division picker stays disabled), at varying steps. It is to be investigated with the offline work on real phones (T3.0).
- **First visit:** the cold first visit on 3G takes 6.7 s to interactive, over the 5 s of NFR-16. The installed case is measured on the phones of the device checklist.

## 7. Not in Phase 2

Distribution, stock reconciliation, expenses and payments, house construction stages, dawah, the monitoring control centre and dashboards (Phase 3 onwards). The deployment, staging and backups come with T3.0.
