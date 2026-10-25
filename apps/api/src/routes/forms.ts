import {
  type FormCreate,
  formCreateSchema,
  type FormPlace,
  formPlaceSchema,
  type PublicLinkConfig,
  publicLinkConfigSchema,
  type ReadyFormCreate,
  readyFormCreateSchema,
} from '@css/shared/forms';
import { Router } from 'express';
import { z } from 'zod';
import { type AuthedRequest, principalOf, scopeOf } from '../auth/principal';
import type { Container } from '../container';
import { etagOf } from '../core/etag';
import { ok } from '../http/send';
import { defineRoute, type RouteDeps } from '../openapi/define-route';

const uuid = z.uuid();
const bilingual = z.object({ bn: z.string(), en: z.string() });
const optionView = z.object({
  code: z.string(),
  label: bilingual,
  dependsOnOptionCode: z.string().nullable(),
  allowsOtherText: z.boolean(),
});
const fieldView = z.object({
  fieldKey: z.string(),
  libraryFieldKey: z.string().nullable(),
  type: z.string(),
  label: bilingual,
  required: z.boolean(),
  standardColumn: z.string().nullable(),
  settings: z.unknown(),
  logic: z.unknown().optional(),
  calculation: z.unknown().optional(),
  options: z.array(optionView),
});
const sectionView = z.object({
  key: z.string(),
  librarySectionKey: z.string().nullable(),
  title: bilingual,
  visibility: z.enum(['volunteer', 'official_only']),
  condition: z.unknown().nullable().optional(),
  fields: z.array(fieldView),
});
export const versionView = z.object({
  id: uuid,
  formId: uuid,
  versionNo: z.number().int(),
  status: z.enum(['draft', 'published', 'retired']),
  publishedAt: z.string().nullable(),
  sections: z.array(sectionView),
  /** The form-level points of the priority score, for the office only. */
  scoring: z.object({ not_previously_assisted: z.number().int().optional() }).optional(),
});
const personView = z.object({ id: uuid, name: z.string() });
/** The version list also names who published and who last changed each version. */
const versionListView = versionView.extend({
  publishedBy: personView.nullable(),
  updatedBy: personView.nullable(),
  updatedAt: z.string(),
});
const formKind = z.enum(['beneficiary_application', 'other']);
const formView = z.object({
  id: uuid,
  projectId: uuid,
  key: z.string(),
  title: bilingual,
  kind: formKind,
  publishedVersionId: uuid.nullable(),
  draftVersionId: uuid.nullable(),
  sourceFormId: uuid.nullable(),
  sourceVersionNo: z.number().int().nullable(),
  newerVersionNo: z.number().int().nullable(),
});
const readyFormView = z.object({
  id: uuid,
  key: z.string(),
  kind: formKind,
  title: bilingual,
  publishedVersionId: uuid.nullable(),
  publishedVersionNo: z.number().int().nullable(),
  draftVersionId: uuid.nullable(),
});
const libraryView = z.object({
  libraryFormId: uuid,
  sections: z.array(
    z.object({
      key: z.string(),
      title: bilingual,
      defaultVisibility: z.string(),
      fieldKeys: z.array(z.string()),
    }),
  ),
  fields: z.array(
    z.object({
      key: z.string(),
      type: z.string(),
      label: bilingual,
      standardColumn: z.string().nullable(),
      defaultSettings: z.unknown(),
      formFields: z.array(fieldView),
    }),
  ),
  templates: z.array(z.object({ key: z.string(), name: bilingual, projectType: z.string() })),
});
const publicLinkView = z.object({
  enabled: z.boolean(),
  formId: uuid.nullable(),
  url: z.string().nullable(),
});
const fieldMapView = z.object({
  fieldKey: z.string(),
  type: z.string(),
  label: bilingual,
  standardColumn: z.string().nullable(),
  versions: z.array(z.number().int()),
});
// the engine judges the sections inside the service, naming each field it refuses
const draftUpdateSchema = z.strictObject({
  sections: z.array(z.unknown()),
  scoring: z.unknown().optional(),
});
type DraftUpdate = z.infer<typeof draftUpdateSchema>;

const viewerOf = (req: AuthedRequest) => ({ principal: principalOf(req), scope: scopeOf(req) });
const versionParams = { versionId: uuid };
const formParams = { formId: uuid };
const ifMatch = [{ name: 'If-Match', required: true }];

/**
 * The forms of a project (openapi tag forms; docs/MASTER_SPEC.md, the dynamic form platform): the library
 * the builder picks from, a project's forms, the first draft from a template, blank or a copy,
 * the versions of a form, one version as the engine, the builder and the phone read it, the
 * draft's update and publish, the next draft, and the fields of a form across its versions.
 */
