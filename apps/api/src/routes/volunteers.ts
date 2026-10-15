import { VOLUNTEER_TYPES } from '@css/shared/registration';
import { type VolunteerFilter, volunteerFilterSchema } from '@css/shared/volunteers';
import { reasonRequestSchema, type ReasonRequest, USER_STATES } from '@css/shared/auth';
import { Router } from 'express';
import { z } from 'zod';
import { sensitive } from '../access/field-mask';
import { type AuthedRequest, principalOf, scopeOf } from '../auth/principal';
import { type PageQuery, pageQuery } from '../core/pagination';
import { page } from '../http/send';
import type { Container } from '../container';
import { defineRoute, type RouteDeps } from '../openapi/define-route';
import { volunteerDetailsShape } from './volunteer-details-schema';

const text = z.string().nullable();
/** The own profile as the contract's OwnVolunteerProfile; only these fields leave. */
const ownProfile = z.object({
  userId: z.uuid(),
  volunteerId: z.uuid().nullable(),
  state: z.enum(USER_STATES),
  displayName: z.string(),
  mobile: text,
  email: text,
  inAnyProject: z.boolean(),
  fatherName: z.string(),
  motherName: z.string(),
  nid: z.string(),
  type: z.enum(VOLUNTEER_TYPES),
  whatsapp: text,
  divisionId: z.uuid(),
  districtId: z.uuid(),
  upazilaId: z.uuid(),
  unionId: z.uuid(),
  addressLine: text,
  education: text,
  experience: text,
  workDescription: text,
  previousProjects: text,
  facebookId: text,
  ...volunteerDetailsShape(false),
  bank: z.object({
    bankName: z.string().optional(),
    accountName: z.string().optional(),
    accountNumber: z.string().optional(),
    branchName: z.string().optional(),
    routingNumber: z.string().optional(),
  }),
  referenceNid: text,
  photoFileId: z.uuid().nullable(),
  nidPhotoFileId: z.uuid().nullable(),
  nidPhotoBackFileId: z.uuid().nullable(),
});

/** One row of the volunteer tab; the category and the inactive flag only for those who see them. */
const volunteerRow = z.object({
  id: z.uuid(),
  userId: z.uuid(),
  displayName: z.string(),
  type: z.enum(VOLUNTEER_TYPES),
  state: z.enum(USER_STATES),
  divisionId: z.uuid(),
  districtId: z.uuid(),
  upazilaId: z.uuid(),
  photoFileId: z.uuid().nullable(),
  blocked: z.boolean(),
  projects: z.array(
    z.object({ id: z.uuid(), code: z.string(), nameBn: z.string(), nameEn: z.string() }),
  ),
  category: sensitive(z.enum(['A', 'B', 'C', 'D']).nullable(), 'volunteer.rating'),
  inactiveFlag: sensitive(z.boolean(), 'volunteer.rating'),
});

const count = z.number().int().min(0);
/** The counts above the tab; `inactive` only for those who see categories. */
const volunteerStatistics = z.object({
  volunteers: z.object({
    total: count,
    active: count,
    pending: count,
    blocked: count,
    deactivated: count,
    // a schema of its own: `sensitive` marks the instance it is given
    inactive: sensitive(z.number().int().min(0), 'volunteer.rating').optional(),
  }),
  applications: z.object({ total: count, approved: count, underReview: count }),
});

const listQuery = pageQuery.omit({ sort: true }).extend(volunteerFilterSchema.shape);

/** The caller as the list services need it: who asks, and which protected classes they see. */
const viewerOf = (req: AuthedRequest) => ({
  principal: principalOf(req),
  fieldClasses: req.fieldClasses ?? new Set<string>(),
});

/** A blocklist entry without its reason (the reason is in the audit log, class blocklist.reason). */
const blocklistEntry = z.object({
  id: z.uuid(),
  subjectType: z.enum(['volunteer', 'beneficiary']),
  subjectId: z.uuid(),
  active: z.boolean(),
  blockedAt: z.string(),
  releasedAt: z.string().nullable(),
});

