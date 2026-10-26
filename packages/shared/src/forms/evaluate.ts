import type { AnswerValue } from '../jsonb/answer-value.js';
import { isFieldRef, withinLimits } from '../jsonb/form-logic.js';
import { fromPaisa, isAmount, toPaisa } from '../projects/budget.js';
import {
  indexFields,
  type Condition,
  type Expr,
  type FieldOption,
  type FormDefinition,
  type LocatedField,
} from './definition.js';

/**
 * The one evaluator of a form, run on the phone and on the server with the same input and the
 * same answer: for every field whether it shows, whether it is required and which options it
 * offers, and the value of every calculated field. No I/O; the nisab in force and today's date
 * come in through the context.
 */

/** One answer as the API takes it: the field key, the repeat row (0 for a plain field), the value. */
export interface Answer {
  fieldKey: string;
  repeatIndex?: number;
  value: AnswerValue;
}

export interface EvaluationContext {
  /** The nisab in force, as an amount in Taka; absent when none is set. */
  nisabValue?: string;
  /** Today's date as `yyyy-mm-dd`, for the age from a date of birth. */
  today: string;
}

export interface FieldState {
  visible: boolean;
  required: boolean;
  /** The options the field offers now (branching applied); empty for a field without options. */
  options: FieldOption[];
}

/** A calculated value: money as an amount string, a number, a comparison, or nothing. */
export type ComputedValue = number | string | boolean | null;

export interface Evaluation {
  /** Section key → visible. */
  sections: Record<string, boolean>;
  /** Field path (`key`, or `key[row]` inside a repeat group) → state. */
  fields: Record<string, FieldState>;
  /** Field path → the calculated value of every visible calculation field. */
  computed: Record<string, ComputedValue>;
  /** Repeat group key → the number of rows the answers hold. */
  rows: Record<string, number>;
}

/** The path of a field in an error or a state: `key` for a plain field, `key[row]` in a group. */
export function fieldPath(fieldKey: string, repeatIndex: number, inGroup: boolean): string {
  return inGroup ? `${fieldKey}[${repeatIndex}]` : fieldKey;
}

/** A value as conditions read it: text, number, choice codes, or nothing. */
export type Plain = string | number | boolean | string[] | null;

/** What a stored answer is worth in a condition. A calculated answer counts for nothing here. */
export function plainOf(value: AnswerValue): Plain {
  switch (value.t) {
    case 'short_text':
    case 'long_text':
    case 'phone':
    case 'email':
    case 'signature_ref':
    case 'money':
    case 'date':
    case 'time':
    case 'datetime':
      return value.v.trim() === '' ? null : value.v;
    case 'number':
    case 'decimal':
      return value.v;
    case 'single_select':
    case 'radio':
      return value.v === '' ? null : value.v;
    case 'multi_select':
    case 'checkbox':
    case 'photo':
    case 'file':
    case 'signature':
      return value.v.length ? value.v : null;
    case 'gps':
      return `${value.lat},${value.lng}`;
    case 'bd_address':
      return value.union_id;
    case 'calculation':
      return null;
  }
}

/** A numeric value in a calculation. Money is whole paisa so sums are exact. */
type Num = { kind: 'money'; paisa: bigint } | { kind: 'number'; value: number };
type Value = Num | { kind: 'text'; value: string } | { kind: 'bool'; value: boolean };
/** `empty` is a blank or hidden input (zero in arithmetic); `null` is a result that cannot exist. */
type Result = Value | 'empty' | null;

const paisaOfNumber = (n: number) => BigInt(Math.round(n * 100));
const toMoney = (n: Num): bigint => (n.kind === 'money' ? n.paisa : paisaOfNumber(n.value));
const toNumber = (n: Num): number => (n.kind === 'money' ? Number(n.paisa) / 100 : n.value);

/** An amount string with its sign; `fromPaisa` itself only formats a positive amount. */
export function amountOf(paisa: bigint): string {
  return paisa < 0n ? `-${fromPaisa(-paisa)}` : fromPaisa(paisa);
}

/** Whole years between a date of birth and today, or null when either is not a date. */
export function ageFromDob(dob: string, today: string): number | null {
  const parse = (iso: string) => {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/u.exec(iso);
    return m ? { y: Number(m[1]), m: Number(m[2]), d: Number(m[3]) } : null;
  };
  const birth = parse(dob);
  const now = parse(today);
  if (!birth || !now) return null;
  let years = now.y - birth.y;
  if (now.m < birth.m || (now.m === birth.m && now.d < birth.d)) years -= 1;
  return years;
}

