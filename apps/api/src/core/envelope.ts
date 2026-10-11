import {
  type CallHandler,
  type ExecutionContext,
  Inject,
  Injectable,
  type NestInterceptor,
  SetMetadata,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { map, type Observable } from 'rxjs';
import { currentContext } from './request-context';

/** Pagination fields of `meta` for lists (API_STANDARDS 4). */
export interface PageMeta {
  nextCursor: string | null;
  prevCursor: string | null;
  limit: number;
  total?: number | '10000+';
}

const ENVELOPE = Symbol('envelope');

/** A single result: `{ data, meta: { requestId } }` (API_STANDARDS 3). */
export function ok<T>(data: T, meta: Record<string, unknown> = {}) {
  return { [ENVELOPE]: true, data, meta };
}

/** A list page: `{ data: rows, meta: { requestId, nextCursor, prevCursor, limit, total? } }`. */
export function page<T>(rows: T[], meta: PageMeta) {
  return ok(rows, { ...meta });
}

/** Marks a controller or handler whose responses are not wrapped (health probes). */
export const RAW_RESPONSE = 'css:raw-response';
export const RawResponse = () => SetMetadata(RAW_RESPONSE, true);

/** Wraps every result in the envelope and adds the request id (SYSTEM_ARCHITECTURE 6 step 13). */
@Injectable()
export class EnvelopeInterceptor implements NestInterceptor {
  constructor(@Inject(Reflector) private readonly reflector: Reflector) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const raw = this.reflector.getAllAndOverride<boolean>(RAW_RESPONSE, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (raw) return next.handle();
    return next.handle().pipe(
      map((value: unknown) => {
        const requestId = currentContext()?.requestId;
        if (value && typeof value === 'object' && ENVELOPE in value) {
          const { data, meta } = value as unknown as {
            data: unknown;
            meta: Record<string, unknown>;
          };
          return { data, meta: { requestId, ...meta } };
        }
        return { data: value ?? null, meta: { requestId } };
      }),
    );
  }
}
