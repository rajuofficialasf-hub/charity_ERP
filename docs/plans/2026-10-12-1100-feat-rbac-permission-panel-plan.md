---
title: Roles, permissions, data scopes and the permission panel (T1.8)
type: feat
status: in-progress
source: brainstorm
date: 2026-10-12
doc_review: 2026-10-12
---

# Roles, permissions, data scopes and the permission panel (T1.8)

## Goal
Every API request is allowed or denied by the permission model of `docs/security/RBAC.md` and `docs/security/permissions.yaml` (role defaults, project permission sets, project grants and panel overrides, each at a data scope, default deny), and the Department Head and the Monitoring Team can see and change any user's permissions in a permission panel, with every change audited. An authorization-matrix report shows, for every endpoint and every role, that the server's decision matches the default matrix.

## Problem
Since T1.7 the API runs an interim resolver (O-59 item 3): GLOBAL-scope roles pass every permission, everyone passes `session.revoke_own`, everything else is denied. Scope resolution, project permission sets, the panel and field-level protection do not exist yet. T1.9 to T1.12 (registration, volunteer and beneficiary tabs, programs and projects) add endpoints that need all of these, and BR-180 to BR-193 require them on every endpoint from the start. The design is complete (T0.10, O-26 to O-28); this task builds it.

## Requirements

### A. Permission engine
- **R1** At start the API loads `permissions.yaml`, validates it against a schema and refuses to start when the file is invalid or when a route declares a permission name the file does not contain.
- **R2** A user's effective permissions are the union of four sources, evaluated as RBAC §1 describes: GLOBAL roles (every permission at GLOBAL minus `global_roles_excluded`), the role's default grants, the project permission set and project extras, and panel overrides; a panel revoke beats every grant, and an expired override counts as absent.
- **R3** For a permission and an entity type, the engine resolves the scope instances the user holds (GLOBAL, PROGRAM, PROJECT, REGION, DISTRICT / UPAZILA / UNION, ASSIGNED, SELF) from the assignment tables of RBAC §4, and turns them into a query filter that data access must apply; several scopes add up.
- **R4** A single record outside the caller's scope answers 404, never 403, so its existence is not revealed (RBAC §8.4).
- **R5** Every named condition of `permissions.yaml` (for example `own_region`, `house_construction_only`, `own_created`) is one check in one place; an unknown or failed condition denies.
- **R6** Any change to a user's grants (panel, project grant) bumps the user's permission version, so the user's next request refreshes the token with the new permissions (AUTH.md §9).

### B. Enforcement on every endpoint
- **R7** The access middleware decides every request with the engine (the interim resolver is removed); every route declares its permission and the entity type of its scope, and a route without them cannot be registered (BR-193).
- **R8** The existing rules for blocked, pending and deactivated accounts and the Main Admin's sessions keep working unchanged.

### C. Project permission sets and project grants (volunteers and project staff)
- **R9** Volunteers hold permissions only through the permission set chosen on each project (`application_distribution`, `application_distribution_dawah`, `work_progress`) plus that project's extras; the same person may hold different sets on different projects (RBAC §6, Q-16).
- **R10** `POST /projects/{projectId}/grants` lets an RPM (or anyone holding `project.volunteer_grant.manage` there) grant or remove the "if RPM grants" extras for volunteers and project staff on own projects only, and never a permission the granter does not hold; each change is audited with a reason.

### D. Field-level protection
- **R11** One field mask built from the `sensitive_fields` catalogue removes protected fields (NID numbers and photos, volunteer bank details, ratings, categories and their comments, donor data, official form sections and scores, blocklist reasons, audit detail) from a response for every role that may not see them; fields are removed, not blanked. The same mask is the one exports will use later (T2.8).

