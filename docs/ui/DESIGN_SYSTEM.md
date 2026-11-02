# DESIGN SYSTEM

Status: complete for Phase 0, written in task T0.19 (2026-10-10); premium refresh for UX-14 on 2026-10-11 (elevation, gradients, motion and component finish below), approved by the owner the same day (O-54); implemented in `packages/ui` in task T1.4 (2026-10-11, see §12). This is the binding UI specification for the clickable mockups (T0.19b), `packages/ui` (T1.4) and every screen built afterwards. Screens are listed in `docs/ui/SCREENS.md`.

Sources and precedence: the owner's latest instruction, then `docs/ui/DESIGN_BRIEF.md` (owner decisions UX-01 to UX-13), then `docs/DECISION_LOG.md` O-40 (the design-system choices of this task), then constitution §11 and §12, then this document. Colours, contrast values and fonts come from `docs/ui/brand/colors.md` and `docs/ui/brand/fonts/README.md`. No colour may be used that is not listed in §2.1. A new token needs a decision in DECISION_LOG.md first.

## 1. Principles

1. **Attention first.** Every role's home opens with what needs that person now (DESIGN_BRIEF §3, BR-226). Volunteers read operational messages only in the app, so their home leads with "needs your attention" (UX-12).
2. **Evidence first.** Photos always show capture time, location and a visible verified, flagged or pending state (BD-21, UX-07).
3. **One layout system.** The same components on every screen. A screen that needs something new extends a component in this document; it never invents a per-page pattern (constitution §12).
4. **Phone first for field work, parity for officials, desktop first for setup.** Volunteers work on phones. Officials work equally on desktop and phone, so review, approval, lookup, profiles and dashboards work fully at 360 px (UX-03, NFR-17). Setup screens are desktop first (UX-04).
5. **Low-end devices.** Light first load, short lists, small images, almost no animation (NFR-12, NFR-15).
6. **Premium and polished (UX-14, refining UX-02).** Green stays the action colour and amber a decorative accent; a high-quality finish through soft layered shadows, subtle gradients only in headers, hero areas and dashboard highlights, smooth short micro-animations, refined spacing and carefully designed components; simple illustrations allowed in empty states. Never at the cost of speed on 2 GB phones or AA contrast. The tokens and components of this document are updated with the premium mockup refresh before T1.4.
7. **Plain Bangla.** Short labels and verbs, the same term for the same thing everywhere (blueprint appendix ক). Bangla is the default language, English is a per-user switch.
8. **English digits.** All numbers use 0-9 in both languages: amounts, dates, counts, ids and phone numbers (UX-05).
9. **Status is never colour alone.** A status always shows an icon and a text label (colors.md §6).
10. **Simple and clean, no explanatory text (UX-17).** A screen shows its title, at most one short line where it helps, the labels and the work itself; messages appear only when something happens; a helper under a field only when it prevents a mistake. No welcome or "how this works" paragraphs, no "arrives later" placeholders.

## 2. Tokens

All tokens are CSS custom properties on `:root`, defined once in `packages/ui` (T1.4) and read by the MUI theme of the component set (D-103). Components use semantic tokens only, never raw hex values, so a brand change or a future dark theme is a token change (§11).

### 2.1 Colour

| Token                        | Value   | Origin              | Use                                                                                  |
| ---------------------------- | ------- | ------------------- | ------------------------------------------------------------------------------------ |
| `--color-brand-primary`      | #008E48 | site                | Large surfaces, icons, charts, focus ring, header accents. Not for small text        |
| `--color-brand-primary-dark` | #007B3E | derived (colors.md) | Filled buttons with text, links, hover and pressed states, small green text          |
| `--color-brand-ink`          | #0F2920 | site                | Dark surfaces such as the desktop sidebar                                            |
| `--color-brand-accent`       | #E8B65D | site                | Decorative highlight panels and accents only. Never status, never a control boundary |
| `--color-brand-accent-ink`   | #9B6119 | derived (colors.md) | Amber used as small text                                                             |
| `--color-bg-canvas`          | #F2F3F7 | site                | Page background                                                                      |
| `--color-bg-surface`         | #FFFFFF | site                | Cards, tables, dialogs, sheets                                                       |
| `--color-bg-muted`           | #EEF2F0 | site                | Secondary buttons, zebra rows, quiet panels, disabled fields                         |
| `--color-bg-brand-soft`      | #CEF5E3 | site                | Selected rows, selected nav item, soft badges                                        |
| `--color-bg-success-soft`    | #E6EFEA | derived (O-40)      | Success badge and alert background                                                   |
| `--color-bg-warning-soft`    | #F7EFE2 | derived (O-40)      | Warning badge and alert background                                                   |
| `--color-bg-danger-soft`     | #F7E7E6 | derived (O-40)      | Danger badge and alert background                                                    |
| `--color-bg-info-soft`       | #E6EDF6 | derived (O-40)      | Info badge and alert background                                                      |
| `--color-border-default`     | #DFE3E8 | site                | Hairlines, card and table borders (decorative only)                                  |
| `--color-border-strong`      | #7F8E9D | derived (colors.md) | Input and control boundaries (3.36:1 on surface)                                     |
| `--color-text-primary`       | #0F2920 | site                | Headings and body text, status badge labels                                          |
| `--color-text-secondary`     | #526961 | derived (colors.md) | Helper text, captions, metadata                                                      |
| `--color-text-on-brand`      | #FFFFFF | site                | Text on dark green, ink and danger fills                                             |
| `--color-status-success`     | #2E7D4F | constitution §12    | Status icons, borders and fills only                                                 |
| `--color-status-warning`     | #B9770E | constitution §12    | Status icons, borders and fills only. Never text                                     |
| `--color-status-danger`      | #C0392B | constitution §12    | Status icons, borders, destructive button fill                                       |
| `--color-status-info`        | #2B6CB0 | constitution §12    | Status icons, borders and fills only                                                 |
| `--color-bg-brand-tint` | #EBF6F0 | derived (D-145) | Icon squares of the brand tone, quiet highlights. Brand primary at 8 % on white |
| `--color-bg-subtle` | #FAFBFB | derived (D-145) | Table header row, quiet fills inside a card. Ink at 2 % on white |
| `--color-sidebar-text` | #CAD0CE | derived (D-145) | Sidebar labels and icons on ink. White at 78 % on ink |
| `--color-sidebar-heading` | #A4AEAA | derived (D-145) | Sidebar group headings, the help card's text, the person's role. White at 62 % on ink |
| `--color-sidebar-hover` | #223A32 | derived (D-145) | Sidebar item hover. White at 8 % on ink |
| `--color-sidebar-divider` | #2C433B | derived (D-145) | Sidebar hairlines and the help card's border. White at 12 % on ink |
| `--color-sidebar-count` | #3F482D | derived (D-145) | The count pill beside a sidebar item, its digits in `--color-brand-accent`. Accent at 22 % on ink |

The four soft status tints are the status colour mixed 12 percent into white, precomputed as hex so older browsers without `color-mix()` render them (O-40). Their contrast, computed with the WCAG 2.x formula in task T0.19:

| Tint            | Ink #0F2920 on tint | Status icon on tint | Text secondary on tint |
| --------------- | ------------------- | ------------------- | ---------------------- |
| success #E6EFEA | 13.18               | 4.30                | 5.04                   |
| warning #F7EFE2 | 13.55               | 3.22                | 5.18                   |
| danger #F7E7E6  | 12.90               | 4.54                | 4.93                   |
| info #E6EDF6    | 13.11               | 4.60                | 5.01                   |

Ink and secondary text pass AA for normal text on every tint. Status icons pass the 3:1 rule for graphical objects on every tint. Tints against white reach only 1.14 to 1.20, so a tinted badge or alert always also carries its icon and label, and an alert carries a 4 px status-colour left border.

Contrast rules (from colors.md §3 and §6):

