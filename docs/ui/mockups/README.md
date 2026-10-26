# Phase 0 clickable mockups (task T0.19b)

Static HTML mockups of the pilot screen set in `docs/ui/DESIGN_BRIEF.md` §6, built from `docs/ui/DESIGN_SYSTEM.md` and `docs/ui/SCREENS.md` for the owner's approval (blueprint D2, Phase 0 deliverable "main screen mockups"). They are clickable, not functional: nothing is saved except the offline-toggle state in the browser's local storage. All names, NIDs, birth-registration numbers and phone numbers are fake (names carry "(নমুনা)", ids are of the form 1000000001 and 01700000001).

## How to open

1. Open `docs/ui/mockups/index.html` in Chrome, Edge or Firefox (double-click the file; no server and no internet needed).
2. Pick a screen on the left, then a width at the top: phone 360, tablet 768 or computer 1280. "নতুন ট্যাবে" opens the screen on its own.
3. On a phone, open the same folder's files directly (for example `02-volunteer-home.html`); the index list links to them.

Inside the screens: the wifi button in the header shows the offline state (it carries across screens until switched off), sample NID chips on the new-application screen show lookup, duplicate and blocklist cases, the password "wrong" on the login screen shows the error, and the OTP in the registration demo is 123456 (dev/test only, BD-49).

## Files

| File | Content |
|---|---|
| `index.html` | Screen list with role, SCR id and phase; preview frames at 360, 768 and 1280 px |
| `01-login.html` … `14-permission-panel.html` | The 14 pilot screens (DESIGN_BRIEF §6, mapping in SCREENS.md §11.4) |
| `tokens.css` | DESIGN_SYSTEM §2.9 token block copied exactly, plus the `@font-face` rules. A brand colour change is a one-line edit here |
| `components.css` | The components of DESIGN_SYSTEM §5 and the layout of §4 |
| `mockup.js` | App shell (header, sidebar, rail, bottom tabs, "more" sheet), tabs, dialogs, reason dialogs, chips, offline toggle, toasts, live camera time stamp |
| `icons.js`, `icons-LICENSE.txt` | Inline sprite of the 96 Lucide icons used (lucide-static 0.460.0, ISC licence), generated from the npm package; injected inline so icons work from `file://` |
| `fonts/` | Unmodified copies of `docs/ui/brand/fonts/` (UbuntuSans variable 400 to 700, Bornomala Regular 400 and Bold 700) with their licence texts |
| `assets/` | Copies of `docs/ui/brand/logo.svg` (used everywhere) and `logo.png` (fallback, not used) |

Nothing loads from the network at view time; the only `http` strings are SVG namespace declarations.

## Verification (2026-10-10)

Run with Playwright (playwright-core 1.49.1 driving the installed Chrome) from the session scratchpad; the scripts are not part of the repository.

| Check | Result |
|---|---|
| Render every page at 360, 768 and 1280 px (45 renders): page errors, horizontal overflow, missing icons, Bengali digits, text below 12 px, phone touch targets below 44 px | 45 of 45 clean |
| Fonts loaded from `file://` | UbuntuSans 400-700, Bornomala 400, Bornomala 700: loaded |
| Interaction script at 360 and 1280 px: NID lookup, auto-fill and lock, duplicate warning, blocklist stop, own-mobile error with error summary, camera frame with live time and GPS, photo tile, offline banner and disabled lookup, approve against score with required comment, reject with required reason, field unlock with change log, filter sheet, bulk distribution photo rule, form-builder toggle and volunteer view, permission change with reason and log, OTP steps, tabs, "more" sheet | 51 of 51 passed |
| axe-core 4.10.2, WCAG 2.0/2.1/2.2 A and AA, every page at 360 and 1280 px (initial state) | 0 violations |

Screenshots were reviewed at all three widths; layout problems found during review were fixed (review list columns at 1280 px, stock summary position on phones, number wrapping, progress bars in phone cards, native date format, offline icon).

## Premium refresh (UX-14, 2026-10-11)

The owner asked for a premium, polished look before Phase 1 screens are built (UX-14). The refresh changes `tokens.css` (layered elevation, gradient, glow and focus-glow tokens, slower entrance motion), `components.css` (the finish described in DESIGN_SYSTEM §5 "Premium finish") and three screens: hero headers on 02 (volunteer home), 10 (project dashboard) and 11 (management home), gradient chart bars on 10, and a soft brand wash with a floating card on 01 (login). Colours still come only from brand tokens; glass blur is used only from 1024 px; touch devices animate only transform and opacity; `prefers-reduced-motion` switches every animation off.

Verification after the refresh (same Playwright scripts as below): 45 of 45 renders clean, 51 of 51 interaction checks passed, axe-core 0 violations at 360 and 1280 px. Text on gradients was checked by calculation against the lightest stop (DESIGN_SYSTEM §2.6a): hero title 5.38:1, hero subtitle 4.95:1, hero secondary button and chips 4.64:1, primary button top edge 4.82:1.

## T1.4 implementation deviations (packages/ui, 2026-10-11)

`packages/ui` ports `tokens.css` and `components.css` into React components on React Aria (D-064). Gallery screenshots at 360 and 1280 px were compared with these mockups; everything else matches. Differences:

