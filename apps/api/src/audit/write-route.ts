import type { Logger } from 'pino';
import { currentContext } from '../core/request-context.js';
import { ApiError } from '../i18n/api-error.js';

export const WRITE_METHODS = new Set(['post', 'put', 'patch', 'delete']);

/**
 * Audit enforcement for write routes: a route that declared an audit action and
 * finished without an `AuditWriter.record` call fails with `server.internal`, so no write path
 * can skip the audit. Routes without an action cannot be registered at all (define-route.ts).
 */
export function assertAudited(action: string, where: string, logger: Logger): void {
  if (action === 'none') return;
  if ((currentContext()?.auditCount ?? 0) === 0) {
    logger.error(
      { route: where, action },
      'write route declared an audit action but wrote no entry',
    );
    throw new ApiError('server.internal', 500);
  }
}