1. Small text on green is white on `--color-brand-primary-dark` only (5.38:1). White on `--color-brand-primary` (4.23:1) is allowed only for large text (24 px, or 18.66 px bold) and icons.
2. Green text uses `--color-brand-primary-dark` (5.38:1 on surface, 4.85:1 on canvas, 4.56:1 on brand-soft).
3. Amber text uses `--color-brand-accent-ink`. Text on an amber fill is ink.
4. Warning is never a text colour (3.68:1). A warning label is ink beside a warning icon.
5. Input boundaries use `--color-border-strong` (3.36:1 on surface, 3.03:1 on canvas). `--color-border-default` is decorative and never the only boundary of a control.
6. The logo keeps its own colours and is never tinted. Its orange and lime are not interface colours.

The redesign's tints (D-145, the owner's prototype in the brand's colours) are brand colours mixed into white or into ink, precomputed as hex like the status tints. Their contrast, computed with the same formula:

| Pair | Colours | Ratio |
| --- | --- | --- |
| Ink on brand tint | #0F2920 on #EBF6F0 | 13.97 |
| Text secondary on brand tint | #526961 on #EBF6F0 | 5.34 |
| Brand green dark icon on brand tint | #007B3E on #EBF6F0 | 4.86 |
| Text secondary on subtle (table header) | #526961 on #FAFBFB | 5.70 |
| Sidebar text on ink | #CAD0CE on #0F2920 | 9.88 |
| Sidebar text on sidebar hover | #CAD0CE on #223A32 | 7.81 |
| Sidebar heading on ink | #A4AEAA on #0F2920 | 6.78 |
| White on the active sidebar item | #FFFFFF on #007B3E | 5.38 |
| Accent count on the count pill | #E8B65D on #3F482D | 5.18 |
| Sidebar text on the active item (not allowed) | #CAD0CE on #007B3E | 3.44 |

7. On the sidebar's active item (`--color-brand-primary-dark`) the label and icon are white; the sidebar text colour reaches only 3.44:1 there.
8. Text on a brand-tint icon square is ink or secondary; the icon is `--color-brand-primary-dark`.

Overlays and shadows use ink at an alpha, so no new hue appears: scrim `rgba(15, 41, 32, 0.48)`, shadows as in §2.6.

### 2.2 Spacing

| Token       | Value | Typical use                                         |
| ----------- | ----- | --------------------------------------------------- |
| `--space-1` | 4px   | Icon to label gap, badge padding                    |
| `--space-2` | 8px   | Gap inside controls, between chips                  |
| `--space-3` | 12px  | Card padding on phones, row padding in dense tables |
| `--space-4` | 16px  | Page gutter on phones, card padding, form field gap |
| `--space-5` | 24px  | Section gap, page gutter on desktop                 |
| `--space-6` | 32px  | Between page regions                                |

No other spacing values. Component dimensions (control heights, header heights, touch targets) are sizes, not spacing, and are listed with each component.

### 2.3 Radius (O-40)

| Token           | Value  | Use                                                                       |
| --------------- | ------ | ------------------------------------------------------------------------- |
| `--radius-sm`   | 6px    | Badges, chips, checkboxes, tooltips                                       |
| `--radius-md`   | 8px    | Buttons, inputs, selects, toggles, menus, photo tiles (as on the website) |
| `--radius-lg`   | 16px   | Cards, dialogs, drawers, bottom sheets (top corners only)                 |
| `--radius-full` | 9999px | Avatars, progress bars, the switch track                                  |

### 2.4 Typography (UX-13, O-40)

Font stack: `--font-sans: UbuntuSans, Bornomala, sans-serif`. Weights 400 and 700 only. Bold replaces Medium and SemiBold everywhere.

| Token                | Phone and tablet (below 1024 px) | Desktop (1024 px and up) | Weight | Line height | Use                                                                                                                                                                                                      |
| -------------------- | -------------------------------- | ------------------------ | ------ | ----------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `--text-hero`        | 24px                             | 36px                     | 700    | 1.3         | The title of a hero area only: the brand panel of the registration (UX-23)                                                                                                                               |
| `--text-display`     | 20px                             | 20px                     | 700    | 1.4         | Page title, big stat number                                                                                                                                                                              |
| `--text-title`       | 16px                             | 16px                     | 700    | 1.5         | Card and section titles, dialog titles                                                                                                                                                                   |
| `--text-body`        | 16px                             | 14px                     | 400    | 1.5         | Body text, table cells, form values                                                                                                                                                                      |
| `--text-body-strong` | 16px                             | 14px                     | 700    | 1.5         | Emphasis inside body text; table headers, in `--color-brand-ink` on `--color-bg-brand-soft` (owner, 2026-10-20: the label size was too small to read in Bengali, and the header row gets the soft green) |
| `--text-label`       | 12px                             | 12px                     | 700    | 1.5         | Field labels, badge labels, tab labels                                                                                                                                                                   |
| `--text-caption`     | 12px                             | 12px                     | 400    | 1.5         | Helper text, metadata, timestamps                                                                                                                                                                        |
| `--text-input`       | 16px                             | 14px                     | 400    | 1.5         | Text inside inputs. Never below 16px on phones, because iOS Safari zooms on smaller inputs                                                                                                               |

Rules:

