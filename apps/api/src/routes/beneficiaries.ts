import {
  type BeneficiaryFilter,
  beneficiaryFilterSchema,
  type ContactUpdate,
  contactUpdateSchema,
  type CorrectionRequestCreate,
  correctionRequestSchema,
  type DismissalRequest,
  dismissalRequestSchema,
  type LookupRequest,
  LOCKED_FIELDS,
  lookupRequestSchema,
  type MergeExecute,
  mergeExecuteSchema,
  type MergeRequest,
  mergeRequestSchema,
} from '@css/shared/beneficiaries';
import { type ReasonRequest, reasonRequestSchema } from '@css/shared/auth';
import { type DecisionRequest, decisionRequestSchema } from '@css/shared/registration';
import { Router } from 'express';
import { z, type ZodType } from 'zod';
import { sensitive } from '../access/field-mask';
import { type AuthedRequest, principalOf, scopeOf } from '../auth/principal';
import type { Container } from '../container';
import { type PageQuery, pageNumberQuery, pageQuery } from '../core/pagination';
import { etagOf } from '../core/etag';
import { ok, page } from '../http/send';
import { defineRoute, type RouteDeps } from '../openapi/define-route';
import { DUPLICATE_RULES } from '../services/beneficiary-merge-candidates';
import { blocklistEntry } from './volunteers';

// Each marked field gets a schema of its own: `sensitive` marks the instance it is given.
const contact = <T extends ZodType>(schema: T) => sensitive(schema, 'beneficiary.contact');
const address = <T extends ZodType>(schema: T) => sensitive(schema, 'beneficiary.address_detail');
const care = <T extends ZodType>(schema: T) => sensitive(schema, 'beneficiary.care');
const detail = <T extends ZodType>(schema: T) => sensitive(schema, 'beneficiary.profile_detail');
const history = <T extends ZodType>(schema: T) =>
  sensitive(schema, 'beneficiary.application_history');

const benNo = () => z.number().int().positive();

const beneficiaryRow = z.object({
  id: z.uuid(),
  benNo: benNo(),
  name: z.string(),
  fatherOrHusbandName: detail(z.string()),
  classCode: detail(z.string().nullable()),
  status: z.string(),
  divisionId: z.uuid(),
  districtId: z.uuid(),
  upazilaId: z.uuid(),
  unionId: address(z.uuid()),
  village: address(z.string()),
  mobile: contact(z.string()),
  isBlocked: care(z.boolean()),
});

const count = () => z.number().int().min(0);
const beneficiaryStatistics = z.object({
  total: count(),
  assistedThisYear: count(),
  blocked: care(count()),
});

