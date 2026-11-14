import { type Condition, isFieldRef } from '@css/shared';
import {
  MOBILE_OWNER_COLUMN,
  MOBILE_OWNER_NAME_COLUMN,
  MOBILE_OWNER_NAME_MAX,
  MOBILE_OWNER_OWN,
} from '@css/shared/beneficiaries';
import {
  conditionFields,
  CORE_FIELDS,
  type CoreFieldKey,
  DEFINITION_LIMITS,
  exprReferences,
  type FieldOption,
  type FieldType,
  type FormDefinition,
  type FormField,
  type FormKind,
  type FormSection,
  type FormTextKind,
  type NumberTable,
  emptySection,
  identityRoleOf,
  isChoiceType,
  listOfField,
  pipeKeys,
  pipeWithout,
} from '@css/shared/forms';
import type { LibrarySectionView } from '../../api/schemas';
import type { Selection } from './selection';
import { sitsInRows } from './type-meta';

/**
 * The edits the form builder makes to a draft definition, as pure functions: each returns a new
 * definition, or the same one when the edit is not allowed. A question marked with an identity
 * role (the identity number, names, mobile, gender, address and village of a beneficiary
 * application) stays required, without a condition and seen by everyone, so its section can be
 * neither official-only nor conditional; it is moved, renamed or removed like any other question.
 * The builder never offers the refused actions, and an edit that tries them changes nothing. The
 * server checks the identity marks again when the form is published.
 *
 * An edit changes the questions and keeps the rest of the definition (the form's own points): a
 * save sends the whole draft, so what an edit dropped would be taken away on the server.
 */

/** A library section as the library read gives it. */
export type { LibrarySectionView };

/** The fields each library key places in a form: the field, and a repeat group's members after it. */
export type LibraryFields = ReadonlyMap<string, readonly FormField[]>;

/** What may not be done to a field. */
export interface FieldLocks {
  optional: boolean;
  condition: boolean;
}

/** A question marked with an identity role stays required and without a condition. */
export function coreLocks(field: FormField): FieldLocks {
  const marked = identityRoleOf(field) !== null;
  return { optional: marked, condition: marked };
}

/** Whether a section holds a question marked with an identity role. */
export const hasIdentity = (section: FormSection) =>
  section.fields.some((f) => identityRoleOf(f) !== null);
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
  return { ...def, sections };
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
    ...def,
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

/** A question of the form's own as the builder adds it: of a type, at a place, with no text yet. */
export interface OwnQuestion {
  type: FieldType;
  /**
   * The question of the section it follows: right after it, among a repeat group's row
   * questions when that one is a row question, and at the end of a group's rows when it is the
   * group. A type that cannot sit in rows (a list, a number table) goes after the whole group.
   */
  after?: string;
  /** The repeat group of the section the question joins, at the end of its row questions. */
  group?: string;
  /** A number table's starting rows and columns. */
  table?: NumberTable;
}

/**
 * Makes a candidate key for a new question, or a candidate code for a new option; the keys and
 * codes already taken are checked by the caller.
 */
export type MakeKey = () => string;

const KEY_LETTERS = 'abcdefghijklmnopqrstuvwxyz0123456789';
const KEY_LENGTH = 6;
/** The bytes below this are whole runs of the alphabet, so each letter is as likely as another. */
const KEY_BYTE_LIMIT = 256 - (256 % KEY_LETTERS.length);

/** Six random small letters and digits. */
function randomLetters(): string {
  let letters = '';
  while (letters.length < KEY_LENGTH)
    for (const byte of crypto.getRandomValues(new Uint8Array(KEY_LENGTH * 2)))
      if (byte < KEY_BYTE_LIMIT && letters.length < KEY_LENGTH)
        letters += KEY_LETTERS.charAt(byte % KEY_LETTERS.length);
  return letters;
}

/** `q_` and six random small letters and digits. */
const randomKey: MakeKey = () => `q_${randomLetters()}`;
/** `o_` and six random small letters and digits. */
const randomCode: MakeKey = () => `o_${randomLetters()}`;

/**
 * The key of a new or copied question: random, never made from a text (a question starts
 * without one, and its texts change), and not one the form has. The key is never shown; it stays
 * the same when the texts change and in the next version, so the question keeps its identity
 * across versions.
 */
function freshKey(def: FormDefinition, makeKey: MakeKey = randomKey): string {
  const taken = allKeys(def);
  for (;;) {
    const key = makeKey();
    if (!taken.has(key)) return key;
  }
}

/**
 * Adds an empty question of the form's own to a section: after the question it follows, in the
 * rows of the group it joins, at a dropped place, else at the end of the section. Its texts and,
 * for a choice, its options are written afterwards in the settings; a draft saves without them.
 */
