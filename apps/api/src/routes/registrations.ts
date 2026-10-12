import { reasonRequestSchema, type ReasonRequest, USER_STATES } from '@css/shared/auth';
import {
  type ChangeRequestAnswer,
  changeRequestAnswerSchema,
  type RegistrationCorrectionCreate,
  registrationCorrectionCreateSchema,
  type StaffDecision,
  staffDecisionSchema,
  VOLUNTEER_TYPES,
} from '@css/shared/registration';
import { Router } from 'express';
import { z } from 'zod';
import { sensitive } from '../access/field-mask';
import { principalOf, scopeOf } from '../auth/principal';
import type { Container } from '../container';
import { pageQuery } from '../core/pagination';
import { ok, page } from '../http/send';
import { defineRoute, type RouteDeps } from '../openapi/define-route';
import type { RegistrationListQuery } from '../services/registrations';

const uuid = z.uuid();
const nullableText = z.string().nullable();
const listQuery = pageQuery.omit({ sort: true }).extend({
  kind: z.enum(['volunteer', 'staff']).optional(),
  status: z.enum(['awaiting_review', 'in_correction']).optional(),
  districtId: z.uuid().optional(),
});

const pendingRegistration = z.object({
  userId: uuid,
  kind: z.enum(['volunteer', 'staff']),
  displayName: z.string(),
  status: z.enum(['awaiting_review', 'in_correction']),
  submittedAt: z.string(),
  volunteerType: z.enum(VOLUNTEER_TYPES).nullable(),
  divisionId: uuid.nullable(),
  districtId: uuid.nullable(),
  designation: nullableText,
});

const changeRequest = z.object({
  id: uuid,
  volunteerId: uuid,
  kind: z.enum(['registration_correction', 'profile_edit']),
  field: z.string(),
  newValue: z.unknown().optional(),
  note: nullableText,
  status: z.enum(['open', 'submitted', 'approved', 'rejected', 'closed']),
  contactVerified: z.boolean().optional(),
  decidedAt: z.string().nullable(),
});

const volunteerSummary = z.object({
  id: uuid,
  userId: uuid,
  displayName: z.string(),
  type: z.enum(VOLUNTEER_TYPES),
  state: z.enum(USER_STATES),
  districtId: uuid,
  upazilaId: uuid,
  approvedAt: z.string().nullable(),
});

/** The registration an approver opens; NID, NID photo and bank details by field class (RBAC.md 6). */
const registrationDetail = pendingRegistration.extend({
  mobile: nullableText,
  email: nullableText,
  photoFileId: uuid.nullable(),
  homeProgramId: uuid.nullable(),
  homeDivisionId: uuid.nullable(),
  volunteer: volunteerSummary
    .extend({
      fatherName: z.string(),
      motherName: z.string(),
      mobile: nullableText,
      whatsapp: nullableText,
      divisionId: uuid,
      unionId: uuid,
      addressLine: nullableText,
      education: nullableText,
      experience: nullableText,
      workDescription: nullableText,
      previousProjects: nullableText,
      facebookId: nullableText,
      nid: sensitive(z.string(), 'volunteer.identity'),
      nidPhotoFileId: sensitive(uuid.nullable(), 'volunteer.identity'),
      bank: sensitive(
        z.object({
          bankName: nullableText,
          accountName: nullableText,
          accountNumber: nullableText,
          routingNumber: nullableText,
        }),
        'volunteer.bank',
      ),
      photoFileId: uuid.nullable(),
      referenceVolunteerId: uuid.nullable(),
    })
    .nullable(),
  blocklisted: z.boolean(),
  corrections: z.array(changeRequest),
});

const userView = z.object({
  id: uuid,
  displayName: z.string(),
  kind: z.enum(['staff', 'volunteer']),
  state: z.enum(USER_STATES),
  designation: nullableText,
  roles: z.array(z.string()),
  mobile: nullableText,
  email: nullableText,
  homeProgramId: uuid.nullable(),
  homeDivisionId: uuid.nullable(),
  isSystemOwner: z.boolean(),
  lastLoginAt: z.string().nullable(),
});

const pendingOp = {
  tag: 'registration',
  scope: 'volunteer',
  idempotency: 'none' as const,
  rateLimit: 'default' as const,
};
const ownOp = {
  tag: 'registration',
  scope: 'self',
  permission: 'authenticated',
  allowPending: true,
  idempotency: 'none' as const,
  rateLimit: 'default' as const,
};
const listMeta = (rows: unknown[]) => ({ limit: rows.length, nextCursor: null, prevCursor: null });

/**
 * Registrations after submit (openapi tag registration; BR-028 to BR-030): the approvers' list,
 * detail and decisions, the staff decision, and the registrant's own corrections and resubmit.
 */
