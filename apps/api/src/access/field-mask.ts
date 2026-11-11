import { z, type ZodType } from 'zod';
import type { AccessRegistry } from './registry.js';

/**
 * Field-level protection (docs/security/RBAC.md, "Field-level protection"): a
 * response schema marks each protected field with its class from the `sensitive_fields` catalogue,
 * and every response of a route passes through `maskData` before it is sent (`defineRoute`), so a
 * handler cannot forget it. Hidden fields are removed, not blanked: a volunteer client never learns
 * they exist. Exports (the export service of docs/PLAN.md) reuse the same marks and the same
 * function.
 */
interface SensitiveMark {
  /** Class key from permissions.yaml `sensitive_fields`. */
  cls: string;
  /** The array holds form answers: rows with `visibility: official_only` belong to the class. */
  rows?: boolean;
}

const marks = z.registry<SensitiveMark>();

/** Marks a field of a response schema as belonging to a protected class. */
export function sensitive<T extends ZodType>(schema: T, cls: string): T {
  marks.add(schema, { cls });
  return schema;
}

/**
 * Marks an array of form answers (`{ visibility, … }` rows): every row whose visibility is not
 * exactly `volunteer` belongs to the class `application.official_section`. The row schema must
 * declare `visibility`, or the parse would strip it before the mask reads it.
 */
export function officialRows<T extends ZodType>(
  schema: T,
  cls = 'application.official_section',
): T {
  const element = defOf(unwrap(schema).core).element;
  const rowShape = element ? defOf(unwrap(element).core).shape : undefined;
  if (!rowShape || !Object.hasOwn(rowShape, 'visibility'))
    throw new Error('officialRows: the row schema must be an object with a visibility key');
  marks.add(schema, { cls, rows: true });
  return schema;
}

/** The classes a caller with these roles may see: `visible_to` plus every class for a global role. */
export function visibleFieldClasses(
  registry: AccessRegistry,
  roleKeys: readonly string[],
): ReadonlySet<string> {
  const global = roleKeys.some((key) => registry.roles.get(key)?.globalScope === true);
  return new Set(
    registry.sensitiveFields
      .filter((c) => global || c.visibleTo.some((role) => roleKeys.includes(role)))
      .map((c) => c.key),
  );
}

type Def = {
  type: string;
  innerType?: ZodType;
  shape?: Record<string, ZodType>;
  element?: ZodType;
  options?: ZodType[];
  out?: ZodType;
  valueType?: ZodType;
  getter?: () => ZodType;
  items?: ZodType[];
  in?: ZodType;
  rest?: ZodType | null;
};

function defOf(schema: ZodType): Def {
  return (schema as unknown as { _zod: { def: Def } })._zod.def;
}

/** The marks on a schema and its wrappers (optional, nullable, default, …) and the core schema. */
function unwrap(schema: ZodType): { marks: SensitiveMark[]; core: ZodType } {
  const found: SensitiveMark[] = [];
  let current = schema;
  for (;;) {
    const mark = marks.get(current);
    if (mark) found.push(mark);
    const def = defOf(current);
    if (def.innerType) current = def.innerType;
    else if (def.type === 'pipe' && def.out) {
      // a mark on the input side of a pipe (a marked field with .transform) counts as well
      if (def.in) found.push(...unwrap(def.in).marks);
      current = def.out;
    } else if (def.type === 'lazy' && def.getter) current = def.getter();
    else return { marks: found, core: current };
  }
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/** A value the caller may not see; its parent drops it (object key, array item, record entry). */
const HIDDEN = Symbol('hidden');

/** Schema kinds the mask walks; anything else in a response schema is refused at registration. */
const WALKABLE = new Set(['object', 'array', 'tuple', 'union', 'record']);
const LEAVES = new Set([
  'string',
  'number',
  'int',
  'boolean',
  'bigint',
  'null',
  'undefined',
  'literal',
  'enum',
  'unknown',
  'any',
  'date',
  'template_literal',
  'nan',
  'transform',
]);

function walk(schema: ZodType, value: unknown, visible: ReadonlySet<string>): unknown {
  const { marks: own, core } = unwrap(schema);
  if (own.some((m) => !m.rows && !visible.has(m.cls))) return HIDDEN;
  const def = defOf(core);
  // a leaf holds its value whole, also an object or an array under `z.unknown()` (the answer of an
  // edit request); it has no nested marks to look at
  if (LEAVES.has(def.type)) return value;
  if (def.type === 'union' && def.options) {
    // the parsed value matched an option; mask with that option, hide it when none matches
    const option = def.options.find((o) => o.safeParse(value).success);
    return option ? walk(option, value, visible) : HIDDEN;
  }
  if (Array.isArray(value)) {
    const rows = own.some((m) => m.rows && !visible.has(m.cls));
    const kept = rows
      ? value.filter((row) => isRecord(row) && row.visibility === 'volunteer')
      : value;
    const items = kept.map((item, i) => {
      const itemSchema = def.element ?? def.items?.[i] ?? def.rest ?? undefined;
      return itemSchema ? walk(itemSchema, item, visible) : HIDDEN;
    });
    return items.filter((item) => item !== HIDDEN);
  }
  if (!isRecord(value)) return value;
  const out: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value)) {
    // only declared keys leave: a key outside the shape (loose or catchall object) is dropped
    const field =
      def.type === 'object' && def.shape
        ? Object.hasOwn(def.shape, key)
          ? def.shape[key]
          : undefined
        : def.type === 'record'
          ? def.valueType
          : undefined;
    if (!field) continue;
    const masked = walk(field, item, visible);
    if (masked !== HIDDEN) out[key] = masked;
  }
  return out;
}

/**
 * Removes every field marked with a class outside `visible` from already parsed data; returns new
 * objects and never changes its input.
 */
export function maskData(schema: ZodType, value: unknown, visible: ReadonlySet<string>): unknown {
  const masked = walk(schema, value, visible);
  return masked === HIDDEN ? null : masked;
}

/**
 * Every class the schema marks, anywhere inside it (route registration checks these). Throws for a
 * schema kind the mask cannot walk (intersection, map, set, …), so a mark is never silently skipped.
 */
export function sensitiveClassesOf(schema: ZodType): Set<string> {
  const found = new Set<string>();
  const seen = new Set<ZodType>();
  const visit = (s: ZodType) => {
    if (seen.has(s)) return;
    seen.add(s);
    const { marks: own, core } = unwrap(s);
    for (const m of own) found.add(m.cls);
    const def = defOf(core);
    if (!WALKABLE.has(def.type) && !LEAVES.has(def.type))
      throw new Error(`the field mask cannot walk a ${def.type} schema in a response`);
    const children = [
      ...Object.values(def.shape ?? {}),
      ...(def.options ?? []),
      ...(def.items ?? []),
      ...[def.element, def.valueType, def.rest].filter((c): c is ZodType => !!c),
    ];
    children.forEach(visit);
  };
  visit(schema);
  return found;
}
