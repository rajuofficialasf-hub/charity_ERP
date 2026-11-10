import type { LocationView } from '@css/shared';
import type { SyncBatchResponse } from '@css/shared/sync';
import { SYNC_RESULTS } from '@css/shared/sync';
import { z } from 'zod';
import { bilingual, dateTime } from './common';
import { applicationFormSchema, applicationSummarySchema } from './applications';
import { myProjectSchema } from './projects';

/** One row of the locations master as the phone keeps it (`GET /locations/all`). */
export const locationViewSchema = z.object({
  id: z.uuid(),
  parentId: z.uuid().nullable(),
  level: z.string(),
  code: z.string(),
  name: bilingual,
  postCode: z.string().nullable(),
  active: z.boolean(),
}) satisfies z.ZodType<LocationView>;

/** What the server did with each record of an offline batch (`POST /sync/batch`). */
export const syncBatchResponseSchema = z.object({
  serverTime: dateTime,
  results: z.array(
    z.object({
      clientUuid: z.uuid(),
      result: z.enum(SYNC_RESULTS),
      code: z.string().nullable().optional(),
      params: z.record(z.string(), z.string()).optional(),
      serverId: z.uuid().nullable().optional(),
      status: z.string().nullable().optional(),
      pendingPhotos: z.number().int().optional(),
      conflict: z
        .object({ kept: z.enum(['server', 'client']), serverValue: z.unknown().optional() })
        .optional(),
    }),
  ),
}) satisfies z.ZodType<SyncBatchResponse>;

/** The data set the server answers for a phone (`GET /sync/snapshot`), one page at a time. */
export const snapshotViewSchema = z.object({
  serverTime: dateTime,
  nextSince: z.string(),
  nextAfterId: z.string().nullable(),
  hasMore: z.boolean(),
  projects: z.array(myProjectSchema),
  /** The published application form of each project, each with its project. */
  formVersions: z.array(applicationFormSchema.extend({ projectId: z.uuid() })),
  applications: z.array(applicationSummarySchema),
  /** Every own application the server still lists: the phone drops what is missing here. */
  applicationIds: z.array(z.uuid()),
  locationsVersion: z.string(),
});
export type SnapshotView = z.infer<typeof snapshotViewSchema>;
