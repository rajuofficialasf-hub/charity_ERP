# Performance

The volunteer tab and the beneficiary tab (T1.10; DECISION_LOG O-67, D-094) list everyone in the
country; section 6 covers the first load of the PWA. This document records how they were measured on a large data set, the results, and the
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

The rows are made with `generate_series` in SQL; the load takes about 6 to 7 minutes and ends with
`VACUUM ANALYZE` (the visibility map lets counts read an index alone, as autovacuum would on a live
server). A settings row written last marks the data set complete; a run that stopped halfway is
refused until `--fresh` drops and rebuilds the database. The guard `checkPerfDbAccess` allows only a
`css_erp_perf` database on this machine (or the compose database service).

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
| `volunteers.list` | first page | 8 / 12 | 9 / 17 |
| `volunteers.list` | next page | 8 / 11 | 9 / 10 |
| `volunteers.list` | with total | 11 / 14 | 12 / 16 |
| `volunteers.list` | district | 10 / 13 | 9 / 11 |
| `volunteers.list` | state pending | 9 / 11 | 9 / 11 |
| `volunteers.list` | type local_daee | 8 / 10 | 9 / 12 |
| `volunteers.list` | category A | 8 / 9 | 8 / 10 |
| `volunteers.list` | blocked | 15 / 38 | 16 / 23 |
| `volunteers.list` | not blocked + total | 23 / 26 | 26 / 29 |
| `volunteers.list` | project | 9 / 11 | 10 / 12 |
| `volunteers.list` | name search | 13 / 16 | 9 / 10 |
| `volunteers.list` | name search + total | 27 / 32 | 32 / 43 |
| `volunteers.list` | mobile search | 8 / 19 | 8 / 9 |
| `volunteers.list` | NID search | 9 / 21 | 11 / 13 |
| `volunteers.statistics` | all | 74 / 81 | 70 / 77 |
| `volunteers.statistics` | district | 23 / 26 | 21 / 25 |
| `beneficiaries.list` | first page | 4 / 5 | 4 / 5 |
| `beneficiaries.list` | next page | 4 / 5 | 4 / 8 |
| `beneficiaries.list` | with total | 90 / 97 | 91 / 95 |
| `beneficiaries.list` | district | 5 / 6 | 5 / 6 |
| `beneficiaries.list` | upazila | 7 / 8 | 8 / 8 |
| `beneficiaries.list` | union | 7 / 13 | 5 / 5 |
| `beneficiaries.list` | type widow | 7 / 12 | 4 / 5 |
| `beneficiaries.list` | blocked | 4 / 5 | 4 / 6 |
| `beneficiaries.list` | project | 21 / 25 | 19 / 24 |
| `beneficiaries.list` | year 2025 | 5 / 6 | 6 / 8 |
| `beneficiaries.list` | district + year + total | 60 / 69 | 63 / 74 |
| `beneficiaries.list` | name search | 5 / 6 | 5 / 5 |
| `beneficiaries.list` | name search + total | 119 / 202 | 118 / 127 |
| `beneficiaries.list` | mobile search | 3 / 4 | 4 / 4 |
| `beneficiaries.list` | NID search | 6 / 10 | 7 / 8 |
| `beneficiaries.statistics` | all | 172 / 189 | 163 / 179 |
| `beneficiaries.statistics` | district | 36 / 40 | 36 / 41 |
| `beneficiaries.profile` |  | 16 / 28 | 16 / 18 |

"with total" asks for the row count as well (`include=total`); the tab asks for it only on the first
page. The slowest calls are the counts over all 2,000,000 beneficiaries (about 90 to 190 ms); they
grow with the number of beneficiaries, so section 5 says when to look again.

## 4. What the measurement changed

The first run (same data, before any change) had three cases over 300 ms, in two calls:

| Case | Before: Head / RPM p95 | After: Head / RPM p95 |
|---|---|---|
| `volunteers.statistics` all | 478 / 235 | 81 / 77 |
| `beneficiaries.statistics` all | 570 / 626 | 189 / 179 |

- **Volunteer statistics:** nine separate counts became three: the people grouped by account state,
  the inactive flag, and the applications grouped by status. Without a filter the applications are
  counted by their owner column alone, without joining the volunteers.
