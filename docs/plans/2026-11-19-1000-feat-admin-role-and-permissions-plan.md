---
title: An Admin role, role changes, and a safer, easier permission panel
type: feat
status: in-progress
source: brainstorm
date: 2026-11-19
doc_review: 2026-11-19
---

# An Admin role, role changes, and a safer, easier permission panel

## Goal
The owner can give anyone the right access and take it back without help from a developer:
- an Admin maintains the whole system and appoints the Department Head;
- an official's role can be changed after it was given;
- the permission panel shows everything that applies to a person, including what was taken away, and gives or lifts it in a few presses;
- nobody can use the panel to raise their own access.

## Problem
The owner asked for a review of the permission and role system on 2026-11-19 ("পারমিশন সিস্টেম ঠিক আছে কিনা … রোল দেওয়ার সিস্টেম ঠিক আছে কিনা। ভবিষ্যতে ঝামেলা হবে কিনা"). The review (three reviewers, each serious finding confirmed in the code) found the base sound: default deny, one catalogue, scopes that follow assignments, every change audited. It also found these gaps:

- **Roles never change.** A role is written at account creation or at a registration's approval (`apps/api/src/services/staff-accounts.ts`, `registrations.ts`) and nowhere else. Nothing ever sets `user_roles.revoked_at`. A promotion, a wrongly approved role and a Monitoring Team member who left cannot be handled. The Main Admin flag has a permission (`system.owner.transfer`) but no route.
- **The panel can raise access.** A panel grant checks only three hard rules (`apps/api/src/services/access.ts`, `refusal`). `permission.panel.manage` can be granted to any official, who can then grant themselves anything. Whoever holds `user.create` or `staff.registration.approve` can create a Monitoring Team account, because only `department_head` is excluded (`registrations.ts`, `NOT_BY_DECISION`).
- **Revokes are hard to work with.**
  - The panel lists grants only; a revoke is not shown and cannot be lifted there.
  - A revoke of one project from a broad grant changes nothing on screen or in the audit diff.
  - A revoke of an area under a broader grant is not enforced.
- **The panel is slow to use.** A scope is typed as an id, one permission is given per form, permissions show as codes, and the rows of different projects look the same.

The owner then decided (in chat, the same day) to add an Admin role above the department and to take the administration away from the Monitoring Team.

## Requirements

### A. The Admin role and the Monitoring Team
- **R1.** A new official role `admin` holds every permission at GLOBAL, including the data of the department (beneficiaries, applications, budgets).
- **R2.** The Main Admin (system owner) is an Admin. That account cannot be blocked, deactivated or changed by anyone, as today's Main Admin cannot. The existing system owner account moves to the `admin` role by a data migration; the Department Head becomes an ordinary, replaceable holder of the `department_head` role.
- **R3.** There may be several Admins. Only an Admin creates another Admin or gives or removes the `admin` role.
- **R4.** Only an Admin appoints or replaces the Department Head.
- **R5.** The Department Head keeps the administration of the department: creating officials' accounts, approving officials' registrations, settings, changing roles (R7), and the permission panel for the ordinary permissions (giving, taking away and lifting them). The Head cannot give or remove the `admin` or `department_head` role, and cannot grant a key permission (R13).
- **R6.** The Monitoring Team keeps oversight and loses administration.
  - It keeps: reading everything, the audit log, the monitoring work, the blocklist, reverting a merge, and approving volunteers' registrations.
  - It loses: managing the permission panel, creating officials' accounts, approving officials' registrations, settings and reference lists, notification texts, the session monitor, and system health.
  - The exact permission-by-permission list is written in the plan and confirmed by the owner before the build.

### B. Role changes
- **R7.** An Admin or the Department Head changes an official's role, with a reason. An official holds one role; the change ends the old role and starts the new one in one step. Nobody changes their own role.
- **R8.** A role change is refused while the official still holds work of the old role (project areas, pending reviews, a program): the handover comes first, as it does before a deactivation.
- **R9.** A role change is audited with the old and new role and the reason. It ends the person's sessions' old permissions at once (permission version), and the person is told by a notice.
- **R10.** Stored project extras and panel overrides that the new role could not have received are ended with the change, never left to become live later.
- **R11.** The Main Admin flag can be handed to another Admin by the Main Admin only, who confirms with their password; another Admin is refused. It is audited (`auth.system_owner_transferred`).
- **R12.** The staff page shows the role change where the official's profile is managed. The owner can see the history of a person's roles.

