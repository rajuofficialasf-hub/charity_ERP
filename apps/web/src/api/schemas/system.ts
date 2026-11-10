import { z } from 'zod';
import { dateTime } from './common';

/** One active device session as `GET /sessions/active` returns it (never a token or an address). */
export const activeSessionSchema = z.object({
  id: z.uuid(),
  person: z.object({
    id: z.uuid(),
    name: z.string(),
    kind: z.enum(['staff', 'volunteer']),
    systemOwner: z.boolean(),
  }),
  deviceName: z.string().nullable(),
  platform: z.string().nullable(),
  appVersion: z.string().nullable(),
  createdAt: dateTime,
  lastSeenAt: dateTime,
});
export type ActiveSession = z.infer<typeof activeSessionSchema>;

/** A page of the active sessions with its cursors. */
export const activeSessionPageSchema = z.object({
  data: z.array(activeSessionSchema),
  meta: z.object({ nextCursor: z.string().nullable(), prevCursor: z.string().nullable() }),
});
export type ActiveSessionPage = z.infer<typeof activeSessionPageSchema>;

const figure = { count: z.number().int(), bytes: z.number() };
export const storageFigureSchema = z.object(figure);
export type StorageFigure = z.infer<typeof storageFigureSchema>;

const up = z.enum(['up', 'down']);

/** The system health page: the checks, the version, the audit partitions and the storage. */
export const systemHealthSchema = z.object({
  ready: z.boolean(),
  checks: z.object({ database: up, storage: up, queue: up }),
  version: z.string(),
  environment: z.string(),
  otpDummy: z.boolean(),
  auditPartitionsUntil: z.string().nullable(),
  storage: z
    .object({
      total: storageFigureSchema,
      byKind: z.array(z.object({ ...figure, kind: z.string() })),
      /** Each bucket, and its growth since the snapshot of a month ago (null until one exists). */
      byBucket: z.array(
        z.object({ ...figure, bucket: z.string(), monthGrowth: z.number().nullable() }),
      ),
      byMonth: z.array(z.object({ ...figure, month: z.string() })),
      measuredAt: dateTime,
    })
    .nullable(),
});
export type SystemHealth = z.infer<typeof systemHealthSchema>;
