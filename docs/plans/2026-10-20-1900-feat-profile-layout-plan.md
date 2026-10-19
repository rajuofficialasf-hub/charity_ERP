---
title: One profile layout for volunteers, beneficiaries and officials
type: feat
status: in-progress
source: plan
date: 2026-10-20
---

# One profile layout for volunteers, beneficiaries and officials

## Goal

The owner's profile picture (chat, 2026-10-20: a pending volunteer with a green header card, the documents beside it, an action panel, tabs, collapsible sections and a contact card with the registration history) is merged with the current profile pages into one profile layout, used by the volunteer profile, the beneficiary 360° profile and a new official profile page. The owner asked for the best of both ("দুইটি কে একসাথে করে সবচেয়ে ভালো যেটা হয়"), not a copy.

## Requirements

- **R1** A header card: the photo or the initial avatar, the name, the state badge, and chips for the key facts (ID number, mobile, email, date of birth, blood group) with a copy button on each copyable value; a hidden value is not shown in the header (it stays "not shown to you" in its section).
- **R2** The documents beside the header on a desktop (photo, NID front and back for a volunteer), each opening larger in a dialog; only the documents the caller may see.
- **R3** An action panel beside the header on a desktop and under it on a phone: the actions the server allows, each with a written label (no icon-only button), the main one filled.
- **R4** Tabs under the header: তথ্য (the sections), ডকুমেন্ট, and the profile's own further tabs; the tab is kept in the address.
- **R5** Sections as cards with an icon and a title that collapse and open, the values as label and value in two columns on a desktop and one on a phone.
- **R6** A side column on a desktop (under the sections on a phone): a contact card (call, email, WhatsApp, Facebook as links) and the history as a timeline.
- **R7** The volunteer profile: a pending volunteer the caller decides on opens in the same layout with approve, ask for a correction and reject (the registration review's dialogs), the open corrections shown; an active one with block or lift, devices.
- **R8** The beneficiary 360° profile in the same layout with its nine sections; the limited views of the Media and Procurement Teams unchanged.
- **R9** A new official profile page `/admin/staff/:userId` in the same layout from the existing APIs (`GET /users/{userId}`, sessions, effective permissions): identity, place and role, the account, devices; edit, new link and state actions by the existing permissions.
- **R10** Both languages, English digits, 360 px phones, axe clean, the set's components only, brand tokens only.

## Key decisions

- UX-22 in `docs/DECISION_LOG.md`: what is taken from the owner's picture and what is changed, and why.
- Taken: the header card on the brand's soft green, the chips with copy, the documents with zoom, the action panel, the tabs, the collapsible section cards with icons, two-column values, the contact card with call and email buttons, the history timeline, the breadcrumb.
- Changed: the red button gets its label ("ব্লক করুন"), because a button without words fails screen readers; the volunteer's history is "নিবন্ধনের ইতিহাস" (registration), since applications belong to beneficiaries; gender is left out for volunteers (the registration does not collect it); the NID chip and the copy buttons appear only for values the caller sees; Facebook becomes a link only when it is a web address.
- Kept: the current app shell (white sidebar with labels, the app bar); the dark green icon rail and the search box of the picture would change every page and are a separate decision for the owner.
- No API, database or permission change; every action stays checked by the server.

## Implementation units

### U1. The profile pieces in the set
- **Files:** `packages/ui/src/components/Profile/` (new: `ProfileHeader`, `ProfileSection`, `CopyButton`, `InfoGrid`, `ContactList`), `contract.ts` if a template piece is needed, `messages.ts` and `ui.json` (copy, copied, collapse, expand), `index.ts` (the gallery has no list pieces yet, so none is added).
- **Tests:** unit and axe for each piece: the copy button writes to the clipboard and says so, a section collapses with `aria-expanded`, the header shows only the chips given, the grid in one column under 640 px.
- **Depends on:** none · **Size:** M · **Risk area:** none
- **Status:** done

### U2. The volunteer profile
- **Files:** `apps/web/src/admin/volunteers/VolunteerProfilePage.tsx`, `registrations/RegistrationDetail.tsx` (the decision actions reused), i18n `admin.json`.
- **Tests:** `volunteer-profile.test.tsx` updated: header, tabs in the URL, hidden NID never in a chip, actions by flag, the pending layout with approve; e2e `volunteers.spec.ts` and `registration-approval` journeys keep passing.
- **Depends on:** U1 · **Size:** L · **Risk area:** personal data on screen
- **Status:** todo

### U3. The beneficiary profile
- **Files:** `apps/web/src/admin/beneficiaries/BeneficiaryProfilePage.tsx`, i18n.
- **Tests:** `beneficiaries.test.tsx` profile cases updated (every section, the Media Team's sections only); e2e `beneficiaries.spec.ts`.
- **Depends on:** U1 · **Size:** M · **Risk area:** personal data on screen
- **Status:** todo

### U4. The official profile page
- **Files:** `apps/web/src/admin/staff/StaffProfilePage.tsx` (new), `routes/index.tsx`, `StaffPage.tsx` (names link to the profile), `staff-api.ts`, i18n.
- **Tests:** `staff.test.tsx`: the page with the existing APIs, edit and new link by role, a PM or RPM read-only; e2e: the head opens an official from the staff list.
- **Depends on:** U1 · **Size:** M · **Risk area:** none
- **Status:** todo

### U5. Documents and the final run
- **Files:** `docs/ui/SCREENS.md` (SCR-043, SCR-045, SCR-063 and the new official profile), `docs/ui/DESIGN_SYSTEM.md`, `docs/STATUS.md`.
- **Status:** todo

## Checkpoints

One review after U2 (the pieces and the first page), one after U5, each with the scripted checks.

## Verification

`pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm docs:check`, `pnpm --filter @css/web bundle:report`, Playwright `volunteers`, `beneficiaries`, `staff`, `registration` and `a11y` specs; by hand at 1280 and 360 px in both languages.