### C. A panel that cannot raise access
- **R13.** Only an Admin grants the key permissions through the panel. The key permissions are the whole administration list the Monitoring Team loses (R6), the role change among them. The Head and others are refused, and the refusal is audited.
- **R14.** Nobody grants a permission to themselves or ends an override on themselves through the panel.
- **R15.** A role with GLOBAL scope is given and removed only by these people, in account creation, in registration approval and in a role change alike: `admin` and `department_head` by an Admin; `monitoring_team` by an Admin or the Department Head.
- **R16.** A revoke aimed at an Admin or the Department Head is refused when it is written, at every scope. Today a narrow one is stored and ignored.

### D. A panel that is easy to use
- **R17.** A person's page in the panel shows what is given and what is taken away, each with its scope, its project where it has one, its source, who did it, when, and why. Every panel override can be ended there, a revoke included ("lift").
- **R18.** A revoke of one project, program or area from a broader grant is visible on the page and in the audit entry.
- **R19.** The scope is chosen by name (project, program, division, district, upazila, union) from a searchable list, never typed as an id.
- **R20.** Several permissions can be given or taken away in one form, under one reason.
- **R21.** Every permission shows a Bengali and an English name, and a short description beside its code.
- **R22.** A PM or an RPM who may view permissions can load the catalogue the page needs.
- **R23.** The panel works on a computer first (a setup screen) and stays readable on a phone.

### E. Correct enforcement
- **R24.** A revoke of an area under a broader grant (a district inside a region, an area under GLOBAL, PROGRAM or PROJECT) is enforced in every list filter.
- **R25.** A revoke carries no condition; a request with one is refused.
- **R26.** A project extra is accepted only for a permission the target's own role may receive from an RPM. A handover carries extras across only where the receiver's role may hold them.
- **R27.** After a grant, a revoke, a project grant or a role change, the person's cached session facts are cleared after the commit, so no old token is accepted for the cache's lifetime.
- **R28.** The hard rules of the panel live in one place that both the write path and the evaluation use.

## Scope
**In:** the `admin` role and its migration; the Monitoring Team's reduced defaults; role change and the Main Admin handover; the panel's safety rules and its screens; the enforcement fixes above; the documents (constitution §5, RBAC, AUTH, permissions.yaml, the authorization matrix, DEMO_ACCOUNTS, the UAT scripts); the demo seed with an Admin account.

**Out:**
- Changing a volunteer's type (General, Local দায়ী, both) after registration; it stays as it is today.
- Permission bundles or custom roles made by the owner in the app; roles stay defined in `docs/security/permissions.yaml`.
- The GLOBAL-grant password rule (12 characters) already planned in `docs/plans/2026-11-18-1200-fix-open-issues-plan.md`; that plan's panel picker unit is replaced by R17 and R19 here.

## Key decisions
(The owner, in chat on 2026-11-19, in answer to the review and the questions that followed.)
- **Fix everything by a plan:** "পরিকল্পনা করে সব ঠিক করো".
- **A new Admin role:** "একটি নতুন রোল হবে। admin যে পুরো ওয়েবসাইটের সিস্টেম চেঞ্জ department head নিয়োগ। অর্থাৎ পুরো সিস্টেম মেইনটেন্যান্স করবে। আর রোল তিনি ও ডিপার্টমেন্ট হেড বদলাতে পারবেন।"
- **Monitoring Team loses administration:** "অনেক জায়গায় মনিটরিং টিম কে অনেক ক্ষমতা দেওয়া হয়েছে। সেই গুলো বাদ দাও সব ক্ষমতা admin এর"; then the choice "তদারকি থাকবে, প্রশাসন যাবে".
- **Admin sees everything:** "হ্যাঁ, সব কিছু".
- **Administration by both Admin and Head:** "Admin আর Head দুজনই".
- **Several Admins, made by an Admin:** "একাধিক; Admin-ই আরেকজন Admin বানাবেন".
- **One role per official; a change replaces it:** "একটিই; বদল মানে পুরোনোটি গিয়ে নতুনটি".
- **Handover before a role change:** "আগে হ্যান্ডওভার, তারপর বদল".
- **Key permissions granted by the Admin:** "এই গুলো admin করলে ভালো না?"; and the key list is the whole administration list: "প্রশাসনের পুরো তালিকাই চাবি".
- **One Department Head at a time, in two steps:** "আগে পুরোনো Head-এর রোল বদল, তারপর নতুন নিয়োগ".
- **The Monitoring Team role is given by an Admin or the Head:** "Admin আর Head দুজনই".
- **The Monitoring Team's moved list is confirmed** (the list under Technical decisions): "ঠিক আছে".

