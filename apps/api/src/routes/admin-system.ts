import {
  type OfficeAddressesSetting,
  officeAddressesSchema,
  type SmsProviderSetting,
  smsProviderSettingSchema,
} from '@css/shared/settings';
import { Router } from 'express';
import { principalOf } from '../auth/principal.js';
import type { Container } from '../container.js';
import { ok } from '../http/send.js';
import { defineRoute, type RouteDeps } from '../openapi/define-route.js';

const op = {
  tag: 'admin',
  scope: 'global',
  idempotency: 'none' as const,
  rateLimit: 'default' as const,
};

/**
 * The notification channels and the system health (openapi tag admin; docs/DECISION_LOG.md, the
 * admin and settings decision of 2026-10-17). No answer carries a password or a provider key.
 */
export function adminSystemRouter(
  deps: RouteDeps,
  c: Pick<Container, 'channels' | 'systemHealth' | 'officeAddressSettings'>,
): Router {
  const router = Router();

  defineRoute(router, deps, {
    ...op,
    method: 'get',
    path: '/admin/channels',
    operationId: 'admin.channels.get',
    summary: 'SMTP read-only, the SMS adapter configuration and the dummy OTP state',
    permission: 'provider.settings.manage',
    audit: 'none',
    responses: { 200: null, 401: null, 403: null },
    handler: async () => ok(await c.channels.view()),
  });

  defineRoute<SmsProviderSetting>(router, deps, {
    ...op,
    method: 'put',
    path: '/admin/channels/sms',
    operationId: 'admin.channels.setSms',
    summary: 'Replace the SMS adapter configuration (the key stays in the environment)',
    permission: 'provider.settings.manage',
    audit: 'settings.change',
    body: smsProviderSettingSchema,
    responses: { 200: null, 401: null, 403: null, 422: null },
    handler: async ({ body, req }) => ok(await c.channels.setSms(principalOf(req), body)),
  });

  defineRoute(router, deps, {
    ...op,
    method: 'get',
    path: '/admin/office-addresses',
    operationId: 'admin.officeAddresses.get',
    summary:
      'The office addresses the per-address rate limits exempt, and the caller’s own address',
    permission: 'security.office_ips.manage',
    audit: 'none',
    responses: { 200: null, 401: null, 403: null },
    handler: async ({ req }) => ok(await c.officeAddressSettings.view(req.ip)),
  });

  defineRoute<OfficeAddressesSetting>(router, deps, {
    ...op,
    method: 'put',
    path: '/admin/office-addresses',
    operationId: 'admin.officeAddresses.set',
    summary: 'Replace the office addresses; the rate limiter reads them at once',
    permission: 'security.office_ips.manage',
    audit: 'settings.change',
    body: officeAddressesSchema,
    responses: { 200: null, 401: null, 403: null, 422: null },
    handler: async ({ body, req }) =>
      ok(await c.officeAddressSettings.set(principalOf(req), body, req.ip)),
  });

  defineRoute(router, deps, {
    ...op,
    method: 'get',
    path: '/admin/health',
    operationId: 'admin.health.get',
    summary: 'Database, storage and queue, version, dummy OTP, audit partitions and storage growth',
    permission: 'system.health.view',
    audit: 'none',
    responses: { 200: null, 401: null, 403: null },
    handler: async () => ok(await c.systemHealth.view()),
  });

  return router;
}
