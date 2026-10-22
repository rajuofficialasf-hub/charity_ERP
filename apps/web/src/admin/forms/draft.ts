import type { Condition } from '@css/shared';
import {
  type FieldOption,
  type FieldType,
  type FormDefinition,
  type FormField,
  type FormSection,
  isCoreFieldKey,
} from '@css/shared/forms';

/**
 * The edits the form builder makes to a draft definition, as pure functions: each returns a new
 * definition, or the same one when the edit is not allowed. The mandatory core fields (the
 * identity number, names, mobile, gender, address and village) can never be removed, made
 * optional, given a condition or moved into an official-only section, so the builder never offers
 * those actions and an edit that tries them changes nothing. The server checks the same rules again
 * when the draft is saved.
 */

/** A library section as the library read gives it. */
export interface LibrarySectionView {
  key: string;
  title: { bn: string; en: string };
  defaultVisibility: string;
  fieldKeys: string[];
}

/** The fields each library key places in a form: the field, and a repeat group's members after it. */
export type LibraryFields = ReadonlyMap<string, readonly FormField[]>;

/** What may not be done to a field. */
export interface FieldLocks {
  remove: boolean;
  optional: boolean;
  condition: boolean;
}

export function coreLocks(field: FormField): FieldLocks {
  const core = isCoreFieldKey(field.fieldKey);
  return { remove: core, optional: core, condition: core };
}

const hasCore = (section: FormSection) => section.fields.some((f) => isCoreFieldKey(f.fieldKey));
const allKeys = (def: FormDefinition) =>
  new Set(def.sections.flatMap((s) => s.fields.map((f) => f.fieldKey)));
const groupOf = (field: FormField) => field.settings?.repeat?.group;

function withSection(
  def: FormDefinition,
  key: string,
  change: (section: FormSection) => FormSection,
): FormDefinition {
  const index = def.sections.findIndex((s) => s.key === key);
  const current = def.sections[index];
  if (!current) return def;
  const next = change(current);
  if (next === current) return def;
  const sections = [...def.sections];
  sections[index] = next;
  return { sections };
}

/** Adds a library section with its fields in library order, once; fields the form has are skipped. */
export function addLibrarySection(
  def: FormDefinition,
  library: LibrarySectionView,
  fields: LibraryFields,
): FormDefinition {
  if (def.sections.some((s) => s.key === library.key)) return def;
  const taken = allKeys(def);
  const placed = library.fieldKeys
    .flatMap((key) => fields.get(key) ?? [])
    .filter((f) => !taken.has(f.fieldKey));
  return {
    sections: [
      ...def.sections,
      {
        key: library.key,
        librarySectionKey: library.key,
        title: library.title,
        visibility: library.defaultVisibility === 'official_only' ? 'official_only' : 'volunteer',
        condition: null,
        fields: placed,
      },
    ],
  };
}

/** Adds one library field (with a repeat group's members) at the end of a section, once. */
export function addLibraryField(
  def: FormDefinition,
  sectionKey: string,
  placed: readonly FormField[],
): FormDefinition {
  const taken = allKeys(def);
  const fresh = placed.filter((f) => !taken.has(f.fieldKey));
  if (!fresh.length) return def;
  return withSection(def, sectionKey, (s) => ({ ...s, fields: [...s.fields, ...fresh] }));
}

/** A project's own question as the builder's dialog collects it. */
export interface OwnQuestion {
  type: FieldType;
  label: { bn: string; en: string };
  options?: FieldOption[];
  /** The earlier single-choice question whose answer decides which options show. */
  dependsOn?: string;
  /** The repeat group of the section the question joins, as one of its row's fields. */
  group?: string;
}

/**
 * The key of a new own question: `q_` and the English label in small letters and underscores,
 * numbered when the form has it already (or when the label has no Latin letters). The key is never
 * shown; it stays the same when the label changes and in the next version, so the question keeps
 * its identity across versions.
 */