### E. Permission panel
- **R12** The contract operations of the `access` tag work: list roles, list permissions, a user's effective permissions with scope and source, grant a permission at a scope instance with a reason and optional expiry, and revoke a grant with a reason.
- **R13** Only the Department Head and the Monitoring Team can change permissions in the panel; PMs and RPMs may view effective permissions within their own scope (`permission.view`).
- **R14** The panel refuses, and audits the attempt: giving `system.owner.transfer` to anyone but the Department Head; removing the GLOBAL scope of the Department Head or the Monitoring Team; granting a sensitive permission to a volunteer role (BR-046, BR-183).
- **R15** Every grant and revoke writes a `permission_change` audit entry with the old and new effective grants, the reason and the actor (BR-180, §13).
- **R16** The permission panel screen (SCR-062) in the admin area lets a Department Head or Monitoring Team member search a user, see the user's roles (read only) and effective permissions grouped by module with scope and source, grant or revoke with scope, reason and optional expiry; in Bengali and English, desktop first with the phone notice (UX-04), accessible (axe clean).

### F. Main Admin protection
- **R17** The Department Head account (system owner) cannot be deleted, deactivated, blocked, locked out or stripped of permissions through any endpoint or the panel (BR-035, AUTH.md §11).

### G. Proof
- **R18** An authorization-matrix test runs every registered endpoint against every role and against an anonymous caller and asserts allow or deny as `permissions.yaml` defines; it writes a readable report (endpoint × role → allow/deny) that the owner reviews at the end of the task.
- **R19** IDOR tests show that RPM, Project Executive, volunteer, team member, Local দায়ী, paid volunteer and Procurement Team cannot read or change another region's or another project's records (404).
- **R20** Field-level tests show every protected field class absent from responses for every role that may not see it, and present for the roles that may.
- **R21** CI fails when an `x-permission` in `docs/api/openapi.yaml`, the permission a route declares, and `permissions.yaml` disagree.

## Scope
- In: R1–R21; the engine is built so that the endpoints of T1.9 to T2.x only declare their permission and scope entity and pass their data access through the scope filter and the field mask.
- Out (not now):
  - Changing a user's roles in the panel (owner answer, 2026-10-12): roles are shown read only; roles are given when a staff registration is approved (T1.9).
  - System-owner transfer (`/system-owner/transfer`), staff handover (`/users/{userId}/handover`) and project staff access (`/projects/{projectId}/staff`): their own tasks (T1.9, T1.11/T1.12); R17 already stops the Main Admin from being removed.
  - Endpoints of volunteers, beneficiaries, programs, projects and applications (T1.9 to T2.x); T1.8 tests scopes on seeded data and on the endpoints that exist.
  - The list of recent permission changes on the panel (owner answer at doc review, 2026-10-12): every change is in the audit log (R15) and is read in the audit viewer of T1.13; no new endpoint now.
  - Exports (T2.8) beyond providing the shared field mask; the project screens that use `POST /projects/{projectId}/grants` (T1.12).

## Key decisions
- **Panel changes permissions only, not roles** (owner answer, 2026-10-12): matches the API contract and RBAC §7; no contract change. Governs R12, R16 and the Scope line.
- **Recent changes are read in the audit viewer, not on the panel** (owner answer at doc review, 2026-10-12): the contract has no such endpoint and adding one is not needed for T1.8. Governs R16.
- **Scope and field protection are structural, not conventions** (owner answers at doc review, 2026-10-12): data access for a scoped entity cannot run without the caller's scope, writes find the record inside the scope first, and the field mask runs automatically on every response. Governs R3, R4, R11.
- **The panel lives in the admin area** (`/admin`, UX-15), visible only to the Department Head and the Monitoring Team inside it. Governs R16.
- **`x-permission` stays hand-written in `openapi.yaml` and is checked, not rewritten**: the drift test already compares the contract with the routes, and `pnpm docs:check` with `permissions.yaml`; R21 makes the three-way comparison part of CI. Automatic rewriting of the contract would hide contract changes from review (constitution §13). Governs R21.
- **Dead permissions are reported, not fatal, until the features exist**: RBAC §2 wants the API to refuse to start when a YAML permission has no endpoint, but most of the 141 permissions belong to later tasks; the matrix report lists them instead, and the check becomes fatal by a later decision. Governs R1, R18.