These change the constitution: `docs/MASTER_PROMPT.md` §5 makes the Department Head the Main Admin and gives the Monitoring Team the Head's access everywhere (BR-184, Q-02). The owner's latest instruction wins (§0); the plan amends §5, records the decision in `docs/DECISION_LOG.md` first, and notes where the blueprint says otherwise.

## Success criteria
- A Department Head changes a Project Executive into an RPM after the handover, and the person's next request works under the new role.
- An Admin changes the old Department Head's role, then appoints the new Head; while a Head is active, a second appointment is refused.
- A Monitoring Team member opens the permission panel and is refused; they still read the audit log and every project.
- An official given `permission.view` cannot grant anything; an official cannot grant to themselves.
- The owner takes one project away from a person's program-wide permission, sees it listed as taken away, and lifts it again from the same page.
- The authorization matrix test passes with the new role and the reduced Monitoring Team column.

## Technical decisions
- **Stack profile:** unchanged, as in `CLAUDE.md` (Express 5 with `defineRoute`, Prisma 7 with hand-written `down.sql`, own authentication of AUTH.md, the asf UI system). No new library.
- **The Monitoring Team stays a GLOBAL role and loses permissions by exclusion.** `docs/security/permissions.yaml` already has `global_roles_excluded` (used by `system.owner.transfer`). The administration permissions get `global_roles_excluded: [monitoring_team]`. Every scope filter, the password rule of global roles and the "reads everything" behaviour stay as they are; only the listed permissions go. Making the role non-global would mean writing explicit defaults for about 140 permissions and touching every `globalScope` reader.
- **The moved list (R6), confirmed by the owner on 2026-11-19.** It is also the key list of R13. Excluded for `monitoring_team`:
  - accounts and sessions: `user.create`, `user.profile.manage`, `user.state.change`, `user.lock.clear`, `session.revoke_user` (also the session monitor), `user.handover`;
  - roles and the panel: `permission.panel.manage`, `user.role.change` (new), `system.owner.transfer` (already excluded today);
  - registrations of officials: `staff.registration.approve`, `staff_edit_request.approve`;
  - the system: `settings.manage`, `holiday.manage`, `provider.settings.manage`, `system.health.view`, `notification.template.manage`, `location.manage`, `i18n.manage`.

  Everything else stays with the Monitoring Team: every read, `permission.view`, `audit.view` and `audit.export`, `monitoring.view`, `alert.settings.manage`, `notification.delivery.view`, the blocklist, the merges and their revert, `registration.approve` (volunteers), `nisab.set` and the business actions it holds today.
