# Performance of the nationwide lists

The volunteer tab and the beneficiary tab (T1.10; DECISION_LOG O-67, D-094) list everyone in the
country. This document records how they were measured on a large data set, the results, and the
indexes and query changes the measurement led to. The target is a p95 under 300 ms for every list
page and statistics call; a call that misses it is reported here with a proposal, never passed
silently.

## 1. Data set

`pnpm --filter @css/api perf:seed` builds the separate database `css_erp_perf` (the database guard
allows it, never under `NODE_ENV=production`; the dev and test databases are not touched):

- the migrations, the locations, and the base and demo seed (so the demo accounts exist);
- 50,000 volunteers with their user accounts (no password, so none can sign in): every account
  state, every volunteer type, categories A to D and the inactive flag, about 1,250 on the
  blocklist, spread over all 5,032 union-level locations;
- 2,000,000 beneficiaries over the same unions (90 % with an NID, 10 % with a birth registration
  number), every default beneficiary type, about 2,000 blocked;
- 300 projects over the years 2022 to 2026 and 500,000 applications (every fourth beneficiary), all
  statuses, owned by the volunteers in turn; 47,500 project assignments.

The rows are made with `generate_series` in SQL; the load takes about 6.5 minutes and ends with
`VACUUM ANALYZE` (the visibility map lets counts read an index alone, as autovacuum would on a live
server). `--fresh` drops and rebuilds the database.

## 2. Method

`pnpm --filter @css/api perf:lists [--runs 20] [--explain-over 100] [--only <text>]` calls the real
services of the routes (`VolunteerListService`, `BeneficiariesService`: the same filters, scope,
masks and 5 s time limit as `GET /volunteers`, `/volunteers/statistics`, `/beneficiaries`,
`/beneficiaries/statistics` and `/beneficiaries/{beneficiaryId}`), without HTTP and the per-user rate
limit. Each case runs twice to warm up and then 20 times, as the Department Head (GLOBAL) and as the
Dhaka RPM; the script prints p50 and p95 in milliseconds and the slowest SQL statement, and runs
EXPLAIN (ANALYZE, BUFFERS) on the slowest statement of every case over `--explain-over` ms.

Environment of the run of 2026-10-15: PostgreSQL 17.11 in Docker Desktop on Windows 11 (12 logical
cores, 32 GB memory), default server settings (`shared_buffers` 128 MB, `random_page_cost` 4,
`work_mem` 4 MB), the API process on the same machine. The production server will have tuned memory
settings; these numbers are a ceiling for the same data volume, not a promise for a different one.

## 3. Results (after the changes of section 4)

All 68 cases are under 300 ms at p95. Times in milliseconds, 20 runs each.

| Call | Case | Head p50 / p95 | RPM p50 / p95 |
|---|---|---|---|
| `volunteers.list` | first page | 9 / 11 | 9 / 10 |
| `volunteers.list` | next page | 10 / 13 | 9 / 10 |
| `volunteers.list` | with total | 12 / 16 | 12 / 14 |
| `volunteers.list` | district | 9 / 10 | 10 / 12 |
| `volunteers.list` | state pending | 9 / 12 | 9 / 11 |
| `volunteers.list` | type local_daee | 8 / 9 | 8 / 9 |
| `volunteers.list` | category A | 8 / 11 | 8 / 10 |
| `volunteers.list` | blocked | 15 / 31 | 16 / 36 |
| `volunteers.list` | not blocked + total | 24 / 28 | 25 / 28 |
| `volunteers.list` | project | 10 / 11 | 9 / 11 |
| `volunteers.list` | name search | 9 / 12 | 9 / 10 |
| `volunteers.list` | name search + total | 28 / 36 | 26 / 36 |
| `volunteers.list` | mobile search | 9 / 12 | 8 / 9 |
| `volunteers.list` | NID search | 10 / 13 | 14 / 20 |
| `volunteers.statistics` | all | 73 / 87 | 74 / 84 |
| `volunteers.statistics` | district | 22 / 25 | 24 / 28 |
| `beneficiaries.list` | first page | 4 / 4 | 4 / 4 |
| `beneficiaries.list` | next page | 4 / 5 | 4 / 5 |
| `beneficiaries.list` | with total | 90 / 130 | 89 / 93 |
| `beneficiaries.list` | district | 7 / 8 | 5 / 11 |
| `beneficiaries.list` | upazila | 8 / 10 | 7 / 8 |
| `beneficiaries.list` | union | 6 / 11 | 4 / 5 |
| `beneficiaries.list` | type widow | 8 / 15 | 4 / 7 |
| `beneficiaries.list` | blocked | 6 / 7 | 6 / 8 |
| `beneficiaries.list` | project | 21 / 24 | 23 / 35 |
| `beneficiaries.list` | year 2025 | 6 / 7 | 5 / 6 |
| `beneficiaries.list` | district + year + total | 60 / 69 | 69 / 90 |
| `beneficiaries.list` | name search | 4 / 5 | 5 / 6 |
| `beneficiaries.list` | name search + total | 115 / 145 | 139 / 191 |
| `beneficiaries.list` | mobile search | 4 / 6 | 4 / 6 |
| `beneficiaries.list` | NID search | 7 / 12 | 8 / 13 |
| `beneficiaries.statistics` | all | 168 / 186 | 174 / 216 |
| `beneficiaries.statistics` | district | 54 / 58 | 63 / 123 |
| `beneficiaries.profile` |  | 19 / 22 | 19 / 24 |

"with total" asks for the row count as well (`include=total`); the tab asks for it only on the first
page. The slowest calls are the counts over all 2,000,000 beneficiaries (about 90 to 190 ms); they
grow with the number of beneficiaries, so section 5 says when to look again.

## 4. What the measurement changed

The first run (same data, before any change) had three cases over 300 ms:

| Case | Before: Head / RPM p95 | After: Head / RPM p95 |
|---|---|---|
| `volunteers.statistics` all | 478 / 235 | 87 / 84 |
| `beneficiaries.statistics` all | 570 / 626 | 186 / 216 |

- **Volunteer statistics:** nine separate counts became three: the people grouped by account state,
  the inactive flag, and the applications grouped by status. Without a filter the applications are
  counted by their owner column alone, without joining the volunteers.
- **Beneficiary statistics:** the three counts (everyone, assisted this year, blocked) are independent
  and now run at the same time, each in its own bounded read. The migration
  `20261015000000_list_indexes` adds two partial indexes on `beneficiaries`: `(id) WHERE
  merged_into_id IS NULL`, which the "assisted this year" semi join reads instead of the table, and
  `(id) WHERE is_blocked AND merged_into_id IS NULL` for the blocked count and the blocklist filter
  (that filter went from about 20 ms to 7 ms).
- **Volunteer name search:** the same migration adds a GIN trigram index on `users.display_name`. At
  50,000 volunteers a scan of the table is still fast, so it does not change these numbers; it keeps
  the search fast as the number of accounts grows.

No counter table and no capped count were needed (the plan's fallback, which would have been a new
decision for the owner).

## 5. When to measure again

- when a nationwide list gains a filter, a sort or a column read from another table;
- before a phase gate, once the real number of beneficiaries passes about 2,000,000, or when a count
  call reaches 200 ms at p95 in production logs. The next step for the counts would then be a
  counter maintained by the writes, which needs the owner's decision first.
