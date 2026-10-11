/**
 * Every bilingual database field (`<field>_bn` / `<field>_en`, I18N.md 7.1). The rendering helper,
 * the translation screen (i18n.manage), the third-language migration (I18N 11) and a schema test
 * read this registry; a new bilingual column is added here in the same change.
 */
export const BILINGUAL_COLUMNS = {
  roles: ['name'],
  locations: ['name'],
  reference_lists: ['label'],
  holiday_calendar: ['name'],
  programs: ['name'],
  projects: ['name'],
  project_templates: ['name'],
  forms: ['title'],
  form_sections: ['title'],
  form_fields: ['label'],
  field_options: ['label'],
  form_library_sections: ['title'],
  form_library_fields: ['label'],
  workflow_definitions: ['title'],
  dawah_syllabus_topics: ['title'],
  documents: ['name'],
} as const satisfies Record<string, readonly string[]>;

export type BilingualTable = keyof typeof BILINGUAL_COLUMNS;
