import {
  EXPORT_FORMATS,
  EXPORT_KINDS,
  EXPORT_LISTS,
  EXPORT_STATES,
  type ExportList,
  type ExportRequest,
  exportRequestSchema,
} from '@css/shared/exports';
import { Router } from 'express';
import { z } from 'zod';
import { principalOf } from '../auth/principal.js';
import type { Container } from '../container.js';
import { currentContext } from '../core/request-context.js';
import { defineRoute, type RouteDeps } from '../openapi/define-route.js';

const bilingual = z.object({ bn: z.string(), en: z.string() });

const jobSchema = z.object({
  id: z.uuid(),
  kind: z.enum(EXPORT_KINDS),
  format: z.enum(EXPORT_FORMATS),
  status: z.enum(EXPORT_STATES),
  columns: z.array(z.string()),
  rowsDone: z.int().min(0),
  rowsTotal: z.int().min(0).nullable(),
  rowCount: z.int().min(0).nullable(),
  fileId: z.uuid().nullable(),
  sensitive: z.boolean(),
  errorCode: z.string().nullable(),
  createdAt: z.string(),
  finishedAt: z.string().nullable(),
  expired: z.boolean(),
});

const columnsSchema = z.object({
  data: z.object({
    columns: z.array(
      z.object({
        id: z.string(),
        label: bilingual,
        group: z.enum(['list', 'detail', 'question']),
        protected: z.boolean(),
        onScreen: z.boolean(),
        kind: z.string(),
        section: z.object({ key: z.string(), title: bilingual }).nullable(),
      }),
    ),
  }),
});

const columnsQuery = z.strictObject({
  list: z.enum(EXPORT_LISTS),
  projectId: z.uuid().optional(),
});

const locale = () => currentContext()?.locale ?? 'bn';

/**
 * The exports of the lists (docs/api/API_STANDARDS.md, "Export job pattern"): the columns a
 * person may export, the request that queues a job, and the person's own jobs. Asking needs
 * `export.list` and the list's own read permission, checked by the service with the protected
 * columns; following a job needs only a sign-in, since a person sees nothing but their own jobs.
 */
export function exportsRouter(deps: RouteDeps, c: Pick<Container, 'exports'>): Router {
  const router = Router();

  defineRoute<unknown, { list: ExportList; projectId?: string }>(router, deps, {
    tag: 'exports',
    method: 'get',
    path: '/exports/columns',
    operationId: 'exports.column.list',
    summary:
      "The columns of a list the caller may export, in the file's order; a project's application list adds its form questions by section",
    permission: 'export.list',
    scope: 'self',
    audit: 'none',
    idempotency: 'none',
    rateLimit: 'default',
    query: columnsQuery,
    responses: { 200: columnsSchema, 403: null, 404: null, 422: null },
    handler: ({ query, req }) =>
      c.exports.columns(principalOf(req), query.list, query.projectId, locale()),
  });

  defineRoute<ExportRequest>(router, deps, {
    tag: 'exports',
    method: 'post',
    path: '/exports',
    status: 202,
    operationId: 'exports.job.create',
    summary:
      "Start an export job with the list's rows, the caller's scope and field masks frozen; protected columns need export.beneficiaries, export.volunteers or export.forms",
    permission: 'export.list',
    scope: 'self',
    audit: 'export.requested',
    idempotency: 'none',
    rateLimit: 'export',
    body: exportRequestSchema,
    responses: {
      202: z.object({ data: jobSchema }),
      403: null,
      404: null,
      409: null,
      422: null,
      429: null,
      503: null,
    },
    handler: ({ body, req }) => c.exports.request(principalOf(req), body, locale()),
  });

  defineRoute(router, deps, {
    tag: 'exports',
    method: 'get',
    path: '/exports',
    operationId: 'exports.job.list',
    summary: "The caller's own export jobs of the last 30 days, the newest first",
    permission: 'authenticated',
    scope: 'self',
    audit: 'none',
    idempotency: 'none',
    rateLimit: 'default',
    responses: { 200: z.object({ data: z.array(jobSchema) }), 401: null },
    handler: ({ req }) => c.exports.list(principalOf(req)),
  });

  defineRoute<unknown, unknown, { jobId: string }>(router, deps, {
    tag: 'exports',
    method: 'get',
    path: '/exports/:jobId',
    operationId: 'exports.job.get',
    summary: "One of the caller's own export jobs with its progress; anyone else's answers 404",
    permission: 'authenticated',
    scope: 'self',
    audit: 'none',
    idempotency: 'none',
    rateLimit: 'default',
    params: { jobId: z.uuid() },
    responses: { 200: z.object({ data: jobSchema }), 404: null },
    handler: ({ params, req }) => c.exports.get(principalOf(req), params.jobId),
  });

  // a record printed whole: the profile with the journey report's permission, one application
  // with the lists' export permission; the service also checks the record's own read
  defineRoute<unknown, unknown, { beneficiaryId: string }>(router, deps, {
    tag: 'exports',
    method: 'post',
    path: '/beneficiaries/:beneficiaryId/pdf',
    status: 202,
    operationId: 'exports.beneficiaryProfile.create',
    summary:
      "Start the PDF of a beneficiary's 360° profile as the caller may read it; the NID only with export.beneficiaries",
    permission: 'report.beneficiary_journey',
    scope: 'beneficiary',
    audit: 'export.requested',
    idempotency: 'none',
    rateLimit: 'export',
    params: { beneficiaryId: z.uuid() },
    responses: { 202: z.object({ data: jobSchema }), 403: null, 404: null, 409: null, 429: null },
    handler: ({ params, req }) =>
      c.exports.requestRecord(
        principalOf(req),
        'beneficiary_profile',
        params.beneficiaryId,
        locale(),
      ),
  });

  defineRoute<unknown, unknown, { applicationId: string }>(router, deps, {
    tag: 'exports',
    method: 'post',
    path: '/applications/:applicationId/pdf',
    status: 202,
    operationId: 'exports.application.create',
    summary:
      'Start the PDF of one application as the caller may read it; the official section only with export.forms',
    permission: 'export.list',
    scope: 'application',
    audit: 'export.requested',
    idempotency: 'none',
    rateLimit: 'export',
    params: { applicationId: z.uuid() },
    responses: { 202: z.object({ data: jobSchema }), 403: null, 404: null, 409: null, 429: null },
    handler: ({ params, req }) =>
      c.exports.requestRecord(principalOf(req), 'application', params.applicationId, locale()),
  });

  return router;
}