const at = () => z.iso.datetime({ offset: true });
const beneficiaryProfile = z.object({
  id: z.uuid(),
  benNo: benNo(),
  mergedInto: z.object({ id: z.uuid(), benNo: benNo() }).nullable(),
  actions: z.object({
    block: z.boolean(),
    unblock: z.boolean(),
    editContact: z.boolean(),
    requestCorrection: z.boolean(),
    decideCorrection: z.boolean(),
    proposeMerge: z.boolean(),
    merge: z.boolean(),
    revertMerge: z.boolean(),
  }),
  contactLog: contact(
    z.array(
      z.object({
        field: z.string(),
        oldValue: z.string().nullable(),
        newValue: z.string().nullable(),
        by: z.uuid().nullable(),
        at: at(),
      }),
    ),
  ),
  corrections: z.array(
    z.object({
      id: z.uuid(),
      beneficiaryId: z.uuid(),
      field: z.enum(LOCKED_FIELDS),
      oldValue: z.string().nullable(),
      newValue: z.string().nullable(),
      reason: z.string(),
      status: z.enum(['submitted', 'approved', 'rejected']),
      requestedBy: z.uuid(),
      requestedAt: at(),
      decidedBy: z.uuid().nullable(),
      decidedAt: at().nullable(),
    }),
  ),
  blocks: sensitive(
    z.array(
      z.object({
        id: z.uuid(),
        reason: z.string(),
        active: z.boolean(),
        blockedAt: at(),
        releasedAt: at().nullable(),
        releaseReason: z.string().nullable(),
      }),
    ),
    'blocklist.reason',
  ),
  merges: z.array(
    z.object({
      id: z.uuid(),
      role: z.enum(['kept', 'merged']),
      otherId: z.uuid().nullable(),
      otherBenNo: benNo(),
      status: z.enum(['merged', 'reverted']),
      mergedAt: at().nullable(),
      revertedAt: at().nullable(),
      leftBehind: z.number().int().min(0),
    }),
  ),
  files: detail(z.array(z.object({ fileId: z.uuid(), slot: z.string(), kind: z.string() }))),
  name: z.string(),
  fatherOrHusbandName: detail(z.string()),
  motherName: detail(z.string().nullable()),
  genderCode: detail(z.string()),
  ageYears: detail(z.number().int().nullable()),
  classCode: detail(z.string().nullable()),
  classOtherText: detail(z.string().nullable()),
  occupationCode: detail(z.string().nullable()),
  status: z.string(),
  photoFileId: detail(z.uuid().nullable()),
  divisionId: z.uuid(),
  districtId: z.uuid(),
  upazilaId: z.uuid(),
  unionId: address(z.uuid()),
  village: address(z.string()),
  postOffice: address(z.string().nullable()),
  postCode: address(z.string().nullable()),
  landmark: address(z.string().nullable()),
  mobile: contact(z.string()),
  familyMembers: contact(
    z.array(
      z.object({
        id: z.uuid(),
        name: z.string(),
        relationshipCode: z.string().nullable(),
        ageYears: z.number().int().nullable(),
      }),
    ),
  ),
  // inside the caller's beneficiary.view_nid scope only, and only with the class
  nid: sensitive(z.string().nullable(), 'beneficiary.nid').optional(),
  birthReg: sensitive(z.string().nullable(), 'beneficiary.nid').optional(),
  isBlocked: care(z.boolean()),
  projectsByYear: z.array(
    z.object({
      year: z.number().int(),
      projects: z.array(
        z.object({
          id: z.uuid(),
          code: z.string(),
          nameBn: z.string(),
          nameEn: z.string(),
          status: z.string(),
        }),
      ),
    }),
  ),
  applications: history(
    z.array(
      z.object({
        id: z.uuid(),
        appNo: z.string().nullable(),
        projectId: z.uuid(),
        status: z.string(),
        submittedAt: z.string().nullable(),
        reviewedAt: z.string().nullable(),
        approvedAt: z.string().nullable(),
        /** An application left on a retired profile at a merge, shown on the kept one. */
        throughMerge: z.boolean(),
      }),
    ),
  ),
  distributions: z.array(
    z.object({
      id: z.uuid(),
      applicationId: z.uuid().nullable(),
      projectId: z.uuid(),
      status: z.string(),
      doneAt: z.string(),
    }),
  ),
  dawah: care(
    z.object({
      attendance: z.array(z.object({ id: z.uuid(), present: z.boolean(), at: z.string() })),
      progress: z.array(z.object({ id: z.uuid(), status: z.string(), at: z.string() })),
      exams: z.array(
        z.object({
          id: z.uuid(),
          passed: z.boolean(),
          score: z.number().nullable(),
          at: z.string(),
        }),
      ),
    }),
  ),
  followUps: care(
    z.object({
      calls: z.array(z.object({ id: z.uuid(), projectId: z.uuid().nullable(), at: z.string() })),
      evaluations: z.array(
        z.object({
          id: z.uuid(),
          projectId: z.uuid().nullable(),
          result: z.string().nullable(),
          at: z.string(),
        }),
      ),
    }),
  ),
  activities: care(
    z.array(
      z.object({
        id: z.uuid(),
        applicationId: z.uuid().nullable(),
        projectId: z.uuid(),
        type: z.string(),
        stage: z.string().nullable(),
        status: z.string(),
        doneAt: z.string(),
      }),
    ),
  ),
});

