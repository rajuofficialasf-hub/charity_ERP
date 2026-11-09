# Source data

## bd-locations.csv — locations master (O-09, D-061, D-160)

| Item | Value |
|---|---|
| Source | The department's own file `bangladesh-admin.json` (version `2026-11-06-clean-fixed-2026-11-07`), supplied by the owner on 2026-11-07: divisions → districts → upazilas (with their unions, pourashavas and other places) and the city corporations with their thanas, in Bengali and English, with post codes and the post offices of each upazila and thana. It supersedes `bd_location.json` of 2026-10-11 and the review sheet of that file (D-160) |
| Status | **Unverified against the official BBS geocode.** Loaded as supplied with automatic fixes only; every row has `verified = no`. The owner's file is aligned with the 2022 census and its own cleaning notes are kept in the file's `meta.changes` |
| Automatic fixes | Listed in `corrections.md` (Unicode normalisation and spacing, and the places the file leaves without a post code of their own) |
| Post codes | From the file: an upazila's own (499 of 500; Osmaninagar has none, its unions carry their own), a thana's own (all 102), a union's own where the Bangladesh Post lists an office there (327), otherwise its upazila's as the file gives it (4,260); a pourashava or another place has no code in the file and takes its upazila's (D-160). `post_code_own` says whether the code is the place's own (`yes`) or the upazila's (`no`) |
| Official codes | Not in the source. `code` is an internal code assigned once (`L-dd`, `L-dd-dd`, `L-dd-dd-dd`, `L-dd-dd-dd-ddd`) and never changed; the official BBS geocode goes into `locations.bbs_code` when the department supplies it |
| Earlier file | The CSV of 2026-10-11 came from `bd_location.json`; 4,786 of its places keep their code in the new CSV (matched by the English or the Bengali name along the path), 825 entries the new file lacks are deactivated by the loader (775 unions, 28 thanas, 15 pourashavas, 7 upazilas, mostly renamed or re-spelt places such as "Kawkhali (Betbunia)" → "Kawkhali"), and 827 places are new (771 unions, 19 thanas, 13 other places, 12 upazilas, 12 pourashavas) |

### Columns

`division_code, division_bn, division_en, district_code, district_bn, district_en, upazila_code, upazila_bn, upazila_en, upazila_kind, upazila_post_code, union_code, union_bn, union_en, union_kind, post_code, post_code_own, verified` — one row per union-level place. `upazila_kind` is `upazila` or `city_corporation`; `union_kind` is `union`, `pourosova`, `thana` (the units of a city corporation) or `other` (a cantonment or a forest range). `upazila_post_code` is the upazila's own code (empty for a city corporation); `post_code` the union-level place's.

### Names

The Bengali names are kept without the level word the file writes after them ("আমতলী উপজেলা" → "আমতলী"), as the earlier CSV had them; a pourashava keeps "পৌরসভা" / "Pourashava" in both names so that it stands apart from the union of the same name in a list; a city corporation is named after its city ("ঢাকা উত্তর সিটি কর্পোরেশন", "Dhaka North City Corporation") and sits under its district at upazila level (D-061); another place keeps the file's name ("সাভার সেনানিবাস").

### Tools

- `pnpm --filter @css/api locations:convert <owner json>` rewrites this CSV from the owner's file. Existing codes are kept (matched by the English or the Bengali names along the path, and by the earlier "City Corporation" naming); new places get the next free number under their parent; `corrections.md` is rewritten.
- `pnpm db:load-locations` loads the CSV into a development or test database: upsert by code, a version bump on every change (names, kind, parent or post code), deactivation (never deletion) of loader codes missing from the CSV. Run it again after every change of the CSV.

### Counts (2026-11-07)

8 divisions, 64 districts, 500 upazilas, 12 city corporations, 4,587 unions, 327 pourashavas, 102 thanas, 13 other places (5,029 union-level rows).
