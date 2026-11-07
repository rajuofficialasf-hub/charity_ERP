# Designing a new asf piece

Read this before adding any UI piece the contract doesn't have yet (a chart, an uploader, a timeline). It keeps a new piece indistinguishable from the ones already in the template. The `/ae-ui` skill follows it; a person can too.

**Clean room.** asf was designed from screenshots of the org's own sites only. Never open, copy or read Minimal's code (`templates/minimal/`, its `parts/` library, a Minimal download or its demo site) for ideas, even when Minimal has the piece you need. Use the asf reference screens (`kit/templates/asf/design/screens/` in the plugin), this guide and the pieces already in `components/`.

## 1. Check before you build

1. Is it already there? Look in the registry (`kit/templates/asf/REGISTRY.md` in the plugin) and in `local.json` next to this file (pieces this app added itself). Often an existing piece with a different prop is the answer: a "status card" is a `StatCard`, a "key-value panel" is a `DescriptionList` in a `Card`.
2. Is it reusable? Build a contract piece only for something a second screen or app would use with the same intent. A one-off arrangement of existing pieces stays in the page.
3. Is it listed under "Not built yet" in the registry? Then its reference screen and notes are your brief.

## 2. The rules every piece follows

**Contract first.** Name the piece and write its props in the extended section of `src/ui/contract.ts` and in `UiTemplateExtended`. Props are plain data, `ReactNode` and callbacks: no MUI types, no `sx`, no class names. Values crossing the contract are plain (ISO strings for dates, numbers for amounts). Name props like the existing ones: `label` (accessible name), `title`, `description`, `tone`, `variant`, `size`, `action` / `actions`, `items`, `value` + `onChange`, `loading`, `emptyTitle`.

**Colour** comes only from the theme, through CSS variables, so light and dark both work:
- `theme.vars.palette.*` for text, background, divider and the colour scales;
- `toneVars(theme, tone)` and `toneAlpha(channel, a)` from `components/tone.ts` for anything that takes a `tone` (`ColorTone`: neutral, primary, secondary, info, success, warning, error);
- soft status look: the tone's channel at 0.16 behind its `dark` shade (`light` in dark mode); tinted surface: 0.06 to 0.1 with a 0.4 outline;
- white text only on `dark` or `darker` shades, never on `main` (contrast);
- green marks state and selection on admin screens; primary actions there are the dark button.
Never write a hex value in a component.

**Shape and space.** Radius: 0.75 (6px, chips), 1 (8px, fields and buttons), 2 (16px, cards and dialogs) in theme units. Spacing in multiples of 8px through `sx` numbers (`p: 3` is 24px). A card's padding is 24px; gaps between cards are 24px; tight groups 8 to 12px.

**Depth.** Surfaces use MUI `Card` (it already carries the card shadow) or `shadows.*` from `theme/shadows.ts` with `theme.applyStyles('dark', …)` for the black variant. No new shadow recipes, no zero-offset glows, never a card inside a card.

**Type.** Typography variants only: `h4` page title, `h6` (weight 700) card and section titles, `subtitle2` labels and emphasised values, `body2` default text, `caption` small meta, `overline` group titles. Numbers in tables and data are tabular. Headings get the right level (`headingLevel` prop when a piece can sit at different depths).

**Icons.** `<Icon name=…>` only. A missing icon: add the name to `ExtendedIconName`, map it to a Solar icon in `scripts/build-icons.mjs` (duotone for concepts, line style for small UI glyphs), rerun the script. Never inline another icon set, an emoji or a Unicode glyph as an icon.

**Words.** Anything the piece says on its own (buttons, empty text, screen-reader names) is a `UiLabels` entry read with `useLabels()`, so Bengali apps can translate it. Page text comes in through props.

**States.** Every piece handles: default, hover, focus-visible (the theme's focus ring, never removed), active/selected, disabled, loading (a skeleton or `LoadingState` in place, not a spinner over content) and empty (`EmptyState` with a sentence that says what will appear and how). Errors name the problem and the way out.

**Motion.** 150 to 250ms, `cubic-bezier(0.16, 1, 0.3, 1)`, only to show a change of state. Animate transform, opacity, colour and shadow, never width, height, padding or margin. The theme turns transitions off for reduced motion.

**Surfaces.** On public pages (`PublicShell`) the piece may read `useSurface()` to be roomier or use the brand colour; on admin screens it stays dense.

**Responsive.** Work from 360px up: stack on phones, use `Grid` breakpoints (`base`, `sm`, `md`, `lg`), let tables scroll inside their card, never the page sideways. Overlays use MUI's `Popover`, `Menu`, `Dialog` or `Drawer` so they escape clipping containers.

**Accessibility.** The right native element or role, an accessible name (`label`), keyboard use without a mouse, `aria-current`/`aria-selected`/`aria-pressed`/`aria-expanded` where they apply. Decorative icons are hidden from screen readers.

## 3. Recipes for pieces likely to come next

**Chart** (not built yet; build it in an app with `/ae-ui build chart`). Bar, line, area, donut. Use `@mui/x-charts` (MIT, same family as the pickers) inside the asf template only. Props stay plain, for example `{ label, kind, categories: string[], series: { name, values: number[], tone? }[], valueFormat?: (n) => string, loading?, emptyTitle? }`. Series colours in this order from the tokens: primary, info, warning, secondary, error, success, then their `light` shades; one series is primary. Axis text `caption` in `text.secondary`, grid lines dashed `divider`, no axis line clutter, no 3D, no gradient fills except a light area under a line (0.16 to 0). Tooltip on paper with the dropdown shadow. Legend above the plot, left aligned. Put the chart in a `Card` (title and an optional period `SelectField` as `action`). Give the figure `role="img"` with `label`, and render the same numbers in a visually hidden table for screen readers. Empty and loading use `EmptyState` and a skeleton of the plot area.

**File upload.** A dashed 1px drop zone (radius 2, neutral channel at 0.08 background, primary outline on drag-over), an upload icon, one sentence plus the accepted types and size, a "Choose files" secondary button that opens the native picker. Files below as rows: type icon, name, size, a progress bar while uploading, a remove button. Errors per file in `error.main` text.

**Timeline / activity log.** A vertical list: a 10px dot in the event's tone on a 1px divider line, time in `caption` `text.secondary`, the event in `body2`. Newest first.

**Stepper.** Numbered circles (28px): done = primary with a check icon, current = primary outline, upcoming = neutral. Labels under the circles on wide screens, a "Step 2 of 4" line on phones.

**Calendar / schedule.** Month grid in a `Card`; today outlined in primary; events as soft `Chip`-style bars in their tone; weekends (Friday, Saturday for the org) in `text.disabled` headers.

**Notifications panel.** The bell in the header opens a `Drawer` (right): tabs All / Unread (segmented), rows with avatar or icon, text, time, an unread dot in primary; "Mark all as read" as a text button.

**Gallery and video.** `Grid` of 16:10 images with radius 2, opening a full-screen viewer (`Dialog` `fullScreen`, arrow keys, Escape). Video: poster image with a centred round play button; load the player only on click.

## 4. Definition of done

- The contract has the props, and the asf implementation `satisfies UiTemplateExtended`.
- A scenario in `ui.extended.test.tsx`: renders with its accessible name, main interaction, empty or error state.
- Seen in the browser in light and dark, at desktop and phone width, with real-length English and Bengali text.
- Added to `local.json` next to this file (name, files, one-line note, a screenshot path if you saved one), so `/ae-ui harvest` can bring it into the plugin's kit for every app.
