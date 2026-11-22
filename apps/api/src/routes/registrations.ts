import { reasonRequestSchema, type ReasonRequest, USER_STATES } from '@css/shared/auth';
import {
  type ChangeRequestAnswer,
  changeRequestAnswerSchema,
  type DecisionRequest,
  decisionRequestSchema,
  type EditRequestCreate,
  editRequestCreateSchema,
  type OtpCodeRequest,
  otpCodeRequestSchema,
  type RegistrationCorrectionCreate,
  registrationCorrectionCreateSchema,
  type StaffDecision,
  staffDecisionSchema,
  type StaffEditRequestCreate,
  staffEditRequestCreateSchema,
  VOLUNTEER_TYPES,
} from '@css/shared/registration';
import { Router } from 'express';
import { z } from 'zod';
import { sensitive } from '../access/field-mask.js';
import { principalOf, scopeOf } from '../auth/principal.js';
import type { Container } from '../container.js';
import { currentContext } from '../core/request-context.js';
import { type PageQuery, pageQuery } from '../core/pagination.js';
import { ok, page } from '../http/send.js';
import { defineRoute, type RouteDeps } from '../openapi/define-route.js';
import type { RegistrationListQuery } from '../services/registrations.js';
import { volunteerDetailsShape } from './volunteer-details-schema.js';

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
  /** The person the request is about: a volunteer's user or an official. */
  userId: uuid,
  /** Null on an official's own request. */
  volunteerId: uuid.nullable(),
  kind: z.enum(['registration_correction', 'profile_edit']),
  field: z.string(),
  // an object or a text; the service shows NID and bank values only to a caller with the field
  // class (`visible` in services/change-requests.ts), the mask passes a leaf whole
  newValue: z.unknown().optional(),
  note: nullableText,
  status: z.enum(['open', 'submitted', 'approved', 'rejected', 'closed']),
  contactVerified: z.boolean().optional(),
  decidedAt: z.string().nullable(),
  volunteerName: z.string().optional(),
});

