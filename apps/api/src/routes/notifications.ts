import {
  EDITABLE_CHANNELS,
  type MarkRead,
  markReadSchema,
  type PreferencesUpdate,
  preferencesUpdateSchema,
  type TemplateEdit,
  templateEditSchema,
} from '@css/shared';
import { isoDateSchema } from '@css/shared/settings';
import { Router } from 'express';
import { z } from 'zod';
import { principalOf } from '../auth/principal';
import type { Container } from '../container';
import { currentContext } from '../core/request-context';
import { pageQuery } from '../core/pagination';
import { ok, page } from '../http/send';
import { defineRoute, type RouteDeps } from '../openapi/define-route';
import { DELIVERY_CHANNELS, DELIVERY_STATUSES } from '../services/deliveries';

const inboxQuery = pageQuery
  .omit({ sort: true, include: true })
  .extend({ unread: z.enum(['true', 'false']).optional() });
const deliveryQuery = pageQuery.omit({ sort: true, include: true }).extend({
  status: z.enum(DELIVERY_STATUSES).optional(),
  channel: z.enum(DELIVERY_CHANNELS).optional(),
  from: isoDateSchema.optional(),
  to: isoDateSchema.optional(),
});
const templateKey = z.string().regex(/^[a-z_]{2,64}$/);
const templateChannel = z.enum(EDITABLE_CHANNELS);
const own = {
  tag: 'notifications',
  permission: 'notification.read_own',
  scope: 'self',
  audit: 'none',
  idempotency: 'none' as const,
  rateLimit: 'default' as const,
};
const admin = {
  tag: 'notifications',
  scope: 'global',
  idempotency: 'none' as const,
  rateLimit: 'default' as const,
};

/**
 * The inbox, the preferences, the templates and the delivery page (openapi tag notifications;
 * docs/architecture/NOTIFICATIONS.md). Every signed-in user reads and marks only their own entries;
 * templates and deliveries are for the global roles.
 */
export function notificationsRouter(
  deps: RouteDeps,
  c: Pick<Container, 'inbox' | 'notificationTemplates' | 'deliveries'>,
): Router {
  const router = Router();

  defineRoute<unknown, z.infer<typeof inboxQuery>>(router, deps, {
    ...own,
    method: 'get',
    path: '/notifications',
    operationId: 'notifications.inbox.list',
    summary: 'Own in-app notifications, newest first, with the unread count',
    query: inboxQuery,
    responses: { 200: null, 401: null, 422: null },
    handler: async ({ query, req }) => {
      const { rows, meta } = await c.inbox.list(
        principalOf(req),
        { ...query, unread: query.unread === 'true' },
        currentContext()?.locale ?? 'bn',
      );
      return page(rows, meta);
    },
  });

  defineRoute(router, deps, {
    ...own,
    method: 'get',
    path: '/notifications/unread-count',
    operationId: 'notifications.inbox.unreadCount',
    summary: 'The number of own unread notifications (the badge of the top bar)',
    responses: { 200: null, 401: null },
    handler: async ({ req }) => ok({ count: await c.inbox.unreadCount(principalOf(req)) }),
  });

  defineRoute<MarkRead>(router, deps, {
    ...own,
    method: 'post',
    path: '/notifications/read',
    status: 204,
    operationId: 'notifications.inbox.markRead',
    summary: 'Mark own notifications as read, some or all; another user’s entry is not found',
    body: markReadSchema,
    responses: { 204: null, 401: null, 404: null, 422: null },
    handler: ({ body, req }) => c.inbox.markRead(principalOf(req), body),
  });

  defineRoute(router, deps, {
    ...own,
    method: 'get',
    path: '/me/preferences',
    operationId: 'notifications.preferences.get',
    summary: 'Own preferences: the email mode and digest time of an official; none for a volunteer',
    responses: { 200: null, 401: null },
    handler: async ({ req }) => ok(await c.inbox.preferences(principalOf(req))),
  });

  defineRoute<PreferencesUpdate>(router, deps, {
    ...own,
    method: 'patch',
    path: '/me/preferences',
    operationId: 'notifications.preferences.update',
    summary: 'Update own preferences; a volunteer has no email setting',
    body: preferencesUpdateSchema,
    responses: { 200: null, 401: null, 422: null },
    handler: async ({ body, req }) => ok(await c.inbox.setPreferences(principalOf(req), body)),
  });

  defineRoute(router, deps, {
    ...admin,
    method: 'get',
    path: '/admin/notification-templates',
    operationId: 'notifications.template.list',
    summary: 'The editable templates: active text per channel in bn and en, and the variables',
    permission: 'notification.template.manage',
    audit: 'none',
    responses: { 200: null, 401: null, 403: null },
    handler: async () => {
      const rows = await c.notificationTemplates.list();
      return ok(rows, { limit: rows.length, nextCursor: null, prevCursor: null });
    },
  });

  defineRoute<TemplateEdit, unknown, { key: string; channel: string }>(router, deps, {
    ...admin,
    method: 'post',
    path: '/admin/notification-templates/:key/:channel/preview',
    operationId: 'notifications.template.preview',
    summary: 'Render a draft of one channel in bn and en with sample values, without saving',
    permission: 'notification.template.manage',
    audit: 'none',
    params: { key: templateKey, channel: templateChannel },
    body: templateEditSchema,
    responses: { 200: null, 401: null, 403: null, 404: null, 422: null },
    handler: ({ body, params }) =>
      ok(c.notificationTemplates.preview(params.key, params.channel, body)),
  });

  defineRoute<TemplateEdit, unknown, { key: string; channel: string }>(router, deps, {
    ...admin,
    method: 'put',
    path: '/admin/notification-templates/:key/:channel',
    operationId: 'notifications.template.update',
    summary: 'Save a new version of one channel in bn and en (audited); old messages keep theirs',
    permission: 'notification.template.manage',
    audit: 'notification.template.change',
    params: { key: templateKey, channel: templateChannel },
    body: templateEditSchema,
    responses: { 200: null, 401: null, 403: null, 404: null, 422: null },
    handler: async ({ body, params, req }) =>
      ok(await c.notificationTemplates.edit(principalOf(req), params.key, params.channel, body)),
  });

  defineRoute<unknown, z.infer<typeof deliveryQuery>>(router, deps, {
    ...admin,
    method: 'get',
    path: '/admin/deliveries',
    operationId: 'notifications.delivery.list',
    summary:
      'Queued emails and SMS newest first with status, attempts and the last error; addresses partly hidden',
    permission: 'notification.delivery.view',
    audit: 'none',
    query: deliveryQuery,
    responses: { 200: null, 401: null, 403: null, 422: null },
    handler: async ({ query, req }) => {
      const { rows, meta } = await c.deliveries.list(principalOf(req), query);
      return page(rows, meta);
    },
  });

  return router;
}