const roundTo = (value: number, places: number) => {
  const factor = 10 ** places;
  return Math.round(value * factor) / factor;
};
/** Paisa rounded to `places` decimals of the Taka (2 or more leaves it unchanged). */
const roundPaisa = (paisa: bigint, places: number) => {
  if (places >= 2) return paisa;
  const unit = places === 1 ? 10n : 100n;
  const half = unit / 2n;
  const rounded = ((paisa < 0n ? paisa - half : paisa + half) / unit) * unit;
  return rounded;
};

class Engine {
  private readonly fields: Map<string, LocatedField>;
  private readonly answers = new Map<string, AnswerValue>();
  private readonly rowCounts = new Map<string, number>();
  private readonly sectionMemo = new Map<string, boolean>();
  private readonly visibleMemo = new Map<string, boolean>();
  private readonly computedMemo = new Map<string, Result>();
  private readonly boundedMemo = new Map<string, boolean>();
  private readonly open = new Set<string>();

  constructor(
    private readonly definition: FormDefinition,
    answers: readonly Answer[],
    private readonly context: EvaluationContext,
  ) {
    this.fields = indexFields(definition);
    for (const answer of answers) {
      const located = this.fields.get(answer.fieldKey);
      if (!located) continue;
      const row = located.group === null ? 0 : (answer.repeatIndex ?? 0);
      this.answers.set(this.slot(answer.fieldKey, row), answer.value);
      if (located.group !== null)
        this.rowCounts.set(
          located.group,
          Math.max(this.rowCounts.get(located.group) ?? 0, row + 1),
        );
    }
  }

  private slot(key: string, row: number) {
    return `${key}#${row}`;
  }

  rowCount(group: string): number {
    return this.rowCounts.get(group) ?? 0;
  }

  /** The row a reference from row `row` reads the field at: its own row inside a group, else 0. */
  private rowFor(located: LocatedField, row: number) {
    return located.group === null ? 0 : row;
  }

  sectionVisible(sectionKey: string): boolean {
    const memo = this.sectionMemo.get(sectionKey);
    if (memo !== undefined) return memo;
    const section = this.definition.sections.find((s) => s.key === sectionKey);
    const slot = `section:${sectionKey}`;
    if (!section || this.open.has(slot)) return false;
    this.open.add(slot);
    const visible = section.condition ? this.condition(section.condition, 0) : true;
    this.open.delete(slot);
    this.sectionMemo.set(sectionKey, visible);
    return visible;
  }

  visible(key: string, row: number): boolean {
    const located = this.fields.get(key);
    if (!located) return false;
    row = this.rowFor(located, row);
    const slot = this.slot(key, row);
    const memo = this.visibleMemo.get(slot);
    if (memo !== undefined) return memo;
    if (this.open.has(`visible:${slot}`)) return false;
    this.open.add(`visible:${slot}`);
    let visible = this.sectionVisible(located.section.key);
    if (visible && located.group !== null) visible = this.visible(located.group, 0);
    if (visible && located.field.logic?.show_if)
      visible = this.condition(located.field.logic.show_if, row);
    this.open.delete(`visible:${slot}`);
    this.visibleMemo.set(slot, visible);
    return visible;
  }

  required(key: string, row: number): boolean {
    const located = this.fields.get(key);
    if (!located || !this.visible(key, row)) return false;
    const { field } = located;
    if (field.type === 'note' || field.type === 'calculation') return false;
    if (field.required) return true;
    return field.logic?.required_if ? this.condition(field.logic.required_if, row) : false;
  }

  /** The stored answer of a visible field, or undefined. */
  answer(key: string, row: number): AnswerValue | undefined {
    const located = this.fields.get(key);
    if (!located) return undefined;
    return this.answers.get(this.slot(key, this.rowFor(located, row)));
  }

  /** What a field is worth in a condition: nothing while hidden, else its answer or its result. */
  plain(key: string, row: number): Plain {
    const located = this.fields.get(key);
    if (!located || !this.visible(key, row)) return null;
    if (located.field.type === 'calculation') {
      const result = this.computed(key, row);
      if (result === null || result === 'empty') return null;
      return result.kind === 'money' ? amountOf(result.paisa) : result.value;
    }
    const value = this.answer(key, row);
    return value === undefined ? null : plainOf(value);
  }

  options(key: string, row: number): FieldOption[] {
    const located = this.fields.get(key);
    if (!located) return [];
    const options = located.field.options ?? [];
    const parentKey = located.field.logic?.options_depend_on;
    if (parentKey === undefined) return options;
    const parent = this.plain(parentKey, row);
    return options.filter(
      (o) =>
        o.dependsOnOptionCode === undefined ||
        o.dependsOnOptionCode === null ||
        (typeof parent === 'string' && o.dependsOnOptionCode === parent),
    );
  }