- **Beneficiary statistics:** the three counts (everyone, assisted this year, blocked) stay in one
  bounded read, so they share one snapshot and one connection; three indexes of the migration
  `20261015000000_list_indexes` let each count read an index instead of a table:
  - `beneficiaries (id) WHERE merged_into_id IS NULL`: everyone, and the beneficiary side of
    "assisted this year";
  - `applications (status, project_id, beneficiary_id) WHERE beneficiary_id IS NOT NULL`: the
    approved applications of the year's projects (the count went from about 180 ms to 70 ms);
  - `beneficiaries (id) WHERE is_blocked AND merged_into_id IS NULL`: the blocked count and the
    blocklist filter (that filter went from about 20 ms to 5 ms).
  Running the three counts in parallel reads was tried and dropped: it held three pool connections
  per request and gave the counts different snapshots.
- **Volunteer name search:** the same migration adds a GIN trigram index on `users.display_name`. At
  50,000 volunteers a scan of the table is still fast, so it does not change these numbers; it keeps
  the search fast as the number of accounts grows.

No counter table and no capped count were needed (the plan's fallback, which would have been a new
decision for the owner).

### The suggested duplicate beneficiaries (T2.2, 2026-10-21)

The suggestions were first computed for each request: pairs by name, father's or husband's name and
mobile; by name, date of birth and union; and by one mobile. On the 2,000,000 beneficiaries the
first page took longer than the 5-second limit and answered `server.busy`; a grouped query over the
duplicate index alone read all 2,000,000 index entries in 24 seconds, and the mobile groups 4.6
seconds. So the pairs are now kept in `beneficiary_merge_candidates` (DECISION_LOG D-117): the
write that changes a profile recomputes that profile's pairs by index lookups, and the nightly job
on the `duplicates` queue recomputes them all.

| Case | Head p95 | RPM p95 |
|---|---|---|
| `beneficiaries.mergeCandidates` first page, 50,000 active pairs | 12 ms | 9 ms |
| the nightly job over all 2,000,000 profiles | 7.4 to 8.0 s | |

The 50,000 pairs were added to the measurement database by hand for this measurement (its data set
has no duplicates) and marked inactive again by a run of the job:
`pnpm --filter @css/api perf:lists --only mergeCandidates` measures the list, and the flag
`--duplicates-job` times one run of the job first.

### The times helped (U14 of the identity plan, D-172, BR-307; 2026-11-15)

The beneficiary list shows, filters ("helped more than once in a year") and orders by how often a
person was helped. Counting it per request over 2,000,000 people is out of the question, so the
count is kept on the profile (`help_count`, `max_helps_in_year`; docs/database/DATABASE_SCHEMA.md,
"beneficiaries") with two indexes: (help_count, id) and (id) WHERE max_helps_in_year > 1, both
among the live profiles. `perf:lists` gained the cases "helped more than once in a year" (with and
without the total), "by times helped" (first and next page, fewest first, inside a district, and
with the filter) and the flag `--help-counters-job`, which times one run of the nightly recount.

Run of 2026-11-15, same machine and server settings as section 2, after `VACUUM ANALYZE`; the data
set holds 187,500 people helped once and, as `perf:seed` makes one application per person, nobody
helped twice. A second run made one helped person in ten (19,270) a repeat by writing their counters
by hand, then let the nightly job put them back. Times in milliseconds, p50 / p95 of 20 runs:

| Case | Head (no repeats) | RPM (no repeats) | Head (19,270 repeats) | RPM (19,270 repeats) |
|---|---|---|---|---|
| `beneficiaries.list` first page (for comparison) | 6 / 7 | 5 / 6 | | |
| `beneficiaries.list` helped more than once in a year | 5 / 5 | 5 / 6 | 6 / 10 | 6 / 6 |
| `beneficiaries.list` helped more than once + total | 6 / 8 | 8 / 10 | 10 / 11 | 9 / 15 |
| `beneficiaries.list` by times helped | 5 / 7 | 7 / 8 | 7 / 8 | 6 / 6 |
| `beneficiaries.list` by times helped, next page | 6 / 8 | 5 / 6 | 6 / 7 | 6 / 7 |
| `beneficiaries.list` by times helped, fewest first | 5 / 6 | 5 / 5 | 6 / 8 | 5 / 7 |
| `beneficiaries.list` district by times helped | 5 / 6 | 5 / 5 | 7 / 9 | 5 / 7 |
| `beneficiaries.list` more than once by times helped | 5 / 6 | 4 / 5 | 6 / 7 | 5 / 5 |

