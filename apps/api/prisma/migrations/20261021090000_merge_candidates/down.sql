-- Reverses 20261021090000_merge_candidates (every migration ships its hand-written reverse,
-- docs/architecture/ADR/ADR-003-prisma-with-down-sql.md). The pairs are derived from the profiles,
-- so the nightly job rebuilds them after the migration is applied again.

DROP TABLE IF EXISTS "beneficiary_merge_candidates";