export function addOwnQuestion(
  def: FormDefinition,
  sectionKey: string,
  question: OwnQuestion,
  /** The block index the question takes (a drop at a place); the end of the section otherwise. */
  at?: number,
  makeKey?: MakeKey,
): { definition: FormDefinition; fieldKey: string | null } {
  const section = def.sections.find((s) => s.key === sectionKey);
  if (!section) return { definition: def, fieldKey: null };
  const inSection = (key: string | undefined) =>
    key === undefined ? undefined : section.fields.find((f) => f.fieldKey === key);
  const rows = sitsInRows(question.type);
  // a group to join must be a group of this section, and the type one its rows take
  if (question.group && (inSection(question.group)?.type !== 'repeat_group' || !rows))
    return { definition: def, fieldKey: null };
  const anchor = question.group ? undefined : inSection(question.after);
  // the group around the question it follows: that question's own, or the question itself
  const around = anchor?.type === 'repeat_group' ? anchor.fieldKey : anchor && groupOf(anchor);
  const group = question.group ?? (rows ? around : undefined);
  const fieldKey = freshKey(def, makeKey);
  const field: FormField = {
    fieldKey,
    libraryFieldKey: null,
    type: question.type,
    label: { bn: '', en: '' },
    required: false,
    standardColumn: null,
    settings: group ? { repeat: { group } } : question.table ? { table: question.table } : {},
    options: [],
  };
  // a group's fields follow it directly: its end is after its last row question
  const endOf = (groupKey: string) =>
    section.fields.reduce(
      (last, f, i) => (f.fieldKey === groupKey || groupOf(f) === groupKey ? i : last),
      -1,
    ) + 1;
  let index = section.fields.length;
  if (question.group) index = endOf(question.group);
  else if (anchor)
    // among the rows right after a row question; otherwise past the group, or past the question
    index =
      around === undefined || (rows && anchor.fieldKey !== around)
        ? section.fields.indexOf(anchor) + 1
        : endOf(around);
  else if (at !== undefined) {
    const blocks = blocksOf(section.fields);
    index = blocks.slice(0, Math.max(0, Math.min(at, blocks.length))).flat().length;
  }
  return {
    definition: withSection(def, sectionKey, (s) => ({
      ...s,
      fields: [...s.fields.slice(0, index), field, ...s.fields.slice(index)],
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
      if (coreLocks(f).condition) dropConditions(next);
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
    ...next,
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

/**
 * A code for a new option: random, never made from its text (an option starts without one, and
 * its texts change), and not one the question's options have. The code is never shown and never
 * changed, so a condition, the points of the score and a branching option that name it go on
 * naming the same option; and an option removed and another added never share a code, so an
 * answer stored under the old one in an earlier version never reads as the new option.
 */
function freshCode(taken: ReadonlySet<string>, makeCode: MakeKey = randomCode): string {
  for (;;) {
    const code = makeCode();
    if (!taken.has(code)) return code;
  }
}

const codesOf = (options: readonly FieldOption[]) => new Set(options.map((o) => o.code));

const optionOf = (code: string, label: FieldOption['label']): FieldOption => ({
  code,
  label,
  dependsOnOptionCode: null,
  allowsOtherText: false,
});

/** A new option to fill in, with a code none of the question's options has. */
export function emptyOption(options: readonly FieldOption[], makeCode?: MakeKey): FieldOption {
  return optionOf(freshCode(codesOf(options), makeCode), { bn: '', en: '' });
}

/** The options with a new empty one right after the option at `index`; the new one comes back too. */
export function insertOptionAfter(
  options: readonly FieldOption[],
  index: number,
  makeCode?: MakeKey,
): { options: FieldOption[]; added: FieldOption } {
  const added = emptyOption(options, makeCode);
  const at = Math.max(0, Math.min(index + 1, options.length));
  return { options: [...options.slice(0, at), added, ...options.slice(at)], added };
}

/** The lines of a pasted text that hold something, each without the space around it. */
export function pastedLines(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line !== '');
}

/**
 * The options after several lines are pasted into the text of the option at `index`. The first
 * line goes into that text where the cursor stands, in place of what is selected (`selected`, the
 * start and end in the text; the whole text when it is not given), so nothing already written is
 * lost. Into the Bengali text, each further line is a new option right after it, in order. Into
 * the English text, the further lines are the English texts of the options after it, line by line
 * as in a sheet, and a line with no option left to take it is a new option at the end. A question
 * holds 100 options at most; the lines beyond that are left out. The same list comes back when
 * there is nothing to place.
 */
export function pasteOptions(
  options: readonly FieldOption[],
  index: number,
  language: 'bn' | 'en',
  lines: readonly string[],
  makeCode?: MakeKey,
  selected?: { start: number; end: number },
): readonly FieldOption[] {
  const current = options.at(index);
  if (!current || index < 0 || lines.length === 0) return options;
  const [first = '', ...rest] = lines;
  const before = current.label[language];
  const text = selected
    ? before.slice(0, selected.start) + first + before.slice(selected.end)
    : first;
  const here: FieldOption = { ...current, label: { ...current.label, [language]: text } };
  const room = DEFINITION_LIMITS.optionsPerField - options.length;
  const taken = codesOf(options);
  const fresh = (label: FieldOption['label']) => {
    const code = freshCode(taken, makeCode);
    taken.add(code);
    return optionOf(code, label);
  };
  if (language === 'bn') {
    return [
      ...options.slice(0, index),
      here,
      ...rest.slice(0, Math.max(0, room)).map((bn) => fresh({ bn, en: '' })),
      ...options.slice(index + 1),
    ];
  }
  const next = options.map((option, i) => {
    if (i === index) return here;
    const en = lines.at(i - index);
    return i < index || en === undefined ? option : { ...option, label: { ...option.label, en } };
  });
  const extra = lines.slice(options.length - index, options.length - index + Math.max(0, room));
  return [...next, ...extra.map((en) => fresh({ bn: '', en }))];
}

/** The two options of a yes-or-no question, in both languages. */
export function yesNoOptions(
  texts: { yes: FieldOption['label']; no: FieldOption['label'] },
  makeCode?: MakeKey,
): FieldOption[] {
  const yes = emptyOption([], makeCode);
  return [
    { ...yes, label: texts.yes },
    { ...emptyOption([yes], makeCode), label: texts.no },
  ];
}

/** Removes a field, and a repeat group's members with it. */
export function removeField(def: FormDefinition, fieldKey: string): FormDefinition {
  const section = def.sections.find((s) => s.fields.some((f) => f.fieldKey === fieldKey));
  const field = section?.fields.find((f) => f.fieldKey === fieldKey);
  if (!section || !field) return def;
  return withSection(def, section.key, (s) => ({
    ...s,
    fields: s.fields.filter((f) => f.fieldKey !== fieldKey && groupOf(f) !== fieldKey),
  }));
}

/** Removes a section with its questions; a form keeps at least one, so its only section stays. */
export function removeSection(def: FormDefinition, key: string): FormDefinition {
  if (def.sections.length < 2 || !def.sections.some((s) => s.key === key)) return def;
  return { ...def, sections: def.sections.filter((s) => s.key !== key) };
}

/** How another place of the form reads a question's answer. */
export type UseKind =
  | 'show_if'
  | 'required_if'
  | 'section_condition'
  | 'calculation'
  | 'count_from'
  | 'options_depend_on'
  | 'pipe';

/** One place that reads a question about to be removed. */
export interface FieldUse {
  kind: UseKind;
  /** The removed questions it reads: the question asked about, a group's row questions with it. */
  used: string[];
  /** The part it is in; the part's own condition when no question is named. */
  section: string;
  field?: string;
}

/** The kinds of use a question makes of others, in the order they are named. */
const FIELD_USES = [
  'show_if',
  'required_if',
  'calculation',
  'count_from',
  'options_depend_on',
  'pipe',
] as const satisfies readonly UseKind[];

/** The texts of a question that may repeat an earlier answer. */
const pipedTexts = (field: FormField) => [
  field.label.bn,
  field.label.en,
  field.settings?.help?.bn ?? '',
  field.settings?.help?.en ?? '',
];

/** Every question a calculation reads: its terms, table cells, branch conditions, sums and counts. */
function calculationKeys(field: FormField): string[] {
  if (!field.calculation) return [];
  const refs = exprReferences(field.calculation.expr);
  return [
    ...refs.fields,
    ...refs.sums.flatMap((sum) => [sum.group, sum.field]),
    ...refs.counts.flatMap((count) => [
      count.group,
      ...(count.where ? conditionFields(count.where) : []),
    ]),
  ];
}

/** The questions a question reads, by the kind of use. */
function readBy(field: FormField, kind: (typeof FIELD_USES)[number]): string[] {
  const one = (key: string | undefined) => (key === undefined ? [] : [key]);
  switch (kind) {
    case 'show_if':
      return field.logic?.show_if ? conditionFields(field.logic.show_if) : [];
    case 'required_if':
      return field.logic?.required_if ? conditionFields(field.logic.required_if) : [];
    case 'calculation':
      return calculationKeys(field);
    case 'count_from':
      return one(field.settings?.repeat?.count_from);
    case 'options_depend_on':
      return one(field.logic?.options_depend_on);
    case 'pipe':
      return pipedTexts(field).flatMap(pipeKeys);
  }
}

/** The places left in the form that read one of the questions `gone` names, in form order. */
function usesOfKeys(def: FormDefinition, gone: ReadonlySet<string>, goneSection?: string) {
  const uses: FieldUse[] = [];
  for (const section of def.sections) {
    if (section.key === goneSection) continue;
    const note = (kind: UseKind, read: string[], field?: string) => {
      const used = [...new Set(read)].filter((key) => gone.has(key));
      if (used.length)
        uses.push({ kind, used, section: section.key, ...(field === undefined ? {} : { field }) });
    };
    if (section.condition) note('section_condition', conditionFields(section.condition));
    for (const field of section.fields) {
      if (gone.has(field.fieldKey)) continue;
      for (const kind of FIELD_USES) note(kind, readBy(field, kind), field.fieldKey);
    }
  }
  return uses;
}

/** The keys that go when a question is removed: its own, and a repeat group's row questions. */
function removedWith(def: FormDefinition, fieldKey: string): Set<string> {
  return new Set(
    def.sections
      .flatMap((s) => s.fields)
      .filter((f) => f.fieldKey === fieldKey || groupOf(f) === fieldKey)
      .map((f) => f.fieldKey),
  );
}

const sectionKeys = (def: FormDefinition, key: string) =>
  new Set(def.sections.find((s) => s.key === key)?.fields.map((f) => f.fieldKey));

/**
 * Where the rest of the form reads a question: a show or required condition, a part's condition,
 * a calculation (a term, a table cell, a branch's condition, a sum or a count of rows), the
 * number of a group's rows, the options that follow its answer, and its answer repeated in a
 * label or a help text. A repeat group is asked about together with its row questions, which go
 * with it; what they read among themselves is not a use.
 */
export function usesOf(def: FormDefinition, fieldKey: string): FieldUse[] {
  return usesOfKeys(def, removedWith(def, fieldKey));
}

/** Where the other parts of the form read the questions of a part. */
export function usesOfSection(def: FormDefinition, key: string): FieldUse[] {
  return usesOfKeys(def, sectionKeys(def, key), key);
}

/** A condition without the comparisons that read a removed question; null when none is left. */
function pruned(condition: Condition, gone: ReadonlySet<string>): Condition | null {
  // the same list when nothing in it read a removed question
  const kept = (list: Condition[]) => {
    let changed = false;
    const next = list.flatMap((c) => {
      const left = pruned(c, gone);
      if (left !== c) changed = true;
      return left ? [left] : [];
    });
    return changed ? next : list;
  };
  if ('all' in condition) {
    const all = kept(condition.all);
    return all === condition.all ? condition : all.length ? { all } : null;
  }
  if ('any' in condition) {
    const any = kept(condition.any);
    return any === condition.any ? condition : any.length ? { any } : null;
  }
  if ('not' in condition) {
    const not = pruned(condition.not, gone);
    return not === condition.not ? condition : not ? { not } : null;
  }
  const reads = isFieldRef(condition.value)
    ? [condition.field, condition.value.field]
    : [condition.field];
  return reads.some((key) => gone.has(key)) ? null : condition;
}

/** A text without the removed questions' answers in it, the gap they leave closed. */
function unpiped(text: string, gone: ReadonlySet<string>): string {
  const next = pipeWithout(text, (key) => gone.has(key));
  return next === text ? text : next.replace(/\s{2,}/g, ' ').trim();
}

/** A question that no longer reads the removed ones; the same object when it read none. */
function withoutUses(field: FormField, gone: ReadonlySet<string>): FormField {
  if (!FIELD_USES.some((kind) => readBy(field, kind).some((key) => gone.has(key)))) return field;
  const next: FormField = { ...field };
  const { show_if: showIf, required_if: requiredIf, ...rest } = field.logic ?? {};
  const logic: NonNullable<FormField['logic']> = rest;
  const show = showIf ? pruned(showIf, gone) : null;
  if (show) logic.show_if = show;
  const required = requiredIf ? pruned(requiredIf, gone) : null;
  if (required) logic.required_if = required;
  if (logic.options_depend_on !== undefined && gone.has(logic.options_depend_on)) {
    delete logic.options_depend_on;
    // an option follows an answer of the question that is gone, so it follows none
    next.options = (field.options ?? []).map((o) =>
      o.dependsOnOptionCode ? { ...o, dependsOnOptionCode: null } : o,
    );
  }
  if (Object.keys(logic).length) next.logic = logic;
  else delete next.logic;
  // the rule goes whole: half a sum would be a wrong answer, and the publish check asks for a rule
  if (calculationKeys(field).some((key) => gone.has(key))) delete next.calculation;
  const repeat = field.settings?.repeat;
  if (repeat?.count_from !== undefined && gone.has(repeat.count_from)) {
    const { count_from: _source, ...rows } = repeat;
    next.settings = { ...next.settings, repeat: rows };
  }
  next.label = { bn: unpiped(field.label.bn, gone), en: unpiped(field.label.en, gone) };
  const help = next.settings?.help;
  if (help)
    next.settings = {
      ...next.settings,
      help: { bn: unpiped(help.bn, gone), en: unpiped(help.en, gone) },
    };
  return next;
}

/** The form without what read the removed questions, so the draft names nothing that is gone. */
function cleaned(def: FormDefinition, gone: ReadonlySet<string>): FormDefinition {
  return {
    ...def,
    sections: def.sections.map((section) => {
      const condition = section.condition ? pruned(section.condition, gone) : section.condition;
      let changed = condition !== section.condition;
      const fields = section.fields.map((f) => {
        const next = withoutUses(f, gone);
        if (next !== f) changed = true;
        return next;
      });
      return changed ? { ...section, condition, fields } : section;
    }),
  };
}

/**
 * Removes a question (a repeat group with its row questions) together with every use `usesOf`
 * names: a condition that read only it goes, a group of conditions loses that comparison, a
 * calculation that read it loses its rule (the question stays, and publishing asks for a rule),
 * a group's rows follow no question, options that followed its answer always show, and its answer
 * is taken out of the texts it was repeated in. A question nothing reads is removed as by
 * `removeField`.
 */
export function removeFieldWithUses(def: FormDefinition, fieldKey: string): FormDefinition {
  const next = removeField(def, fieldKey);
  return next === def ? def : cleaned(next, removedWith(def, fieldKey));
}

/** Removes a part with its questions and every use of them in the other parts. */
export function removeSectionWithUses(def: FormDefinition, key: string): FormDefinition {
  const next = removeSection(def, key);
  return next === def ? def : cleaned(next, sectionKeys(def, key));
}

/** Renames a part; a text may wait for its other language until the form is published. */
export function setSectionTitle(
  def: FormDefinition,
  key: string,
  title: FormSection['title'],
): FormDefinition {
  return withSection(def, key, (s) =>
    s.title.bn === title.bn && s.title.en === title.en ? s : { ...s, title },
  );
}

/** A section that holds an identity question stays visible to everyone. */
export function setSectionVisibility(
  def: FormDefinition,
  key: string,
  visibility: FormSection['visibility'],
): FormDefinition {
  return withSection(def, key, (s) =>
    (visibility === 'official_only' && hasIdentity(s)) || s.visibility === visibility
      ? s
      : { ...s, visibility },
  );
}

/** A section that holds an identity question is always shown. */
export function setSectionCondition(
  def: FormDefinition,
  key: string,
  condition: Condition | null,
): FormDefinition {
  return withSection(def, key, (s) => (hasIdentity(s) && condition ? s : { ...s, condition }));
}

export function moveSection(def: FormDefinition, key: string, direction: -1 | 1): FormDefinition {
  const index = def.sections.findIndex((s) => s.key === key);
  const target = index + direction;
  if (index < 0 || target < 0 || target >= def.sections.length) return def;
  const sections = [...def.sections];
  [sections[index], sections[target]] = [sections[target]!, sections[index]!];
  return { ...def, sections };
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

/**
 * Moves a field to a place in a section: `index` counts the blocks of that section (a repeat
 * group with its members is one block), and a field dropped on its own place stays. An identity
 * question never goes into an official-only or conditional section, and a member of a repeat group
 * moves only inside its group.
 */
export function moveFieldTo(
  def: FormDefinition,
  fieldKey: string,
  sectionKey: string,
  index: number,
): FormDefinition {
  const from = def.sections.find((s) => s.fields.some((f) => f.fieldKey === fieldKey));
  const to = def.sections.find((s) => s.key === sectionKey);
  const field = from?.fields.find((f) => f.fieldKey === fieldKey);
  if (!from || !to || !field) return def;
  if (groupOf(field) !== undefined) return def;
  if (identityRoleOf(field) && (to.visibility === 'official_only' || to.condition)) return def;
  const block = from.fields.filter((f) => f.fieldKey === fieldKey || groupOf(f) === fieldKey);
  const without = (fields: readonly FormField[]) => fields.filter((f) => !block.includes(f));
  const place = (fields: readonly FormField[]) => {
    const blocks = blocksOf(fields);
    const at = Math.max(0, Math.min(index, blocks.length));
    return [...blocks.slice(0, at).flat(), ...block, ...blocks.slice(at).flat()];
  };
  if (from.key === to.key) {
    const next = place(without(from.fields));
    if (next.every((f, i) => f === from.fields[i])) return def;
    return withSection(def, from.key, (s) => ({ ...s, fields: next }));
  }
  return {
    ...def,
    sections: def.sections.map((s) =>
      s.key === from.key
        ? { ...s, fields: without(s.fields) }
        : s.key === to.key
          ? { ...s, fields: place(s.fields) }
          : s,
    ),
  };
}

/**
 * Copies a question right after itself as one of the project's own, with the label marked as a
 * copy in both languages and a random key of its own; its options, settings, logic and
 * calculation come along; the copy carries no identity mark. A row question of a repeat group is
 * copied inside its group; a whole repeat group is not copied.
 */
export function duplicateField(
  def: FormDefinition,
  fieldKey: string,
  mark: { bn: string; en: string },
  makeKey?: MakeKey,
): { definition: FormDefinition; fieldKey: string | null } {
  const section = def.sections.find((s) => s.fields.some((f) => f.fieldKey === fieldKey));
  const field = section?.fields.find((f) => f.fieldKey === fieldKey);
  if (!section || !field) return { definition: def, fieldKey: null };
  if (field.type === 'repeat_group') return { definition: def, fieldKey: null };
  // a question with no text yet is copied with the mark alone
  const label = {
    bn: `${field.label.bn} ${mark.bn}`.trim(),
    en: `${field.label.en} ${mark.en}`.trim(),
  };
  const key = freshKey(def, makeKey);
  const copy: FormField = {
    ...structuredClone(field),
    fieldKey: key,
    libraryFieldKey: null,
    standardColumn: null,
    label,
  };
  const index = section.fields.indexOf(field);
  return {
    definition: withSection(def, section.key, (s) => ({
      ...s,
      fields: [...s.fields.slice(0, index + 1), copy, ...s.fields.slice(index + 1)],
    })),
    fieldKey: key,
  };
}

/**
 * Marks a question with an identity role, or clears its mark (`role` null). The marked question
 * takes the role's column and answer type (its settings start afresh when the type changes, and
 * a type without options drops them), stays required and loses its show and required conditions;
 * a question that held the role before loses it, so each role is marked once. A repeat group, a
 * member of one, and a question in an official-only or conditional section take no mark.
 */
export function setIdentityRole(
  def: FormDefinition,
  fieldKey: string,
  role: CoreFieldKey | null,
): FormDefinition {
  const section = def.sections.find((s) => s.fields.some((f) => f.fieldKey === fieldKey));
  const field = section?.fields.find((f) => f.fieldKey === fieldKey);
  if (!section || !field) return def;
  if (role === null) {
    if (identityRoleOf(field) === null) return def;
    return updateField(def, fieldKey, { standardColumn: null });
  }
  if (!canMarkIdentity(section, field) || identityRoleOf(field) === role) return def;
  const core = CORE_FIELDS.find((c) => c.key === role);
  if (!core) return def;
  const cleared: FormDefinition = {
    ...def,
    sections: def.sections.map((s) => ({
      ...s,
      fields: s.fields.map((f) =>
        f.fieldKey !== fieldKey && identityRoleOf(f) === role ? { ...f, standardColumn: null } : f,
      ),
    })),
  };
  const retyped = field.type !== core.type;
  return withSection(cleared, section.key, (s) => ({
    ...s,
    fields: s.fields.map((f) => {
      if (f.fieldKey !== fieldKey) return f;
      const next: FormField = {
        ...f,
        type: core.type,
        standardColumn: core.standardColumn,
        required: true,
        ...(retyped ? { settings: {} } : {}),
        ...(isChoiceType(core.type) ? {} : { options: [] }),
      };
      dropConditions(next);
      delete next.calculation;
      return next;
    }),
  }));
}

/** Whether a question can take an identity mark where it stands. */
export function canMarkIdentity(section: FormSection, field: FormField): boolean {
  return (
    section.visibility === 'volunteer' &&
    !section.condition &&
    field.type !== 'repeat_group' &&
    field.settings?.repeat?.group === undefined
  );
}

/** The identity roles no question of the form is marked with, in the order of the roles. */
export function missingIdentityRoles(def: FormDefinition): CoreFieldKey[] {
  const marked = new Set(def.sections.flatMap((s) => s.fields.map((f) => identityRoleOf(f))));
  return CORE_FIELDS.filter((core) => !marked.has(core.key)).map((core) => core.key);
}

/** A part that takes identity questions: seen by everyone, always shown. */
const takesIdentity = (section: FormSection) =>
  section.visibility === 'volunteer' && !section.condition;

/**
 * Adds a question for every identity role a beneficiary application form has none marked with,
 * in the order of the roles, at the end of the first part everyone always sees (a new part at the
 * end of the form, titled by `title`, when the form has no such part). A role takes the library's
 * question of it, with the library's own texts and settings, where the library has one of the
 * role's type that the form does not hold yet; otherwise a new question of the role's type,
 * marked and worded in both languages by `wording`, so the form asks something from the start and
 * the wording can be changed afterwards. Each added question is required and has no condition. A
 * role already marked is left alone, and a form of another kind gets nothing. With them come the
 * two questions on whose number the mobile is (`addMobileOwnerQuestions`), which are no identity
 * questions, also on a form that lacks no identity question and only those two. The keys of the
 * added questions come back, the identity questions in the order of the roles and then those two,
 * with the part the first of them went to.
 */
export function addIdentityQuestions(
  def: FormDefinition,
  library: LibraryFields,
  options: {
    kind: FormKind | undefined;
    title: (n: number) => { bn: string; en: string };
    wording: (role: CoreFieldKey | MobileOwnerWording) => { bn: string; en: string };
    makeKey?: MakeKey;
  },
): { definition: FormDefinition; section: string | null; fieldKeys: string[] } {
  if (options.kind !== 'beneficiary_application')
    return { definition: def, section: null, fieldKeys: [] };
  const roles = missingIdentityRoles(def);
  let next = def;
  let section = def.sections.find(takesIdentity)?.key;
  // a new part only for identity questions that have none to go to
  if (section === undefined && roles.length) {
    const made = addEmptySection(def, options.title);
    next = made.definition;
    section = made.key;
  }
  const fieldKeys: string[] = [];
  for (const role of roles) {
    // the part exists whenever a role is missing
    if (section === undefined) break;
    const core = CORE_FIELDS.find((c) => c.key === role)!;
    const taken = allKeys(next);
    // the library's question of the role: one question, of the role's type, not in the form yet
    const ready = [...library.values()].find(
      (placed) =>
        placed.length === 1 &&
        identityRoleOf(placed[0]!) === role &&
        placed[0]!.type === core.type &&
        !taken.has(placed[0]!.fieldKey),
    );
    if (ready) {
      const key = ready[0]!.fieldKey;
      // a marked question stays required and without a condition, whatever the library's has
      next = updateField(addLibraryField(next, section, ready), key, { required: true });
      fieldKeys.push(key);
      continue;
    }
    const added = addOwnQuestion(next, section, { type: core.type }, undefined, options.makeKey);
    if (!added.fieldKey) continue;
    next = updateField(setIdentityRole(added.definition, added.fieldKey, role), added.fieldKey, {
      label: options.wording(role),
    });
    fieldKeys.push(added.fieldKey);
  }
  const owner = addMobileOwnerQuestions(next, library, options);
  const added = [...fieldKeys, ...owner.fieldKeys];
  if (!added.length) return { definition: def, section: null, fieldKeys: [] };
  return {
    definition: owner.definition,
    section: fieldKeys.length ? (section ?? null) : owner.section,
    fieldKeys: added,
  };
}

/** Whether the form asks the mobile and has no question on whose number it is. */
export function lacksMobileOwnerQuestion(def: FormDefinition): boolean {
  const fields = def.sections.flatMap((s) => s.fields);
  return (
    fields.some((f) => identityRoleOf(f) === 'mobile') &&
    !fields.some((f) => f.standardColumn === MOBILE_OWNER_COLUMN && groupOf(f) === undefined)
  );
}

/**
 * The two questions on whose number the mobile is: the column each fills, its answer type and
 * the name of its starting wording. Neither is an identity question.
 */
const MOBILE_OWNER_QUESTIONS = [
  { column: MOBILE_OWNER_COLUMN, type: 'single_select', wording: 'mobile_owner' },
  { column: MOBILE_OWNER_NAME_COLUMN, type: 'short_text', wording: 'mobile_owner_name' },
] as const satisfies readonly { column: string; type: FieldType; wording: string }[];
export type MobileOwnerWording = (typeof MOBILE_OWNER_QUESTIONS)[number]['wording'];

/**
 * Adds, right after the form's mobile question, the question whose number it is and, after that
 * one, the question for the owner's name: the library's question of the column where the library
 * has one of that type the form does not hold yet, otherwise a new one worded by `wording`.
 * Neither is required or marked as identity. The first shows only when the mobile is answered,
 * the second only when the owner is answered and is not the person's own. A column the form
 * already has a question for gets no second one, and a form without a mobile question gets
 * neither. The keys of the added questions come back in their order, with the part the first of
 * them went to.
 */
export function addMobileOwnerQuestions(
  def: FormDefinition,
  library: LibraryFields,
  options: {
    wording: (name: MobileOwnerWording) => { bn: string; en: string };
    makeKey?: MakeKey;
  },
): { definition: FormDefinition; section: string | null; fieldKeys: string[] } {
  const fieldsOf = (d: FormDefinition) => d.sections.flatMap((s) => s.fields);
  const mobile = fieldsOf(def).find((f) => identityRoleOf(f) === 'mobile');
  if (!mobile) return { definition: def, section: null, fieldKeys: [] };
  let next = def;
  const fieldKeys: string[] = [];
  let first: string | null = null;
  // each follows the question it depends on: the owner the mobile, the owner's name the owner
  let anchor = mobile.fieldKey;
  for (const question of MOBILE_OWNER_QUESTIONS) {
    const held = fieldsOf(next).find(
      (f) => f.standardColumn === question.column && groupOf(f) === undefined,
    );
    if (held) {
      anchor = held.fieldKey;
      continue;
    }
    const section = next.sections.find((s) => s.fields.some((f) => f.fieldKey === anchor));
    if (!section) break;
    first ??= section.key;
    const taken = allKeys(next);
    const ready = [...library.values()].find(
      (placed) =>
        placed.length === 1 &&
        placed[0]!.standardColumn === question.column &&
        placed[0]!.type === question.type &&
        !taken.has(placed[0]!.fieldKey),
    )?.[0];
    let key: string;
    if (ready) {
      key = ready.fieldKey;
      const at = section.fields.findIndex((f) => f.fieldKey === anchor) + 1;
      next = withSection(next, section.key, (s) => ({
        ...s,
        fields: [...s.fields.slice(0, at), ready, ...s.fields.slice(at)],
      }));
    } else {
      const added = addOwnQuestion(
        next,
        section.key,
        { type: question.type, after: anchor },
        undefined,
        options.makeKey,
      );
      if (!added.fieldKey) break;
      key = added.fieldKey;
      next = updateField(added.definition, key, {
        standardColumn: question.column,
        label: options.wording(question.wording),
        // the profile keeps a name of this length at most
        ...(question.column === MOBILE_OWNER_NAME_COLUMN
          ? { settings: { validation: { max_length: MOBILE_OWNER_NAME_MAX } } }
          : {}),
      });
    }
    const condition: Condition =
      question.column === MOBILE_OWNER_COLUMN
        ? { field: anchor, op: 'not_empty' }
        : { field: anchor, op: 'neq', value: MOBILE_OWNER_OWN };
    next = updateField(next, key, {
      required: false,
      logic: { ...(ready?.logic ?? {}), show_if: condition },
    });
    fieldKeys.push(key);
    anchor = key;
  }
  return { definition: next, section: fieldKeys.length ? first : null, fieldKeys };
}

/**
 * Adds an empty section seen by everyone at the end of the form, keyed `section_<n>` with the
 * first free number and titled from `title`, which names the number; the new key is returned.
 */
export function addEmptySection(
  def: FormDefinition,
  title: (n: number) => { bn: string; en: string },
): { definition: FormDefinition; key: string } {
  const taken = new Set(def.sections.map((s) => s.key));
  let n = def.sections.length + 1;
  while (taken.has(`section_${n}`)) n += 1;
  const key = `section_${n}`;
  return {
    definition: {
      ...def,
      sections: [...def.sections, { ...emptySection(key, title(n)), librarySectionKey: null }],
    },
    key,
  };
}

/** Drops a field's show and required conditions in place, keeping the rest of its logic. */
function dropConditions(field: FormField): void {
  const { show_if: _show, required_if: _required, ...logic } = field.logic ?? {};
  if (Object.keys(logic).length) field.logic = logic;
  else delete field.logic;
}

/** A text of the form in both languages, as the form holds it. */
type BothTexts = { bn: string; en: string };

/** One text of the form in both languages, and where it stands. */
export interface FormTextRow {
  /** The same for as long as the form keeps its keys and codes: the place, the kind and the item. */
  id: string;
  /** The part, and the question the text belongs to; a part's name has no question. */
  place: Selection;
  kind: FormTextKind;
  /** The option's or the result's code, or the table row's or column's key, for those kinds. */
  item?: string;
  /** The place of the item among its like (the third option is 2); 0 for the other kinds. */
  index: number;
  bn: string;
  en: string;
  /** An option that a reference list gives: read here, changed in the list. */
  locked: boolean;
}

/** A help text or a placeholder empty in both languages is none, as the publish check reads it. */
const written = (text: BothTexts | undefined): text is BothTexts =>
  text !== undefined && (text.bn.trim() !== '' || text.en.trim() !== '');

/**
 * Every text of the form in both languages, in the form's order: a part's name, then each of its
 * questions with its text, its help text and its placeholder (where it has one), its options, its
 * table's rows and columns and its calculation's text results. These are the texts the publish
 * check asks for in both languages.
 */
export function textsOf(def: FormDefinition): FormTextRow[] {
  const rows: FormTextRow[] = [];
  for (const section of def.sections) {
    const add = (
      kind: FormTextKind,
      text: BothTexts,
      field?: FormField,
      item?: { key: string; index: number },
    ) =>
      rows.push({
        id: [kind, field?.fieldKey ?? section.key, ...(item ? [item.key] : [])].join('|'),
        place: field ? { section: section.key, field: field.fieldKey } : { section: section.key },
        kind,
        ...(item ? { item: item.key } : {}),
        index: item?.index ?? 0,
        bn: text.bn,
        en: text.en,
        locked: kind === 'option' && field !== undefined && listOfField(field) !== null,
      });
    add('title', section.title);
    for (const field of section.fields) {
      const settings = field.settings;
      add('label', field.label, field);
      if (written(settings?.help)) add('help', settings.help, field);
      if (written(settings?.placeholder)) add('placeholder', settings.placeholder, field);
      (field.options ?? []).forEach((o, index) =>
        add('option', o.label, field, { key: o.code, index }),
      );
      (settings?.table?.rows ?? []).forEach((r, index) =>
        add('table_row', r.label, field, { key: r.key, index }),
      );
      (settings?.table?.cols ?? []).forEach((c, index) =>
        add('table_col', c.label, field, { key: c.key, index }),
      );
      (settings?.results ?? []).forEach((r, index) =>
        add('result', r.label, field, { key: r.code, index }),
      );
    }
  }
  return rows;
}

/**
 * The languages a text is not written in yet; a text of only spaces is not written. A help text
 * or a placeholder is optional, so one empty in both languages lacks nothing.
 */
export function missingIn(text: BothTexts & { kind?: FormTextKind }): ('bn' | 'en')[] {
  const lacks = (['bn', 'en'] as const).filter(
    (language) => (language === 'bn' ? text.bn : text.en).trim() === '',
  );
  const optional = text.kind === 'help' || text.kind === 'placeholder';
  return optional && lacks.length === 2 ? [] : lacks;
}

/** How many texts still lack a language, each language of each text counted once. */
export function missingTextCount(rows: readonly FormTextRow[]): number {
  return rows.reduce((n, row) => n + missingIn(row).length, 0);
}

/**
 * Writes one text of the form in one language and leaves every other text as it is. A help text
 * or a placeholder is there from its first letter and taken away when emptied in both languages.
 * An option a reference list gives is not changed, nor an option, a row, a column or a result
 * the form does not have.
 */
export function setText(
  def: FormDefinition,
  row: Pick<FormTextRow, 'place' | 'kind' | 'item'>,
  language: 'bn' | 'en',
  value: string,
): FormDefinition {
  const section = def.sections.find((s) => s.key === row.place.section);
  if (!section) return def;
  const put = <T extends BothTexts>(text: T): T => ({ ...text, [language]: value });
  if (row.kind === 'title') return setSectionTitle(def, section.key, put(section.title));
  const field = section.fields.find((f) => f.fieldKey === row.place.field);
  if (!field) return def;
  const same = (text: BothTexts | undefined) => (language === 'bn' ? text?.bn : text?.en) === value;
  /** The list with the text of the item `row` names written; the same list when it is not there. */
  const inList = <T extends { label: BothTexts }>(list: readonly T[], keyOf: (x: T) => string) =>
    list.some((x) => keyOf(x) === row.item && !same(x.label))
      ? list.map((x) => (keyOf(x) === row.item ? { ...x, label: put(x.label) } : x))
      : null;
  const settings = field.settings ?? {};
  switch (row.kind) {
    case 'label':
      return same(field.label)
        ? def
        : updateField(def, field.fieldKey, { label: put(field.label) });
    case 'help':
    case 'placeholder': {
      const text = settings[row.kind] ?? { bn: '', en: '' };
      if (same(text)) return def;
      const next = put(text);
      const { [row.kind]: _old, ...rest } = settings;
      return updateField(def, field.fieldKey, {
        settings: written(next) ? { ...rest, [row.kind]: next } : rest,
      });
    }
    case 'option': {
      if (listOfField(field) !== null) return def;
      const options = inList(field.options ?? [], (o) => o.code);
      return options ? setOptions(def, field.fieldKey, options) : def;
    }
    case 'table_row':
    case 'table_col': {
      const table = settings.table;
      const rows = row.kind === 'table_row';
      const lines = table ? inList(rows ? table.rows : table.cols, (line) => line.key) : null;
      return table && lines
        ? updateField(def, field.fieldKey, {
            settings: {
              ...settings,
              table: rows ? { ...table, rows: lines } : { ...table, cols: lines },
            },
          })
        : def;
    }
    case 'result': {
      const results = inList(settings.results ?? [], (r) => r.code);
      return results
        ? updateField(def, field.fieldKey, { settings: { ...settings, results } })
        : def;
    }
  }
}

/**
 * Sets the points of "not previously assisted"; an emptied value takes them away, and a form
 * without any form-level points holds no `scoring` at all.
 */
export function setFormScoring(def: FormDefinition, points: number | undefined): FormDefinition {
  const { scoring: _old, ...rest } = def;
  return points === undefined ? rest : { ...rest, scoring: { not_previously_assisted: points } };
}
