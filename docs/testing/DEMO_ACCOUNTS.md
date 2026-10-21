# Demo accounts (development and test only)

Created by `pnpm db:seed` (demo set, T1.3) in `css_erp_dev` and in test databases. **Never in staging or production**: the seed refuses `NODE_ENV=production` and any database that is not `css_erp_dev*` / `css_erp_test*`, and production refuses to start while a seed marker row exists (O-46 item 8). Every identity is fake (TEST_STRATEGY section 4): NIDs 1000000000 to 1000099999, mobiles 0170000xxxx, emails at example.org, names marked (নমুনা).

Password of every demo account: `CssDemo2026` (development only; meets the O-05 rules). Staff log in with the job ID (any letter case), the email or the mobile, volunteers with the mobile (AUTH.md sections 1 and 2.2, DECISION_LOG D-097); every demo official is department staff, and the supervisors build the demo organogram; login works since T1.7 (http://localhost:3000/login with `pnpm dev`). The development OTP for password reset is the `OTP_DUMMY_CODE` of `apps/api/.env`; the E2E run uses its own database and the code 123456 (`apps/api/scripts/e2e-server.ts`). The Department Head and Monitoring Team need 12 characters when they set a new password (O-25); the demo password is only for the seed.

## Staff

| Role | Job ID | Email | Mobile | Reports to | Notes |
|---|---|---|---|---|---|
| Department Head | CSS-001 | head@example.org | 01700000001 | — | Main Admin (is_system_owner) |
| Monitoring Team | CSS-002 | monitoring@example.org | 01700000002 | CSS-001 |  |
| Program Manager | CSS-101 | pm.ucd@example.org | 01700000003 | CSS-001 | PM of program UCD |
| Program Manager | CSS-102 | pm.hum@example.org | 01700000004 | CSS-001 | PM of program HUM |
| Program Manager | CSS-103 | pm.err@example.org | 01700000005 | CSS-001 | PM of program ERR |
| Regional Program Manager | CSS-201 | rpm.dhaka@example.org | 01700000006 | CSS-102 | RPM, Dhaka division |
| Regional Program Manager | CSS-202 | rpm.rangpur@example.org | 01700000007 | CSS-101 | RPM, Rangpur division |
| Regional Program Manager | CSS-203 | handover.rpm@example.org | 01700000014 | CSS-103 | RPM, Dhaka division; holds one project area (a Dhaka district of WNT). The official of the handover journey: the E2E spec hands the work to rpm.dhaka, deactivates the account and restores both at the end (T1.9 U14) |
| Project Executive | CSS-301 | executive@example.org | 01700000008 | CSS-201 |  |
| Official দায়ী | CSS-302 | daee@example.org | 01700000009 | CSS-201 |  |
| Implementer | CSS-303 | implementer@example.org | 01700000010 | CSS-201 |  |
| Procurement Team | CSS-401 | procurement@example.org | 01700000011 | CSS-001 |  |
| Media Team | CSS-402 | media@example.org | 01700000012 | CSS-405 |  |
| Media Director | CSS-404 | media.director@example.org | 01700000015 | CSS-001 | D-101; at the PM's level |
| Media Assistant Director | CSS-405 | media.ad@example.org | 01700000016 | CSS-404 | D-101 |
| Finance Team | CSS-403 | finance@example.org | 01700000013 | CSS-001 |  |

## Volunteers

| No. | Type | Mobile | Home division |
|---|---|---|---|
| 1 | General Volunteer | 01700000101 | Dhaka |
| 2 | General Volunteer | 01700000102 | Rangpur |
| 3 | General Volunteer | 01700000103 | Dhaka |
| 4 | General Volunteer | 01700000104 | Rangpur |
| 5 | General Volunteer | 01700000105 | Dhaka |
| 6 | General Volunteer | 01700000106 | Rangpur |
| 7 | General Volunteer | 01700000107 | Dhaka |
| 8 | General Volunteer | 01700000108 | Rangpur |
| 9 | General Volunteer | 01700000109 | Dhaka |
| 10 | General Volunteer | 01700000110 | Rangpur |
| 11 | General Volunteer | 01700000111 | Dhaka |
| 12 | General Volunteer | 01700000112 | Rangpur |
| 13 | General Volunteer | 01700000113 | Dhaka |
| 14 | General Volunteer | 01700000114 | Rangpur |
| 15 | General Volunteer | 01700000115 | Dhaka |
| 16 | General Volunteer | 01700000116 | Rangpur |
| 17 | দাঈ-স্বেচ্ছাসেবক (both) | 01700000117 | Dhaka |
| 18 | Local দায়ী | 01700000118 | Rangpur |
| 19 | Team Member (reference: volunteer 1) | 01700000119 | Dhaka |
| 20 | Paid Volunteer | 01700000120 | Rangpur |

### Accounts the E2E specs change (T1.16)

The Playwright projects share one E2E database, so a spec that changes an account's state signs in with an account no other spec touches (`apps/web/e2e/auth.spec.ts`): the desktop project revokes a device of volunteer 2 (01700000102), changes the password of the Media Director (`media.director@example.org`) and resets the Media Assistant Director's (`media.ad@example.org`); the mobile project does the same with volunteers 7, 8 and 9 (01700000107 to 01700000109); the iPhone project (WebKit) signs in with volunteers 4 and 5 and revokes a device of volunteer 10 (01700000110), and changes no password. Any other spec signing in with one of them would add a device to count or fail on the changed password. `roles.spec.ts` signs in as every other role only to read a refusal, the registration journey assigns volunteer 1 (01700000101) to a project of its own run and adds volunteer 19 to that team, and the accessibility sweep (`a11y.spec.ts`) assigns volunteer 3 (01700000103) to projects of its own run.

## Other demo data

- Programs UCD, HUM and ERR (the three SOP programs), each with its PM.
- 50 beneficiaries, 25 in Dhaka division and 25 in Rangpur (and the four of the duplicate pairs below, in Dhaka), five identified by birth registration only; mobiles 01700001000 to 01700001049. Beneficiary n has the NID 1000000999 + n (birth registration for every tenth); a fresh seed gives them the BEN numbers BEN-0000001 to BEN-0000050 in that order.
- Lookup cases for `rpm.dhaka@example.org` in project WNT ("NID / জন্মনিবন্ধন দিয়ে খুঁজুন" on the beneficiary tab): NID 1000001000 (beneficiary 1, Dhaka) is found with its auto-fill; NID 1000001002 (beneficiary 3, Dhaka) is on the blocklist and answers "blocked"; an unused NID such as 1000099999 finds nothing. The only demo applications are those of the duplicate pairs below, so only their NIDs answer "already applied" in WNT.
- Two suggested duplicate pairs for the merge screens ("সম্ভাব্য ডুপ্লিকেট" on the beneficiary tab, `/admin/beneficiaries/duplicates`), beneficiaries 51 to 54 in the first Dhaka union of the seed: beneficiaries 51 and 52 "রাবেয়া খাতুন (নমুনা)", father or husband "আব্দুল মজিদ (নমুনা)", mobile 01700001050, NIDs 1000001050 and 1000001051; beneficiaries 53 and 54 "আনোয়ারা বেগম (নমুনা)", father or husband "মো. হারুন (নমুনা)", mobile 01700001051, NIDs 1000001052 and 1000001053. A fresh seed gives them BEN-0000051 to BEN-0000054. The duplicate search names each pair by "একই নাম, পিতা/স্বামী ও মোবাইল" (`name_father_mobile`) and "একই মোবাইল নম্বর" (`same_mobile`); the seed writes the pair into `beneficiary_merge_candidates` as the nightly refresh would. Each of the four has one application under review in project WNT (a draft form version `default` v1), so `pm.hum@example.org` (program HUM) reaches the pairs and may merge them, and the Dhaka RPM may propose a merge. The merge spec (`apps/web/e2e/beneficiary-merge.spec.ts`) merges the first pair on the desktop project and the second on the phone project, and the Monitoring Team reverts each merge, which brings the pair back.
- Draft project WNT "শীতবস্ত্র বিতরণ 2026" / "Winter Clothing 2026" (program HUM, distribution workflow) with areas for both divisions and the components application_form, volunteer_assignment, dispatch_receive, distribution, volunteer_expenses and rating_criteria.

Later tasks extend the demo set as their entities become functional (applications in every state, payments, Qurbani donors).
