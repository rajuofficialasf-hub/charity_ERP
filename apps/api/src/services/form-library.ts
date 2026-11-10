import {
  FIELD_TYPES,
  type FieldType,
  type FormDefinition,
  type FormField,
  type LibraryField,
  libraryFieldSettingsSchema,
  type LibraryOption,
  type LibrarySection,
  SECTION_VISIBILITIES,
  type SectionVisibility,
  type TemplateSources,
} from '@css/shared/forms';
import type { PrismaService, Tx } from '../core/prisma.service';
import { ApiError } from '../i18n/api-error';
import type { ReferenceListsService } from './reference-lists';

/**
 * The question library as the builder reads it: the sections of the library form's published
 * version, and their questions ready to place. The templates list stays for the response's shape
 * and is empty.
 */
export interface FormLibraryView {
  /** The library form the builders edit; its published version is this library. */
  libraryFormId: string;
  sections: {
    key: string;
    title: { bn: string; en: string };
    defaultVisibility: string;
    fieldKeys: string[];
  }[];
  fields: {
    key: string;
    type: string;
    label: { bn: string; en: string };
    standardColumn: string | null;
    defaultSettings: unknown;
    /**
     * The field as the builder places it in a form: its options read from the reference list,
     * its calculation, and for a repeat group its member fields after it.
     */
    formFields: FormField[];
  }[];
  templates: { key: string; name: { bn: string; en: string }; projectType: string }[];
}

/** A stored form template of the library (the seed writes them next to the project templates). */
export interface StoredFormTemplate {
  key: string;
  name: { bn: string; en: string };
  projectType: string;
  definition: unknown;
}

/** A stored field type, checked against the known ones. */
export const fieldTypeOf = (value: string): FieldType => {
  const type = FIELD_TYPES.find((t) => t === value);
  if (!type) throw new Error(`unknown field type ${value}`);
  return type;
};
/** Reads one version's definition with every section (the forms service's reader). */
export type VersionReader = (db: Tx, versionId: string) => Promise<FormDefinition>;

/** A stored section visibility, checked against the known ones. */
export const visibilityOf = (value: string): SectionVisibility => {
  const visibility = SECTION_VISIBILITIES.find((v) => v === value);
  if (!visibility) throw new Error(`unknown section visibility ${value}`);
  return visibility;
};

/**
 * The organisation-wide question library and the retired form templates of the two current forms
 * (docs/MASTER_SPEC.md, "Appendix B — Current form fields and mapping to the new system"). The library
 * is one form outside the projects that the Monitoring Team and the Department Head build and
 * publish like any form (docs/DECISION_LOG.md, the decisions on who builds forms and on the
 * library); its published version is what every builder picks from. The seeded library tables and
 * templates are still read to start a form from a template.
 */
