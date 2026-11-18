# DESIGN SYSTEM

Status: complete for Phase 0, written in task T0.19 (2026-10-10); premium refresh for UX-14 on 2026-10-11 (elevation, gradients, motion and component finish below), approved by the owner the same day (O-54); implemented in `packages/ui` in task T1.4 (2026-10-11, see §12). Rewritten on 2026-11-05 for the asf UI system of the organization's kit (D-150, ADR-016; plan `docs/plans/2026-11-03-1200-migrate-asf-ui-plan.md`): the web app is built only from the asf contract (`apps/web/src/ui`), and `packages/ui` has been removed. This is the binding UI specification for every screen. Screens are listed in `docs/ui/SCREENS.md`.

Sources and precedence: the owner's latest instruction, then `docs/ui/DESIGN_BRIEF.md` (owner decisions UX-01 to UX-25, as amended by D-150), then `docs/DECISION_LOG.md` (D-150 and the design-system choices O-40), then constitution §11 and §12, then this document. The kit's own design rules for a new asf piece are in `apps/web/src/ui/templates/asf/DESIGN-GUIDE.md`. Colours and fonts come from `apps/web/src/ui/tokens.ts` (contrast values in `docs/ui/brand/colors.md`). No colour may be used that is not listed in §2.1. A new token needs a decision in DECISION_LOG.md first.

## 1. Principles

1. **Attention first.** Every role's home opens with what needs that person now (DESIGN_BRIEF §3, BR-226). Volunteers read operational messages only in the app, so their home leads with "needs your attention" (UX-12).
2. **Evidence first.** Photos always show capture time, location and a visible verified, flagged or pending state (BD-21, UX-07).
3. **One layout system.** The same components on every screen. A screen that needs something new extends a component in this document; it never invents a per-page pattern (constitution §12).
4. **Phone first for field work, parity for officials, desktop first for setup.** Volunteers work on phones. Officials work equally on desktop and phone, so review, approval, lookup, profiles and dashboards work fully at 360 px (UX-03, NFR-17). Setup screens are desktop first (UX-04).
5. **Low-end devices.** Light first load, short lists, small images, almost no animation (NFR-12, NFR-15).
6. **Calm and polished (UX-14, refining UX-02; the look of asf since D-150).** Professional and institutional like the organization's other apps on asf: white or dark paper cards with the asf card shadow, primary actions as the dark button on admin screens, green marking state and selection, short motion only to show a change of state, refined spacing and carefully designed components. Never at the cost of speed on 2 GB phones or AA contrast, in light and in dark.
7. **Plain Bangla.** Short labels and verbs, the same term for the same thing everywhere (blueprint appendix ক). Bangla is the default language, English is a per-user switch.
8. **English digits.** All numbers use 0-9 in both languages: amounts, dates, counts, ids and phone numbers (UX-05).
9. **Status is never colour alone.** A status always shows an icon and a text label (colors.md §6).
10. **Simple and clean, no explanatory text (UX-17).** A screen shows its title, at most one short line where it helps, the labels and the work itself; messages appear only when something happens; a helper under a field only when it prevents a mistake. No welcome or "how this works" paragraphs, no "arrives later" placeholders.

## 2. Tokens

Since D-150 (ADR-016) every token comes from the asf UI system of the organization's kit. There are two layers, both on the asf palette:

1. **The asf theme tokens** in `apps/web/src/ui/tokens.ts` (the `ThemeTokens` type of `apps/web/src/ui/contract.ts`): the colour scales, the 8 px spacing unit, the radius and the font families. The asf template (`apps/web/src/ui/templates/asf/theme/`) maps them onto MUI's CSS variables (prefix `asf`, for example `--asf-palette-primary-main`) for a light and a dark scheme, selected by `data-color-scheme` on `<html>`. Every asf piece takes its colours from the theme; a component never writes a hex value.
2. **The app's own page tokens** in `apps/web/src/styles/tokens.css`: the names the app's page CSS has always used (`--space-*`, `--radius-*`, `--text-*`, `--color-*`, `--elevation-*`) now point at the asf variables. Each colour carries the asf light value as a fallback, because the asf variables exist only once the app has started, and a dark block under `:root[data-color-scheme='dark']` gives the dark values. `apps/web/src/styles/base.css` holds the element reset and the elements' defaults; `apps/web/src/styles/globals.css` imports both and holds the few classes the whole app shares (`page-split`, `app-sr-only`, `app-loading`).

