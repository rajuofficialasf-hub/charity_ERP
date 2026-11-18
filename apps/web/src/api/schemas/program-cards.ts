import { PROJECT_STATUSES } from '@css/shared/projects';
import { z } from 'zod';
import { bilingual, date, versionedOf } from './common';

const count = z.number().int();

/** The officials a card names, three at most, and how many there are. */
export const cardPeopleSchema = z.object({
  people: z.array(z.object({ id: z.uuid(), name: z.string(), photoFileId: z.uuid().nullable() })),
  total: count,
});
export type CardPeople = z.infer<typeof cardPeopleSchema>;

/** The caller's own work on what a card stands for; the budget only to who may see it. */
const todoSchema = z.object({
  reviewsWaiting: count,
  waitlisted: count,
  budgetPlanned: z.string().nullable().optional(),
});

/**
 * A program as a card (`GET /program-cards`): counts, its PM and the RPMs of its projects'
 * current sessions, and the caller's own work only where the caller has any.
 */
export const programCardSchema = z.object({
  id: z.uuid(),
  code: z.string(),
  name: bilingual,
  description: bilingual.nullable(),
  coverFileId: z.uuid().nullable(),
  active: z.boolean(),
  pm: z.object({ id: z.uuid(), name: z.string() }).nullable(),
  rpms: cardPeopleSchema,
  projects: count,
  runningProjects: count,
  beneficiaries: count,
  applications: count,
  volunteers: count,
  todo: todoSchema.optional(),
  canCreate: z.boolean(),
});
export type ProgramCard = z.infer<typeof programCardSchema>;

/** A project series, the permanent project, as a card (`GET /project-series`). */
export const projectSeriesCardSchema = z.object({
  id: z.uuid(),
  programId: z.uuid(),
  code: z.string(),
  name: bilingual,
  description: bilingual.nullable(),
  coverFileId: z.uuid().nullable(),
  sessionCount: count,
  beneficiaries: count,
  current: z
    .object({
      id: z.uuid(),
      sessionLabel: z.string(),
      periodFrom: z.string(),
      periodTo: z.string(),
      status: z.enum(PROJECT_STATUSES),
      applyTo: date.nullable(),
      daysLeft: count.nullable(),
      target: count.nullable(),
      approved: count,
      applications: count,
      rpms: cardPeopleSchema,
      volunteers: count,
      districts: count,
    })
    .nullable(),
  todo: todoSchema.optional(),
  canCreate: z.boolean(),
});
export type ProjectSeriesCard = z.infer<typeof projectSeriesCardSchema>;

/**
 * The whole counts of one session (`GET /projects/{id}/summary`), the same for every holder of
 * the overview as its card counts them.
 */
export const sessionSummarySchema = z.object({
  applications: count,
  approved: count,
  waiting: count,
  waitlisted: count,
  volunteers: count,
  districts: count,
  target: count.nullable(),
  daysLeft: count.nullable(),
});
export type SessionSummary = z.infer<typeof sessionSummarySchema>;

/** One project series with its program and its sessions, newest first (`GET /project-series/{id}`). */
export const projectSeriesSchema = projectSeriesCardSchema.extend({
  program: z.object({ id: z.uuid(), name: bilingual }),
  sessions: z.array(
    z.object({
      id: z.uuid(),
      year: count,
      sessionLabel: z.string(),
      periodFrom: z.string(),
      periodTo: z.string(),
      status: z.enum(PROJECT_STATUSES),
      applications: count,
      approved: count,
      canOpen: z.boolean(),
    }),
  ),
});
export type ProjectSeries = z.infer<typeof projectSeriesSchema>;

/** One project series with its version, read when its edit opens (If-Match). */
export const projectSeriesRecordSchema = versionedOf(projectSeriesSchema);
export type ProjectSeriesRecord = z.infer<typeof projectSeriesRecordSchema>;

/** A cover just set (`PUT /programs/{id}/cover`, `PUT /project-series/{id}/cover`). */
export const coverSchema = z.object({ fileId: z.uuid() });