function ownQuestionKey(def: FormDefinition, englishLabel: string): string {
  const slug = englishLabel
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 48)
    .replace(/_+$/, '');
  const taken = allKeys(def);
  const base = slug && /^[a-z]/.test(slug) ? `q_${slug}` : 'q';
  if (base !== 'q' && !taken.has(base)) return base;
  for (let n = 2; ; n += 1) {
    const candidate = `${base}_${n}`;
    if (!taken.has(candidate)) return candidate;
  }
}

export function addOwnQuestion(
  def: FormDefinition,
  sectionKey: string,
  question: OwnQuestion,
): { definition: FormDefinition; fieldKey: string | null } {
  const section = def.sections.find((s) => s.key === sectionKey);
  if (!section) return { definition: def, fieldKey: null };
  const group = question.group
    ? section.fields.find((f) => f.fieldKey === question.group && f.type === 'repeat_group')
    : undefined;
  // a repeat group takes no group of its own, and a group must be one of this section
  if (question.group && (!group || question.type === 'repeat_group'))
    return { definition: def, fieldKey: null };
  const fieldKey = ownQuestionKey(def, question.label.en);
  const field: FormField = {
    fieldKey,
    libraryFieldKey: null,
    type: question.type,
    label: question.label,
    required: false,
    standardColumn: null,
    settings: group ? { repeat: { group: group.fieldKey } } : {},
    options: question.options ?? [],
    ...(question.dependsOn ? { logic: { options_depend_on: question.dependsOn } } : {}),
  };
  // a group's fields follow it directly, so a new one goes after the group's last field
  const after = group
    ? section.fields.reduce(
        (last, f, i) => (f.fieldKey === group.fieldKey || groupOf(f) === group.fieldKey ? i : last),
        -1,
      )
    : section.fields.length - 1;
  return {
    definition: withSection(def, sectionKey, (s) => ({
      ...s,
      fields: [...s.fields.slice(0, after + 1), field, ...s.fields.slice(after + 1)],
    })),
    fieldKey,
  };
}

/**
 * Changes the settings of a field; a key the change sets to `undefined` is removed. A core field
 * keeps itself required and without a condition whatever the change asks; its labels and help
 * text change freely.
 */
export function updateField(
  def: FormDefinition,
  fieldKey: string,
  patch: Partial<Omit<FormField, 'fieldKey'>>,
): FormDefinition {
  const section = def.sections.find((s) => s.fields.some((f) => f.fieldKey === fieldKey));
  if (!section) return def;
  return withSection(def, section.key, (s) => ({
    ...s,
    fields: s.fields.map((f) => {
      if (f.fieldKey !== fieldKey) return f;
      const next: FormField = { ...f, ...patch };
      for (const key of Object.keys(patch) as (keyof FormField)[])
        if (next[key] === undefined) delete next[key];
      if (coreLocks(f).optional) next.required = true;
      if (coreLocks(f).condition) {
        const { show_if: _show, required_if: _required, ...logic } = next.logic ?? {};
        if (Object.keys(logic).length) next.logic = logic;
        else delete next.logic;
      }
      return next;
    }),
  }));
}

/**
 * Replaces the options of a choice question. An option of a later question that followed a
 * removed option follows none any more, so the draft never names an option that is gone.
 */
export function setOptions(
  def: FormDefinition,
  fieldKey: string,
  options: FieldOption[],
): FormDefinition {
  const field = def.sections.flatMap((s) => s.fields).find((f) => f.fieldKey === fieldKey);
  if (!field) return def;
  const kept = new Set(options.map((o) => o.code));
  const gone = new Set((field.options ?? []).map((o) => o.code).filter((c) => !kept.has(c)));
  const next = updateField(def, fieldKey, { options });
  if (!gone.size) return next;
  return {
    sections: next.sections.map((s) => ({
      ...s,
      fields: s.fields.map((f) =>
        f.logic?.options_depend_on === fieldKey &&
        (f.options ?? []).some((o) => o.dependsOnOptionCode && gone.has(o.dependsOnOptionCode))
          ? {
              ...f,
              options: (f.options ?? []).map((o) =>
                o.dependsOnOptionCode && gone.has(o.dependsOnOptionCode)
                  ? { ...o, dependsOnOptionCode: null }
                  : o,
              ),
            }
          : f,
      ),
    })),
  };
}

