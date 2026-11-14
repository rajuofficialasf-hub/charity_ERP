import {
  isoDateSchema,
  type NisabAdd,
  nisabAddSchema,
  type NisabWithdraw,
  nisabWithdrawSchema,
  type ReferenceItemCreate,
  referenceItemCreateSchema,
  type ReferenceItemUpdate,
  referenceItemUpdateSchema,
  settingUpdateSchema,
} from '@css/shared/settings';
import {
  type NameVariantGroupCreate,
  nameVariantGroupCreateSchema,
  type NameVariantGroupUpdate,
  nameVariantGroupUpdateSchema,
} from '@css/shared/beneficiaries';
import { Router } from 'express';
import { z } from 'zod';
import { principalOf } from '../auth/principal.js';
import type { Container } from '../container.js';
import { ok } from '../http/send.js';
import { defineRoute, type RouteDeps } from '../openapi/define-route.js';

const uuid = z.uuid();
const listKey = z.string().regex(/^[a-z_]{2,64}$/);
const itemCode = z.string().regex(/^[a-z0-9_]{1,64}$/);
const settingKey = z.string().regex(/^[a-z0-9_.]{2,100}$/);
const inForceQuery = z.strictObject({ date: isoDateSchema.optional() });
const op = { tag: 'reference', idempotency: 'none' as const, rateLimit: 'default' as const };

/**
 * Settings, the reference lists of the settings page and the nisab (openapi tag reference;
 * docs/DECISION_LOG.md, the admin and settings decision of 2026-10-17). The settings page and the
 * lists, the spelling variants of names among them, need `settings.manage` at global scope; the nisab is added and withdrawn by `nisab.set`
 * (PM or above) and read by every signed-in user; the public settings carry no personal data.
 */