Every new case is far inside the 300 ms target. The migration `20261115120000_beneficiary_help_counters`
on this data set, run in a transaction that was rolled back: 61 seconds in all, of which the backfill
UPDATE (187,500 rows written) 57.6 s, its count alone 1.2 s, the CHECK 0.8 s and the two indexes 2.2
and 0.5 s; writing the rows and their many indexes is the cost, not the count (docs/ops/DEPLOYMENT.md).
The nightly recount over all 2,000,000 profiles: 32 s when nothing is wrong, 52 s when it repairs
the 19,270 changed counters. Its first version took 19 minutes: each batch's count (20 ms on its own)
spent about 0.8 s in PostgreSQL's JIT compilation, because the recursive query over the merges is
estimated far above the rows it reads, and it locked all 2,000 rows of each batch (a lock writes
to every row). The counting now turns JIT off for its own statements (`withoutJit` and
`writeHelpCounts` of `services/help-history.ts`, the setting put back afterwards) and the job counts
without a lock, then locks and counts again only the profiles whose counter differs.

Found and left (not caused by this change, which adds no statement to these calls): the same run
measured `beneficiaries.statistics` all at 1,473 / 1,673 ms (Head) and 1,437 / 1,710 ms (RPM), and
district at 295 / 339 and 294 / 318, over the 300 ms target, and the profile at 54 / 95 (it was
16 / 28 in section 3). The counts of men and women (D-146) and of "assisted this year" read by the
shared rule (U13) came after the measurement of section 3; their plans read the table rather than an
index. They need their own measurement and a proposal.

### The cards of programs and projects (D-176, BR-313, BR-314; 2026-11-16)

The merged tab opens on the program cards (`GET /program-cards`) and a program on its project
series (`GET /project-series`, `GET /project-series/{seriesId}`). `perf:lists` gained the cases
"program cards", "series cards, every program", "series cards, one program" and "series with its
sessions", which call `ProgramCardsService` and `ProjectSeriesService` as the routes do. The
migration `20261116120000_project_series` was applied to the data set first (`perf:seed` without
`--fresh`): each of the 301 projects became the one session of its own series, so every series has
one session, all but the demo draft active, and every one of the 500,000 applications belongs to a
current session, about 100 series and 167,000 applications per program. That is heavier than the
real shape, where a few projects per program each have one running session.

Runs of 2026-11-16, same machine and server settings as section 2. Times in milliseconds, p50 / p95.
The two reads of every application were measured five times (four of 20 runs, one of 40); their
p50 held within a few milliseconds and their p95 moved between the two values given:

| Case | Head | RPM |
|---|---|---|
| program cards (3 programs) | 249 to 259 / 266 to 318 | 245 to 257 / 285 to 308 |
| series cards, every program (301 series) | 251 to 264 / 268 to 312 | 247 to 254 / 268 to 304 |
| series cards, one program (about 100 series) | 106 / 115 | 112 / 130 |
| series with its sessions | 38 / 42 | 45 / 49 |

The two reads of one program and one series are well inside the 300 ms target. The two that read
every application stand at the target: about 250 ms at p50, and a p95 on either side of 300 from
run to run. About 200 ms of each is the one read of the applications below. What the measurement
changed:

- **One read of the applications.** The first version counted the people helped with
  `count(DISTINCT beneficiary_id)` over every helped application (187,500 rows), in a second read
  beside the one for the session counts: 485 / 575 ms for the program cards and 364 / 407 for every
  series. The distinct count alone took about 300 ms, sorted or hashed, with `work_mem` at 4 MB or
  at 64 MB; the read of the table is about 150 ms of it. A person has one application in a session
  (the unique index on project and beneficiary), so a session's helped applications are its helped
  people. `sessionFigures` now counts them with the other figures in one read (about 180 ms for all
  500,000 applications, a parallel scan), and `helpedPeople` adds the sessions up and takes off
  again the people helped in more than one session of the series or the program. Only the profiles
  whose kept counter says so (`help_count > 1`, the index of "The times helped" above) are looked at
  for that.
