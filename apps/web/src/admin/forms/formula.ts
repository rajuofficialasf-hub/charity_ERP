import type { Condition, ConditionOp, Expr } from '@css/shared';

/**
 * A calculation typed as a formula, for builders who would rather write than click: question
 * keys, numbers, + − × ÷ and brackets, `if(condition, then, else)`, `sum(group.question)`,
 * `count(group)` or `count(group, condition)`, `cell(table, row, column)`, `min(…)`, `max(…)`,
 * `age(date)` and `nisab(amount)`; a text result in quotes. Conditions compare with `= != > >= <
 * <=`, `in (…)`, `empty(…)` and `filled(…)`, joined by `and`, `or` and `not(…)`. The formula is
 * read into the engine's expression, so a typed calculation and a clicked one are the same; the
 * server never reads the text.
 */

/** What a formula may name: the reachable questions, groups, tables and the question's results. */
export interface FormulaNames {
  fields: ReadonlySet<string>;
  groups: ReadonlyMap<string, ReadonlySet<string>>;
  tables: ReadonlyMap<string, { rows: ReadonlySet<string>; cols: ReadonlySet<string> }>;
  results: ReadonlySet<string>;
}

export type FormulaErrorCode = 'unknown_name' | 'unknown_result' | 'syntax' | 'bracket' | 'empty';

export interface FormulaError {
  code: FormulaErrorCode;
  /** Where in the text, counted from 1. */
  column: number;
  /** The name that is not known, for `unknown_name` and `unknown_result`. */
  name?: string;
}

export type FormulaReading = { ok: true; expr: Expr } | { ok: false; error: FormulaError };

type TokenKind = 'number' | 'name' | 'string' | 'symbol' | 'end';
interface Token {
  kind: TokenKind;
  text: string;
  column: number;
}

/** The Bengali digits zero to nine, which a formula reads as English digits. */
const BENGALI_ZERO = 0x09e6;
const SYMBOLS = [
  '>=',
  '<=',
  '!=',
  '<>',
  '+',
  '-',
  '*',
  '/',
  '×',
  '÷',
  '(',
  ')',
  ',',
  '.',
  '=',
  '>',
  '<',
];

class Stop extends Error {
  constructor(readonly error: FormulaError) {
    super(error.code);
  }
}

function tokens(text: string): Token[] {
  const out: Token[] = [];
  let i = 0;
  const source = [...text]
    .map((ch) => {
      const digit = ch.charCodeAt(0) - BENGALI_ZERO;
      return digit >= 0 && digit <= 9 ? String(digit) : ch;
    })
    .join('');
  while (i < source.length) {
    const ch = source.charAt(i);
    const column = i + 1;
    if (/\s/u.test(ch)) {
      i += 1;
      continue;
    }
    if (/[0-9]/u.test(ch)) {
      let end = i;
      while (end < source.length && /[0-9.]/u.test(source.charAt(end))) end += 1;
      out.push({ kind: 'number', text: source.slice(i, end), column });
      i = end;
      continue;
    }
    if (/[a-z_]/u.test(ch)) {
      let end = i;
      while (end < source.length && /[a-z0-9_]/u.test(source.charAt(end))) end += 1;
      out.push({ kind: 'name', text: source.slice(i, end), column });
      i = end;
      continue;
    }
    if (ch === "'" || ch === '"') {
      const close = source.indexOf(ch, i + 1);
      if (close < 0) throw new Stop({ code: 'syntax', column });
      out.push({ kind: 'string', text: source.slice(i + 1, close), column });
      i = close + 1;
      continue;
    }
    const symbol = SYMBOLS.find((s) => source.startsWith(s, i));
    if (!symbol) throw new Stop({ code: 'syntax', column });
    out.push({ kind: 'symbol', text: symbol, column });
    i += symbol.length;
  }
  out.push({ kind: 'end', text: '', column: source.length + 1 });
  return out;
}

const COMPARE: Readonly<Record<string, ConditionOp>> = {
  '=': 'eq',
  '!=': 'neq',
  '<>': 'neq',
  '>': 'gt',
  '>=': 'gte',
  '<': 'lt',
  '<=': 'lte',
};

