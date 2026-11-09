-- The libraries list in the order the seed gives them: created_at and id do not follow the
-- seed, so the seed writes sort_order in its file order. Rows seeded before this column keep 0
-- until the base seed runs again (every environment that holds library rows re-runs it).
ALTER TABLE "form_library_sections" ADD COLUMN "sort_order" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "form_library_fields" ADD COLUMN "sort_order" INTEGER NOT NULL DEFAULT 0;
CREATE INDEX "form_library_sections_sort_order_idx" ON "form_library_sections"("sort_order");
CREATE INDEX "form_library_fields_sort_order_idx" ON "form_library_fields"("sort_order");
