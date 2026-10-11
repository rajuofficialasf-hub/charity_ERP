# ADR-012: React Aria Components as the headless primitive library of packages/ui

Status: approved 2026-10-11 (DECISION_LOG D-064; the owner chose React Aria while T1.4 was planned). Written in task T1.4.

## Context

DESIGN_SYSTEM §5 requires every base component of constitution §12 to follow the WAI-ARIA Authoring Practices pattern it names: dialogs that trap and return focus, tabs with arrow, Home and End keys, a combobox, a table with sortable headers and row selection, switches, checkbox and radio groups, menus and breadcrumbs (NFR accessibility, WCAG 2.2 AA). O-40 item 8 left the choice of a headless library to T1.4. Requirements specific to this project:

- Both languages are first-class and every number uses English digits (UX-05); dates are shown as dd-mm-yyyy (O-43).
- Officials use phones as much as desktops (UX-03), so overlays must work as bottom sheets at 360 px.
- The volunteer bundle stays within 250 KB of compressed JavaScript (NFR-15), so the library must tree-shake per component.
- The look is fixed by the approved mockups (O-54); the library must be unstyled.

## Decision

- `react-aria-components` (Adobe) supplies behaviour and accessibility for Modal, Dialog, Drawer and bottom sheet, ConfirmDialog (`alertdialog`), Tabs, Select, ComboBox, DatePicker and Calendar, Table, Checkbox and CheckboxGroup, RadioGroup, Switch, Menu, Breadcrumbs, FileTrigger and DropZone, ProgressBar and the router integration for links.
- Components without complex behaviour (Badge, Card, Alert, Timeline, EmptyState, Skeleton, ErrorState, OfflineBanner) are plain semantic HTML.
- `UiProvider` wraps React Aria's `I18nProvider` with the locale `bn-BD-u-nu-latn` or `en-GB-u-nu-latn`: Intl then formats with Latin digits in both languages, and date segments are ordered day, month, year.
- Visible and accessible texts of our components come from the app's messages (`UiMessages`). React Aria ships built-in strings for about 30 locales but not Bengali; where a component has no prop for a string, the English fallback is accepted and listed in DESIGN_SYSTEM §12.

## Alternatives considered

- Base UI (`@base-ui/react` 1.9): light and almost string-free, but it has no date picker, so the desktop calendar would be hand-written, with the accessibility risk that implies.
- Radix UI (`radix-ui` 1.7): mature and popular, but it has no combobox and no date picker, and its maintenance has slowed.
- Ark UI (Zag.js): complete, including a date picker and file upload, but a state-machine runtime and a smaller community.
- Hand-written primitives: rejected; keyboard and screen-reader behaviour is the riskiest part of a component library.

## Consequences

Positive: tested keyboard and screen-reader behaviour for every complex component, international date handling, and one library for all patterns.

Negative: React Aria is larger than Radix for small components, so bundle size is measured at each phase gate (the volunteer route budget of NFR-15); a few built-in screen-reader strings stay English in the Bengali interface until React Aria supports Bengali or exposes the props; React Aria upgrades follow the version policy of D-058.

## Related

D-064, O-40, O-55 (date picker at every size), D-066 (styling), DESIGN_SYSTEM §5, ADR-006.
