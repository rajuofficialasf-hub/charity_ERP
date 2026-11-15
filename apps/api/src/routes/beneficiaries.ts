import {
  BENEFICIARY_SORTS,
  type BeneficiaryFilter,
  beneficiaryFilterSchema,
  type BeneficiarySort,
  type ContactUpdate,
  contactUpdateSchema,
  type CorrectionRequestCreate,
  correctionRequestSchema,
  type DismissalRequest,
  dismissalRequestSchema,
  type IdentityAdd,
  identityAddSchema,
  type LookupRequest,
  LOCKED_FIELDS,
  lookupRequestSchema,
  type MatchRequest,
  matchRequestSchema,
  type MergeExecute,
  mergeExecuteSchema,
  type MergeRequest,
  mergeRequestSchema,
} from '@css/shared/beneficiaries';
import { type ReasonRequest, reasonRequestSchema } from '@css/shared/auth';
import { type DecisionRequest, decisionRequestSchema } from '@css/shared/registration';
import { Router } from 'express';
import { publishedWorkView } from '../services/media-home.js';
import { z, type ZodType } from 'zod';
import { sensitive } from '../access/field-mask.js';
import { type AuthedRequest, principalOf, scopeOf } from '../auth/principal.js';
import type { Container } from '../container.js';
import { type PageQuery, pageNumberQuery, pageQuery } from '../core/pagination.js';
import { etagOf } from '../core/etag.js';
import { ok, page } from '../http/send.js';
import { defineRoute, type RouteDeps } from '../openapi/define-route.js';
import { DUPLICATE_RULES, PAIR_LEVELS } from '../services/beneficiary-merge-candidates.js';
import { helpSummarySchema } from '../services/help-history.js';
import { blocklistEntry } from './volunteers.js';

// Each marked field gets a schema of its own: `sensitive` marks the instance it is given.
const contact = <T extends ZodType>(schema: T) => sensitive(schema, 'beneficiary.contact');
const address = <T extends ZodType>(schema: T) => sensitive(schema, 'beneficiary.address_detail');
const care = <T extends ZodType>(schema: T) => sensitive(schema, 'beneficiary.care');
const detail = <T extends ZodType>(schema: T) => sensitive(schema, 'beneficiary.profile_detail');
/** Whether an identity document is on file: an identity fact, though never the number itself. */
const hasDocument = () => sensitive(z.boolean(), 'beneficiary.nid');
const history = <T extends ZodType>(schema: T) =>
  sensitive(schema, 'beneficiary.application_history');

const benNo = () => z.number().int().positive();
/** Another profile the family section names: its id, BEN number as read out, and name. */
const familyProfileRef = () =>
  z.object({ beneficiaryId: z.uuid(), benNo: z.string(), name: z.string() });

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
  // null for a person reached through their volunteer
  mobile: contact(z.string().nullable()),
  hasDocument: hasDocument(),
  isBlocked: care(z.boolean()),
  photoFileId: detail(z.uuid().nullable()),
  // the times helped, kept on the profile (docs/BUSINESS_RULES.md, "Beneficiary identity and
  // master")
  helpCount: history(z.number().int().min(0)),
});

const count = () => z.number().int().min(0);
const beneficiaryStatistics = z.object({
  total: count(),
  assistedThisYear: count(),
  blocked: care(count()),
  male: detail(count()),
  female: detail(count()),
});

