import { attentionItemSchema } from '@css/shared';
import { z } from 'zod';
import { bilingual, date } from './common';

/** What waits for the caller, counted per kind (`GET /me/attention`). */
export { attentionItemSchema };

/** A project as the home lists it (a part of `GET /projects`). */
export const homeProjectSchema = z.object({
  id: z.uuid(),
  code: z.string(),
  name: bilingual,
  sessionLabel: z.string(),
  status: z.string(),
  applyTo: date.nullable(),
});
export type HomeProject = z.infer<typeof homeProjectSchema>;

/**
 * The first project of a state with the total of that state, for the counts of a PM's home: the
 * widget reads the total, or the number of rows when the total is missing.
 */
export const projectCountSchema = z.object({
  data: z.array(z.object({ id: z.uuid() })),
  meta: z.object({ total: z.number().int().optional() }),
});
export type ProjectCount = z.infer<typeof projectCountSchema>;
