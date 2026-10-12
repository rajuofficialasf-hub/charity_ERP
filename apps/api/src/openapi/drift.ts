/* eslint-disable security/detect-object-injection -- walks OpenAPI documents by their own keys */
/**
 * Compares the generated OpenAPI document with docs/api/openapi.yaml (API_STANDARDS 16, NFR-54).
 * Every generated operation must exist in the contract with the same annotations, parameters,
 * request body schema (references resolved, descriptive keywords ignored) and response codes, and
 * name a known permission. Operations of the contract that are not implemented yet are fine.
 */
type Doc = {
  paths?: Record<string, Record<string, unknown>>;
  components?: unknown;
  security?: unknown;
};
type Op = Record<string, unknown>;

const METHODS = ['get', 'put', 'post', 'delete', 'patch'] as const;
const ANNOTATIONS = [
  'operationId',
  'tags',
  'x-permission',
  'x-scope',
  'x-audit',
  'x-idempotency',
  'x-rate-limit',
  'x-sensitive-fields',
  'x-workflow',
];
export const PERMISSION_MARKERS = ['public', 'authenticated', 'workflow', 'entity'];
/** Keywords that describe rather than constrain; ignored when schemas are compared. */
const DESCRIPTIVE = new Set([
  'description',
  'title',
  'example',
  'examples',
  '$comment',
  'deprecated',
  'default',
]);

function resolve(doc: unknown, value: unknown, seen = new Set<string>()): unknown {
  if (Array.isArray(value)) return value.map((v) => resolve(doc, v, seen));
  if (!value || typeof value !== 'object') return value;
  const ref = (value as { $ref?: unknown }).$ref;
  if (typeof ref === 'string' && ref.startsWith('#/')) {
    if (seen.has(ref)) return { $ref: ref };
    const target = ref
      .slice(2)
      .split('/')
      .reduce<unknown>(
        (node, key) =>
          node && typeof node === 'object' ? (node as Record<string, unknown>)[key] : undefined,
        doc,
      );
    return resolve(doc, target, new Set([...seen, ref]));
  }
  return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, resolve(doc, v, seen)]));
}

/** Formats whose regular expression zod writes next to the format in generated schemas. */
const ZOD_FORMATS = new Set(['uuid', 'date-time', 'email']);

/**
 * Canonical form of a JSON Schema: descriptive keywords removed, keys and `required` sorted. On
 * the generated side only, the `pattern` zod adds to a uuid, date-time or email format is dropped
 * (the format implies it); a pattern in the contract is always compared.
 */
export function canonicalSchema(schema: unknown, generated = false): unknown {
  if (Array.isArray(schema)) return schema.map((s) => canonicalSchema(s, generated));
  if (!schema || typeof schema !== 'object') return schema;
  const format = (schema as { format?: unknown }).format;
  const implied = generated && typeof format === 'string' && ZOD_FORMATS.has(format);
  const entries = Object.entries(schema)
    .filter(([k]) => !DESCRIPTIVE.has(k) && !(implied && k === 'pattern'))
    .map(
      ([k, v]) =>
        [
          k,
          k === 'required' && Array.isArray(v) ? [...v].sort() : canonicalSchema(v, generated),
        ] as const,
    )
    .sort(([a], [b]) => a.localeCompare(b));
  return Object.fromEntries(entries);
}

const json = (v: unknown) => JSON.stringify(v ?? null);

type Param = { name: string; in: string; required?: boolean };

/** Parameters of an operation, including those declared once on its path item. */
function params(doc: unknown, op: Op, item?: Record<string, unknown>): string[] {
  const list = [
    ...((resolve(doc, item?.parameters) as Param[] | undefined) ?? []),
    ...((resolve(doc, op.parameters) as Param[] | undefined) ?? []),
  ];
  return list.map((p) => `${p.in}:${p.name}:${p.required ? 'required' : 'optional'}`).sort();
}

function bodySchema(doc: unknown, op: Op, generated = false): unknown {
  const body = resolve(doc, op.requestBody) as
    { content?: Record<string, { schema?: unknown }> } | undefined;
  return canonicalSchema(body?.content?.['application/json']?.schema, generated);
}

export function compareWithContract(
  generated: Doc,
  contract: Doc,
  permissionNames: Set<string>,
): string[] {
  const problems: string[] = [];
  for (const [path, item] of Object.entries(generated.paths ?? {})) {
    for (const method of METHODS) {
      const op = item[method] as Op | undefined;
      if (!op) continue;
      const where = `${method.toUpperCase()} ${path}`;
      const expected = contract.paths?.[path]?.[method] as Op | undefined;
      if (!expected) {
        problems.push(`${where}: not in docs/api/openapi.yaml`);
        continue;
      }
      for (const key of ANNOTATIONS)
        if (json(op[key]) !== json(expected[key]))
          problems.push(
            `${where}: ${key} is ${json(op[key])}, the contract says ${json(expected[key])}`,
          );
      const permission = op['x-permission'];
      if (
        typeof permission !== 'string' ||
        !(PERMISSION_MARKERS.includes(permission) || permissionNames.has(permission))
      )
        problems.push(`${where}: unknown x-permission ${json(permission)}`);
      const security = (o: Op, doc: Doc) => json(o.security ?? doc.security);
      if (security(op, generated) !== security(expected, contract))
        problems.push(`${where}: security differs`);
      const gp = params(generated, op, item);
      const cp = params(contract, expected, contract.paths?.[path]);
      if (json(gp) !== json(cp))
        problems.push(`${where}: parameters ${json(gp)} differ from ${json(cp)}`);
      const gb = bodySchema(generated, op, true);
      const cb = bodySchema(contract, expected);
      if (json(gb) !== json(cb))
        problems.push(`${where}: request body schema ${json(gb)} differs from ${json(cb)}`);
      const codes = (o: Op) => Object.keys((o.responses as object) ?? {}).sort();
      if (json(codes(op)) !== json(codes(expected)))
        problems.push(
          `${where}: responses ${json(codes(op))} differ from ${json(codes(expected))}`,
        );
    }
  }
  return problems;
}
