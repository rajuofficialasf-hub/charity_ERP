import { isNidNumber } from '../beneficiaries/identity.js';
import type { AnswerValue } from '../jsonb/answer-value.js';
import { FAMILY_MEMBERS_TABLE, isFamilyMemberColumn, isStandardColumn } from './core.js';
import { indexFields, type FormDefinition, type LocatedField } from './definition.js';
import type { Answer } from './evaluate.js';

/**
 * Which answers go to the beneficiary profile and which stay with the application. A standard
 * field names its beneficiary column (or the family-member table for the earners group); every
 * other answer, and every calculated one, is an application answer. The application service
 * never decides this on its own.
 */

/**
 * A definition that names a column outside the allowlist reached the split: the check of the
 * definition was skipped somewhere, and nothing is written for it.
 */
export class SplitError extends Error {
  constructor(
    readonly fieldKey: string,
    readonly column: string,
  ) {
    super(`form.standard_column_unknown: ${fieldKey} -> ${column}`);
    this.name = 'SplitError';
  }
}

export interface FamilyMemberRow {
  /** The repeat group the row came from (a form may hold the members and the earners). */
  group: string;
  /** The row's index in that group. */
  repeatIndex: number;
  /** Column (snake_case) → value, from the member fields' own standard columns. */
  columns: Record<string, unknown>;
  /** From the group's setting; its rows are earners unless it says otherwise. */
  isEarner: boolean;
}

export interface SplitAnswers {
  /** Beneficiary column (snake_case) → value. */
  standard: Record<string, unknown>;
  familyMembers: FamilyMemberRow[];
  custom: Answer[];
}

/** The column an identity number fills: a 10, 13 or 17 digit number is an NID, else a birth registration. */
export function identityColumn(value: string): 'nid' | 'birth_reg' {
  return isNidNumber(value) ? 'nid' : 'birth_reg';
}

/** The column values one answer gives, by the columns its field names. */
function columnsOf(standardColumn: string, value: AnswerValue): [string, unknown][] {
  const columns = standardColumn.split(',');
  switch (value.t) {
    case 'bd_address': {
      const ids = [value.division_id, value.district_id, value.upazila_id, value.union_id];
      return columns.map((column, i) => [column, ids[i] ?? null]);
    }
    case 'gps': {
      const parts = [value.lat, value.lng, value.accuracy_m ?? null];
      return columns.map((column, i) => [column, parts[i] ?? null]);
    }
    case 'photo':
    case 'file':
    case 'signature':
      return [[standardColumn, value.v[0] ?? null]];
    case 'single_select':
    case 'radio': {
      const pairs: [string, unknown][] = [[standardColumn, value.v]];
      if (value.other !== undefined)
        pairs.push([`${standardColumn.replace(/_code$/u, '')}_other_text`, value.other]);
      return pairs;
    }
    case 'multi_select':
    case 'checkbox':
      return [[standardColumn, value.v]];
    case 'calculation':
    case 'number_table':
      return [];
    case 'short_text':
    case 'long_text':
    case 'phone':
    case 'email':
    case 'signature_ref':
      if (standardColumn === 'nid_or_birth_reg') return [[identityColumn(value.v), value.v]];
      return [[standardColumn, value.v]];
    case 'number':
    case 'decimal':
    case 'money':
    case 'date':
    case 'time':
    case 'datetime':
      return [[standardColumn, value.v]];
  }
}

const isFamilyGroup = (located: LocatedField | undefined) =>
  located !== undefined &&
  located.field.type === 'repeat_group' &&
  located.field.standardColumn === FAMILY_MEMBERS_TABLE;

/**
 * Splits validated answers: standard columns, family-member rows and the custom answers. The
 * answers must already be validated; unknown keys are kept as custom answers so nothing is lost.
 */
export function split(definition: FormDefinition, answers: readonly Answer[]): SplitAnswers {
  const fields = indexFields(definition);
  const standard = new Map<string, unknown>();
  const members = new Map<
    string,
    { group: string; repeatIndex: number; earner: boolean; columns: Map<string, unknown> }
  >();
  const custom: Answer[] = [];
  for (const answer of answers) {
    const located = fields.get(answer.fieldKey);
    const column = located?.field.standardColumn ?? null;
    const calculated = located?.field.type === 'calculation' || answer.value.t === 'calculation';
    if (!located || column === null || calculated) {
      custom.push(answer);
      continue;
    }
    const group = located.group !== null ? fields.get(located.group) : undefined;
    if (located.group !== null && isFamilyGroup(group)) {
      if (!isFamilyMemberColumn(column)) throw new SplitError(answer.fieldKey, column);
      const repeatIndex = answer.repeatIndex ?? 0;
      const key = `${located.group}:${repeatIndex}`;
      let row = members.get(key);
      if (!row)
        members.set(
          key,
          (row = {
            group: located.group,
            repeatIndex,
            earner: group?.field.settings?.repeat?.earner ?? true,
            columns: new Map(),
          }),
        );
      for (const [name, value] of columnsOf(column, answer.value)) row.columns.set(name, value);
      continue;
    }
    if (located.group !== null) {
      custom.push(answer);
      continue;
    }
    if (!isStandardColumn(column)) throw new SplitError(answer.fieldKey, column);
    for (const [name, value] of columnsOf(column, answer.value)) standard.set(name, value);
  }
  const familyMembers = [...members.values()]
    .sort((a, b) => a.group.localeCompare(b.group) || a.repeatIndex - b.repeatIndex)
    .map((row) => ({
      group: row.group,
      repeatIndex: row.repeatIndex,
      columns: Object.fromEntries(row.columns),
      isEarner: row.earner,
    }));
  return { standard: Object.fromEntries(standard), familyMembers, custom };
}
