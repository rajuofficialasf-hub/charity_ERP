import type { NisabVersionView } from '@css/shared/settings';
import { z } from 'zod';
import { date, dateTime } from './common';

const person = z.object({ id: z.uuid(), name: z.string() });

/** A nisab version as `GET /nisab-versions` returns it, the one in force today marked. */
export const nisabVersionViewSchema = z.object({
  id: z.uuid(),
  value: z.string(),
  effectiveFrom: date,
  basisNote: z.string().nullable(),
  setBy: person,
  createdAt: dateTime,
  /** In force today: the latest version that took effect and was not withdrawn. */
  inForce: z.boolean(),
  withdrawn: z.object({ at: dateTime, by: person, reason: z.string() }).nullable(),
}) satisfies z.ZodType<NisabVersionView>;
