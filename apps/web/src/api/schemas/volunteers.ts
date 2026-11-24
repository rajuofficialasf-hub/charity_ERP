import { USER_STATES } from '@css/shared/auth';
import { VOLUNTEER_TYPES } from '@css/shared/registration';
import {
  VOLUNTEER_STATES,
  type VolunteerRow,
  type VolunteerStatistics,
} from '@css/shared/volunteers';
import { z } from 'zod';
import { dateTime, tabPageOf } from './common';

const category = z.enum(['A', 'B', 'C', 'D']);

/** A row of the volunteer tab (`GET /volunteers`). */
export const volunteerRowSchema = z.object({
  id: z.uuid(),
  userId: z.uuid(),
  displayName: z.string(),
  type: z.enum(VOLUNTEER_TYPES),
  state: z.enum(VOLUNTEER_STATES),
  divisionId: z.uuid(),
  districtId: z.uuid(),
  upazilaId: z.uuid(),
  photoFileId: z.uuid().nullable(),
  blocked: z.boolean(),
  projects: z.array(
    z.object({ id: z.uuid(), code: z.string(), nameBn: z.string(), nameEn: z.string() }),
  ),
  category: category.nullable().optional(),
  inactiveFlag: z.boolean().optional(),
}) satisfies z.ZodType<VolunteerRow>;

export const volunteerPageSchema = tabPageOf(volunteerRowSchema);
export type VolunteerPage = z.infer<typeof volunteerPageSchema>;

/** The counts above the volunteer tab for the filters in use. */
export const volunteerStatisticsSchema = z.object({
  volunteers: z.object({
    total: z.number().int(),
    active: z.number().int(),
    pending: z.number().int(),
    blocked: z.number().int(),
    deactivated: z.number().int(),
    rejected: z.number().int(),
    inactive: z.number().int().optional(),
  }),
  applications: z.object({
    total: z.number().int(),
    approved: z.number().int(),
    underReview: z.number().int(),
  }),
}) satisfies z.ZodType<VolunteerStatistics>;

/** `GET /volunteers/{volunteerId}`: the official view; protected parts are absent, not empty. */
export const volunteerProfileSchema = z.object({
  id: z.uuid(),
  userId: z.uuid(),
  displayName: z.string(),
  type: z.enum(VOLUNTEER_TYPES),
  state: z.enum(USER_STATES),
  mobile: z.string().nullable(),
  email: z.string().nullable(),
  whatsapp: z.string().nullable(),
  fatherName: z.string(),
  motherName: z.string(),
  divisionId: z.uuid(),
  districtId: z.uuid(),
  upazilaId: z.uuid(),
  unionId: z.uuid(),
  addressLine: z.string().nullable(),
  facebookId: z.string().nullable(),
  education: z.string().nullable(),
  experience: z.string().nullable(),
  workDescription: z.string().nullable(),
  previousProjects: z.string().nullable(),
  tshirtSize: z.string().nullable(),
  volunteeringArea: z.string().nullable(),
  profession: z.string().nullable(),
  professionDetails: z.record(z.string(), z.unknown()),
  interestAreas: z.array(z.string()),
  vehicle: z.string().nullable(),
  canSwim: z.boolean().nullable(),
  availability: z.string().nullable(),
  emergencyFullTime: z.boolean().nullable(),
  educationDetails: z.record(z.string(), z.unknown()),
  permanentAddress: z.record(z.string(), z.unknown()).nullable(),
  bloodGroup: z.string().nullable().optional(),
  dateOfBirth: z.string().nullable().optional(),
  nid: z.string().optional(),
  nidPhotoFileId: z.uuid().nullable().optional(),
  nidPhotoBackFileId: z.uuid().nullable().optional(),
  bank: z
    .object({
      bankName: z.string().optional(),
      accountName: z.string().optional(),
      accountNumber: z.string().optional(),
      branchName: z.string().optional(),
      routingNumber: z.string().optional(),
    })
    .optional(),
  photoFileId: z.uuid().nullable(),
  registeredAt: dateTime,
  approvedAt: dateTime.nullable(),
  projects: z.array(
    z.object({
      id: z.uuid(),
      code: z.string(),
      nameBn: z.string(),
      nameEn: z.string(),
      year: z.number().int(),
      permissionSet: z.string(),
      isPaid: z.boolean(),
      assignedAt: dateTime,
    }),
  ),
  team: z.array(
    z.object({ id: z.uuid(), displayName: z.string(), type: z.string(), state: z.string() }),
  ),
  category: category.nullable().optional(),
  inactiveFlag: z.boolean().optional(),
  ratings: z
    .array(
      z.object({
        projectId: z.uuid(),
        workKind: z.string(),
        finalScores: z.unknown(),
        finalizedAt: dateTime,
      }),
    )
    .optional(),
  blocklist: z.object({
    blocked: z.boolean(),
    blockedAt: dateTime.optional(),
    reason: z.string().optional(),
  }),
  actions: z.object({
    /** The caller decides on this pending registration (a correction may hold it now). */
    review: z.boolean(),
    approve: z.boolean(),
    requestCorrection: z.boolean(),
    block: z.boolean(),
    unblock: z.boolean(),
    viewSessions: z.boolean(),
    revokeSessions: z.boolean(),
  }),
});
export type VolunteerProfile = z.infer<typeof volunteerProfileSchema>;
