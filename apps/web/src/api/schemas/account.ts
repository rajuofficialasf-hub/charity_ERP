import type {
  DeviceSession,
  InvitationView,
  OwnStaffProfile,
  ProjectsWork,
} from '@css/shared/auth';
import { AFFILIATIONS, USER_STATES } from '@css/shared/auth';
import { PROJECT_STATUSES } from '@css/shared/projects';
import { z } from 'zod';
import { bilingual, date, dateTime } from './common';
import { extraAreaSchema } from './staff';

/** The own volunteer profile as `GET /volunteers/me` answers. */
export const ownProfileSchema = z.object({
  userId: z.uuid(),
  volunteerId: z.uuid().nullable(),
  state: z.enum(USER_STATES),
  displayName: z.string(),
  mobile: z.string().nullable(),
  email: z.string().nullable(),
  inAnyProject: z.boolean(),
  fatherName: z.string(),
  motherName: z.string(),
  nid: z.string(),
  type: z.string(),
  whatsapp: z.string().nullable(),
  divisionId: z.uuid(),
  districtId: z.uuid(),
  upazilaId: z.uuid(),
  unionId: z.uuid(),
  addressLine: z.string().nullable(),
  education: z.string().nullable(),
  experience: z.string().nullable(),
  workDescription: z.string().nullable(),
  previousProjects: z.string().nullable(),
  facebookId: z.string().nullable(),
  bloodGroup: z.string().nullable(),
  dateOfBirth: z.string().nullable(),
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
  bank: z.object({
    bankName: z.string().optional(),
    accountName: z.string().optional(),
    accountNumber: z.string().optional(),
    branchName: z.string().optional(),
    routingNumber: z.string().optional(),
  }),
  photoFileId: z.uuid().nullable(),
  nidPhotoFileId: z.uuid().nullable(),
  nidPhotoBackFileId: z.uuid().nullable(),
});
export type OwnProfile = z.infer<typeof ownProfileSchema>;

/** A correction or edit request of the person's own, as they follow it. */
export const changeRequestSchema = z.object({
  id: z.uuid(),
  /** Null on an official's own request. */
  volunteerId: z.uuid().nullable(),
  kind: z.enum(['registration_correction', 'profile_edit']),
  field: z.string(),
  newValue: z.unknown().optional(),
  note: z.string().nullable(),
  status: z.enum(['open', 'submitted', 'approved', 'rejected', 'closed']),
});
export type ChangeRequest = z.infer<typeof changeRequestSchema>;

const named = z.object({ id: z.uuid(), name: bilingual });
const namedRole = z.object({ key: z.string(), name: bilingual });

/** An official's own profile (`GET /me/profile`). */
export const ownStaffProfileSchema = z.object({
  id: z.uuid(),
  displayName: z.string(),
  jobId: z.string().nullable(),
  designation: z.string().nullable(),
  roles: z.array(namedRole),
  affiliation: z.enum(AFFILIATIONS).nullable(),
  affiliationUnit: z.string().nullable(),
  program: named.nullable(),
  supervisor: z.object({ id: z.uuid(), name: z.string() }).nullable(),
  mobile: z.string().nullable(),
  email: z.string().nullable(),
  state: z.enum(USER_STATES),
  lastLoginAt: dateTime.nullable(),
  photoFileId: z.uuid().nullable(),
  /** The extra areas the person holds now for volunteers, the newest first. */
  extraAreas: z.array(extraAreaSchema),
}) satisfies z.ZodType<OwnStaffProfile>;

const count = z.number().int();

/** An official's projects by year with the figures of their work. */
export const projectsWorkSchema = z.object({
  everyProject: z.boolean(),
  years: z.array(
    z.object({
      year: z.number().int(),
      projects: z.array(
        z.object({
          id: z.uuid(),
          code: z.string(),
          name: bilingual,
          year: z.number().int(),
          status: z.enum(PROJECT_STATUSES),
          program: named,
          applyFrom: date.nullable(),
          applyTo: date.nullable(),
          roles: z.array(namedRole),
          areas: z.array(named),
          wholeProject: z.boolean(),
          figures: z.object({
            area: z.object({
              received: count,
              waiting: count,
              approved: count,
              rejected: count,
              waitlisted: count,
              volunteers: count,
            }),
            mine: z.object({
              reviewed: count,
              approved: count,
              rejected: count,
              waitlisted: count,
              medianDays: z.number().nullable(),
            }),
          }),
        }),
      ),
    }),
  ),
}) satisfies z.ZodType<ProjectsWork>;

/** The programs an official may ask to move to. */
export const staffChoicesSchema = z.object({ programs: z.array(named) });
export type StaffChoices = z.infer<typeof staffChoicesSchema>;

/** One signed-in device of the caller (`GET /sessions`). */
export const deviceSessionSchema = z.object({
  id: z.uuid(),
  deviceName: z.string().nullable(),
  platform: z.string().nullable(),
  appVersion: z.string().nullable(),
  createdAt: dateTime,
  lastSeenAt: dateTime,
  current: z.boolean(),
  revokedAt: dateTime.nullable(),
  pendingCount: z.number().int().nullable(),
  pendingReportedAt: dateTime.nullable(),
}) satisfies z.ZodType<DeviceSession>;

/** What the set-password page shows before the password is chosen. */
export const invitationViewSchema = z.object({
  displayName: z.string(),
  jobId: z.string(),
  minPasswordLength: z.number().int(),
  expiresAt: dateTime,
}) satisfies z.ZodType<InvitationView>;
