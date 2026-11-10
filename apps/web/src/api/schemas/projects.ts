import { PERMISSION_SETS, RULES_PARTS } from '@css/shared/projects';
import { VOLUNTEER_TYPES } from '@css/shared/registration';
import { z } from 'zod';
import { bilingual, date, dateTime } from './common';

/** One of the caller's running projects (`GET /me/projects`). */
export const myProjectSchema = z.object({
  projectId: z.uuid(),
  code: z.string(),
  year: z.number().int(),
  name: bilingual,
  status: z.enum(['active', 'closing']),
  applyFrom: date.nullable(),
  applyTo: date.nullable(),
  perVolunteerLimit: z.number().int().nullable(),
  dawahEnabled: z.boolean(),
  via: z.enum(['assignment', 'team']),
  permissionSet: z.enum(PERMISSION_SETS).nullable(),
  isPaid: z.boolean(),
  consentStatus: z.enum(['pending', 'accepted']),
  rulesVersion: z.number().int(),
  applicationsCounted: z.number().int(),
  applicationsLeft: z.number().int().nullable(),
  /** The caller may build a team here (an assigned General or দাঈ-স্বেচ্ছাসেবক volunteer). */
  leadsTeam: z.boolean(),
});
export type MyProject = z.infer<typeof myProjectSchema>;

/** The project with the rules parts to read (`GET /me/projects/{id}`). */
export const myProjectDetailSchema = myProjectSchema.extend({
  rules: z.object({
    version: z.number().int(),
    parts: z.array(z.object({ part: z.enum(RULES_PARTS), text: bilingual })),
  }),
});
export type MyProjectDetail = z.infer<typeof myProjectDetailSchema>;

const teamPerson = z.object({
  volunteerId: z.uuid(),
  displayName: z.string(),
  type: z.enum(VOLUNTEER_TYPES),
});

export const teamMemberSchema = teamPerson.extend({
  consentStatus: z.enum(['pending', 'accepted']),
  addedAt: dateTime,
});
export type TeamMember = z.infer<typeof teamMemberSchema>;

/** The caller's team on a project and the team members who may join it. */
export const teamSchema = z.object({
  members: z.array(teamMemberSchema),
  candidates: z.array(teamPerson),
});
export type Team = z.infer<typeof teamSchema>;
