# ROLE-BASED ACCESS CONTROL AND DATA SCOPES

Status: outline, written in task T0.1 (2026-10-10); completed in task T0.10 together with `permissions.yaml`. Sources: blueprint A4 (both matrices), B4, constitution §5; rules BR-180…193.

## 1. Model
Permission = role × scope; project-level permission sets; overrides from the permission panel; default deny; same person, different sets per project.

## 2. Roles
Department Head, Monitoring Team, PM, RPM, Project Executive, Implementer, Official দায়ী, Procurement Team, Media Team, Finance Team; volunteer types General, Local দায়ী, Both, Team Member, Paid Volunteer.

## 3. Scopes
GLOBAL, PROGRAM, PROJECT, REGION, DISTRICT / UPAZILA / UNION, ASSIGNED, SELF: definition, how each is resolved from assignments and the district split.

## 4. Permission catalogue
Every permission name with description, default roles and default scope; generated from `permissions.yaml`.

## 5. Default matrix
The A4 matrices expressed as permission × role × scope, including "if RPM grants" entries.

## 6. Permission panel
Who may change what, audit of every change, effect on active sessions (refresh).

## 7. Field-level protection
Sensitive field classes (NID number and photo, bank details, ratings, categories, donor data, official section, blocklist reasons) and which roles see them; the same rules in exports.

## 8. Enforcement
Guard order in the request lifecycle, object-level checks (no IDOR), scope filters in queries, tests (authorization matrix test per endpoint).

## 9. Special cases
Department Head account protection; Monitoring Team equality with the Head; Procurement view-only with issue rights; Media Team own-content rule; Finance viewer; blocked users; handover.