- **`admin` is a GLOBAL role with no exclusion.** `department_head` stays GLOBAL and is excluded only from `system.owner.transfer`: that permission's `global_roles_excluded` becomes `[monitoring_team, department_head]` and its default moves from `department_head` to `admin`. The rules "only an Admin gives or removes `admin` and `department_head`" and "only an Admin grants the key permissions" are hard rules in code, not catalogue entries, because they depend on the actor and the target together.
- **One new permission, `user.role.change`** (module M02, not sensitive, default `[]`, so held by `admin` and `department_head` through their GLOBAL role).
- **The hard rules in one module** (`apps/api/src/access/hard-rules.ts`): the key permissions, the roles only an Admin gives, no self-grant, no revoke on an Admin or the Head, no condition on a revoke, owner transfer. `refusal` of `services/access.ts`, `effectiveAccess`, `staff-accounts.ts` and `registrations.ts` call it (R28).
- **A role change reuses the handover gate** of a deactivation (`pendingHandoverItems` of `apps/api/src/handover/providers.ts`, used in `services/users.ts`). An item whose `requiredRole` the new role does not satisfy blocks the change with `handover.items_outstanding`.
- **One Department Head at a time, enforced by the database.** Giving `department_head` is refused (409) while another official holds it; the Admin changes the old Head's role first. A partial unique index on the live `department_head` rows of `user_roles` keeps two concurrent appointments from both landing.
- **Who may change which role (the role-change matrix).** The actor never changes their own role and must reach the target (the `user` scope of the route). To or from `admin` or `department_head`: an Admin only. To or from `monitoring_team`: an Admin or the Head. Between the other official roles: an Admin, the Head, or a holder of `user.role.change` whom an Admin granted it, inside that holder's scope.
- **The owner transfer is the owner's own act.** The service requires the actor to be the current system owner, whatever permission they hold. The password is checked through the login path's throttle and lockout. The permission version of both accounts is bumped, and a refusal is audited.
- **The hard rules run on every element of a request.** A batch grant with one refused permission is refused as a whole: no row is written and one refusal is audited.
- **The system owner moves by a data migration** (every migration has a `down.sql`, per `CLAUDE.md`): the migration inserts the `admin` role row if it is missing, ends the `department_head` role of the owner and gives the owner `admin`. The partial unique index `users_is_system_owner_key` and the trigger `keep_system_owner` stay as they are.
- **Permission names in two languages** live in `permissions.yaml` (`name_bn`, `name_en` per permission) and reach the database through the catalogue sync (`apps/api/src/access/catalogue-sync.ts`, `reference:sync`), as the names of the roles do. The `permissions` table gains the two columns by a migration.
- **The grant request takes several permissions** (`permissions: string[]`, 1 to 20) in one transaction and one audit entry per target; the single `permission` field goes. The web is the only client.
- **The effective-permissions answer gains** `projectId` per grant and an `overrides` list (every live panel row, grants and revokes, with scope, who, when, why and expiry), so the page can show and lift a revoke.

## Implementation units

### U1. The decision and the constitution
- **Goal:** the Admin role, the reduced access of the Monitoring Team and the role change are decided in writing before any code.
- **Requirements:** R1–R16 (as decisions)
- **Files:** `docs/DECISION_LOG.md` (the next free id), `docs/MASTER_PROMPT.md` (§5, a new version line), `docs/BUSINESS_RULES.md` (BR-184 rewritten; new rules for the Admin, the role change, the hard rules of the panel), `docs/security/RBAC.md`, `docs/architecture/AUTH.md` ("Main Admin protection" and the owner transfer)
- **Approach:** as D-162 amended §5 (the Implementer role): the decision row quotes the owner, the constitution gets a version line, and the differing passages of the blueprint are named.
- **Tests:** `pnpm docs:check`.
- **Done when:** the decision row carries the owner's answers of 2026-11-19 and the documents say the same thing.
- **Depends on:** none
- **Size:** S
- **Risk area:** none
- **Status:** done

### U2. The catalogue: the `admin` role, the exclusions, the new permission
- **Goal:** the API knows the `admin` role, the Monitoring Team no longer holds the administration, and every place that names a role in code follows.
- **Requirements:** R1, R5, R6
- **Files:** `docs/security/permissions.yaml`; `apps/api/src/access/{registry,effective,schema,catalogue-sync}.ts`; the role-name sites in `apps/api/src/services/{users,organogram,registrations,sessions,session-monitor,staff-accounts,auth}.ts`, `apps/api/src/notifications/recipients.ts`, `apps/api/src/routes/registrations.ts`; `docs/security/AUTHORIZATION_MATRIX.md` (regenerated); `apps/api/src/access/{effective,registry}.spec.ts`; `apps/api/test/integration/{authorization-matrix,access-effective,sessions-users}.test.ts`; `apps/api/test/integration/support/{auth-app,access-fixtures}.ts`
- **Approach:** add the role and the exclusions in the catalogue as `system.owner.transfer` is excluded today, and exclude `department_head` from that permission too; `admin` joins the roles held to the 12-character password; replace each hard-coded `department_head` check that means "the top of the system" by a named helper (`isTopRole`) in the registry; the operations alerts of `recipients.ts` go to Admins as well.
- **Tests:**
  - unit: `effective.spec.ts` (an Admin holds every permission; the Monitoring Team holds none of the moved list and still holds the kept ones; the Head lacks only the owner transfer).
  - integration: the matrix test with the three columns; a Monitoring Team member is refused 403 on the panel grant, account creation, settings and system health, and still reads the audit log; the refusals of the other roles unchanged.
  - existing: covered by `apps/api/test/integration/authorization-matrix.test.ts` and `apps/api/src/access/effective.spec.ts` (their expectations change).
