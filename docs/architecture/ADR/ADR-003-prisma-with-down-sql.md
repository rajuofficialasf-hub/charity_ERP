# ADR-003: Prisma ORM on PostgreSQL 16 with hand-written down.sql for every migration

Status: approved 2026-10-10 (DECISION_LOG D-051, confirmed by the owner in O-01). Written in task T0.8.

## Context

PostgreSQL with JSONB is approved (constitution §9, BD-45). The schema is large (see `docs/database/ERD.md`), changes with every phase, and must stay synchronized with the ERD and data dictionary. Constitution §13 requires reversible migrations, unique and check constraints, audit columns and no hard delete of business data. Prisma's migration tool generates forward SQL only.

## Decision

- Prisma ORM with PostgreSQL 16. `schema.prisma` is the code form of the ERD; the data dictionary in `docs/database/DATABASE_SCHEMA.md` is updated in the same commit as the schema.
- Every migration directory produced by `prisma migrate dev --create-only` must contain, next to the generated `migration.sql`, a hand-written `down.sql` that reverses it (drop added columns, restore dropped ones from a backup table where data would be lost, recreate indexes). A CI test fails when a migration lacks `down.sql`; a review checklist item verifies that `down.sql` was executed against a copy of the previous state.
- Constraints that implement business rules live in SQL inside the migration (unique indexes on NID and birth registration, on `(project_id, beneficiary_id)`, on payment transaction id, on `client_uuid`; the volunteer-own-mobile check as a trigger or constraint; append-only audit log through revoked UPDATE/DELETE privileges), because Prisma's schema cannot express all of them. Such SQL is kept in the migration and documented in DATABASE_SCHEMA §5.
- The application database role has no DDL rights; migrations run through a one-shot container with a migration role before the new API version starts.
- Destructive data migrations are forbidden on production without an approved runbook entry and a verified backup (§13: never fix bugs by editing production data).

## Alternatives considered

- Drizzle: lighter and closer to SQL, but its migration story and ecosystem were less mature at decision time; the schema-as-ERD benefit is similar.
- TypeORM: has up/down migrations natively but is known for subtle bugs and weaker type safety.
- Raw SQL migrations with a thin query builder: full control and natural down scripts, but loses the typed client that keeps repositories honest and the schema file that mirrors the ERD.

## Consequences

Positive: typed repositories; the schema file is reviewable against the ERD; every change is reversible by rule; business constraints live in the database where they protect data from every code path.

Negative: two artefacts per migration (generated up, manual down) and the discipline to test the down script; Prisma's generated client must be regenerated in CI and in the worker image; some PostgreSQL features (partial indexes, triggers) are written by hand and must be documented.

Follow-ups: T1.2 writes the initial schema, migrations, locations seed and the migration-completeness test; T0.16 writes the data dictionary.

## Related

D-051; constitution §13 (database); NFR-55; BR-003, BR-008, BR-016, BR-134, BR-177, BR-194; `docs/database/ERD.md`, `docs/database/DATABASE_SCHEMA.md`.