class Reader {
  private at = 0;
  /** The nodes this reading joined itself, so a bracketed part is never merged into its parent. */
  private readonly joined = new WeakSet<object>();
  /** Inside `count(group, …)` the condition also reads the group's own questions. */
  private rowScope: ReadonlySet<string> | null = null;

  constructor(
    private readonly list: Token[],
    private readonly names: FormulaNames,
  ) {}

  private get next(): Token {
    return this.peek();
  }
  private peek(): Token {
    return this.list[this.at]!;
  }
  private take(): Token {
    const token = this.next;
    if (token.kind !== 'end') this.at += 1;
    return token;
  }
  private is(text: string) {
    return (this.next.kind === 'symbol' || this.next.kind === 'name') && this.next.text === text;
  }
  private expect(text: string) {
    if (this.is(text)) return this.take();
    throw new Stop({ code: text === ')' ? 'bracket' : 'syntax', column: this.next.column });
  }
  private name(): Token {
    if (this.next.kind !== 'name') throw new Stop({ code: 'syntax', column: this.next.column });
    return this.take();
  }
  private field(token: Token): string {
    if (!this.names.fields.has(token.text) && !this.rowScope?.has(token.text))
      throw new Stop({ code: 'unknown_name', column: token.column, name: token.text });
    return token.text;
  }

  whole(): Expr {
    if (this.next.kind === 'end') throw new Stop({ code: 'empty', column: 1 });
    const expr = this.sum();
    const after = this.peek();
    if (after.kind !== 'end')
      throw new Stop({ code: this.is(')') ? 'bracket' : 'syntax', column: after.column });
    return expr;
  }

  private sum(): Expr {
    let acc = this.product();
    while (this.is('+') || this.is('-')) {
      const op = this.take().text === '+' ? 'add' : 'sub';
      const right = this.product();
      acc = this.join(acc, op, right);
    }
    return acc;
  }

  private product(): Expr {
    let acc = this.unary();
    while (this.is('*') || this.is('/') || this.is('×') || this.is('÷')) {
      const symbol = this.take().text;
      const op = symbol === '*' || symbol === '×' ? 'mul' : 'div';
      acc = this.join(acc, op, this.unary());
    }
    return acc;
  }

  /** a + b + c is one sum of three, a + b − c the sum less c; a bracket stays its own part. */
  private join(acc: Expr, op: 'add' | 'sub' | 'mul' | 'div', right: Expr): Expr {
    if (typeof acc === 'object' && 'op' in acc && acc.op === op && this.joined.has(acc)) {
      acc.args.push(right);
      return acc;
    }
    const node: Expr = { op, args: [acc, right] };
    this.joined.add(node);
    return node;
  }

  private unary(): Expr {
    if (this.is('-')) {
      this.take();
      const inner = this.unary();
      return typeof inner === 'number' ? -inner : { op: 'sub', args: [0, inner] };
    }
    return this.primary();
  }

  private primary(): Expr {
    const token = this.next;
    if (token.kind === 'number') {
      this.take();
      const n = Number(token.text);
      if (!Number.isFinite(n)) throw new Stop({ code: 'syntax', column: token.column });
      return n;
    }
    if (token.kind === 'string') {
      this.take();
      if (!this.names.results.has(token.text))
        throw new Stop({ code: 'unknown_result', column: token.column, name: token.text });
      return { result: token.text };
    }
    if (this.is('(')) {
      this.take();
      const inner = this.sum();
      this.expect(')');
      return inner;
    }
    const name = this.name();
    if (!this.is('(')) return { field: this.field(name) };
    this.take();
    const call = this.call(name);
    this.expect(')');
    return call;
  }