- **The volunteers** of a program are counted with a hashed DISTINCT inside a subquery instead of
  `count(DISTINCT …)`: 34 ms instead of 70.
- **No index was added.** The read of the applications is a scan of the whole table when every
  application is in a session on the screen; an index that covered its five conditions would repeat
  most of the row.

Not exercised by this data set:

- **People helped twice.** Nobody in it was, so the look at the repeat people reads nothing (4 ms).
  Measured on its own, with one helped person in ten taken as a repeat by a sample (19,270 people,
  the share of the run above): 60 to 80 ms by program and about 60 by series. With that share of
  repeats the program cards would stand at about 320 ms at p50, over the target.
- **A caller who holds a session by areas.** The reviews waiting and the waitlist of "আপনার করণীয়"
  are counted within the caller's areas (BR-314) in one grouped read with the area filter of an
  official's work figures (`inWorkAreasSql` of `services/projects-work.ts`). The data set's RPM
  holds one area, of the empty demo draft, so the cases above show it at nothing. Measured on its
  own with the largest division (103,481 applications) held as the area of the first 5, the first
  30 and all 300 sessions: 13 ms, about 135 ms and 4.2 to 7 seconds. The filter looks every
  application up in the caller's list of areas, so its time grows with the square of the sessions
  held by areas; an RPM holds a region in a handful of running sessions, not in thirty. A hashed
  form of the same filter read the 300-session case in about 1.1 s; it would change the shared
  filter and was not adopted.

The read of the applications grows with every application ever taken, since the people helped are
added up over every session of a series. When the applications pass about 500,000, when the real
share of people helped in several sessions is known, or when a caller holds areas in more than
about twenty running sessions, measure again; the next step would be a count of the people helped
kept per session by the writes, as the times helped are kept per person, which needs the owner's
decision first.

## 5. When to measure again

- when a nationwide list gains a filter, a sort or a column read from another table;
- before a phase gate, once the real number of beneficiaries passes about 2,000,000, or when a count
  call reaches 200 ms at p95 in production logs. The next step for the counts would then be a
  counter maintained by the writes, which needs the owner's decision first.

## 6. First load of the PWA (NFR-15)

