import { Injectable, type NestMiddleware } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';
import { requestLocale } from '../i18n/request-locale';
import { runWithContext } from './request-context';
import { requestIdOf } from './request-id';

/**
 * Opens the request context (request id, locale, IP) for everything that runs after it: guards,
 * pipes, handlers, the audit writer and the error filter. pino-http has already set `req.id`.
 */
@Injectable()
export class RequestContextMiddleware implements NestMiddleware {
  use(req: Request & { id?: unknown }, res: Response, next: NextFunction): void {
    const requestId = typeof req.id === 'string' ? req.id : requestIdOf(req);
    if (!res.getHeader('X-Request-Id')) res.setHeader('X-Request-Id', requestId);
    runWithContext({ requestId, locale: requestLocale(req), ip: req.ip, auditCount: 0 }, next);
  }
}