| # | Component | Mockup | packages/ui | Reason |
|---|---|---|---|---|
| 1 | Date field | not shown | React Aria date picker at every size, dd-mm-yyyy segments, popover on desktop and bottom sheet on phones | O-55: native inputs show the phone's own format |
| 2 | Searchable select, combobox | not shown | list in a popover with the field look; search box above 10 options | DESIGN_SYSTEM 5.4 |
| 3 | Button, loading | `aria-busy` | React Aria keeps the button focusable, `aria-disabled`, pending announced | React Aria pending semantics |
| 4 | Ghost button on a status tint | dark green text | ink text with an underline | axe: dark green on the danger tint is 4.49:1 |
| 5 | Small button on phones | 36 px high | 36 px high with a 44 px hit area | DESIGN_SYSTEM 2.8 |
| 6 | Table on phones | table rows restyled as cards by CSS (`data-label`) | a separate card list from `cardRenderer`; the whole card opens the row | DESIGN_SYSTEM 5.7: the phone list is a `<ul>`, only the visible layout is in the accessibility tree |
| 7 | Table row checkbox | "select" plus the row name in the label | React Aria adds the row header to the short label | avoids the name being read twice |
| 8 | Bulk-update row | actions always beside the text | actions wrap under the text only when a long label leaves no room | Bengali names stayed readable at 360 px |
| 9 | Checkbox, radio, switch | native inputs restyled with `appearance: none` and data-URI glyphs | hidden native input (React Aria) with a drawn box, ring or track; same colours and sizes | React Aria pattern, no hex in data URIs |
| 10 | Table header and dialog scrim | backdrop blur at every width | blur only from 1024 px | DESIGN_SYSTEM 7 item 4 |
| 11 | Stat card | amber-green top line only inside `.grid-stats` | on every stat card | one component, one look |
| 12 | Breadcrumb on phones | hidden | a back link with the parent's name | DESIGN_SYSTEM 5.14 |
| 13 | Tabs | not shown with more than five tabs | more than five tabs become a select on phones | DESIGN_SYSTEM 5.13 |
| 14 | Drawer | blocking | blocking only; the non-blocking variant comes with its first screen | scope of T1.4 |
| 15 | Screen-reader texts | n/a | a few React Aria built-in texts stay English in the Bengali interface | React Aria has no Bengali strings (ADR-012) |

## Deviations from the design system

| # | Where | Deviation | Reason / proposal |
|---|---|---|---|
| 1 | Focus | The focus ring is a 2 px `--color-brand-primary` outline with a 2 px offset, not the `--focus-ring` box-shadow | Same look; an outline is not hidden by components that already use a shadow. Proposal: allow either form in DESIGN_SYSTEM §2.7 |
| 2 | Dialog backdrop | `::backdrop` uses the literal value of `--color-scrim` | Older browsers do not pass custom properties to `::backdrop` |
| 3 | Split view width | Detail panel 420 px from 1024 px and 480 px only from 1440 px (DS §4.3 says 480 px from 1280 px); between 1024 and 1439 px the review list hides the area, volunteer and flag columns (flags appear as icons beside the name) | At 1280 px a 480 px panel left too little room for the score column. Proposal: update DS §4.3 and add the column priority "4" (split view only) to DS §5.7 |
| 4 | Volunteer profile | Opens as a full page within the volunteer tab, not in the split view (SCREENS SCR-042 desktop) | The profile has seven tabs and needs the width |
| 5 | Date field (project setup) | A text field showing dd-mm-yyyy with a calendar icon; no calendar popover | Mockup simplification; the native date input showed the browser's locale format. Implementation follows DS §5.4 |
| 6 | Charts | Dashboard funnel and budget are CSS bars with numbers and a table toggle | The chart library is chosen in T3.3 (O-40) |
| 7 | Amounts | Below 10 lakh lakh grouping (৳ 9,40,000); from 10 lakh the million form with up to 2 decimals (৳ 1.26 মিলিয়ন), via `mockTaka()` in mockup.js | Owner decision O-42 with details confirmed (2 decimals, summaries only, threshold 10 lakh, counts unchanged) |
| 8 | Language switch | Shows a notice only; mockups are Bangla only | English text comes from i18n keys in implementation |
| 9 | Screens outside the pilot set | Links to profile, device sessions, beneficiary list, staff registration queue, handover, control centre, work summaries and audit log show a notice instead of a screen | No screens beyond the pilot set (task rule); they are mocked at the start of their phase |
| 10 | Phase markers | Volunteer profile tabs for work summary, ratings and animal allocation, and beneficiary follow-up, carry a note "built in Phase 4/5" | They are in the pilot screens but belong to later phases (SCREENS.md) |
| 11 | Login | A "which role to enter as" choice exists only in the mockup | To reach both volunteer and official screens without accounts |

## Changes after approval

- 2026-10-10 (O-42): Taka amounts from 10 lakh up in millions in dashboards and summaries (`mockTaka()` in mockup.js).
- 2026-10-10 (O-43, task T0.20): every time of day in 12-hour form with the Bengali day period first (for example "বিকাল 4:40"), including the live camera stamp; the Hijri date toggle on the notification settings tab removed.

## After the owner's review

Approved by the owner on 2026-10-10 (DECISION_LOG O-41). Items 1 and 3 above were accepted and written into DESIGN_SYSTEM.md (sections 2.7, 2.8, 4.3 and 5.7); the other items stay mockup simplifications. Later-phase screens get their own mockups at the start of their phase.

## The Media Team screens (T2.8b, 2026-10-26)

`15-media-home.html` (SCR-019) and `16-media-work.html` (SCR-108) show the Media Team module of D-101 for the owner's approval before any code. The bar at the top of each switches the viewer (the director or a member, who sees only their own works) and, on the work page, the state (a new referral waiting for the decision, or a running work); `16-media-work.html#new` opens on the decision. The work page also holds the parts that sit on other screens: the referral dialog of the application page and the consent dialog of the beneficiary profile. The YouTube thumbnails are coloured boxes here; the app shows YouTube's own image. `mockup.js` gains the `media` shell. Checked at 375 and 1280 px: no horizontal scroll, every icon present, no Bengali digits, no console error.