- **Done when:** `pnpm --filter @css/api authz:matrix` writes the new matrix and the matrix test passes.
- **Depends on:** U1
- **Size:** L
- **Risk area:** auth and permissions
- **Status:** done

### U3. The system owner becomes an Admin (migration, seed, fixtures)
- **Goal:** an existing database and a fresh seed both have an Admin who is the Main Admin.
- **Requirements:** R2
- **Files:** `apps/api/prisma/migrations/<stamp>_admin_role/{migration,down}.sql`; `apps/api/seed/sets/demo/index.ts`, `apps/api/seed/sets/base/access.ts`; `docs/testing/DEMO_ACCOUNTS.md`; `apps/api/test/integration/{migrations,seed,roles}.test.ts`; `apps/api/test/integration/support/auth-app.ts`; `apps/web/e2e/support/admin.ts`
- **Approach:** a data migration as the one that retired the Implementer role: insert the role row if missing, end the Head role of the owner, give `admin`, and add the partial unique index for one live Department Head; `down.sql` reverses all three. The demo seed gains an Admin account as the owner and keeps the Head account as a Head; a database that already has an owner keeps that owner.
- **Tests:**
  - integration: the migration round trip with an owner who is a Head; the seed twice (idempotent, one owner); the demo Admin signs in.
  - existing: covered by `apps/api/test/integration/{migrations,seed}.test.ts`.
- **Done when:** `pnpm db:migrate` on a copy of the current dev database leaves one owner with the `admin` role and no error.
- **Depends on:** U2
- **Size:** M
- **Risk area:** database migration, auth
- **Status:** done

### U4. The role lists of the web app
- **Goal:** the menus, the home and the admin screens show each role what it may now do.
- **Requirements:** R1, R5, R6
- **Files:** `apps/web/src/admin/roles.ts`, `apps/web/src/admin/navigation.ts`, `apps/web/src/features/home/{widgets.ts,HomeWidgets.tsx}`, `apps/web/src/features/account/ChangePasswordView.tsx`, `apps/web/src/admin/staff/{OfficialDialog,OrganogramPage,StaffProfilePage}.tsx`, `apps/web/src/admin/registrations/StaffDecisionDialog.tsx`, their tests (`roles.test.ts`, `navigation.test.ts`, `staff.test.tsx`, `registrations.test.tsx`), `packages/shared/src/i18n/messages/{bn,en}/*.json` (the name of the role where a list is local)
- **Approach:** `admin` joins every admin list of `roles.ts`; the Monitoring Team leaves `PERMISSION_PANEL_ROLES`, `OFFICIAL_ADMIN_ROLES`, `SYSTEM_ADMIN_ROLES` and the settings lists; the role choices offered in the dialogs come from who the caller is (an Admin is offered `admin` and `department_head`; a Head is not).
- **Tests:**
  - unit: `roles.test.ts`, `navigation.test.ts` per role.
  - e2e: `e2e/roles.spec.ts`: a Monitoring Team member sees no "পারমিশন প্যানেল" and no "সেটিংস" item and still opens "অডিট লগ"; an Admin sees all.
  - existing: covered by `apps/web/src/admin/roles.test.ts` and `apps/web/e2e/roles.spec.ts`.
- **Done when:** the menu of each demo role matches the matrix.
- **Depends on:** U2
- **Size:** M
- **Risk area:** none
- **Status:** todo

