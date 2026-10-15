import { type BeneficiaryFilter, beneficiaryFilterSchema } from '@css/shared/beneficiaries';
import { Router } from 'express';
import { z, type ZodType } from 'zod';
import { sensitive } from '../access/field-mask';
import { type AuthedRequest, principalOf, scopeOf } from '../auth/principal';
import type { Container } from '../container';
import { type PageQuery, pageQuery } from '../core/pagination';
import { page } from '../http/send';
import { defineRoute, type RouteDeps } from '../openapi/define-route';

// Each marked field gets a schema of its own: `sensitive` marks the instance it is given.
const contact = <T extends ZodType>(schema: T) => sensitive(schema, 'beneficiary.contact');
const address = <T extends ZodType>(schema: T) => sensitive(schema, 'beneficiary.address_detail');
const care = <T extends ZodType>(schema: T) => sensitive(schema, 'beneficiary.care');
const at = () => z.string();

const beneficiaryRow = z.object({
  id: z.uuid(),
  name: z.string(),
  fatherOrHusbandName: z.string(),
  classCode: z.string().nullable(),
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
  name: z.string(),
  fatherOrHusbandName: z.string(),
  motherName: z.string().nullable(),
  genderCode: z.string(),
  ageYears: z.number().int().nullable(),
  classCode: z.string().nullable(),
  classOtherText: z.string().nullable(),
  occupationCode: z.string().nullable(),
  status: z.string(),
  photoFileId: z.uuid().nullable(),
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
  applications: z.array(
    z.object({
      id: z.uuid(),
      appNo: z.string().nullable(),
      projectId: z.uuid(),
      status: z.string(),
      submittedAt: at().nullable(),
      reviewedAt: at().nullable(),
      approvedAt: at().nullable(),
    }),
  ),
  distributions: z.array(
    z.object({
      id: z.uuid(),
      applicationId: z.uuid().nullable(),
      projectId: z.uuid(),
      status: z.string(),
      doneAt: at(),
    }),
  ),
  dawah: care(
    z.object({
      attendance: z.array(z.object({ id: z.uuid(), present: z.boolean(), at: at() })),
      progress: z.array(z.object({ id: z.uuid(), status: z.string(), at: at() })),
      exams: z.array(
        z.object({ id: z.uuid(), passed: z.boolean(), score: z.number().nullable(), at: at() }),
      ),
    }),
  ),
  followUps: care(
    z.object({
      calls: z.array(z.object({ id: z.uuid(), projectId: z.uuid().nullable(), at: at() })),
      evaluations: z.array(
        z.object({
          id: z.uuid(),
          projectId: z.uuid().nullable(),
          result: z.string().nullable(),
          at: at(),
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
        doneAt: at(),
      }),
    ),
  ),
});

const listQuery = pageQuery.omit({ sort: true }).extend(beneficiaryFilterSchema.shape);

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
export function beneficiariesRouter(deps: RouteDeps, c: Pick<Container, 'beneficiaries'>): Router {
  const router = Router();
  const tabOp = {
    tag: 'beneficiaries',
    permission: 'beneficiary.view_all',
    scope: 'beneficiary',
    audit: 'none',
    idempotency: 'none' as const,
    rateLimit: 'list' as const,
    sensitiveFields: ['beneficiary.contact', 'beneficiary.address_detail', 'beneficiary.care'],
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
    sensitiveFields: [...tabOp.sensitiveFields, 'beneficiary.nid'],
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
