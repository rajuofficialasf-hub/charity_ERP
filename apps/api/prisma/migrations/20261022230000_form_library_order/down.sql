-- Reverses 20261022230000_form_library_order (every migration ships its hand-written reverse,
-- docs/architecture/ADR/ADR-003-prisma-with-down-sql.md). The order goes back to created_at and id.
DROP INDEX "form_library_fields_sort_order_idx";
DROP INDEX "form_library_sections_sort_order_idx";
ALTER TABLE "form_library_fields" DROP COLUMN "sort_order";
ALTER TABLE "form_library_sections" DROP COLUMN "sort_order";