### U5. The hard rules of the panel and the enforcement fixes
- **Goal:** the panel cannot raise access, and a revoke always does what it says.
- **Requirements:** R13–R16, R24–R28
- **Files:** `apps/api/src/access/hard-rules.ts` (new), `apps/api/src/access/{effective,scope,service}.ts`, `apps/api/src/services/{access,staff-accounts,registrations}.ts`, `apps/api/src/handover/providers.ts`, `apps/api/src/auth/permission-version.service.ts`, `packages/shared/src/access/index.ts`, `docs/api/openapi.yaml` (the refusal rules), `apps/api/test/integration/{access-panel,access-project-grants,access-project-revoke,staff-accounts,staff-registrations}.test.ts`, `apps/api/src/access/{hard-rules,scope}.spec.ts`
- **Approach:** move the three rules of `refusal` into the new module and add: key permissions only from an Admin actor (`key_permission_admin_only`; the key list is the moved list of the Technical decisions), actor is the target (`self_change`), a GLOBAL role given only as R3–R5 say (`role_admin_only`), any revoke on an Admin or the Head (`top_role_protected`), a condition on a revoke (422). `applyInstanceRevokes` keeps `revokedLocationIds` and the area filters exclude them, as `revokedProjectIds` is used today. `setProjectGrants` checks grantability against the own role of the target and reads the granter inside the transaction. The session cache is cleared after the commit.
- **Tests:**
  - unit: each rule of `hard-rules.ts`; every permission the catalogue excludes for the Monitoring Team is on the key list (a new excluded permission fails the test until it is listed); a district revoked under a region, and an area under GLOBAL, in `scope.spec.ts`.
  - integration: a Head grants `permission.panel.manage` or `user.role.change` → 403 with the rule, audited; a Head grants an ordinary permission → 201; an Admin grants a key one → 201; self-grant → 403; a person with `user.create` (granted by an Admin) creates a Monitoring Team account → 403, and the Head creates one → 201; a revoke on the Head → 403; a project extra the role of the target cannot hold → 403; the next request after a grant uses the new version.
  - existing: covered by `apps/api/test/integration/access-panel.test.ts` and `access-project-grants.test.ts`.
- **Done when:** the refused cases answer 403 with their rule and leave an audit entry, and the old cases still pass.
- **Depends on:** U2
- **Size:** L
- **Risk area:** auth and permissions
- **Status:** todo

### U6. The role change and the owner transfer (API)
- **Goal:** an Admin or the Head changes the role of an official after the handover; the Main Admin hands the flag to another Admin.
- **Requirements:** R3, R4, R7–R11, R27
- **Files:** `apps/api/src/services/role-changes.ts` (new), `apps/api/src/routes/users.ts`, `apps/api/src/container.ts`, `apps/api/src/notifications/account-events.ts`, `packages/shared/src/access/index.ts` (request schemas), `docs/api/openapi.yaml`, `apps/api/test/integration/{role-changes,owner-transfer}.test.ts` (new), `apps/web/tests/contract/` (a case per new call)
- **Approach:** `POST /users/{userId}/role` (`user.role.change`, If-Match on the user, body `{ roleKey, reason }`) and `GET /users/{userId}/roles` (the history), written as `changeState` of `services/users.ts`: lock the user, refuse the owner, run the hard rules and the role-change matrix, the handover gate and the one-Head rule, set `revoked_at` on the old role, create the new one, end the project extras and panel overrides the new role cannot hold, audit `user.role_changed`, bump the permission version, notify. `POST /system-owner/transfer` (`system.owner.transfer`, body `{ userId, password }`) moves the flag to another active Admin in one transaction, only when the actor is the current owner, with the password checked under the login throttle; both accounts' permission versions are bumped; audited `auth.system_owner_transferred`.
- **Tests:**
  - integration: PE → RPM after the handover: 200, old role ended, new grants live, the next request with the old token is `auth.token_stale`; with work outstanding → 409 `handover.items_outstanding`; a Head gives `admin` → 403; a Head moves someone off `admin` or `department_head` → 403; a Head gives `monitoring_team` → 200; an actor changes their own role → 403; a scoped holder gives a GLOBAL role → 403; an Admin appoints a Head while one is active → 409, and two concurrent appointments leave one Head; a Monitoring Team member → 403; an RPM of another region → 403; the owner as target → 409; a stale version → 412; the owner transfer by an Admin who is not the owner → 403; with a wrong password → 403 and counted by the lockout; to a non-Admin → 422; done → the flag moved, both versions bumped, audited.
- **Done when:** the cases above pass and the OpenAPI drift test is green.
- **Depends on:** U3, U5
- **Size:** L
- **Risk area:** auth and permissions
- **Status:** todo

