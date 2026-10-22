-- The section and field libraries keep the order the seed gives them (DECISION_LOG D-122):
-- every seeded row shared one created_at and a hashed id, so the builder showed them in hash order.
ALTER TABLE "form_library_sections" ADD COLUMN "sort_order" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "form_library_fields" ADD COLUMN "sort_order" INTEGER NOT NULL DEFAULT 0;
CREATE INDEX "form_library_sections_sort_order_idx" ON "form_library_sections"("sort_order");
CREATE INDEX "form_library_fields_sort_order_idx" ON "form_library_fields"("sort_order");