export function formsRouter(
  deps: RouteDeps,
  c: Pick<Container, 'forms' | 'formLibrary' | 'publicLink' | 'readyForms'>,
): Router {
  const router = Router();
  const op = { tag: 'forms', idempotency: 'none' as const, rateLimit: 'default' as const };
  const build = { ...op, permission: 'form.build', scope: 'project' };
  const withEtag = (
    result: { version: unknown; updatedAt: Date },
    res: { setHeader: (n: string, v: string) => void },
  ) => {
    // the version the next draft write carries back in If-Match
    const etag = etagOf(result.updatedAt);
    res.setHeader('ETag', etag);
    return ok(result.version, { etag });
  };

  defineRoute(router, deps, {
    ...op,
    method: 'get',
    path: '/form-library',
    operationId: 'forms.library.get',
    summary:
      "The question library the builder picks from: the library form's published version (empty until its first publish)",
    permission: 'form.library.view',
    scope: 'global',
    audit: 'none',
    responses: { 200: libraryView, 401: null, 403: null },
    handler: async () => ok(await c.formLibrary.library()),
  });

  defineRoute<unknown, unknown, { projectId: string }>(router, deps, {
    ...op,
    method: 'get',
    path: '/projects/:projectId/forms',
    operationId: 'forms.form.list',
    summary: 'Forms of a project (one per application type); not paginated',
    permission: 'project.view',
    scope: 'project',
    audit: 'none',
    params: { projectId: uuid },
    responses: { 200: z.array(formView), 404: null },
    handler: async ({ params, req }) => ok(await c.forms.list(viewerOf(req), params.projectId)),
  });

  defineRoute<FormCreate, unknown, { projectId: string }>(router, deps, {
    ...build,
    method: 'post',
    path: '/projects/:projectId/forms',
    status: 201,
    operationId: 'forms.form.create',
    summary:
      "Create a project's form as draft version 1 from a library template, blank (the mandatory core only), or copied from another project's published form by a caller who sees its official-only sections (BD-10)",
    audit: 'form.created',
    params: { projectId: uuid },
    body: formCreateSchema,
    responses: { 201: formView, 404: null, 409: null, 422: null },
    handler: async ({ params, body, req }) =>
      ok(await c.forms.create(viewerOf(req), params.projectId, body)),
  });

  defineRoute<unknown, unknown, { formId: string }>(router, deps, {
    ...build,
    method: 'get',
    path: '/forms/:formId/versions',
    operationId: 'forms.version.list',
    summary: 'Versions of a form; not paginated',
    audit: 'none',
    params: formParams,
    responses: { 200: z.array(versionListView), 404: null },
    handler: async ({ params, req }) => ok(await c.forms.versions(viewerOf(req), params.formId)),
  });

  defineRoute<unknown, unknown, { formId: string }>(router, deps, {
    ...build,
    method: 'post',
    path: '/forms/:formId/versions',
    status: 201,
    operationId: 'forms.version.createDraft',
    summary:
      'Create a draft version copied from the latest version (published versions are immutable, BR-077)',
    audit: 'form.version_created',
    params: formParams,
    responses: { 201: versionView, 404: null, 409: null },
    handler: async ({ params, req, res }) =>
      withEtag(await c.forms.createDraft(viewerOf(req), params.formId), res),
  });

  defineRoute<unknown, unknown, { formId: string }>(router, deps, {
    ...build,
    method: 'get',
    path: '/forms/:formId/fields',
    operationId: 'forms.field.map',
    summary:
      'The fields of a form across its versions by key, so reports align answers of different versions (BD-12)',
    audit: 'none',
    params: formParams,
    responses: { 200: z.array(fieldMapView), 404: null },
    handler: async ({ params, req }) => ok(await c.forms.fieldMap(viewerOf(req), params.formId)),
  });

  defineRoute<unknown, unknown, { versionId: string }>(router, deps, {
    ...op,
    method: 'get',
    path: '/form-versions/:versionId',
    operationId: 'forms.version.get',
    summary:
      'Get a form version (official-only sections absent without application.view_official_section)',
    permission: 'project.view',
    scope: 'project',
    audit: 'none',
    sensitiveFields: ['application.official_section'],
    params: versionParams,
    responses: { 200: versionView, 404: null },
    handler: async ({ params, req, res }) =>
      withEtag(await c.forms.read(viewerOf(req), params.versionId), res),
  });

  defineRoute<DraftUpdate, unknown, { versionId: string }>(router, deps, {
    ...build,
    method: 'patch',
    path: '/form-versions/:versionId',
    operationId: 'forms.version.updateDraft',
    summary: 'Replace sections, fields and options of a draft version',
    audit: 'form.draft_changed',
    headers: ifMatch,
    params: versionParams,
    body: draftUpdateSchema,
    responses: { 200: versionView, 404: null, 409: null, 412: null, 422: null },
    handler: async ({ params, body, req, res }) =>
      withEtag(
        await c.forms.updateDraft(viewerOf(req), params.versionId, body, req.get('if-match')),
        res,
      ),
  });

  defineRoute<unknown, unknown, { versionId: string }>(router, deps, {
    ...build,
    method: 'post',
    path: '/form-versions/:versionId/publish',
    operationId: 'forms.version.publish',
    summary:
      'Publish a draft version; the previous version is retired; mandatory fields enforced (BD-13)',
    permission: 'form.publish',
    audit: 'form.publish',
    headers: ifMatch,
    params: versionParams,
    responses: { 200: versionView, 404: null, 409: null, 412: null, 422: null },
    handler: async ({ params, req, res }) =>
      withEtag(await c.forms.publish(viewerOf(req), params.versionId, req.get('if-match')), res),
  });

  defineRoute(router, deps, {
    ...op,
    method: 'get',
    path: '/ready-forms',
    operationId: 'forms.ready.list',
    summary:
      'Ready forms outside the projects: every one with its draft for the builders, the published ones for a PM; never the library; not paginated',
    permission: 'form.place',
    scope: 'project',
    audit: 'none',
    responses: { 200: z.array(readyFormView), 403: null },
    handler: async ({ req }) => ok(await c.readyForms.list(viewerOf(req))),
  });

  defineRoute<ReadyFormCreate>(router, deps, {
    ...op,
    method: 'post',
    path: '/ready-forms',
    status: 201,
    operationId: 'forms.ready.create',
    summary:
      'Create a ready form as draft version 1, empty (one section) or copied from another ready form, by the two global roles',
    permission: 'form.build',
    scope: 'global',
    audit: 'form.ready_create',
    body: readyFormCreateSchema,
    responses: { 201: readyFormView, 403: null, 404: null, 409: null, 422: null },
    handler: async ({ body, req }) => ok(await c.readyForms.create(viewerOf(req), body)),
  });

  defineRoute<unknown, unknown, { formId: string }>(router, deps, {
    ...op,
    method: 'get',
    path: '/ready-forms/:formId/published',
    operationId: 'forms.ready.published',
    summary: "A ready form's published version, read before it is placed",
    permission: 'form.place',
    scope: 'project',
    audit: 'none',
    params: formParams,
    responses: { 200: versionView, 403: null, 404: null },
    handler: async ({ params, req }) =>
      ok(await c.readyForms.published(viewerOf(req), params.formId)),
  });

  defineRoute<FormPlace, unknown, { projectId: string }>(router, deps, {
    ...op,
    method: 'post',
    path: '/projects/:projectId/forms/place',
    status: 201,
    operationId: 'forms.ready.place',
    summary:
      "Place a ready form's published version on a project: a published copy naming its source, which the PM does not change",
    permission: 'form.place',
    scope: 'project',
    audit: 'form.place',
    params: { projectId: uuid },
    body: formPlaceSchema,
    responses: { 201: formView, 403: null, 404: null, 409: null, 422: null },
    handler: async ({ params, body, req }) =>
      ok(await c.readyForms.place(viewerOf(req), params.projectId, body)),
  });

  defineRoute<unknown, unknown, { formId: string }>(router, deps, {
    ...op,
    method: 'post',
    path: '/forms/:formId/take-version',
    operationId: 'forms.ready.takeVersion',
    summary:
      "Take the ready form's newer published version as the placed form's next version; applications keep theirs",
    permission: 'form.place',
    scope: 'project',
    audit: 'form.take_version',
    params: formParams,
    responses: { 200: formView, 403: null, 404: null, 409: null, 422: null },
    handler: async ({ params, req }) => ok(await c.readyForms.take(viewerOf(req), params.formId)),
  });

  defineRoute<PublicLinkConfig, unknown, { projectId: string }>(router, deps, {
    ...op,
    method: 'patch',
    path: '/projects/:projectId/public-link',
    operationId: 'forms.publicLink.configure',
    summary: 'Enable or disable the public application link; every enable issues a fresh token',
    permission: 'form.public_link.manage',
    scope: 'project',
    audit: 'form.public_link_change',
    params: { projectId: uuid },
    body: publicLinkConfigSchema,
    responses: { 200: publicLinkView, 404: null, 409: null, 422: null },
    handler: async ({ params, body, req }) =>
      ok(await c.publicLink.configure(viewerOf(req), params.projectId, body)),
  });

  return router;
}
