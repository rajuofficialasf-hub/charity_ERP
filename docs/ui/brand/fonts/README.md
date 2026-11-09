# Fonts

Copied on 2026-10-10 from https://assunnahfoundation.org/fonts/ with the owner's permission. These are the files the Foundation's website serves. Decision UX-13 in docs/ui/DESIGN_BRIEF.md: font stack `UbuntuSans, Bornomala, sans-serif`, weights 400 and 700.

**The app no longer uses these files.** Since D-150 (ADR-016, 2026-11-03) the web app and the API's PDFs use Public Sans with Noto Sans Bengali from the Fontsource packages `@fontsource-variable/public-sans` and `@fontsource-variable/noto-sans-bengali` (SIL Open Font License 1.1), declared in `apps/web/package.json` and `apps/api/package.json` and imported by the asf `UiProvider` (`apps/web/src/ui/templates/asf/components/ui-provider.tsx`); see docs/ui/DESIGN_SYSTEM.md section 2.5. UX-13 is superseded. This folder stays as the record of the website's fonts and their licences; the sections below describe how they were used until the move.

| File | Bytes | SHA-256 (first 16) | What it is |
|---|---|---|---|
| UbuntuSans.woff2 | 318,140 | f99efbd21b780bfe | Ubuntu Sans 1.006, variable font, weight axis 100 to 800, width axis 75 to 100, 1,849 glyphs |
| Bornomala-Regular.woff2 | 76,124 | d62dc24e69fb670f | Bornomala Regular 1.0.0.3, static, weight 400, 798 glyphs |
| Bornomala-Bold.woff2 | 85,712 | f318bf97b8f70be4 | Bornomala Bold 1.0.0.3, static, weight 700, 798 glyphs |
| UbuntuSans-UFL-1.0-LICENCE.txt | 4,673 | | Ubuntu Font Licence 1.0, from the Google Fonts repository (ufl/ubuntusans) |
| Bornomala-OFL-1.0-LICENSE.txt | 3,858 | | SIL Open Font License 1.0, standard text from the SPDX licence list |

## Licences, as declared inside the font files

- Ubuntu Sans: copyright 2011, 2022, 2023 Canonical Ltd., licensed under the Ubuntu Font Licence 1.0. Vendor Dalton Maag Ltd.
- Bornomala: copyright Codepotro, designer Jayed Ahsan Saad, vendor https://codepotro.com. Both files declare the SIL Open Font License, Version 1.0. The owner confirmed on 2026-10-10 that the font comes from https://codepotro.com/font/bornomala/ (DECISION_LOG O-32).
- Both licences require the licence text to travel with the fonts wherever they are copied. These text files must be shipped with the fonts into the application (task T1.4).

## How to use them (until D-150)

- Declare the families under exactly these names: `UbuntuSans` and `Bornomala`.
- UbuntuSans is one variable file. Declare it with `font-weight: 400 700`. The file covers 100 to 800. The website's own CSS declares only 500 to 700, so its regular text is drawn at weight 500.
- Bornomala is two static files: Regular for 400 and Bold for 700.
- UbuntuSans draws Latin letters and all digits. Bornomala draws the Bengali script.
- The full UbuntuSans file is 318 KB. A subset (Basic Latin, digits, punctuation) is much lighter, but under the Ubuntu Font Licence a subset is a Modified Version, and clause 2(c) requires its internal font name to carry the suffix "derivative X", for example "Ubuntu Sans derivative CSS ERP". The other choice is to ship the original file unmodified and precache it in the PWA. The CSS family alias `UbuntuSans` is not affected.
- Self-host only, with `font-display: swap`. No external font CDN at runtime.

## What the application shipped (T1.4, D-065; until D-150)

History: the files and scripts named here (`packages/ui/fonts/`, the subset script, the copy to `apps/web/public/fonts/`) were removed with `packages/ui` at the end of the asf move. The fonts now reach the build through the Fontsource packages, and the service worker precaches them with the rest of the build.

- `packages/ui/fonts/` held the files the application served: `UbuntuSans-derivative-CSSERP.woff2` (25,184 bytes; subset of Basic Latin, Latin-1, general punctuation and the minus sign; weight axis 400 to 700, width axis pinned at 100; internal name "Ubuntu Sans derivative CSS ERP" as clause 2(c) requires; OpenType features tnum, pnum, case, frac, liga and kerning kept), the two Bornomala files unmodified, and both licence texts.
- The subset was built by `packages/ui/scripts/subset-ubuntu-sans.py` with Python fontTools 4.60.1 and brotli 1.1.0 (a development tool, not a project dependency); rerun it only when the source file here changes.
- `apps/web/scripts/next.mjs` (later `scripts/fonts.mjs`) copied the folder to `apps/web/public/fonts/` before `dev` and `build`, so the fonts and licence texts are served at `/fonts/` and the service worker can precache stable URLs (T2.7). The CSS families were `UbuntuSans` and `Bornomala` (`packages/ui/src/styles/fonts.css`).
- The files in this folder stay the original website copies used by the mockups (removed with D-151).
