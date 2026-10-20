import {
  type BeneficiaryFilter,
  beneficiaryFilterSchema,
  type LookupRequest,
  LOCKED_FIELDS,
  lookupRequestSchema,
} from '@css/shared/beneficiaries';
import { Router } from 'express';
import { z, type ZodType } from 'zod';
import { sensitive } from '../access/field-mask';
import { type AuthedRequest, principalOf, scopeOf } from '../auth/principal';
import type { Container } from '../container';
import { type PageQuery, pageNumberQuery, pageQuery } from '../core/pagination';
import { page } from '../http/send';
import { defineRoute, type RouteDeps } from '../openapi/define-route';

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

const beneficiaryProfile = z.object({
  id: z.uuid(),
  benNo: benNo(),
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
 * lives, the identity fields marked locked, never the other identity number or a block reason.
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
  c: Pick<Container, 'beneficiaries' | 'beneficiaryIdentity'>,
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
    handler: ({ params, req }) => c.beneficiaries.profile(viewerOf(req), params.beneficiaryId),
  });

  return router;
}
