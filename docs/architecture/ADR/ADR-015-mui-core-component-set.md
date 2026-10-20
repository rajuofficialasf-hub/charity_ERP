# ADR-015: MUI core behind the component set of packages/ui

Status: approved 2026-10-19 (DECISION_LOG D-103; the owner chose MUI core in chat). Supersedes ADR-012 (React Aria) and the Tailwind part of D-066 once the migration plan `docs/plans/2026-10-19-0912-refactor-mui-core-ui-plan.md` is done.

## Context

The organization's engineering standard (ae-standards, rules RE-UI-01 to RE-UI-05) puts every app's interface on MUI behind an org component set: pages import only the set, the template library lives in one template folder inside it, a lint rule blocks it anywhere else, and the template can be replaced by changing one export line. Its current template is Minimal, a paid MUI Store template licensed per end product.

CSS ERP chose React Aria Components and Tailwind 4 (D-064, D-066) and did not adopt Minimal (UX-15) because the organization's Minimal licence could not be confirmed. The rest of the app already follows the set's shape: all 102 page files import their UI from `@css/ui`, none imports React Aria.

## Decision

- `packages/ui` stays the component set and keeps its public API (exported names and prop types).
- Its implementation moves to MUI core: `@mui/material` 9.4 with Emotion (MIT), and for the date field the community edition of `@mui/x-date-pickers` 9 (MIT) with the dayjs adapter. No paid MUI X, no `@mui/lab`.
- Everything that imports MUI or Emotion lives in `packages/ui/src/templates/mui/`; `packages/ui/src/template.ts` is the one line that selects the template; the prop types live in `packages/ui/src/contract.ts`, and the template checks itself against it.
- The MUI theme is built from the design tokens (`packages/ui/src/tokens.ts`, equal to DESIGN_SYSTEM section 2.9): the approved brand look stays.
- Accessibility behaviour that React Aria gave (focus traps, keyboard models, the table as a `grid`, the `alertdialog`, radio-group semantics of the segmented control) is kept on MUI and stays covered by the component tests with axe, the E2E specs and the axe sweep.
- Tailwind leaves the build at the end of the migration; layout comes from the set's `Stack` and `Grid` and from page CSS on the tokens.
- The paid Minimal template can replace `templates/mui` once its licence for this product is confirmed, without touching a page.

## Alternatives considered

- Keep React Aria and Tailwind: rejected by the owner; it leaves the app outside the organization's standard.
- Adopt Minimal now: rejected for now; its licence is per end product and is not confirmed for CSS ERP.
- Import MUI directly in pages: rejected; it breaks RE-UI-01 and would make a later template change touch every page.

## Consequences

Positive: the app follows the organization's UI standard; other teams' MUI knowledge applies; Minimal can be swapped in later at the set.

Negative: MUI and Emotion add JavaScript to the eager login route, so the first-route budget of 250 KB (NFR-15) is measured from the first migration step on; MUI core has no grid keyboard model for tables, so the set implements it; the migration touches every component and, for Tailwind, many page files.

## How it was built (2026-10-19 to 2026-10-20)

Choices made while building, recorded with the plan `docs/plans/2026-10-19-0912-refactor-mui-core-ui-plan.md`:

- MUI is used where it brings behaviour: Button, Select (a button that opens MUI's popover with a list box), Combobox (Autocomplete around the set's own input), DateField (MUI X `DesktopDatePicker` or `MobileDatePicker` chosen by width, a bottom sheet on phones, dayjs `bn` and `en-gb` for the names with English digits), Modal and ConfirmDialog (MUI's dialog, `role="alertdialog"` for the confirmation), Drawer, MenuButton (MUI's menu, links through the router), Tabs (MUI's tabs with the set's own panel) and the Table (MUI's table with the set's own `grid` keyboard model and one tab stop).
- The text fields, checkboxes, radios, switch, segmented control, form and file upload are native elements, and the display components without behaviour (alerts, badges, cards, states, timeline and the like) and the layout pieces `Stack`, `Grid`, `DescriptionList` and `Text` are semantic markup on the tokens: MUI would add weight to the eager login route and per-instance style work without adding behaviour. A Minimal template can still replace any of them through the contract.
- MUI's Emotion styles are written into the `mui` cascade layer (`StyledEngineProvider enableCssLayer`), declared in `apps/web/index.html` between the set's `base` and `components` layers, so the set's component CSS and the pages' CSS win over MUI's defaults.
- Lists, calendars and menus render inside the dialog their control sits in (`packages/ui/src/templates/mui/portal.ts`), so a modal never hides them from assistive technology.
- Tailwind's preflight reset was part of the look, so the set's base layer carries the same element reset; a computed-style capture of 27 screens on the phone and desktop projects matched element by element before and after the removal.
- The app loads only the device language's message catalogue at start (D-104), which made room for MUI within the 250 KB budget: the first route ends at 212.1 KB, from 216.6 KB before the work.
- Guards: a lint rule keeps MUI, Emotion and React Aria inside `packages/ui/src/templates/` (`apps/web/test/template-boundary.test.ts` proves it), and `apps/web/test/class-names.test.ts` fails on a class name no stylesheet the page loads defines.

## Related

D-103, D-064, D-066, UX-15, ADR-012, ae-standards `react.md` (RE-UI-01 to RE-UI-05), DESIGN_SYSTEM.
