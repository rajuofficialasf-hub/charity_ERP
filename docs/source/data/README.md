# Source data

## bd-locations.csv — locations master (O-09, D-061)

| Item | Value |
|---|---|
| Source | The department's own file `bd_location.json`, supplied by the owner on 2026-10-11 (division → district → upazila or city corporation → union, pourosova or thana; Bengali and English names) |
| Status | **Unverified.** Loaded as supplied with automatic fixes only (owner decision while planning T1.2, 2026-10-11). Every row has `verified = no` |
| Automatic fixes | Listed in `corrections.md` (Unicode normalisation and spacing, three spelling or case fixes, "City Corporation" written uniformly, the nine "Ward No." entries under Bhola Sadar dropped because there is no ward level, O-09) |
| Open corrections | The 2026-10-11 review found about 20 upazilas whose union lists differ from the official lists (for example Dimla is a copy of Jaldhaka), unions of new upazilas still listed under the old ones (Lalmai, Karnaphuli, Eidgaon), wrong English names in Manikchhari and Panchhari, the Dupchanchia pourashava under Nandigram and two double entries. They are listed with a proposal per row in the review sheet `bd_location_review.csv` sent to the owner; the owner verifies them and the corrected rows are applied with the same tools. Until then field users may meet wrong unions in these upazilas |
| Official codes | Not in the source. `code` is an internal code assigned once (`L-dd`, `L-dd-dd`, `L-dd-dd-dd`, `L-dd-dd-dd-ddd`) and never changed; the official BBS geocode goes into `locations.bbs_code` when the department supplies it. The list must also be checked against the latest official BBS geocode |
| Cross-check | The open dataset nuhil/bangladesh-geocode (MIT licence, 2023) was used only as a second opinion in the review; nothing was imported from it (owner instruction 2026-10-11) |

### Columns

`division_code, division_bn, division_en, district_code, district_bn, district_en, upazila_code, upazila_bn, upazila_en, upazila_kind, union_code, union_bn, union_en, union_kind, verified` — one row per union-level place. `upazila_kind` is `upazila` or `city_corporation`; `union_kind` is `union`, `pourosova` or `thana` (thanas are the units of a city corporation).

### Tools

- `pnpm --filter @css/api locations:convert <owner json>` rewrites this CSV from the owner's file. Existing codes are kept (matched by the names along the path); new places get the next free number under their parent; `corrections.md` is rewritten.
- `pnpm db:load-locations` loads the CSV into a development or test database: upsert by code, a version bump on every change, deactivation (never deletion) of loader codes missing from the CSV. Run it again after every change of the CSV.

### Counts (2026-10-11)

8 divisions, 64 districts, 495 upazilas, 12 city corporations, 4,591 unions, 330 pourosovas, 111 thanas.