/** An official's waiting request as its deciders see it: the person and their current value. */
const staffChangeRequest = changeRequest.extend({
  personName: z.string(),
  personJobId: z.string().nullable(),
  currentValue: z.unknown(),
  /** The names of the program the two values name, by id. */
  names: z.record(z.string(), z.object({ bn: z.string(), en: z.string() })),
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

/**
 * The registration an approver opens; NID, NID photo and bank details by field class
 * (docs/security/RBAC.md, "Field-level protection").
 */
/** Exported for the field-mask unit test of the protected volunteer data. */
export const registrationDetail = pendingRegistration.extend({
  mobile: nullableText,
  email: nullableText,
  photoFileId: uuid.nullable(),
  homeProgramId: uuid.nullable(),
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
      ...volunteerDetailsShape(true),
      nid: sensitive(z.string(), 'volunteer.identity'),
      nidPhotoFileId: sensitive(uuid.nullable(), 'volunteer.identity'),
      nidPhotoBackFileId: sensitive(uuid.nullable(), 'volunteer.identity'),
      bank: sensitive(
        z.object({
          bankName: nullableText,
          accountName: nullableText,
          accountNumber: nullableText,
          branchName: nullableText,
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
 * Registrations after submit (openapi tag registration): the approvers' list, detail and decisions,
 * the staff decision, and the registrant's own corrections and resubmit.
 */
export function registrationsRouter(
  deps: RouteDeps,
  c: Pick<Container, 'registrations' | 'users' | 'changeRequests' | 'staffChangeRequests'>,
): Router {
  const router = Router();

  defineRoute<unknown, RegistrationListQuery>(router, deps, {
    ...pendingOp,
    method: 'get',
    path: '/registrations',
    operationId: 'registration.pending.list',
    summary:
      'Pending registrations within scope (volunteers by address, staff for staff approvers only)',
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
    summary: 'Reject a volunteer registration with a reason; the person may register again',
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
      'Ask the registrant to correct the named fields with one note; one request row per field (the whole form is not returned)',
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
    responses: { 200: userView, 401: null, 403: null, 404: null, 409: null, 422: null },
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

  const editOp = {
    tag: 'registration',
    scope: 'self',
    permission: 'edit_request.submit',
    idempotency: 'none' as const,
  };

  defineRoute<EditRequestCreate>(router, deps, {
    ...editOp,
    method: 'post',
    path: '/me/change-requests',
    status: 201,
    operationId: 'registration.editRequest.submit',
    summary:
      'Submit a profile edit request with the new value (approved volunteers cannot edit directly)',
    audit: 'auth.edit_requested',
    rateLimit: 'default',
    body: editRequestCreateSchema,
    responses: { 201: changeRequest, 401: null, 403: null, 404: null, 409: null, 422: null },
    handler: ({ body, req }) => c.changeRequests.create(principalOf(req), body),
  });

  defineRoute<unknown, unknown, { requestId: string }>(router, deps, {
    ...editOp,
    method: 'post',
    path: '/me/change-requests/:requestId/otp',
    status: 204,
    operationId: 'registration.contactChange.sendOtp',
    summary: 'Send a code to the new mobile or email of an own contact edit request',
    audit: 'auth.otp_sent',
    rateLimit: 'otp-request',
    params: { requestId: uuid },
    responses: { 204: null, 401: null, 403: null, 404: null, 409: null, 429: null },
    handler: ({ params, req }) =>
      c.changeRequests.sendCode(
        principalOf(req),
        params.requestId,
        currentContext()?.locale ?? 'bn',
      ),
  });

  defineRoute<OtpCodeRequest, unknown, { requestId: string }>(router, deps, {
    ...editOp,
    method: 'post',
    path: '/me/change-requests/:requestId/otp/verify',
    status: 204,
    operationId: 'registration.contactChange.verifyOtp',
    summary:
      'Verify the code of a contact edit request; only then does the request reach the approvers',
    audit: 'auth.otp_verified',
    rateLimit: 'otp-verify',
    params: { requestId: uuid },
    body: otpCodeRequestSchema,
    responses: { 204: null, 401: null, 403: null, 404: null, 409: null, 422: null, 429: null },
    handler: ({ body, params, req }) =>
      c.changeRequests.verifyCode(principalOf(req), params.requestId, body.code),
  });

  defineRoute<unknown, Omit<PageQuery, 'sort'>>(router, deps, {
    ...pendingOp,
    method: 'get',
    path: '/edit-requests',
    operationId: 'registration.editRequest.list',
    summary: 'Pending edit requests within scope',
    permission: 'edit_request.approve',
    audit: 'none',
    query: pageQuery.omit({ sort: true, include: true }),
    responses: { 200: z.array(changeRequest), 401: null, 403: null, 422: null },
    handler: async ({ query, req }) => {
      const { rows, meta } = await c.changeRequests.list(
        query,
        principalOf(req),
        scopeOf(req),
        (req as { fieldClasses?: ReadonlySet<string> }).fieldClasses ?? new Set<string>(),
      );
      return page(rows, meta);
    },
  });

  defineRoute<DecisionRequest, unknown, { requestId: string }>(router, deps, {
    ...pendingOp,
    method: 'post',
    path: '/edit-requests/:requestId/decision',
    operationId: 'registration.editRequest.decide',
    summary: 'Approve (the new value applies at once) or reject an edit request with a reason',
    permission: 'edit_request.approve',
    audit: 'auth.edit_request_decided',
    params: { requestId: uuid },
    body: decisionRequestSchema,
    responses: { 200: changeRequest, 401: null, 403: null, 404: null, 409: null, 422: null },
    handler: ({ body, params, req }) =>
      c.changeRequests.decide(
        principalOf(req),
        scopeOf(req),
        params.requestId,
        body,
        (req as { fieldClasses?: ReadonlySet<string> }).fieldClasses ?? new Set<string>(),
      ),
  });

  // An official's own requests (docs/DECISION_LOG.md, the official's own profile of 2026-11-02):
  // the same codes and photo upload, and deciders of their own, the Department Head and the
  // Monitoring Team
  const staffEditOp = {
    tag: 'registration',
    scope: 'self',
    permission: 'staff_edit_request.submit',
    idempotency: 'none' as const,
  };

  defineRoute<StaffEditRequestCreate>(router, deps, {
    ...staffEditOp,
    method: 'post',
    path: '/me/staff-change-requests',
    status: 201,
    operationId: 'registration.staffEditRequest.submit',
    summary: "Ask for a change of an official's own name, designation, contact, photo or workplace",
    audit: 'auth.edit_requested',
    rateLimit: 'default',
    body: staffEditRequestCreateSchema,
    responses: { 201: changeRequest, 401: null, 403: null, 404: null, 409: null, 422: null },
    handler: ({ body, req }) => c.staffChangeRequests.create(principalOf(req), body),
  });

  defineRoute(router, deps, {
    ...staffEditOp,
    method: 'get',
    path: '/me/staff-change-requests/choices',
    operationId: 'registration.staffEditRequest.choices',
    summary: 'The programs an official may ask to move to, by name',
    audit: 'none',
    rateLimit: 'default',
    responses: {
      200: z.object({
        programs: z.array(
          z.object({ id: uuid, name: z.object({ bn: z.string(), en: z.string() }) }),
        ),
      }),
      401: null,
      403: null,
      404: null,
    },
    handler: ({ req }) => c.staffChangeRequests.choices(principalOf(req)),
  });

  defineRoute<unknown, unknown, { requestId: string }>(router, deps, {
    ...staffEditOp,
    method: 'post',
    path: '/me/staff-change-requests/:requestId/otp',
    status: 204,
    operationId: 'registration.staffContactChange.sendOtp',
    summary: "Send a code to the new mobile or email of an official's own contact request",
    audit: 'auth.otp_sent',
    rateLimit: 'otp-request',
    params: { requestId: uuid },
    responses: { 204: null, 401: null, 403: null, 404: null, 409: null, 429: null },
    handler: ({ params, req }) =>
      c.changeRequests.sendCode(
        principalOf(req),
        params.requestId,
        currentContext()?.locale ?? 'bn',
      ),
  });

  defineRoute<OtpCodeRequest, unknown, { requestId: string }>(router, deps, {
    ...staffEditOp,
    method: 'post',
    path: '/me/staff-change-requests/:requestId/otp/verify',
    status: 204,
    operationId: 'registration.staffContactChange.verifyOtp',
    summary:
      "Verify the code of an official's own contact request; only then does it reach the deciders",
    audit: 'auth.otp_verified',
    rateLimit: 'otp-verify',
    params: { requestId: uuid },
    body: otpCodeRequestSchema,
    responses: { 204: null, 401: null, 403: null, 404: null, 409: null, 422: null, 429: null },
    handler: ({ body, params, req }) =>
      c.changeRequests.verifyCode(principalOf(req), params.requestId, body.code),
  });

  defineRoute<unknown, Omit<PageQuery, 'sort'>>(router, deps, {
    tag: 'registration',
    scope: 'global',
    idempotency: 'none',
    rateLimit: 'default',
    method: 'get',
    path: '/staff-edit-requests',
    operationId: 'registration.staffEditRequest.list',
    summary: "Officials' own change requests waiting for a decision",
    permission: 'staff_edit_request.approve',
    audit: 'none',
    query: pageQuery.omit({ sort: true, include: true }),
    responses: { 200: z.array(staffChangeRequest), 401: null, 403: null, 422: null },
    handler: async ({ query, req }) => {
      const { rows, meta } = await c.staffChangeRequests.list(query, principalOf(req));
      return page(rows, meta);
    },
  });

  defineRoute<DecisionRequest, unknown, { requestId: string }>(router, deps, {
    tag: 'registration',
    scope: 'global',
    idempotency: 'none',
    rateLimit: 'default',
    method: 'post',
    path: '/staff-edit-requests/:requestId/decision',
    operationId: 'registration.staffEditRequest.decide',
    summary:
      "Approve (the change applies at once) or reject with a reason an official's own request; never one's own",
    permission: 'staff_edit_request.approve',
    audit: 'auth.edit_request_decided',
    params: { requestId: uuid },
    body: decisionRequestSchema,
    responses: { 200: changeRequest, 401: null, 403: null, 404: null, 409: null, 422: null },
    handler: ({ body, params, req }) =>
      c.staffChangeRequests.decide(principalOf(req), params.requestId, body),
  });

  defineRoute(router, deps, {
    ...ownOp,
    method: 'post',
    path: '/me/registration/resubmit',
    status: 204,
    operationId: 'registration.correction.resubmit',
    summary: 'Return the corrected registration to the approvers once every correction is answered',
    audit: 'auth.correction_resubmitted',
    responses: { 204: null, 401: null, 409: null },
    handler: ({ req }) => c.registrations.resubmit(principalOf(req)),
  });

  return router;
}