  /**
   * The type a field's value compares as: a calculation by what it gave (money as money, a number
   * as a number), any other field by its own type.
   */
  private comparedType(key: string, row: number): string | undefined {
    const located = this.fields.get(key);
    if (!located) return undefined;
    if (located.field.type !== 'calculation') return located.field.type;
    const result = this.computed(key, row);
    if (result === null || result === 'empty') return undefined;
    return result.kind === 'money' ? 'money' : result.kind === 'number' ? 'number' : undefined;
  }

  condition(condition: Condition, row: number): boolean {
    if ('all' in condition) return condition.all.every((c) => this.condition(c, row));
    if ('any' in condition) return condition.any.some((c) => this.condition(c, row));
    if ('not' in condition) return !this.condition(condition.not, row);
    const left = this.plain(condition.field, row);
    const type = this.comparedType(condition.field, row);
    const isEmpty = left === null;
    if (condition.op === 'is_empty') return isEmpty;
    if (condition.op === 'not_empty') return !isEmpty;
    // the other side is a fixed value, or the answer of another question at the same row
    const value: unknown = condition.value;
    const reference = isFieldRef(value);
    const right = reference ? this.plain(value.field, row) : value;
    // an empty answer on the other side matches nothing, not even an inequality
    if (reference && right === null) return false;
    switch (condition.op) {
      case 'eq':
        return !isEmpty && equals(left, right, type);
      case 'neq':
        return !isEmpty && !equals(left, right, type);
      case 'in':
        return !isEmpty && Array.isArray(right) && right.some((v) => equals(left, v, type));
      case 'not_in':
        return !isEmpty && Array.isArray(right) && !right.some((v) => equals(left, v, type));
      case 'gt':
      case 'gte':
      case 'lt':
      case 'lte': {
        if (isEmpty) return false;
        const order = compare(left, right, type);
        if (order === null) return false;
        if (condition.op === 'gt') return order > 0;
        if (condition.op === 'gte') return order >= 0;
        if (condition.op === 'lt') return order < 0;
        return order <= 0;
      }
    }
  }

  /** The result of a calculation field, memoized per row; a field that needs itself gives null. */
  computed(key: string, row: number): Result {
    const located = this.fields.get(key);
    if (!located || !located.field.calculation) return null;
    row = this.rowFor(located, row);
    const slot = this.slot(key, row);
    const memo = this.computedMemo.get(slot);
    if (memo !== undefined) return memo;
    if (this.open.has(`computed:${slot}`)) return null;
    // a stored expression past the size limits gives nothing rather than run unbounded
    let bounded = this.boundedMemo.get(key);
    if (bounded === undefined) {
      bounded = withinLimits(located.field.calculation.expr);
      this.boundedMemo.set(key, bounded);
    }
    if (!bounded) {
      this.computedMemo.set(slot, null);
      return null;
    }
    this.open.add(`computed:${slot}`);
    let result = this.visible(key, row) ? this.expr(located.field.calculation.expr, row) : 'empty';
    const places = located.field.calculation.round;
    if (places !== undefined && result !== null && result !== 'empty') {
      if (result.kind === 'number')
        result = { kind: 'number', value: roundTo(result.value, places) };
      else if (result.kind === 'money')
        result = { kind: 'money', paisa: roundPaisa(result.paisa, places) };
    }
    this.open.delete(`computed:${slot}`);
    this.computedMemo.set(slot, result);
    return result;
  }

  /** The value of a field inside an expression: by its type, nothing while blank or hidden. */
  private fieldValue(key: string, row: number): Result {
    const located = this.fields.get(key);
    if (!located) return null;
    if (located.field.type === 'calculation') return this.computed(key, row);
    if (!this.visible(key, row)) return 'empty';
    const value = this.answer(key, row);
    if (value === undefined) return 'empty';
    switch (value.t) {
      case 'money':
        return isAmount(value.v) ? { kind: 'money', paisa: toPaisa(value.v) } : 'empty';
      case 'number':
      case 'decimal':
        return { kind: 'number', value: value.v };
      case 'calculation':
        return 'empty';
      default: {
        const plain = plainOf(value);
        if (plain === null) return 'empty';
        if (typeof plain === 'number') return { kind: 'number', value: plain };
        if (typeof plain === 'boolean') return { kind: 'bool', value: plain };
        return { kind: 'text', value: Array.isArray(plain) ? plain.join(',') : plain };
      }
    }
  }

