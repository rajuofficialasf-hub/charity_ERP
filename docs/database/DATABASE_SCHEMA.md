# DATABASE SCHEMA AND DATA DICTIONARY

Status: outline, written in task T0.1 (2026-10-10); completed in task T0.16 (document only; the Prisma schema and migrations are written in task T1.2 after the Phase 0 sign-off).

## 1. Conventions
Types (uuid, text, numeric for money, timestamptz, jsonb), audit columns, soft-delete columns where approved, indexes on query paths, check constraints, naming.

## 2. Data dictionary
One table per entity of `docs/database/ERD.md`: columns, type, null, default, constraint, description, sensitivity class (public / internal / sensitive), source rule (BR id).

## 3. Enumerations
Application statuses (per template), project statuses, volunteer types, permission sets, scopes, activity types, bucket names, document statuses, issue statuses, animal statuses, sync statuses.

## 4. JSONB structures
Shape of `application_answers.value`, `form_fields.logic`, `project_components.settings`, `application_scores.criteria`, `handovers.scope`, with JSON Schema references in `packages/shared`.

## 5. Constraints that implement business rules
Mapping of DB-enforced BRs (BR-003, BR-008, BR-016, BR-134, BR-145, BR-194 …) to constraints and triggers.

## 6. Migrations
Reversible migrations with hand-written `down.sql` (NFR-55); seed data policy (locations, templates, field library, demo data never in production).

## 7. Performance notes
Indexes for review queues, tabs with filters, dashboards; partitioning or archiving considerations for audit_log and photo_metadata given permanent retention.