  private call(name: Token): Expr {
    switch (name.text) {
      case 'if': {
        const when = this.condition();
        this.expect(',');
        const then = this.sum();
        this.expect(',');
        const otherwise = this.sum();
        // if(a, x, if(b, y, z)) is one step with two branches
        return typeof otherwise === 'object' && 'if' in otherwise
          ? { if: [{ when, then }, ...otherwise.if], else: otherwise.else }
          : { if: [{ when, then }], else: otherwise };
      }
      case 'sum': {
        const group = this.name();
        this.expect('.');
        const member = this.name();
        const members = this.names.groups.get(group.text);
        if (!members)
          throw new Stop({ code: 'unknown_name', column: group.column, name: group.text });
        if (!members.has(member.text))
          throw new Stop({ code: 'unknown_name', column: member.column, name: member.text });
        return { sum_repeat: { group: group.text, field: member.text } };
      }
      case 'count': {
        const group = this.name();
        if (!this.names.groups.has(group.text))
          throw new Stop({ code: 'unknown_name', column: group.column, name: group.text });
        if (!this.is(',')) return { count_rows: { group: group.text } };
        this.take();
        this.rowScope = this.names.groups.get(group.text) ?? null;
        try {
          return { count_rows: { group: group.text, where: this.condition() } };
        } finally {
          this.rowScope = null;
        }
      }
      case 'cell': {
        const table = this.name();
        this.expect(',');
        const row = this.name();
        this.expect(',');
        const col = this.name();
        const known = this.names.tables.get(table.text);
        if (!known)
          throw new Stop({ code: 'unknown_name', column: table.column, name: table.text });
        if (!known.rows.has(row.text))
          throw new Stop({ code: 'unknown_name', column: row.column, name: row.text });
        if (!known.cols.has(col.text))
          throw new Stop({ code: 'unknown_name', column: col.column, name: col.text });
        return { cell: { field: table.text, row: row.text, col: col.text } };
      }
      case 'min':
      case 'max': {
        const args = [this.sum()];
        while (this.is(',')) {
          this.take();
          args.push(this.sum());
        }
        return { op: name.text === 'min' ? 'min' : 'max', args };
      }
      case 'age':
        return { op: 'age_from_dob', args: [{ field: this.field(this.name()) }] };
      case 'nisab':
        return {
          op: 'compare_gte',
          args: [{ field: this.field(this.name()) }, { setting: 'nisab_value' }],
        };
      default:
        throw new Stop({ code: 'unknown_name', column: name.column, name: name.text });
    }
  }

  private condition(): Condition {
    let acc = this.conjunction();
    while (this.is('or')) {
      this.take();
      const right = this.conjunction();
      acc =
        'any' in acc && this.joined.has(acc)
          ? (acc.any.push(right), acc)
          : this.mark({ any: [acc, right] });
    }
    return acc;
  }

  private conjunction(): Condition {
    let acc = this.comparison();
    while (this.is('and')) {
      this.take();
      const right = this.comparison();
      acc =
        'all' in acc && this.joined.has(acc)
          ? (acc.all.push(right), acc)
          : this.mark({ all: [acc, right] });
    }
    return acc;
  }

  private mark<T extends object>(node: T): T {
    this.joined.add(node);
    return node;
  }

  private comparison(): Condition {
    if (this.is('not')) {
      this.take();
      this.expect('(');
      const inner = this.condition();
      this.expect(')');
      return { not: inner };
    }
    if (this.is('(')) {
      this.take();
      const inner = this.condition();
      this.expect(')');
      return inner;
    }
    if (this.is('empty') || this.is('filled')) {
      const op: ConditionOp = this.take().text === 'empty' ? 'is_empty' : 'not_empty';
      this.expect('(');
      const field = this.field(this.name());
      this.expect(')');
      return { field, op };
    }
    const field = this.field(this.name());
    if (this.is('not')) {
      this.take();
      this.expect('in');
      return { field, op: 'not_in', value: this.list_() };
    }
    if (this.is('in')) {
      this.take();
      return { field, op: 'in', value: this.list_() };
    }
    const symbol = this.next;
    const op = symbol.kind === 'symbol' ? COMPARE[symbol.text] : undefined;
    if (!op) throw new Stop({ code: 'syntax', column: symbol.column });
    this.take();
    return { field, op, value: this.value() };
  }

  private list_(): unknown[] {
    this.expect('(');
    const values = [this.value()];
    while (this.is(',')) {
      this.take();
      values.push(this.value());
    }
    this.expect(')');
    return values;
  }

