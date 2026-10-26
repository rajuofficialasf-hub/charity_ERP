---
title: The Media Team module (T2.8b)
type: feat
status: in-progress
source: brainstorm
date: 2026-10-26
doc_review: 2026-10-26
---

# The Media Team module (T2.8b)

## Goal
A PM or an RPM can refer an approved application, whose beneficiary has given media consent, to the Media Team. The Media Director or Assistant Director accepts the referral and runs it as a work, step by step, with members, a script and publications. A published work then shows on the beneficiary's 360° profile and in every member's portfolio. Throughout, the team never changes application or beneficiary data and never sees NID, ratings, categories or donor data.

## Problem
D-101 (2026-10-18) replaced the earlier media design: the team no longer picks beneficiaries from the nationwide list, and work starts only with a referral. The roles and permission names have been in `permissions.yaml` since Phase 1. The old `media_subjects` and `media_stories` tables are empty and unused, and `media_consents` has a table but no API or screen. The Media Team's home is still the Phase 1 placeholder (SCR-019). The owner moved this task ahead of T2.7 and T2.8 (D-134).

## Requirements

### Media consent (on the beneficiary profile)
- **R1** An official with `beneficiary.consent.record` records a beneficiary's media consent on the 360° profile:
  - given or not given;
  - the allowed channels, from the editable consent-channel list: website, Facebook, print, video, donor report;
  - the date;
  - who recorded it, filled by the system;
  - an optional signed form or photo.
  Every change is audited (BD-38, O-17, BR-022).
- **R2** Consent can be withdrawn in whole or for some channels. From then on, no new publication is allowed on a withdrawn channel. A work already published there gets a warning, "সম্মতি ফেরত নেওয়া হয়েছে, পোস্ট সরিয়ে নিন", and the Media Director is notified. A member marks the publication "সরানো হয়েছে" once the post is taken down. Owner decision 2026-10-26.
- **R3** Anyone with `beneficiary.consent.view` sees the consent status and channels, including the Media Team.

### Referral and decision
- **R4** A PM (own program) or an RPM (own region) refers an approved application to the Media Team. The referral carries:
  - a priority (high, normal, low);
  - a note;
  - an optional story or initial text, written at referral time (owner decision 2026-10-26).

  The referral is refused when the beneficiary has no recorded media consent (BR-264). Only an application that is approved, or past approval (in implementation, completed or closed), may be referred; a draft, pending, rejected or withdrawn one may not.
- **R5** An application has at most one open referral. A referral that was sent back or rejected can be corrected and sent again.
- **R6** The Media Director or the Media Assistant Director decides on a referral:
  - accept;
  - send back for review, with a comment;
  - reject, with a reason.

  Each decision is audited and kept in the referral's history.
- **R7** The application shows the media state as its own badge beside the application. A media decision or stage never changes the application's workflow state (BR-266).
- **R8** On a referred application, the team sees only these fields (BR-265):
  - the beneficiary's name and father's or husband's name;
  - age, mobile number and full address;
  - occupation and monthly income;
  - program, project and year;
  - the official's comment and the referral's story.

  Of the official section it sees only the comment, never the scores. The team no longer opens applications at all: it reads an application only through its referral's work page (owner decision 2026-10-26). The beneficiary tab keeps BR-253. NID, ratings, categories and donor data never reach the team, in screens or exports.

### The work
- **R9** Accepting a referral creates its work. A work exists only through an accepted referral, so nothing enters production without the director's acceptance (BR-267).
- **R10** A work moves through stages from the editable stage list: accepted, planning and assignment, script, shooting preparation, shooting done, editing, internal review, ready to publish, published, done. It also has the special states in review, cancelled and on hold. The stages the rules need are fixed system entries: accepted, in review, ready to publish, published, done, cancelled, on hold. Every stage change is audited and kept in the work's history.
  The stage rules (owner decision 2026-10-26):
  - The team moves a work forward or back to any active ordinary stage, and every move is logged.
  - "accepted" is set only by accepting the referral.
  - Moving to "ready to publish" notifies the Media Director for the final review.
  - At "ready to publish" the director either approves the final review or sends the work back with a comment, which sets "in review"; from "in review" the team moves it to an ordinary stage again.
  - After the approval, the first publication marked published sets the work to "published" by itself; no person sets "published".
  - Only the director or the assistant director sets "done" (after "published"), "on hold" (and back to the stage before it) or "cancelled" (final).
- **R11** A director or assistant director adds members to a work. Each member has one or more production roles from the editable list: Production Manager, Director, Scriptwriter, Cinematographer, Video Editor, Production Assistant. Members see and work on only the works assigned to them, in the list, the counts and the work page alike (`media.work.view`, `media.work.manage` and `story.manage` at ASSIGNED; owner decision 2026-10-26). Everyone may see a member's portfolio of published works.
- **R12** A work has an optional script with these parts:
  - summary;
  - interview questions;
  - scenes;
  - voice-over;
  - notes.

  The script's state is draft, in review or final.
- **R13** A work has a content type: video, photo or both. Photo files are never stored or shown for media content (D-101 (7)).
- **R14** A work is published on one or more platforms from the editable platform list:
  - As-Sunnah Foundation Facebook;
  - Ahmadullah Facebook;
  - As-Sunnah Foundation YouTube;
  - Ahmadullah YouTube.

  Each publication has a state (waiting, published, taken down), a date, a link and a note. Each platform maps to one consent channel: Facebook pages to `facebook`, YouTube channels to `video`. A publication is refused while the beneficiary has no consent for that channel.
- **R15** A work moves to "published" only after the final review (`media.publication.review`, the director by default).
- **R16** Every work has comments and a history of decisions, stage changes, member changes, publications and notes, with who and when. Each is audited.