A colour that is not in `tokens.ts` is not an app colour. A new token or a changed value needs a decision in DECISION_LOG.md first. The earlier tokens of this section (the website palette of UX-01 around #008E48, written in T0.19 and refreshed for UX-14 and D-145) are superseded by D-150 and ADR-016; they remain in git history and, as a record, in `docs/ui/brand/colors.md` section 9.

### 2.1 Colour

The asf scales (`tokens.ts`):

| Scale     | lighter | light   | main    | dark    | darker  | Use                                                                                                    |
| --------- | ------- | ------- | ------- | ------- | ------- | ------------------------------------------------------------------------------------------------------ |
| primary   | #C8FAD6 | #5BE49B | #00A76F | #007867 | #004B50 | State and selection, links, focus; the primary button on public pages. White text only on dark and darker |
| info      | #CAFDF5 | #61F3F3 | #00B8D9 | #006C9C | #003768 | Status only                                                                                            |
| success   | #D3FCD2 | #77ED8B | #22C55E | #118D57 | #065E49 | Status only                                                                                            |
| warning   | #FFF5CC | #FFD666 | #FFAB00 | #B76E00 | #7A4100 | Status only (text on a warning fill is neutral 800)                                                    |
| error     | #FFE9D5 | #FFAC82 | #FF5630 | #B71D18 | #7A0916 | Status only; the danger button                                                                         |
| secondary | #EFD6FF | #C684FF | #8E33FF | #5119B7 | #27097A | Part of the kit's tokens; no page of the app uses it                                                   |

Neutral: 50 #FCFDFD, 100 #F9FAFB, 200 #F4F6F8, 300 #DFE3E8, 400 #C4CDD5, 500 #919EAB, 600 #637381, 700 #454F5B, 800 #1C252E, 900 #141A21.

Light and dark (the asf theme, `theme/theme.ts`):

| Role                                         | Light                                  | Dark                                   |
| -------------------------------------------- | -------------------------------------- | -------------------------------------- |
| Page (background default)                    | #FFFFFF                                | neutral 900 #141A21                    |
| Paper (cards, tables, dialogs)               | #FFFFFF                                | neutral 800 #1C252E                    |
| Text primary                                 | neutral 800 #1C252E                    | #FFFFFF                                |
| Text secondary                               | neutral 600 #637381                    | neutral 500 #919EAB                    |
| Text disabled                                | neutral 500 #919EAB                    | neutral 600 #637381                    |
| Primary action on admin screens (dark button) | neutral 800 with white text, hover 700 | white with neutral 800 text, hover 400 |

The mode: the app follows the device (`prefers-color-scheme`) until the person picks light or dark with the switch in the header (`ColorModeButton`); the pick stays on the device. `apps/web/public/color-scheme.js` sets `data-color-scheme` on `<html>` before the first paint, so a dark device never shows a white page while the app loads.

The app's colour names (`tokens.css`) and the asf values they read. A name with no dark entry follows the asf variable, which changes with the mode itself.

| App token                    | asf value (light)                       | Dark                        |
| ---------------------------- | --------------------------------------- | --------------------------- |
| `--color-brand-primary`      | primary main #00A76F                    | follows asf                 |
| `--color-brand-primary-dark` | primary dark #007867                    | primary light #5BE49B       |
| `--color-art-primary-lighter`, `--color-art-primary-main`, `--color-art-primary-dark`, `--color-art-primary-darker` | the primary scale #C8FAD6, #00A76F, #007867, #004B50, as fills of the drawn cover only | the same shades (the asf dark scheme keeps the scales) |
| `--color-art-sun`            | common white #FFFFFF, the drawn cover's sun only | the same                    |
| `--color-brand-ink`          | neutral 800 #1C252E (a dark surface or the darkest text) | follows asf  |
| `--color-brand-accent`       | warning main #FFAB00                    | follows asf                 |
| `--color-brand-accent-ink`   | warning dark #B76E00                    | warning light #FFD666       |
| `--color-bg-canvas`          | background default #FFFFFF              | #141A21                     |
| `--color-bg-surface`         | background paper #FFFFFF                | #1C252E                     |
| `--color-bg-muted`           | neutral 200 #F4F6F8                     | neutral 500 at 12 %         |
| `--color-bg-subtle`          | neutral 500 at 8 %                      | follows asf                 |
| `--color-bg-brand-soft`      | primary main at 16 %                    | follows asf                 |
| `--color-bg-brand-tint`      | primary main at 8 %                     | follows asf                 |
| `--color-bg-{success,warning,danger,info}-soft` | the tone's main at 16 %  | follows asf                 |
| `--color-border-default`, `--border-subtle` | divider, neutral 500 at 20 % | follows asf                 |
| `--color-border-strong`      | neutral 500 #919EAB                     | follows asf                 |
| `--color-text-primary`       | text primary #1C252E                    | #FFFFFF                     |
| `--color-text-secondary`     | text secondary #637381                  | #919EAB                     |
| `--color-text-on-brand`      | primary contrast text #FFFFFF           | follows asf                 |
| `--color-status-success`     | success dark #118D57                    | success light #77ED8B       |
| `--color-status-warning`     | warning dark #B76E00                    | warning light #FFD666       |
| `--color-status-danger`      | error dark #B71D18                      | error light #FFAC82         |
| `--color-status-info`        | info dark #006C9C                       | info light #61F3F3          |

The sidebar tokens of D-145 (`--color-sidebar-*`) and the scrim token are gone: the asf shell and MUI's overlays carry their own colours from the theme.

Contrast rules (found while the pages moved, by the axe runs of the E2E and the gallery; ratios in `docs/ui/brand/colors.md` section 3):

1. **Text in green uses the dark shade** #007867 (5.41:1 on white), and the light shade #5BE49B in dark mode. The main green #00A76F reads only 3.11:1 as text on white: it marks icons, fills, selection and focus, never small text. In asf pieces this is `brandInk` (`templates/asf/components/shared.ts`); in page CSS `--color-brand-primary-dark`.
2. **White text only on the dark and darker shades.** White on the main green reads 3.11:1 and on the main red 3.17:1, so the danger button is the dark red #B71D18 (6.56:1) and the admin primary action is the dark button.
3. **Quiet text uses the secondary grey** #637381 (4.88:1 on white). The disabled grey #919EAB (2.73:1) is never used for text a person has to read.
4. **Soft chips and counts use the darkest shade of their tone** on the tone at 16 % (8.30 to 10.40:1); the kit's dark shade on its tint read only 3.2 to 3.6:1.
5. **Field labels and group legends use the secondary grey at rest and the text colour when focused**; the main green on a focused label read 3.1:1. Error texts take the dark red (`theme/overrides.ts`).
6. **Status is never colour alone:** a status always shows an icon and a word (section 5.2).
7. The logo keeps its own colours and is never tinted.

Success dark #118D57 (4.22:1) and warning dark #B76E00 (4.00:1) are below 4.5:1 as small text on white, so `tokens.css` maps `--color-status-success` and `--color-status-warning` to the darker shades (#065E49 and #7A4100) in light mode and to the light shades in dark mode; the dark shades stay for icons and large text (3:1).

### 2.2 Spacing

The asf spacing unit is 8 px: asf pieces space in multiples of it through the theme (a card's padding 24 px, gaps between cards 24 px, tight groups 8 to 12 px). The page CSS keeps its steps:

| Token       | Value | Typical use                                         |
| ----------- | ----- | --------------------------------------------------- |
| `--space-1` | 4px   | Icon to label gap, badge padding                    |
| `--space-2` | 8px   | Gap inside controls, between chips                  |
| `--space-3` | 12px  | Card padding on phones, row padding in dense tables |
| `--space-4` | 16px  | Page gutter on phones, card padding, form field gap |
| `--space-5` | 24px  | Section gap, page gutter on desktop                 |
| `--space-6` | 32px  | Between page regions                                |

No other spacing values in page CSS. Component dimensions (control heights, header heights, touch targets) are sizes, not spacing.

### 2.3 Radius

The asf radius (`tokens.ts` `radius`: small 6, medium 8, large 16; 0.75, 1 and 2 in theme units). The page CSS names:

| Token           | Value  | Use                                                        |
| --------------- | ------ | ---------------------------------------------------------- |
| `--radius-sm`   | 6px    | Chips, badges, checkboxes, tooltips                        |
| `--radius-md`   | 8px    | Fields, buttons, selects, menus, photo tiles               |
| `--radius-lg`   | 16px   | Cards, dialogs, drawers, bottom sheets (top corners only)  |
| `--radius-full` | 9999px | Avatars, progress bars, the switch track                   |

### 2.4 Typography

Font stack (D-150): Public Sans for UI text, with Noto Sans Bengali for the Bengali letters. In the asf theme `tokens.ts` sets `fontFamily` and `headingFontFamily` to "Public Sans Variable" (the app has no public display headings, so the kit's Barlow is not loaded); in page CSS `--font-sans: 'Public Sans Variable', 'Noto Sans Bengali Variable', sans-serif`. Both are variable fonts. The earlier rule "UbuntuSans and Bornomala, weights 400 and 700 only" (UX-13) is superseded by D-150.

The asf type variants (`theme/theme.ts`, base size 14 px) and their use (`templates/asf/DESIGN-GUIDE.md`):

| Variant     | Size     | Weight | Line height | Use                                 |
| ----------- | -------- | ------ | ----------- | ----------------------------------- |
| `h4`        | 24px     | 700    | 1.4         | Page title                          |
| `h5`        | 18px     | 700    | 1.5         | Larger card titles                  |
| `h6`        | 17px     | 600    | 1.55        | Card and section titles             |
| `subtitle2` | 14px     | 600    | 1.57        | Labels and emphasised values        |
| `body1`     | 16px     | 400    | 1.5         | Roomier body text                   |
| `body2`     | 14px     | 400    | 1.57        | Default text                        |
| `caption`   | 12px     | 400    | 1.5         | Small meta: times, ids, helper text |
| `overline`  | 11px     | 700    | 1.5         | Group titles                        |
| `button`    | 14px     | 700    | 1.7         | Buttons (no text transform)         |

The page CSS sizes (`tokens.css`):

| Token            | Phone and tablet (below 1024 px) | Desktop (1024 px and up) | Weight | Line height | Use                                                         |
| ---------------- | -------------------------------- | ------------------------ | ------ | ----------- | ----------------------------------------------------------- |
| `--text-hero`    | 24px                             | 36px                     | 700    | 1.3         | The title of a hero area only: the registration's panel (UX-23) |
| `--text-display` | 20px                             | 20px                     | 700    | 1.4         | Page title, big stat number                                 |
| `--text-title`   | 16px                             | 16px                     | 700    | 1.5         | Card and section titles, dialog titles                      |
| `--text-body`    | 16px                             | 14px                     | 400    | 1.5         | Body text, table cells, form values                         |
| `--text-label`   | 12px                             | 12px                     | 700    | 1.5         | Field labels, badge labels, tab labels                      |
| `--text-caption` | 12px                             | 12px                     | 400    | 1.5         | Helper text, metadata, timestamps                           |

Rules:

- Text inside inputs is never below 16 px on phones, because iOS Safari zooms on smaller inputs.
- Caption is 12 px, not 11 px, because Bengali conjuncts and vowel signs are unreadable at 11 px (O-40).
- Line height is 1.5 for body text and never below 1.4 for any text that may contain Bengali (the vowel signs above and below the line need the room).
- Tables, amounts, counts and ids use `font-variant-numeric: tabular-nums` so columns align.

The asf `overline` (a page's area label, a sidebar group, a status group, an error code) is set to 12 px, the floor above, and its letter-spacing of 0.04em applies to English only: the theme resets it to 0 under `:root:lang(bn)` (section 3 rule 1).
The Fontsource Public Sans file keeps the `tnum` feature: measured in Chromium on 2026-11-05, "1111" and "0000" are 26.1 and 38.9 px wide at 16 px with proportional digits and both 44.8 px with `font-variant-numeric: tabular-nums`.

### 2.5 Font files

| Family            | Package (npm, SIL Open Font License 1.1)         | How it reaches the page                                                                        |
| ----------------- | ------------------------------------------------ | ---------------------------------------------------------------------------------------------- |
| Public Sans       | `@fontsource-variable/public-sans` 5.3.0         | imported by the asf `UiProvider` (`templates/asf/components/ui-provider.tsx`), bundled by Vite |
| Noto Sans Bengali | `@fontsource-variable/noto-sans-bengali` 5.3.0   | the same                                                                                       |

The fonts are self-hosted through the build: no font CDN at runtime. Vite writes the `.woff2` files with their `unicode-range` declarations into the build, and the service worker precaches them with the rest of the build (`**/*.woff2`), so the installed app draws its text offline. Public Sans draws Latin letters and all digits; Noto Sans Bengali draws the Bengali script. The API's PDFs embed the same two files from the same packages (`apps/api/src/exports/pdf/fonts.ts`). The earlier files (the UbuntuSans subset of D-065 and the two Bornomala files) have left the app; the website's originals stay in `docs/ui/brand/fonts/` as a record.

### 2.6 Elevation

The asf card shadow: a hairline with a soft drop in the neutral 500 grey, never tinted green and never pure black. asf pieces use MUI's `Card` or the theme's `shadows.ts` (with a black variant in dark mode); a card never sits inside a card. The page CSS names (`tokens.css`):

| Token               | Value                                                                              | Use                                            |
| ------------------- | ---------------------------------------------------------------------------------- | ---------------------------------------------- |
| `--elevation-1`     | `0 0 2px 0 rgba(145 158 171 / 0.2), 0 12px 24px -4px rgba(145 158 171 / 0.12)`     | Cards, stat cards, attention items, tables     |
| `--elevation-2`     | `0 0 2px 0 rgba(145 158 171 / 0.24), 0 16px 32px -4px rgba(145 158 171 / 0.16)`    | Menus, dropdowns, drawers, bottom sheets       |
| `--elevation-3`     | `0 0 2px 0 rgba(145 158 171 / 0.24), 0 24px 48px -8px rgba(145 158 171 / 0.24)`    | Modals, confirm dialogs, toasts                |
| `--elevation-hover` | `0 0 2px 0 rgba(145 158 171 / 0.24), 0 20px 40px -4px rgba(145 158 171 / 0.2)`    | Hover on clickable cards (pointer devices)     |
| `--elevation-brand` | `0 8px 16px 0` primary main at 24 %                                                | The page CSS's own green buttons               |
| `--border-subtle`   | the asf divider (neutral 500 at 20 %)                                              | Card, table and panel borders                  |

### 2.6a Gradients and glow (UX-14)

Withdrawn with D-150: the gradient and glow tokens of UX-14 (`--gradient-hero`, `--gradient-brand`, `--gradient-soft`, `--gradient-accent-line`, `--glow-accent`, `--ring-brand`) are no longer defined, and no page CSS uses them. The asf design allows no gradient fill except a light area under a chart line. The earlier values are in git history.

### 2.7 Focus, motion and layers

- **Focus:** the asf theme's focus ring on every asf piece, never removed. Page CSS uses `--focus-ring` (`0 0 0 2px` surface, then `0 0 0 4px` primary main): the main green reaches 3.11:1 on white, above the 3:1 rule for a focus indicator.
- **Motion:** asf pieces move for 150 to 250 ms with `cubic-bezier(0.16, 1, 0.3, 1)`, only to show a change of state, animating transform, opacity, colour and shadow, never size or spacing; the theme turns transitions off for `prefers-reduced-motion: reduce`. Page CSS keeps `--motion-fast` (120 ms) for hover and pressed feedback, and the base layer (`base.css`) stops motion for people who ask for none.
- **Layers:** MUI's own layers (the app bar, drawers, dialogs and toasts from 1100 to 1400); page CSS keeps `--z-sticky` (10) for sticky table headers and action bars.

The motion and layer tokens of the earlier set (`--motion-base`, `--motion-slow`, `--ease-*`, `--z-nav` to `--z-toast`) are gone.

### 2.8 Breakpoints and sizes

The asf breakpoints (`theme/theme.ts`): xs 0, sm 600 px, md 900 px, lg 1200 px, xl 1536 px. What changes at each:

| Width            | Shell                                                                    | Lists                                  |
| ---------------- | ------------------------------------------------------------------------ | -------------------------------------- |
| below 600 px     | Header plus the bottom tabs and the "more" sheet                         | Table rows are cards                   |
| 600 to 1199 px   | The rail (also from 1200 px for a person without sidebar groups)         | Rows are cards below 900 px            |
| 1200 px and up   | The asf sidebar, folding to a rail, and the header with the breadcrumb   | Tables                                 |

The earlier set switched at 640 and 1024 px; an official between 1024 and 1199 px now gets the rail. The app's own page CSS still uses 1024 px in a few places (the `page-split` side column, the desktop text sizes and app bar height of `tokens.css`). The minimum supported width is 360 px; no page scrolls sideways there.

| Size         | Phone                 | Desktop                                            |
| ------------ | --------------------- | -------------------------------------------------- |
| Touch target | at least 44 by 44 px  | at least 24 by 24 px (WCAG 2.5.8), 32 px preferred |

The sizes of the asf template itself (`templates/asf/theme/overrides.ts` and `templates/asf/components/shell/`):

| Piece | Size |
| --- | --- |
| Button | 36 px high (small 30 px, large 48 px), 8 px radius |
| Tab | 48 px high |
| Header of the shell | 72 px |
| Sidebar | 280 px wide from 1200 px (`lg`), 88 px when collapsed |
| Rail | 88 px wide from 600 to 1199 px |
| Bottom tabs | 64 px high below 600 px |

### 2.9 Complete token block

The complete blocks are the files themselves, not copied here so they cannot drift:

- `apps/web/src/ui/tokens.ts`: the asf theme tokens (scales, spacing, radius, fonts).
- `apps/web/src/styles/tokens.css`: the page CSS tokens, light with the asf fallbacks and the dark block.

The earlier block of this section (the website palette of UX-01 with `--font-sans: UbuntuSans, Bornomala, sans-serif`) is superseded by D-150 and ADR-016 and remains in git history.

## 3. Typography rules for Bengali and mixed text

1. **No letter-spacing** on any text. Tracking breaks Bengali conjuncts.
2. **No italics.** Noto Sans Bengali has no italic face and a synthetic slant is unreadable. Emphasis is Bold.
3. **No `text-transform`** on labels, headers or buttons. Upper-casing affects only the English interface and makes the two languages diverge.
4. **Wrap rather than truncate.** Titles and list rows wrap to two lines (`line-clamp: 2`) before an ellipsis. Truncation never cuts inside a grapheme cluster; the browser's ellipsis is used, never a fixed character count.
5. **Never truncate identity.** Beneficiary and volunteer names, father or husband names, NID and birth-registration numbers, application numbers and transaction ids are shown in full on review, profile and detail screens. Lists may clamp names to two lines.
6. **Room for both languages.** Labels and buttons allow about 30 percent growth between bn and en. No fixed widths or fixed heights on text containers; buttons grow, they do not clip.
7. **Line height floors** as in §2.4: 1.5 for body, never below 1.4.
8. **Digits** are always 0-9 (UX-05), produced only by the central formatting utility (I18N, T0.20 and T1.5). Taka amounts below 10 lakh use lakh grouping (৳ 3,00,000) and amounts of 10 lakh and above are shown in millions (৳ 1.26 মিলিয়ন) (O-42); the remaining digit-grouping and currency details are defined in I18N.md. Phone numbers and ids are shown without grouping.
9. **Mixed script.** Latin and digits are drawn by Public Sans and Bengali by Noto Sans Bengali from the same stack; no per-language font switching in components. Dates and times follow the I18N formats with English digits (dd-mm-yyyy, 12-hour time with the Bengali day period first, O-43); no Hijri date is shown.
10. **Bilingual data** (form labels, option lists, status and stage names) is rendered in the user's language with the fallback rule of I18N.md; components never assume one language is shorter.

### 3.1 Logo

- Use `docs/ui/brand/logo.svg` wherever sharpness matters: login, the app bar, PDF exports. `logo.png` (300 by 196 px) is a fallback only and is never shown wider than 150 CSS px.
- Minimum height 32 px in the app bar and 72 px on the login screen. Clear space around the logo at least a quarter of its height.
- The logo keeps its colours, is never tinted, recoloured, stretched or placed on amber or green fills. It sits on surface or canvas.
- The logo's wordmark is drawn in the earlier ink (#0F2920) and has no light variant, so in dark mode the logo sits on a small white pad with rounded corners, uncoloured, wherever it is drawn (D-155; the rule is in `apps/web/src/styles/base.css`).
- The app bar shows the logo and the system name চ্যারিটি ও সোশ্যাল সার্ভিস (English: Charity & Social Service) (UX-09). On phones narrower than 400 px the name may wrap to two lines. The PWA short name is "ASF Charity" (O-31).

## 4. Layout patterns per device

From DESIGN_BRIEF §5. Officials work equally on desktop and phone (UX-03); setup screens are desktop first (UX-04).

| Width                   | Navigation                                                       | Lists and tables                                 | Detail and actions                                                     |
| ----------------------- | ---------------------------------------------------------------- | ------------------------------------------------ | ---------------------------------------------------------------------- |
| Phone, below 600 px     | Header plus a bottom tab bar (four tabs and a "more" sheet)      | Cards, one per row; filters in a bottom sheet    | Full-screen detail; sticky action bar                                  |
| Tablet, 600 to 1199 px  | The rail                                                         | Cards below 900 px, tables above                 | Drawer detail from the right                                           |
| Desktop, 1200 px and up | The asf sidebar, folding to a rail                               | Dense tables with filters, search and pagination | Split view: list left, detail panel with timeline and change log right |

The widths are the asf breakpoints (§2.8); DESIGN_BRIEF §5 recorded the earlier 640 and 1024 px.

### 4.1 App shell

The shell is the asf `AppShell` with the app's additions (`compactNav`, counts, the header's left slot, the banner slot and the sidebar's foot; `local.json` "AppShell (extended) and BottomNav"), wired in `apps/web/src/components/shell/AppShell.tsx`.

- **Header** (all sizes): logo and system name, then on the right the sync indicator, the notification bell with an unread count, the language switch (a group of two pressed buttons), the light and dark switch (`ColorModeButton`) and the profile menu (`AccountMenu`: profile, device sessions, logout). On phones the language switch moves into the profile menu. Beside the sidebar the header shows the page's breadcrumb on its left (D-145). There is no global search box.
- **Phone bottom tab bar:** four role-dependent tabs plus "more". Volunteers: home, applications, today's work, notifications, more. Officials: home, review, people (volunteers and beneficiaries), projects, more. Phase 1 (D-100) shows only destinations that exist: volunteers home, my projects, notifications, more; officials home, people, projects, notifications, more, a tab the official may not use hidden; applications, today's work and review join with their modules. Tabs are links with an icon and a label, never icon only. The bar respects `env(safe-area-inset-bottom)`.
- **Rail:** the same destinations as icons with labels, from 600 px to 1199 px and for a person without sidebar groups at any width above the tabs. Volunteers have no sidebar; from 600 px their four destinations sit in the rail (D-100).
- **Sidebar** (from 1200 px): the asf sidebar, folding to a rail, in the asf colours of the current mode. At the top the Foundation's mark and the system name; then the destinations in their groups (`apps/web/src/admin/navigation.ts`), each group under a small heading, each item an icon and a label; the current page is the app's own (`aria-current="page"`), in the folded rail too. A destination shows a count only where the home's "needs your attention" list already counts it (English digits, in the darker shade of its tone). The sidebar is a named landmark, so a page's own side column stays a landmark of its own. The ink sidebar of D-145 with its help card and amber bar is superseded by D-150.
- **Banners** sit between the app bar and the content: offline, update available, iOS storage warning, install guidance (§7, §8).
- Navigation is built from the user's effective permissions; a destination the user cannot use is not shown. The server still denies by default. The officials' destination "প্রোগ্রাম ও প্রকল্প" (the phone tab "প্রকল্প") replaces the separate programs and projects destinations (D-176), for the five roles of `project.overview.view`.

### 4.2 Page structure

- Page header (the asf `Page` with `eyebrow`, §5.3a; D-145): a small area label (the eyebrow), the page title (`h4`), one line saying what the page is for or its context (project and area), and the page's actions on the right, wrapping under the title on phones. The breadcrumb sits in the app bar (§4.1), not in the page. On phones the primary action becomes a sticky bottom button or a floating action button only when the screen has one dominant action (new application).
- Page gutter (the asf shell): 16 px on phones, 24 px from 600 px, 40 px from 1200 px. Content width: forms and detail at most 720 px; lists, dashboards and split views up to the asf content width (MUI's `lg` container, 1200 px).
- Cards stack with 16 px gaps on phones and sit in a 12-column grid from 1024 px.

### 4.3 Split view (review, people, issues)

- Desktop: list on the left (minimum 400 px), detail on the right (420 px, 480 px from 1440 px; O-41). Column priority 4 (the columns hidden in the split view) is gone with the asf table; its columns take priority 3. Selecting a row loads the detail without leaving the list; the URL holds the selected id so the view can be shared and reloaded.
- Tablet: the list fills the page, the detail opens in a drawer.
- Phone: the list fills the page, the detail opens full screen with a back button; the action bar is sticky at the bottom.
- Keyboard on desktop: arrow keys move the selection in the list, Enter opens the detail, Escape returns focus to the list.

### 4.4 Setup screens (desktop first, UX-04)

Form builder, project setup, permission panel, template and checklist editors, admin settings.

- Desktop: multi-column editors with a live preview.
- Tablet: single column, preview in a drawer.
- Phone: readable, small edits only (rename, toggle, change a date); a persistent Alert (info) reads "best on a larger screen". Structural edits (adding sections, reordering, bulk permission changes) are hidden on phones. No drag and drop anywhere except the form builder's outline (D-122), which also keeps move-up and move-down in each row's menu for the keyboard and for phones; everywhere else ordering uses move-up and move-down buttons.

### 4.5 Admin area layout (UX-15)

Since T1.15 (D-100) the admin pages sit inside the app shell of §4.1: its app bar replaces the admin top bar below, and its sidebar, rail and bottom tabs replace the admin sidebar and the phone menu row. The addresses under `/admin`, the audience gate and the "best on a larger screen" notice stay.

The management screens and admin settings live under `/admin` (`apps/web/src/admin/`), loaded as their own route chunk. They use this design system and the asf contract (`@/ui`) like every other screen; no second UI library is used (the MUI Minimal template was not adopted, UX-15, and the asf template is built clean-room, ADR-016).

- The admin pages use the app bar and the sidebar of §4.1; the separate admin top bar and admin sidebar of UX-15 are gone.
- Content: the page header of §4.2, then cards; maximum width `--content-max`.
- Phones: the "best on a larger screen" Alert of §4.4 is shown under 768 px; the pages stay readable. A page officials use on a phone as much as on a computer carries `handle: { phoneReady: true }` on its route (`AdminRouteHandle` of `admin/AdminLayout.tsx`) and shows no notice: the programs and projects tab, a program's page and a project's page (D-176).
- Audience: Department Head, Monitoring Team and Program Managers; any other signed-in user sees a "no access" page. Navigation only hides; the server enforces every admin permission.

## 5. Component inventory

Every base component of constitution §12 is a piece of the asf contract, built once and reused everywhere (D-150, ADR-016). The contract is `apps/web/src/ui/contract.ts`: the kit's core set (`UiTemplate`) and the extended set (`UiTemplateExtended`), whose prop types are the source of truth for every piece below. The implementation is the asf template in `apps/web/src/ui/templates/asf/` (MUI core with Emotion, MUI X date pickers with Day.js, the theme in `theme/`, the pieces in `components/`), selected by one line in `apps/web/src/ui/index.ts`. Pages import only `@/ui`; MUI and Emotion stay inside the template folder, and a lint rule refuses `@css/ui` and `lucide-react`. Props are plain data, `ReactNode` and callbacks: no MUI types, no `sx`, no class names, so a page can never change a piece's colours or typography. All visible text comes from i18n keys: the pieces' own words (`UiLabels`: "required", "close", pager words) come from the `asf` group of the `ui` namespace through the asf `UiProvider`. Accessibility behaviour follows the WAI-ARIA Authoring Practices pattern named. Pages lay out with the contract's `Stack`, `Grid`, `DescriptionList` and `Text` or their own CSS on the tokens of §2; there are no utility classes.

The pieces this app added to the kit's contract (the phone card list and the rest of the extended table, the choices, the record fields, the overlays, the file upload, the progress pieces, the people and profile pieces, the states, 79 more Solar icons, the extended shell and the bottom tabs, and the contrast fixes of the theme) are listed in `apps/web/src/ui/templates/asf/local.json`, each with its files, a one-line note and a screenshot in `docs/ui/asf-pieces/`, so a person can bring them into the kit for every app. A new piece follows `templates/asf/DESIGN-GUIDE.md`: contract first, test first (`ui.extended.test.tsx` or `ui.local.<area>.test.tsx`), seen in light and dark at phone and desktop width, then recorded in `local.json`. The dev gallery of every piece is at `/dev/asf` (`apps/web/src/dev/AsfGallery.tsx`, dev and E2E builds only).

Where each section of this chapter lives in the contract:

| Section                      | asf piece (contract name)                                                                                     |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------- |
| 5.1 Button                   | `Button`, `LinkButton`, `IconButton`                                                                          |
| 5.2 Badge / Status           | `StatusChip`, `Chip`                                                                                          |
| 5.3 Card / Stat              | `Card`, `StatCard`, `ProgressStat`, `SummaryBanner`, `AttentionCard`, `IconTile`, `FlipCard`; the app's `CoverArt` in `components/CoverArt.tsx` |
| 5.3a Page header             | `Page` (`eyebrow`, title, description, actions); `RecordHeader` for a record's page with its tabs (D-185)     |
| 5.4 Field                    | `TextField`, `SelectField`, `Combobox`, `Checkbox`, `CheckboxGroup`, `RadioGroup`, `DateField`, `TimeField`, `MonthField`, `Form` and its form fields, `FormSection`, `ErrorSummary` |
| 5.5 Nav / Item               | `AppShell` (`NavGroup`, `NavItem`), `BottomNav`                                                               |
| 5.6 Row / Toggle             | `Switch`, `ChoiceTiles`                                                                                       |
| 5.7 Table                    | `DataTable`, `FilterBar`, `StatFilterBar`, `PersonCell`                                                       |
| 5.8 Modal                    | `Dialog`                                                                                                      |
| 5.9 Drawer                   | `Drawer` (a bottom sheet on phones)                                                                           |
| 5.9a Photo viewer            | `PhotoViewer` (a photo seen large, with the record's photos, zoom, full screen and the details; D-181)         |
| 5.10 Confirm dialog          | `ConfirmDialog`                                                                                               |
| 5.11 Alert                   | `Alert`, `useToast`                                                                                           |
| 5.12 File upload             | `FileUpload`                                                                                                  |
| 5.13 Tabs                    | `Tabs` (panels on one page); `LinkTabs` (links to a record's pages, D-185)                                    |
| 5.14 Breadcrumb              | `Breadcrumbs`                                                                                                 |
| 5.15 Empty / Loading / Error | `EmptyState`, `LoadingState`, `Skeleton`, `Spinner`; the app's `components/LoadError.tsx` (asf has no error state) |
| 5.16 Offline banner          | `OfflineBanner`                                                                                               |
| 5.17 Bulk-update list row    | `BulkList`, `BulkRow`                                                                                         |
| 5.18 Step / timeline         | `Stepper`, `Timeline`                                                                                         |
| 5.19 Progress bar            | `ProgressBar`                                                                                                 |
| Profiles (UX-22)             | `ProfileBanner`, `ProfileSection`, `ContactList`, `CopyButton`, `Disclosure`, `DescriptionList`; the app's `PersonBanner` in `components/PersonPhoto.tsx` |
| Menus                        | `Menu`, `AccountMenu`                                                                                         |

The prop tables of the sections below record the behaviour each piece carries; where a prop name differs, `contract.ts` wins.

**Finish (asf).** Every piece follows the asf look (`templates/asf/DESIGN-GUIDE.md`):

- **Surfaces:** cards, tables and panels are MUI cards with the asf card shadow (§2.6), radius 16 px and 24 px padding; never a card inside a card.
- **Buttons:** primary is the dark button on admin screens (neutral 800 with white text; white with dark text in dark mode) and the brand green on public pages; secondary is outlined; danger is the dark red.
- **Fields:** radius 8 px; labels and legends in the secondary grey, the text colour when focused (§2.1 rule 5).
- **Status:** the soft style: the tone at 16 % behind its darkest shade, with an icon and a word.
- **Motion:** 150 to 250 ms, only to show a change of state; off for reduced motion.
- **Tables:** the rows become cards below 900 px; a row's actions sit on its phone card, drawn by the table itself.
- **Empty states:** the asf `EmptyState`: an icon, a title (a paragraph, not a heading) and one sentence saying what will appear.

The premium finish of UX-14 (gradients, glows, the hero header, the amber accent line, the sheen on green buttons) and the mockups that showed it (`docs/ui/mockups/`, removed with D-151) are superseded by D-150.

Supporting pieces used by several components: **Icon** (`<Icon name="..." />` from `@/ui`: the Solar icon set, CC BY 4.0, duotone for concepts and line style for small glyphs; decorative unless it is the only content; `apps/web/src/ui/icon-map.md` maps the earlier Lucide names to the asf names, and a new icon is added through `apps/web/scripts/asf/build-icons.mjs`), **Avatar** (photo or initial, never a sensitive photo; only a source the app made or serves), **Toast** (`useToast`, a polite status message, never the only place an error is reported), **Sticky action bar**, **Photo tile** (§6.5), **Bottom sheet** (the phone variant of Drawer).

### 5.1 Button

| Prop                   | Values                                                                             | Default   |
| ---------------------- | ---------------------------------------------------------------------------------- | --------- |
| `variant`              | `primary`, `secondary`, `text`, `danger`                                           | `primary` |
| `size`                 | `medium`, `small`                                                                  | `medium`  |
| `startIcon`, `endIcon` | an asf icon name (`ExtendedIconName`)                                              | none      |
| `ariaLabel`            | a longer name that holds the visible words ("Personal details: edit")              | none      |
| `loading`              | boolean                                                                            | false     |
| `disabled`             | boolean                                                                            | false     |
| `fullWidth`            | boolean (phones: primary actions in sheets and action bars)                        | false     |
| `type`                 | `button`, `submit`                                                                 | `button`  |

- **primary:** on admin screens the dark button (neutral 800 with white text, hover neutral 700; in dark mode white with neutral 800 text); on public pages the brand green, roomier.
- **secondary:** outlined, in the text colour.
- **text:** no fill, in the text colour; for tertiary actions (the ghost button of the earlier set).
- **danger:** the dark red #B71D18 with white text (6.56:1; the main red reads only 3.0:1); only for destructive or rejecting actions and always followed by a Confirm dialog.
- States: hover, focus (the theme's focus ring), disabled, loading (the button shows its progress and blocks clicks; when its work ends it takes the keyboard's focus back, so a dialog keeps the focus and Escape still reaches it).
- `LinkButton` is a link to an app path that looks like a button; `IconButton` is an icon-only button named by its `label`, shown as its tooltip, and can be a link (`to`).
- Accessibility: native `<button>`; links that navigate are links styled as buttons. One primary button per region.
- Do not: put two primary buttons side by side; use amber or status colours other than danger; use a button for navigation between pages.

### 5.2 Badge / Status

| Prop    | Values                                                     |
| ------- | ---------------------------------------------------------- |
| `status` | a `StatusKey` of the contract (`StatusChip`); the tone and icon follow from it |
| `label`  | i18n key or bilingual data value                                               |
| `size`   | `medium`, `small` (dense tables)                                               |

`Chip` is the general chip (`tone` neutral, primary, secondary, info, success, warning or error; `variant` soft, outline or solid) for a state the map below does not hold.

- Look: the asf soft chip (`--radius-sm`): the tone at 16 % behind its darkest shade (§2.1 rule 4), the word and the icon in that shade.
- Workflow state mapping (WORKFLOW_ENGINE.md, common cycle), used by every list and detail (`STATUS_LOOK` in `templates/asf/components/status.tsx`):

| State                           | Tone    | Icon                             |
| ------------------------------- | ------- | -------------------------------- |
| draft                           | neutral | `edit`                           |
| needs_verification              | warning | `warning`                        |
| submitted                       | info    | `send`                           |
| under_review                    | info    | `search`                         |
| reviewed                        | info    | `check`                          |
| waitlisted                      | warning | `hourglass`                      |
| approved                        | success | `success`                        |
| rejected                        | error   | `rejected`                       |
| implementation (and its stages) | primary | `briefcase` (stage name as label) |
| completed                       | success | `star`                           |
| closed                          | neutral | `lock`                           |
| deleted                         | neutral | `delete`                         |

- Other statuses use the same tones: sync (pending neutral `clock`, syncing info `refresh`, synced success `check`, failed error `error`); photo (verified success `shield`, flagged warning `warning`, pending upload neutral `cloud-upload`); blocklisted error `block`. The office's application lists take their tone from `stateTone` (`features/applications/status.ts`).
- Accessibility: the label is real text; the icon is decorative. A badge is not interactive; if it filters a list it is wrapped in a button.
- Do not: show a status by colour alone; invent tones.

### 5.3 Card / Stat

| Prop                               | Values                                   |
| ---------------------------------- | ---------------------------------------- |
| `variant`                          | `default`, `stat`, `attention`, `accent` |
| `title`, `subtitle`                | text                                     |
| `actions`                          | up to two buttons or a menu              |
| `href`                             | makes the whole card a link              |
| `value`, `target`, `delta`, `unit` | (`stat`) numbers                         |
| `loading`                          | boolean, shows a skeleton                |

- `default` (`Card`): paper, the asf card shadow, `--radius-lg`, 24 px padding.
- `stat` (`StatCard`, `ProgressStat`): label, value (tabular digits), optional target and a Progress bar ("1,240 of 2,000"), and an optional icon on a soft square (`IconTile`) in its tone; a stat card can link to the list it counts (`to`). The summary banner's figures (`SummaryBanner`) are a list of terms and values. One line of plain context may sit under the value. No card compares with an earlier period until the app computes one (`delta` stays unused). Progress-first dashboards (UX-10) use stat cards in their first row.
- A `default` card's head (D-145): the title (Title), an optional one-line description (Caption, secondary), and an optional link or action on the right of the title.
- `attention` (`AttentionCard`): a "needs your attention" item: icon, one-line reason, due or waiting time, and a link to its list. Used on every My Work home.
- `accent`: the amber highlight of the earlier set is not an asf piece; an announcement takes the asf `Alert` until a screen needs more.
- **Record header** (`RecordHeader`, the session's page, D-185): the head of a record's page on a light card, never a dark band (the dark band is a person's `ProfileBanner`). A 184 × 128 px picture (radius 12; a phone puts it above the name at full width, 120 px high) beside the name (`h4`, `h5` on a phone) with its state chips, a line of facts each with an 18 px icon whose label is read out before its value, two lines of description (the whole text in the element's title) and the actions in a named group that moves under the text when both do not fit; the record's tabs run along the card's foot behind a hairline. The compact form (the pages under the tabs) keeps a 48 px picture, the name (`h5`), the state and the actions. Icon buttons of the actions (a copy, a menu) stay together in a row so they never wrap apart on a phone.
- **Link tabs** (`LinkTabs`): the underline look of `Tabs` on a `nav` of router links: the current page bold in `text.primary` with the 2 px line under it and `aria-current="page"`, the others in `text.secondary`; a 20 px icon before each label; on a narrow screen the row scrolls sideways without a scroll bar and scrolls itself (never the page) to keep the current tab in view; the focus ring is drawn inside the link so the scrolling row does not clip it. An address that is not a path of the app is left out.
- **Key fact tiles** (the session's summary): a `Card` with an `IconTile` (large, a tone per fact) beside the label (small, muted) and the value in bold body text, for values a stat card's large figure would break over lines (a period, a program's name); figures stay `StatCard`s.
- **Flip card** (`FlipCard`, the cards of programs and projects, D-176): two faces of one size (460 px by default), each the asf card. The front: a 150 px picture (a cover photo, or the app's `CoverArt` drawing: green hills under a pale sun, lighter to darker from the sky to the front hill in both modes through the `--color-art-*` tokens, the same picture for the same record, solid fills only; no text sits on it, the badge and the chips stand on paper) with a short badge, a corner chip and a foot chip over it, the title (`h6`, two lines at most, a long word broken anywhere) as the link the whole front opens, the figures, and a hint row. The back: an eyebrow, the title again, the "Back" button, then the people, more figures and the actions.
  - Turning: on a computer (`(hover: hover) and (pointer: fine)`) the card turns while a pointer that can rest is on it (a finger on a laptop's touch screen taps instead) and writes no hint (the owner, 2026-11-17, D-180), so the front draws no row of its own there; on every other device a row under a line shows the "Details" button. From the keyboard, on every device, "Details" turns it and puts the focus on "Back", which turns it back and returns the focus; on a computer "Details" shows when the keyboard reaches it. The keyboard's focus leaving the card turns it back; a tap or a click inside the card never does. Each button's name says which card ("<title>: show details").
  - Content: the front holds figures only, never a control (the title's link covers it); the actions are on the back.
  - Heights per card kind (`cards-api.ts`): a program card is 380 px, which its back (the manager, the RPMs, two figures, the two actions side by side) fits; the figures sit at the foot of the front, so the room a short name leaves stays under the name, not under the figures. A back that also carries the caller's work and a long description scrolls inside the card. A project card is 440 px (measured on the demo data: the back needs 326 px of 346 px on a computer, and on a 360 px phone the fullest back, the own work with the budget and both actions stacked, needs 374 px and scrolls inside the card): its back holds the current session's RPMs, four figures in two rows, the caller's work (with the budget for whoever may see it) and the two actions side by side; its front the approved bar and three figures at its foot. The shared back parts are `CardTeam` and `CardTodo` (`CardParts.tsx`).
  - The view switch of a tab with cards and a list ("কার্ড | তালিকা") is the `SegmentedControl`, the app's addition to the asf set (local.json): the two-button pressed group of the language switch under a name of its own, named by its label; the view lives in the address. What does not fit scrolls inside its face. The title link's focus ring is drawn inside the card's edge, since the title clips its own overflow.
  - The hidden face is `inert` and `aria-hidden`: out of the tab order and the accessibility tree.
  - Motion: a 3D turn (`perspective: 1200px`, `preserve-3d`, `backface-visibility: hidden`) of 0.7 s, the one asf movement longer than the 150 to 250 ms of "Focus, motion and layers", because a turn of a whole card must be seen as one (the owner's approved design, D-176); none under `prefers-reduced-motion: reduce`, where the faces change at once.
- Accessibility: a linked card is one `<a>` with the title as its name; nested interactive controls are not allowed inside a linked card. Stat values are announced with their label ("approved: 1,240 of 2,000").
- Do not: nest cards; give cards heavy shadows; colour a whole card with a status colour.

### 5.3a Page header (D-145)

| Prop | Values |
| --- | --- |
| `eyebrow` | the area label, short text |
| `title` | the page title, the page's only `h1` |
| `meta` | a badge or a status beside the title |
| `description` | one line: what the page is for, or its context |
| `actions` | the page's buttons |

- Look (the asf `Page`): the eyebrow in `overline`, in the green text shade (§2.1 rule 1), after a 6 px dot in the main green; the title in `h4`; the description in `body2`, secondary. The actions sit beside the title and wrap under it on narrow screens. The app sets its own bilingual document title (`documentTitle={false}` with `DocumentTitle`).
- A page the owner has not designed yet keeps its title and actions and has no eyebrow or description until its mockup (D-145); an intro line it already had becomes its description.
- The public pages and the registration draw their own title band on the asf palette (`features/registration/RegisterPage.tsx`); the earlier `PageBand` piece is gone.
- Accessibility: the title is the page's only `h1`; the eyebrow and the description are plain text read in order.

### 5.4 Field

One wrapper (label, control, helper text, error message, required mark, lock state) around each control type.

| Prop                   | Values                                                                                                         |
| ---------------------- | -------------------------------------------------------------------------------------------------------------- |
| `label`                | required; i18n key or bilingual data                                                                           |
| `helper`               | optional helper text (Caption, secondary)                                                                      |
| `error`                | error message key; sets `aria-invalid`                                                                         |
| `required`             | boolean; shows a "required" text mark, not only an asterisk                                                    |
| `locked`               | boolean; read-only with a lock icon and an optional `onRequestCorrection` link (BD-02, BD-18)                  |
| `readOnly`, `disabled` | boolean                                                                                                        |
| `visibility`           | `all`, `official_only` (renders only for officials; the server never sends official-only fields to volunteers) |
| `changed`              | boolean; shows a "changed" marker with old value on hover/focus (change log)                                   |

Control types:

- **Text** (`text`, `long_text` with auto-growing textarea, `email`, `phone` with `inputmode="tel"`, `nid` with `inputmode="numeric"` and length hint 10/13/17).
- **Number** (the asf text field's kinds `integer`, `decimal` and `money` with the ৳ sign): `inputmode="numeric"` or `"decimal"`, English digits only; Bengali digits a person types become English digits.
- **Select** (`SelectField`, which becomes a searchable `Combobox` above 10 options; `Combobox` also for a server search or free text, and a server search of people opens on its first options before any text, D-161; multi-select as a checkbox list in a sheet on phones); **Radio** group; **Checkbox** group; the "অন্যান্য" (other) option opens a text input inside the same field (BD-14).
- **Date / time / month** (`DateField`, `TimeField`, `MonthField` on MUI X date pickers with Day.js, O-55, D-150): day, month and year parts typed with the numeric keypad and shown as DD-MM-YYYY with English digits; the picker's own words come from the app's labels in both languages; a date outside the allowed range is marked invalid. The fields take ISO strings with `""` for empty; the forms turn an empty date into `null` at the request boundary. Native date inputs are not used because they show the phone's own format.
- **File**: see File upload (§5.12).
- **Address**: the Bangladesh address cascade (division, district, upazila, union; no ward, O-09) as chained selects from the cached locations master; each select is disabled until its parent is chosen.

Look: the asf outlined field, `--radius-md`; the label in the secondary grey at rest and the text colour when focused (§2.1 rule 5); the error text in the dark red. The marks of a record field (locked with a correction link, changed with its previous value, officials only) are part of its description, so a screen reader says a field is locked beside its help. Locked: read-only, lock icon, value in primary text (still readable and copyable).

Accessibility: `<label for>` always visible (never placeholder-only); helper and error linked with `aria-describedby`; errors announced on submit through the error summary (§6.3); required stated in text; groups use `<fieldset>` and `<legend>`.

End action (UX-16): `endAction` puts a small action or state inside the end of a text or phone field, for example "যাচাই করুন" or the verified mark of a contact; the text never runs under it. Used by the registration contacts and the profile code fields.

Do not: use placeholders as labels; validate on every keystroke (validate on blur and on submit); hide the reason a field is locked.

### 5.5 Nav / Item

| Prop            | Values                                                  |
| --------------- | ------------------------------------------------------- |
| `icon`, `label` | required (icon plus text everywhere)                    |
| `href`          | destination                                             |
| `active`        | boolean, sets `aria-current="page"`                     |
| `badge`         | count (unread, pending), English digits, "99+" above 99 |
| `variant`       | `sidebar`, `rail`, `tab-bar`, `sheet`                   |

Current: the asf shell's current-item look, set from the app's own current page (`aria-current="page"`), in the folded rail and the bottom tabs too. Focus: the theme's focus ring. The props are those of `NavItem` and `NavGroup` in `contract.ts`. Accessibility: `<nav>` landmarks with a label; counts are part of the accessible name ("review, 12 pending").

### 5.6 Row / Toggle

A settings or list row with a title, optional description and a trailing control (switch, chevron or value). Used by component toggles in project setup, notification preferences and permission rows.

| Prop                       | Values                                                                                         |
| -------------------------- | ---------------------------------------------------------------------------------------------- |
| `title`, `description`     | text                                                                                           |
| `control`                  | `switch`, `chevron`, `value`, `none`                                                           |
| `checked`, `onChange`      | for `switch`                                                                                   |
| `disabled`, `lockedReason` | a locked toggle shows why (for example a component that cannot be turned off after activation) |

Switch: the asf `Switch` (`label` or `ariaLabel`, `checked`, `onChange`, `disabled`, `hint`); a locked toggle gives its lock reason as the hint. Accessibility: `role="switch"` with `aria-checked`; the whole row is the label; Space toggles.

### 5.7 Table (with filters, search and pagination)

| Prop                             | Values                                                                                                                                                                                                                                                |
| -------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `columns`                        | id, header key, cell renderer, `priority` (1 = always shown, 2 = tablet and up, 3 = desktop only; the earlier priority 4 of the split view is gone and its columns take 3), alignment (numbers right)                                                    |
| `rows`, `rowKey`                 | data                                                                                                                                                                                                                                                  |
| `selectable`                     | `none`, `single` (split view), `multiple` (bulk)                                                                                                                                                                                                      |
| `filters`                        | filter definitions (select, date range, status chips)                                                                                                                                                                                                 |
| `search`                         | boolean; search box with 300 ms debounce, minimum 2 characters                                                                                                                                                                                        |
| `sort`                           | allowed sort keys (API_STANDARDS sorting)                                                                                                                                                                                                             |
| `pagination`                     | numbered pages, or the keyset cursor with "load more" or next/previous and the counted page numbers between them; shows "25 of 10000+" with capped totals (the count line, `useCountLine` in `admin/list-paging.ts`) |
| `density`                        | `comfortable` (48 px rows), `compact` (40 px rows, desktop)                                                                                                                                                                                           |
| `cardRenderer`                   | how a row renders as a card on phones                                                                                                                                                                                                                 |
| `emptyState`, `loading`, `error` | §8 states                                                                                                                                                                                                                                             |

- Desktop: a native table; hover row highlight, selected row marked, a row that opens takes focus and opens with Enter, and every control in it is in the tab order; a table wider than its box becomes a named region in the tab order. Row actions as text buttons or a menu at the row end (each row's menu named with its row), under a header named "অ্যাকশন" / "Actions" at the end of the header row (owner, 2026-11-02); the buttons keep their words on one line.
- The list card (D-145): the table sits in one card with the list's search, filters and export in the asf `FilterBar` above it (a delayed search, status chips, removable active filters, a filters panel on phones); a person or record cell (`PersonCell`) shows a tinted initial, icon or photo tile beside the name as a link and a muted second line (an id, a family size, a code). A selection outlives its page: the bulk bar counts every chosen row still on the page, and "select all" adds or removes only the rows shown.
- Tablet: only priority 1 and 2 columns; the rest in the drawer detail.
- Phone (below 900 px): rows become cards (`cardRenderer`) in one column that never grows past the screen, a long word breaking: title line (name), meta line (app number, area), status badge; the table draws the row's actions on the card itself, so a card renderer draws none. Filters move into a bottom sheet behind a "filter" button that shows the active filter count. Search stays at the top.
- Pagination follows the API: 25 per page; a cursor list shows its counted page numbers between previous and next (the volunteer tab counts its first 10000 rows and goes by cursor past them), "load more" on phones.
- Accessibility: a real `<table>` on tablet and desktop with `<th scope>`; sortable headers are buttons with `aria-sort`; the phone card list is a `<ul>`; the result count is announced politely after filtering.
- Do not: horizontal-scroll a table on phones; load all rows; put more than one primary action in a row.

### 5.7a Photo viewer

`PhotoViewer` (D-181) shows a photo large wherever the app enlarges one: the whole screen on a dark stage (the `grey.900` of the palette in both modes, so a photo's colours read the same), the photo as large as fits, zoomed by the buttons under it (out, whole photo, in), the wheel, two fingers, a double press and the + and - keys, and moved by dragging once zoomed; the browser's full screen where it offers one. The record's other photos come by the arrows at the stage's sides, the arrow keys and a strip of small pictures under the stage, the one shown marked. The details of the photo (when and where it was taken, its size, who uploaded it) stand in a 340 px panel beside the stage from 1024 px, opened and closed by "Details", and below that open as a sheet from the bottom. The page passes its own actions to the top bar (a download, a copied in-app link); the viewer has no delete. A photo still being checked shows its message in place of the picture.

### 5.8 Modal

For focused tasks that must be finished or cancelled (a reason dialog, a field unlock form).

| Prop                               | Values                                      |
| ---------------------------------- | ------------------------------------------- |
| `title`                            | required                                    |
| `size`                             | `sm` (400 px), `md` (560 px), `lg` (720 px) |
| `open`, `onClose`                  | control                                     |
| `primaryAction`, `secondaryAction` | buttons in the footer                       |
| `dismissible`                      | boolean; false while saving                 |

The asf `Dialog` has one set of actions (the earlier primary and secondary actions become that set; a dialog that does one thing ends with `components/DialogButtons.tsx`: cancel, then the named action). It stays open while saving, and fills a phone for a long form. Accessibility (APG dialog pattern): `role="dialog"`, `aria-modal`, labelled by the title; focus moves into the dialog and is trapped; Escape closes when dismissible (a dialog that is not dismissible gets no close handler); focus returns to the trigger. Scrim and shadow come from MUI's dialog in the asf theme.

### 5.9 Drawer

A side panel for detail without leaving the list (tablet split view, filters on desktop, preview in setup screens). Props: `side` (`right`, `bottom`), `title`, `width` (420 px default), `open`, `onClose`. On phones every drawer becomes a bottom sheet (max height 90 percent, drag handle that is also a close button). Accessibility: like Modal when it blocks the page; as a complementary region when it does not (the non-blocking variant is built with the first screen that needs it; T1.4 ships the blocking drawer).

### 5.10 Confirm dialog

A small Modal for irreversible or significant actions (approve, reject, waitlist, close project, blocklist, merge, transfer, revoke session).

| Prop               | Values                                                                                                           |
| ------------------ | ---------------------------------------------------------------------------------------------------------------- |
| `title`, `message` | what will happen, in plain words, naming the record                                                              |
| `tone`             | `default`, `danger`                                                                                              |
| `reasonRequired`   | boolean; adds a required textarea (reject, waitlist, blocklist, field unlock, deciding against the score, BD-17) |
| `confirmLabel`     | verb naming the action ("reject application"), never "OK"                                                        |
| `consequence`      | optional list of effects (for example "the volunteer loses access to 12 applications")                           |

The confirm button stays disabled until a required reason is entered. Focus starts on the cancel button for danger dialogs. Accessibility: `role="alertdialog"`.

### 5.11 Alert

| Prop               | Values                                            |
| ------------------ | ------------------------------------------------- |
| `tone`             | `info`, `success`, `warning`, `error`                         |
| `title`, children  | text                                                          |
| `action`           | optional button or link                                       |
| `onDismiss`        | a close button (never for blocking or legal messages)         |

Look (the asf alert): the tone at 8 % with a 1 px border at 24 %, the icon in the tone's main shade, the words in its darker shade (lighter in dark mode). Accessibility: `role="status"` for info, success and warning, `role="alert"` for errors. Uses: family-duplicate warning (BD-04), blocklist message (BD-06), "best on a larger screen" (UX-04), closed-project read-only notice (BD-20), stale-version notice.

### 5.12 File upload with preview

| Prop                   | Values                                                                             |
| ---------------------- | ---------------------------------------------------------------------------------- |
| `kind`                 | file kind from FILES_AND_DOCUMENTS (photo, document, voucher, nid_photo, media)    |
| `source`               | `camera`, `gallery`, `camera_or_gallery` (per project photo-source setting, UX-11) |
| `accept`, `maxSize`    | from the kind's validation table                                                   |
| `multiple`, `maxFiles` | count rules (for example one photo per beneficiary, BD-21)                         |
| `required`             | boolean                                                                            |
| `value`                | list of files with upload state                                                    |

States per file: selected (local preview), compressing, queued (offline, pending), uploading (progress), quarantined (waiting for the virus scan, O-30), ready, failed (retry), rejected (type or size, with reason). Photos show the Photo tile (§6.5) with capture time and GPS. Removing a file before submission needs no confirmation; removing after submission is not offered (corrections follow the field-unlock flow). Accessibility: the trigger is a button ("take photo" or "choose file"); upload progress uses `role="progressbar"`; status changes are announced politely.

### 5.13 Tabs

Props: `label` (the tab list's name), `items` (id, label, count), `value`, `onChange`, `variant` (`underline` for sections of one record, `segmented` for views of one list). The active tab follows the asf look; tabs can show a count. On phones tabs scroll horizontally with the active tab kept in view; more than five tabs become a select. Accessibility (APG tabs): `role="tablist"`, arrow keys move between tabs, Home and End, the panel is labelled by its tab. Tab state is kept in the URL for shareable views.

### 5.14 Breadcrumb

Props: `items` (label, href). Since D-145 the header renders it (the asf `Breadcrumbs`) from the destination's group and the page, and a detail page adds its own last crumbs; pages do not render their own. Shown on tablet and desktop; on phones replaced by a back button with the parent's name. Long Bengali labels clamp to one line with the full text in a tooltip. Accessibility: `<nav aria-label>` with an ordered list; the current page has `aria-current="page"`.

### 5.15 Empty / Loading / Error states

| Component  | Props                                            | Look                                                                                                                                                                                          |
| ---------- | ------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| EmptyState | `icon`, `title`, `message`, `action`             | The asf empty state: an icon, a title (a paragraph, not a heading), one sentence saying what will appear, one action (for example "create the first application")                               |
| Skeleton   | `shape` (`text`, `row`, `card`, `stat`), `count` | Muted blocks matching the final layout, no shimmer animation when reduced motion is set; lists show 3 to 5 skeleton rows                                                                      |
| LoadError  | the failed request, `onRetry`                    | The app's own (`components/LoadError.tsx`; asf has no error state): an asf alert with the plain message from the error key or the server's words, "retry", and the request id so support can trace it (API_STANDARDS error envelope); a page that reads several things names the one that failed |

Full rules in §8.

### 5.16 Offline banner

Props: `state` (`offline`, `back_online`, `syncing`, `sync_failed`), `pendingCount`, `onOpenOutbox`, `text` (words in place of the state's own; the app gives an official offline "the lists, the review and the approvals need the connection", since nothing of theirs is kept on the device, D-142). A banner under the header: offline (warning tone, `offline` icon, "you are offline; your work is saved on this phone", pending count), back online (success, auto-hides after 4 seconds), syncing (info with progress), failed (danger with "see details"). It never covers content or the action bar. Accessibility: `role="status"`, announced once per change, not on every count change.

### 5.17 Bulk-update list row

The row of the bulk screens (today's distribution, today's class, today's construction work, site visits, follow-up). Props: `selected`, `onSelect`, `title` (beneficiary name), `meta` (app number, village), `state` (activity state badge), `photoState` (none, pending, uploaded, verified, flagged), `syncState`, `quickAction` (one main action, for example "distributed"), `menuActions` (edge states: absent, later, not distributed, damaged, partial, BD-23), `expanded` (inline detail for quantities and a note). Row height at least 56 px on phones; the checkbox has a 44 px hit area; the quick action is a secondary button. Pattern in §6.1.

### 5.18 Step / timeline

Props: `steps` (state or stage name, actor, time, comment, status `done`, `current`, `upcoming`, `skipped`), `orientation` (`vertical` default; `horizontal` for a compact stage strip on desktop), `showActor` (actor names only for officials), `onStepClick`. Done steps show a check, the current step a filled dot with Bold label, upcoming steps a hollow dot, skipped or rejected steps the matching status icon. Times use English digits and relative time with the absolute time on focus. Accessibility: an ordered list; the current step carries `aria-current="step"`.

**Stepper (UX-16):** the steps of a form split into small parts: numbered 28 px circles in a wrapping row, the current one in the dark green with white digits and `aria-current="step"`, done steps soft green with a check, upcoming steps in the quiet grey; each step keeps its name for a screen reader (found by the T1.16 axe sweep). Props `steps`, `current`, `label`. A wizard (UX-20) adds `marks` (per step `complete`, `missing` or none; a missing step shows a warning sign on the soft warning tone and hidden words saying it is still needed, never colour alone) and `onSelect` (each step becomes a button of at least 44 px height that opens it); on phones the gaps shrink so eight dots fit 360 px. The wizard's action bar under the step (Back, save and exit, the main action) stays in view at the bottom and fills the width on phones.

**Language switch (UX-19):** the asf `LanguageSwitch`, a group of two pressed buttons (বাংলা | English), in the header (`components/LanguageSwitch.tsx`); a choice of two or three short options elsewhere is a `RadioGroup` or the segmented `Tabs`. `TopBar` (apps/web) is the slim bar above the pages without a sidebar, with the system name at the start and the switch at the end. The `LanguageSwitch` is drawn by the `SegmentedControl` (the app's addition, local.json), the same pressed group under a neutral name, which a tab uses to switch between its views (the cards and the list of the programs and projects tab); a choice inside a form stays a `RadioGroup`.

**Page band (UX-16):** the title band at the head of the registration's card: the h1 and one short line, drawn by the registration page itself on the asf palette (white text only on the dark and darker greens, §2.1 rule 2); not a piece of its own.

### 5.19 Progress bar

Props: `value`, `max`, `label`, `showValue` (text such as "1,240 / 2,000 (62%)"), `tone` (primary by default, or a status tone for budget overrun or quota exceeded), `segments` (for stacked budget buckets, up to four parts with a legend). The asf progress bar, `--radius-full`; its numbers follow the app's number grouping. The numbers are always shown as text beside the bar. Accessibility: `role="progressbar"` with `aria-valuenow`, `aria-valuemax` and `aria-valuetext`.

## 6. Patterns

### 6.1 Bulk-update list (today's distribution, class, work)

Blueprint B5 "bulk-update screens", A9, WORKFLOW_ENGINE activity model.

1. **Header:** project, date, area; a summary strip of stat counts (assigned, done, remaining, pending photos) and, for distribution, the stock summary (received, distributed, remaining, damaged; BD-22) with a Progress bar.
2. **Filter chips:** all, remaining, done, problems; search by name or app number.
3. **List:** Bulk-update rows (§5.17), 25 at a time from the local cache, ordered by village then name.
4. **Selection:** "select all remaining" plus per-row checkboxes. When any row is selected a sticky bulk action bar appears at the bottom with the count ("12 selected") and the main bulk action. Edge states are applied per row only, never in bulk, because they need a reason or a photo.
5. **Photo rule:** door-to-door projects require one photo per row before the row can be marked done; gathered distributions take one group photo from the header (BD-21). The camera opens in the app with the capture time and GPS stamp; the photo source follows the project setting (UX-11).
6. **Offline:** all actions work offline and write to the outbox with a client_uuid; each row shows its sync state; the header shows the pending-sync counter; text syncs before photos (OFFLINE_SYNC.md). The row cannot reach "completed" while its photos are pending.
7. **Completion:** a "finish today" action summarises what was done, what is pending and whether stock balances; an unbalanced stock needs a reason (BD-22).

### 6.2 Review detail with timeline

Blueprint A7, BD-04, BD-17, BD-18, O-20.

1. **Header:** beneficiary name, application number, project and area, status badge, waiting time in this state ("waiting 6 days", UX-07), the assigned volunteer.
2. **Signals block** (only when present): family-duplicate warning (Alert warning, with links to the other applications, BD-04); volunteer-is-beneficiary flag (O-20); needs-verification reason (BD-48); blocklist notice.
3. **Score and quota:** priority score with the criteria breakdown and the area quota bar (used / target), shown to officials only (BD-17).
4. **Answers:** the form renderer (§6.3) in read mode, section by section, official-only sections included for officials; changed fields marked; locked fields with lock icons; photos as Photo tiles.
5. **Timeline:** Step / timeline (§5.18) of workflow transitions with actor, time and comment.
6. **Change log:** field changes with old value, new value, actor, time and reason (field unlock history).
7. **Action bar:** sticky at the bottom on phones and the bottom of the detail panel on desktop. Shows only the actions the user may take in this state (from the workflow snapshot): approve (primary), waitlist (secondary), reject (danger), send for approval, review, pull from waitlist. Reject, waitlist and deciding against the score open a Confirm dialog with a required reason. Approve and pull from waitlist, alone or for ticked rows, and a project's activation ask to be confirmed first, saying what follows (D-182): an approval locks the answers; an activation opens the window and fixes the code, program, year and workflow. "Unlock field" is a ghost action in the field's menu, opening a Modal with field, new value and reason (BD-18).
8. **Stale data:** saving with an outdated version shows the stale-version Alert with "reload" (API 412 `conflict.stale_version`).

### 6.3 Form renderer

Renders a published form version (BD-12) for volunteers and officials, online and offline (T2.4).

- **Field types** (L-field-type): short_text, long_text, number, decimal, money, phone, email, date, time, datetime, single_select, multi_select, radio, checkbox, photo, file, signature, gps, bd_address, repeat_group, calculation, note. Each maps to a Field control (§5.4); signature is a canvas pad with clear and redo; gps shows a "capture location" button with accuracy; calculation is a read-only computed value with its formula hint; note is static text.
- **Sections:** one section per screen on phones with a step indicator ("section 2 of 6") and next/back; all sections on one scrolling page on desktop with a section index on the left. Section progress shows answered required fields.
- **Conditional logic:** fields and sections appear and disappear by their conditions (form-field-logic schema); hidden fields are not validated and their values are cleared on submit. Branching options (BD-14) refresh the option list when the parent answer changes.
- **"অন্যান্য":** selecting "other" opens a text box in the same field (BD-14).
- **Locked fields:** after NID lookup, identity fields are locked with a lock icon and a "request correction" link (BD-02); after approval only unlocked fields are editable (BD-18).
- **Visibility:** official-only sections and fields are never rendered for volunteers; the server does not send them.
- **Validation:** on blur and on submit; on submit an error summary Alert at the top lists every error as a link to its field and receives focus.
- **Drafts:** autosave locally every few seconds and on leaving a field; "saved on this phone" indicator; drafts sync when online (OFFLINE_SYNC.md).
- **Repeat groups:** each entry is a collapsible card with "add another" and "remove" (with confirm when the entry has data).
- **Mandatory fields** of every project (BD-13) are always present and cannot be hidden by the builder.

### 6.4 NID lookup with auto-fill

Blueprint B3, BD-01, BD-02, BD-06.

1. The first field of a new application is the identity type (NID or birth registration) and number, with format hints (10, 13 or 17 digits; 17 for birth registration).
2. "Find" checks the number online. Found: name, father or husband name, mobile and address are filled; name, father or husband name and the id are locked; mobile and address stay editable with a change log. Not found: an empty form for a new beneficiary.
3. Blocked beneficiary: a danger Alert stops the application (BD-06); the reason is not shown to volunteers.
4. Possible duplicate in the project: a warning Alert, the volunteer may continue; officials decide at review (BD-04).
5. Offline: lookup is impossible; an info Alert says the number will be checked on sync; on sync an existing NID moves the application to needs verification (BD-48).
6. The volunteer's own mobile number cannot be used as the beneficiary's mobile; the field shows an inline error (BD-03).

### 6.5 Photo tile and capture

- Tile: square thumbnail (`--radius-md`), a bottom strip with capture time (English digits) and a GPS pin or "no location", and a state badge (verified, flagged, pending upload, quarantined). Tap opens a viewer with full metadata (time, GPS, device time difference, duplicate warning).
- Camera: an in-app capture frame stamps time and GPS; when the project allows the gallery (UX-11) a "choose from gallery" option appears, and photos without capture time or GPS stay flagged (BD-21).
- Sensitive photos (NID photos) are shown only to the roles of the `beneficiary.nid` or `volunteer.identity` classes; others see a masked placeholder.

### 6.6 Dashboard, progress first

UX-10, BD-43, blueprint A11.

1. **First row:** progress stat cards: applications, approved, distributed or completed, each against target with a Progress bar.
2. **Second:** alerts (monitoring alerts as attention cards with counts and links).
3. **Third:** budget (stacked Progress bar of buckets with numbers), then area view (table by district or upazila with progress).
4. **Charts:** series coloured from the asf tokens in this order: primary, info, warning, secondary, error, success, then their light shades, one series primary (`templates/asf/DESIGN-GUIDE.md`, the chart recipe); status colours only when the series is a status; values labelled on bars or a data table toggle beside every chart (O-40). The chart library is chosen in T3.3 with an ADR; dashboards load charts on demand, never in the volunteer bundle.
5. Filters: project, area, date range; the applied filter is visible as chips and kept in the URL.

### 6.7 Masked sensitive fields

Fields of the sensitive classes in permissions.yaml (NID and birth registration, NID photos, bank details, ratings and categories, donor data, official sections, blocklist reasons, audit detail) are filtered by the server. When a field exists but the viewer may not see it, the screen shows a muted "hidden" placeholder with a lock icon (for example `•••• 4821` is never shown; the whole value is withheld) so layouts stay stable. The same rule applies in exports (constitution §5).

## 7. Mobile-first rules (2 GB Android phones and iPhones)

Targets: low-cost Android phones with 2 GB RAM and Chrome (primary), iPhones with Safari and installed PWAs (UX-06), 2G/3G and intermittent networks (NFR-12).

1. **Bundle:** the volunteer PWA's first route is at most 250 KB of compressed JavaScript (NFR-15); dashboards, charts, the form builder and the permission panel load on demand and never ship in the volunteer bundle.
2. **Lists:** 25 items per page with cursor paging; "load more" instead of infinite scroll; never keep more than about 200 rows in the DOM.
3. **Images:** thumbnails lazy-loaded at small sizes; full images only on tap; photos compressed on the phone before upload (NFR-25).
4. **Effects:** no parallax, no glass effects; motion only to show a change of state, 150 to 250 ms (§2.7), and none with reduced motion; no gradients (§2.6a).
5. **Fonts:** the Public Sans and Noto Sans Bengali files are precached with the build; text renders immediately with the fallback (`font-display: swap`).
6. **Viewport:** use `100dvh` for full-height layouts; respect `env(safe-area-inset-*)` for the app bar, bottom tab bar and sticky action bars on iPhones with a home indicator.
7. **Inputs:** text inside inputs at least 16 px on phones (iOS zoom); correct `inputmode` (numeric for NID, tel for phones, decimal for money); `autocomplete` off for beneficiary data.
8. **Touch:** targets at least 44 by 44 px with 8 px between adjacent targets; primary actions in the thumb zone (bottom of the screen).
9. **iOS banners:** an install guide in Bangla for Safari ("Share, then Add to Home Screen"); a storage warning when the photo budget nears its limit or when the browser may evict data (OFFLINE_SYNC.md: 100 MB on iOS, 200 MB on Android); no background sync on iOS, so the app syncs on open and on regaining the network, and says so.
10. **Camera:** the in-app camera is the default for proof photos; the gallery appears only where the project allows it (UX-11).
11. **Memory:** one photo is processed at a time; the photo queue is separate from the text outbox; a failed upload never blocks other work.

## 8. States

Every screen documents these states in SCREENS.md. Copy comes from i18n keys following the pattern `<module>.<screen>.state.<state>.title|message|action`, with shared defaults under `common.state.*` (I18N.md, T0.20).

| State            | When                                                                         | Component                         | Behaviour                                                                                                                                   |
| ---------------- | ---------------------------------------------------------------------------- | --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| Empty            | No data yet, or no result for the filter                                     | EmptyState                        | Explains why and offers the next action; a filtered empty state offers "clear filters"                                                      |
| Loading          | First load or page change                                                    | Skeleton                          | Skeletons in the final layout; no full-page spinners for lists; a button shows its own loading state                                        |
| Error            | Request failed                                                               | LoadError or Alert (error)        | Plain message from the error key, retry, request id in Caption; form errors stay on the form with entered data kept                         |
| Offline          | No network                                                                   | Offline banner                    | Field screens keep working from the cache and outbox; online-only actions (NID lookup, approvals, reports) are disabled with a short reason |
| Pending sync     | Local changes not yet on the server                                          | Badge (sync) and banner count     | Each record shows pending, syncing, synced or failed; failed opens the outbox with retry                                                    |
| Denied           | Record outside the user's scope                                              | LoadError (not found)             | Shown as "not found" (the API returns 404 for out-of-scope records); actions the user lacks are not rendered                                |
| Read-only        | Closed project (BD-20), approved application (BD-18), published form (BD-12) | Alert (info) and read-only fields | Explains why and, where allowed, the path to change (reopen, unlock, new version)                                                           |
| Stale version    | Someone else saved first (412)                                               | Alert (warning)                   | "This record was changed; reload to see the latest"; entered values are kept for re-entry                                                   |
| Upgrade required | Client too old (426)                                                         | Banner (error)                    | "Update the app" action; the outbox is kept                                                                                                 |
| Quarantined file | Upload waiting for the virus scan                                            | Photo tile or file row badge      | Shown as "being checked"; not viewable until ready (O-30)                                                                                   |

## 9. Content and accessibility

Content:

- Status names are the workflow state names in the user's language (bilingual data); never synonyms on different screens.
- Buttons are verbs naming the result ("approve application", "send to office"); dialogs name the record they act on.
- Errors say what happened and what to do, without codes in the message; the code and request id are available in Caption for support.
- Numbers, dates and amounts come from the formatting utility with English digits (UX-05).

Accessibility (WCAG 2.2 AA, constitution §10):

- Contrast per §2.1, in light and in dark; focus always visible (the theme's focus ring, `--focus-ring` in page CSS); nothing relies on colour alone.
- Every page has landmarks (header, nav, main), one `<h1>`, a logical heading order and a "skip to content" link.
- All functions work with a keyboard on desktop; focus order follows the visual order; dialogs trap and return focus.
- Every control has a visible label and an accessible name in the user's language; icon-only buttons have `aria-label`.
- Live regions announce sync, upload and filter results politely; errors after submit move focus to the error summary.
- Touch targets per §2.8; text resizes to 200 percent without loss (no fixed-height text containers).
- `lang` is set to `bn` or `en` on `<html>` and on any bilingual value shown in the other language, so screen readers pronounce Bengali correctly. Bengali screen-reader support (TalkBack with Bengali voice, VoiceOver) is checked manually at each phase gate.
- Automated checks: axe in component tests and Playwright E2E (TEST_STRATEGY.md, T0.21); Lighthouse accessibility on the mobile viewport in T1.15.

## 10. Do and do not

| Do                                                                           | Do not                                                |
| ---------------------------------------------------------------------------- | ----------------------------------------------------- |
| Use tokens and the asf pieces of §5 through `@/ui`                           | Write raw hex values, import MUI in a page, or add per-page styles |
| Show status with icon plus label                                             | Show status by colour alone                           |
| Use the dark green (light green in dark mode) for green text                 | Put small text in the main green #00A76F, or white text on it |
| Turn tables into cards on phones                                             | Scroll tables horizontally on phones                  |
| Keep primary actions in a sticky bottom bar on phones                        | Hide approve and reject in a menu on phones           |
| Wrap Bengali text to two lines                                               | Truncate names, ids or amounts on detail screens      |
| Use one primary button per region                                            | Place two primary buttons side by side                |
| Use the Confirm dialog with a reason for reject, waitlist, blocklist, unlock | Execute irreversible actions on a single tap          |
| Check every new screen in light and in dark                                  | Assume a colour that reads in light reads in dark     |
| Use the asf card shadow and the elevation tokens                             | Invent shadows, gradients, colours or animation timings per page |

## 11. Theming: light and dark (D-150)

The earlier note "light theme only for now" (DESIGN_BRIEF §2 item 3) is superseded by D-150: the app has a light and a dark mode.

- The asf theme defines both schemes as CSS variables, selected by `data-color-scheme` on `<html>`; the app follows the device until the person picks, and the pick stays on the device (§2.1). `apps/web/public/color-scheme.js` marks the page before the first paint.
- asf pieces read only theme variables, so they change with the mode; page CSS reads only the tokens of `apps/web/src/styles/tokens.css`, whose dark block gives the dark values (§2.1).
- Text in green, status words and links take the light shades in dark mode; shadows take the theme's black variant.
- Every screen is checked in both modes: the E2E axe sweep runs the moved pages in dark mode too (TEST_STRATEGY section 3.6), and `e2e/theme.spec.ts` checks the switch, the device's mode and the first paint.
- PDF exports are printed on the server and do not follow the viewer's mode.
- On dark surfaces the logo sits on its white pad (D-155); it is never recoloured (§3.1).

## 12. Implementation notes

The entries up to T2.8 record the earlier component set `packages/ui` and its brand; they are history, superseded by D-150 and ADR-016 (the asf move below).

- **T0.19b mockups (removed 2026-11-03 with D-151, in git history):** `docs/ui/mockups/tokens.css` copies §2.9 exactly; `components.css` implements §5 including the UX-14 premium finish (refreshed 2026-10-11); Lucide SVGs and the font files are copied locally; nothing loads from the internet at view time.
- **T1.4 packages/ui (done 2026-10-11):**
  - Tokens: `src/styles/tokens.css` equals §2.9 (a test compares them); `src/breakpoints.ts` holds the breakpoints. The Tailwind 4 preset of D-066 was removed with D-103: the set's base layer carries the element reset the pages relied on, and its `Stack`, `Grid`, `DescriptionList` and `Text` replace the layout utilities.
  - Styles: `@css/ui/styles.css` (tokens, fonts, base layer, one CSS file per component in `@layer components`, `ui-` class prefix), ported from the approved `docs/ui/mockups/components.css`; components style native states (`:hover`, `:focus-visible`, `aria-current`, `aria-selected`), the data attributes the set's own components set (`data-selected`, `data-invalid`) and MUI's state classes (`Mui-selected`, `Mui-focusVisible`); MUI's styles live in the `mui` cascade layer, between the base layer and the set's components.
  - Components: Button, Badge and StatusBadge, Card, StatCard, AttentionCard, TextField (text, email, NID), TextArea, NumberField (integer, decimal, money), PhoneField, Select, Combobox, DateField, Checkbox, CheckboxGroup, RadioGroup, FileUpload, Form, FormSection, FormGrid, FormActions, ErrorSummary, NavItem, RowToggle and Switch, Table and TableToolbar, Modal, Drawer, ConfirmDialog, Alert, Tabs, Breadcrumb, EmptyState, Skeleton, ErrorState, OfflineBanner, BulkList and BulkRow, Timeline, ProgressBar; supporting Icon, Avatar, Spinner. Each has RTL, keyboard and axe tests in both languages.
  - Since D-103 (2026-10-20): every component above keeps its name and props, the implementation of Button, Select, Combobox, DateField, Modal, Drawer, ConfirmDialog, MenuButton, Tabs and Table is MUI core in `packages/ui/src/templates/mui/`, their prop types are in `packages/ui/src/contract.ts`; MenuButton (the profile menu and row menus), Stack, Grid, DescriptionList and Text joined the set.
  - Since UX-21 (2026-10-20): `StatFilterBar` (count cards that filter a list, the rest behind a last card), `TableToolbar` with `filterMode="panel"` (the filters open in place under the search, the active ones as removable chips with "clear all"), `Table` with `layout="panel"` (one white card for the toolbar, the table and the pager, the row actions always shown) and numbered pages (`page`, `pageCount`, `onPage`, `summary`), `Badge variant="dot"`, `Avatar letters={1}` and `FilterGroup` (a titled grid of filters).
  - Since UX-22 (2026-10-20): the profile pieces `ProfileHeader` (the header card on the brand's soft green: photo or initial, name, state badges, the key facts as chips with copy buttons, an aside for documents and an action panel), `ProfileSection` (a section card whose title opens and closes it, a named region with an icon and an optional edit button), `ContactList` (contact rows with a copy button and an action link) and `CopyButton` (copies and says so, or says it could not); `DescriptionList columns={2}` with an icon per label; `Button newTab` for a link to another site.
  - Gallery: `/dev/components` in `apps/web` (dev and E2E builds only) shows every component in bn and en; Playwright checks it at 360×640 and 1280×800 with axe including colour contrast.
  - Deviations from the mockups and gaps: listed in `docs/ui/mockups/README.md` ("T1.4 implementation deviations"). Every screen-reader text of the set, MUI's date picker included, comes from the set's messages in both languages.
  - Not in T1.4: app shell, hero header, toast, photo tile, sticky action bar and tooltip (page-level or later tasks: T1.15, T2.7, T3.1).
- **T1.5 (done 2026-10-11):** the formatter `@css/shared/format` (I18N.md §6); the components' texts (`UiMessages`) come from the `ui` namespace of the catalogue and the number formatter from `formatCount`, both passed to `UiProvider` by `apps/web`.
- **T1.15:** app shell and My Work homes per SCREENS.md.
- **T2.4:** form renderer (§6.3). **T2.7:** font precache, iOS banners, offline banner wiring. **T2.8:** PDF exports embedded UbuntuSans and Bornomala (since the asf move: Public Sans and Noto Sans Bengali, §2.5).
- **The asf move (D-150, ADR-016, plan `docs/plans/2026-11-03-1200-migrate-asf-ui-plan.md`, 2026-11-03 to 2026-11-05):** every page moved to the asf contract in `apps/web/src/ui` (kit 0.7.0 in plugin 0.29.0), module by module; the pieces the app added are in `templates/asf/local.json` with their screenshots in `docs/ui/asf-pieces/`; the 140 Lucide icons the pages used map to asf names in `apps/web/src/ui/icon-map.md` (Solar pinned at `@iconify-json/solar` 1.2.13); the asf gallery is at `/dev/asf`, checked by `e2e/asf-gallery.spec.ts` in both languages and modes at 360 and 1280 px; the test helpers `renderWithUi` and `expectNoAxeViolations` are in `apps/web/src/ui/testing.tsx`. At the end `packages/ui`, its tokens and fonts, the dev gallery `/dev/components`, the bridge stylesheet for the old colour names in dark mode, Lucide, UbuntuSans and Bornomala left the app; a lint rule refuses `@css/ui` and `lucide-react`.
- **Changes:** a new component, variant or token is added to this document first (and to DECISION_LOG.md when it changes a decision), then implemented.