export function registrationsRouter(
  deps: RouteDeps,
  c: Pick<Container, 'registrations' | 'users'>,
): Router {
  const router = Router();

  defineRoute<unknown, RegistrationListQuery>(router, deps, {
    ...pendingOp,
    method: 'get',
    path: '/registrations',
    operationId: 'registration.pending.list',
    summary:
      'Pending registrations within scope (volunteers by address, D-084; staff for staff approvers only)',
    permission: 'registration.approve',
    audit: 'none',
    query: listQuery,
    responses: { 200: z.array(pendingRegistration), 401: null, 403: null, 422: null },
    handler: async ({ query, req }) => {
      const { rows, meta } = await c.registrations.list(query, principalOf(req), scopeOf(req));
      return page(rows, meta);
    },
  });

  defineRoute<unknown, unknown, { userId: string }>(router, deps, {
    ...pendingOp,
    method: 'get',
    path: '/registrations/:userId',
    operationId: 'registration.pending.get',
    summary:
      'One pending registration with its fields, photos and correction requests (masks per role)',
    permission: 'registration.approve',
    audit: 'none',
    sensitiveFields: ['volunteer.identity', 'volunteer.bank'],
    params: { userId: uuid },
    responses: { 200: registrationDetail, 401: null, 403: null, 404: null },
    handler: ({ params, req }) =>
      c.registrations.detail(principalOf(req), scopeOf(req), params.userId),
  });

  defineRoute<unknown, unknown, { userId: string }>(router, deps, {
    ...pendingOp,
    method: 'post',
    path: '/registrations/:userId/approve',
    operationId: 'registration.volunteer.approve',
    summary:
      'Approve a volunteer registration; the account becomes active (refused while corrections are open or the volunteer is blocklisted)',
    permission: 'registration.approve',
    audit: 'auth.approved',
    params: { userId: uuid },
    responses: { 200: volunteerSummary, 401: null, 403: null, 404: null, 409: null },
    handler: ({ params, req }) =>
      c.registrations.approve(principalOf(req), scopeOf(req), params.userId),
  });

  defineRoute<ReasonRequest, unknown, { userId: string }>(router, deps, {
    ...pendingOp,
    method: 'post',
    path: '/registrations/:userId/reject',
    status: 204,
    operationId: 'registration.volunteer.reject',
    summary: 'Reject a volunteer registration with a reason; the person may register again (D-086)',
    permission: 'registration.approve',
    audit: 'auth.rejected',
    params: { userId: uuid },
    body: reasonRequestSchema,
    responses: { 204: null, 401: null, 403: null, 404: null, 409: null, 422: null },
    handler: ({ body, params, req }) =>
      c.registrations.reject(principalOf(req), scopeOf(req), params.userId, body.reason),
  });

  defineRoute<RegistrationCorrectionCreate, unknown, { userId: string }>(router, deps, {
    ...pendingOp,
    method: 'post',
    path: '/registrations/:userId/correction-requests',
    status: 201,
    operationId: 'registration.correction.create',
    summary:
      'Ask the registrant to correct the named fields with one note; one request row per field (the whole form is not returned, BR-030)',
    permission: 'registration.request_correction',
    audit: 'auth.correction_requested',
    params: { userId: uuid },
    body: registrationCorrectionCreateSchema,
    responses: {
      201: z.array(changeRequest),
      401: null,
      403: null,
      404: null,
      409: null,
      422: null,
    },
    handler: async ({ body, params, req }) => {
      const rows = await c.registrations.requestCorrections(
        principalOf(req),
        scopeOf(req),
        params.userId,
        body,
      );
      return page(rows, listMeta(rows));
    },
  });

  defineRoute<StaffDecision, unknown, { userId: string }>(router, deps, {
    tag: 'registration',
    method: 'post',
    path: '/staff-registrations/:userId/decision',
    operationId: 'registration.staff.decide',
    summary: 'Approve (with role) or reject a staff registration',
    permission: 'staff.registration.approve',
    scope: 'global',
    audit: 'auth.approved',
    idempotency: 'none',
    rateLimit: 'default',
    params: { userId: uuid },
    body: staffDecisionSchema,
    responses: { 200: userView, 401: null, 403: null, 404: null, 422: null },
    handler: async ({ body, params, req }) => {
      await c.registrations.decideStaff(principalOf(req), params.userId, body);
      return ok((await c.users.get(scopeOf(req), params.userId)).user);
    },
  });

  defineRoute(router, deps, {
    ...ownOp,
    method: 'get',
    path: '/me/change-requests',
    operationId: 'registration.ownChangeRequest.list',
    summary: 'Own open correction and edit requests',
    audit: 'none',
    responses: { 200: z.array(changeRequest), 401: null },
    handler: async ({ req }) => {
      const rows = await c.registrations.ownRequests(principalOf(req));
      return page(rows, listMeta(rows));
    },
  });

  defineRoute<ChangeRequestAnswer, unknown, { requestId: string }>(router, deps, {
    ...ownOp,
    method: 'patch',
    path: '/me/change-requests/:requestId',
    operationId: 'registration.ownChangeRequest.answer',
    summary: 'Answer one correction request with the corrected value',
    audit: 'auth.correction_answered',
    params: { requestId: uuid },
    body: changeRequestAnswerSchema,
    responses: { 200: changeRequest, 401: null, 404: null, 409: null, 422: null },
    handler: ({ body, params, req }) =>
      c.registrations.answer(principalOf(req), params.requestId, body),
  });

  defineRoute(router, deps, {
    ...ownOp,
    method: 'post',
    path: '/me/registration/resubmit',
    status: 204,
    operationId: 'registration.correction.resubmit',
    summary:
      'Return the corrected registration to the approvers once every correction is answered (BR-030)',
    audit: 'auth.correction_resubmitted',
    responses: { 204: null, 401: null, 409: null },
    handler: ({ req }) => c.registrations.resubmit(principalOf(req)),
  });

  return router;
}