### Screens
- **R17** The Media Team home (SCR-019) is for the Media Director, the Media Assistant Director and members. It shows:
  - the counts of D-101, by program and overall, each defined as:
    - referrals: every referral;
    - new: referrals waiting for a decision;
    - in review: works "in review" and referrals sent back;
    - in progress: works at "accepted", "planning and assignment", "script" or "internal review";
    - waiting for shooting: works at "shooting preparation";
    - in editing: works at "shooting done" or "editing";
    - published: works at "ready to publish" or "published";
    - done: works at "done";
    - rejected: rejected referrals;
    - a stage added in settings counts under "in progress";
  - "needs your attention": new referrals to decide, works in review, works ready to publish;
  - the works list: beneficiary, program, team, stage, last update, priority and decision, with filters.
  It works at 360 px.
- **R18** The work page (SCR-108) shows the referral, the beneficiary's allowed details (R8), the decision, the stage, the members and their roles, the script, the content type, the publications, the comments and the history. Each action appears only to whoever holds its permission.
- **R19** Each media member has a profile with:
  - contact details, designation and skills;
  - counts of their works;
  - a portfolio of the published works they took part in, with their production roles.
  A work with several members appears on each member's profile.
- **R20** The beneficiary's 360° profile has a media section. It shows the consent (R1–R3), and for each published or done work: the title, program, date, links by platform, content type, summary, state, and the members with their roles.
- **R21** Video links open on YouTube or Facebook; there is no embedded player.
  - A YouTube link shows YouTube's own thumbnail image, taken from the link; the browser loads it from YouTube.
  - A Facebook link shows a card with the platform's icon, the title and the date.
  Owner decision 2026-10-26.
- **R22** The referral action ("মিডিয়া টিমে পাঠান") sits on the application's office page for a PM or RPM with `media.referral.create`. The referrer sees the media badge and the decision on their own referrals (`media.work.view` PROGRAM/REGION).

### Settings, notifications and access
- **R23** Three lists are reference lists in admin settings under `settings.manage`, each edit audited (BR-268):
  - the media stages;
  - the production roles;
  - the publication platforms, each with its consent channel.
  The fixed system stages cannot be removed.
- **R24** In-app notices at five moments (owner decision 2026-10-26):
  - a new referral, to the Media Director and the Assistant Director;
  - a decision (accepted, sent back, rejected), to the referrer;
  - added to a work, to that member;
  - waiting for the final review, to the Media Director;
  - published, to the referrer.
  Consent withdrawn on a published work (R2) also notifies the Media Director. Email follows the existing staff-digest rules.
- **R25** The Media Team cannot change project, application or beneficiary data. Volunteers and the Finance Team reach no media screen or route. The authorization matrix covers every new endpoint.
- **R26** The old `media_subjects` and `media_stories` tables are replaced by:
  - media referrals;
  - works;
  - work members;
  - publications;
  - comments and history.
  This is done in one reversible migration with a hand-written `down.sql`.

## Scope
- **In:**
  - media consent on the profile;
  - referral and decision;
  - works with stages, members, script, content type, publications, final review, comments and history;
  - the three reference lists;
  - the Media Team home, the work page, member profiles with portfolio, and the media section of the 360° profile;
  - the five notices;
  - the migration;
  - two clickable HTML mockups first;
  - API, OpenAPI, the authorization matrix, tests and documents.
- **Out (not now):**
  - storing or showing photo or video files for media content;
  - an embedded video player;
  - posting to Facebook or YouTube from the app, or reading their statistics;
  - exporting media lists (T2.8 adds them through the export service);
  - offline media work (T2.7);
  - donor reports.

## Key decisions
- **A mockup first:** clickable HTML mockups of the Media Team home and the work page, built on the brand tokens like `docs/ui/mockups/`, come before any code. Code starts only after the owner approves them (owner, 2026-10-26). Governs R17, R18.
- **Consent withdrawal:** it blocks new publications on the withdrawn channels and puts a take-down warning on published ones, with a notice to the director; nothing is deleted (owner, 2026-10-26). Governs R2, R14.
- **Video thumbnails:** a YouTube link uses YouTube's own thumbnail; other links show an icon card. No media files are kept (owner, 2026-10-26). Governs R21.
- **Notices:** in the app at five moments (owner, 2026-10-26). Governs R24.
- **The story:** it is an optional field the referrer writes on the referral; the official's comment on the application is shown beside it (owner, 2026-10-26). Governs R4, R8.
- **From D-101 (approved 2026-10-18), not reopened:**
  - entry only by referral;
  - two director roles;
  - the data a referred application opens;
  - the application's workflow left alone;
  - editable stages, roles and platforms;
  - the script states;
  - platforms mapped to consent channels;
  - portfolio and profile display;
  - the director's final review.
- **Order:** this task comes before T2.7 and T2.8 (D-134).
- **Applications only through referrals:** the media roles lose `application.view` and `application.official_section`; they read an application only through a referral's work (owner, 2026-10-26, applying D-101 (3)). Governs R8, R25.
- **Members see only their own works:** the director and the assistant director see every work, and a member sees the works they are on; portfolios are open to all (owner, 2026-10-26). Governs R11, R17.
- **Stages move forward and back with a few rules:** see R10 (owner, 2026-10-26). Governs R10, R15.

## Success criteria
- Each of the following is shown by an integration test:
  - a referral without consent is refused;
  - a PM or RPM outside their program or region cannot refer or see the referral;
  - a decision never moves the application's workflow state;
  - a publication without consent for its channel is refused;
  - no work is published before the final review.
- The authorization matrix test shows:
  - the Media Team cannot write application or beneficiary data;
  - volunteers and the Finance Team are refused on every media route.
- The Playwright journey passes 3 of 3 with `--repeat-each 3 --workers 1`: the RPM refers, the director accepts, a member moves the stages, the director reviews, the work is published and appears on the beneficiary's profile and the member's portfolio. A volunteer and the Finance Team are refused.