/**
 * The lookup answer of the application form: the full auto-fill of a found profile wherever it
 * lives, the identity fields marked locked, never the other identity number or a block reason;
 * a blocked person is only named blocked.
 */
const lookupResult = z.object({
  found: z.boolean(),
  blocked: z.boolean().optional(),
  alreadyAppliedInProject: z.boolean().optional(),
  mobileIsCallerOwn: z.boolean().optional(),
  mergedInto: z.object({ benNo: benNo() }).optional(),
  autofill: z
    .object({
      beneficiaryId: z.uuid(),
      benNo: benNo(),
      name: z.string(),
      fatherOrHusbandName: z.string(),
      motherName: z.string().nullable(),
      mobile: z.string(),
      genderCode: z.string(),
      dob: z.iso.date().nullable(),
      ageYears: z.number().int().nullable(),
      divisionId: z.uuid(),
      districtId: z.uuid(),
      upazilaId: z.uuid(),
      unionId: z.uuid(),
      village: z.string(),
      postOffice: z.string().nullable(),
      postCode: z.string().nullable(),
      landmark: z.string().nullable(),
      members14Plus: z.number().int().nullable(),
      childrenUnder14: z.number().int().nullable(),
      lockedFields: z.array(z.enum(LOCKED_FIELDS)),
    })
    .optional(),
});

const warning = z.object({
  code: z.literal('beneficiary.mobile_shared'),
  count: z.number().int().positive(),
  benNos: z.array(z.string()),
});

/** The contact data after an edit, with the warning about a mobile other profiles have. */
const contactView = z.object({
  id: z.uuid(),
  mobile: z.string(),
  divisionId: z.uuid(),
  districtId: z.uuid(),
  upazilaId: z.uuid(),
  unionId: z.uuid(),
  village: z.string(),
  postOffice: z.string().nullable(),
  postCode: z.string().nullable(),
  landmark: z.string().nullable(),
  warnings: z.array(warning),
});

/** A correction request; the values of an identity number only inside the caller's NID scope. */
const correctionView = z.object({
  id: z.uuid(),
  beneficiaryId: z.uuid(),
  field: z.enum(LOCKED_FIELDS),
  oldValue: z.string().nullable(),
  newValue: z.string().nullable(),
  reason: z.string(),
  status: z.enum(['submitted', 'approved', 'rejected']),
  requestedBy: z.uuid(),
  requestedAt: z.iso.datetime({ offset: true }),
  decidedBy: z.uuid().nullable(),
  decidedAt: z.iso.datetime({ offset: true }).nullable(),
});

/** A suggested duplicate pair: who, by which rules; never an identity number or a mobile. */
const mergeCandidate = z.object({
  beneficiaryId: z.uuid(),
  otherBeneficiaryId: z.uuid(),
  benNo: z.string(),
  otherBenNo: z.string(),
  name: z.string(),
  otherName: z.string(),
  matchedOn: z.array(z.enum(DUPLICATE_RULES)),
});

/** A pair marked as two different people, with who marked it and why. */
const mergeDismissal = z.object({
  id: z.uuid(),
  beneficiaryId: z.uuid(),
  otherBeneficiaryId: z.uuid(),
  benNo: z.string(),
  otherBenNo: z.string(),
  name: z.string(),
  otherName: z.string(),
  reason: z.string(),
  dismissedBy: z.uuid(),
  dismissedAt: z.iso.datetime({ offset: true }),
  liftedAt: z.iso.datetime({ offset: true }).nullable(),
});

/** A merge: the pair, who proposed, merged and reverted it, and how many rows moved per kind. */
const mergeView = z.object({
  id: z.uuid(),
  keptId: z.uuid(),
  mergedId: z.uuid(),
  keptBenNo: z.string(),
  mergedBenNo: z.string(),
  keptName: z.string(),
  mergedName: z.string(),
  status: z.enum(['proposed', 'merged', 'reverted']),
  reason: z.string(),
  proposedBy: z.uuid(),
  proposedAt: z.iso.datetime({ offset: true }),
  mergedBy: z.uuid().nullable(),
  mergedAt: z.iso.datetime({ offset: true }).nullable(),
  revertedBy: z.uuid().nullable(),
  revertedAt: z.iso.datetime({ offset: true }).nullable(),
  moved: z.record(z.string(), z.number().int().min(0)),
  leftBehind: z.number().int().min(0),
});
const mergeListQuery = z.strictObject({
  status: z.enum(['proposed', 'merged', 'reverted']).optional(),
});