## Open questions
None block the plan.

<!-- ae-plan adds everything below -->

## Technical decisions
- **Stack profile unchanged** (CLAUDE.md "Stack profile", ST-43): Express 5 + Prisma 7 on PostgreSQL 17, `packages/ui` for the panel; no new stack piece. `js-yaml` moves from a dev dependency to a dependency of `apps/api` because the running API reads `permissions.yaml` (R1).
- **One access module** `apps/api/src/access/` (registry, effective permissions, conditions, scope resolution, field mask), built once in `createContainer` like the other services (ADR-014); `requireAccess` asks it for every request (NE-SEC-03, AU-21) and the interim `PermissionResolver` is deleted. Routes and services never test a role name (BR-193).
- **Where the YAML is read**: the path comes from the config schema (`PERMISSIONS_FILE`, default `docs/security/permissions.yaml` at the repository root; NE-CFG-01); the T3.0 image copies the file. The seed (`apps/api/seed/sets/base/access.ts`) reuses the access module's parser instead of its own.
- **Effective permissions per request**: computed once per request from four sources (RBAC §1) and cached on the request only; permission changes bump `permission_version` and the token goes stale (AUTH.md §9), so no cross-request cache is needed.
- **Scope = query filter + 404, enforced by structure** (NE-SEC-03): `requireAccess` puts a `Scope` handle for the route's permission and entity type on the request; the data-access helpers of every scoped entity (`scopedFind`, `scopedList`, `findInScope`) take that handle as a required argument, so code without the caller's scope does not compile; every update, delete or state change first loads its record with `findInScope`, which answers `permission.not_found` (404) outside the scope (RBAC §8.4). A registry test fails when a route with a non-GLOBAL-only permission names no scoped entity. A route's `scope` field names the entity type (the contract's `x-scope` values: `self`, `user`, `global`, `project`, `program`, `application`, `beneficiary`, `volunteer`, `file`, `system`); an unknown entity type cannot be registered.
- **Conditions** are a table of named functions in `access/conditions.ts`, one per `conditions` key of the YAML; registering fails when a YAML condition has no function, and an unknown or failed condition denies (R5).
- **Field mask by removal, applied automatically** from the `sensitive_fields` catalogue: `maskFields(entityType, record, viewer)` deletes keys the viewer may not see (RBAC §8.6); GLOBAL roles see all; `defineRoute` runs it on every response of a route whose entity type has sensitive classes, after parsing the body through the route's declared response schema (unknown keys stripped, so a new column is never returned by accident); such routes cannot be registered without a response schema; exports call the same function later.
- **Panel refusals and the Main Admin**: one new error code `permission.grant_refused` (403, `params.rule`: `owner_transfer_only_head`, `global_scope_protected`, `sensitive_to_volunteer`, `not_held_by_granter`, `not_rpm_grantable`) added to API_STANDARDS §8 and the error catalogue in bn and en; Main Admin cases keep `user.system_owner_protected` (409). Additive, no existing contract changes.
- **Authorization-matrix report**: generated by the matrix test into `docs/security/AUTHORIZATION_MATRIX.md` (endpoint × role → allow/deny, plus the permissions that no endpoint uses yet); the test fails when the committed report differs from the generated one, like the OpenAPI drift test, so the report the owner reviews is always the current one.
- **Panel scope pickers**: the API accepts every scope type with its `scopeRef` now; the screen offers GLOBAL, SELF and ASSIGNED in T1.8 and gains the program, project and area pickers when their list endpoints exist (T1.10 to T1.12). Read-only for PMs and RPMs stays on the server (R13); the screen is shown to the Department Head and Monitoring Team only.

## Implementation units

