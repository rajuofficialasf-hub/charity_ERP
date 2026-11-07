# ADR-016: The asf UI system of the organization's kit

Status: approved 2026-11-03 (DECISION_LOG D-150; the owner chose the whole asf system in chat). Supersedes the look of ADR-015 and, at the end of the plan `docs/plans/2026-11-03-1200-migrate-asf-ui-plan.md`, the component set of `packages/ui`.

## Context

ADR-015 put the app's interface on MUI core behind its own component set (`packages/ui`) with the brand of UX-01 and UX-13, and D-145 gave it the look of the owner's prototype. Since then the organization's engineering kit (the assunnah-engineering plugin, `skills/ae-new-app/kit`) has grown its own template, asf: a component contract (`kit/fe/src/ui/contract.ts`, a core set and an extended set), its tokens (`tokens.ts`) and the asf template (`kit/templates/asf`), designed from screenshots of the organization's ERP admin panel and the Foundation's site. Every new app of the organization starts from it, so the owner asked this app to work like it, and chose the whole system: the contract, the template and shell, the asf palette and fonts, light and dark, and later the kit's two-repository layout.

## Decision

- The web app takes the kit's frontend UI layout: `apps/web/src/ui/contract.ts`, `tokens.ts` and `index.ts`, with the asf template in `apps/web/src/ui/templates/asf/` (from kit 0.29.0). Pages import only `@/ui` (RE-UI-01); MUI and Emotion stay inside the template folder (RE-UI-02, RE-UI-05); one line selects the template (RE-UI-03).
- The look is asf's: the primary green scale around #00A76F with dark primary buttons on admin screens, the neutral, info, success, warning and error scales of `tokens.ts`, radius 6, 8 and 16, the card shadow, Solar icons (CC BY 4.0), Public Sans with Noto Sans Bengali (OFL). Barlow, which asf keeps for the public site's display headings, is not loaded in this app.
- Light and dark: the asf theme's CSS variables with `data-color-scheme`; the app follows the device until the person picks, and the choice stays on the device.
- English digits stay in both languages (UX-05): counts and dates go through `@css/shared/format`.
- Pieces the app needs that asf lacks (the phone card list, selection, sort and row actions of the table, Combobox, Checkbox, Radio, Switch, ConfirmDialog, a generic menu, the bottom sheet, FileUpload, Stepper, Timeline, a progress bar, the offline banner, the phone's bottom tabs and several display pieces) are added to the contract's extended set in the app, in the asf style, test first, and recorded in `templates/asf/local.json` so a person can bring them into the kit (RE-UI-04, the ae-ui build steps).
- The asf template is the organization's own code; nobody opens the Minimal template's code while building or extending it (clean room).
- The move happens module by module on one branch, merged once; `packages/ui` stays until the last page moved and is then removed with Lucide, UbuntuSans, Bornomala and the old tokens. The split into a frontend and a backend repository and the shared package follow in their own plans (D-150).

## Alternatives considered

- Keep `packages/ui` and only restyle it like asf: offered to the owner; rejected, as the app would stay outside the kit's contract and the later frontend repository would not have the kit's shape.
- Keep the brand of UX-01 and UX-13 with the asf shapes: offered; the owner chose the asf palette and fonts.
- Light only: offered; the owner chose light and dark.

## Consequences

Positive: the app looks and is built like the organization's other apps; the kit's later fixes and pieces reach it through the contract; dark mode for long office hours; the new pieces this app builds can serve every app.

Negative: every page and many tests change their markup; many asf pieces are new here and need building and checking in both modes; both sets live side by side until the end of the move, which the 250 KB first-route budget must carry (measured at three points of the plan); the brand of UX-01 and UX-13 and the look of D-145 are replaced.

## Related

D-150, D-145, D-103, UX-01, UX-05, UX-13, ADR-015, ae-standards `react.md` (RE-UI-01 to RE-UI-05), the kit's `templates/asf/README.md` and `design/DESIGN.md`, the plan `docs/plans/2026-11-03-1200-migrate-asf-ui-plan.md`.