/**
 * Volunteer routes (openapi tag volunteers): the own profile and the blocklist (BR-047); the
 * volunteer tab follows with the next task of docs/PLAN.md.
 */
export function volunteersRouter(
  deps: RouteDeps,
  c: Pick<Container, 'volunteers' | 'blocklist' | 'volunteerList'>,
): Router {
  const router = Router();

  const tabOp = {
    tag: 'volunteers',
    permission: 'volunteer.view_all',
    scope: 'global',
    audit: 'none',
    idempotency: 'none' as const,
    rateLimit: 'list' as const,
    sensitiveFields: ['volunteer.rating'],
  };

  defineRoute<unknown, Omit<PageQuery, 'sort'> & VolunteerFilter>(router, deps, {
    ...tabOp,
    method: 'get',
    path: '/volunteers',
    operationId: 'volunteers.volunteer.list',
    summary: 'Nationwide volunteer tab with filters (masks per role)',
    query: listQuery,
    responses: {
      200: z.array(volunteerRow),
      401: null,
      403: null,
      422: null,
      429: null,
      503: null,
    },
    handler: async ({ query, req }) => {
      const { rows, meta } = await c.volunteerList.list(query, viewerOf(req));
      return page(rows, meta);
    },
  });

  defineRoute<unknown, VolunteerFilter>(router, deps, {
    ...tabOp,
    method: 'get',
    path: '/volunteers/statistics',
    operationId: 'volunteers.volunteer.statistics',
    summary: 'Counts of the volunteer tab for the filters in use (masks per role)',
    query: volunteerFilterSchema,
    responses: { 200: volunteerStatistics, 401: null, 403: null, 422: null, 429: null, 503: null },
    handler: ({ query, req }) => c.volunteerList.statistics(query, viewerOf(req)),
  });

  defineRoute(router, deps, {
    tag: 'volunteers',
    method: 'get',
    path: '/volunteers/me',
    operationId: 'volunteers.self.get',
    summary:
      'Own volunteer profile with the own NID and bank details (D-081); never the own rating or category; also for a pending registrant',
    permission: 'authenticated',
    scope: 'self',
    allowPending: true,
    audit: 'none',
    idempotency: 'none',
    rateLimit: 'default',
    responses: { 200: ownProfile, 401: null, 404: null },
    handler: ({ req }) => c.volunteers.own(principalOf(req)),
  });

  const blockOp = {
    tag: 'volunteers',
    scope: 'volunteer',
    idempotency: 'none' as const,
    rateLimit: 'default' as const,
    params: { volunteerId: z.uuid() },
    body: reasonRequestSchema,
  };

  defineRoute<ReasonRequest, unknown, { volunteerId: string }>(router, deps, {
    ...blockOp,
    method: 'post',
    path: '/volunteers/:volunteerId/block',
    status: 201,
    operationId: 'volunteers.blocklist.set',
    summary: 'Block a volunteer with a reason (BR-047)',
    permission: 'volunteer.block',
    audit: 'blocklist.set',
    responses: { 201: blocklistEntry, 401: null, 403: null, 404: null, 409: null, 422: null },
    handler: ({ body, params, req }) =>
      c.blocklist.block(principalOf(req), scopeOf(req), params.volunteerId, body.reason),
  });

  defineRoute<ReasonRequest, unknown, { volunteerId: string }>(router, deps, {
    ...blockOp,
    method: 'post',
    path: '/volunteers/:volunteerId/unblock',
    operationId: 'volunteers.blocklist.lift',
    summary: 'Lift a volunteer block with a reason',
    permission: 'volunteer.unblock',
    audit: 'blocklist.lift',
    responses: { 200: blocklistEntry, 401: null, 403: null, 404: null, 422: null },
    handler: ({ body, params, req }) =>
      c.blocklist.unblock(principalOf(req), scopeOf(req), params.volunteerId, body.reason),
  });

  return router;
}
