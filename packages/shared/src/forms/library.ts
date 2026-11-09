import { z } from 'zod';
import { code64, snakeKey } from '../jsonb/common.js';
import { calculationSchema, conditionSchema, validationSchema } from '../jsonb/form-logic.js';
import { PATTERN_KEYS } from './patterns.js';

/**
 * The shapes of the seeded field and section library and of a form template, as the seed writes
 * them and as the API reads them back from `form_library_fields.default_settings` and
 * `project_templates.definition`. The data itself lives in the seed (the library has no edit API);
 * this file only names its shape so the seed and the engine agree on it.
 */
export const FIELD_TYPES = [
  'short_text',
  'long_text',
  'number',
  'decimal',
  'money',
  'phone',
  'email',
  'date',
  'time',
  'datetime',
  'single_select',
  'multi_select',
  'radio',
  'checkbox',
  'photo',
  'file',
  'signature',
  'gps',
  'bd_address',
  'repeat_group',
  'calculation',
  'note',
  'number_table',
] as const;
export type FieldType = (typeof FIELD_TYPES)[number];

export const SECTION_VISIBILITIES = ['volunteer', 'official_only'] as const;
export type SectionVisibility = (typeof SECTION_VISIBILITIES)[number];

/** The text field types: the ones with a length cap and a named pattern. */
export const TEXT_FIELD_TYPES = ['short_text', 'long_text', 'phone', 'email'] as const;
/** The choice field types: the ones with options. */
export const CHOICE_FIELD_TYPES = ['single_select', 'multi_select', 'radio', 'checkbox'] as const;
/** The field types whose answer is a list of file ids. */
export const FILE_FIELD_TYPES = ['photo', 'file', 'signature'] as const;

export const isTextType = (type: FieldType) =>
  (TEXT_FIELD_TYPES as readonly string[]).includes(type);
export const isChoiceType = (type: FieldType) =>
  (CHOICE_FIELD_TYPES as readonly string[]).includes(type);
export const isFileType = (type: FieldType) =>
  (FILE_FIELD_TYPES as readonly string[]).includes(type);

/** A library option as the seed spells it (the form keeps a bilingual `label` object instead). */
export const libraryOptionSchema = z.strictObject({
  code: code64,
  label_bn: z.string(),
  label_en: z.string(),
  allows_other_text: z.boolean().optional(),
});
export type LibraryOption = z.infer<typeof libraryOptionSchema>;

/** A field's validation in the library: the pattern is one of the named patterns only. */
export const libraryValidationSchema = validationSchema.extend({
  pattern: z.enum(PATTERN_KEYS).optional(),
});
export type LibraryValidation = z.infer<typeof libraryValidationSchema>;

/** One field inside a repeat group of the library (the earners of appendix খ.২). */
export const repeatFieldSchema = z.strictObject({
  key: snakeKey,
  type: z.enum(FIELD_TYPES),
  label_bn: z.string(),
  label_en: z.string(),
  /** The column of the family-member row this field fills, when the group is the earners. */
  standard: z.string().optional(),
  required: z.boolean().optional(),
  options: z.array(libraryOptionSchema).optional(),
  options_from_reference_list: z.string().optional(),
  allows_other_text: z.boolean().optional(),
  validation: libraryValidationSchema.optional(),
});
export type RepeatField = z.infer<typeof repeatFieldSchema>;

/** `form_library_fields.default_settings`. */
export const libraryFieldSettingsSchema = z.strictObject({
  options: z.array(libraryOptionSchema).optional(),
  options_from_reference_list: z.string().optional(),
  allows_other_text: z.boolean().optional(),
  validation: libraryValidationSchema.optional(),
  calculation: calculationSchema.optional(),
  repeat: z
    .strictObject({
      min_rows: z.int().min(0).optional(),
      max_rows: z.int().min(1).optional(),
      /** On a family-member group: whether its rows are earners (true unless set). */
      earner: z.boolean().optional(),
    })
    .optional(),
  repeat_fields: z.array(repeatFieldSchema).optional(),
});
export type LibraryFieldSettings = z.infer<typeof libraryFieldSettingsSchema>;

/** One field of the library (`form_library_fields`). */
export interface LibraryField {
  key: string;
  type: FieldType;
  bn: string;
  en: string;
  /** The beneficiary column, the comma-separated columns, or the family-member table. */
  standard?: string;
  settings?: LibraryFieldSettings;
}

/** One section of the library (`form_library_sections`) with its ordered field keys. */
export interface LibrarySection {
  key: string;
  bn: string;
  en: string;
  visibility: SectionVisibility;
  fields: string[];
}

/** A field as a form template names it: the library key, whether it is mandatory, when it shows. */
export const formTemplateFieldSchema = z.strictObject({
  key: snakeKey,
  required: z.boolean(),
  show_if: conditionSchema.optional(),
});
export type FormTemplateField = z.infer<typeof formTemplateFieldSchema>;

export const formTemplateSectionSchema = z.strictObject({
  key: snakeKey,
  visibility: z.enum(SECTION_VISIBILITIES),
  fields: z.array(formTemplateFieldSchema),
});
export type FormTemplateSection = z.infer<typeof formTemplateSectionSchema>;

/** `project_templates.definition.form` of a form template. */
export const formTemplateFormSchema = z.strictObject({
  title_bn: z.string(),
  title_en: z.string(),
  sections: z.array(formTemplateSectionSchema).min(1),
});
export type FormTemplateForm = z.infer<typeof formTemplateFormSchema>;

/** A seeded form template row with its definition. */
export interface FormTemplate {
  key: string;
  name_bn: string;
  name_en: string;
  project_type: string;
  definition: {
    kind: 'form_template';
    source: string;
    also_for: string[];
    form: FormTemplateForm;
  };
}