export class FormLibraryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly referenceLists: ReferenceListsService,
    private readonly readVersion: VersionReader,
  ) {}

  async library(): Promise<FormLibraryView> {
    const form = await this.prisma.form.findFirstOrThrow({
      where: { kind: 'library' },
      select: {
        id: true,
        formVersionsForm: { where: { status: 'published' }, select: { id: true } },
      },
    });
    const published = form.formVersionsForm[0];
    if (!published) return { libraryFormId: form.id, sections: [], fields: [], templates: [] };
    return {
      libraryFormId: form.id,
      ...libraryOf(await this.readVersion(this.prisma, published.id)),
      templates: [],
    };
  }

  /**
   * What the engine needs to turn a template or the blank core into a definition: the library
   * rows in the seed's shape, and the reference lists the library fields name, read once so the
   * builder runs without I/O.
   */
  async sources(db: Tx): Promise<TemplateSources> {
    const [fieldRows, sectionRows] = await Promise.all([this.fieldRows(db), this.sectionRows(db)]);
    const libraryFields: LibraryField[] = fieldRows.map((r) => ({
      key: r.key,
      type: fieldTypeOf(r.type),
      bn: r.labelBn,
      en: r.labelEn,
      ...(r.standardColumn ? { standard: r.standardColumn } : {}),
      settings: libraryFieldSettingsSchema.parse(r.defaultSettings),
    }));
    const librarySections: LibrarySection[] = sectionRows.map((r) => ({
      key: r.key,
      bn: r.titleBn,
      en: r.titleEn,
      visibility: visibilityOf(r.defaultVisibility),
      fields: r.fieldKeys,
    }));
    const listKeys = new Set<string>();
    for (const field of libraryFields) {
      if (field.settings?.options_from_reference_list)
        listKeys.add(field.settings.options_from_reference_list);
      for (const member of field.settings?.repeat_fields ?? [])
        if (member.options_from_reference_list) listKeys.add(member.options_from_reference_list);
    }
    const lists = new Map<string, LibraryOption[]>();
    for (const listKey of listKeys) lists.set(listKey, await this.listOptions(listKey));
    return { libraryFields, librarySections, resolveList: (listKey) => lists.get(listKey) ?? [] };
  }

  /** The active form templates, newest version of each key. */
  async templates(db: Tx): Promise<StoredFormTemplate[]> {
    const rows = await db.projectTemplate.findMany({
      where: { active: true, definition: { path: ['kind'], equals: 'form_template' } },
      orderBy: [{ key: 'asc' }, { version: 'desc' }],
      select: { key: true, nameBn: true, nameEn: true, projectType: true, definition: true },
    });
    const seen = new Set<string>();
    return rows.flatMap((r) => {
      if (seen.has(r.key)) return [];
      seen.add(r.key);
      return [
        {
          key: r.key,
          name: { bn: r.nameBn, en: r.nameEn },
          projectType: r.projectType,
          definition: r.definition,
        },
      ];
    });
  }

  /** One template by key, or null. */
  async template(db: Tx, key: string): Promise<StoredFormTemplate | null> {
    return (await this.templates(db)).find((t) => t.key === key) ?? null;
  }

  private sectionRows(db: Tx) {
    return db.formLibrarySection.findMany({
      orderBy: [{ sortOrder: 'asc' }, { key: 'asc' }],
      select: { key: true, titleBn: true, titleEn: true, defaultVisibility: true, fieldKeys: true },
    });
  }

  private fieldRows(db: Tx) {
    return db.formLibraryField.findMany({
      orderBy: [{ sortOrder: 'asc' }, { key: 'asc' }],
      select: {
        key: true,
        type: true,
        labelBn: true,
        labelEn: true,
        standardColumn: true,
        defaultSettings: true,
      },
    });
  }

  /**
   * The active items of a reference list as library options; a list the admin has not set up
   * gives no options. The form keeps its own copy from then on, so a later change of the list
   * never reaches a published version (docs/DECISION_LOG.md, the decision on beneficiary type
   * options).
   */
  private async listOptions(listKey: string): Promise<LibraryOption[]> {
    try {
      const items = await this.referenceLists.items(listKey);
      return items
        .filter((i) => i.active)
        .map((i) => ({
          code: i.code,
          label_bn: i.label.bn,
          label_en: i.label.en,
          ...(i.code === 'other' ? { allows_other_text: true } : {}),
        }));
    } catch (error) {
      if (error instanceof ApiError && error.status === 404) return [];
      throw error;
    }
  }
}

/**
 * The library's sections and questions from the library form's definition: a question inside a
 * repeat group travels with its group, so the group's entry carries its members after it.
 */
export function libraryOf(
  definition: FormDefinition,
): Pick<FormLibraryView, 'sections' | 'fields'> {
  const sections: FormLibraryView['sections'] = [];
  const fields: FormLibraryView['fields'] = [];
  for (const section of definition.sections) {
    const top = section.fields.filter((f) => !f.settings?.repeat?.group);
    sections.push({
      key: section.key,
      title: section.title,
      defaultVisibility: section.visibility,
      fieldKeys: top.map((f) => f.fieldKey),
    });
    for (const field of top)
      fields.push({
        key: field.fieldKey,
        type: field.type,
        label: field.label,
        standardColumn: field.standardColumn ?? null,
        defaultSettings: field.settings ?? {},
        formFields: [
          field,
          ...section.fields.filter((m) => m.settings?.repeat?.group === field.fieldKey),
        ],
      });
  }
  return { sections, fields };
}
