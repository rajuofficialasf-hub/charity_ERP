---
title: The message catalogue in two parts, so the sign-in page loads only its own texts
type: refactor
status: in-progress
source: plan
date: 2026-11-14
---

# The message catalogue in two parts, so the sign-in page loads only its own texts

## Goal

The sign-in page loads with the texts it needs and no more, so the first route has room under its 400 KB budget for the texts the next features add, while every other page still shows every text in both languages, online and offline.

## Problem

The first route was 399.1 KB gzip of 400 KB (D-154) on 2026-11-14, because the whole Bengali catalogue (about 320 KB of JSON in 17 namespaces) loads before the sign-in page renders. The next units of D-172 and D-171 add texts, and the owner's rule is that size never cuts a feature.

## Requirements

- **R1** Before the first render the app loads only the start part of the device language's catalogue: the namespaces the sign-in page, its frame, the language switch, the route error and the update notice use.
- **R2** Every other page (each lazy route) renders only once the rest of the catalogue of the shown language is loaded; no page ever shows a key or an empty text because a part is missing.
- **R3** A language switch shows the new language once its start part and, if the rest was loaded for the old language, its rest are loaded.
- **R4** An installed app opens and switches language offline as today (both parts are in the precache).
- **R5** The server, the tests, the typed keys and the catalogue check keep the whole catalogue; adding a namespace means naming it in the start part or not, and a test fails when a namespace is in neither or in both.
- **R6** The first route's size is measured and recorded; it falls well below the budget.

## Scope

- In: the shared package's catalogue entries; the web's catalogue loader, the locale provider and the route table's lazy routes; the builder's preview, which loads a catalogue; the tests; the documents.
- Out: any change of a text or a key; one part per screen area; the English catalogue's content.

## Key decisions

- **Two parts, not one per area** (D-173): every lazy route waits for the same rest part, so no page has to name its namespaces and none can miss one.

## Technical decisions

- **The parts are named in the shared package**: `START_NAMESPACES` beside `NAMESPACES` in `packages/shared/src/i18n/catalogue.ts`, and four entries `@css/shared/i18n/bn-start`, `bn-rest`, `en-start`, `en-rest` (the package's `exports`, as `@css/shared/i18n/bn` is declared today), each building its object from the JSON files of its namespaces. `@css/shared/i18n/bn` and `en` stay (whole catalogue) for the server and the tests. Which namespaces are in the start part is decided by reading what the eager route uses: `apps/web/src/routes/index.tsx` (the sign-in page is the only eager route), `features/auth/LoginPage`, `LoginForm`, `components/AuthShell`, `TopBar`, `LanguageSwitch`, `RouteError`, `components/shell/UpdateReady` and whatever the providers in `app.tsx` render before a route (the offline and sync providers' notices); expected `auth`, `common`, `ui`, `errors`, `codes`, `nav` and any namespace those files name.
- **The web loader** (`apps/web/src/i18n/locale.ts`): `loadMessages(locale)` keeps its contract (it answers once the start part is in; `main.tsx` and `LocaleProvider` stay as they are), a new `loadRest(locale)` loads the rest part once, and the messages handed to use-intl are the merge of what is loaded for that language. A failed load is tried again as today.
- **The gate is in the route table**: one helper wraps every `lazy` of `apps/web/src/routes/index.tsx` so it awaits the route's own module and `loadRest(readLocale())` together (`Promise.all`), so the rest downloads in parallel with the page's code; the provider re-renders when the rest arrives. The eager sign-in route does not wait.
- **The language switch**: `LocaleProvider` loads the new language's start part, and its rest part too when the rest of the shown language is loaded, before it switches.
- **The builder's preview** (`apps/web/src/admin/forms/PreviewPane.tsx`) loads both parts of the other language through the loader.
- **Offline**: the Serwist precache already holds every JavaScript chunk of the build; a test of `sw.ts`'s precache list or the shell E2E proves the rest part is in it.
- **Typed keys** (`apps/web/src/i18n/types.d.ts`) keep the whole catalogue's type.

## Implementation units

### U1. The catalogue in two parts, loaded when needed

