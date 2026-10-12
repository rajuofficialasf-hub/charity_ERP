import type { Request, RequestHandler } from 'express';
import { requestLocale } from '../i18n/request-locale';
import { runWithContext } from './request-context';
import { requestIdOf } from './request-id';

/**
 * Opens the request context (request id, locale, IP) for everything that runs after it: access,
 * limiters, validation, handlers, the audit writer and the error handler. pino-http has already
 * set `req.id`.
 */
export function requestContext(): RequestHandler {
  return (req: Request & { id?: unknown }, res, next) => {
    const requestId = typeof req.id === 'string' ? req.id : requestIdOf(req);
    if (!res.getHeader('X-Request-Id')) res.setHeader('X-Request-Id', requestId);
    runWithContext({ requestId, locale: requestLocale(req), ip: req.ip, auditCount: 0 }, next);
  };
}
