import { z } from 'zod';
import { bilingual, snakeKey } from '../jsonb/common.js';

/** Where a project's first form draft comes from: a library template, nothing, or another project's published form. */
export const formSourceSchema = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('template'), templateKey: z.string().min(1).max(80) }),
  z.strictObject({ kind: z.literal('blank') }),
  z.strictObject({ kind: z.literal('copy'), formId: z.uuid() }),
]);
export type FormSource = z.infer<typeof formSourceSchema>;

/** A new form of a project: its application type key, its title and its starting point. */
export const formCreateSchema = z.strictObject({
  key: snakeKey.max(40),
  title: bilingual,
  source: formSourceSchema,
});
export type FormCreate = z.infer<typeof formCreateSchema>;