### U7. The role change on the staff page
- **Goal:** the owner changes a role from the profile of an official and sees the roles the person has held.
- **Requirements:** R12
- **Files:** `apps/web/src/admin/staff/{StaffProfilePage,RoleChangeDialog,RoleHistory}.tsx` (two new), `apps/web/src/admin/staff/staff-api.ts`, `apps/web/src/api/schemas/`, `packages/shared/src/i18n/messages/{bn,en}/admin.json`, `apps/web/src/admin/staff/staff.test.tsx`, `apps/web/e2e/role-change.spec.ts` (new)
- **Approach:** the dialog as `ReasonDialog` and `OfficialDialog` (react-hook-form on the `Form` of the contract, the role choices from the list of the server filtered as U4); a refusal for outstanding work links to the handover page.
- **Tests:**
  - unit (component): the dialog sends the role and the reason with the version; the handover refusal shows its link; the history lists the roles with dates.
  - e2e: route `/admin/staff/:userId`; the Head opens a Project Executive, presses "রোল বদলান", chooses "রিজিওনাল প্রোগ্রাম ম্যানেজার", writes the reason, presses "রোল বদলান" in the dialog; the page shows "রোল বদলানো হয়েছে।" and the history "প্রজেক্ট এক্সিকিউটিভ" then "রিজিওনাল প্রোগ্রাম ম্যানেজার"; the next page of the changed person shows the menu of an RPM.
- **Done when:** the journey passes at 1280 px and the page reads at 360 px.
- **Depends on:** U6
- **Size:** M
- **Risk area:** none
- **Status:** todo

### U8. What a person holds, with names (API)
- **Goal:** the API tells the page everything given and taken away, and every permission has a Bengali and an English name.
- **Requirements:** R17, R18, R20, R21, R22
- **Files:** `docs/security/permissions.yaml` (`name_bn`, `name_en` for 160 permissions), `apps/api/prisma/migrations/<stamp>_permission_names/{migration,down}.sql`, `apps/api/prisma/schema.prisma`, `apps/api/src/access/{registry,schema,catalogue-sync}.ts`, `apps/api/src/services/access.ts`, `apps/api/src/routes/access.ts`, `packages/shared/src/access/index.ts`, `docs/api/openapi.yaml`, `scripts/check-docs.mjs` (a name in both languages is required), `apps/api/test/integration/{access-panel,access-effective}.test.ts`
- **Approach:** the names travel as the names of the roles do today (catalogue → sync → table → `GET /permissions`); the Bengali names written with the ae-bangla-copy skill. `grantsOf` returns `projectId` and the instance revokes; `effective()` adds the `overrides` list; the audit `old`/`new` include the revokes. `POST /permission-grants` takes `permissions[]`. The two catalogue routes answer any holder of `permission.view`.
- **Tests:**
  - unit: the docs check fails on a permission without a Bengali name.
  - integration: a project revoked from a program-wide grant appears in `overrides` and in the audit diff; three permissions granted in one request make three rows and one audit entry; a batch of 20 with one key permission from the Head, with the actor as target, or with a revoke on an Admin is refused whole (403, no row, one refusal audited); a PM loads the catalogue; an RPM does not read a person outside the region (404).
  - existing: covered by `apps/api/test/integration/access-panel.test.ts`.
- **Done when:** the drift test and the contract coverage pass with the new shapes.
- **Depends on:** U2
- **Size:** L
- **Risk area:** auth and permissions, database migration
- **Status:** todo

### U9. The permission panel screens
- **Goal:** the owner gives, takes away and lifts permissions in a few presses, choosing everything by name.
- **Requirements:** R17–R21, R23
- **Files:** `apps/web/src/admin/permissions/{PermissionsPage,EffectivePermissions,GrantDialog,RevokeDialog,ScopePicker,OverridesList}.tsx` (two new), `apps/web/src/admin/permissions/permissions-api.ts`, `apps/web/src/api/schemas/`, `packages/shared/src/i18n/messages/{bn,en}/admin.json`, `apps/web/src/admin/permissions/permissions.test.tsx`, `apps/web/e2e/admin-permissions.spec.ts`
- **Approach:** the scope by name as `ProjectPicker` (`apps/web/src/admin/projects/ProjectPicker.tsx`), the program list and `AddressFields` already choose them; several permissions with the multiple `Combobox` of the contract; the page in two lists, "যা দেওয়া আছে" and "যা তুলে নেওয়া আছে", each override with "তুলে নিন" through the existing `RevokeDialog`.
- **Tests:**
  - unit (component): the dialog sends several permissions with a project chosen by name; a revoke shows under "যা তুলে নেওয়া আছে" with who, when and why, and "তুলে নিন" ends it; a refusal shows the rule of the server in words.
  - e2e: route `/admin/permissions`; the Admin finds an RPM by name, presses "অনুমতি দিন", chooses "প্রত্যাহার", the permission by its Bengali name, the scope "প্রকল্প" and the project by name, writes a reason, saves; the page lists it under "যা তুলে নেওয়া আছে"; "তুলে নিন" with a reason removes it.
  - existing: covered by `apps/web/src/admin/permissions/permissions.test.tsx` and `apps/web/e2e/admin-permissions.spec.ts`.
