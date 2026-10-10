# ADR-006: Next.js PWA stack (App Router, Serwist, Dexie outbox, Tailwind tokens, next-intl)

Status: approved 2026-10-10 (DECISION_LOG D-052, confirmed by the owner in O-01). Written in task T0.8.

## Context

The constitution §9 approves React (Next.js) as an installable, offline-first PWA with one codebase for desktop and phone. Volunteers work on low-cost Android phones and some iPhones over 2G/3G (NFR-12…19, UX-06); officials use desktop and phone equally (UX-03); setup screens are desktop first (UX-04). Offline capture with a `client_uuid` outbox and a separate photo queue is mandatory (B7, BD-48). The design tokens and fonts come from the website (UX-01, UX-13) and both languages are first-class with English digits (UX-05).

## Decision

- Next.js (App Router) with React and TypeScript in `apps/web`, route groups by audience (SYSTEM_ARCHITECTURE §4.2). Official and management lists may use server components; every volunteer screen is a client component so that it renders from local data when offline.
- Serwist for the service worker: precache of the app shell, fonts and the current form versions of assigned projects; runtime caching of API reads with a network-first strategy and short TTLs; no caching of responses that contain sensitive fields beyond the user's own offline data set.
- Dexie (IndexedDB) for the offline store: the outbox of records with `client_uuid`, `created_at` and `sync_status`; a separate photo queue holding compressed blobs; the offline data set of O-07 (forms, own beneficiaries and applications, syllabus, locations); encrypted at rest with a key derived from the session and wiped on logout or revocation (BR-198).
- Tailwind CSS configured from the tokens in `docs/ui/brand/colors.md` exposed as CSS variables; `packages/ui` holds the base components of constitution §12; UbuntuSans and Bornomala self-hosted and precached.
- next-intl for bn and en with the message catalogue from `packages/shared`; one formatting utility renders every number with English digits (BR-219).
- Data fetching through the REST API only (TanStack Query for caching and retries; react-hook-form with the zod schemas of `packages/shared` for forms), so that validation and business rules are shared with the server.
- Light initial load: the volunteer home route ships at most 250 KB of compressed JavaScript (NFR-15); heavy screens (form builder, dashboards) are code-split and desktop first.

## Alternatives considered

- Vite + React SPA: smaller and simpler for a pure client app, but the constitution already approves Next.js, server rendering helps the official lists, and the PWA tooling is comparable.
- Native Android app (and iOS later): best offline control, but two codebases, app-store distribution and a larger team; rejected by Q-15.
- Workbox directly instead of Serwist: equivalent; Serwist is the maintained Next.js integration.

## Consequences

Positive: one codebase for all audiences; offline behaviour is a first-class part of the architecture; shared schemas prevent client/server drift; installable on Android and iOS with Bangla install guidance.

Negative: iOS Safari limits (storage eviction, no background sync, push only when installed) must be designed around and tested (UX-06); encrypting IndexedDB data adds complexity; Next.js upgrades require care with the service worker; developers must keep volunteer screens free of server-only dependencies.

Follow-ups: T0.12 details the sync protocol; T0.19/T0.19b design system and mockups; T1.4 implements `packages/ui`; T1.5 i18n; T2.7 offline PWA and tests with Playwright offline emulation; T2.10 install guide.

## Related

D-052; BD-48; UX-01…UX-13; BR-194…202, BR-218…223; NFR-12…23; `docs/architecture/OFFLINE_SYNC.md`, `docs/ui/DESIGN_SYSTEM.md`, `docs/ui/I18N.md`.
