# Source material (owner-supplied inputs)

`ERP_BLUEPRINT_BN.md` is the business authority, converted from the owner's Claude Doc export (version 2 of 5 Oct 2026); its diagrams are in `images/`. If the blueprint changes, re-export the Claude Doc, replace this file and the images, then run `/css-change` so Claude reports the impact before anything is implemented.

The items below are still to be supplied by the owner. Drop each file where shown; the task that needs it asks for it if it is missing. Tick a row when the file is in the repository.

| Done | What | Put it in | Needed by |
|---|---|---|---|
| [ ] | Figma mockup screenshots, one PNG per frame, for example `project-setup.png` | `docs/ui/mockups/` | T0.19, T1.4 and every UI task |
| [ ] | Figma tokens export (JSON), logo, official brand colours | `docs/ui/brand/` | T0.19, T1.4 |
| [ ] | SOP v2.3 (September 2026) as Markdown or PDF | `docs/source/SOP_v2.3_BN.md` or `.pdf` | T0.4, T1.13, T5.4 |
| [ ] | Qurbani donor sheet sample (SSL format, 5-10 rows, names and phone numbers replaced) and the field list of the cash-donor form | `docs/source/samples/` | T4.4 |
| [ ] | Exports of the current volunteer registration form and the two application forms, plus a few filled, anonymized samples | `docs/source/samples/` | T2.3, T2.9 |
| [ ] | Bangladesh locations list as CSV (`division,district,upazila,union,ward`), if available | `docs/source/data/bd-locations.csv` | T1.2 (otherwise Claude loads an open dataset) |

Never put real NIDs, phone numbers, bank details or donor data in this repository.
