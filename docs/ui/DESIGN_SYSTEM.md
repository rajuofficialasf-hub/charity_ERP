# DESIGN SYSTEM

Status: outline, written in task T0.1 (2026-10-10); completed in task T0.19. Until then `docs/ui/DESIGN_BRIEF.md` and `docs/ui/brand/colors.md` are the source of truth (UX-01…UX-13).

## 1. Principles
Calm institutional look, attention first, evidence first, one layout system, phone first for field work, low-end devices, plain Bangla, English digits (design brief §3).

## 2. Tokens
Colours from `brand/colors.md` as CSS variables; spacing scale 4–32; radii (decision on 6/10/16 vs the website's 8/20); typography UbuntuSans + Bornomala, weights 400 and 700, sizes Display 20, Title 16, Body 14 (16 on phones to be tested), Label 12, Caption 11, line-height 150%.

## 3. Layout
Breakpoints and navigation per device (design brief §5): bottom tabs on phones, side rail on tablets, sidebar and split view on desktop; setup screens desktop first with a notice.

## 4. Base components
Button, Badge/Status, Card/Stat, Field (text, select, date, number, file), Nav/Item, Row/Toggle, Table with filters/search/pagination (collapsing to cards), Modal, Drawer, Confirm dialog, File upload with preview, Alert, Tabs, Breadcrumb, Empty/Loading/Error states, Offline banner, Bulk-update list row, Step/timeline, Progress bar; props, states, accessibility notes for each.

## 5. Patterns
Review queue with detail panel, approval action bar, NID lookup and locked fields, photo capture with metadata and verified/flagged state, bulk update screens, dashboards with progress first, forms with sections and conditional fields.

## 6. Content rules
Bangla and English copy rules, status wording, digits and dates, icon plus label for status colours.

## 7. Accessibility
Contrast (AA), focus, keyboard, touch targets, screen-reader names, axe checks.

## 8. Implementation notes
`packages/ui` structure (T1.4), Tailwind binding, font loading and precache, logo usage (SVG vs PNG).