export function settingsRouter(
  deps: RouteDeps,
  c: Pick<Container, 'settings' | 'referenceLists' | 'nameVariants' | 'nisab'>,
): Router {
  const router = Router();

  defineRoute(router, deps, {
    ...op,
    method: 'get',
    path: '/public/settings',
    operationId: 'reference.setting.public',
    summary: 'The default language and the organisation details, for every visitor',
    permission: 'public',
    scope: 'system',
    audit: 'none',
    rateLimit: 'reference-read',
    responses: { 200: null, 429: null },
    handler: async () => ok(await c.settings.publicView()),
  });

  defineRoute(router, deps, {
    ...op,
    method: 'get',
    path: '/settings',
    operationId: 'reference.setting.list',
    summary: 'The settings page: organisation, language defaults and alert thresholds',
    permission: 'settings.manage',
    scope: 'global',
    audit: 'none',
    responses: { 200: null, 401: null, 403: null },
    handler: async () => {
      const rows = await c.settings.list();
      return ok(rows, { limit: rows.length, nextCursor: null, prevCursor: null });
    },
  });

  defineRoute<z.infer<typeof settingUpdateSchema>, unknown, { settingKey: string }>(router, deps, {
    ...op,
    method: 'patch',
    path: '/settings/:settingKey',
    operationId: 'reference.setting.update',
    summary: 'Change a setting (validated per key; audited)',
    permission: 'settings.manage',
    scope: 'global',
    audit: 'settings.change',
    params: { settingKey },
    body: settingUpdateSchema,
    responses: { 200: null, 401: null, 403: null, 404: null, 422: null },
    handler: async ({ body, params, req }) =>
      ok(await c.settings.update(principalOf(req), params.settingKey, body.value)),
  });

  defineRoute<unknown, unknown, { listKey: string }>(router, deps, {
    ...op,
    method: 'get',
    path: '/reference-lists/:listKey',
    operationId: 'reference.list.get',
    summary: 'Items of a system-wide reference list, inactive ones marked; not paginated',
    permission: 'authenticated',
    scope: 'system',
    audit: 'none',
    params: { listKey },
    responses: { 200: null, 401: null, 404: null },
    handler: async ({ params }) => {
      const items = await c.referenceLists.items(params.listKey);
      return ok(items, { limit: items.length, nextCursor: null, prevCursor: null });
    },
  });

  defineRoute<ReferenceItemCreate, unknown, { listKey: string }>(router, deps, {
    ...op,
    method: 'post',
    path: '/reference-lists/:listKey',
    status: 201,
    operationId: 'reference.list.addItem',
    summary:
      'Add an item to an editable list: expense categories, issue types, media stages, production roles or publication platforms',
    permission: 'settings.manage',
    scope: 'global',
    audit: 'settings.change',
    params: { listKey },
    body: referenceItemCreateSchema,
    responses: { 201: null, 401: null, 403: null, 404: null, 409: null, 422: null },
    handler: async ({ body, params, req }) =>
      ok(await c.referenceLists.add(principalOf(req), params.listKey, body)),
  });

  defineRoute<ReferenceItemUpdate, unknown, { listKey: string; code: string }>(router, deps, {
    ...op,
    method: 'patch',
    path: '/reference-lists/:listKey/items/:code',
    operationId: 'reference.list.updateItem',
    summary: 'Relabel, reorder, deactivate or activate an item; its code never changes',
    permission: 'settings.manage',
    scope: 'global',
    audit: 'settings.change',
    params: { listKey, code: itemCode },
    body: referenceItemUpdateSchema,
    responses: { 200: null, 401: null, 403: null, 404: null, 409: null, 422: null },
    handler: async ({ body, params, req }) =>
      ok(await c.referenceLists.update(principalOf(req), params.listKey, params.code, body)),
  });

  defineRoute(router, deps, {
    ...op,
    method: 'get',
    path: '/name-variants',
    operationId: 'reference.nameVariants.list',
    summary: 'The groups of spelling variants of names, switched off ones included; not paginated',
    permission: 'settings.manage',
    scope: 'global',
    audit: 'none',
    responses: { 200: null, 401: null, 403: null },
    handler: async () => {
      const groups = await c.nameVariants.list();
      return ok(groups, { limit: groups.length, nextCursor: null, prevCursor: null });
    },
  });

  defineRoute<NameVariantGroupCreate>(router, deps, {
    ...op,
    method: 'post',
    path: '/name-variants',
    status: 201,
    operationId: 'reference.nameVariants.add',
    summary: 'Add a group of spellings of one name; the name keys are computed again',
    permission: 'settings.manage',
    scope: 'global',
    audit: 'name_variants.change',
    body: nameVariantGroupCreateSchema,
    responses: { 201: null, 401: null, 403: null, 422: null },
    handler: async ({ body, req }) => ok(await c.nameVariants.add(principalOf(req), body)),
  });

  defineRoute<NameVariantGroupUpdate, unknown, { groupId: string }>(router, deps, {
    ...op,
    method: 'patch',
    path: '/name-variants/:groupId',
    operationId: 'reference.nameVariants.update',
    summary: "Change a group's spellings, or switch it off or on; nothing is deleted",
    permission: 'settings.manage',
    scope: 'global',
    audit: 'name_variants.change',
    params: { groupId: uuid },
    headers: [{ name: 'If-Match', required: true }],
    body: nameVariantGroupUpdateSchema,
    responses: { 200: null, 401: null, 403: null, 404: null, 412: null, 422: null },
    handler: async ({ body, params, req }) =>
      ok(await c.nameVariants.update(principalOf(req), params.groupId, body, req.get('if-match'))),
  });

  defineRoute(router, deps, {
    ...op,
    method: 'get',
    path: '/nisab-versions',
    operationId: 'reference.nisab.list',
    summary: 'Nisab versions, newest first, the one in force today marked; not paginated',
    permission: 'authenticated',
    scope: 'system',
    audit: 'none',
    responses: { 200: null, 401: null },
    handler: async () => {
      const rows = await c.nisab.list();
      return ok(rows, { limit: rows.length, nextCursor: null, prevCursor: null });
    },
  });

  defineRoute<unknown, z.infer<typeof inForceQuery>>(router, deps, {
    ...op,
    method: 'get',
    path: '/nisab-versions/in-force',
    operationId: 'reference.nisab.inForce',
    summary: 'The nisab version in force on a date (today when omitted)',
    permission: 'authenticated',
    scope: 'system',
    audit: 'none',
    query: inForceQuery,
    responses: { 200: null, 401: null, 404: null, 422: null },
    handler: async ({ query }) => ok(await c.nisab.inForceOn(query.date ?? c.nisab.todayDate())),
  });

  defineRoute<NisabAdd>(router, deps, {
    ...op,
    method: 'post',
    path: '/nisab-versions',
    status: 201,
    operationId: 'reference.nisab.add',
    summary: 'Add a nisab version (PM or above); never edits old versions',
    permission: 'nisab.set',
    scope: 'global',
    audit: 'nisab.change',
    body: nisabAddSchema,
    responses: { 201: null, 401: null, 403: null, 422: null },
    handler: async ({ body, req }) => ok(await c.nisab.add(principalOf(req), body)),
  });

  defineRoute<NisabWithdraw, unknown, { nisabVersionId: string }>(router, deps, {
    ...op,
    method: 'post',
    path: '/nisab-versions/:nisabVersionId/withdraw',
    operationId: 'reference.nisab.withdraw',
    summary: 'Withdraw a nisab version that has not taken effect, with a reason',
    permission: 'nisab.set',
    scope: 'global',
    audit: 'nisab.change',
    params: { nisabVersionId: uuid },
    body: nisabWithdrawSchema,
    responses: { 200: null, 401: null, 403: null, 404: null, 409: null, 422: null },
    handler: async ({ body, params, req }) =>
      ok(await c.nisab.withdraw(principalOf(req), params.nisabVersionId, body.reason)),
  });

  return router;
}