  /** A fixed number or text, or another answer by its key. */
  private value(): unknown {
    const token = this.next;
    if (token.kind === 'string') {
      this.take();
      return token.text;
    }
    if (this.is('-') || token.kind === 'number') {
      const negative = this.is('-');
      if (negative) this.take();
      const number = this.next;
      if (number.kind !== 'number') throw new Stop({ code: 'syntax', column: number.column });
      this.take();
      return negative ? -Number(number.text) : Number(number.text);
    }
    return { field: this.field(this.name()) };
  }
}

/** Reads a typed formula; a mistake comes back with what it is and where. */
export function parseFormula(text: string, names: FormulaNames): FormulaReading {
  try {
    return { ok: true, expr: new Reader(tokens(text), names).whole() };
  } catch (error) {
    if (error instanceof Stop) return { ok: false, error: error.error };
    throw error;
  }
}

const PRECEDENCE = { add: 1, sub: 1, mul: 2, div: 2 } as const;
const SIGN = { add: '+', sub: '-', mul: '*', div: '/' } as const;

/** The formula of an expression, as `parseFormula` reads it back. */
export function printFormula(expr: Expr): string {
  if (typeof expr === 'number') return String(expr);
  if ('field' in expr) return expr.field;
  if ('result' in expr) return `'${expr.result}'`;
  if ('setting' in expr) return 'nisab_value';
  if ('sum_repeat' in expr) return `sum(${expr.sum_repeat.group}.${expr.sum_repeat.field})`;
  if ('count_rows' in expr)
    return expr.count_rows.where
      ? `count(${expr.count_rows.group}, ${printCondition(expr.count_rows.where)})`
      : `count(${expr.count_rows.group})`;
  if ('cell' in expr) return `cell(${expr.cell.field}, ${expr.cell.row}, ${expr.cell.col})`;
  if ('if' in expr) {
    const tail = expr.if
      .slice(1)
      .reduceRight<string>(
        (rest, branch) =>
          `if(${printCondition(branch.when)}, ${printFormula(branch.then)}, ${rest})`,
        printFormula(expr.else),
      );
    const first = expr.if[0]!;
    return `if(${printCondition(first.when)}, ${printFormula(first.then)}, ${tail})`;
  }
  const { op, args } = expr;
  if (op === 'age_from_dob') return `age(${printFormula(args[0]!)})`;
  if (op === 'compare_gte') return `nisab(${printFormula(args[0]!)})`;
  if (op === 'min' || op === 'max') return `${op}(${args.map(printFormula).join(', ')})`;
  const precedence = PRECEDENCE[op];
  return args
    .map((arg, i) => {
      const inner = printFormula(arg);
      const child =
        typeof arg === 'object' && 'op' in arg && arg.op in PRECEDENCE
          ? PRECEDENCE[arg.op as keyof typeof PRECEDENCE]
          : 3;
      // a part of lower order, or of the same order after the first, keeps its bracket
      const bracket = child < precedence || (child === precedence && i > 0);
      const shown = bracket ? `(${inner})` : inner;
      return i === 0 ? shown : `${SIGN[op]} ${shown}`;
    })
    .join(' ');
}

function printValue(value: unknown): string {
  if (typeof value === 'number') return String(value);
  if (typeof value === 'object' && value !== null && 'field' in value)
    return String((value as { field: string }).field);
  return `'${String(value)}'`;
}

const OP_SIGN: Partial<Record<ConditionOp, string>> = {
  eq: '=',
  neq: '!=',
  gt: '>',
  gte: '>=',
  lt: '<',
  lte: '<=',
};

/** The formula text of a condition. */
export function printCondition(condition: Condition): string {
  if ('all' in condition)
    return condition.all
      .map((c) => ('any' in c ? `(${printCondition(c)})` : printCondition(c)))
      .join(' and ');
  if ('any' in condition) return condition.any.map(printCondition).join(' or ');
  if ('not' in condition) return `not(${printCondition(condition.not)})`;
  const { field, op, value } = condition;
  if (op === 'is_empty') return `empty(${field})`;
  if (op === 'not_empty') return `filled(${field})`;
  if (op === 'in' || op === 'not_in') {
    const list = (Array.isArray(value) ? value : [value]).map(printValue).join(', ');
    return `${field} ${op === 'in' ? 'in' : 'not in'} (${list})`;
  }
  return `${field} ${OP_SIGN[op]} ${printValue(value)}`;
}