### U1. Decisions, access registry and the three-way permission check
- **Goal:** The API loads and validates `permissions.yaml` at start, refuses unknown permission names on routes, and CI fails when routes, `openapi.yaml` and the YAML disagree.
- **Requirements:** R1, R21
- **Files:** `docs/DECISION_LOG.md` (O-61 panel changes permissions only and recent changes go to the T1.13 audit viewer; O-62 structural scope guard and automatic field mask; D-076 x-permission checked not rewritten; D-077 dead permissions reported; D-078 `permission.grant_refused`), `docs/api/API_STANDARDS.md` (§8 code), `packages/shared/src/i18n/messages/{bn,en}/errors.json`, `apps/api/src/access/{schema,registry}.ts`, `apps/api/src/access/registry.spec.ts`, `apps/api/src/config/env.ts` (`PERMISSIONS_FILE`), `apps/api/src/container.ts`, `apps/api/src/openapi/define-route.ts` (known permission and scope entity), `apps/api/seed/sets/base/access.ts` (reuse the parser), `apps/api/test/api/openapi-drift.test.ts` (three-way assertion), `apps/api/package.json` (`js-yaml` to dependencies)
- **Approach:** zod schema of the YAML structure of RBAC §2 (follow `apps/api/src/config/env.ts`); the registry exposes roles, permissions, permission sets (with `extends`), sensitive field classes and conditions; `defineRoute` asks the registry (and the markers of `openapi/drift.ts`) and throws on an unknown name, like its audit check.
- **Tests:**
  - unit: the real YAML loads; a YAML with a duplicate permission, an unknown role in a default, an unknown condition or an unknown scope is refused with the offending name; `application_distribution_dawah` contains the parent set's permissions plus its own.
  - integration (API): registering a route with an unknown permission or an unknown scope entity throws at build time; the drift test fails when a route's permission is missing from `permissions.yaml` (probe router, as the existing drift probes do).
  - existing: covered by `apps/api/test/api/openapi-drift.test.ts`, `apps/api/test/integration/seed.test.ts` (seed still writes the same roles and permissions).
- **Done when:** the API starts with the real file, the seed test and the drift test pass, the decisions are in DECISION_LOG.
- **Depends on:** none · **Size:** M · **Risk area:** auth
- **Status:** todo

### U2. Effective permissions and conditions
- **Goal:** For any user the engine lists the effective grants (permission, scope type, scope ref, condition, source) from the four sources, with revoke overrides winning and expired overrides ignored.
- **Requirements:** R2, R5, R9
- **Files:** `apps/api/src/access/{effective,conditions}.ts`, `apps/api/src/access/effective.spec.ts`, `apps/api/test/integration/access-effective.test.ts`, `apps/api/test/integration/support/access-fixtures.ts` (programs, projects in two divisions, areas, project staff, project volunteers with sets and extras, panel overrides)
- **Approach:** pure merge function over plain rows (unit-tested) plus one loader that reads `user_roles`, `project_staff`, `project_volunteers` + `volunteers`, `user_permissions` in one round trip per table; sources named as the contract's `EffectivePermission.source`.
- **Tests:**
  - unit: GLOBAL role gets every permission at GLOBAL except `system.owner.transfer` for the Monitoring Team; role defaults with conditions; a volunteer with no project gets nothing but its SELF defaults; set `application_distribution` on project A and `work_progress` on project B give different grants per project; an `if_rpm_grants` permission appears only through extras; a panel revoke removes the same permission from every source at that scope; an expired grant is absent.
  - integration: the loader against the fixtures returns the expected grants for an RPM of Dhaka, a Project Executive under that RPM, a volunteer on two projects, a team member (`own_created`) and the Department Head.
- **Done when:** both test files pass.
- **Depends on:** U1 · **Size:** L · **Risk area:** auth
- **Status:** todo

