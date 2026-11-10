import { WORKFLOW_KEYS } from '@css/shared/projects';
import { z } from 'zod';
import { bilingual, dateTime } from './common';

/** A master project template as `GET /templates` returns it. */
export const templateSchema = z.object({
  id: z.uuid(),
  name: bilingual,
  description: z.string().nullable(),
  workflowKey: z.enum(WORKFLOW_KEYS),
  active: z.boolean(),
  version: z.number().int(),
  sourceProjectId: z.uuid().nullable(),
  updatedAt: dateTime,
  updatedByName: z.string().nullable(),
});
export type Template = z.infer<typeof templateSchema>;