NFR-15 allows at most 400 KB of compressed JavaScript for the first route, the lasting budget the
owner set once the move to the asf UI system ended (D-154, in place of the 250 KB of O-47 and the
move's temporary 400 KB of D-152); it is lowered when the date pickers' provider and the language
catalogue leave the first route, a separate task. The first route is the
entry script of `apps/web/dist/index.html` and every chunk it preloads, gzip level 9, as
`pnpm --filter @css/web bundle:report` (after `pnpm --filter @css/web build`) prints and CI checks
after the build; the command fails over the budget, and also fails when `index.html` names no entry
script, so a changed build can never pass by measuring nothing. The budget applies to this first
route, the login: a first visit always opens it, because a device without a session is sent there,
and after it the service worker precaches every chunk. The command also prints what the home of a
signed-in person adds when it is not cached yet, without failing on it.

| Measured 2026-10-18 (T1.15) | First route (gzip) | Files |
|---|---|---|
| Before: every page except the admin area in the entry | 390.0 KB | 17 |
| After: only the login in the entry, every other page and the app shell lazy | 216.6 KB | 18 |
| 2026-10-19 (D-104): only the device language's catalogue at start, the MUI theme in | 229.7 KB | 18 |
| 2026-10-20: the component set on MUI core, React Aria removed (D-103) | 211.8 KB | 18 |
| 2026-10-20: Tailwind removed, the final state of the MUI work | 212.1 KB | 18 |
| 2026-10-22 (T2.4): after T2.2 to T2.4; the Bengali catalogue at start is 35.8 KB with the form screens' texts | 222.2 KB | 19 |
| 2026-10-22 (T2.4b): after the builder redesign; the builder's new texts (types, groups, sentences) sit in the catalogue the first route carries, `@dnd-kit` stays in the builder's lazy chunk | 223.7 KB | 19 |
| 2026-11-01 (T2.8): after T2.5 to T2.8b and the export dialog; the dialog and its column picker load in their own lazy chunk when someone opens them, and the export words add 1.9 KB to the catalogue the first route carries | 243.2 KB | 23 |
| 2026-11-02 (the visual redesign, D-145): the area labels, descriptions and notes of the designed pages add 3.3 KB to the Bengali catalogue the first route carries; the shell, the set's new pieces and the pages stay in their lazy chunks. The margin to the budget is 3.5 KB | 246.5 KB | 25 |
| 2026-11-03 (an official's own profile, D-147, D-148): the texts of the official's profile, the projects and their figures and the officials' requests tab add 0.6 KB to the Bengali catalogue; the pages stay in their lazy chunks. The margin to the budget is 2.9 KB | 247.1 KB | 25 |
| 2026-11-03 (the asf UI system, D-150, branch `feat/asf-ui`, plan step U2; not on `main`): the asf provider at the root (the MUI theme and baseline, the date pickers' provider with Day.js, the toasts) beside the earlier set, which stays until the last page moved. Over the budget on the branch; measured again after the shell (U8) and the first pages (U10), the decision (a split, a lazy load or a new budget for the owner) comes before the merge, never by cutting a feature | 284.8 KB | 30 |
| 2026-11-03 (the asf UI system, plan step U8: the shell, the sign-in frame, the language switch and the shared pieces on asf; branch `feat/asf-ui`, not on `main`): the sign-in page now draws asf pieces, so asf's MUI parts join the first route beside the earlier set's provider (65.4 KB with its MUI parts). The icon drawings (141 Solar icons, 54 KB) load in their own chunk after the page appears; without that split the route was 430.7 KB. Over the budget while both UI systems are on the page; the owner set a temporary budget of 400 KB for the move (D-152), measured again once the earlier set leaves in U19 | 376.4 KB | 19 |
| 2026-11-04 (the asf UI system, plan step U10: the sign-in, the registration and the home on asf; branch `feat/asf-ui`, not on `main`): the sign-in form now draws the asf text and password fields, its alert and its link buttons, so more of asf's MUI parts join the first route (9.0 KB more); the home of a signed-in person adds 42.2 KB on top when not cached (74.4 KB with the earlier set's home on 2026-11-02). Under the temporary budget of 400 KB (D-152) | 385.4 KB | 18 |
| 2026-11-05 (the asf UI system, plan step U19: the earlier set, Lucide and the earlier fonts out; branch `feat/asf-ui`, not on `main`): only asf's provider and pieces are on the sign-in page. Of the route, the shared React chunk is 236.5 KB (MUI core about 40% of it, the MUI X date pickers' provider at the root of the asf provider about 19%, React Router about 11%), the bn catalogue 52.7 KB and the entry with React DOM and TanStack Query 74.0 KB; the home adds 40.8 KB when not cached. The owner set 400 KB as the lasting budget (D-154); the date pickers' provider (about 40 KB) and the catalogue by namespace (about 40 KB) can leave the route in a later task | 381.5 KB | 17 |
| 2026-11-11 (the sign-in, registration and account forms on the asf contract's `Form`, react-hook-form and zod): 382.8 KB before. The form pieces of the asf barrel bring react-hook-form into the shared React chunk (12.7 KB), which the first route now carries. Zod and the shared request schemas came to 423.3 KB with the form in the entry, so the login form loads in its own lazy chunk as the page appears (a skeleton in its place meanwhile): 28.8 KB after the first route, mostly zod, which the home loads anyway; the home still adds 40.8 KB when not cached | 395.6 KB | 17 |
| 2026-11-12 (an easier form builder, D-171, units U1 to U10; branch `feat/form-builder-ease`): 396.3 KB before (the standards' rest). The builder itself stays in its lazy chunk; the first route grows only by the builder's new texts in the Bengali catalogue (the list of what to fix, the uses of a removed question, the save states, the identity wording, the options and the translations), 1.5 KB. The second part of the plan adds more texts, so the catalogue by area is the step to take before the first route passes the budget; the home still adds 40.9 KB when not cached | 397.8 KB | 17 |
| 2026-11-14 (the catalogue in two parts, D-173; branch `refactor/catalogue-by-area`): 399.1 KB before. The first route carries only the start part of the Bengali catalogue (`auth`, `common`, `errors`, `notifications`, `registration`, `ui`: 16.5 KB); the rest (the other eleven namespaces, 40.1 KB) moved out and loads with the first page after the login, beside the page's own code, so the home of a signed-in person now adds 80.9 KB when not cached (the rest included) | 360.1 KB | 17 |

What a signed-in page adds on top of the first route when it is not yet cached (static import
closure of its chunks, gzip): the home with the shell 76.0 KB, my projects with the shell 72.1 KB,
the volunteer tab with the shell and the admin area 134.2 KB, the registration page 162.6 KB.

Since D-104 the entry loads only the device language's catalogue and fetches the other when the
person switches; since D-173 only its start part (the Bengali one, 16.5 KB gzip on 2026-11-14, is
counted in the first route), and the rest (40.1 KB) comes with the first page after the login. With the
component set on MUI core (D-103) the login's fields are native elements and MUI's theme, button
and style engine are the only MUI code on the first route; the home of a signed-in person adds
74.4 KB on top on 2026-11-02 with the redesigned shell and home (63.9 KB before; it was 76.0 KB with React Aria; 62.6 KB on 2026-10-22). The form builder and the public application page load in their own lazy chunks and add nothing to the first route. The next step if the first route grows past the
budget is the gallery namespace, which only the gallery build needs.

Lighthouse 12 on the mobile profile against the production build (`vite preview`, simulated slow
4G, `/login`), 2026-10-18: Performance 78, Accessibility 100, Best Practices 100; First Contentful
Paint 3.7 s, Largest Contentful Paint 4.0 s, Total Blocking Time 100 ms, Cumulative Layout Shift
0.002, total transfer 430 KiB (fonts and styles included). axe runs on every screen of the E2E
suite on the mobile and the desktop profile.

Lighthouse 12.8.2 again for T2.9 on 2026-11-07, after the move to the asf UI system, on the same
page and build (first route 381.6 KB gzip):

| Profile | Performance | Accessibility | Best Practices | FCP | LCP | TBT | TTI | Transfer |
|---|---|---|---|---|---|---|---|---|
| Mobile, simulated slow 4G (the default) | 58 | 100 | 100 | 4.4 s | 4.9 s | 520 ms | 5.2 s | 593 KiB |
| The 3G profile of NFR-16 (300 ms, 1.6 Mbps, CPU ×4), simulated | 49 | | | 5.8 s | 6.7 s | 510 ms | 6.7 s | 593 KiB |
| The same 3G profile with real throttling (`--throttling-method=devtools`) | 64 | | | 5.4 s | 5.4 s | 170 ms | 6.7 s | 593 KiB |

The first visit of a phone on 3G is therefore about 6.7 s to interactive, over the 5 s of NFR-16.
NFR-16 asks for the volunteer home after the first install, when the service worker serves the
build from its cache; Lighthouse bypasses that cache (a second run with the storage kept still
loaded the 593 KiB), so the installed case is measured on the phones of the device checklist
(`docs/testing/uat/OFFLINE_DEVICE_CHECKLIST_BN.md`) before the Phase 2 gate. The cold first visit
is what the planned slimming of the first route (the date pickers' provider and the catalogue by
namespace, about 80 KB; D-154) improves.

## Exports (T2.8)

`pnpm --filter @css/api perf:exports` on css_erp_perf (after `perf:seed`, which also applies new
migrations to an existing data set): as the Department Head it asks for the beneficiaries of the
Dhaka division (more than the 100,000 rows a file holds) with eight columns, the NID among them,
and runs the job in the same process with the real batches of 1,000 rows, the writers and the
filesystem storage driver until the job stops at 100,000 rows; once as CSV, once as Excel. The
memory is the process's peak resident set, sampled every 100 ms, against its baseline before the
job (the Node process with Prisma and the container).

| Measured 2026-11-01 on the owner's machine | Rows | Time | File | Peak above baseline |
|---|---|---|---|---|
| CSV | 100,000 | 5.8 s | 22.6 MB | 187 MB |
| Excel | 100,000 | 6.9 s | 6.4 MB | 326 MB |

The baseline was 399 MB. Excel holds its compressed sheets until the end (the streaming writer of
`exceljs` commits the zip only once), which is the larger share; three running exports per person
cap what one person can ask of the worker at once. A worker host should allow about 1 GB for the
process with one large Excel export running.