### U3. Scope resolution and enforcement on every endpoint
- **Goal:** `requireAccess` decides every request with the engine, data access applies the scope filter, out-of-scope single records answer 404, and the existing endpoints keep their behaviour for allowed callers.
- **Requirements:** R3, R4, R6, R7, R8
- **Files:** `apps/api/src/access/scope.ts`, `apps/api/src/access/scope.spec.ts`, `apps/api/src/auth/require-access.ts`, `apps/api/src/auth/permission-resolver.ts` (deleted), `apps/api/src/auth/principal.ts` (grants on the principal), `apps/api/src/container.ts`, `apps/api/src/app.ts` (the `requireAccess` dependencies), `apps/api/src/auth/auth.spec.ts` (the resolver tests move to the engine), `apps/api/src/services/{users,sessions}.ts` (scope filter on lists, `findInScope` on single records), `apps/api/src/routes/{users,sessions}.ts` (scope entity), `apps/api/test/integration/{sessions-users,auth}.test.ts`, `apps/api/test/integration/access-scope.test.ts`
- **Approach:** scope instances per entity type from RBAC §4 (PROGRAM via `programs.pm_user_id`, PROJECT via `project_staff`/`project_volunteers`, REGION and areas via `project_areas` and the staff's area, SELF via owner columns; DISTRICT, UPAZILA and UNION come only from panel grants today (no YAML default uses them) and resolve through the grant's `scopeRef` location and `project_areas`); `requireAccess` keeps its order (token → session → version → state) and replaces the resolver call with "has the permission at any scope"; services receive the `Scope` handle and pass it to the scoped helpers (follow the current `UsersService.list` and `SessionsService.target`); `requireAccess` and `findInScope` log a structured `permission_denied` event through pino (user id, permission, entity type, request id; never record contents, NE-LOG-03).
- **Tests:**
  - unit: scope instances for each scope type from fixture rows; the filter for `user` lists only users reachable through the caller's programs or regions; several scopes add up; a registry probe route with a non-GLOBAL-only permission and no scoped entity is refused at build time.
  - integration: a PM sees users of own program in `GET /users` and gets 404 for a user outside it; an RPM revokes a Dhaka volunteer's session and gets 404 for a Rangpur volunteer (`session.revoke_user`, `own_region`); a Project Executive gets 403 on `GET /users`; a revoke override of `permission.view` seeded directly in `user_permissions` (with the version bump) turns a PM's 200 into 403 after the token refresh (`auth.token_stale` first; the panel-driven case is in U5); a state change of an out-of-scope user answers 404 before any write; every 403 and scope 404 emits one `permission_denied` log line (captured log stream); blocked, pending and deactivated behaviour unchanged.
  - existing: covered by `apps/api/test/integration/{auth,password,sessions-users,user-language}.test.ts` and `apps/api/test/api/guards.api.test.ts`; their expectations stay, only the GLOBAL-only assumptions of the interim resolver change.
- **Done when:** the existing auth suites and the new scope tests pass; `grep -rn PermissionResolver apps/api/src` is empty.
- **Depends on:** U2 · **Size:** L · **Risk area:** auth
- **Status:** todo

### U4. Field mask
- **Goal:** One function removes every protected field class from a record for viewers who may not see it, and every response passes through it automatically.
- **Requirements:** R11
- **Files:** `apps/api/src/access/field-mask.ts`, `apps/api/src/access/field-mask.spec.ts`, `apps/api/src/openapi/define-route.ts` (response schema parse and mask before `send`), `apps/api/test/api/guards.api.test.ts` (probe routes)
- **Approach:** the `sensitive_fields` entries map to entity types and keys (`beneficiary.nid` → `nid`, `birthReg`, NID photo file ids; `volunteer.identity` → `nid`, `nidPhotoFileId`; `volunteer.bank` → the four bank keys; `volunteer.rating`, `donor.data`, `application.official_section`, `blocklist.reason`, `audit.detail`); removal returns a new object (no mutation); nested official sections of form answers are filtered by the field's visibility.
- **Tests:**
  - unit: for each class, every role in `visible_to` (and GLOBAL roles) keeps the fields and every other role, including each volunteer role, gets an object without those keys (not `null`, absent); official-only answers vanish from an application for a volunteer and stay for an Executive; a record without the keys passes unchanged.
  - integration (API): a probe route of entity `volunteer` returning NID and bank keys sends them to a GLOBAL caller and omits them for a volunteer caller without the handler doing anything; a key not in the response schema is never sent; registering a `volunteer` route without a response schema throws.