  private sumRepeat(group: string, field: string): Result {
    const member = this.fields.get(field);
    if (!member || member.group !== group || !this.visible(group, 0)) return 'empty';
    const values: Num[] = [];
    for (let row = 0; row < this.rowCount(group); row += 1) {
      const value = this.fieldValue(field, row);
      if (value === null) return null;
      if (value !== 'empty' && (value.kind === 'money' || value.kind === 'number'))
        values.push(value);
    }
    if (!values.length) return 'empty';
    return fold('add', values);
  }

  /** The rows of a group, or only those where the condition holds; nothing while it is hidden. */
  private countRows(group: string, where: Condition | undefined): Result {
    const located = this.fields.get(group);
    if (!located || located.field.type !== 'repeat_group') return null;
    if (!this.visible(group, 0)) return 'empty';
    let count = 0;
    for (let row = 0; row < this.rowCount(group); row += 1)
      if (where === undefined || this.condition(where, row)) count += 1;
    return { kind: 'number', value: count };
  }

  expr(expr: Expr, row: number): Result {
    if (typeof expr === 'number') return { kind: 'number', value: expr };
    if ('field' in expr) return this.fieldValue(expr.field, row);
    if ('sum_repeat' in expr) return this.sumRepeat(expr.sum_repeat.group, expr.sum_repeat.field);
    if ('result' in expr) return { kind: 'text', value: expr.result };
    if ('count_rows' in expr) return this.countRows(expr.count_rows.group, expr.count_rows.where);
    if ('if' in expr) {
      const branch = expr.if.find((b) => this.condition(b.when, row));
      return this.expr(branch ? branch.then : expr.else, row);
    }
    if ('setting' in expr) {
      const nisab = this.context.nisabValue;
      return nisab !== undefined && isAmount(nisab)
        ? { kind: 'money', paisa: toPaisa(nisab) }
        : null;
    }
    const args = expr.args.map((a) => this.expr(a, row));
    if (args.some((a) => a === null)) return null;
    if (expr.op === 'age_from_dob') {
      const dob = args[0];
      if (dob === undefined || dob === 'empty') return 'empty';
      if (dob === null || dob.kind !== 'text') return null;
      const age = ageFromDob(dob.value, this.context.today);
      return age === null ? null : { kind: 'number', value: age };
    }
    const numbers: Num[] = [];
    let empties = 0;
    for (const arg of args) {
      if (arg === 'empty') empties += 1;
      else if (arg !== null && (arg.kind === 'money' || arg.kind === 'number')) numbers.push(arg);
      else return null;
    }
    if (empties === args.length) return 'empty';
    const kind: Num['kind'] = numbers.some((n) => n.kind === 'money') ? 'money' : 'number';
    // a blank input counts as zero of the kind the others have
    const zero: Num =
      kind === 'money' ? { kind: 'money', paisa: 0n } : { kind: 'number', value: 0 };
    const filled = args.map((a) => (a === 'empty' ? zero : (a as Num)));
    if (expr.op === 'compare_gte') {
      const [a, b] = filled;
      if (a === undefined || b === undefined) return null;
      return { kind: 'bool', value: compareNum(a, b) >= 0 };
    }
    return fold(expr.op, filled);
  }
}

function compareNum(a: Num, b: Num): number {
  if (a.kind === 'money' || b.kind === 'money') {
    const x = toMoney(a);
    const y = toMoney(b);
    return x === y ? 0 : x < y ? -1 : 1;
  }
  return a.value === b.value ? 0 : a.value < b.value ? -1 : 1;
}

/** Arithmetic over the arguments, left to right; money stays in paisa, a division by zero is null. */
function fold(op: 'add' | 'sub' | 'mul' | 'div' | 'min' | 'max', args: Num[]): Result {
  const first = args[0];
  if (first === undefined) return 'empty';
  if (op === 'mul') {
    const money = args.filter((a) => a.kind === 'money');
    if (money.length === 1) {
      const factor = args.filter((a) => a.kind !== 'money').reduce((p, a) => p * toNumber(a), 1);
      return { kind: 'money', paisa: BigInt(Math.round(Number(money[0]!.paisa) * factor)) };
    }
    return { kind: 'number', value: args.reduce((p, a) => p * toNumber(a), 1) };
  }
  if (op === 'div') {
    let acc: Num = first;
    for (const arg of args.slice(1)) {
      const divisor = toNumber(arg);
      if (divisor === 0) return null;
      if (acc.kind === 'money' && arg.kind !== 'money')
        acc = { kind: 'money', paisa: BigInt(Math.round(Number(acc.paisa) / divisor)) };
      else acc = { kind: 'number', value: toNumber(acc) / divisor };
    }
    return acc;
  }
  if (args.some((a) => a.kind === 'money')) {
    const values = args.map(toMoney);
    let acc = values[0]!;
    for (const v of values.slice(1)) {
      if (op === 'add') acc += v;
      else if (op === 'sub') acc -= v;
      else if (op === 'min') acc = v < acc ? v : acc;
      else acc = v > acc ? v : acc;
    }
    return { kind: 'money', paisa: acc };
  }
  const values = args.map(toNumber);
  let acc = values[0]!;
  for (const v of values.slice(1)) {
    if (op === 'add') acc += v;
    else if (op === 'sub') acc -= v;
    else if (op === 'min') acc = Math.min(acc, v);
    else acc = Math.max(acc, v);
  }
  return { kind: 'number', value: acc };
}

