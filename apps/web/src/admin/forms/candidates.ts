import type { ConditionOp } from '@css/shared';
import {
  type FieldType,
  type FormDefinition,
  type FormField,
  isChoiceType,
} from '@css/shared/forms';

/**
 * The questions each editor of the settings pane may point at. A question inside a repeat group
 * reads only the plain questions and the questions of its own group (each row is separate); a
 * plain question reads plain questions, and a calculation may also add up a group question over
 * all rows. The server checks the same rules again when the draft is saved.
 */

const groupOf = (field: FormField) => field.settings?.repeat?.group ?? null;

interface Placed {
  field: FormField;
  section: number;
  group: string | null;
}

function placed(def: FormDefinition): Placed[] {
  return def.sections.flatMap((s, section) =>
    s.fields.map((field) => ({ field, section, group: groupOf(field) })),
  );
}

/** Who asks: a question (with its group) or a section (no question, no group). */
export interface Asker {
  fieldKey?: string;
  group: string | null;
}

const reachable = (p: Placed, asker: Asker) =>
  p.field.fieldKey !== asker.fieldKey && (p.group === null || p.group === asker.group);

/** Answers a condition cannot compare: no answer, or one made of parts. */
const NO_CONDITION: ReadonlySet<FieldType> = new Set([
  'note',
  'repeat_group',
  'photo',
  'file',
  'signature',
  'gps',
  'bd_address',
]);

export function conditionCandidates(def: FormDefinition, asker: Asker): FormField[] {
  return placed(def)
    .filter((p) => reachable(p, asker) && !NO_CONDITION.has(p.field.type))
    .map((p) => p.field);
}

export type OpKind = 'choice' | 'number' | 'date' | 'text';

const NUMERIC: ReadonlySet<FieldType> = new Set(['number', 'decimal', 'money', 'calculation']);

export function opKindOf(field: FormField): OpKind {
  if (isChoiceType(field.type)) return 'choice';
  if (NUMERIC.has(field.type)) return 'number';
  if (field.type === 'date') return 'date';
  return 'text';
}

/** The comparisons offered for each kind of answer; the first is the one a new row starts with. */
export const OPS: Readonly<Record<OpKind, readonly ConditionOp[]>> = {
  choice: ['eq', 'neq', 'in', 'not_in', 'is_empty', 'not_empty'],
  number: ['eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'is_empty', 'not_empty'],
  date: ['eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'is_empty', 'not_empty'],
  text: ['eq', 'neq', 'is_empty', 'not_empty'],
};

/** The terms a calculation adds, subtracts, multiplies or divides. */
export function termCandidates(
  def: FormDefinition,
  asker: Asker,
): { fields: FormField[]; sums: { group: FormField; field: FormField }[] } {
  const all = placed(def);
  const fields = all
    .filter((p) => reachable(p, asker) && NUMERIC.has(p.field.type))
    .map((p) => p.field);
  // only a plain question adds up a group question over its rows
  const sums =
    asker.group === null
      ? all.flatMap((p) => {
          const group = all.find((g) => g.field.fieldKey === p.group)?.field;
          return group && p.field.fieldKey !== asker.fieldKey && NUMERIC.has(p.field.type)
            ? [{ group, field: p.field }]
            : [];
        })
      : [];
  return { fields, sums };
}

/** The date of birth an age is worked out from. */
export function dateCandidates(def: FormDefinition, asker: Asker): FormField[] {
  return placed(def)
    .filter((p) => reachable(p, asker) && p.field.type === 'date')
    .map((p) => p.field);
}

/** The net assets compared with the nisab: an amount or another calculation. */
export function netCandidates(def: FormDefinition, asker: Asker): FormField[] {
  return placed(def)
    .filter(
      (p) => reachable(p, asker) && (p.field.type === 'money' || p.field.type === 'calculation'),
    )
    .map((p) => p.field);
}

/**
 * The earlier single-choice questions a question's options may follow: in an earlier section, or
 * before it in its own section (a new question goes last, so every one of its section counts).
 */
export function parentCandidates(
  def: FormDefinition,
  sectionKey: string,
  fieldKey?: string,
): FormField[] {
  const sectionIndex = def.sections.findIndex((s) => s.key === sectionKey);
  const out: FormField[] = [];
  for (const [i, s] of def.sections.entries()) {
    if (i > sectionIndex) break;
    for (const f of s.fields) {
      if (f.fieldKey === fieldKey) return out;
      if (f.type === 'single_select' || f.type === 'radio') out.push(f);
    }
  }
  return out;
}
