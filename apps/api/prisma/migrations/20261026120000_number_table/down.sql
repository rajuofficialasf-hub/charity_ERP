-- Reverses 20261026120000_number_table (every migration ships its hand-written reverse,
-- docs/architecture/ADR/ADR-003-prisma-with-down-sql.md). It refuses while any form or library
-- question is a number table, since narrowing the checks would fail on those rows; retire or edit
-- those forms first.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM "form_fields" WHERE "type" = 'number_table')
     OR EXISTS (SELECT 1 FROM "form_library_fields" WHERE "type" = 'number_table') THEN
    RAISE EXCEPTION 'number_table down: a form still has a number table question';
  END IF;
END $$;

ALTER TABLE "form_fields" DROP CONSTRAINT "form_fields_type_check";
ALTER TABLE "form_fields" ADD CONSTRAINT "form_fields_type_check" CHECK ("type" IN ('short_text', 'long_text', 'number', 'decimal', 'money', 'phone', 'email', 'date', 'time', 'datetime', 'single_select', 'multi_select', 'radio', 'checkbox', 'photo', 'file', 'signature', 'gps', 'bd_address', 'repeat_group', 'calculation', 'note'));
ALTER TABLE "form_library_fields" DROP CONSTRAINT "form_library_fields_type_check";
ALTER TABLE "form_library_fields" ADD CONSTRAINT "form_library_fields_type_check" CHECK ("type" IN ('short_text', 'long_text', 'number', 'decimal', 'money', 'phone', 'email', 'date', 'time', 'datetime', 'single_select', 'multi_select', 'radio', 'checkbox', 'photo', 'file', 'signature', 'gps', 'bd_address', 'repeat_group', 'calculation', 'note'));