const MONEY_TYPES = new Set(['money']);
const NUMBER_TYPES = new Set(['number', 'decimal']);

/** Whether an answered value equals a literal of a condition; a list matches when it holds it. */
function equals(left: Plain, right: unknown, type: string | undefined): boolean {
  if (left === null) return false;
  if (Array.isArray(left)) return left.some((item) => equals(item, right, type));
  if (Array.isArray(right)) return false;
  const order = compare(left, right, type);
  if (order !== null) return order === 0;
  return String(left) === String(right);
}

/**
 * The order of an answered value against a literal: money as paisa, numbers as numbers, dates
 * and texts as strings; null when the two cannot be compared.
 */
function compare(left: Plain, right: unknown, type: string | undefined): number | null {
  if (left === null || Array.isArray(left)) return null;
  if (type !== undefined && MONEY_TYPES.has(type)) {
    const a = typeof left === 'string' && isAmount(left) ? toPaisa(left) : null;
    const b =
      typeof right === 'number'
        ? paisaOfNumber(right)
        : typeof right === 'string' && isAmount(right)
          ? toPaisa(right)
          : null;
    if (a === null || b === null) return null;
    return a === b ? 0 : a < b ? -1 : 1;
  }
  if (typeof left === 'number' || (type !== undefined && NUMBER_TYPES.has(type))) {
    const a = Number(left);
    const b = typeof right === 'number' || typeof right === 'string' ? Number(right) : NaN;
    if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
    return a === b ? 0 : a < b ? -1 : 1;
  }
  if (typeof left === 'boolean') return typeof right === 'boolean' && left === right ? 0 : null;
  if (typeof right !== 'string' && typeof right !== 'number') return null;
  const a = String(left);
  const b = String(right);
  return a === b ? 0 : a < b ? -1 : 1;
}

/** The computed value as the API stores and shows it. */
function output(result: Result): ComputedValue {
  if (result === null || result === 'empty') return null;
  if (result.kind === 'money') return amountOf(result.paisa);
  return result.value;
}

/**
 * Evaluates a definition against a set of answers. Conditions on a hidden field count as empty;
 * fields inside a repeat group are evaluated once per row the answers hold; money is computed in
 * paisa; a calculation's rounding is applied last; a division by zero gives null.
 */
export function evaluate(
  definition: FormDefinition,
  answers: readonly Answer[],
  context: EvaluationContext,
): Evaluation {
  const engine = new Engine(definition, answers, context);
  const sections = new Map<string, boolean>();
  const fields = new Map<string, FieldState>();
  const computed = new Map<string, ComputedValue>();
  const rows = new Map<string, number>();
  const state = (key: string, row: number, inGroup: boolean) => {
    const path = fieldPath(key, row, inGroup);
    fields.set(path, {
      visible: engine.visible(key, row),
      required: engine.required(key, row),
      options: engine.options(key, row),
    });
    const result = engine.computed(key, row);
    if (result !== null && result !== 'empty') computed.set(path, output(result));
  };
  for (const section of definition.sections) {
    sections.set(section.key, engine.sectionVisible(section.key));
    for (const field of section.fields) {
      const group = field.settings?.repeat?.group;
      if (group === undefined) {
        state(field.fieldKey, 0, false);
        if (field.type === 'repeat_group')
          rows.set(field.fieldKey, engine.rowCount(field.fieldKey));
      } else
        for (let row = 0; row < engine.rowCount(group); row += 1) state(field.fieldKey, row, true);
    }
  }
  return {
    sections: Object.fromEntries(sections),
    fields: Object.fromEntries(fields),
    computed: Object.fromEntries(computed),
    rows: Object.fromEntries(rows),
  };
}
