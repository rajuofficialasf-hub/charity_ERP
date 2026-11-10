import type { InvitationIssued } from '@css/shared/auth';
import { AFFILIATIONS, USER_STATES } from '@css/shared/auth';
import { z } from 'zod';
import { bilingual, dateTime, versionedOf } from './common';

/** An official as the user list returns it (`GET /users`). */
export const staffMemberSchema = z.object({
  id: z.uuid(),
  displayName: z.string(),
  kind: z.enum(['staff', 'volunteer']),
  state: z.enum(USER_STATES),
  designation: z.string().nullable(),
  roles: z.array(z.string()),
  jobId: z.string().nullable(),
  affiliation: z.enum(AFFILIATIONS).nullable(),
  affiliationUnit: z.string().nullable(),
  homeProgramId: z.uuid().nullable(),
  homeDivisionId: z.uuid().nullable(),
  supervisorUserId: z.uuid().nullable(),
  /** Created by the admin and the set-password link not used yet. */
  awaitingPassword: z.boolean(),
  /** The official's uploaded photo; null shows the initial. */
  photoFileId: z.uuid().nullable(),
});
export type StaffMember = z.infer<typeof staffMemberSchema>;

/** One page of the officials of an affiliation, with the total when it is asked for. */
export const staffPageSchema = z.object({
  data: z.array(staffMemberSchema),
  meta: z.object({ nextCursor: z.string().nullable(), total: z.number().int().optional() }),
});
export type StaffPage = z.infer<typeof staffPageSchema>;

/** The official and its version, read when the profile edit opens (If-Match). */
export const staffRecordSchema = versionedOf(staffMemberSchema);
export type StaffRecord = z.infer<typeof staffRecordSchema>;

/** `GET /users/{userId}` as the official's profile reads it: the contact and the last sign-in. */
export const staffDetailSchema = staffMemberSchema.extend({
  mobile: z.string().nullable(),
  email: z.string().nullable(),
  lastLoginAt: dateTime.nullable(),
  isSystemOwner: z.boolean(),
});
export type StaffDetail = z.infer<typeof staffDetailSchema>;

/** The answer of a new official or a new link: the link, shown once so the admin can copy it. */
export const invitationIssuedSchema = z.object({
  userId: z.uuid(),
  link: z.string(),
  expiresAt: dateTime,
  emailed: z.boolean(),
}) satisfies z.ZodType<InvitationIssued>;

const organogramFields = {
  userId: z.uuid(),
  displayName: z.string(),
  jobId: z.string().nullable(),
  designation: z.string().nullable(),
  roles: z.array(z.string()),
  state: z.enum(['pending', 'active', 'blocked']),
  homeDivisionId: z.uuid().nullable(),
  /** The official's uploaded photo; null shows the initial. */
  photoFileId: z.uuid().nullable(),
};

/** One official in the organogram with those who report to them inside the same part. */
export interface OrganogramNode extends z.infer<z.ZodObject<typeof organogramFields>> {
  reports: OrganogramNode[];
}
export const organogramNodeSchema: z.ZodType<OrganogramNode> = z.object({
  ...organogramFields,
  reports: z.lazy(() => z.array(organogramNodeSchema)),
});

/** `GET /organogram`: the department's own staff by program and supervisor. */
export const organogramSchema = z.object({
  leadership: z.array(organogramNodeSchema),
  programs: z.array(
    z.object({
      programId: z.uuid(),
      code: z.string(),
      name: bilingual,
      active: z.boolean(),
      members: z.array(organogramNodeSchema),
    }),
  ),
  unplaced: z.array(organogramNodeSchema),
});
export type Organogram = z.infer<typeof organogramSchema>;
