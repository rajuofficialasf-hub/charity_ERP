import { z } from 'zod';
import { bilingual, dateTime, snakeKey } from '../jsonb/common.js';

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

/** Switching a project's public link on with the one form it opens, or off. */
export const publicLinkConfigSchema = z.strictObject({
  enabled: z.boolean(),
  formId: z.uuid().optional(),
});
export type PublicLinkConfig = z.infer<typeof publicLinkConfigSchema>;

/**
 * A submission through the public link: the applicant's client id (a repeat answers the same
 * record) and the answers, which the engine checks and names one by one.
 */
export const publicApplicationCreateSchema = z.strictObject({
  clientUuid: z.uuid(),
  clientCreatedAt: dateTime.optional(),
  answers: z.array(z.unknown()).max(2000),
});
export type PublicApplicationCreate = z.infer<typeof publicApplicationCreateSchema>;