- The phone body is 16 px; dense desktop tables and panels use 14 px (colors.md §4 recommendation, O-40). T0.19b checks the 16 px phone body on rendered screens and reports any problem.
- Caption is 12 px, not the constitution's 11 px, because Bengali conjuncts and vowel signs are unreadable at 11 px (O-40).
- Line height is 1.5 for body text and never below 1.4 for any text that may contain Bengali (Bornomala's vowel signs above and below the line need the room).
- Tables, amounts, counts and ids use `font-variant-numeric: tabular-nums` so columns align. T1.4 confirmed that the shipped UbuntuSans subset keeps the `tnum` feature (D-065).

### 2.5 Font files

| Family     | File                                           | Declaration                                  |
| ---------- | ---------------------------------------------- | -------------------------------------------- |
| UbuntuSans | `UbuntuSans.woff2` (variable, axis 100 to 800) | one `@font-face` with `font-weight: 400 700` |
| Bornomala  | `Bornomala-Regular.woff2`                      | `font-weight: 400`                           |
| Bornomala  | `Bornomala-Bold.woff2`                         | `font-weight: 700`                           |

All three use `font-display: swap`, are self-hosted (no font CDN at runtime) and precached by the service worker (T2.7). The licence texts travel with the files (fonts README). UbuntuSans draws Latin letters and all digits. Bornomala draws Bengali, the danda (।) and the taka sign (৳). The application ships a Latin subset of UbuntuSans renamed "Ubuntu Sans derivative CSS ERP" as the Ubuntu Font Licence clause 2(c) requires: Basic Latin, Latin-1, general punctuation and the minus sign, weight axis 400 to 700, 25 KB instead of 318 KB (D-065, T1.4). Its `@font-face` carries the matching `unicode-range`; the files and licences are in `packages/ui/fonts/` and are served at `/fonts/`. The mockups use the original files.

### 2.6 Elevation (O-40)

Layered shadows tinted with brand ink (UX-14): a tight contact shadow plus a soft ambient one; never pure black.

| Token               | Value                                                                                                    | Use                                                                                 |
| ------------------- | -------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| `--elevation-0`     | none                                                                                                     | Flat content, table rows, page regions                                              |
| `--elevation-1`     | `0 1px 2px rgba(15, 41, 32, 0.04), 0 8px 24px rgba(15, 41, 32, 0.06)` with a 1px `--border-subtle` border; the wide soft ambient shadow of the owner's prototype (D-145) | Cards, stat cards, attention items, tables, inputs (contact shadow only)            |
| `--elevation-2`     | `0 2px 4px rgba(15, 41, 32, 0.05), 0 8px 24px rgba(15, 41, 32, 0.09)`                                    | Menus, dropdowns, drawers, bottom sheets, the split-view panel                      |
| `--elevation-3`     | `0 4px 8px rgba(15, 41, 32, 0.06), 0 20px 48px rgba(15, 41, 32, 0.16)`                                   | Modals, confirm dialogs, toasts, the login card                                     |
| `--elevation-hover` | `0 4px 8px rgba(15, 41, 32, 0.06), 0 14px 32px rgba(15, 41, 32, 0.12)`                                   | Hover on clickable cards and attention items (pointer devices)                      |
| `--elevation-brand` | `0 1px 2px rgba(0, 123, 62, 0.24), 0 6px 16px rgba(0, 123, 62, 0.22)`                                    | Primary buttons                                                                     |
| `--border-subtle`   | `rgba(15, 41, 32, 0.08)`                                                                                 | Card, table and panel borders (replaces the hard default border on raised surfaces) |

### 2.6a Gradients and glow (UX-14)

Gradients are built only from brand tokens and appear only in headers, hero areas and dashboard highlights; never behind forms, tables or running text.

| Token                    | Value                                                                                          | Use                                                                                        |
| ------------------------ | ---------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| `--gradient-hero`        | `linear-gradient(135deg, var(--color-brand-primary-dark) 0%, var(--color-brand-ink) 100%)`     | Hero headers of home screens and dashboards (`.page-head.hero`)                            |
| `--gradient-brand`       | `linear-gradient(135deg, var(--color-brand-primary) 0%, var(--color-brand-primary-dark) 100%)` | Progress fills, chart bars, active indicators (nav, tab, tab bar); never behind small text |
| `--gradient-soft`        | `linear-gradient(180deg, var(--color-bg-brand-soft) 0%, var(--color-bg-surface) 100%)`         | Avatars, selected chips, photo placeholders, empty-state halo                              |
| `--gradient-accent-line` | `linear-gradient(90deg, var(--color-brand-primary) 0%, var(--color-brand-accent) 100%)`        | The 3 px top line of stat cards (decoration; amber stays decorative)                       |
| `--glow-accent`          | amber radial glow at 16 % in the hero's top right corner                                       | Decoration of the hero only                                                                |
| `--ring-brand`           | `0 0 0 4px rgba(0, 142, 72, 0.16)`                                                             | Focus glow of inputs and hover glow of custom checkboxes                                   |

Contrast on gradients is checked against the lightest stop: white text on `--gradient-hero` is 5.38:1 at #007B3E; secondary text on the hero is white at 94 % (4.95:1); translucent elements on the hero (secondary button, chips) use at most 8 % white fill (4.64:1). The primary button keeps #007B3E with at most a 6 % white sheen (4.82:1 at the top edge).

### 2.7 Focus, motion and layers

| Token             | Value                                                                     | Note                                                                                                                                                                                                                                                                      |
| ----------------- | ------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `--focus-ring`    | `0 0 0 2px var(--color-bg-surface), 0 0 0 4px var(--color-brand-primary)` | A 2 px green ring with a 2 px surface-colour gap; #008E48 reaches 4.23:1 on surface and 3.75:1 on muted, above the 3:1 rule. It may also be drawn as a 2 px `--color-brand-primary` outline with a 2 px offset, which components with their own shadow cannot hide (O-41) |
| `--motion-fast`   | 120ms                                                                     | Hover, pressed and toggle feedback                                                                                                                                                                                                                                        |
| `--motion-base`   | 200ms                                                                     | Drawers, sheets, toggles, card lift; the maximum for feedback                                                                                                                                                                                                             |
| `--motion-slow`   | 320ms                                                                     | Entrances only: dialogs, toasts, the page content (UX-14)                                                                                                                                                                                                                 |
| `--ease-standard` | `cubic-bezier(0.2, 0, 0, 1)`                                              | Colour and shadow transitions                                                                                                                                                                                                                                             |
| `--ease-out`      | `cubic-bezier(0.16, 1, 0.3, 1)`                                           | Movement: lifts, entrances, the one-time 700 ms growth of progress and chart bars                                                                                                                                                                                         |
| `--z-sticky`      | 10                                                                        | Sticky table headers, sticky action bar                                                                                                                                                                                                                                   |
| `--z-nav`         | 20                                                                        | App bar, bottom tab bar, sidebar                                                                                                                                                                                                                                          |
| `--z-banner`      | 30                                                                        | Offline and update banners                                                                                                                                                                                                                                                |
| `--z-drawer`      | 40                                                                        | Drawers and bottom sheets                                                                                                                                                                                                                                                 |
| `--z-modal`       | 50                                                                        | Modals and confirm dialogs                                                                                                                                                                                                                                                |
| `--z-toast`       | 60                                                                        | Toasts                                                                                                                                                                                                                                                                    |

Movement uses only `transform` and `opacity`. Colour and shadow transitions run only on hover-capable devices; on touch devices they change without transition (§7). With `prefers-reduced-motion: reduce`, all durations become 0, keyframe animations are switched off and nothing slides.

### 2.8 Breakpoints and sizes (O-40)

| Name         | Range          | Layout (§4)                                                                                          |
| ------------ | -------------- | ---------------------------------------------------------------------------------------------------- |
| phone        | 0 to 639 px    | Top app bar plus bottom tab bar, cards, full-screen detail                                           |
| sm (tablet)  | 640 to 1023 px | Collapsible side rail, compact tables, drawer detail                                                 |
| lg (desktop) | 1024 px and up | Fixed sidebar, dense tables, split view                                                              |
| xl           | 1280 px and up | Dashboard content max 1280 px; the split-view detail panel widens to 480 px only from 1440 px (O-41) |

CSS custom properties cannot be used inside media queries, so the breakpoints are also written into the component CSS and the MUI theme (`sm: 640px`, `md: 1024px`, `lg: 1280px` in MUI's names) from the same constants file in `packages/ui`; a test keeps them equal. The minimum supported width is 360 px.

| Size                                   | Phone                          | Desktop                                            |
| -------------------------------------- | ------------------------------ | -------------------------------------------------- |
| Touch target                           | at least 44 by 44 px           | at least 24 by 24 px (WCAG 2.5.8), 32 px preferred |
| Control height (button, input, select) | 44 px                          | 40 px                                              |
| Small control (table actions, chips)   | 36 px with a 44 px hit area    | 32 px                                              |
| App bar height                         | 56 px                          | 64 px                                              |
| Bottom tab bar height                  | 56 px plus the safe-area inset | none                                               |
| Sidebar width                          | none                           | 248 px (rail 72 px on tablet)                      |

### 2.9 Complete token block

```css
:root {
  /* colour (colors.md section 7, plus O-40 status tints) */
  --color-brand-primary: #008e48;
  --color-brand-primary-dark: #007b3e;
  --color-brand-ink: #0f2920;
  --color-brand-accent: #e8b65d;
  --color-brand-accent-ink: #9b6119;
  --color-bg-canvas: #f2f3f7;
  --color-bg-surface: #ffffff;
  --color-bg-muted: #eef2f0;
  --color-bg-brand-soft: #cef5e3;
  --color-bg-success-soft: #e6efea;
  --color-bg-warning-soft: #f7efe2;
  --color-bg-danger-soft: #f7e7e6;
  --color-bg-info-soft: #e6edf6;
  --color-bg-brand-tint: #ebf6f0;
  --color-bg-subtle: #fafbfb;
  --color-border-default: #dfe3e8;
  --color-border-strong: #7f8e9d;
  --color-text-primary: #0f2920;
  --color-text-secondary: #526961;
  --color-text-on-brand: #ffffff;
  --color-status-success: #2e7d4f;
  --color-status-warning: #b9770e;
  --color-status-danger: #c0392b;
  --color-status-info: #2b6cb0;
  --color-scrim: rgba(15, 41, 32, 0.48);
  /* the dark sidebar (D-145): white, or amber for the count, mixed into brand ink */
  --color-sidebar-text: #cad0ce;
  --color-sidebar-heading: #a4aeaa;
  --color-sidebar-hover: #223a32;
  --color-sidebar-divider: #2c433b;
  --color-sidebar-count: #3f482d;

  /* spacing */
  --space-1: 4px;
  --space-2: 8px;
  --space-3: 12px;
  --space-4: 16px;
  --space-5: 24px;
  --space-6: 32px;

  /* radius */
  --radius-sm: 6px;
  --radius-md: 8px;
  --radius-lg: 16px;
  --radius-full: 9999px;

  /* typography */
  --font-sans: UbuntuSans, Bornomala, sans-serif;
  --font-weight-regular: 400;
  --font-weight-bold: 700;
  --text-hero: 24px; /* the title of a hero area only; 36px from 1024 px */
  --text-display: 20px;
  --text-title: 16px;
  --text-body: 16px;
  --text-label: 12px;
  --text-caption: 12px;
  --text-input: 16px;
  --leading-body: 1.5;
  --leading-heading: 1.4;

  /* elevation (UX-14): soft layered shadows tinted with brand ink; never pure black */
  --elevation-0: none;
  --elevation-1: 0 1px 2px rgba(15, 41, 32, 0.04), 0 8px 24px rgba(15, 41, 32, 0.06);
  --elevation-2: 0 2px 4px rgba(15, 41, 32, 0.05), 0 8px 24px rgba(15, 41, 32, 0.09);
  --elevation-3: 0 4px 8px rgba(15, 41, 32, 0.06), 0 20px 48px rgba(15, 41, 32, 0.16);
  --elevation-hover: 0 4px 8px rgba(15, 41, 32, 0.06), 0 14px 32px rgba(15, 41, 32, 0.12);
  --elevation-brand: 0 1px 2px rgba(0, 123, 62, 0.24), 0 6px 16px rgba(0, 123, 62, 0.22);
  --border-subtle: rgba(15, 41, 32, 0.08);

  /* gradients (UX-14): only in headers, hero areas and dashboard highlights; built from brand tokens */
  --gradient-brand: linear-gradient(
    135deg,
    var(--color-brand-primary) 0%,
    var(--color-brand-primary-dark) 100%
  );
  --gradient-hero: linear-gradient(
    135deg,
    var(--color-brand-primary-dark) 0%,
    var(--color-brand-ink) 100%
  );
  --gradient-soft: linear-gradient(
    180deg,
    var(--color-bg-brand-soft) 0%,
    var(--color-bg-surface) 100%
  );
  --gradient-accent-line: linear-gradient(
    90deg,
    var(--color-brand-primary) 0%,
    var(--color-brand-accent) 100%
  );
  --glow-accent: radial-gradient(
    circle at 88% 0%,
    rgba(232, 182, 93, 0.16) 0,
    rgba(232, 182, 93, 0) 38%
  );
  --ring-brand: 0 0 0 4px rgba(0, 142, 72, 0.16);

  /* focus and motion */
  --focus-ring: 0 0 0 2px var(--color-bg-surface), 0 0 0 4px var(--color-brand-primary);
  --motion-fast: 120ms;
  --motion-base: 200ms;
  --motion-slow: 320ms;
  --ease-standard: cubic-bezier(0.2, 0, 0, 1);
  --ease-out: cubic-bezier(0.16, 1, 0.3, 1);

  /* layers */
  --z-sticky: 10;
  --z-nav: 20;
  --z-banner: 30;
  --z-drawer: 40;
  --z-modal: 50;
  --z-toast: 60;

  /* sizes */
  --control-height: 44px;
  --app-bar-height: 56px;
  --sidebar-width: 248px;
  --rail-width: 72px;
  --content-max: 1280px;
}

@media (min-width: 1024px) {
  :root {
    --text-body: 14px;
    --text-input: 14px;
    --text-hero: 36px;
    --control-height: 40px;
    --app-bar-height: 64px;
  }
}

@media (prefers-reduced-motion: reduce) {
  :root {
    --motion-fast: 0ms;
    --motion-base: 0ms;
    --motion-slow: 0ms;
  }
}
```

## 3. Typography rules for Bengali and mixed text

1. **No letter-spacing** on any text. Tracking breaks Bengali conjuncts.
2. **No italics.** Bornomala has no italic face and a synthetic slant is unreadable. Emphasis is Bold.
3. **No `text-transform`** on labels, headers or buttons. Upper-casing affects only the English interface and makes the two languages diverge.
4. **Wrap rather than truncate.** Titles and list rows wrap to two lines (`line-clamp: 2`) before an ellipsis. Truncation never cuts inside a grapheme cluster; the browser's ellipsis is used, never a fixed character count.
5. **Never truncate identity.** Beneficiary and volunteer names, father or husband names, NID and birth-registration numbers, application numbers and transaction ids are shown in full on review, profile and detail screens. Lists may clamp names to two lines.
6. **Room for both languages.** Labels and buttons allow about 30 percent growth between bn and en. No fixed widths or fixed heights on text containers; buttons grow, they do not clip.
7. **Line height floors** as in §2.4: 1.5 for body, never below 1.4.
8. **Digits** are always 0-9 (UX-05), produced only by the central formatting utility (I18N, T0.20 and T1.5). Taka amounts below 10 lakh use lakh grouping (৳ 3,00,000) and amounts of 10 lakh and above are shown in millions (৳ 1.26 মিলিয়ন) (O-42); the remaining digit-grouping and currency details are defined in I18N.md. Phone numbers and ids are shown without grouping.
9. **Mixed script.** Latin and digits are drawn by UbuntuSans and Bengali by Bornomala from the same stack; no per-language font switching in components. Dates and times follow the I18N formats with English digits (dd-mm-yyyy, 12-hour time with the Bengali day period first, O-43); no Hijri date is shown.
10. **Bilingual data** (form labels, option lists, status and stage names) is rendered in the user's language with the fallback rule of I18N.md; components never assume one language is shorter.

### 3.1 Logo

- Use `docs/ui/brand/logo.svg` wherever sharpness matters: login, the app bar, PDF exports. `logo.png` (300 by 196 px) is a fallback only and is never shown wider than 150 CSS px.
- Minimum height 32 px in the app bar and 72 px on the login screen. Clear space around the logo at least a quarter of its height.
- The logo keeps its colours, is never tinted, recoloured, stretched or placed on amber or green fills. It sits on surface or canvas.
- The app bar shows the logo and the system name চ্যারিটি ও সোশ্যাল সার্ভিস (English: Charity & Social Service) (UX-09). On phones narrower than 400 px the name may wrap to two lines. The PWA short name is "ASF Charity" (O-31).

## 4. Layout patterns per device

From DESIGN_BRIEF §5. Officials work equally on desktop and phone (UX-03); setup screens are desktop first (UX-04).

| Width                   | Navigation                                                       | Lists and tables                                 | Detail and actions                                                     |
| ----------------------- | ---------------------------------------------------------------- | ------------------------------------------------ | ---------------------------------------------------------------------- |
| Phone, below 640 px     | Top app bar plus a bottom tab bar (four tabs and a "more" sheet) | Cards, one per row; filters in a bottom sheet    | Full-screen detail; sticky action bar                                  |
| Tablet, 640 to 1023 px  | Collapsible side rail                                            | Compact tables or two-column cards               | Drawer detail from the right                                           |
| Desktop, 1024 px and up | Fixed sidebar                                                    | Dense tables with filters, search and pagination | Split view: list left, detail panel with timeline and change log right |

### 4.1 App shell

- **App bar** (all sizes): logo and system name, then on the right the sync indicator, the notification bell with an unread count, the language switch and the profile menu (profile, device sessions, logout). On phones the language switch moves into the profile menu. From 1024 px, beside the sidebar, the app bar shows the page's breadcrumb on its left instead of the logo (D-145), and the profile menu opens from a chip with the person's initials, name and role. There is no global search box.
- **Phone bottom tab bar:** four role-dependent tabs plus "more". Volunteers: home, applications, today's work, notifications, more. Officials: home, review, people (volunteers and beneficiaries), projects, more. Phase 1 (D-100) shows only destinations that exist: volunteers home, my projects, notifications, more; officials home, people, projects, notifications, more, a tab the official may not use hidden; applications, today's work and review join with their modules. Tabs are links with an icon and a label, never icon only. The bar respects `env(safe-area-inset-bottom)`.
- **Tablet side rail:** the same destinations as icons with labels underneath, collapsible to icons with tooltips. Volunteers have no sidebar; from 640 px their four destinations sit in the rail (D-100).
- **Desktop sidebar (D-145):** the ink surface. At the top the Foundation's mark and the system name; then the destinations in their groups, each group under a small heading (`--color-sidebar-heading`, Label), each item an icon and a label in `--color-sidebar-text`, hover `--color-sidebar-hover`; the active item is `--color-brand-primary-dark` with a white label and icon and a 3 px `--color-brand-accent` bar on its left edge. A destination shows a count only where the home's "needs your attention" list already counts it (`--color-sidebar-count` pill, English digits). At the bottom a short help card ("সহায়তা প্রয়োজন?" and one line to contact the admin team, no link) and the signed-in person's initials, name and role, above a `--color-sidebar-divider` hairline.
- **Banners** sit between the app bar and the content: offline, update available, iOS storage warning, install guidance (§7, §8).
- Navigation is built from the user's effective permissions; a destination the user cannot use is not shown. The server still denies by default.

### 4.2 Page structure

- Page header (`PageHeader`, §5.3a; D-145): a small area label (the eyebrow), the page title (Display), one line saying what the page is for or its context (project and area), and the page's actions on the right, wrapping under the title on phones. The breadcrumb sits in the app bar (§4.1), not in the page. On phones the primary action becomes a sticky bottom button or a floating action button only when the screen has one dominant action (new application).
- Page gutter: 16 px on phones, 24 px from 640 px. Content width: forms and detail at most 720 px; lists, dashboards and split views up to 1280 px.
- Cards stack with 16 px gaps on phones and sit in a 12-column grid from 1024 px.

### 4.3 Split view (review, people, issues)

- Desktop: list on the left (minimum 400 px), detail on the right (420 px, 480 px from 1440 px; O-41). Between 1024 and 1439 px the list hides its priority-4 columns. Selecting a row loads the detail without leaving the list; the URL holds the selected id so the view can be shared and reloaded.
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

The management screens and admin settings live under `/admin` (`apps/web/src/admin/`), loaded as their own route chunk. They use this design system and `packages/ui` like every other screen; no second UI library is used (the MUI Minimal template was not adopted, UX-15).

- The admin pages use the app bar and the sidebar of §4.1; the separate admin top bar and admin sidebar of UX-15 are gone.
- Content: the page header of §4.2, then cards; maximum width `--content-max`.
- Phones: the "best on a larger screen" Alert of §4.4 is shown under 768 px; the pages stay readable.
- Audience: Department Head, Monitoring Team and Program Managers; any other signed-in user sees a "no access" page. Navigation only hides; the server enforces every admin permission.

## 5. Component inventory

Every base component of constitution §12, built once in `packages/ui` (T1.4) and reused everywhere. Each component accepts `className` only for layout (margin, grid placement), never to change its colours or typography. All visible text comes from i18n keys. Accessibility behaviour follows the WAI-ARIA Authoring Practices pattern named. Since D-103 (ADR-015) the components that need behaviour (button, select, combobox, date field, dialogs, drawer, menu, tabs, table) are built on MUI core inside the set's template folder `packages/ui/src/templates/mui/`; the text fields, checkboxes, radios, switch, segmented control, form and file upload are native elements, and the display components are semantic markup. Pages lay out with the set's `Stack`, `Grid`, `DescriptionList` and `Text` or their own CSS on the tokens; there are no utility classes. The components' own texts ("required", "close", pager words) come from the app through `UiProvider` (`UiMessages`); `packages/ui` ships no text.

**Premium finish (UX-14).** Every component below follows the same finish, implemented in the refreshed mockups (`docs/ui/mockups/components.css`):

- **Surfaces:** cards, tables, attention items and panels use `--elevation-1` with `--border-subtle`; clickable cards lift 2 px with `--elevation-hover` on hover; stat cards without an icon square carry the `--gradient-accent-line` top line (an icon square carries the colour instead, D-145) and a 24 px (phone) / 28 px (desktop) value in brand ink.
- **Buttons:** primary on #007B3E with a 6 % sheen and `--elevation-brand`, lifting 1 px on hover and pressing to 98 % on tap; secondary on surface with a translucent dark-green border, brand-soft on hover; danger with a red-tinted shadow.
- **Fields:** a contact shadow at rest, darker border on hover, `--color-brand-primary-dark` border plus `--ring-brand` glow on focus; checkboxes and radios are restyled native inputs (dark-green fill with a white check, radio as a thick ring) that stay keyboard- and screen-reader-native.
- **Choice controls:** the segmented control is a muted track with a raised white segment; chips are pills, the selected chip uses `--gradient-soft`; tabs get a 3 px brand-gradient underline; the switch thumb has a soft shadow and eases with `--ease-out`.
- **Tables:** sticky header on a translucent muted background with a light blur (desktop), roomier 12 px rows, a brand-soft hover tint, a 4 px brand bar on the selected row, and inline row actions that appear on hover or keyboard focus (always visible on touch screens).
- **Overlays:** dialogs enter with a 320 ms rise and fade over a blurred scrim, the footer sits on the canvas colour; toasts rise in.
- **Feedback:** badges are pills with a soft inner ring; progress fills and chart bars use `--gradient-brand` and grow once on load; the current timeline step has a soft green halo; skeletons shimmer with a moving highlight (transform only).
- **Empty states:** a simple illustration: the icon in brand dark green on a `--gradient-soft` disc with two faint concentric rings.
- **Hero header:** home screens and dashboards (`.page-head.hero`) use `--gradient-hero` with the amber glow and a faint ring motif, white title and buttons adapted for the dark surface; the login screen uses a soft brand-soft radial wash behind a floating card.
- **Navigation:** the active nav item has a brand-soft wash and a glowing gradient indicator; the app bar and the phone tab bar are near-opaque white with a soft shadow (glass blur only from 1024 px).

Supporting pieces used by several components: **Icon** (Lucide, 20 px default, 16 px in dense tables, stroke 2, `aria-hidden` unless it is the only content, O-40), **Avatar** (photo or initials on brand-soft, never a sensitive photo), **Toast** (a polite status message, 4 to 6 seconds, never the only place an error is reported), **Sticky action bar**, **Photo tile** (§6.5), **Bottom sheet** (the phone variant of Drawer).

### 5.1 Button

| Prop                   | Values                                                                             | Default   |
| ---------------------- | ---------------------------------------------------------------------------------- | --------- |
| `variant`              | `primary`, `secondary`, `ghost`, `danger`                                          | `primary` |
| `size`                 | `md` (44 px phone, 40 px desktop), `sm` (36/32 px with a 44 px hit area on phones) | `md`      |
| `icon`, `iconPosition` | Lucide name; `start`, `end`                                                        | none      |
| `iconOnly`             | boolean; requires `aria-label`                                                     | false     |
| `loading`              | boolean                                                                            | false     |
| `disabled`             | boolean                                                                            | false     |
| `fullWidth`            | boolean (phones: primary actions in sheets and action bars)                        | false     |
| `type`                 | `button`, `submit`                                                                 | `button`  |

- **primary:** fill `--color-brand-primary-dark`, white text, no border. Hover: 8 percent ink overlay. Pressed: 16 percent ink overlay.
- **secondary:** fill `--color-bg-muted`, text `--color-brand-primary-dark`, 1 px `--color-brand-primary-dark` border (the website's soft button with the accessible green).
- **ghost:** no fill, text `--color-brand-primary-dark`; for tertiary actions and table row actions.
- **danger:** fill `--color-status-danger`, white text (5.44:1); only for destructive or rejecting actions and always followed by a Confirm dialog.
- States: hover, focus (`--focus-ring`), pressed, disabled (fill `--color-bg-muted`, text `--color-text-secondary`, no pointer events; a tooltip explaining why arrives with the Tooltip component when a screen needs it), loading (spinner replaces the start icon, label stays, clicks ignored; the button stays focusable, is marked `aria-disabled` and announces the pending state with `aria-busy`).
- On status tints (alerts, offline banner) a ghost button uses ink with an underline, because dark green reaches only 4.49:1 on the danger tint (found by axe in T1.4).
- Accessibility: native `<button>`; links that navigate are `<a>` styled as buttons. Icon-only buttons need `aria-label` and a tooltip. One primary button per region.
- Do not: put two primary buttons side by side; use amber or status colours other than danger; use a button for navigation between pages.

### 5.2 Badge / Status

| Prop    | Values                                                     |
| ------- | ---------------------------------------------------------- |
| `tone`  | `neutral`, `brand`, `success`, `warning`, `danger`, `info` |
| `icon`  | Lucide name; required for the status tones                 |
| `label` | i18n key or bilingual data value                           |
| `size`  | `md` (24 px high), `sm` (20 px, dense tables)              |

- Look: a pill (`--radius-full`) on the tinted background (`--color-bg-*-soft`, brand tint for `brand`, muted for `neutral`), ink label (`--text-label`), icon in the status colour (colors.md §6 rule 6).
- `variant="dot"` (dense lists, D-145): the same soft pill with a 6 px dot in the tone's colour before the ink word, the prototype's status pill; the word always shows, so the status never rests on colour.
- Workflow state mapping (WORKFLOW_ENGINE.md, common cycle), used by every list and detail:

| State                           | Tone    | Icon                           |
| ------------------------------- | ------- | ------------------------------ |
| draft                           | neutral | `circle-dashed`                |
| needs_verification              | warning | `triangle-alert`               |
| submitted                       | info    | `send`                         |
| under_review                    | info    | `search`                       |
| reviewed                        | info    | `clipboard-check`              |
| waitlisted                      | warning | `clock`                        |
| approved                        | success | `circle-check`                 |
| rejected                        | danger  | `circle-x`                     |
| implementation (and its stages) | brand   | `hammer` (stage name as label) |
| completed                       | success | `badge-check`                  |
| closed                          | neutral | `lock`                         |
| deleted                         | neutral | `trash-2`                      |

- Other statuses use the same tones: sync (pending neutral `clock`, syncing info `refresh-cw`, synced success `check`, failed danger `circle-alert`); photo (verified success `shield-check`, flagged warning `flag`, pending upload neutral `cloud-upload`); blocklisted danger `ban`.
- Accessibility: the label is real text; the icon is decorative. A badge is not interactive; if it filters a list it is wrapped in a button.
- Do not: show a status by colour alone; invent tones; use amber (brand-accent) as a status.

### 5.3 Card / Stat

| Prop                               | Values                                   |
| ---------------------------------- | ---------------------------------------- |
| `variant`                          | `default`, `stat`, `attention`, `accent` |
| `title`, `subtitle`                | text                                     |
| `actions`                          | up to two buttons or a menu              |
| `href`                             | makes the whole card a link              |
| `value`, `target`, `delta`, `unit` | (`stat`) numbers                         |
| `loading`                          | boolean, shows a skeleton                |

- `default`: surface, `--elevation-1`, `--radius-lg`, padding 12 px on phones and 16 px from 640 px.
- `stat`: label (Label), value (Display, tabular digits), optional target and a Progress bar ("1,240 of 2,000"), and an optional icon on a 36 px soft square at the top right (D-145): `tone` `brand` on `--color-bg-brand-tint` with a `--color-brand-primary-dark` icon, or `info`, `warning`, `danger`, `success` on their soft tint with the status icon colour. One line of plain context may sit under the value. No card compares with an earlier period until the app computes one (`delta` stays unused). Progress-first dashboards (UX-10) use stat cards in their first row.
- A `default` card's head (D-145): the title (Title), an optional one-line description (Caption, secondary), and an optional link or action on the right of the title.
- `attention`: a "needs your attention" item: status-colour left border (4 px), icon, one-line reason, due or waiting time, one action. Used on every My Work home.
- `accent`: amber left border or amber header strip for a decorative highlight (announcements). Text stays ink.
- Accessibility: a linked card is one `<a>` with the title as its name; nested interactive controls are not allowed inside a linked card. Stat values are announced with their label ("approved: 1,240 of 2,000").
- Do not: nest cards; give cards heavy shadows; colour a whole card with a status colour.

### 5.3a Page header (D-145)

| Prop | Values |
| --- | --- |
| `eyebrow` | the area label, short text |
| `title` | the page title, the page's only `h1` |
| `description` | one line: what the page is for, or its context |
| `actions` | the page's buttons |

- Look: the eyebrow in Label, `--color-brand-primary-dark`, after a 6 px brand dot with a 3 px brand-tint halo; the title in Display; the description in Body, secondary. The actions sit on the right, aligned to the title's baseline, and wrap under the title below 768 px.
- A page the owner has not designed yet keeps its title and actions and has no eyebrow or description until its mockup (D-145).
- The public pages keep `PageBand` (UX-16), the visitor's centred title band.
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
- **Number** (`number`, `decimal`, `money` with ৳ prefix): `inputmode="numeric"` or `"decimal"`, English digits only, Bengali digits typed by a user are converted on input by the formatting utility.
- **Select** (single, with search when more than 10 options; multi-select as a checkbox list in a sheet on phones); **Radio** group; **Checkbox** group; the "অন্যান্য" (other) option opens a text input inside the same field (BD-14).
- **Date / time / datetime**: MUI's date picker at every size (O-55, D-103): day, month and year parts typed with the numeric keypad and shown as dd-mm-yyyy with English digits; the calendar opens below the field on desktop and as a bottom sheet on phones; a date outside the allowed range is marked invalid. Native date inputs are not used because they show the phone's own format.
- **File**: see File upload (§5.12).
- **Address**: the Bangladesh address cascade (division, district, upazila, union; no ward, O-09) as chained selects from the cached locations master; each select is disabled until its parent is chosen.

Look: 1 px `--color-border-strong` boundary, `--radius-md`, surface fill, control height per §2.8, text `--text-input`. Focus: `--focus-ring`. Error: 2 px danger border, a danger icon and the message below in ink. Locked: muted fill, lock icon, value in primary text (still readable and copyable).

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

Active: brand-soft background and a 4 px green indicator (left in the sidebar, top in the tab bar). Focus: `--focus-ring`. Accessibility: `<nav>` landmarks with a label; counts are part of the accessible name ("review, 12 pending").

### 5.6 Row / Toggle

A settings or list row with a title, optional description and a trailing control (switch, chevron or value). Used by component toggles in project setup, notification preferences and permission rows.

| Prop                       | Values                                                                                         |
| -------------------------- | ---------------------------------------------------------------------------------------------- |
| `title`, `description`     | text                                                                                           |
| `control`                  | `switch`, `chevron`, `value`, `none`                                                           |
| `checked`, `onChange`      | for `switch`                                                                                   |
| `disabled`, `lockedReason` | a locked toggle shows why (for example a component that cannot be turned off after activation) |

Switch: track 44 by 24 px (`--radius-full`), on = `--color-brand-primary-dark`, off = `--color-border-strong`; a check or cross glyph inside the thumb so the state does not depend on colour. Accessibility: `role="switch"` with `aria-checked`; the whole row is the label; Space toggles.

### 5.7 Table (with filters, search and pagination)

| Prop                             | Values                                                                                                                                                                                                                                                |
| -------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `columns`                        | id, header key, cell renderer, `priority` (1 = always shown, 2 = tablet and up, 3 = desktop only, 4 = desktop but hidden in the split view between 1024 and 1439 px, with key flags shown as icons beside the title; O-41), alignment (numbers right) |
| `rows`, `rowKey`                 | data                                                                                                                                                                                                                                                  |
| `selectable`                     | `none`, `single` (split view), `multiple` (bulk)                                                                                                                                                                                                      |
| `filters`                        | filter definitions (select, date range, status chips)                                                                                                                                                                                                 |
| `search`                         | boolean; search box with 300 ms debounce, minimum 2 characters                                                                                                                                                                                        |
| `sort`                           | allowed sort keys (API_STANDARDS sorting)                                                                                                                                                                                                             |
| `pagination`                     | keyset cursor: "load more" or next/previous; shows "25 of 10000+" with capped totals                                                                                                                                                                  |
| `density`                        | `comfortable` (48 px rows), `compact` (40 px rows, desktop)                                                                                                                                                                                           |
| `cardRenderer`                   | how a row renders as a card on phones                                                                                                                                                                                                                 |
| `emptyState`, `loading`, `error` | §8 states                                                                                                                                                                                                                                             |

- Desktop: sticky header, zebra rows in `--color-bg-muted` optional, hover row highlight, selected row brand-soft, row actions as ghost buttons or a menu at the row end.
- The list card (D-145): the table sits in one card with the list's search, filters and export in a toolbar row above it; the header row is `--color-bg-subtle` with secondary Label text; rows are divided by `--border-subtle`; a person or record cell (`PersonCell`) shows an initials or icon tile (32 px, `--radius-md`, brand tint) beside the name and a muted second line (an id, a family size, a code).
- Tablet: only priority 1 and 2 columns; the rest in the drawer detail.
- Phone: rows become cards (`cardRenderer`): title line (name), meta line (app number, area), status badge, one primary action. Filters move into a bottom sheet behind a "filter" button that shows the active filter count. Search stays at the top.
- Pagination follows the API: 25 per page, cursor-based, "load more" on phones, next/previous on desktop; never a page-number jump.
- Accessibility: a real `<table>` on tablet and desktop with `<th scope>`; sortable headers are buttons with `aria-sort`; the phone card list is a `<ul>`; the result count is announced politely after filtering.
- Do not: horizontal-scroll a table on phones; load all rows; put more than one primary action in a row.

### 5.8 Modal

For focused tasks that must be finished or cancelled (a reason dialog, a field unlock form).

| Prop                               | Values                                      |
| ---------------------------------- | ------------------------------------------- |
| `title`                            | required                                    |
| `size`                             | `sm` (400 px), `md` (560 px), `lg` (720 px) |
| `open`, `onClose`                  | control                                     |
| `primaryAction`, `secondaryAction` | buttons in the footer                       |
| `dismissible`                      | boolean; false while saving                 |

Phone: a modal becomes a full-height bottom sheet with the footer actions sticky. Accessibility (APG dialog pattern): `role="dialog"`, `aria-modal`, labelled by the title; focus moves to the first field and is trapped; Escape closes when dismissible; focus returns to the trigger. Scrim `--color-scrim`, `--elevation-3`.

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
| `tone`             | `info`, `success`, `warning`, `danger`            |
| `title`, `message` | text                                              |
| `action`           | optional button or link                           |
| `dismissible`      | boolean (never for blocking or legal messages)    |
| `variant`          | `inline`, `banner` (full width under the app bar) |

Look: tinted background, 4 px status-colour left border, icon, ink text. Accessibility: `role="status"` for info and success, `role="alert"` only for errors that just happened. Uses: family-duplicate warning (BD-04), blocklist message (BD-06), "best on a larger screen" (UX-04), closed-project read-only notice (BD-20), stale-version notice.

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

Props: `items` (id, label, count), `value`, `onChange`, `variant` (`line`, `segmented` for two or three short options). The active tab has a 3 px brand-gradient underline and Bold label (UX-14). On phones tabs scroll horizontally with the active tab kept in view; more than five tabs become a select. Accessibility (APG tabs): `role="tablist"`, arrow keys move between tabs, Home and End, the panel is labelled by its tab. Tab state is kept in the URL for shareable views.

### 5.14 Breadcrumb

Props: `items` (label, href). Since D-145 the app bar renders it from the destination's group and the page, and a detail page adds its own last crumbs; pages do not render their own. Shown on tablet and desktop; on phones replaced by a back button with the parent's name. Long Bengali labels clamp to one line with the full text in a tooltip. Accessibility: `<nav aria-label>` with an ordered list; the current page has `aria-current="page"`.

### 5.15 Empty / Loading / Error states

| Component  | Props                                            | Look                                                                                                                                                                                          |
| ---------- | ------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| EmptyState | `icon`, `title`, `message`, `action`             | The simple illustration of UX-14: the icon in brand dark green on a `--gradient-soft` disc with two faint rings, title, one sentence, one action (for example "create the first application") |
| Skeleton   | `shape` (`text`, `row`, `card`, `stat`), `count` | Muted blocks matching the final layout, no shimmer animation when reduced motion is set; lists show 3 to 5 skeleton rows                                                                      |
| ErrorState | `title`, `message`, `requestId`, `onRetry`       | Icon, plain message from the error key, "retry" button, and the request id in Caption so support can trace it (API_STANDARDS error envelope)                                                  |

Full rules in §8.

### 5.16 Offline banner

Props: `state` (`offline`, `back_online`, `syncing`, `sync_failed`), `pendingCount`, `onOpenOutbox`, `text` (words in place of the state's own; the app gives an official offline "the lists, the review and the approvals need the connection", since nothing of theirs is kept on the device, D-142). A banner under the app bar: offline (neutral tint, `cloud-off` icon, "you are offline; your work is saved on this phone", pending count), back online (success, auto-hides after 4 seconds), syncing (info with progress), failed (danger with "see details"). It never covers content or the action bar. Accessibility: `role="status"`, announced once per change, not on every count change.

### 5.17 Bulk-update list row

The row of the bulk screens (today's distribution, today's class, today's construction work, site visits, follow-up). Props: `selected`, `onSelect`, `title` (beneficiary name), `meta` (app number, village), `state` (activity state badge), `photoState` (none, pending, uploaded, verified, flagged), `syncState`, `quickAction` (one main action, for example "distributed"), `menuActions` (edge states: absent, later, not distributed, damaged, partial, BD-23), `expanded` (inline detail for quantities and a note). Row height at least 56 px on phones; the checkbox has a 44 px hit area; the quick action is a secondary button. Pattern in §6.1.

### 5.18 Step / timeline

Props: `steps` (state or stage name, actor, time, comment, status `done`, `current`, `upcoming`, `skipped`), `orientation` (`vertical` default; `horizontal` for a compact stage strip on desktop), `showActor` (actor names only for officials), `onStepClick`. Done steps show a green check, the current step a filled green dot with Bold label, upcoming steps a hollow dot, skipped or rejected steps the matching status icon. Times use English digits and relative time with the absolute time on focus. Accessibility: an ordered list; the current step carries `aria-current="step"`.

**Stepper (UX-16):** the steps of a form split into small parts: numbered dots joined by a line, done steps with a check, the current one with the brand ring and `aria-current="step"`; the names show from 640 px, on phones the form's section title names the step while each name stays in the accessibility tree (visually hidden, never `display: none`), so a step button keeps its name for a screen reader (found by the T1.16 axe sweep). Props `steps`, `current`, `label`. A wizard (UX-20) adds `marks` (per step `complete`, `missing` or none; a missing step shows a warning sign in the status warning colour and the hidden words of `missingLabel`, never colour alone) and `onSelect` (each step becomes a button of at least 44 px height that opens it); on phones the gaps shrink so eight dots fit 360 px. The wizard's action bar under the step (Back, save and exit, the main action) stays in view at the bottom and fills the width on phones.

**Segmented control (UX-19):** a compact pill of two or three options built on native radio buttons (arrow keys select, one tab stop), the selected option raised in `--color-brand-primary-dark`; props `label`, `options` (`id`, `label`, optional `lang`), `value`, `onChange`. Used for the language toggle. `TopBar` (apps/web) is the slim bar above the pages without a sidebar, with the system name at the start and the toggle at the end; in the admin area the toggle ends the sidebar.

**Page band (UX-16):** the green title band at the head of a public page's card: the h1 and one short line in white on `--color-brand-primary-dark` (4.5:1 for small text), optional controls such as a segmented choice. Used by the registration.

### 5.19 Progress bar

Props: `value`, `max`, `label`, `showValue` (text such as "1,240 / 2,000 (62%)"), `tone` (`brand` default, `success`, `warning`, `danger` for budget overrun or quota exceeded), `size` (`md` 8 px, `sm` 4 px), `segments` (for stacked budget buckets, up to four segments in the chart colours of §6.6). Track `--color-bg-muted`, fill brand-primary, `--radius-full`. The numbers are always shown as text beside the bar. Accessibility: `role="progressbar"` with `aria-valuenow`, `aria-valuemax` and `aria-valuetext`.

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
7. **Action bar:** sticky at the bottom on phones and the bottom of the detail panel on desktop. Shows only the actions the user may take in this state (from the workflow snapshot): approve (primary), waitlist (secondary), reject (danger), send for approval, review, pull from waitlist. Reject, waitlist and deciding against the score open a Confirm dialog with a required reason. "Unlock field" is a ghost action in the field's menu, opening a Modal with field, new value and reason (BD-18).
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
4. **Charts:** at most four series coloured `--color-brand-primary`, `--color-brand-ink`, `--color-brand-accent` and `--color-border-strong`, in that order; status colours only when the series is a status; values labelled on bars or a data table toggle beside every chart (O-40). The chart library is chosen in T3.3 with an ADR; dashboards load charts on demand, never in the volunteer bundle.
5. Filters: project, area, date range; the applied filter is visible as chips and kept in the URL.

### 6.7 Masked sensitive fields

Fields of the sensitive classes in permissions.yaml (NID and birth registration, NID photos, bank details, ratings and categories, donor data, official sections, blocklist reasons, audit detail) are filtered by the server. When a field exists but the viewer may not see it, the screen shows a muted "hidden" placeholder with a lock icon (for example `•••• 4821` is never shown; the whole value is withheld) so layouts stay stable. The same rule applies in exports (constitution §5).

## 7. Mobile-first rules (2 GB Android phones and iPhones)

Targets: low-cost Android phones with 2 GB RAM and Chrome (primary), iPhones with Safari and installed PWAs (UX-06), 2G/3G and intermittent networks (NFR-12).

1. **Bundle:** the volunteer PWA's first route is at most 250 KB of compressed JavaScript (NFR-15); dashboards, charts, the form builder and the permission panel load on demand and never ship in the volunteer bundle.
2. **Lists:** 25 items per page with cursor paging; "load more" instead of infinite scroll; never keep more than about 200 rows in the DOM.
3. **Images:** thumbnails lazy-loaded at small sizes; full images only on tap; photos compressed on the phone before upload (NFR-25).
4. **Effects:** no backdrop blur below 1024 px (glass effects only on desktop, UX-14), no parallax, no box-shadow or colour transitions on touch devices; movement only with transform and opacity, at most 200 ms for feedback and 320 ms for entrances (§2.7); gradients are static images, never animated.
5. **Fonts:** three font files precached; text renders immediately with the fallback (`font-display: swap`).
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
| Error            | Request failed                                                               | ErrorState or Alert (danger)      | Plain message from the error key, retry, request id in Caption; form errors stay on the form with entered data kept                         |
| Offline          | No network                                                                   | Offline banner                    | Field screens keep working from the cache and outbox; online-only actions (NID lookup, approvals, reports) are disabled with a short reason |
| Pending sync     | Local changes not yet on the server                                          | Badge (sync) and banner count     | Each record shows pending, syncing, synced or failed; failed opens the outbox with retry                                                    |
| Denied           | Record outside the user's scope                                              | ErrorState (not found)            | Shown as "not found" (the API returns 404 for out-of-scope records); actions the user lacks are not rendered                                |
| Read-only        | Closed project (BD-20), approved application (BD-18), published form (BD-12) | Alert (info) and read-only fields | Explains why and, where allowed, the path to change (reopen, unlock, new version)                                                           |
| Stale version    | Someone else saved first (412)                                               | Alert (warning)                   | "This record was changed; reload to see the latest"; entered values are kept for re-entry                                                   |
| Upgrade required | Client too old (426)                                                         | Banner (danger)                   | "Update the app" action; the outbox is kept                                                                                                 |
| Quarantined file | Upload waiting for the virus scan                                            | Photo tile or file row badge      | Shown as "being checked"; not viewable until ready (O-30)                                                                                   |

## 9. Content and accessibility

Content:

- Status names are the workflow state names in the user's language (bilingual data); never synonyms on different screens.
- Buttons are verbs naming the result ("approve application", "send to office"); dialogs name the record they act on.
- Errors say what happened and what to do, without codes in the message; the code and request id are available in Caption for support.
- Numbers, dates and amounts come from the formatting utility with English digits (UX-05).

Accessibility (WCAG 2.2 AA, constitution §10):

- Contrast per §2.1; focus always visible with `--focus-ring`; nothing relies on colour alone.
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
| Use tokens and the components of §5                                          | Write raw hex values or per-page styles               |
| Show status with icon plus label                                             | Show status by colour alone or with amber             |
| Use dark green for small green text                                          | Put small white text on #008E48                       |
| Turn tables into cards on phones                                             | Scroll tables horizontally on phones                  |
| Keep primary actions in a sticky bottom bar on phones                        | Hide approve and reject in a menu on phones           |
| Wrap Bengali text to two lines                                               | Truncate names, ids or amounts on detail screens      |
| Use one primary button per region                                            | Place two primary buttons side by side                |
| Use the Confirm dialog with a reason for reject, waitlist, blocklist, unlock | Execute irreversible actions on a single tap          |
| Use gradients only in hero headers and dashboard highlights (UX-14)          | Put gradients behind forms, tables or running text    |
| Check text contrast against the lightest gradient stop                       | Rely on the dark end of a gradient for contrast       |
| Lift and glow on hover with the elevation tokens                             | Invent shadows, colours or animation timings per page |

## 11. Theming note: future dark theme

Light theme only for now (DESIGN_BRIEF §2 item 3). The system is ready for a dark theme without component changes:

- Components use only semantic tokens (`--color-bg-*`, `--color-text-*`, `--color-border-*`, `--color-status-*`), never brand hex values directly.
- A dark theme is a second token block under `[data-theme="dark"]` (and optionally `prefers-color-scheme: dark`), with new values recorded in colors.md and contrast-checked, and a decision in DECISION_LOG.md before use.
- The status tints and shadows need dark equivalents; shadows become lighter borders on dark surfaces.
- The logo needs a light-wordmark variant (the SVG's ink wordmark would vanish on dark surfaces); the logo itself is still never recoloured otherwise.
- Photos, charts and PDF exports stay on light backgrounds.

## 12. Implementation notes

- **T0.19b mockups:** `docs/ui/mockups/tokens.css` copies §2.9 exactly; `components.css` implements §5 including the UX-14 premium finish (refreshed 2026-10-11); Lucide SVGs and the font files are copied locally; nothing loads from the internet at view time.
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
- **T2.4:** form renderer (§6.3). **T2.7:** font precache, iOS banners, offline banner wiring. **T2.8:** PDF exports embed UbuntuSans and Bornomala.
- **Changes:** a new component, variant or token is added to this document first (and to DECISION_LOG.md when it changes a decision), then implemented.
