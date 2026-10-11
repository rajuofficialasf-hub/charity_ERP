# ADR-013: Vite React SPA replaces Next.js (React Router, TanStack Query, use-intl, Serwist)

Status: approved 2026-10-11 (DECISION_LOG D-073, owner instruction in chat). Supersedes ADR-006. Written in task T1.7b.

## Context

The owner decided on 2026-10-11 that the frontend is built in React without Next.js, in line with the organization's engineering standard (ST-01: React 19 + Vite + TypeScript, React Router, TanStack Query). The ERP needs no server rendering: every screen renders from the API or from the device's local data, officials and volunteers are signed in, and offline-first behaviour (ADR-010) lives in the browser anyway. At the time of the decision `apps/web` held the T1.4–T1.7 screens on Next.js 16 (App Router, next-intl, a Serwist route handler, a server action for the language cookie).

## Decision

- `apps/web` is a Vite 8 single-page application in `src/` (React 19, TypeScript, the `@/` alias), built to static files in `dist/`.
- React Router 8 in library mode (`createBrowserRouter`); every route sits under a route error boundary; the dev gallery route exists only in `vite dev` or with `VITE_DEV_GALLERY=1`.
- TanStack Query 5 for server data that is read and cached (lists, profiles); one-shot mutations without cached data (login, password change, reset) call the API client directly.
- The API client of T1.7 is kept (in-memory access token, one shared refresh with the CSRF cookie, local-data wipe on revocation); the organization kit's axios client has no refresh or CSRF handling.
- `use-intl` 4 renders the catalogue of `packages/shared`; the language comes from the browser (cookie `css_locale`, `localStorage`, the account's language after login) and the typed keys from the `AppConfig` augmentation. The API still takes the request language from `Accept-Language`.
- Serwist through `@serwist/vite`: `src/sw.ts` with the precache injection point, served at `/sw.js` (scope `/`), registered in production only; runtime caching and the outbox come with T2.7 as before.
- Document titles and the manifest link come from `index.html` and React 19 `<title>` hoisting; the manifest is generated from the catalogue by a small Vite plugin.
- Same origin as before: Caddy serves `dist/` with the SPA fallback and routes `/api/v1/*` to the API; in development and E2E Vite's dev and preview servers proxy `/api/v1` to the API with `X-Forwarded-For` (D-072).
- `packages/ui` (React Aria, ADR-012), Tailwind 4 and the design tokens are unchanged; the MUI template of the organization's RE-UI rules is not adopted (owner answer, D-073).

## Alternatives considered

- Keep Next.js: approved in D-052, but the owner chose the organization's standard; the server-rendered official lists of ADR-006 were never built, so nothing is lost.
- TanStack Router instead of React Router: equivalent, but the organization's standard and kit use React Router.
- react-intl instead of use-intl: a different message API; use-intl keeps the T1.5 code and typed keys as they are.
- vite-plugin-pwa instead of @serwist/vite: equivalent; Serwist keeps the service worker file of T1.1 and the T2.7 design.

## Consequences

Positive: a static frontend with no Node process to run; one bundler for app, tests and preview; the organization's standard applies to reviews and new developers; smaller runtime than the Next framework.

Negative: no server rendering (page titles and the manifest are produced on the client or at build time); the language of the first paint comes from the browser, not a server cookie; route-level code splitting is explicit (`lazy`) rather than per page.

Follow-ups: T1.7c (backend standard, impact analysis first); T1.15 app shell as React Router layouts; T2.7 offline PWA on the same service worker; T3.0 Caddy configuration for `dist/`.

## Related

D-073, D-067 (amended), D-072; ADR-006 (superseded), ADR-010, ADR-012; `docs/architecture/SYSTEM_ARCHITECTURE.md`, `docs/ui/I18N.md`, `docs/architecture/OFFLINE_SYNC.md`.