- **Done when:** the spec passes for all eight classes.
- **Depends on:** U1 · **Size:** L · **Risk area:** personal data
- **Status:** todo

### U5. Permission panel API, project grants and Main Admin protection
- **Goal:** The six operations of the `access` tag work with the panel rules, every change is audited with old and new effective grants and bumps the permission version, and the Main Admin cannot be stripped.
- **Requirements:** R10, R12, R13, R14, R15, R17
- **Files:** `packages/shared/src/access/index.ts` (zod request and response schemas matching the contract), `packages/shared/package.json` (export), `apps/api/src/routes/access.ts`, `apps/api/src/services/access.ts`, `apps/api/src/app.ts` (router), `apps/api/test/integration/access-panel.test.ts`, `apps/api/test/integration/access-project-grants.test.ts`
- **Approach:** routes on `defineRoute` like `apps/api/src/routes/users.ts`; writes in one transaction with `AuditWriter.record` (`permission_change`) and `PermissionVersionService.bump` (follow `apps/api/src/services/users.ts` state change); project grants write `project_volunteers.extra_permissions` or `project_staff.extra_permissions`.
- **Tests:**
  - integration: Department Head and Monitoring Team list roles and permissions; effective permissions of a user show sources; grant at GLOBAL with reason and expiry returns 201 and the grant appears; a revoke override hides a role default; revoking the override restores it; each change writes one `permission_change` row with old and new grants and bumps the version (the target's old token gets `auth.token_stale`); a PM gets 403 on grant and 200 on effective permissions of a user in own program, 404 outside; refusals with `permission.grant_refused`: `system.owner.transfer` to the Monitoring Team, revoking the GLOBAL scope of the Monitoring Team, any sensitive permission to a volunteer; each refusal audited; any grant or revoke override that targets the Main Admin answers `user.system_owner_protected` (409) and takes precedence over every other refusal; `scopeRef` must exist and match the scope type (none for GLOBAL and SELF; 422 otherwise); project grants: an RPM grants `application.approve` (if_rpm_grants) to an Executive on own project (200), not on another RPM's project (404), not a permission the RPM lacks at that project's scope or one without `if_rpm_grants` (`not_held_by_granter`, `not_rpm_grantable`), not to a user who is not staff or volunteer on that project (404), and never a sensitive permission to a volunteer even when a fixture YAML marks it `if_rpm_grants` (`sensitive_to_volunteer`; the panel and project grants share one refusal check).
  - existing: none for the access routes (new); Main Admin rules of `apps/api/test/integration/sessions-users.test.ts` stay green.
- **Done when:** both test files pass and the drift test lists the new operations without differences.
- **Depends on:** U3 · **Size:** L · **Risk area:** auth
- **Status:** todo

### U6. Authorization-matrix test and report
- **Goal:** Every registered endpoint is called by every role and by an anonymous caller, the decision is compared with `permissions.yaml`, and the report is generated.
- **Requirements:** R18
- **Files:** `apps/api/test/integration/authorization-matrix.test.ts`, `apps/api/test/integration/support/matrix.ts` (expected decision from the registry), `docs/security/AUTHORIZATION_MATRIX.md` (generated, committed)
- **Approach:** walk `RouteRegistry.list()`; one account per role (all 15) on a cloned database seeded with the base access set; call each operation with nonexistent ids and an empty body and the role's token, so the access layer decides before any handler can change data (TS-14: no order dependence); "allowed" = not 401/403 (404 and 422 count as passing the access layer); the matrix is endpoint × role, the scope dimension is covered by U3 and U7 (recorded in RBAC §2 by U9); expected = public → allowed for everyone, authenticated → allowed for signed-in users, a named permission → allowed when the role holds it at any scope by default; the report table is endpoint × role with ✓/✗ and lists permissions no endpoint uses yet (D-077); the test fails when the committed report differs (follow `apps/api/test/api/openapi-drift.test.ts`).
- **Tests:**
  - integration: the matrix itself (every cell asserted); a probe route declared with a permission no role holds is denied for every role except GLOBAL ones.
- **Done when:** the matrix passes and the committed report is current.
- **Depends on:** U3, U5 · **Size:** M · **Risk area:** none
- **Status:** todo

### U7. IDOR and field-level tests across regions and projects
- **Goal:** Cross-region and cross-project access is refused with 404 for every field role, and protected fields are absent from responses where they must be.
- **Requirements:** R19, R20
- **Files:** `apps/api/test/integration/access-idor.test.ts`, `apps/api/test/integration/support/access-fixtures.ts` (extended)
- **Approach:** fixtures with two divisions, two projects per division, staff and volunteers on each; drive the scope filter through the existing endpoints (`/users`, `/users/{id}`, `/users/{id}/sessions`, `/users/{id}/effective-permissions`) and through the access module directly for the entity types whose endpoints come later (application, beneficiary, volunteer), plus `maskFields` on the user and volunteer views served today.
- **Tests:**
  - integration: RPM, Project Executive, volunteer, team member, Local দায়ী, paid volunteer and Procurement Team each get 404 (endpoints) or an empty filter result (module) for records of the other division and the other project; the same callers get their own records; volunteer responses never contain the keys of `volunteer.identity`, `volunteer.bank`, `volunteer.rating`.
- **Done when:** the file passes.
- **Depends on:** U3, U4 · **Size:** M · **Risk area:** none
- **Status:** todo

### U8. Permission panel screen
- **Goal:** The Department Head and the Monitoring Team manage permissions at `/admin/permissions` in the admin area; nobody else sees it.
- **Requirements:** R16
- **Files:** `apps/web/src/admin/permissions/{PermissionsPage,EffectivePermissions,GrantDialog,RevokeDialog}.tsx`, `apps/web/src/admin/permissions/permissions.test.tsx`, `apps/web/src/admin/{navigation.ts,roles.ts}` (item visible to Head and Monitoring), `apps/web/src/routes/index.tsx` (lazy child route), `packages/shared/src/i18n/messages/{bn,en}/admin.json` (panel texts), `apps/web/e2e/admin-permissions.spec.ts`
- **Approach:** page on `packages/ui` (`Combobox` for the user search over `GET /users?q=`, `Table` grouped by module, `Modal` for grant and revoke, `Select` for scope, `Field` for reason, `DateField` for expiry, `Alert` for results); server data through TanStack Query like `apps/web/src/features/account/SessionsView.tsx`; texts through use-intl.
- **Tests:**
  - unit (RTL, MSW): a Department Head searches a user and sees the effective permissions grouped by module with scope and source; granting sends the request and shows the success alert; a `permission.grant_refused` answer shows its message; a PM does not see the menu item and gets the forbidden screen at `/admin/permissions`; axe in bn and en.
  - e2e (`apps/web/e2e/admin-permissions.spec.ts`; desktop signs in as `head@example.org` and edits `executive@example.org`, mobile signs in as `monitoring@example.org` and edits `daee@example.org`): `/admin` → sidebar item "পারমিশন" → heading "পারমিশন প্যানেল" → search box "ব্যবহারকারী খুঁজুন", type the email, choose the user ("প্রজেক্ট এক্সিকিউটিভ (নমুনা)" / "অফিসিয়াল দায়ী (নমুনা)") → section "কার্যকর পারমিশন" lists rows with source "রোলের ডিফল্ট" → button "পারমিশন দিন" → dialog: combobox "পারমিশন" chooses `permission.view`, select "স্কোপ" chooses "সারা দেশ (GLOBAL)", textbox "কারণ" filled → button "দিন" → alert "পারমিশন দেওয়া হয়েছে" and a row with source "প্যানেল" → its button "প্রত্যাহার" → dialog "কারণ" → button "প্রত্যাহার করুন" → alert "পারমিশন প্রত্যাহার করা হয়েছে"; axe has no violations; on mobile the notice "এই পর্দা বড় স্ক্রিনে ভালো চলে।" is visible; `pm.err@example.org` at `/admin` has no "পারমিশন" item and at `/admin/permissions` sees "এই পাতায় আপনার প্রবেশাধিকার নেই।".
  - existing: `apps/web/src/admin/admin.test.tsx`, `apps/web/e2e/admin.spec.ts` stay green.
- **Done when:** RTL and e2e pass on both projects; `pnpm build` keeps the panel in the admin chunk.
- **Depends on:** U5 · **Size:** L · **Risk area:** none
- **Status:** todo

### U9. Documentation and status
- **Goal:** The documents describe the built access model and the next tasks know how to declare permissions and scopes.
- **Requirements:** R1–R21 (documentation side)
- **Files:** `docs/security/RBAC.md` (§2 loading and the endpoint × role matrix, §8 implementation notes), `docs/architecture/SYSTEM_ARCHITECTURE.md` (§5.1 authorization row, §6 steps 4–8), `CONTRIBUTING.md` ("How to add an endpoint": scope entity, scope filter, `findInScope`, field mask), `docs/BUSINESS_RULES.md` (test status of BR-035, BR-180 to BR-193), `docs/ui/SCREENS.md` (SCR-062 built), `docs/ops/DEPLOYMENT.md` (`PERMISSIONS_FILE`, the image copies the YAML), `CLAUDE.md` (map: `src/access`), `docs/STATUS.md`
- **Approach:** as the T1.6 and T1.7d documentation units.
- **Tests:** existing: `pnpm docs:check`, `pnpm lint` (Prettier).
- **Done when:** the checks pass and STATUS names T1.9 as next.
- **Depends on:** U6, U7, U8 · **Size:** S · **Risk area:** none
- **Status:** todo

## Checkpoints
- **Mode:** grouped (one by one 10, grouped 7 + 10 = 17, all at once 0; one by one's score moves to grouped because N > 4)
- **Signals:** N 9, L 2,500, R 5 (U1, U2, U3, U4, U5), Fd 3 (U1, U3, U5), C 6 (U1 → U2 → U3 → U5 → U6 → U9), P 3 (U2, U3, U4)
- **C1** after U1: foundation (U2, U4 build on the registry) and auth
- **C2** after U2: auth and a new pattern (effective permissions)
- **C3** after U3: foundation for U5–U7, auth, new pattern (scope filters), and the switch of every endpoint
- **C4** after U4: personal data and a new pattern (field mask)
- **C5** after U5: foundation for U6 and U8, auth
- **C6** after U9: end; U6–U8 reviewed here with the documentation, and the whole branch through the scripted checks once

## Verification
- `pnpm typecheck` · `pnpm lint` · `pnpm docs:check`
- `pnpm exec vitest run --project api --project api-db` (needs `docker compose up -d postgres minio mailpit`)
- `pnpm exec vitest run --project web --project shared`
- `pnpm e2e` (all specs, including `admin-permissions.spec.ts`)
- `pnpm build` (admin chunk size)

## Risks and rollback
- **Every endpoint changes its access decision in U3.** The engine denies by default, so a bug tends to refuse rather than allow; the matrix test (U6) and the IDOR tests (U7) are the guard against an over-broad grant. Rollback: revert the U3 commit, which restores the interim resolver; no database change is involved (all tables exist since T1.2).
- **No migration.** If the audit action `permission_change` or the new error code needs a CHECK or catalogue change, it is additive and reverted with its commit.

## Definition of done
- All units done and their tests pass
- Verification commands pass
- `ae-review` has run at every checkpoint, with no open P0 or P1
- The authorization-matrix report is committed and current, for the owner's review
- Code from abandoned attempts is removed

## Progress
- **Branch:** `feat/rbac-permission-panel`
- **Updated:** 2026-10-12 11:30
- **Next:** U1: decisions in DECISION_LOG, then the failing registry tests (`apps/api/src/access/registry.spec.ts`)
- **Reviewed through:** none yet
- **Uncommitted:** none
- **Notes:** none yet