- **Done when:** the journey passes on the desktop project and the page reads at 360 px without a sideways scroll.
- **Depends on:** U5, U8
- **Size:** L
- **Risk area:** none
- **Status:** todo

### U10. Documents, UAT and the sweep
- **Goal:** the documents, the UAT scripts and the whole test suite match the new roles.
- **Requirements:** all
- **Files:** `docs/ui/SCREENS.md`, `docs/security/RBAC.md`, `docs/testing/uat/PHASE_1_UAT_BN.md` (a scene for the Admin, the role change and the panel), `docs/testing/DEMO_ACCOUNTS.md`, `docs/STATUS.md`, `CLAUDE.md` (the repository map lines of the access services), `docs/plans/2026-11-18-1200-fix-open-issues-plan.md` (its panel unit marked moved here), `apps/web/e2e/{a11y,screens}.spec.ts`
- **Approach:** as the UAT refresh of PR #68.
- **Tests:** the full run of **Verification**.
- **Done when:** every command of **Verification** passes.
- **Depends on:** U4, U6, U7, U8, U9
- **Size:** M
- **Risk area:** none
- **Status:** todo

## Checkpoints
- **Mode:** grouped, six checkpoints (scores: one by one 7, grouped 7, all at once 1; the plan has more than four units, so the one-by-one score counts for grouped: 14)
- **Signals:** N 10, L 2,650, R 5, Fd 2, C 5, P 0
- **C1** after U2: foundation for U3, U4, U5 and U8, and it changes who holds what
- **C2** after U3: a data migration that moves the system owner
- **C3** after U5 (reviews U4 and U5): the hard rules, foundation for U6 and U9
- **C4** after U6: the role change and the owner transfer
- **C5** after U8 (reviews U7 and U8): a migration and the new answer shapes
- **C6** after U10 (reviews U9 and U10): end; the whole branch through `ae-check` and the full run

## Verification
- `pnpm lint`, `pnpm typecheck`, `pnpm docs:check`
- `pnpm test`
- `pnpm --filter @css/api authz:matrix`, then the matrix test
- `pnpm --filter @css/api contract:coverage`
- `CONTRACT_API_URL=http://127.0.0.1:4100 pnpm --filter @css/web test:contract` (with the E2E API running)
- `pnpm e2e` (the changed specs also with `--repeat-each 3 --workers 1`)
- `pnpm --filter @css/web build`, then `pnpm --filter @css/web bundle:report`

## Risks and rollback
- **The Monitoring Team loses access the day this ships.** Rollback: the exclusions are catalogue lines; removing them and running `reference:sync` gives the access back. The owner confirmed the moved list on 2026-11-19.
- **The owner migration.** `down.sql` gives the owner the Head role back and ends `admin`. It is tested as a round trip. A database whose owner was changed by hand after the migration is reversed by the role change, not by `down.sql`.
- **A department without a Head** between two appointments: allowed, since an Admin exists and holds the same access.
- **Stale tokens:** every role change bumps the permission version and clears the session cache after the commit.
- **Size:** this is the largest change since the RBAC task; it ships as one pull request after six checkpoints, or as two (U1–U6, then U7–U10) if the first half is wanted sooner.

## Definition of done
- All units done and their tests pass
- Verification commands pass
- `ae-review` has run at every checkpoint, with no open P0 or P1
- Code from abandoned attempts is removed

## Progress
- **Branch:** `feat/admin-role-and-permissions`
- **Updated:** 2026-11-19
- **Next:** U4: the role lists of the web app, starting with `apps/web/src/admin/roles.test.ts`
- **Reviewed through:** C2 at 9e008e10
- **Uncommitted:** none
- **Notes:** the owner asked for two pull requests in spirit (U1 to U6 first, then the screens); the decision is D-187 (D-186 belongs to PR #72). A separate plan will follow for who sees which volunteers and beneficiaries (areas on an official's profile, the chain Executive, RPM, PM); it is not part of this plan and comes between the two pull requests.
