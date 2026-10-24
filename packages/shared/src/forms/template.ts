import { translate } from '../i18n/translate.js';
import type { FieldOption, FormDefinition, FormField, FormSection } from './definition.js';
import type {
  FormTemplateField,
  FormTemplateForm,
  LibraryField,
  LibraryOption,
  LibrarySection,
  RepeatField,
} from './library.js';

/**
 * Builds a form definition from the seeded library shapes: a template names library fields per
 * section with their mandatory flag and display condition; the library gives each field its type,
 * labels, column and default settings. Options that come from a reference list are copied into
 * the definition through the resolver the caller passes (the API passes the list's items), so the
 * form owns its options from then on and a later change to the list never alters it.
 */
export interface TemplateSources {
  libraryFields: readonly LibraryField[];
  librarySections: readonly LibrarySection[];
  /** The items of a reference list by its key; an unknown list gives an empty list. */
  resolveList: (listKey: string) => readonly LibraryOption[];
}

export class TemplateError extends Error {
  constructor(
    readonly code: 'form.unknown_library_field' | 'form.unknown_library_section',
    readonly key: string,
  ) {
    super(`${code}: ${key}`);
    this.name = 'TemplateError';
  }
}

const toOption = (option: LibraryOption): FieldOption => ({
  code: option.code,
  label: { bn: option.label_bn, en: option.label_en },
  ...(option.allows_other_text ? { allowsOtherText: true } : {}),
});

/**
 * The options of a library field: its own list or the reference list it names; a field-level
 * "other text" flag marks the option coded `other`, which opens the text box on the same field.
 */
function optionsOf(
  settings: {
    options?: readonly LibraryOption[];
    options_from_reference_list?: string;
    allows_other_text?: boolean;
  },
  resolveList: TemplateSources['resolveList'],
): FieldOption[] | undefined {
  const source = settings.options_from_reference_list
    ? resolveList(settings.options_from_reference_list)
    : settings.options;
  if (source === undefined) return undefined;
  return source.map((option) =>
    settings.allows_other_text && option.code === 'other'
      ? { ...toOption(option), allowsOtherText: true }
      : toOption(option),
  );
}

function memberField(
  group: LibraryField,
  member: RepeatField,
  resolveList: TemplateSources['resolveList'],
): FormField {
  const options = optionsOf(member, resolveList);
  return {
    fieldKey: member.key,
    libraryFieldKey: null,
    type: member.type,
    label: { bn: member.label_bn, en: member.label_en },
    required: member.required ?? false,
    standardColumn: member.standard ?? null,
    settings: {
      repeat: { group: group.key },
      ...(member.validation ? { validation: member.validation } : {}),
    },
    ...(options ? { options } : {}),
  };
}

/** A library field placed in a form: the template's flag and condition over the library defaults. */
export function fieldFromLibrary(
  library: LibraryField,
  placement: FormTemplateField,
  resolveList: TemplateSources['resolveList'],
): FormField[] {
  const settings = library.settings ?? {};
  const options = optionsOf(settings, resolveList);
  const repeat = library.type === 'repeat_group' ? { ...(settings.repeat ?? {}) } : undefined;
  const fieldSettings = {
    ...(settings.validation ? { validation: settings.validation } : {}),
    ...(repeat ? { repeat } : {}),
  };
  const field: FormField = {
    fieldKey: library.key,
    libraryFieldKey: library.key,
    type: library.type,
    label: { bn: library.bn, en: library.en },
    required: placement.required,
    standardColumn: library.standard ?? null,
    ...(Object.keys(fieldSettings).length ? { settings: fieldSettings } : {}),
    ...(placement.show_if ? { logic: { show_if: placement.show_if } } : {}),
    ...(settings.calculation ? { calculation: settings.calculation } : {}),
    ...(options ? { options } : {}),
  };
  const members = (settings.repeat_fields ?? []).map((m) => memberField(library, m, resolveList));
  return [field, ...members];
}

function sectionFrom(
  sources: TemplateSources,
  key: string,
  visibility: FormSection['visibility'],
  placements: readonly FormTemplateField[],
): FormSection {
  const library = sources.librarySections.find((s) => s.key === key);
  if (!library) throw new TemplateError('form.unknown_library_section', key);
  const fields = placements.flatMap((placement) => {
    const field = sources.libraryFields.find((f) => f.key === placement.key);
    if (!field) throw new TemplateError('form.unknown_library_field', placement.key);
    return fieldFromLibrary(field, placement, sources.resolveList);
  });
  return {
    key,
    librarySectionKey: key,
    title: { bn: library.bn, en: library.en },
    visibility,
    condition: null,
    fields,
  };
}

/** The definition a form template gives, ready for `formDefinitionSchema`. */
export function definitionFromTemplate(
  template: FormTemplateForm,
  sources: TemplateSources,
): FormDefinition {
  return {
    sections: template.sections.map((section) =>
      sectionFrom(sources, section.key, section.visibility, section.fields),
    ),
  };
}

/** A form with the mandatory core only, in the library's own sections, for a project that starts empty. */
export function blankDefinition(): FormDefinition {
  return {
    sections: [
      {
        key: 'section_1',
        title: {
          bn: translate('bn', 'forms.builder.first_section'),
          en: translate('en', 'forms.builder.first_section'),
        },
        visibility: 'volunteer',
        condition: null,
        fields: [],
      },
    ],
  };
}
