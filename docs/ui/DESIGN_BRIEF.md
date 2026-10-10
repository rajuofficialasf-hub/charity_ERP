# Design brief: Charity & Social Service ERP

Status: owner interview held on 2026-10-10 (three rounds of questions in chat) and a brand instruction the same day (colours and fonts from the website). This brief is the source of the owner's design decisions. Since task T0.19 (2026-10-10), docs/ui/DESIGN_SYSTEM.md and docs/ui/SCREENS.md are the binding specification built from it, with the design-system choices recorded as O-40. When the owner changes a decision, update this file, record the change in docs/DECISION_LOG.md and rerun the affected tasks.

Precedence: the owner's latest instruction, then this brief, then constitution sections 11 and 12, then the defaults in section 2.

## 1. Owner decisions

Import these into docs/DECISION_LOG.md as the series UX-01 to UX-13, status approved, source "owner interview 2026-10-10" (tasks T0.1 and T0.5).

| Id | Decision | Effect |
|---|---|---|
| UX-01 | The brand colours are taken from the Foundation's website, https://assunnahfoundation.org/, as the owner instructed on 2026-10-10. The logo is supplied as docs/ui/brand/logo.png. | The extracted palette, the ERP colour tokens and their contrast checks are in docs/ui/brand/colors.md. They replace the colour tokens of constitution section 12. |
| UX-02 | The look is calm and institutional: white cards, light borders, green as the action colour with amber as a decorative accent, clean tables for officials, large touch targets on phones. | No heavy shadows, gradients or decorative illustration. Status colours are used only for status. |
| UX-03 | Officials (PM, RPM, Project Executive) work equally on desktop and on phone. | Review, approval, lookup, volunteer and beneficiary profiles and every dashboard must be fully usable at phone width, 360 px. Tables collapse to cards on phones. |
| UX-04 | Setup screens (form builder, project setup, permission panel, template and checklist editors) are desktop first. On a phone they are readable and allow small edits only. | No drag and drop is required. Phones show a "best on a larger screen" notice on these screens. |
| UX-05 | All numbers use English digits 0-9 in both languages: amounts, dates, counts, ids and phone numbers. | Supersedes the Bengali-digit line of constitution section 11. Formatting stays in one central utility, so Bengali digits can be added later by a new decision. |
| UX-06 | Some volunteers use iPhones. Android Chrome stays the primary target. | Offline design and tests must cover iOS Safari and installed iOS PWAs: possible storage eviction, no background sync, push only for installed PWAs, and install guidance in Bangla. |
| UX-07 | The four biggest current problems are duplicate and wrong data, photos and proof, stuck approvals, and accounts and expenses. | These are the hero capabilities: NID lookup with duplicate warnings at entry, photo capture with metadata and a verification view, an approval queue that shows waiting time, and a clear expense and ledger view. |
| UX-08 | Screens are reviewed as clickable HTML mockups in a browser at phone and desktop widths. There is no Figma file. | Task T0.19b builds them with the owner's logo and colours. The owner approves them before each phase is built (blueprint D২). |
| UX-09 | System name: চ্যারিটি ও সোশ্যাল সার্ভিস. The English name is proposed as Charity & Social Service. | The header shows the As-Sunnah Foundation logo and this name. The short name under the phone home-screen icon is "ASF Charity" (owner decision O-31, 2026-10-10). |
| UX-10 | The management home (Department Head, Monitoring Team) opens with work progress: applications, approved, and distributed or completed against target. | Proposed order below that first block: alerts, budget, area view. |
| UX-11 | Photo source is a per-project setting chosen by the PM next to the photo rule. Defaults: camera only for distribution and construction proof, gallery allowed for vouchers and paper documents. | New setting in the photo-rule component. Photos without capture time or GPS stay flagged (BD-21). |
| UX-12 | Volunteers read operational messages, such as correction requests and approvals, inside the app only. No SMS, WhatsApp or email for these for now. | The volunteer home puts "needs your attention" first. SMS is still required for OTP and for Qurbani donor messages (BD-34, BD-44). |
| UX-13 | Typography follows the website: font stack UbuntuSans, Bornomala, sans-serif, weights 400 and 700 only. | Replaces Hind Siliguri in constitution section 12. Self-hosted files in docs/ui/brand/fonts/: Ubuntu Sans draws Latin letters and digits, Bornomala draws Bengali. Bornomala declares the SIL Open Font License 1.0 in the file itself; its source is https://codepotro.com/font/bornomala/ (owner decision O-32, 2026-10-10). |

## 2. Defaults assumed (not asked; the owner may change them)

1. Dates use English digits and the Gregorian calendar. A Hijri date can be shown beside a date where it matters (Ramadan, Qurbani) through a setting that is off by default.
2. No public pages except the tree-planting application link (blueprint A৮.৫). The ERP is an internal system.
3. Light theme only for now. Colours are CSS variables, so a dark theme can be added later.
4. The default interface language is Bangla for everyone. A per-user switch offers English.
5. Web Push for installed PWAs may enhance the in-app notifications. This is a proposal to evaluate in task T0.14, not a decision.

