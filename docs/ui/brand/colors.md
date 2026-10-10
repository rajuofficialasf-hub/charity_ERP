# Brand colours and typography

Source: the live website https://assunnahfoundation.org/ read in a browser on 2026-10-10 (computed styles of the rendered page, about 780 visible elements, after scrolling the whole page). The owner asked for the ERP to take its colours and fonts from this website (decisions UX-01 and UX-13 in docs/ui/DESIGN_BRIEF.md). Values marked "site" were observed exactly. Values marked "derived" were computed for the ERP and the reason is given. If the Foundation has a written brand guide, it supersedes this file.

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

The logo colours belong to the logo only. Do not recolour the logo and do not use its orange or lime in the interface.

Logo file supplied by the owner: docs/ui/brand/logo.png, PNG with transparency, 300 by 196 px (18,664 bytes). Measured dominant colours: lime #8CC63F, black #000000 (the wordmark), orange #ED962F, green #2E9061, which match the website's logo within measurement error. At 300 px wide it is sharp up to 150 CSS pixels wide on a 2x screen and 100 on a 3x screen, which suits the app header. It is too small for the login screen at full size and for PDF exports. Never upscale it. An SVG or a PNG at least 1000 px wide is wanted for those uses.

## 2. ERP tokens

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

Status colours are not from the website. They stay as set in the constitution.

## 3. Contrast (WCAG 2.x)

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

What this means:
- The website's own buttons, white text on #008E48, reach 4.23:1. That passes only for large text. The ERP therefore uses #007B3E for filled buttons and links that carry small text, and keeps #008E48 for large surfaces, icons and charts.
- The website's dark amber #D08322 fails on white for small text. The ERP uses #9B6119 when amber is text.
- The website's hairline #919EAB is too faint to mark an input. The ERP uses #7F8E9D for control boundaries.
- The website's soft button, green text on #EEF2F0, reaches 3.75:1 and fails for small text. The ERP uses the dark green for that text.
- Amber fills reach only 1.86:1 against white. They are decoration and never mark the boundary of a control.
- The constitution's warning colour reaches 3.68:1 on white. Use status colours for icons, borders and tinted backgrounds, and keep the label text of a status badge in ink.

## 4. Typography

Observed on the website:
- Font stack: `UbuntuSans, Bornomala, sans-serif`, the same on the body and every heading.
- Faces loaded: UbuntuSans as one variable file declared for weights 500 to 700 (318,140 bytes, so regular Latin text is likely drawn at weight 500); Bornomala Regular and Bold as woff2 (76,124 and 85,712 bytes) with ttf fallbacks (204,276 and 225,072 bytes). PublicSans is declared but not loaded.
- Files are served from https://assunnahfoundation.org/fonts/.

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

ERP decision (UX-13, owner, 2026-10-10):
- Font stack `UbuntuSans, Bornomala, sans-serif`, weights 400 and 700 only, self-hosted, no external font CDN at runtime. Define the two families under exactly these names.
- UbuntuSans draws Latin letters and all digits, which are English digits everywhere (UX-05). Bornomala draws the Bengali script. The generic sans-serif is the last fallback.
- Constitution section 12 asked for Medium and SemiBold. They are not available. Use Bold where the scale said Medium or SemiBold for emphasis, Regular for body text. Task T0.19 confirms the final mapping.
- Recommendation for T0.19: the website body text is 16 to 17 px. The 14 px body size of the constitution is small for Bangla on phones. Test 16 px on phones and keep 14 px for dense desktop tables.
- Performance: the full UbuntuSans file is 318 KB. Subset it to Basic Latin, digits and punctuation, since Bengali comes from Bornomala. Use font-display swap and precache the font files in the PWA.

Licences:
- Ubuntu Sans is published under the Ubuntu Font Licence 1.0 (designers Dalton Maag, David Jonathan Ross, Dual Type; on Google Fonts since 2024-03-22; variable weights 100 to 800). The licence text must travel with any font files in the repository. Subsets are derivative files and keep the same licence.
- Bornomala is not on Google Fonts or Fontsource, and a web search found no licence information. Its origin and licence are not verified. The owner or the web developer who built the website should confirm them before the ERP ships the files.

## 5. Shape and layout observed on the website (for task T0.19 to consider)

- Base corner radius 8 px; cards 20 px with a 1 px border #919EAB at 12 percent and a very light shadow (0 2px 6px 2px at 3 percent black). The constitution tokens are 6, 10 and 16 px. T0.19 decides whether to align.
- Buttons: 8 px radius, 6 px by 16 px padding, 17 px bold, no shadow. Soft or outlined button: background #EEF2F0, text #008E48, 1 px border #008E48, padding 6 px by 24 px.
- Inputs: 8 px radius, 1 px border at 20 percent hairline, 16 px text.
- Spacing unit 8 px. Header 64 px on phones and 80 px on desktop with an 8 px background blur.

## 6. Usage rules

1. Green is the action colour: primary buttons, links, selected states and focus.
2. Amber is a highlight, never a status. Green and amber are close to the success and warning colours, so status always carries an icon and a text label and is never shown by colour alone.
3. Text on amber is ink. Small text on green is white on the dark green only.
4. Dark surfaces use ink with white text.
5. The logo keeps its own colours and is never tinted.
6. A status badge is a tinted background, an ink label and a coloured icon.

## 7. CSS variables

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

## 8. Method and limits

Read with the desktop app's browser on 2026-10-10 at a 961 by 914 viewport. The page is a React site, so colours were read from the rendered elements, not from a design file. Colours that appear on interaction states (hover, focus, dialogs) were not captured. If the website is redesigned, repeat the extraction and update this file and the tokens in DESIGN_SYSTEM.md.