/** Removes a field, and a repeat group's members with it; a core field stays. */
export function removeField(def: FormDefinition, fieldKey: string): FormDefinition {
  const section = def.sections.find((s) => s.fields.some((f) => f.fieldKey === fieldKey));
  const field = section?.fields.find((f) => f.fieldKey === fieldKey);
  if (!section || !field || coreLocks(field).remove) return def;
  return withSection(def, section.key, (s) => ({
    ...s,
    fields: s.fields.filter((f) => f.fieldKey !== fieldKey && groupOf(f) !== fieldKey),
  }));
}

/** Removes a section that holds no core field. */
export function removeSection(def: FormDefinition, key: string): FormDefinition {
  const section = def.sections.find((s) => s.key === key);
  if (!section || hasCore(section)) return def;
  return { sections: def.sections.filter((s) => s.key !== key) };
}

/** A section that holds a core field stays visible to everyone. */
export function setSectionVisibility(
  def: FormDefinition,
  key: string,
  visibility: FormSection['visibility'],
): FormDefinition {
  return withSection(def, key, (s) =>
    (visibility === 'official_only' && hasCore(s)) || s.visibility === visibility
      ? s
      : { ...s, visibility },
  );
}

/** A section that holds a core field is always shown. */
export function setSectionCondition(
  def: FormDefinition,
  key: string,
  condition: Condition | null,
): FormDefinition {
  return withSection(def, key, (s) => (hasCore(s) ? s : { ...s, condition }));
}

export function moveSection(def: FormDefinition, key: string, direction: -1 | 1): FormDefinition {
  const index = def.sections.findIndex((s) => s.key === key);
  const target = index + direction;
  if (index < 0 || target < 0 || target >= def.sections.length) return def;
  const sections = [...def.sections];
  [sections[index], sections[target]] = [sections[target]!, sections[index]!];
  return { sections };
}

/**
 * The fields of a section as the blocks that move together: a repeat group with its members, or a
 * single field. Members of a group are their own blocks inside it.
 */
function blocksOf(fields: readonly FormField[]): FormField[][] {
  const blocks: FormField[][] = [];
  for (const field of fields) {
    const group = groupOf(field);
    const last = blocks.at(-1);
    // members follow their group directly, so a member joins the block its group opened
    if (group && last?.[0]?.fieldKey === group) last.push(field);
    else blocks.push([field]);
  }
  return blocks;
}

/**
 * Moves a field up or down. A repeat group moves with its members; a member moves only between
 * the other members of its group.
 */
export function moveField(
  def: FormDefinition,
  sectionKey: string,
  fieldKey: string,
  direction: -1 | 1,
): FormDefinition {
  return withSection(def, sectionKey, (s) => {
    const field = s.fields.find((f) => f.fieldKey === fieldKey);
    if (!field) return s;
    const group = groupOf(field);
    if (group) {
      const index = s.fields.indexOf(field);
      const target = index + direction;
      const neighbour = s.fields[target];
      if (!neighbour || groupOf(neighbour) !== group) return s;
      const fields = [...s.fields];
      [fields[index], fields[target]] = [neighbour, field];
      return { ...s, fields };
    }
    const blocks = blocksOf(s.fields);
    const index = blocks.findIndex((b) => b[0]!.fieldKey === fieldKey);
    const target = index + direction;
    if (index < 0 || target < 0 || target >= blocks.length) return s;
    [blocks[index], blocks[target]] = [blocks[target]!, blocks[index]!];
    return { ...s, fields: blocks.flat() };
  });
}
