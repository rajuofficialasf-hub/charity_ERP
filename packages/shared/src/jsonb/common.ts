import { z } from 'zod';

/** `{ bn?, en? }` label where both languages are optional and extra keys are tolerated. */
export const looseLabel = z.looseObject({ bn: z.string().optional(), en: z.string().optional() });

/** `{ bn, en }` with both languages required (bilingual configuration, I18N.md). */
export const bilingual = z.strictObject({ bn: z.string(), en: z.string() });

/** A bilingual configuration label of at most 200 characters per language. */
export const boundedLabel = z.strictObject({ bn: z.string().max(200), en: z.string().max(200) });

/** Snake-case code used for options, criteria and question keys. */
export const code64 = z.string().regex(/^[a-z0-9_]{1,64}$/);

/** Form field key and workflow state key. */
export const snakeKey = z.string().regex(/^[a-z][a-z0-9_]*$/);

/** JSON Schema `format: date-time` (RFC 3339 with Z or an offset). */
export const dateTime = z.iso.datetime({ offset: true });

/** JSON Schema `uniqueItems` for primitive arrays. */
export const unique = <T>(items: T[]) => new Set(items).size === items.length;