const at = () => z.iso.datetime({ offset: true });
/** The 360° profile, also read by its PDF through the same mask. */
export const beneficiaryProfile = z.object({
  id: z.uuid(),
  benNo: benNo(),
  mergedInto: z.object({ id: z.uuid(), benNo: benNo() }).nullable(),
  actions: z.object({
    block: z.boolean(),
    unblock: z.boolean(),
    editContact: z.boolean(),
    requestCorrection: z.boolean(),
    decideCorrection: z.boolean(),
    /** Add the identity document to a profile without one (an official who sees numbers). */
    addIdentity: z.boolean(),
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
  // whether that name is the father's or the husband's (a code of the list guardian_relation)
  guardianRelationCode: detail(z.string().nullable()),
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
  mobile: contact(z.string().nullable()),
  // whose number the mobile is (a code of the list mobile_owner) and that person's name
  mobileOwnerCode: contact(z.string().nullable()),
  mobileOwnerName: contact(z.string().nullable()),
  hasDocument: hasDocument(),
  // the household's members, every detail with the contact class, their income among them
  familyMembers: contact(
    z.array(
      z.object({
        id: z.uuid(),
        name: z.string(),
        relationshipCode: z.string().nullable(),
        // the relationship in the words of its list
        relationship: z.object({ bn: z.string(), en: z.string() }).nullable(),
        ageYears: z.number().int().nullable(),
        occupationCode: z.string().nullable(),
        // taka, up to two decimals
        monthlyIncome: z.number().nullable(),
        // the profile the member probably is, only where the caller reaches it
        profile: familyProfileRef().nullable(),
      }),
    ),
  ),
  // the families that probably hold the person as a member, each head the caller reaches
  memberOf: contact(
    z.array(
      z.object({
        head: familyProfileRef(),
        relationships: z.array(
          z.object({
            code: z.string(),
            name: z.object({ bn: z.string(), en: z.string() }).nullable(),
          }),
        ),
      }),
    ),
  ),
  // what the family received: the person and the members' profiles the caller reaches; the others
  // only as a number of people, never a year, a project or an amount
  familyHelp: history(
    helpSummarySchema()
      .extend({
        people: z.number().int().min(1),
        notShown: z.number().int().min(0),
      })
      .nullable(),
  ).optional(),
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
  // how often the person was helped (docs/BUSINESS_RULES.md, "Beneficiary identity and master")
  help: history(helpSummarySchema()).optional(),
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
  /** The published and done media works about the person. */
  media: z.array(publishedWorkView),
});

/**
 * The name lookup's answer: at most five people and a count that stops one past them, each with
 * only what a volunteer may see of someone already here, and a token to pick one who may be
 * picked here.
 */
const matchAnswer = z.object({
  total: z.number().int(),
  people: z.array(
    z.object({
      name: z.string(),
      fatherOrHusbandName: z.string(),
      village: z.string(),
      helpedYears: z.array(z.number().int()),
      projects: z.array(
        z.object({ name: z.object({ bn: z.string(), en: z.string() }), year: z.number().int() }),
      ),
      pickable: z.boolean(),
      pickToken: z.string().nullable(),
    }),
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
      mobile: z.string().nullable(),
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
  mobile: z.string().nullable(),
  mobileOwnerCode: z.string().nullable(),
  mobileOwnerName: z.string().nullable(),
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

/** The profile after an official added its identity document: the kind, never the number. */
const identityAddedView = z.object({
  beneficiaryId: z.uuid(),
  kind: z.enum(['nid', 'birth_reg']),
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

/** A suggested duplicate pair: who, by which rules, how sure; never an identity number or a mobile. */
const mergeCandidate = z.object({
  beneficiaryId: z.uuid(),
  otherBeneficiaryId: z.uuid(),
  benNo: z.string(),
  otherBenNo: z.string(),
  name: z.string(),
  otherName: z.string(),
  matchedOn: z.array(z.enum(DUPLICATE_RULES)),
  level: z.enum(PAIR_LEVELS),
});
/** The suggestions of one level, or of one profile (the comparison reads its own pair so). */
const mergeCandidateQuery = pageQuery.omit({ sort: true, include: true }).extend({
  level: z.enum(PAIR_LEVELS).optional(),
  beneficiaryId: z.uuid().optional(),
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
  .extend(beneficiaryFilterSchema.shape)
  // by the times helped, for a caller with the application history class only
  .extend({ sort: z.enum(BENEFICIARY_SORTS).optional() });

const viewerOf = (req: AuthedRequest) => ({
  principal: principalOf(req),
  scope: scopeOf(req),
  fieldClasses: req.fieldClasses ?? new Set<string>(),
});

/**
 * The nationwide beneficiary tab and the 360° profile shell (openapi tag beneficiaries). The scope
 * entity is the beneficiary, so a team that reaches only some projects (the Procurement Team) sees
 * only their beneficiaries.
 */
export function beneficiariesRouter(
  deps: RouteDeps,
  c: Pick<
    Container,
    | 'beneficiaries'
    | 'beneficiaryIdentity'
    | 'beneficiaryMatch'
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
  defineRoute<MatchRequest>(router, deps, {
    tag: 'beneficiaries',
    method: 'post',
    path: '/beneficiaries/match',
    operationId: 'beneficiaries.beneficiary.match',
    summary:
      'The people already here under a name, father or husband and village, for an application without a document (exact keys, at most five, only where the project asks the document "if they have one", every call audited and counted)',
    permission: 'beneficiary.match',
    scope: 'project',
    audit: 'beneficiary.matched',
    idempotency: 'none',
    rateLimit: 'lookup',
    status: 200,
    body: matchRequestSchema,
    responses: { 200: matchAnswer, 401: null, 403: null, 422: null, 429: null },
    handler: ({ body, req }) =>
      c.beneficiaryMatch.match({ principal: principalOf(req), scope: scopeOf(req) }, body),
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

  defineRoute<unknown, Omit<PageQuery, 'sort'> & BeneficiaryFilter & { sort?: BeneficiarySort }>(
    router,
    deps,
    {
      ...tabOp,
      // the rows say whether a document is on file, an identity fact, and the times helped
      sensitiveFields: [
        ...tabOp.sensitiveFields,
        'beneficiary.nid',
        'beneficiary.application_history',
      ],
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
    },
  );

  const duplicatesOp = {
    tag: 'beneficiaries',
    permission: 'beneficiary.merge.dismiss',
    scope: 'beneficiary',
    idempotency: 'none' as const,
  };

  // before /beneficiaries/:beneficiaryId, so the path is never read as an id
  defineRoute<unknown, z.infer<typeof mergeCandidateQuery>>(router, deps, {
    ...duplicatesOp,
    method: 'get',
    path: '/beneficiaries/merge-candidates',
    operationId: 'beneficiaries.merge.candidates',
    summary:
      'Suggested duplicate profiles in the caller scope with their level (name, father or husband and mobile; name, date of birth and union; name, father or husband and village; one mobile)',
    audit: 'none',
    rateLimit: 'list',
    query: mergeCandidateQuery,
    responses: {
      200: z.array(mergeCandidate),
      401: null,
      403: null,
      422: null,
      429: null,
      503: null,
    },
    handler: async ({ query, req }) => {
      const { level, beneficiaryId, ...paging } = query;
      const { rows, meta } = await c.beneficiaryMergeCandidates.list(
        principalOf(req),
        scopeOf(req),
        paging,
        { level, beneficiaryId },
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
    // the filter on the times helped is the application history's
    sensitiveFields: [...tabOp.sensitiveFields, 'beneficiary.application_history'],
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

  defineRoute<IdentityAdd, unknown, { beneficiaryId: string }>(router, deps, {
    ...writeOp,
    method: 'post',
    path: '/beneficiaries/:beneficiaryId/identity',
    operationId: 'beneficiaries.identity.add',
    summary:
      'Add the identity document to a profile that has none, after comparing the two (the profile keeps its history)',
    permission: 'beneficiary.correction.approve',
    audit: 'beneficiary.identity_added',
    params: { beneficiaryId: z.uuid() },
    headers: [{ name: 'If-Match', required: true }],
    body: identityAddSchema,
    responses: {
      200: identityAddedView,
      401: null,
      403: null,
      404: null,
      409: null,
      412: null,
      422: null,
    },
    handler: async ({ body, params, req, res }) => {
      const { updatedAt, ...added } = await c.beneficiaryCorrections.addIdentity(
        principalOf(req),
        scopeOf(req),
        params.beneficiaryId,
        body,
        req.get('if-match'),
      );
      const etag = etagOf(updatedAt);
      res.setHeader('ETag', etag);
      return ok(added, { etag });
    },
  });

  return router;
}
