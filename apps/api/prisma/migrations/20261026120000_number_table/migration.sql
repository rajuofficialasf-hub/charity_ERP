-- A number table question: whole numbers by row and column (owner's demo form, D-133). The question
-- types are a CHECK list on both field tables, so both checks are widened.
ALTER TABLE "form_fields" DROP CONSTRAINT "form_fields_type_check";
ALTER TABLE "form_fields" ADD CONSTRAINT "form_fields_type_check" CHECK ("type" IN ('short_text', 'long_text', 'number', 'decimal', 'money', 'phone', 'email', 'date', 'time', 'datetime', 'single_select', 'multi_select', 'radio', 'checkbox', 'photo', 'file', 'signature', 'gps', 'bd_address', 'repeat_group', 'calculation', 'note', 'number_table'));
ALTER TABLE "form_library_fields" DROP CONSTRAINT "form_library_fields_type_check";
ALTER TABLE "form_library_fields" ADD CONSTRAINT "form_library_fields_type_check" CHECK ("type" IN ('short_text', 'long_text', 'number', 'decimal', 'money', 'phone', 'email', 'date', 'time', 'datetime', 'single_select', 'multi_select', 'radio', 'checkbox', 'photo', 'file', 'signature', 'gps', 'bd_address', 'repeat_group', 'calculation', 'note', 'number_table'));
