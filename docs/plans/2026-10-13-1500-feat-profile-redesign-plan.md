---
title: The own profile by section with one edit mode (T1.9d)
type: feat
status: in-progress
source: plan
date: 2026-10-13
---

# The own profile by section with one edit mode (T1.9d)

## Goal
The own profile (`/account/profile`) is tidy and premium: a header with the own photo, the name and the state; the sections listed beside the details (a row of chips on phones); a click on a section name shows only that section's details; one "সম্পাদনা" button turns the section into an edit mode where the person picks one or more details, types the new values and sends the requests together.

## Problem
Owner message of 2026-10-13 with a reference image (a settings page with an avatar header, soft cards and rounded fields). Today every detail has its own edit button and opens a dialog, and all six sections are stacked on one long page.

## Requirements
- **R1** A header card shows the own photo (a round avatar, an icon when there is none), the display name, the volunteer type and the state (pending, active, blocked, deactivated) as a badge.
- **R2** The sections (personal, contact, address, work, bank, photos) are a navigation: a vertical list from 768 px, a row of chips on phones. Exactly one section's details are shown; the first is open at the start. Each name is a button with `aria-current` on the open one.
- **R3** An active volunteer has one "সম্পাদনা" button in the header of the open section. It starts the edit mode of that section: every changeable detail without an open request gets a checkbox ("change this"); a ticked detail shows its input (the address cascade, the bank fields, a text); the section has one optional reason; "অনুরোধ পাঠান" is disabled until one detail is ticked; "বাতিল" leaves the mode without sending.
- **R4** "অনুরোধ পাঠান" sends one request per ticked detail through the existing `POST /me/change-requests` (the API and the one open request per field of D-085 are unchanged). Details that were sent leave the mode and show their state; a refused one stays ticked with its message; a request that reaches no server says so.
- **R5** A detail with an open request shows its state badge and, as today, the code input (a new mobile or email) or the photo upload (a photo); the verification and the upload work as before. A pending registrant has no edit button and still sees the correction answers above the details. The volunteer type has no checkbox (the Foundation decides it).
- **R6** English digits, the brand tokens only, no explanatory text beyond one short instruction line in the edit mode (UX-17), usable at 360 px, no axe violations in both languages.

## Scope
- In: `apps/web/src/features/account` (the profile view, the section navigation, the header, the edit mode, the styles), the `registration.profile` catalogue keys, the profile tests and the registration e2e spec where it touches the profile, SCREENS.md (SCR-006), STATUS.
- Out: the API, the database, `packages/ui` (the section navigation is a feature component), the corrections flow of a pending registrant (kept as it is), the profile photo upload from the header (the photo section keeps the upload through a request), the admin-side views.

## Key decisions
- The reference image sets the look only; the colours are the brand tokens (the yellow button of the image is not used; DESIGN_BRIEF UX-17, `docs/ui/brand/colors.md`).
- Several details sent together are several requests, so the API and the approver's list stay as they are (D-085); the PWA sends them one after another and reports each.
- The section navigation is a list of buttons (the settings-page pattern), not ARIA tabs: the six items would turn the `Tabs` component into a select on phones (more than five tabs, DESIGN_SYSTEM 5.13).
- The edit mode is per section (one button in the open section), so the long page of six cards is gone and a request never mixes sections.

## Implementation units

### U1. Tests first
- **Files:** `apps/web/src/features/account/profile.test.tsx`
- **Tests:** unit (web, MSW): the header shows the name, the type and the state; the six section names are buttons and only the open one's details are shown; choosing "ব্যাংকের তথ্য" shows the bank details in full with the branch; an active volunteer has one edit button (none for a pending one); the edit mode shows a checkbox per changeable detail and none for the type or a detail with an open request; send is disabled until one detail is ticked; ticking two details of the contact section and sending posts two requests with their values and the one reason; a refused request stays ticked with its message while the other leaves; cancel posts nothing; a new mobile waits for its code and a photo for its upload after sending; the corrections of a pending registrant are unchanged; axe in bn and en.
- **Done when:** the new and changed tests fail for the right reason. **Size:** S · **Risk area:** none · **Status:** done

### U2. The profile screen
- **Files:** `apps/web/src/features/account/{ProfileView.tsx,ProfileNav.tsx,ProfileHeader.tsx,EditSection.tsx,ChangeRequests.tsx,profile.css}`, `packages/shared/src/i18n/messages/{bn,en}/registration.json`
- **Approach:** `ProfileView` keeps the queries and the pending/corrections parts; `ProfileNav` and `ProfileHeader` are new; `EditSection` holds the picked set, the values, the reason and the sequential sends (reuse `ValueEditor`, `cleanValue`, `askEdit`, `RequestState`); the dialog `EditDialog` and its keys go. New keys in both languages (section navigation label, the states, "change this", the short instruction, the partial failure).
- **Done when:** the U1 tests pass, `pnpm lint` and `pnpm typecheck` are clean. **Depends on:** U1 · **Size:** M · **Risk area:** none · **Status:** done

### U3. E2E, documents, status
- **Files:** `apps/web/e2e/registration.spec.ts` (the profile steps of the correction journey), `docs/ui/SCREENS.md`, `docs/STATUS.md`
- **Tests:** e2e: the pending volunteer's correction journey still passes; an approved volunteer opens `/account/profile`, opens the contact section, ticks the WhatsApp number, sends, and sees "অনুমোদনের অপেক্ষায়"; at 360 px the page has no sideways scroll.
- **Done when:** `pnpm test` and `pnpm e2e` pass. **Depends on:** U2 · **Size:** S · **Risk area:** none · **Status:** done

## Checkpoints
- **Mode:** end only (web-only change, no risk area): **C1** after U3 with a review of the whole range.

## Verification
`pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm e2e` (needs `docker compose up -d`), and a look at `/account/profile` in the browser at desktop and 360 px width.

## Risks and rollback
- Several requests are not atomic: a failure in the middle leaves the earlier ones sent; the screen shows which, and the person sends the rest again. Rolling back is a revert of the web commits (no data or API change).