- **Goal:** the sign-in page loads the start part only; every other page waits for the rest.
- **Requirements:** R1 to R6
- **Files:** `packages/shared/src/i18n/{catalogue.ts,catalogue-bn.ts,catalogue-en.ts}`, new `packages/shared/src/i18n/{bn-start,bn-rest,en-start,en-rest}.ts`, `packages/shared/package.json` (exports), `packages/shared/src/i18n/*.test.ts`, `apps/web/src/i18n/{locale.ts,LocaleProvider.tsx}` and their tests, `apps/web/src/routes/index.tsx`, `apps/web/src/admin/forms/PreviewPane.tsx`, `apps/web/test/` (the providers of the component tests prime the whole catalogue as today), `apps/web/scripts/bundle-report.mjs` (if it names the catalogue chunk), `docs/ui/I18N.md`, `docs/testing/PERFORMANCE.md`, `CLAUDE.md` (the map's `i18n/` and `@css/shared/i18n` clauses)
- **Approach:** today's split of the two languages (`catalogue-bn.ts`, `catalogue-en.ts`, the `bn`/`en` entries and `loadMessages`) is the example to extend.
- **Tests:**
  - unit: the start and rest namespaces together are exactly `NAMESPACES`, with none twice; each entry's object has exactly its namespaces; the loader answers the start part, then the merge after `loadRest`, loads each part once, and tries a failed part again.
  - component: the provider shows the sign-in page's texts with only the start part loaded; a lazy page renders after the rest arrives and never shows a key; a language switch after the rest was loaded shows the new language's rest texts.
  - e2e: none new; `auth.spec.ts`, `shell.spec.ts` (the installed app offline, the language switch), `home.spec.ts`, `a11y.spec.ts` and `screens.spec.ts` keep passing, which covers every page with both parts.
  - existing: covered by `apps/web/src/i18n/LocaleProvider.test.tsx` and `locale.test.ts`; updated.
- **Done when:** the bundle report names a first route well under 400 KB, and the whole E2E suite passes.
- **Depends on:** none
- **Size:** M
- **Risk area:** none
- **Status:** done

## Checkpoints

- **Mode:** all at once (one by one 0, grouped 0, all at once 13)
- **Signals:** N 1, L 150, R 0, Fd 0, C 1, P 0
- **C1** after U1: end

## Verification

`pnpm lint`, `pnpm typecheck`, `pnpm docs:check`, `pnpm test`, `pnpm build` and `pnpm --filter @css/web bundle:report` (record the number), `pnpm e2e`.

## Risks and rollback

- A page that renders before the rest arrives would show keys; the gate is one helper on every lazy route, and the E2E sweeps of every screen in both languages (`a11y.spec.ts`, `screens.spec.ts`) would show it. Rolling back is reverting the commit; no data or contract changes.

## Definition of done

- All units done and their tests pass
- Verification commands pass
- `ae-review` has run, with no open P0 or P1
- Code from abandoned attempts is removed

## Progress

- **Branch:** `refactor/catalogue-by-area`
- **Updated:** 2026-11-14 12:45
- **Next:** C1: review, then the pull request
- **Reviewed through:** none
- **Uncommitted:** none
- **Notes:** U1: the start part is `auth`, `common`, `errors`, `notifications`, `registration` and `ui`, found by following the static imports of `main.tsx` and the sign-in form's lazy chunk (80 files) and reading every `useTranslations`/`useMessages` in them: `auth` (the sign-in page and its form), `common` (the sign-in frame's system name, the language switch, the route error, `RequireAuth`'s loading state), `errors` (the sign-in form's `useSchemaResolver` asks for the namespace), `notifications` (the top bar's notification bell calls `useTranslations('notifications')` on the sign-in page too, even with nobody signed in, and use-intl reports a missing namespace at the hook), `registration` (two keys under the sign-in form: the registration link and its intro) and `ui` (the asf words `AppProviders` hands to the UI provider around every page). Not in it, unlike the plan's expectation: `nav` (only the lazy app shell uses it), `codes` (an empty `{}` that no code reads) and `sync` (the update notice is rendered by the lazy app shell only; the offline provider renders no text). `NAMESPACES` listed 15 of the 17 namespaces (`media` and `notifications` were missing); nothing but the package's index read it (`check-i18n.mjs` reads the JSON files itself), so it is now complete, and `REST_NAMESPACES` is its complement. The whole catalogues are built from the parts (`{ ...bnStart, ...bnRest }`), so each namespace is imported once per language. Decided here, not in the plan: (1) `withRest` re-checks the shown language after its wait and loads that language's rest too when it differs (the router asks for its first page before the first render, so the device language and the provider's language can differ); (2) the provider loads the catalogue of the language it renders (`qps` renders bn), where it loaded `wanted` before, which in development with `qps` and an English default loaded the wrong one; (3) the gallery's `React.lazy` goes through `withRest` too; (4) `loadMessages` resolves with the start part (typed `StartMessages`), and `loadCatalogue` answers a whole language for the builder's preview. First route 360.1 KB gzip (399.1 KB before), the bn start part 16.5 KB, the bn rest 40.1 KB; the home adds 80.9 KB when not cached (40.9 KB before plus the rest). The precache of the build lists all four parts (`dist/sw.js`); no unit test reads the precache list (it exists only after a build), so the shell E2E (the installed app offline) covers it. Found and left: the sign-in form's lazy chunk shows a skeleton for a moment after the page appears (as before this unit).
