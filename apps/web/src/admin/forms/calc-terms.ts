import type { Expr } from '@css/shared';

/**
 * The calculation editor shows a calculated field as one of a few shapes the department uses: a
 * row of terms joined by plus and minus, two terms joined by times or divided by, the age from a
 * date of birth, or net assets compared with the nisab in force. A term is a field, a number, or
 * the sum of a field over the rows of a repeat group. These functions turn the engine's expression
 * into a shape and back; anything else comes back as not editable here, and the builder shows it
 * read-only.
 */

export type Term =
  | { kind: 'field'; key: string }
  | { kind: 'number'; value: number }
  | { kind: 'group_sum'; group: string; field: string };

export type CalcShape =
  | { kind: 'chain'; terms: { sign: 1 | -1; term: Term }[] }
  | { kind: 'product'; op: 'mul' | 'div'; left: Term; right: Term }
  | { kind: 'age'; dob: string }
  | { kind: 'nisab'; net: string };

export type CalcView = CalcShape | { kind: 'complex' };

function termOf(expr: Expr): Term | null {
  if (typeof expr === 'number') return { kind: 'number', value: expr };
  if ('field' in expr) return { kind: 'field', key: expr.field };
  if ('sum_repeat' in expr)
    return { kind: 'group_sum', group: expr.sum_repeat.group, field: expr.sum_repeat.field };
  return null;
}

function exprOf(term: Term): Expr {
  if (term.kind === 'number') return term.value;
  if (term.kind === 'field') return { field: term.key };
  return { sum_repeat: { group: term.group, field: term.field } };
}

const terms = (args: Expr[]) => {
  const out = args.map(termOf);
  return out.every((t): t is Term => t !== null) ? out : null;
};

export function termsFromExpr(expr: Expr): CalcView {
  const single = termOf(expr);
  if (single) return { kind: 'chain', terms: [{ sign: 1, term: single }] };
  if (typeof expr === 'number' || !('op' in expr)) return { kind: 'complex' };
  const { op, args } = expr;
  if (op === 'add') {
    const all = terms(args);
    return all
      ? { kind: 'chain', terms: all.map((term) => ({ sign: 1, term })) }
      : { kind: 'complex' };
  }
  if (op === 'sub') {
    const [first, ...rest] = args;
    if (first === undefined) return { kind: 'complex' };
    // a chain of only minus terms is written as zero minus them
    const head: CalcView = first === 0 ? { kind: 'chain', terms: [] } : termsFromExpr(first);
    const minus = terms(rest);
    if (head.kind !== 'chain' || head.terms.some((t) => t.sign < 0) || !minus)
      return { kind: 'complex' };
    return {
      kind: 'chain',
      terms: [...head.terms, ...minus.map((term) => ({ sign: -1 as const, term }))],
    };
  }
  if ((op === 'mul' || op === 'div') && args.length === 2) {
    const pair = terms(args);
    return pair ? { kind: 'product', op, left: pair[0]!, right: pair[1]! } : { kind: 'complex' };
  }
  if (op === 'age_from_dob' && args.length === 1) {
    const [dob] = args;
    if (typeof dob === 'object' && 'field' in dob) return { kind: 'age', dob: dob.field };
  }
  if (op === 'compare_gte' && args.length === 2) {
    const [net, nisab] = args;
    if (
      typeof net === 'object' &&
      'field' in net &&
      typeof nisab === 'object' &&
      'setting' in nisab &&
      nisab.setting === 'nisab_value'
    )
      return { kind: 'nisab', net: net.field };
  }
  return { kind: 'complex' };
}

/**
 * The engine's expression for a shape. A chain puts its plus terms first and subtracts the minus
 * terms after them, which gives the same result in any order the editor shows.
 */
export function exprFromTerms(shape: CalcShape): Expr {
  if (shape.kind === 'age') return { op: 'age_from_dob', args: [{ field: shape.dob }] };
  if (shape.kind === 'nisab')
    return { op: 'compare_gte', args: [{ field: shape.net }, { setting: 'nisab_value' }] };
  if (shape.kind === 'product')
    return { op: shape.op, args: [exprOf(shape.left), exprOf(shape.right)] };
  const plus = shape.terms.filter((t) => t.sign > 0).map((t) => exprOf(t.term));
  const minus = shape.terms.filter((t) => t.sign < 0).map((t) => exprOf(t.term));
  const head: Expr =
    plus.length === 0 ? 0 : plus.length === 1 ? plus[0]! : { op: 'add', args: plus };
  return minus.length ? { op: 'sub', args: [head, ...minus] } : head;
}
