import { PERMISSION_SETS, projectRulesSchema } from '@css/shared/projects';
import { VOLUNTEER_TYPES } from '@css/shared/registration';
import { z } from 'zod';
import { bilingual, dateTime } from './common';

/** A component of a project with its settings and the version a change carries back. */
export const projectComponentSchema = z.object({
  componentKey: z.string(),
  enabled: z.boolean(),
  settings: z.record(z.string(), z.unknown()).optional(),
  etag: z.string().optional(),
});
export type ProjectComponent = z.infer<typeof projectComponentSchema>;

/** One fund source of a project's budget. */
export const fundSourceSchema = z.object({
  source: z.enum(['zakat', 'sadaqah', 'general', 'donor']),
  label: z.string().nullable(),
  amount: z.string(),
});
export type FundSource = z.infer<typeof fundSourceSchema>;

/** An area of a project with its RPM. */
export const areaSchema = z.object({
  id: z.uuid(),
  locationId: z.uuid(),
  level: z.enum(['division', 'district']),
  locationName: bilingual,
  rpmUserId: z.uuid(),
  rpmName: z.string(),
});
export type Area = z.infer<typeof areaSchema>;

/** A quota with what came and what was approved in its place. */
export const quotaSchema = z.object({
  level: z.enum(['district', 'union']),
  locationId: z.uuid(),
  locationName: bilingual,
  target: z.number().int(),
  received: z.number().int(),
  approved: z.number().int(),
  full: z.boolean(),
});
export type Quota = z.infer<typeof quotaSchema>;

/** An official's access to the project. */
export const staffAccessSchema = z.object({
  id: z.uuid(),
  userId: z.uuid(),
  displayName: z.string(),
  roleKey: z.string(),
  areaLocationId: z.uuid().nullable(),
  canView: z.boolean(),
  canEdit: z.boolean(),
  canDelete: z.boolean(),
  /** The "if RPM grants" extras the person holds on the project. */
  extraPermissions: z.array(z.string()),
});
export type StaffAccess = z.infer<typeof staffAccessSchema>;

/** An official with a role the project may be given (`GET /projects/{id}/candidates`). */
export const staffCandidateSchema = z.object({
  id: z.uuid(),
  displayName: z.string(),
  designation: z.string().nullable(),
});
export type StaffCandidate = z.infer<typeof staffCandidateSchema>;

/** A topic of the dawah syllabus. */
export const topicSchema = z.object({ id: z.string(), title: bilingual });
export type Topic = z.infer<typeof topicSchema>;

/** The rules texts of a project and their version (0 while none is saved). */
export const rulesVersionSchema = z.object({
  version: z.number().int(),
  rules: projectRulesSchema,
});
export type RulesVersion = z.infer<typeof rulesVersionSchema>;

/** A volunteer's assignment to a project (`GET /projects/{id}/volunteers`). */
export const assignmentSchema = z.object({
  id: z.uuid(),
  volunteerId: z.uuid(),
  displayName: z.string(),
  type: z.enum(VOLUNTEER_TYPES),
  regionLocationId: z.uuid(),
  permissionSet: z.enum(PERMISSION_SETS),
  isPaid: z.boolean(),
  consentStatus: z.enum(['pending', 'accepted']),
  consentAt: dateTime.nullable(),
  applicationsCounted: z.number().int(),
  assignedAt: dateTime,
});
export type Assignment = z.infer<typeof assignmentSchema>;

/** A volunteer the caller may assign: name, type and area only. */
export const volunteerCandidateSchema = z.object({
  volunteerId: z.uuid(),
  displayName: z.string(),
  type: z.enum(VOLUNTEER_TYPES),
  divisionId: z.uuid(),
  districtId: z.uuid(),
  upazilaId: z.uuid(),
  unionId: z.uuid(),
  defaultPermissionSet: z.enum(PERMISSION_SETS).nullable(),
});
export type VolunteerCandidate = z.infer<typeof volunteerCandidateSchema>;

const cursorMeta = z.object({ nextCursor: z.string().nullable() });

export const assignmentPageSchema = z.object({ data: z.array(assignmentSchema), meta: cursorMeta });
export type AssignmentPage = z.infer<typeof assignmentPageSchema>;

export const volunteerCandidatePageSchema = z.object({
  data: z.array(volunteerCandidateSchema),
  meta: cursorMeta,
});
export type VolunteerCandidatePage = z.infer<typeof volunteerCandidatePageSchema>;

/** An application of the old volunteer that a transfer may pick. */
export const transferCandidateSchema = z.object({
  id: z.uuid(),
  appNo: z.string().nullable(),
  beneficiaryName: z.string().nullable(),
  status: z.string(),
});
export type TransferCandidate = z.infer<typeof transferCandidateSchema>;

/** What one transfer did: the applications moved, the team members moved, the limit warning. */
export const transferResultSchema = z.object({
  batchId: z.uuid(),
  moved: z.array(z.uuid()),
  teamMoved: z.number().int(),
  overLimit: z.boolean(),
});
export type TransferResult = z.infer<typeof transferResultSchema>;