## Technical decisions
- **Stack profile unchanged** (ST-40, ST-43): Express 5 with `defineRoute`, Prisma 7 with a hand-written `down.sql`, React with `packages/ui`, and pg-boss notifications. No new piece is needed. YouTube thumbnails are plain `<img>` loads in the browser, with no server request (NE-SEC-08 does not apply). The web CSP's `img-src` gains only `https://i.ytimg.com`.
- **Links and thumbnails** (RE-SEC-02):
  - A publication link is parsed with `new URL`. It must be `https:` with no user info and no port. Its hostname must equal the platform's host or end with `.` plus it (`www.`, `m.`): `facebook.com`, `fb.watch`, `youtube.com`, `youtu.be`.
  - The YouTube id must match `^[A-Za-z0-9_-]{11}$`; the thumbnail URL is built from it alone, never taken from input.
  - The `<img>` carries `referrerpolicy="no-referrer"`, so YouTube learns only that an image was loaded, not which profile showed it.
- **One referral row per application**: `unique(application_id)`.
  - Its state cycles `pending → accepted | sent_back | rejected`, and `sent_back | rejected → pending` when it is sent again.
  - Accepting creates the one work (`unique(referral_id)`).
  - Every step writes a `media_events` history row and an audit entry in the same transaction (DB-TX-01).
  - This follows the state-column pattern of field unlocks (`apps/api/src/applications/unlocks.ts`) and change requests (`services/change-requests.ts`), not the application workflow engine, so the application's state cannot move (BR-266).
  - The work's writes use If-Match/ETag through `assertIfMatch`, as in `services/project-setup.ts`.
- **Consent records:** each recording inserts a new `media_consents` row and the latest is the current one. A whole withdrawal sets `granted = false` and `revoked_at`; a partial one is a new row with fewer channels. The ETag is the current row's id. A merge moves the rows with the beneficiary.
- **Consent at publication:** the consent check runs on every move of a publication into `published` and at the final review, in the same transaction, after `SELECT … FOR UPDATE` on the beneficiary's current consent row. A withdrawal racing a publish therefore waits for it or refuses it.
- **The evidence file:** only holders of `beneficiary.consent.record` in scope may download it (`files/records.ts` ownership check, the T2.1 limits: a photo or PDF up to the document size). The media roles see the status and the channels only.
- **What the notices carry:** the work's number, the program and the project, never the beneficiary's name, mobile or address. The audit entries and logs never carry the story text or the contact details.
- **Tables:**
  - The script is a JSONB column on the work, checked by a zod schema in `packages/shared/src/jsonb/`, with a separate `script_state` column.
  - Members: `media_work_members (work_id, user_id, roles text[])`, unique per work and user.
  - Publications: `media_publications`, with a `consent_withdrawn_at` warning column and the states `waiting`, `published`, `taken_down`.
  - Comments: `media_comments`. History: `media_events`.
- **Reference lists gain two columns**, so the three new lists fit the existing editor (BR-268):
  - `is_system boolean default false`: a system entry cannot be deactivated or deleted.
  - `attributes jsonb default '{}'`: a `media_platform` row holds `{ consent_channel }`, checked by a trigger against the `consent_channel` list, like `check_consent_channels` in the init migration.

  The lists `media_stage`, `media_role` and `media_platform` are seeded in `apps/api/seed/sets/base/reference-lists.ts`.
- **Dropping the old tables** (DB-MIG-03, DB-MIG-05):
  - `media_subjects` and `media_stories` are dropped in the same migration that creates the new tables. They are empty on every database: no service writes them, and only the merge's table list names them. Expand–contract has nothing to move.
  - `down.sql` drops the new tables and columns and recreates both old tables empty, exactly as `20261011000000_init` made them. It refuses while media rows exist.
- **The official section for the Media Team** (BR-265, D-101 (3)):
  - The three media roles leave `application.official_section` in `permissions.yaml`. Today they read every official-only answer and score nationwide, which D-101 withdrew.
  - On a referred application, the work's read returns the `official_comment` answer only, picked by its library key on the server.
  - The media roles also leave `application.view` (owner, 2026-10-26): they open no application, and the work read is their only window on one.
  - This applies an approved decision; it is recorded under D-136 with this task's owner answers.
- **The beneficiary details of a referral** (BR-265): they are composed on the server in the work read, for callers with `media.work.view` on that work (the director and the assistant director GLOBAL, a member ASSIGNED, a referrer PROGRAM or REGION). They are never returned by opening the beneficiary or the application. BR-253 stays the mask everywhere else.
- **Notices:**
  - Six new keys in `notifications/catalogue.ts`: the five of R24 and the consent-withdrawn notice of R2.
  - They are emitted from a new `MediaEvents` class modelled on `notifications/project-events.ts`, with recipients by permission holder (`recipients.ts`).
  - The templates come through `notifications:sync`.
- **Tests per layer** (TS-10…TS-13):
  - unit: the pure rules in `@css/shared/media`;
  - integration: every endpoint in `apps/api/test/integration/`, with its refusal cases and the another-user case;
  - component: the screens as MSW component tests with axe;
  - e2e: one Playwright journey;
  - the authorization matrix regenerated with `authz:matrix`.

## Implementation units

### U1. Clickable mockups of the Media Team home and the work page
- **Goal:** the owner approves how the two main screens look and read before any code is written.
- **Requirements:** R17, R18 (and the labels R19–R22 reuse)
- **Files:** `docs/ui/mockups/15-media-home.html` (new), `docs/ui/mockups/16-media-work.html` (new), `docs/ui/mockups/index.html` (links), `docs/ui/mockups/README.md`
- **Approach:** follow `docs/ui/mockups/13b-form-builder-v2.html`: the brand tokens from `tokens.css` and `components.css`, Bangla copy written with `ae-bangla-copy`, preview frames at 360, 768 and 1280 px, and fake data only.
  - **Home:** needs-attention, counts by program, the works list with filters.
  - **Work page:** the referral and the beneficiary details, the decision, a stage stepper, members with roles, the script, the content type, publications with their consent state and a YouTube thumbnail or icon card, comments and history.
  - **Dialogs:** the referral dialog on an application and the consent dialog on a profile.
