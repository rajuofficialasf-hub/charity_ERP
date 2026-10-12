import { z, type ZodType } from 'zod';
import type { AccessRegistry } from './registry';

/**
 * Field-level protection (RBAC.md 6, BR-183, constitution §5): a response schema marks each
 * protected field with its class from the `sensitive_fields` catalogue, and every response of a
 * route passes through `maskData` before it is sent (`defineRoute`), so a handler cannot forget it.
 * Hidden fields are removed, not blanked: a volunteer client never learns they exist. Exports
 * (T2.8) reuse the same marks and the same function.
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
 * Marks an array of form answers (`{ visibility, … }` rows): the official-only rows belong to the
 * class `application.official_section` (BD-12, B3, B4).
 */
export function officialRows<T extends ZodType>(
  schema: T,
  cls = 'application.official_section',
): T {
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
  left?: ZodType;
  right?: ZodType;
  getter?: () => ZodType;
};

const defOf = (schema: ZodType) => (schema as unknown as { _zod: { def: Def } })._zod.def;

/** The marks on a schema and its wrappers (optional, nullable, default, …) and the core schema. */
function unwrap(schema: ZodType): { marks: SensitiveMark[]; core: ZodType } {
  const found: SensitiveMark[] = [];
  let current = schema;
  for (;;) {
    const mark = marks.get(current);
    if (mark) found.push(mark);
    const def = defOf(current);
    if (def.innerType) current = def.innerType;
    else if (def.type === 'pipe' && def.out) current = def.out;
    else if (def.type === 'lazy' && def.getter) current = def.getter();
    else return { marks: found, core: current };
  }
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

function walk(schema: ZodType, value: unknown, visible: ReadonlySet<string>): unknown {
  const { marks: own, core } = unwrap(schema);
  const def = defOf(core);
  if (Array.isArray(value)) {
    const rows = own.find((m) => m.rows && !visible.has(m.cls));
    const kept = rows
      ? value.filter((row) => !(isRecord(row) && row.visibility === 'official_only'))
      : value;
    return def.element ? kept.map((item) => walk(def.element!, item, visible)) : [...kept];
  }
  if (!isRecord(value)) return value;
  if (def.type === 'object' && def.shape) {
    const out: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value)) {
      const field = Object.hasOwn(def.shape, key) ? def.shape[key] : undefined;
      if (!field) {
        out[key] = item; // a catchall or passthrough key carries no mark
        continue;
      }
      const fieldMarks = unwrap(field).marks;
      if (fieldMarks.some((m) => !m.rows && !visible.has(m.cls))) continue;
      out[key] = walk(field, item, visible);
    }
    return out;
  }
  if (def.type === 'union' && def.options)
    return def.options.reduce<unknown>((acc, option) => walk(option, acc, visible), value);
  if (def.type === 'intersection' && def.left && def.right)
    return walk(def.right, walk(def.left, value, visible), visible);
  if (def.type === 'record' && def.valueType)
    return Object.fromEntries(
      Object.entries(value).map(([k, v]) => [k, walk(def.valueType!, v, visible)]),
    );
  return { ...value };
}

/**
 * Removes every field marked with a class outside `visible` from already parsed data; returns new
 * objects and never changes its input.
 */
export function maskData(schema: ZodType, value: unknown, visible: ReadonlySet<string>): unknown {
  return walk(schema, value, visible);
}

/** Every class the schema marks, anywhere inside it (route registration checks these). */
export function sensitiveClassesOf(schema: ZodType): Set<string> {
  const found = new Set<string>();
  const seen = new Set<ZodType>();
  const visit = (s: ZodType) => {
    if (seen.has(s)) return;
    seen.add(s);
    const { marks: own, core } = unwrap(s);
    for (const m of own) found.add(m.cls);
    const def = defOf(core);
    const children = [
      ...Object.values(def.shape ?? {}),
      ...(def.options ?? []),
      ...[def.element, def.valueType, def.left, def.right].filter((c): c is ZodType => !!c),
    ];
    children.forEach(visit);
  };
  visit(schema);
  return found;
}
