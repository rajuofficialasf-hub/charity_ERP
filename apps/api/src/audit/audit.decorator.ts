import {
  type CallHandler,
  type ExecutionContext,
  Inject,
  Injectable,
  Logger,
  type NestInterceptor,
  SetMetadata,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { type Observable, tap } from 'rxjs';
import { currentContext } from '../core/request-context';
import { ApiError } from '../i18n/api-error';

export const AUDIT_ACTION = 'css:audit-action';

/**
 * Declares the audit action of a handler, the same value as its OpenAPI `x-audit`. Every write
 * route (POST, PUT, PATCH, DELETE) must carry it; `'none'` only for writes that change no business
 * data (D-068, API_STANDARDS 15).
 */
export const Audit = (action: string) => SetMetadata(AUDIT_ACTION, action);

const WRITE_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

/**
 * Enforces the audit trail (BR-179, D-068): a write route without `@Audit` fails, and a handler
 * declaring an action that finished without an `AuditWriter.record` call fails with
 * `server.internal`, so no write path can skip the audit.
 */
@Injectable()
export class AuditEnforcementInterceptor implements NestInterceptor {
  private readonly logger = new Logger('AuditEnforcement');

  constructor(@Inject(Reflector) private readonly reflector: Reflector) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const action = this.reflector.get<string | undefined>(AUDIT_ACTION, context.getHandler());
    const req = context.switchToHttp().getRequest<Request>();
    const where = `${context.getClass().name}.${context.getHandler().name}`;
    if (action === undefined && WRITE_METHODS.has(req.method)) {
      this.logger.error(`write route without @Audit: ${where}`);
      throw new ApiError('server.internal', 500);
    }
    if (!action || action === 'none') return next.handle();
    return next.handle().pipe(
      tap(() => {
        if ((currentContext()?.auditCount ?? 0) === 0) {
          this.logger.error(`handler declared audit "${action}" but wrote no entry: ${where}`);
          throw new ApiError('server.internal', 500);
        }
      }),
    );
  }
}