- **Tests:** none (a static mockup). The owner reviews it in the `mockups` preview of `.claude/launch.json`.
- **Done when:** the owner says the mockups are approved; their labels feed the e2e lines of U15.
- **Depends on:** none
- **Size:** M
- **Risk area:** none
- **Status:** in progress (built, waiting for the owner's approval)

### U2. Decisions, rules and the media field class
- **Goal:** the documents record what this task decides before code depends on it.
- **Requirements:** R2, R4, R8, R21, R24
- **Files:**
  - `docs/DECISION_LOG.md`: D-136 (the owner's four answers of 2026-10-26, the official-section correction, the reference-list columns).
  - `docs/BUSINESS_RULES.md`: BR-282 consent withdrawal, BR-283 one open referral per application, BR-284 the referral's story, BR-285 links and thumbnails, BR-286 the media notices.
  - `docs/security/permissions.yaml`: the media roles leave `application.view` and `application.official_section`; `media.work.view` for `media_team` becomes ASSIGNED.
  - `docs/security/SECURITY_POLICY.md`: the web CSP's `img-src` gains `https://i.ytimg.com` (the policy is documented there; the web serves no CSP of its own yet).
  - `docs/security/RBAC.md` §5.2.
  - `docs/architecture/NOTIFICATIONS.md`: six media rows.
- **Approach:** like D-133 and BR-273…280 in the T2.4d plan. `pnpm docs:check` validates permissions.yaml.
- **Tests:**
  - unit: `apps/api/src/access/field-mask.spec.ts`. A media role no longer sees an `application.official_section` field; a PM still does.
  - unit: `apps/api/src/access/registry.spec.ts` (the registry loads the changed YAML).
  - existing: covered by `field-mask.spec.ts`; its media_team case is updated, not duplicated.
- **Done when:** `pnpm docs:check` passes and the field-mask spec shows the media roles masked.
- **Depends on:** none
- **Size:** S
- **Risk area:** auth
- **Status:** todo

### U3. Migration: media tables, reference-list columns, the three lists
- **Goal:** the data model of D-101 exists and the old media tables are gone, reversibly.
- **Requirements:** R10, R11, R14, R16, R23, R26
- **Files:**
  - `apps/api/prisma/schema.prisma`
  - `apps/api/prisma/migrations/<timestamp>_media_team/{migration,down}.sql`
  - `apps/api/seed/sets/base/reference-lists.ts`
  - `apps/api/src/services/beneficiary-merges.ts`: the media tables that move with a merge.
  - `apps/web/src/admin/beneficiaries/duplicates/MergeDialog.tsx`
  - `apps/api/test/integration/{seed,constraints}.test.ts`
  - `docs/database/{ERD.md,DATABASE_SCHEMA.md,erd.mermaid}`, `docs/MODULE_CATALOG.md`
- **Approach:** follow `20261026120000_number_table` (T2.4d) for the hand-written CHECK lists and a down.sql that refuses while data exists.
  - **New tables:**
    - `media_referrals`: application, beneficiary, project, referrer, priority, note, story, state, decided by and at, decision comment; unique application.
    - `media_works`: unique referral, title (from the referral, editable by the directors), stage code, content type, script jsonb, script state, final review by and at.
    - `media_work_members`.
    - `media_publications`: platform code, state, date, link, note, `consent_withdrawn_at`.
    - `media_comments`.
    - `media_events`: work or referral, kind, from, to, comment, actor, at.
  - Each table gets FKs and indexes (DB-MIG-07) and audit columns.
  - **Triggers:** a stage, role or platform code must be an active list code; a platform's `attributes.consent_channel` must be a consent-channel code.
  - The merge: the `media_subjects` entries and their conflict SQL leave `beneficiary-merges.ts`, `media_referrals.beneficiary_id` follows the merge like `applications.beneficiary_id`, and `media_consents` rows move with the beneficiary.
  - The relation fields of the two old models leave `User`, `Project`, `Beneficiary` and `ReferenceList` in `schema.prisma`.
  - **New pattern:** `reference_lists.is_system` and `attributes` have no example yet.
- **Tests:**
  - integration (constraints):
    - a referral per application is unique;
    - an unknown stage, role or platform code is refused;
    - a platform without a valid consent channel is refused;
    - a system list entry cannot be deactivated (trigger);
    - the migration back refuses while a media row exists.
  - existing: `seed.test.ts` (table list, list counts) updated. `beneficiary-merges.test.ts` covers the merge's table list; characterize the media referral move first.
- **Done when:** `pnpm db:migrate` applies and down.sql reverts it on a scratch database; the seed shows the three lists.
- **Depends on:** U2
- **Size:** L
- **Risk area:** migration
- **Status:** todo

### U4. The shared media rules
- **Goal:** one pure module says what a referral and a work may do next.
- **Requirements:** R5, R9, R10, R14, R15, R21
- **Files:** `packages/shared/src/media/{index,rules,requests,links}.ts` (new) with `*.test.ts`, `packages/shared/src/jsonb/media-script.ts` (new), `packages/shared/package.json` (export `./media`)
- **Approach:** like `@css/shared/workflow` and `@css/shared/projects/rules.ts`: pure functions and zod request schemas, no I/O. It holds:
  - the referral transitions;
  - the fixed system stages;
  - `mayPublish(stage, reviewed)`;
  - `channelOf(platform)`;
  - `consentAllows(consent, channel)`;
  - `parsePlatformLink(platform, url)`, giving the host check and the YouTube id;
  - `nextStages(current, role)`: the stage rules of R10 as one table;
  - the request schemas.
- **Tests:**
  - unit:
    - each referral transition, allowed and refused; sending again only from sent back or rejected;
    - no publish before the final review;
    - consent with and without the channel, and after withdrawal;
    - link parsing: `youtu.be/ID`, `youtube.com/watch?v=ID`, `youtube.com/shorts/ID` and a Facebook link;
    - links refused: the wrong platform, an `http:` link, a `javascript:` link, `facebook.com.evil.com`, `evilfacebook.com`, `https://youtube.com@evil.com/`, a port, and a YouTube id of the wrong shape;
    - the stage rules: forward and back among ordinary stages; "accepted" only by acceptance; "published" never set by hand; "done", "on hold" and "cancelled" only for the directors; "in review" only from "ready to publish";
    - the script schema rejects unknown keys.
- **Done when:** `@css/shared/media` passes its tests and is exported.
- **Depends on:** U2
- **Size:** M
- **Risk area:** none
- **Status:** todo

### U5. Media consent API
- **Goal:** officials record, change and withdraw consent; the profile reads it.
- **Requirements:** R1, R2, R3
- **Files:**
  - `apps/api/src/services/beneficiary-consent.ts` (new)
  - `apps/api/src/routes/beneficiaries.ts`
  - `apps/api/src/notifications/media-events.ts` (new): the consent-withdrawn notice.
  - `apps/api/src/notifications/catalogue.ts`: all six media keys and their templates are added here, so `notifications:sync` holds them before U6 and U7 emit them.
  - `docs/api/openapi.yaml`: the existing `beneficiaries.consent.*` contract, completed.
  - `apps/api/test/integration/beneficiary-consent.test.ts` (new)
- **Approach:** follow `services/beneficiary-contact.ts`:
  - If-Match and the change log;
  - `requireAccess` with `beneficiary.consent.record` on the beneficiary's scope;
  - an audit `media_consent` with old and new;
  - the optional evidence file through the T2.1 upload record link (`files/records.ts`).

  A withdrawal (granted false, or a channel removed) sets `consent_withdrawn_at` on that beneficiary's published publications of the affected channels and notifies the Media Director.
- **Tests:**
  - integration:
    - a PM in program, an RPM in region and a Project Executive record consent with channels; it is audited;
    - an RPM of another region gets 404; a volunteer gets 403;
    - an unknown channel gets 422; a stale If-Match gets 412;
    - the media roles read consent but cannot record it;
    - withdrawing `video` flags a published YouTube publication and notifies the director, and leaves a Facebook one alone;
    - each change inserts a row and the read gives the latest;
    - the evidence file downloads for a PM in program and is refused (404) for the media roles.
- **Done when:** the routes pass, drift and contract coverage included.
- **Depends on:** U3, U4
- **Size:** M
- **Risk area:** personal data
- **Status:** todo

### U6. Referral and decision API, and the media badge on the application
- **Goal:** PMs and RPMs refer, directors decide, and the application shows its media state but never moves.
- **Requirements:** R4, R5, R6, R7, R9, R22, R24 (the referral and decision notices)
- **Files:**
  - `apps/api/src/services/media-referrals.ts` (new)
  - `apps/api/src/routes/media.ts` (new; registered in `container.ts` and `app.ts`)
  - `apps/api/src/applications/{service,view}.ts`: the record's `media` field and the action `media.refer`.
  - `apps/api/src/notifications/media-events.ts`
  - `docs/api/openapi.yaml` (tag `media`)
  - `apps/api/test/integration/media-referrals.test.ts` (new)
- **Approach:**
  - **Routes:**
    - `POST /applications/{id}/media-referral`: create or send again;
    - `GET /media-referrals`: the decider's queue;
    - `POST /media-referrals/{id}/decision`: accept, send back with a comment, or reject with a reason. Accepting creates the work in the same transaction.
  - **Scope** through `AccessService.findProject` and the application's area, as in `applications/unlocks.ts`.
  - **The record's field** is additive, as `decisionHints` was in T2.6.
  - **Notice recipients** by permission holder (the `recipients.ts` permission rule).
- **Tests:**
  - integration:
    - an RPM refers an approved application of the region with priority, note and story; the directors are notified;
    - refused cases:
      - a beneficiary without consent: 409 `media.consent_missing`;
      - a submitted application: 409;
      - an RPM of another region or a PM of another program: 404;
      - a volunteer and the Finance Team: 403;
      - a second open referral: 409;
    - each decision is audited and kept in history, and the referrer is notified;
    - sending back without a comment or rejecting without a reason: 422;
    - a sent-back referral is corrected and sent again;
    - the assistant director decides too; a media member cannot decide (403);
    - the application's state and its workflow transitions are unchanged after every decision;
    - the application record shows `media.state` to its referrer and to the directors;
    - the media roles get 404 on `GET /applications/{id}` and an empty list on `GET /projects/{id}/applications`, referred or not;
    - a referral of an application in implementation is accepted; one of a rejected application gets 409.
  - existing: the record read is covered by `apps/api/test/integration/{applications,application-cycle}.test.ts`. Add the `media` field to their expectations; no new read test.
- **Done when:** the referral routes and the record field pass, drift and contract coverage included; `authz:matrix` regenerated.
- **Depends on:** U3, U4
- **Size:** L
- **Risk area:** auth
- **Status:** todo

### U7. The work API
- **Goal:** a director runs a work from acceptance to published; members work only on their own works.
- **Requirements:** R8, R10, R11, R12, R13, R14, R15, R16, R24 (the member, review and published notices)
- **Files:** `apps/api/src/services/media-works.ts` (new), `apps/api/src/access/scope.ts` and its spec (ASSIGNED resolved from the work's member rows), `apps/api/src/routes/media.ts`, `apps/api/src/notifications/media-events.ts`, `docs/api/openapi.yaml`, `apps/api/test/integration/media-works.test.ts` (new)
- **Approach:**
  - **Routes:**
    - `GET /media-works/{id}`: the referral, the BR-265 beneficiary details composed here, the official comment, the stage, members, script, publications, comments and history;
    - `PATCH /media-works/{id}`: stage, content type and script, with If-Match;
    - `PUT /media-works/{id}/members`;
    - `POST /media-works/{id}/publications` and `PATCH /media-publications/{id}`;
    - `POST /media-works/{id}/final-review`;
    - `POST /media-works/{id}/comments`.
  - **Permission per route:**
    - the read: `media.work.view`;
    - stage, content type: `media.work.manage`; the script: `story.manage`;
    - members: `media.work.manage` held at GLOBAL only, so a member can never add or remove anyone;
    - publications: `media.work.manage`, with the work found through the publication before the scope check;
    - the final review: `media.publication.review`;
    - comments: `media.work.view` on the work.
  - **Scope:** ASSIGNED is resolved from the work's member rows in `access/scope.ts` (today `case 'ASSIGNED'` resolves nothing). New pattern: no entity resolves ASSIGNED yet. `media.work.view` is PROGRAM or REGION for referrers, through the referral's project.
  - The rules come from `@css/shared/media`.
- **Tests:**
  - integration:
    - the director moves the stages; each move is audited and in the history;
    - a member moves the stage of a work they are on, and gets 404 on another;
    - a member edits the script with If-Match; a stale one gets 412;
    - a publication with a Facebook link on a YouTube platform: 422;
    - a publication without consent for its channel: 409 `media.consent_missing`; consent withdrawn, then a waiting publication patched to published: 409;
    - another work's member gets 404 on every route (stage, script, publication by its id, comments, read); a member gets 403 on the members route;
    - "published" before the final review: 409;
    - only the director gives the final review; the assistant director gets 403 by default;
    - notices: published reaches the referrer, a member added is notified, ready to publish reaches the director;
    - the read shows exactly the BR-265 fields and never NID, ratings, categories or scores;
    - refused: a referrer of another region (404), a volunteer and the Finance Team (403);
    - no write here changes an application or beneficiary row (rows checked before and after).
- **Done when:** the work routes pass with drift and coverage; the matrix is regenerated.
- **Depends on:** U6
- **Size:** L
- **Risk area:** auth
- **Status:** todo

### U8. The reads: home, works list, member profile, the profile's media section, attention
- **Goal:** the screens have their data, each limited to what the caller may see.
- **Requirements:** R17, R19, R20, R24 (attention), R25
- **Files:** `apps/api/src/services/media-home.ts` (new), `apps/api/src/services/beneficiaries.ts` (the media section), `apps/api/src/services/attention.ts` and `@css/shared` `ATTENTION_ROUTES`, `apps/api/src/routes/media.ts`, `docs/api/openapi.yaml`, `apps/api/test/integration/media-reads.test.ts` (new)
- **Approach:**
  - **Routes:**
    - `GET /media/summary`: counts by program and overall;
    - `GET /media-works`: the list, with filters on program, stage, priority, decision and member, keyset-paged as in `services/volunteer-list.ts`;
    - `GET /media/members/{userId}`: 404 unless the user holds a media role; it returns only name, designation, mobile, email, skills where the official's registration has them, counts, and the portfolio by production role. Callers: the media roles and the referrers.
  - **The profile's `media` section** joins the sections of `beneficiaries.ts`: the consent and the published or done works.
  - **Attention items:**
    - new referrals, for the deciders;
    - works in review and works ready to publish, for the director;
    - a member's own works on hold.
- **Tests:**
  - integration:
    - counts per program follow the R17 table for the seeded works;
    - a member's list and counts hold only their own works;
    - the list filters and pages;
    - a member's portfolio lists only the published or done works they were on, with their roles; a work with two members appears on both;
    - the profile's media section shows only published or done works, to whoever reads the profile;
    - the attention counts per role;
    - a volunteer and the Finance Team get 403 on every media read;
    - a non-media user's id on the member route gets 404.
  - existing: the profile sections are covered by `apps/api/test/integration/beneficiary-tab.test.ts`, attention by `apps/api/test/integration/attention.test.ts`; extend both.
- **Done when:** the reads pass with drift and coverage.
- **Depends on:** U7
- **Size:** M
- **Risk area:** personal data
- **Status:** todo

### U9. The three lists in admin settings
- **Goal:** an admin edits the stages, production roles and platforms; the system stages stay.
- **Requirements:** R23
- **Files:** `packages/shared/src/settings/index.ts` (`EDITABLE_LISTS` and a schema for a platform's `attributes`) with its test, `apps/api/src/services/reference-lists.ts`, `apps/api/src/routes/settings.ts`, `apps/web/src/admin/settings/ListsPanel.tsx`, i18n `settings.json` bn and en, `apps/api/test/integration/settings.test.ts`, `apps/web/src/admin/settings/settings.test.tsx`
- **Approach:** the editable lists of T1.13 (expense categories, issue types) gain the three keys. A system entry shows locked. A platform row has a consent-channel select.
- **Tests:**
  - integration:
    - add, rename and deactivate a stage, each audited;
    - deactivating a system stage: 409;
    - a platform with an unknown channel: 422;
    - a non-admin: 403.
  - component: the platform row's channel select; no deactivate button on a system stage; axe in bn and en.
  - existing: covered by `apps/api/test/integration/settings.test.ts` and `settings.test.tsx`; extend both.
- **Done when:** the three lists are editable in `/admin/settings`.
- **Depends on:** U3
- **Size:** M
- **Risk area:** none
- **Status:** todo

### U10. The profile's consent and media sections
- **Goal:** officials record consent on the 360° profile, and everyone with the profile sees the published works.
- **Requirements:** R1, R2, R3, R20, R21
- **Files:**
  - `apps/web/src/admin/beneficiaries/BeneficiaryProfilePage.tsx`
  - `ConsentDialog.tsx` (new)
  - `MediaWorksSection.tsx` (new; reused by U14)
  - `apps/web/src/features/media/WorkLinkCard.tsx` (new): the YouTube thumbnail or the icon card.
  - i18n `beneficiaries.json` and a new `media.json`, bn and en
  - `beneficiaries.test.tsx`
- **Approach:** a `ProfileSection` block like the contact section with `ContactDialog`. The thumbnail is `https://i.ytimg.com/vi/<id>/hqdefault.jpg`, built from the parsed id only, with `referrerpolicy="no-referrer"`. **New pattern:** no external image yet.
- **Tests:**
  - component:
    - recording sends the channels and shows "সম্মতি আছে: Facebook, ভিডিও";
    - withdrawing shows the warning on a published work;
    - a YouTube link shows its thumbnail, with the work's title as text; a Facebook link shows the icon card;
    - a reader without `beneficiary.consent.record` sees no record button;
    - axe in bn and en.
- **Done when:** the profile shows both sections at 360 px and on desktop.
- **Depends on:** U5, U8
- **Size:** M
- **Risk area:** none
- **Status:** todo

### U11. The referral on the application page
- **Goal:** a PM or RPM sends an approved application to the Media Team and sees its media badge.
- **Requirements:** R4, R5, R7, R22
- **Files:** `apps/web/src/admin/applications/ApplicationReviewPage.tsx`, `ReferralDialog.tsx` (new), `MediaBadge.tsx` (new), `applications.test.tsx`
- **Approach:** like `DecisionDialog` and `availableActions` of T2.5: the action shows only when the record offers `media.refer`. The badge sits beside the state badge.
- **Tests:**
  - component:
    - the referral sends priority, note and story;
    - a 409 `media.consent_missing` shows "উপকারভোগীর মিডিয়া সম্মতি নেই";
    - the badge reads the media state;
    - a sent-back referral shows its comment and can be sent again;
    - axe.
- **Done when:** the referral works from the office page.
- **Depends on:** U6
- **Size:** S
- **Risk area:** none
- **Status:** todo

### U12. The Media Team home
- **Goal:** directors and members start from their own home, with counts, attention items and the works list.
- **Requirements:** R17, R24
- **Files:**
  - `apps/web/src/features/media/{MediaHomePage,WorksList}.tsx` (new)
  - `apps/web/src/features/home/widgets.ts`: `media_work` becomes the real widget.
  - `apps/web/src/admin/navigation.ts`: the media destinations.
  - `apps/web/src/routes/index.tsx`: a lazy route.
  - i18n `media.json`, `media.test.tsx` (new)
- **Approach:** the approved mockup of U1, on `features/home/MyWorkPage.tsx`, `admin/volunteers` (the list with its filters in the URL, `list-query.ts`) and `StatisticsBar.tsx` for the counts.
- **Tests:**
  - component:
    - the counts by program and overall;
    - the attention items link to the work page;
    - the filters write to the URL;
    - the 360 px layout has no horizontal scroll;
    - axe in bn and en.
- **Done when:** the home replaces the Phase 1 placeholder for the three media roles.
- **Depends on:** U8, U1
- **Size:** M
- **Risk area:** none
- **Status:** todo

### U13. The work page
- **Goal:** everything about one work on one page, each action shown only to who may do it.
- **Requirements:** R6, R8, R10–R16, R18, R21
- **Files:** `apps/web/src/features/media/{WorkPage,StageStepper,MembersEditor,ScriptEditor,PublicationsPanel,WorkHistory}.tsx` (new), `media-api.ts`, i18n `media.json`, `work.test.tsx` (new)
- **Approach:** the approved mockup of U1, reusing:
  - `ApplicationTimeline` for the history;
  - `ConfirmDialog` and `ReasonDialog` for the decisions;
  - `Disclosure` groups as in the form builder's `SettingsPane`;
  - the If-Match pattern of `use-draft-save.ts` for the script.
- **Tests:**
  - component:
    - the director accepts, sends back with a comment, and rejects with a reason;
    - the stage moves list the active stages;
    - a member can hold several roles;
    - the script saves with If-Match and tells of a stale save;
    - a publication refused for consent shows the reason;
    - publish is disabled before the final review;
    - a member sees no decision or final-review buttons;
    - the BR-265 details show, and no NID field exists;
    - axe in bn and en.
- **Done when:** a work can be run end to end on the screen.
- **Depends on:** U7, U1
- **Size:** L
- **Risk area:** none
- **Status:** todo

### U14. The member profile with the portfolio
- **Goal:** each media member has a profile page with their published works.
- **Requirements:** R19, R21
- **Files:** `apps/web/src/features/media/MemberPage.tsx` (new; reuses `MediaWorksSection` and `WorkLinkCard`), the routes, i18n, `member.test.tsx` (new)
- **Approach:** the profile layout of `admin/staff/StaffProfilePage.tsx` (a DescriptionList with icons).
- **Tests:**
  - component: contact, designation and counts; the portfolio by role; a work of two members appears on both pages; axe.
- **Done when:** the page opens from the works list and from the work page's members.
- **Depends on:** U8
- **Size:** S
- **Risk area:** none
- **Status:** todo

### U15. The journey, the sweep and the documents
- **Goal:** the whole flow is proven in a browser, and the documents describe what was built.
- **Requirements:** R25, and the success criteria
- **Files:**
  - `apps/web/e2e/media.spec.ts` (new)
  - `apps/web/e2e/support/media.ts` (new): an approved application through the API, as in `application-rules.spec.ts`.
  - `apps/web/e2e/{a11y,roles}.spec.ts`
  - `docs/security/AUTHORIZATION_MATRIX.md` (regenerated)
  - `docs/ui/SCREENS.md` (SCR-019, SCR-108), `docs/BUSINESS_RULES.md` (register), `docs/testing/{TEST_STRATEGY,DEMO_ACCOUNTS}.md`, `docs/STATUS.md`, `docs/PLAN.md`, the `CLAUDE.md` map
- **Approach:** like `apps/web/e2e/application-rules.spec.ts` (the setup through the API, the journey on the screen) and `form-logic.spec.ts` (an official on desktop, with a phone context where the flow is phone-first).
  - The exact labels come from the approved mockup of U1.
  - The working names below are placeholders until U1 fixes them:
    - "মিডিয়া টিমে পাঠান", "অগ্রাধিকার", "নোট", "গল্প", "পাঠান";
    - "গ্রহণ করুন", "সংশোধনের জন্য ফেরত দিন", "বাতিল করুন";
    - "ধাপ", "সদস্য যোগ করুন", "প্রকাশ যোগ করুন", "চূড়ান্ত পর্যালোচনা";
    - "মিডিয়া সম্মতি".
- **Tests:**
  - e2e (the desktop project, with the director in a phone context at 360 px):
    1. As the Department Head through the API: an active project, an approved application, the RPM's area.
    2. `rpm.dhaka@example.org` opens `/admin/applications/{id}`, tries "মিডিয়া টিমে পাঠান" and reads "উপকারভোগীর মিডিয়া সম্মতি নেই".
    3. The RPM opens the beneficiary's profile, records "মিডিয়া সম্মতি" with Facebook and ভিডিও, then sends the referral with priority "উচ্চ".
    4. `media.director@example.org`, on the phone, opens the home, sees the referral under attention, opens it and presses "গ্রহণ করুন".
    5. The director adds `media@example.org` as Cinematographer and Video Editor.
    6. The member moves the stage to "শুটিং সম্পন্ন", "সম্পাদনা" and then "প্রকাশের জন্য প্রস্তুত".
    7. The director approves the "চূড়ান্ত পর্যালোচনা" and adds a YouTube publication with a link, marked published.
    8. The work shows "প্রকাশিত" by itself, appears on the beneficiary's profile under "মিডিয়া" and on the member's portfolio; the member's home lists only that work.
    9. axe passes in bn and en on the home and the work page.
    10. A volunteer (01700000115) and `finance@example.org` opening `/media` and the work page see the forbidden page.
  - e2e: `a11y.spec.ts` adds the media home, the work page and the member page; `roles.spec.ts` adds the denial of the media routes.
- **Done when:**
  - the journey passes 3 of 3 with `--repeat-each 3 --workers 1`;
  - `pnpm rules:status --phase 2 --report-only` lists BR-264…268 and BR-282…286 as tested;
  - the documents are updated.
- **Depends on:** U10, U11, U12, U13, U14
- **Size:** M
- **Risk area:** none
- **Status:** todo

## Checkpoints
- **Mode:** grouped (one by one 10, grouped 17 with one by one's points added since N is over 4, all at once 0)
- **Signals:** N 15, L 3,000, R 6, Fd 7, C 7, P 3
- **C1** after U1: the owner approves the mockups (asked to see them first)
- **C2** after U2: foundation for U3 and U4, and a permission change
- **C3** after U3: foundation, and a migration
- **C4** after U4: foundation for U5 and U6
- **C5** after U5: personal data (consent)
- **C6** after U6: foundation for U7 and U11, and authorization
- **C7** after U7: foundation for U8 and U13, authorization, and a new pattern (ASSIGNED scope)
- **C8** after U8: foundation for U10, U12 and U14, and personal data
- **C9** after U10: a new pattern (the external thumbnail and the CSP change)
- **C10** after U15: end

## Verification
- `pnpm typecheck`, `pnpm lint` (incl. `pnpm i18n:check`), `pnpm docs:check`
- `pnpm test`; the database project with `npx vitest run --config vitest.db.config.mts --maxWorkers=2` in `apps/api`
- `pnpm db:migrate`, then the migration's down.sql on a scratch database and up again
- `pnpm --filter @css/api contract:coverage`; `pnpm --filter @css/api authz:matrix`
- `pnpm --filter @css/web build` and `pnpm --filter @css/web bundle:report` (the media screens stay in lazy chunks)
- `pnpm e2e`; `cd apps/web && npx playwright test e2e/media.spec.ts --repeat-each 3 --workers 1`
- `pnpm rules:status --phase 2 --report-only`

## Risks and rollback
- **Migration (U3):** `down.sql` drops the media tables and the two reference-list columns, and recreates `media_subjects` and `media_stories` empty, as the init migration made them. It refuses while any media referral exists, so production data is never dropped silently (DB-MIG-05). Going back after real use means exporting the media rows first.
- **The official section (U2, U6):** the media roles lose a read they have had since Phase 1. The authorization matrix and the application read tests show the new boundary. Going back is a few `permissions.yaml` lines, with D-136 updated.
- **The CSP (U10):** only `https://i.ytimg.com` is added to `img-src`. If the owner later wants no external image, `WorkLinkCard` falls back to the icon card.

## Definition of done
- All units are done and their tests pass.
- The verification commands pass.
- `ae-review` has run, with no open P0 or P1.
- Code from abandoned attempts is removed.

## Progress
- **Branch:** `feat/media-team`
- **Updated:** 2026-10-26 15:40
- **Next:** the owner reviews `docs/ui/mockups/15-media-home.html` and `16-media-work.html` (preview `mockups` in `.claude/launch.json`); on approval mark U1 done, take any changed labels into U15's e2e line, then U2
- **Uncommitted:** none
- **Reviewed through:** none
- **Notes:** the owner answered in chat on 2026-10-26: mockups first; consent withdrawal blocks new publications and warns on published ones; YouTube thumbnails with an icon card otherwise; five notices; the story written at referral; the media roles lose application access outside referrals; members see only their own works; stages move forward and back with the R10 rules.
