# Brand colours and typography

Since D-150 (ADR-016, 2026-11-03) the web app takes its colours and fonts from the asf UI system of the organization's kit: the asf palette in `apps/web/src/ui/tokens.ts` (the green scale around #00A76F), light and dark, with Public Sans and Noto Sans Bengali. Sections 2, 3, 6 and 7 describe it; DESIGN_SYSTEM.md section 2 is the binding token specification. The rest of this file records where the earlier brand came from.

Source of the earlier brand (UX-01, UX-13): the live website https://assunnahfoundation.org/ read in a browser on 2026-10-10 (computed styles of the rendered page, about 780 visible elements, after scrolling the whole page). The owner asked for the ERP to take its colours and fonts from this website (decisions UX-01 and UX-13 in docs/ui/DESIGN_BRIEF.md). Values marked "site" were observed exactly. Values marked "derived" were computed for the ERP and the reason is given. Those ERP tokens are superseded by D-150 and kept in section 9 as a record. The logo files and their rules (section 1) stay in force.

## 1. Observed palette (website)

| Colour | Hex | Where the website uses it |
|---|---|---|
| Brand green | #008E48 | Primary buttons (donate, learn more), links and labels, outlined button border, language toggle at 30 percent |
| Ink, a very dark green | #0F2920 | Headings, navigation and body text, footer background |
| Amber | #E8B65D | Donation panel, a volunteer card, the subscribe button, borders |
| Dark amber | #D08322 | Small labels and links on white |
| Soft green grey | #EEF2F0 | Secondary button background |
| Mint | #CEF5E3 | A small chip |
| Paragraph grey | #333333 | Paragraph text |
| Page tint | #DFE3E8 at 25 percent (flat #F7F8F9) | Funds section background |
| Hairline | #919EAB at 12 percent (flat #F2F3F5) | Card and header borders; 20 percent (flat #E9ECEE) on inputs and 32 percent (flat #DCE0E4) on outlined buttons |
| Light neutral | #F9FAFB | A neutral surface |
| Blue grey 100 | #F2F3F7 | Site variable --b-100 |
| Slate 700 | #37546D | Site variable --s-700 |
| Required red | #FF3B30 | Required-field asterisks |
| Category blue | #4597E8 | A membership category card |
| Category purple | #870FDD | A careers category card |
| Logo orange | #F7941D | Base bar of the logo |
| Logo lime green | #8DC63F | Leaf of the logo |
| Logo green | #3A9948 | Leaf of the logo |

The app no longer takes its interface colours from this palette (D-150); it stays as the record of the website and of the logo.

The logo colours belong to the logo only. Do not recolour the logo and do not use its orange or lime in the interface.

