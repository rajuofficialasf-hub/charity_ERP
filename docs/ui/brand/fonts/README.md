# Fonts

Copied on 2026-10-10 from https://assunnahfoundation.org/fonts/ with the owner's permission. These are the files the Foundation's website serves. Decision UX-13 in docs/ui/DESIGN_BRIEF.md: font stack `UbuntuSans, Bornomala, sans-serif`, weights 400 and 700.

| File | Bytes | SHA-256 (first 16) | What it is |
|---|---|---|---|
| UbuntuSans.woff2 | 318,140 | f99efbd21b780bfe | Ubuntu Sans 1.006, variable font, weight axis 100 to 800, width axis 75 to 100, 1,849 glyphs |
| Bornomala-Regular.woff2 | 76,124 | d62dc24e69fb670f | Bornomala Regular 1.0.0.3, static, weight 400, 798 glyphs |
| Bornomala-Bold.woff2 | 85,712 | f318bf97b8f70be4 | Bornomala Bold 1.0.0.3, static, weight 700, 798 glyphs |
| UbuntuSans-UFL-1.0-LICENCE.txt | 4,673 | | Ubuntu Font Licence 1.0, from the Google Fonts repository (ufl/ubuntusans) |
| Bornomala-OFL-1.0-LICENSE.txt | 3,858 | | SIL Open Font License 1.0, standard text from the SPDX licence list |

## Licences, as declared inside the font files

- Ubuntu Sans: copyright 2011, 2022, 2023 Canonical Ltd., licensed under the Ubuntu Font Licence 1.0. Vendor Dalton Maag Ltd.
- Bornomala: copyright Codepotro, designer Jayed Ahsan Saad, vendor https://codepotro.com. Both files declare the SIL Open Font License, Version 1.0. A web search found no public page that confirms the font or its licence, so the owner should confirm the source with the web developer who built the website.
- Both licences require the licence text to travel with the fonts wherever they are copied. These text files must be shipped with the fonts into the application (task T1.4).

## How to use them

- Declare the families under exactly these names: `UbuntuSans` and `Bornomala`.
- UbuntuSans is one variable file. Declare it with `font-weight: 400 700`. The file covers 100 to 800. The website's own CSS declares only 500 to 700, so its regular text is drawn at weight 500.
- Bornomala is two static files: Regular for 400 and Bold for 700.
- UbuntuSans draws Latin letters and all digits. Bornomala draws the Bengali script.
- The full UbuntuSans file is 318 KB. A subset (Basic Latin, digits, punctuation) is much lighter, but under the Ubuntu Font Licence a subset is a Modified Version, and clause 2(c) requires its internal font name to carry the suffix "derivative X", for example "Ubuntu Sans derivative CSS ERP". The other choice is to ship the original file unmodified and precache it in the PWA. The CSS family alias `UbuntuSans` is not affected.
- Self-host only, with `font-display: swap`. No external font CDN at runtime.
