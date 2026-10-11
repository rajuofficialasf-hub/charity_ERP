# Demo accounts (development and test only)

Created by `pnpm db:seed` (demo set, T1.3) in `css_erp_dev` and in test databases. **Never in staging or production**: the seed refuses `NODE_ENV=production` and any database that is not `css_erp_dev*` / `css_erp_test*`, and production refuses to start while a seed marker row exists (O-46 item 8). Every identity is fake (TEST_STRATEGY section 4): NIDs 1000000000 to 1000099999, mobiles 0170000xxxx, emails at example.org, names marked (নমুনা).

Password of every demo account: `CssDemo2026` (development only; meets the O-05 rules). Staff log in with the email or the mobile, volunteers with the mobile (AUTH.md section 2); login itself arrives with T1.7.

## Staff

| Role | Email | Mobile | Notes |
|---|---|---|---|
| Department Head | head@example.org | 01700000001 | Main Admin (is_system_owner) |
| Monitoring Team | monitoring@example.org | 01700000002 |  |
| Program Manager | pm.ucd@example.org | 01700000003 | PM of program UCD |
| Program Manager | pm.hum@example.org | 01700000004 | PM of program HUM |
| Program Manager | pm.err@example.org | 01700000005 | PM of program ERR |
| Regional Program Manager | rpm.dhaka@example.org | 01700000006 | RPM, Dhaka division |
| Regional Program Manager | rpm.rangpur@example.org | 01700000007 | RPM, Rangpur division |
| Project Executive | executive@example.org | 01700000008 |  |
| Official দায়ী | daee@example.org | 01700000009 |  |
| Implementer | implementer@example.org | 01700000010 |  |
| Procurement Team | procurement@example.org | 01700000011 |  |
| Media Team | media@example.org | 01700000012 |  |
| Finance Team | finance@example.org | 01700000013 |  |

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

## Other demo data

- Programs UCD, HUM and ERR (the three SOP programs), each with its PM.
- 50 beneficiaries, 25 in Dhaka division and 25 in Rangpur, five identified by birth registration only; mobiles 01700001000 to 01700001049.
- Draft project WNT "শীতবস্ত্র বিতরণ 2026" / "Winter Clothing 2026" (program HUM, distribution workflow) with areas for both divisions and the components application_form, volunteer_assignment, dispatch_receive, distribution, volunteer_expenses and rating_criteria.

Later tasks extend the demo set as their entities become functional (applications in every state, payments, Qurbani donors).