Logo files for the ERP: docs/ui/brand/logo.png (PNG with transparency, 300 by 196 px, 18,664 bytes, supplied by the owner) and docs/ui/brand/logo.svg (vector, 8,837 bytes, copied on 2026-10-10 from the inline SVG in the website header; the text colour variable was replaced by ink #0F2920 and width and height were set to the viewBox size 114.03 by 72.58). Measured dominant colours of the PNG: lime #8CC63F, black #000000 (the wordmark), orange #ED962F, green #2E9061, which match the website's logo within measurement error. The PNG is sharp up to 150 CSS pixels wide on a 2x screen and 100 on a 3x screen and must never be upscaled. Use the SVG wherever sharpness matters, such as the login screen, large headers and PDF exports, and keep the PNG as a fallback.

## 2. ERP tokens (asf, D-150)

The asf scales (`apps/web/src/ui/tokens.ts`):

| Scale | lighter | light | main | dark | darker | Use |
|---|---|---|---|---|---|---|
| primary | #C8FAD6 | #5BE49B | #00A76F | #007867 | #004B50 | State and selection, links, focus; the primary button on public pages |
| info | #CAFDF5 | #61F3F3 | #00B8D9 | #006C9C | #003768 | Status only |
| success | #D3FCD2 | #77ED8B | #22C55E | #118D57 | #065E49 | Status only |
| warning | #FFF5CC | #FFD666 | #FFAB00 | #B76E00 | #7A4100 | Status only |
| error | #FFE9D5 | #FFAC82 | #FF5630 | #B71D18 | #7A0916 | Status only; the danger button |
| secondary | #EFD6FF | #C684FF | #8E33FF | #5119B7 | #27097A | In the kit's tokens; no page of the app uses it |

Neutral: 50 #FCFDFD, 100 #F9FAFB, 200 #F4F6F8, 300 #DFE3E8, 400 #C4CDD5, 500 #919EAB, 600 #637381, 700 #454F5B, 800 #1C252E, 900 #141A21.

| Role | Light | Dark |
|---|---|---|
| Page | #FFFFFF | neutral 900 #141A21 |
| Paper (cards, tables, dialogs) | #FFFFFF | neutral 800 #1C252E |
| Text primary | neutral 800 #1C252E | #FFFFFF |
| Text secondary | neutral 600 #637381 | neutral 500 #919EAB |
| Text disabled | neutral 500 #919EAB | neutral 600 #637381 |
| Primary action on admin screens | neutral 800 with white text | white with neutral 800 text |

The app's page CSS reads these through its own names in `apps/web/src/styles/tokens.css` (the table in DESIGN_SYSTEM §2.1).

The drawn cover of a card without a photo (`apps/web/src/components/CoverArt.tsx`) paints with its own art tokens, so its hills stay lighter to darker from the sky to the front in both modes (the text token `--color-brand-primary-dark` turns light in dark mode):

| Token | Light | Dark | Text on it |
|---|---|---|---|
| `--color-art-primary-lighter` | primary lighter #C8FAD6 (the sky) | the same | none |
| `--color-art-primary-main` | primary main #00A76F (the back hill) | the same | none |
| `--color-art-primary-dark` | primary dark #007867 (the middle hill) | the same | none |
| `--color-art-primary-darker` | primary darker #004B50 (the front hill) | the same | none |
| `--color-art-sun` | white #FFFFFF at 70 % (the sun) | the same | none |

No text sits on the drawing: the card's badge and its chips stand on the paper (white, or neutral 800 in dark mode), so their contrast is that of the chips on paper in the table below.

## 3. Contrast (WCAG 2.x)

Normal text needs 4.5:1 for AA. Large text (24 px, or 18.66 px bold), focus indicators and the boundaries of controls need 3:1. Ratios of the asf values, computed with the WCAG 2.x formula on 2026-11-05; the soft tones are the tone's main at 16 % (8 % for a tint) flattened on white or on the dark paper.

| Pair | Colours | Ratio | AA normal text | AA large text or boundary |
|---|---|---|---|---|
| Text primary on white | #1C252E on #FFFFFF | 15.52 | pass | pass |
| Text primary on neutral 200 | #1C252E on #F4F6F8 | 14.32 | pass | pass |
| Text secondary on white | #637381 on #FFFFFF | 4.88 | pass | pass |
| Text secondary on neutral 200 | #637381 on #F4F6F8 | 4.51 | pass | pass |
| Text secondary on the primary tint (8 %) | #637381 on #EBF8F3 | 4.48 | fail | pass |
| Disabled grey on white | #919EAB on #FFFFFF | 2.73 | fail | fail |
| Primary main as text on white | #00A76F on #FFFFFF | 3.11 | fail | pass |
| Primary dark as text on white | #007867 on #FFFFFF | 5.41 | pass | pass |
| White on primary main | #FFFFFF on #00A76F | 3.11 | fail | pass |
| White on primary dark | #FFFFFF on #007867 | 5.41 | pass | pass |
| White on primary darker | #FFFFFF on #004B50 | 9.90 | pass | pass |
| White on neutral 800 (the dark button) | #FFFFFF on #1C252E | 15.52 | pass | pass |
| White on error main | #FFFFFF on #FF5630 | 3.17 | fail | pass |
| White on error dark (the danger button) | #FFFFFF on #B71D18 | 6.56 | pass | pass |
| Error main as text on white | #FF5630 on #FFFFFF | 3.17 | fail | pass |
| Error dark as text on white | #B71D18 on #FFFFFF | 6.56 | pass | pass |
| Success dark as text on white | #118D57 on #FFFFFF | 4.22 | fail | pass |
| Warning dark as text on white | #B76E00 on #FFFFFF | 4.00 | fail | pass |
| Info dark as text on white | #006C9C on #FFFFFF | 5.79 | pass | pass |
| Text primary on a warning fill | #1C252E on #FFAB00 | 8.18 | pass | pass |
| Primary dark on primary soft | #007867 on #D6F1E8 | 4.53 | pass | pass |
| Primary darker on primary soft | #004B50 on #D6F1E8 | 8.30 | pass | pass |
| Success darker on success soft | #065E49 on #DCF6E5 | 6.79 | pass | pass |
| Warning darker on warning soft | #7A4100 on #FFF2D6 | 7.32 | pass | pass |
| Error darker on error soft | #7A0916 on #FFE4DE | 9.27 | pass | pass |
| Info darker on info soft | #003768 on #D6F4F9 | 10.40 | pass | pass |
| Focus ring (primary main) on white | #00A76F on #FFFFFF | 3.11 | fail | pass |
| Dark mode: text primary on the page | #FFFFFF on #141A21 | 17.51 | pass | pass |
| Dark mode: text primary on paper | #FFFFFF on #1C252E | 15.52 | pass | pass |
| Dark mode: text secondary on the page | #919EAB on #141A21 | 6.41 | pass | pass |
| Dark mode: text secondary on paper | #919EAB on #1C252E | 5.68 | pass | pass |
| Dark mode: primary light as text on paper | #5BE49B on #1C252E | 9.62 | pass | pass |
| Dark mode: primary light on primary soft | #5BE49B on #183A38 | 7.65 | pass | pass |
| Dark mode: primary main on paper | #00A76F on #1C252E | 4.99 | pass | pass |
| Dark mode: success light on paper | #77ED8B on #1C252E | 10.54 | pass | pass |
| Dark mode: warning light on paper | #FFD666 on #1C252E | 11.13 | pass | pass |
| Dark mode: error light on paper | #FFAC82 on #1C252E | 8.48 | pass | pass |
| Dark mode: info light on paper | #61F3F3 on #1C252E | 11.54 | pass | pass |

What this means (the rules found while the pages moved, by the axe runs of the E2E and the gallery):
- The main green #00A76F reads only 3.11:1 as text on white. Text in green uses the dark shade #007867, and the light shade #5BE49B in dark mode. The main green marks icons, fills, selection and focus.
- White text sits only on the dark and darker shades. The danger button is the dark red #B71D18; the primary action on admin screens is the dark button.
- Quiet text uses the secondary grey #637381; the disabled grey #919EAB (2.73:1) is never text a person has to read. On the 8 % primary tint the secondary grey falls just below 4.5:1 (found on a chosen card's tint by the gallery's axe run and fixed there); quiet words on a tint need a check.
- Soft chips and counts use the darkest shade of their tone on the tone at 16 %; the kit's dark shade on its tint read only 3.2 to 3.6:1.
- Field labels and group legends use the secondary grey at rest and the text colour when focused (the main green on a focused label read 3.1:1); error texts use the dark red.

Success dark (4.22:1) and warning dark (4.00:1) fail AA as small text on white, so `apps/web/src/styles/tokens.css` maps `--color-status-success` and `--color-status-warning` to the darker shades #065E49 and #7A4100 for words on the page (the light shades in dark mode).
The asf field outline is grey 500 at 20% (about #E9ECEE on white, 1.2:1 against the page); it turns the text colour on hover and when focused, and every field carries its visible label. The owner keeps it as the kit draws it (D-156).

## 4. Typography

Observed on the website:
- Font stack: `UbuntuSans, Bornomala, sans-serif`, the same on the body and every heading.
- Faces loaded: UbuntuSans as one variable file declared for weights 500 to 700 (318,140 bytes; the file itself is a variable font covering weights 100 to 800, so the website's regular Latin text is likely drawn at weight 500 only because its CSS declares 500 to 700); Bornomala Regular and Bold as woff2 (76,124 and 85,712 bytes) with ttf fallbacks (204,276 and 225,072 bytes). PublicSans is declared but not loaded.
- Files are served from https://assunnahfoundation.org/fonts/. Copies are in docs/ui/brand/fonts/ with a README and the licence texts.

| Role | Weight | Size | Line height |
|---|---|---|---|
| h1 | 700 | 60 px | 1.43 |
| h2 | 700 | 48 px | 1.42 |
| h3 | 700 | 30 px | 1.40 |
| h4 | 700 | 24 px | 1.25 |
| h5 | 700 | 20 px | 1.40 |
| h6 | 700 | 16 px | 1.75 |
| subtitle 1 | 600 | 16 px | 1.50 |
| subtitle 2 | 400 | 14 px | 1.71 |
| body 1 | 400 | 17 px | 1.50 |
| body 2 | 400 | 16 px | 1.63 |
| caption | 400 | 12 px | 1.50 |
| overline | 700 | 12 px | 1.50 |
| button | 700 | 17 px | 1.75 |

ERP decision (D-150, 2026-11-03; supersedes UX-13):
- Public Sans for UI text with Noto Sans Bengali for the Bengali letters, from the Fontsource packages `@fontsource-variable/public-sans` and `@fontsource-variable/noto-sans-bengali` (5.3.0), self-hosted through the build; no font CDN at runtime. Both are variable fonts. Public Sans draws Latin letters and all digits, which are English digits everywhere (UX-05); Noto Sans Bengali draws the Bengali script.
- The asf type scale and the page CSS sizes are in DESIGN_SYSTEM.md section 2.4. The phone body stays 16 px and the caption 12 px (O-40).
- The API's PDFs embed the same two files (`apps/api/src/exports/pdf/fonts.ts`).
- The earlier decision (UbuntuSans and Bornomala) is kept in section 9 as a record.

Licences:
- Public Sans and Noto Sans Bengali: SIL Open Font License 1.1, as their Fontsource packages declare (`apps/web/src/ui/templates/asf/NOTICE.md`).
- (Record, the earlier fonts.) Ubuntu Sans is published under the Ubuntu Font Licence 1.0 (designers Dalton Maag, David Jonathan Ross, Dual Type; on Google Fonts since 2024-03-22; variable weights 100 to 800). The licence text must travel with any font files in the repository. A subset is a Modified Version, see the naming rule in section 9.3.
- Bornomala is not on Google Fonts or Fontsource. The font files themselves declare: copyright Codepotro, designer Jayed Ahsan Saad, vendor https://codepotro.com, licence SIL Open Font License 1.0 (standard text in docs/ui/brand/fonts/). The owner confirmed the source https://codepotro.com/font/bornomala/ on 2026-10-10 (DECISION_LOG O-32).

## 5. Shape and layout observed on the website (for task T0.19 to consider)

- Base corner radius 8 px; cards 20 px with a 1 px border #919EAB at 12 percent and a very light shadow (0 2px 6px 2px at 3 percent black). The constitution tokens are 6, 10 and 16 px. Decided in T0.19 (O-40): 6 px small, 8 px for controls as on the website, 16 px for cards and dialogs (docs/ui/DESIGN_SYSTEM.md section 2.3).
- Buttons: 8 px radius, 6 px by 16 px padding, 17 px bold, no shadow. Soft or outlined button: background #EEF2F0, text #008E48, 1 px border #008E48, padding 6 px by 24 px.
- Inputs: 8 px radius, 1 px border at 20 percent hairline, 16 px text.
- Spacing unit 8 px. Header 64 px on phones and 80 px on desktop with an 8 px background blur.
- Since D-150 the shapes are the asf ones: radius 6 px for chips, 8 px for fields and buttons, 16 px for cards and dialogs, the 8 px spacing unit and the asf card shadow (DESIGN_SYSTEM.md sections 2.2, 2.3, 2.6).

## 6. Usage rules

1. Green marks state and selection, links and focus. On admin screens the primary action is the dark button; on public pages it is the brand green.
2. Text in green uses the dark shade (the light shade in dark mode), never the main green.
3. White text only on the dark and darker shades of a tone, or on neutral 800.
4. Quiet text uses the secondary grey; soft chips and counts use the darkest shade of their tone on the tone at 16 %.
5. Status colours are for status only, and a status always carries an icon and a text label, never colour alone.
6. A status chip is the tone at 16 %, a darkest-shade label and an icon in that shade.
7. The logo keeps its own colours and is never tinted.
8. The app icon (the home-screen and browser-tab image of the installed app) is the logo centred on a white square, built by `apps/web/scripts/icons.mjs` from `apps/web/public/brand/logo.svg` into `apps/web/public/icons/`: `icon.svg`, `icon-192.png` and `icon-512.png` with rounded corners (manifest `purpose: any`), `icon-maskable-512.png` with the logo at 60 % of the width so Android's own mask keeps it whole (`purpose: maskable`), and `apple-touch-icon.png` at 180 px for iOS. The owner chose the logo on 2026-11-01 (D-140); a new logo file is followed by `pnpm --filter @css/web icons`.

The logo's wordmark is drawn in the earlier ink #0F2920 and has no light variant, so in dark mode the logo sits on a small white pad, uncoloured (D-155; `apps/web/src/styles/base.css`).

## 7. CSS variables

The asf theme writes its own CSS variables (prefix `asf`, for example `--asf-palette-primary-main`) for the light and the dark scheme, selected by `data-color-scheme` on `<html>`. The app's page CSS reads them through its own names in `apps/web/src/styles/tokens.css`, each with the asf light value as a fallback and a dark block; DESIGN_SYSTEM.md section 2.1 lists every name and its value. The file is the complete block; it is not copied here. The earlier block (the website palette) is in section 9.

## 8. Method and limits

Read with the desktop app's browser on 2026-10-10 at a 961 by 914 viewport. The page is a React site, so colours were read from the rendered elements, not from a design file. Colours that appear on interaction states (hover, focus, dialogs) were not captured. If the website is redesigned, repeat the extraction and update this file and the tokens in DESIGN_SYSTEM.md.

The asf values of sections 2 and 3 were read from `apps/web/src/ui/tokens.ts` and `apps/web/src/ui/templates/asf/theme/theme.ts` on 2026-11-05; the ratios were computed from them, not measured on screen.

## 9. Earlier brand tokens (UX-01, UX-13; superseded by D-150)

The ERP tokens, contrast checks, typography decision, usage rules and CSS variables the app used from T0.19 (2026-10-10) until the move to asf (D-150, ADR-016). They are kept as the record of the website-derived brand; the app no longer uses them.

### 9.1 ERP tokens (website palette)

| Token | Hex | Origin | Use |
|---|---|---|---|
| color-brand-primary | #008E48 | site | Large surfaces, icons, charts, focus rings, header accents |
| color-brand-primary-dark | #007B3E | derived | Filled buttons with text, links, hover and pressed states. The lightest shade of the brand green that keeps 4.5:1 on every light surface |
| color-brand-ink | #0F2920 | site | Primary text, dark surfaces such as a sidebar or footer |
| color-brand-accent | #E8B65D | site | Highlight panels and decorative accents. Never a status colour |
| color-brand-accent-ink | #9B6119 | derived | Amber used as small text on light surfaces, from the website's dark amber #D08322 darkened to 4.5:1 |
| color-bg-canvas | #F2F3F7 | site | Page background. The website's pages are white; this is its variable --b-100 |
| color-bg-surface | #FFFFFF | site | Cards, tables, dialogs |
| color-bg-muted | #EEF2F0 | site | Secondary buttons, zebra rows, quiet panels |
| color-bg-brand-soft | #CEF5E3 | site | Selected rows, soft badges |
| color-border-default | #DFE3E8 | site | Hairlines, card and table borders (decorative) |
| color-border-strong | #7F8E9D | derived | Input and control boundaries, from the website hairline colour #919EAB darkened to 3:1 |
| color-text-primary | #0F2920 | site | Headings and body text |
| color-text-secondary | #526961 | derived | Helper text and captions. The lightest muted tint of the ink hue (saturation cut to 12 percent, so it does not read as a link) that keeps 5:1 on every light surface |
| color-text-on-brand | #FFFFFF | site | Text on green and ink |
| color-status-success | #2E7D4F | constitution section 12 | Status only, always with an icon and a label |
| color-status-warning | #B9770E | constitution section 12 | Status only, always with an icon and a label |
| color-status-danger | #C0392B | constitution section 12 | Status only, always with an icon and a label |
| color-status-info | #2B6CB0 | constitution section 12 | Status only, always with an icon and a label |
| color-bg-brand-tint | #EBF6F0 | derived (D-145) | Icon squares and quiet highlights: brand primary at 8 % on white |
| color-bg-subtle | #FAFBFB | derived (D-145) | Table header row and quiet fills: ink at 2 % on white |
| color-sidebar-text | #CAD0CE | derived (D-145) | Sidebar labels on ink: white at 78 % on ink |
| color-sidebar-heading | #A4AEAA | derived (D-145) | Sidebar group headings: white at 62 % on ink |
| color-sidebar-hover | #223A32 | derived (D-145) | Sidebar hover: white at 8 % on ink |
| color-sidebar-divider | #2C433B | derived (D-145) | Sidebar hairlines: white at 12 % on ink |
| color-sidebar-count | #3F482D | derived (D-145) | Sidebar count pill: accent at 22 % on ink |

Status colours are not from the website. They stay as set in the constitution. The seven D-145 tokens come from the owner's own design prototype (2026-11-01), redrawn in these brand colours: each is a brand colour mixed into white or ink, so no new hue appears.

### 9.2 Contrast of the earlier tokens

Normal text needs 4.5:1 for AA. Large text (24 px, or 18.66 px bold) and the boundaries of controls need 3:1.

| Pair | Colours | Ratio | AA normal text | AA large text or boundary |
|---|---|---|---|---|
| Text primary on surface | #0F2920 on #FFFFFF | 15.46 | pass | pass |
| Text primary on canvas | #0F2920 on #F2F3F7 | 13.94 | pass | pass |
| Text primary on muted | #0F2920 on #EEF2F0 | 13.69 | pass | pass |
| Text primary on brand-soft | #0F2920 on #CEF5E3 | 13.10 | pass | pass |
| Text primary on accent amber | #0F2920 on #E8B65D | 8.30 | pass | pass |
| Text secondary on surface | #526961 on #FFFFFF | 5.91 | pass | pass |
| Text secondary on canvas | #526961 on #F2F3F7 | 5.33 | pass | pass |
| Text secondary on brand-soft | #526961 on #CEF5E3 | 5.01 | pass | pass |
| White text on brand green (as on the website buttons) | #FFFFFF on #008E48 | 4.23 | fail | pass |
| White text on brand green dark | #FFFFFF on #007B3E | 5.38 | pass | pass |
| White text on ink | #FFFFFF on #0F2920 | 15.46 | pass | pass |
| Brand green as text on surface | #008E48 on #FFFFFF | 4.23 | fail | pass |
| Brand green as text on muted (website soft button) | #008E48 on #EEF2F0 | 3.75 | fail | pass |
| Brand green dark as text on surface | #007B3E on #FFFFFF | 5.38 | pass | pass |
| Brand green dark as text on brand-soft | #007B3E on #CEF5E3 | 4.56 | pass | pass |
| Website amber text on surface | #D08322 on #FFFFFF | 3.02 | fail | pass |
| Accent ink (derived) on surface | #9B6119 on #FFFFFF | 5.10 | pass | pass |
| Amber fill against surface (boundary) | #E8B65D on #FFFFFF | 1.86 | fail | fail |
| Border default on surface (decorative) | #DFE3E8 on #FFFFFF | 1.29 | fail | fail |
| Website hairline colour on surface | #919EAB on #FFFFFF | 2.73 | fail | fail |
| Border strong (derived) on surface (input boundary) | #7F8E9D on #FFFFFF | 3.36 | fail | pass |
| Status success on surface | #2E7D4F on #FFFFFF | 5.05 | pass | pass |
| Status warning on surface | #B9770E on #FFFFFF | 3.68 | fail | pass |
| Status danger on surface | #C0392B on #FFFFFF | 5.44 | pass | pass |
| Status info on surface | #2B6CB0 on #FFFFFF | 5.42 | pass | pass |
| White text on status danger | #FFFFFF on #C0392B | 5.44 | pass | pass |
| Website required-field red on surface | #FF3B30 on #FFFFFF | 3.55 | fail | pass |
| Website category blue on surface | #4597E8 on #FFFFFF | 3.07 | fail | pass |
| Ink on brand tint (D-145) | #0F2920 on #EBF6F0 | 13.97 | pass | pass |
| Brand green dark icon on brand tint | #007B3E on #EBF6F0 | 4.86 | pass | pass |
| Text secondary on subtle | #526961 on #FAFBFB | 5.70 | pass | pass |
| Sidebar text on ink | #CAD0CE on #0F2920 | 9.88 | pass | pass |
| Sidebar heading on ink | #A4AEAA on #0F2920 | 6.78 | pass | pass |
| Sidebar text on sidebar hover | #CAD0CE on #223A32 | 7.81 | pass | pass |
| Accent on the sidebar count pill | #E8B65D on #3F482D | 5.18 | pass | pass |
| Sidebar text on brand green dark | #CAD0CE on #007B3E | 3.44 | fail | pass |

What this means:
- The website's own buttons, white text on #008E48, reach 4.23:1. That passes only for large text. The ERP therefore uses #007B3E for filled buttons and links that carry small text, and keeps #008E48 for large surfaces, icons and charts.
- The website's dark amber #D08322 fails on white for small text. The ERP uses #9B6119 when amber is text.
- The website's hairline #919EAB is too faint to mark an input. The ERP uses #7F8E9D for control boundaries.
- The website's soft button, green text on #EEF2F0, reaches 3.75:1 and fails for small text. The ERP uses the dark green for that text.
- Amber fills reach only 1.86:1 against white. They are decoration and never mark the boundary of a control.
- The sidebar's active item is white on the dark green; its grey sidebar text would reach only 3.44:1 there (D-145).
- The constitution's warning colour reaches 3.68:1 on white. Use status colours for icons, borders and tinted backgrounds, and keep the label text of a status badge in ink.

### 9.3 Typography decision (UX-13)

ERP decision (UX-13, owner, 2026-10-10):
- Font stack `UbuntuSans, Bornomala, sans-serif`, weights 400 and 700 only, self-hosted, no external font CDN at runtime. Define the two families under exactly these names. Declare UbuntuSans for weights 400 to 700 (its file covers 100 to 800) and Bornomala as two static files, Regular 400 and Bold 700.
- UbuntuSans draws Latin letters and all digits, which are English digits everywhere (UX-05). Bornomala draws the Bengali script. The generic sans-serif is the last fallback.
- Constitution section 12 asked for Medium and SemiBold. They are not available. Use Bold where the scale said Medium or SemiBold for emphasis, Regular for body text. The final mapping is in docs/ui/DESIGN_SYSTEM.md section 2.4 (decision O-40, task T0.19).
- Recommendation for T0.19: the website body text is 16 to 17 px. The 14 px body size of the constitution is small for Bangla on phones. Test 16 px on phones and keep 14 px for dense desktop tables. Adopted in T0.19 (O-40): 16 px body on phones and tablets, 14 px on desktop, caption 12 px; T0.19b checks it on rendered screens.
- Performance: the full UbuntuSans file is 318 KB. A subset to Basic Latin, digits and punctuation is much lighter, since Bengali comes from Bornomala, but under the Ubuntu Font Licence a subset is a Modified Version and its internal font name must carry the suffix derivative X (clause 2(c)), for example Ubuntu Sans derivative CSS ERP. The alternative is the original file unmodified. Use font-display swap and precache the font files in the PWA.

### 9.4 Usage rules (earlier)

1. Green is the action colour: primary buttons, links, selected states and focus.
2. Amber is a highlight, never a status. Green and amber are close to the success and warning colours, so status always carries an icon and a text label and is never shown by colour alone.
3. Text on amber is ink. Small text on green is white on the dark green only.
4. Dark surfaces use ink with white text.
5. The logo keeps its own colours and is never tinted.
7. The app icon (the home-screen and browser-tab image of the installed app) is the logo centred on a white square, built by `apps/web/scripts/icons.mjs` from `apps/web/public/brand/logo.svg` into `apps/web/public/icons/`: `icon.svg`, `icon-192.png` and `icon-512.png` with rounded corners (manifest `purpose: any`), `icon-maskable-512.png` with the logo at 60 % of the width so Android's own mask keeps it whole (`purpose: maskable`), and `apple-touch-icon.png` at 180 px for iOS. The owner chose the logo on 2026-11-01 (D-140); a new logo file is followed by `pnpm --filter @css/web icons`.
6. A status badge is a tinted background, an ink label and a coloured icon.

### 9.5 CSS variables (earlier)

```css
:root {
  --color-brand-primary: #008E48;
  --color-brand-primary-dark: #007B3E;
  --color-brand-ink: #0F2920;
  --color-brand-accent: #E8B65D;
  --color-brand-accent-ink: #9B6119;
  --color-bg-canvas: #F2F3F7;
  --color-bg-surface: #FFFFFF;
  --color-bg-muted: #EEF2F0;
  --color-bg-brand-soft: #CEF5E3;
  --color-border-default: #DFE3E8;
  --color-border-strong: #7F8E9D;
  --color-text-primary: #0F2920;
  --color-text-secondary: #526961;
  --color-text-on-brand: #FFFFFF;
  --color-status-success: #2E7D4F;
  --color-status-warning: #B9770E;
  --color-status-danger: #C0392B;
  --color-status-info: #2B6CB0;
  --font-sans: UbuntuSans, Bornomala, sans-serif;
}
```
