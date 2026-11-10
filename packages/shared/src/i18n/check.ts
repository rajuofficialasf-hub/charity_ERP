import { parse, TYPE, type MessageFormatElement } from '@formatjs/icu-messageformat-parser';

/** Flattens a message tree into dotted keys and texts. */
export function flattenMessages(tree: object, prefix = ''): Map<string, string> {
  const out = new Map<string, string>();
  for (const [key, value] of Object.entries(tree)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (typeof value === 'string') out.set(path, value);
    else if (value && typeof value === 'object')
      for (const [k, v] of flattenMessages(value, path)) out.set(k, v);
  }
  return out;
}

interface MessageShape {
  /** Every argument name (simple, plural, select). */
  params: Set<string>;
  /** Arguments shown as text. */
  shown: Set<string>;
  /** Arguments that select plural or select branches. */
  selectors: Set<string>;
  problems: string[];
}

function shapeOf(elements: MessageFormatElement[], shape: MessageShape): MessageShape {
  for (const el of elements) {
    switch (el.type) {
      case TYPE.argument:
        shape.params.add(el.value);
        shape.shown.add(el.value);
        break;
      case TYPE.number:
      case TYPE.date:
      case TYPE.time:
        shape.params.add(el.value);
        shape.problems.push(
          `ICU ${TYPE[el.type]} argument "${el.value}": pass formatted text instead`,
        );
        break;
      case TYPE.pound:
        shape.problems.push('"#" prints the number with locale digits: use a formatted {count}');
        break;
      case TYPE.plural:
      case TYPE.select:
        shape.params.add(el.value);
        shape.selectors.add(el.value);
        for (const option of Object.values(el.options)) shapeOf(option.value, shape);
        break;
      case TYPE.tag:
        shapeOf(el.children, shape);
        break;
      default:
        break;
    }
  }
  return shape;
}

export interface CatalogueInput {
  bn: object;
  en: object;
  /** Error codes that need `errors.<code>` in both languages (API_STANDARDS 8). */
  errorCodes?: string[];
  /** Keys found in code; keys never used are reported as warnings. */
  usedKeys?: Iterable<string>;
  /** Key prefixes not expected in code (for example codes.* and errors.* rendered by code). */
  dynamicPrefixes?: string[];
}

export interface CatalogueReport {
  errors: string[];
  warnings: string[];
}

const BENGALI_DIGIT = /[\u09E6-\u09EF]/u;

/**
 * The catalogue check of I18N.md 4 (pure; scripts/check-i18n.mjs feeds it the files): same keys
 * in bn and en, every message parses, both messages of a key declare the same parameters, no
 * Bengali digits, no `#` or number/date arguments, plural selectors are not displayed, every
 * error code has a message, and unused keys are warnings.
 */
export function checkCatalogue(input: CatalogueInput): CatalogueReport {
  const errors: string[] = [];
  const warnings: string[] = [];
  const bn = flattenMessages(input.bn);
  const en = flattenMessages(input.en);

  for (const key of bn.keys()) if (!en.has(key)) errors.push(`${key}: missing in en`);
  for (const key of en.keys()) if (!bn.has(key)) errors.push(`${key}: missing in bn`);

  const shapes = new Map<string, MessageShape>();
  for (const [locale, messages] of [
    ['bn', bn],
    ['en', en],
  ] as const) {
    for (const [key, text] of messages) {
      if (BENGALI_DIGIT.test(text)) errors.push(`${key} (${locale}): Bengali digits`);
      let shape: MessageShape;
      try {
        shape = shapeOf(parse(text), {
          params: new Set(),
          shown: new Set(),
          selectors: new Set(),
          problems: [],
        });
      } catch (error) {
        errors.push(`${key} (${locale}): does not parse (${(error as Error).message})`);
        continue;
      }
      for (const problem of shape.problems) errors.push(`${key} (${locale}): ${problem}`);
      for (const selector of shape.selectors)
        if (shape.shown.has(selector))
          errors.push(
            `${key} (${locale}): plural or select argument "${selector}" is also shown; show a formatted argument`,
          );
      shapes.set(`${locale}:${key}`, shape);
    }
  }

  for (const key of bn.keys()) {
    const a = shapes.get(`bn:${key}`);
    const b = shapes.get(`en:${key}`);
    if (!a || !b) continue;
    const pa = [...a.params].sort().join(',');
    const pb = [...b.params].sort().join(',');
    if (pa !== pb)
      errors.push(`${key}: parameters differ (bn: ${pa || 'none'}; en: ${pb || 'none'})`);
  }

  for (const code of input.errorCodes ?? []) {
    const key = `errors.${code}`;
    if (!bn.has(key) || !en.has(key))
      errors.push(`${key}: error code without a message (API_STANDARDS 8)`);
  }

  if (input.usedKeys) {
    const used = new Set(input.usedKeys);
    const dynamic = input.dynamicPrefixes ?? [];
    for (const key of bn.keys()) {
      if (used.has(key) || dynamic.some((p) => key.startsWith(p))) continue;
      const namespaceUsed = [...used].some((u) => key.startsWith(`${u}.`));
      if (!namespaceUsed) warnings.push(`${key}: not used in code`);
    }
  }
  return { errors, warnings };
}