## 3. Design principles

1. Attention first. The home of every role opens with what needs that person now.
2. Evidence first. Photos carry capture time, location and a visible verified or flagged state.
3. One layout system. The same components on every screen, no per-page invention (constitution section 12).
4. Phone first for field work, responsive parity for officials, desktop first only for setup (UX-03, UX-04).
5. Low-end devices. Light first load, short lists, small images, no heavy animation.
6. Plain Bangla. Short labels and verbs, and the same term for the same thing everywhere (see the blueprint glossary, appendix ক).
7. Digits are always 0-9 (UX-05).

## 4. Brand

- The header shows the As-Sunnah Foundation logo and the system name (UX-09).
- Colours and fonts: docs/ui/brand/colors.md, extracted from the website on 2026-10-10. Use its tokens and do not invent new colours.
- The logo is supplied: docs/ui/brand/logo.svg (vector, copied from the website's inline SVG) and docs/ui/brand/logo.png (PNG with transparency, 300 by 196 px, sharp up to 150 CSS pixels wide on 2x screens, never upscaled). Use the SVG wherever sharpness matters, such as the login screen and PDF exports. The colours of the logo belong to the logo only.
- Font files are in docs/ui/brand/fonts/, copied from the website with the licence texts and a README that explains how to declare them.

## 5. Layout rules by device

| Width | Navigation | Lists and tables | Detail and actions |
|---|---|---|---|
| Phone, up to 639 px | Top app bar plus a bottom tab bar (four tabs and a "more" sheet) | Cards, one per row; filters in a bottom sheet | Full-screen detail; sticky action bar for approve, waitlist and reject |
| Tablet, 640 to 1023 px | Collapsible side rail | Compact tables or two-column cards | Drawer detail |
| Desktop, 1024 px and up | Fixed sidebar | Dense tables with filters, search and pagination | Split view: list on the left, detail panel with timeline and change log on the right |

Setup screens (UX-04) follow the desktop layout and show a notice on phones.

## 6. Mockup set for task T0.19b

Pilot set (Phases 1 to 3), shown in Bangla with realistic fake data.

Volunteer, phone first:
1. Login and registration with the two OTP steps.
2. Home: offline banner, needs-attention cards, my projects, quick actions.
3. New application: NID or birth-registration lookup, auto-fill, locked fields, blocklist message, duplicate warning.
4. My applications by status, and application detail with the step timeline.
5. Today's distribution: bulk list, in-app camera, photo state, pending-sync counter, stock summary.
6. Notifications inbox and sync status.

Officials, responsive (UX-03):
7. Review queue with score and quota bars, and the detail panel with timeline, change log, family-duplicate warning, approve, waitlist, reject and field unlock.
8. Volunteer tab and volunteer profile.
9. Beneficiary 360 profile.

Management, responsive:
10. Project dashboard, progress first.
11. Management home, progress first (UX-10).

Setup, desktop first (UX-04):
12. Project setup with component toggles.
13. Form builder with section library, field settings, live preview and versions.
14. Permission panel.

Screens of later phases (house construction, self-reliance, dawah, Qurbani, document register, issue log, monitoring centre) are mocked at the start of their own phase.

## 7. Where each decision lands

| Decision | Documents and tasks |
|---|---|
| UX-01, UX-02, UX-03, UX-04 | DESIGN_SYSTEM.md and SCREENS.md (T0.19), mockups (T0.19b), packages/ui (T1.4), app shell (T1.15) |
| UX-05 | I18N.md (T0.20), formatting utilities (T1.5) |
| UX-06 | OFFLINE_SYNC.md (T0.12), PWA implementation and tests (T2.7), install guide (T2.10) |
| UX-07 | Mockup set (T0.19b), BUSINESS_RULES.md priorities, UAT scripts at every gate |
| UX-08 | T0.19b and the Phase 0 gate (T0.22) |
| UX-09 | Login, header and PWA manifest (T1.1, T1.15) |
| UX-10 | Dashboards (T3.3, T6.1) |
| UX-11 | FILES_AND_DOCUMENTS.md (T0.13), project setup (T1.11), distribution (T3.1) |
| UX-12 | NOTIFICATIONS.md (T0.14), volunteer home (T1.15) |
| UX-13 | DESIGN_SYSTEM.md (T0.19), mockups (T0.19b), packages/ui and fonts (T1.4), PWA font precache (T2.7), PDF export fonts (T2.8) |

## 8. Open items

1. Resolved 2026-10-10: Bornomala comes from https://codepotro.com/font/bornomala/ (O-32).
2. Resolved 2026-10-10: the home-screen short name is "ASF Charity" (O-31).
3. Whether to add Web Push (section 2, item 5): evaluated in task T0.14 (`docs/architecture/NOTIFICATIONS.md` §11); decided 2026-10-10 (O-35): yes, optional, off by default, after the Phase 3 pilot, content-free payloads.
4. Optional: reflect these decisions in the next version of the blueprint document so both stay aligned.