const listQuery = pageQuery
  .omit({ sort: true })
  .extend(pageNumberQuery.shape)
  .extend(beneficiaryFilterSchema.shape);

const viewerOf = (req: AuthedRequest) => ({
  principal: principalOf(req),
  scope: scopeOf(req),
  fieldClasses: req.fieldClasses ?? new Set<string>(),
});

/**
 * The nationwide beneficiary tab and the 360° profile shell (openapi tag beneficiaries;
 * DECISION_LOG O-67, D-094). The scope entity is the beneficiary, so a team that reaches only some
 * projects (the Procurement Team) sees only their beneficiaries.
 */
export function beneficiariesRouter(
  deps: RouteDeps,
  c: Pick<
    Container,
    | 'beneficiaries'
    | 'beneficiaryIdentity'
    | 'beneficiaryContact'
    | 'beneficiaryCorrections'
    | 'beneficiaryMergeCandidates'
    | 'beneficiaryMerges'
    | 'blocklist'
  >,
): Router {
  const router = Router();

  defineRoute<LookupRequest>(router, deps, {
    tag: 'beneficiaries',
    method: 'post',
    path: '/beneficiaries/lookup',
    operationId: 'beneficiaries.beneficiary.lookup',
    summary:
      'Look up a beneficiary by NID or birth registration for the application form (full auto-fill, locked fields marked, every lookup audited)',
    permission: 'beneficiary.lookup',
    scope: 'project',
    audit: 'beneficiary.looked_up',
    idempotency: 'none',
    rateLimit: 'lookup',
    status: 200,
    body: lookupRequestSchema,
    responses: { 200: lookupResult, 401: null, 403: null, 404: null, 422: null, 429: null },
    handler: ({ body, req }) =>
      c.beneficiaryIdentity.lookup({ principal: principalOf(req), scope: scopeOf(req) }, body),
  });
  const tabOp = {
    tag: 'beneficiaries',
    permission: 'beneficiary.view_all',
    scope: 'beneficiary',
    audit: 'none',
    idempotency: 'none' as const,
    rateLimit: 'list' as const,
    sensitiveFields: [
      'beneficiary.contact',
      'beneficiary.address_detail',
      'beneficiary.care',
      'beneficiary.profile_detail',
    ],
  };

  defineRoute<unknown, Omit<PageQuery, 'sort'> & BeneficiaryFilter>(router, deps, {
    ...tabOp,
    method: 'get',
    path: '/beneficiaries',
    operationId: 'beneficiaries.beneficiary.list',
    summary: 'Nationwide beneficiary tab with filters (masks per role)',
    query: listQuery,
    responses: {
      200: z.array(beneficiaryRow),
      401: null,
      403: null,
      422: null,
      429: null,
      503: null,
    },
    handler: async ({ query, req }) => {
      const { rows, meta } = await c.beneficiaries.list(query, viewerOf(req));
      return page(rows, meta);
    },
  });

  const duplicatesOp = {
    tag: 'beneficiaries',
    permission: 'beneficiary.merge.dismiss',
    scope: 'beneficiary',
    idempotency: 'none' as const,
  };

  // before /beneficiaries/:beneficiaryId, so the path is never read as an id
  defineRoute<unknown, Omit<PageQuery, 'sort'>>(router, deps, {
    ...duplicatesOp,
    method: 'get',
    path: '/beneficiaries/merge-candidates',
    operationId: 'beneficiaries.merge.candidates',
    summary:
      'Suggested duplicate profiles in the caller scope (name, father or husband and mobile; name, date of birth and union; one mobile)',
    audit: 'none',
    rateLimit: 'list',
    query: pageQuery.omit({ sort: true, include: true }),
    responses: {
      200: z.array(mergeCandidate),
      401: null,
      403: null,
      422: null,
      429: null,
      503: null,
    },
    handler: async ({ query, req }) => {
      const { rows, meta } = await c.beneficiaryMergeCandidates.list(
        principalOf(req),
        scopeOf(req),
        query,
      );
      return page(rows, meta);
    },
  });

  defineRoute<DismissalRequest>(router, deps, {
    ...duplicatesOp,
    method: 'post',
    path: '/beneficiaries/merge-dismissals',
    operationId: 'beneficiaries.merge.dismiss',
    summary: 'Mark a suggested pair as two different people, with a reason',
    audit: 'beneficiary.merge_dismissed',
    rateLimit: 'default',
    status: 201,
    body: dismissalRequestSchema,
    responses: { 201: mergeDismissal, 401: null, 403: null, 404: null, 409: null, 422: null },
    handler: ({ body, req }) =>
      c.beneficiaryMergeCandidates.dismiss(principalOf(req), scopeOf(req), body),
  });

  defineRoute(router, deps, {
    ...duplicatesOp,
    method: 'get',
    path: '/beneficiary-merge-dismissals',
    operationId: 'beneficiaries.merge.dismissals',
    summary: 'The pairs marked as two different people in the caller scope, newest first',
    audit: 'none',
    rateLimit: 'list',
    responses: { 200: z.array(mergeDismissal), 401: null, 403: null, 429: null },
    handler: async ({ req }) =>
      ok(await c.beneficiaryMergeCandidates.listDismissals(scopeOf(req), 100)),
  });

  defineRoute<ReasonRequest, unknown, { dismissalId: string }>(router, deps, {
    ...duplicatesOp,
    method: 'post',
    path: '/beneficiary-merge-dismissals/:dismissalId/lift',
    operationId: 'beneficiaries.merge.dismissal_lift',
    summary: 'Lift the mark of a pair with a reason; the pair is suggested again',
    audit: 'beneficiary.merge_dismissal_lifted',
    rateLimit: 'default',
    params: { dismissalId: z.uuid() },
    body: reasonRequestSchema,
    responses: { 200: mergeDismissal, 401: null, 403: null, 404: null, 422: null },
    handler: ({ body, params, req }) =>
      c.beneficiaryMergeCandidates.lift(
        principalOf(req),
        scopeOf(req),
        params.dismissalId,
        body.reason,
      ),
  });

  defineRoute<unknown, BeneficiaryFilter>(router, deps, {
    ...tabOp,
    method: 'get',
    path: '/beneficiaries/statistics',
    operationId: 'beneficiaries.beneficiary.statistics',
    summary: 'Counts of the beneficiary tab for the filters in use (masks per role)',
    query: beneficiaryFilterSchema,
    responses: {
      200: beneficiaryStatistics,
      401: null,
      403: null,
      422: null,
      429: null,
      503: null,
    },
    handler: ({ query, req }) => c.beneficiaries.statistics(query, viewerOf(req)),
  });

  defineRoute<unknown, unknown, { beneficiaryId: string }>(router, deps, {
    ...tabOp,
    method: 'get',
    path: '/beneficiaries/:beneficiaryId',
    operationId: 'beneficiaries.beneficiary.get',
    summary: 'Beneficiary 360° profile shell (masks per role and record)',
    sensitiveFields: [
      ...tabOp.sensitiveFields,
      'beneficiary.application_history',
      'beneficiary.nid',
      'blocklist.reason',
    ],
    params: { beneficiaryId: z.uuid() },
    responses: {
      200: beneficiaryProfile,
      401: null,
      403: null,
      404: null,
      422: null,
      429: null,
      503: null,
    },
    handler: async ({ params, req, res }) => {
      const profile = await c.beneficiaries.profile(viewerOf(req), params.beneficiaryId);
      // the version a contact edit carries back in If-Match
      const etag = etagOf(profile.updatedAt);
      res.setHeader('ETag', etag);
      return ok(profile, { etag });
    },
  });

  const writeOp = {
    tag: 'beneficiaries',
    scope: 'beneficiary',
    idempotency: 'none' as const,
    rateLimit: 'default' as const,
  };

  defineRoute<ContactUpdate, unknown, { beneficiaryId: string }>(router, deps, {
    ...writeOp,
    method: 'patch',
    path: '/beneficiaries/:beneficiaryId/contact',
    operationId: 'beneficiaries.contact.update',
    summary:
      'Edit the mobile and the address of a beneficiary outside an application (each change logged; identity fields refused)',
    permission: 'beneficiary.contact.edit',
    audit: 'beneficiary.contact_updated',
    params: { beneficiaryId: z.uuid() },
    headers: [{ name: 'If-Match', required: true }],
    body: contactUpdateSchema,
    responses: {
      200: contactView,
      401: null,
      403: null,
      404: null,
      409: null,
      412: null,
      422: null,
    },
    handler: async ({ body, params, req, res }) => {
      const { contact, updatedAt } = await c.beneficiaryContact.update(
        principalOf(req),
        scopeOf(req),
        params.beneficiaryId,
        body,
        req.get('if-match'),
      );
      const etag = etagOf(updatedAt);
      res.setHeader('ETag', etag);
      return ok(contact, { etag });
    },
  });

  const mergeOp = { ...writeOp, rateLimit: 'default' as const };

  defineRoute<MergeRequest>(router, deps, {
    ...mergeOp,
    method: 'post',
    path: '/beneficiary-merges',
    operationId: 'beneficiaries.merge.propose',
    summary: 'Propose a merge of two profiles with a reason',
    permission: 'beneficiary.merge.propose',
    audit: 'beneficiary.merge_proposed',
    status: 201,
    body: mergeRequestSchema,
    responses: { 201: mergeView, 401: null, 403: null, 404: null, 409: null, 422: null },
    handler: ({ body, req }) => c.beneficiaryMerges.propose(principalOf(req), scopeOf(req), body),
  });

  defineRoute<unknown, { status?: 'proposed' | 'merged' | 'reverted' }>(router, deps, {
    ...mergeOp,
    method: 'get',
    path: '/beneficiary-merges',
    operationId: 'beneficiaries.merge.list',
    summary: 'The merge proposals and merges of profiles in the caller scope, newest first',
    permission: 'beneficiary.merge.dismiss',
    audit: 'none',
    rateLimit: 'list',
    query: mergeListQuery,
    responses: { 200: z.array(mergeView), 401: null, 403: null, 422: null, 429: null },
    handler: async ({ query, req }) =>
      ok(await c.beneficiaryMerges.list(scopeOf(req), query.status, 100)),
  });

  defineRoute<MergeRequest>(router, deps, {
    ...mergeOp,
    method: 'post',
    path: '/beneficiary-merges/direct',
    operationId: 'beneficiaries.merge.direct',
    summary: 'Merge two profiles without a proposal, keeping the one named and a reason',
    permission: 'beneficiary.merge',
    audit: 'beneficiary.merge',
    status: 201,
    body: mergeRequestSchema,
    responses: { 201: mergeView, 401: null, 403: null, 404: null, 409: null, 422: null },
    handler: ({ body, req }) => c.beneficiaryMerges.direct(principalOf(req), scopeOf(req), body),
  });

  defineRoute<MergeExecute, unknown, { requestId: string }>(router, deps, {
    ...mergeOp,
    method: 'post',
    path: '/beneficiary-merges/:requestId/execute',
    operationId: 'beneficiaries.merge.execute',
    summary: 'Merge the two profiles of a proposal; the merging official may keep the other one',
    permission: 'beneficiary.merge',
    audit: 'beneficiary.merge',
    params: { requestId: z.uuid() },
    body: mergeExecuteSchema,
    responses: { 200: mergeView, 401: null, 403: null, 404: null, 409: null, 422: null },
    handler: ({ body, params, req }) =>
      c.beneficiaryMerges.execute(principalOf(req), scopeOf(req), params.requestId, body.keptId),
  });

  defineRoute<ReasonRequest, unknown, { requestId: string }>(router, deps, {
    ...mergeOp,
    method: 'post',
    path: '/beneficiary-merges/:requestId/revert',
    operationId: 'beneficiaries.merge.revert',
    summary: 'Revert a merge with a reason: exactly what moved goes back',
    permission: 'beneficiary.merge.revert',
    audit: 'beneficiary.merge_reverted',
    params: { requestId: z.uuid() },
    body: reasonRequestSchema,
    responses: { 200: mergeView, 401: null, 403: null, 404: null, 409: null, 422: null },
    handler: ({ body, params, req }) =>
      c.beneficiaryMerges.revert(principalOf(req), scopeOf(req), params.requestId, body.reason),
  });

  defineRoute<ReasonRequest, unknown, { beneficiaryId: string }>(router, deps, {
    ...writeOp,
    method: 'post',
    path: '/beneficiaries/:beneficiaryId/block',
    operationId: 'beneficiaries.blocklist.set',
    summary: 'Block a beneficiary with a reason: no new application in any project',
    permission: 'beneficiary.block',
    audit: 'blocklist.set',
    status: 201,
    params: { beneficiaryId: z.uuid() },
    body: reasonRequestSchema,
    responses: { 201: blocklistEntry, 401: null, 403: null, 404: null, 409: null, 422: null },
    handler: ({ body, params, req }) =>
      c.blocklist.blockBeneficiary(
        principalOf(req),
        scopeOf(req),
        params.beneficiaryId,
        body.reason,
      ),
  });

  defineRoute<ReasonRequest, unknown, { beneficiaryId: string }>(router, deps, {
    ...writeOp,
    method: 'post',
    path: '/beneficiaries/:beneficiaryId/unblock',
    operationId: 'beneficiaries.blocklist.lift',
    summary: 'Lift a beneficiary block with a reason',
    permission: 'beneficiary.unblock',
    audit: 'blocklist.lift',
    params: { beneficiaryId: z.uuid() },
    body: reasonRequestSchema,
    responses: { 200: blocklistEntry, 401: null, 403: null, 404: null, 409: null, 422: null },
    handler: ({ body, params, req }) =>
      c.blocklist.unblockBeneficiary(
        principalOf(req),
        scopeOf(req),
        params.beneficiaryId,
        body.reason,
      ),
  });

  defineRoute<CorrectionRequestCreate, unknown, { beneficiaryId: string }>(router, deps, {
    ...writeOp,
    method: 'post',
    path: '/beneficiaries/:beneficiaryId/correction-requests',
    operationId: 'beneficiaries.correction.create',
    summary: 'Request correction of a locked field',
    permission: 'beneficiary.correction.request',
    audit: 'beneficiary.correction_requested',
    status: 201,
    params: { beneficiaryId: z.uuid() },
    body: correctionRequestSchema,
    responses: { 201: correctionView, 401: null, 403: null, 404: null, 409: null, 422: null },
    handler: ({ body, params, req }) =>
      c.beneficiaryCorrections.request(principalOf(req), scopeOf(req), params.beneficiaryId, body),
  });

  defineRoute<DecisionRequest, unknown, { requestId: string }>(router, deps, {
    ...writeOp,
    method: 'post',
    path: '/beneficiary-corrections/:requestId/decision',
    operationId: 'beneficiaries.correction.decide',
    summary: 'Approve or reject a correction; approval changes the locked field',
    permission: 'beneficiary.correction.approve',
    audit: 'beneficiary.correction_decided',
    params: { requestId: z.uuid() },
    body: decisionRequestSchema,
    responses: { 200: correctionView, 401: null, 403: null, 404: null, 409: null, 422: null },
    handler: ({ body, params, req }) =>
      c.beneficiaryCorrections.decide(principalOf(req), scopeOf(req), params.requestId, body),
  });

  return router;
}
