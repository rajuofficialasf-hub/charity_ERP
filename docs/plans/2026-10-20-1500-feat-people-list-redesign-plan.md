---
title: The volunteer and beneficiary tabs in a clean list layout
type: feat
status: in-progress
source: plan
date: 2026-10-20
---

# The volunteer and beneficiary tabs in a clean list layout

## Goal

The owner's reference images for the volunteer tab (chat, 2026-10-20) become the layout of both nationwide tabs: count cards that filter, one search box with a filter panel that opens in place, a clean table with an action button per row, and numbered pages.

## Requirements

- **R1** Count cards with an icon, the label and the number; the chosen card is outlined and filters the list by state; the counts beyond the first five sit behind an "আরও অবস্থা" card (UX-21).
- **R2** One search box and a "ফিল্টার" button that opens the filters in place, grouped by area and others, with the active filters as removable chips and "সব মুছুন"; on phones the filters stay in a bottom sheet.
- **R3** Table rows with an initial avatar, the name in bold and the type below, the area, the projects, the state as a dot with its word, the category, a dash for an empty value.
- **R4** An action button (⋮) per volunteer row: view profile, review or approve a pending registration, block or unblock, view or end sessions, each only for whom it applies; the server keeps checking (owner, 2026-10-20).
- **R5** Numbered pages with "1–10 দেখানো হচ্ছে · মোট N জন"; any page number inside the counted range can be opened (D-105).
- **R6** The beneficiary tab uses the same layout (owner, 2026-10-20).
- **R7** Both languages, English digits, 360 px phones, axe clean, the set's components only.

## Key decisions

- UX-21 (the layout) and D-105 (page numbers through an offset inside the counted range) in `docs/DECISION_LOG.md`.

## Implementation units

### U1. Page numbers in the API
- **Files:** `apps/api/src/core/pagination.ts` (`pageNumberQuery`, `pageOffset`), the volunteer and beneficiary list services and routes, `docs/api/openapi.yaml` (`PageNumber`), `docs/api/API_STANDARDS.md` section 4.
- **Tests:** integration: page 3 equals the rows after the first four; its previous cursor leads back to page 2; page and cursor together, a page past 10,000 rows and page 0 answer 422; the drift test.
- **Status:** done

### U2. The pieces in the component set
- **Files:** `packages/ui` (count cards that filter with a "more" card, the toolbar's filter panel in place with active chips, numbered pages in the table's pager, the status dot of the badge, the row actions always visible).
- **Tests:** component tests with axe in both languages for each piece.
- **Status:** done

### U3. The volunteer tab
- **Files:** `apps/web/src/admin/volunteers/VolunteersPage.tsx`, `volunteers-api.ts`, `admin.css`, the shared `StatisticsBar.tsx` and `use-tab-view.ts`, the message catalogues.
- **Tests:** `volunteers.test.tsx` (cards filter, filter panel and chips, row menu actions by role, page jump), `apps/web/e2e/volunteers.spec.ts`.
- **Status:** done

### U4. The beneficiary tab
- **Files:** `apps/web/src/admin/beneficiaries/BeneficiariesPage.tsx` and its API client.
- **Tests:** `beneficiaries.test.tsx`, `apps/web/e2e/beneficiaries.spec.ts`.
- **Status:** todo

### U5. Documents and the final run
- **Files:** `docs/ui/SCREENS.md`, `docs/ui/DESIGN_SYSTEM.md`, `docs/STATUS.md`.
- **Status:** todo

## Checkpoints

One review after U2 (the set), one after U4 (the pages), each with the scripted checks.
