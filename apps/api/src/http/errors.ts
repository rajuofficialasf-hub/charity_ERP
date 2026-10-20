import { type MessageKey, type MessageParams, translate } from '@css/shared/i18n';
import type { ErrorRequestHandler, Request, RequestHandler, Response } from 'express';
import type { Logger } from 'pino';
import { currentContext } from '../core/request-context';
import { ApiError, type ApiErrorDetail } from '../i18n/api-error';
import { requestLocale } from '../i18n/request-locale';

/** Errors that `express.json()` raises carry a body-parser `type` (NE-REQ-02). */
const BODY_PARSER_ERRORS: Record<string, { status: number; code: string }> = {
  'entity.too.large': { status: 413, code: 'validation.malformed' },
  'entity.parse.failed': { status: 400, code: 'validation.malformed' },
  'encoding.unsupported': { status: 415, code: 'validation.malformed' },
  'charset.unsupported': { status: 415, code: 'validation.malformed' },
  'entity.verify.failed': { status: 400, code: 'validation.malformed' },
};

/** Other 4xx errors Express raises itself (an undecodable path, an aborted body): not internal. */
function clientError(err: unknown): { status: number; code: string } | undefined {
  if (typeof err !== 'object' || err === null) return undefined;
  const status =
    (err as { status?: unknown; statusCode?: unknown }).status ??
    (err as { statusCode?: unknown }).statusCode;
  if (typeof status !== 'number' || !Number.isInteger(status) || status < 400 || status >= 500)
    return undefined;
  return { status, code: 'validation.malformed' };
}

function bodyParserError(err: unknown): { status: number; code: string } | undefined {
  if (typeof err !== 'object' || err === null || !('type' in err)) return undefined;
  const type = (err as { type: unknown }).type;
  return typeof type === 'string' ? BODY_PARSER_ERRORS[type] : undefined;
}

/** Codes whose params are part of the contract and sent to the client (API_STANDARDS 3 and 8). */
const PUBLIC_PARAMS = new Set(['permission.grant_refused', 'file.duplicate']);

/**
 * Renders the error block of API_STANDARDS 3 in the request language (I18N 5):
 * `{ error: { code, messageKey, message, params?, details?, requestId } }`, with `Retry-After` for locks
 * and rate limits. Unknown failures become `server.internal`; stack traces and SQL stay in the
 * server log (BR-210, NE-SEC-11).
 */
export function sendApiError(
  req: Request,
  res: Response,
  status: number,
  code: string,
  options: { params?: MessageParams; details?: ApiErrorDetail[]; retryAfter?: number } = {},
): void {
  const locale = requestLocale(req);
  const requestId =
    currentContext()?.requestId ?? (res.getHeader('X-Request-Id') as string | undefined);
  if (options.retryAfter !== undefined)
    res.setHeader('Retry-After', String(Math.ceil(options.retryAfter)));
  const render = (c: string, p?: MessageParams) =>
    translate(locale, `errors.${c}` as MessageKey, p);
  res
    .status(status)
    .setHeader('Content-Language', locale)
    .json({
      error: {
        code,
        messageKey: `errors.${code}`,
        message: render(code, options.params),
        ...(options.params && PUBLIC_PARAMS.has(code) ? { params: options.params } : {}),
        ...(options.details?.length
          ? {
              details: options.details.map((d) => ({
                path: d.path,
                code: d.code,
                messageKey: `errors.${d.code}`,
                message: render(d.code, d.params),
              })),
            }
          : {}),
        requestId,
      },
    });
}

/** Unknown routes: `permission.not_found`, the same as a record outside the caller's scope. */
export const notFound: RequestHandler = (req, res) => {
  sendApiError(req, res, 404, 'permission.not_found');
};

/** The one error middleware (NE-ERR-01). */
export function errorHandler(logger: Logger): ErrorRequestHandler {
  return (err: unknown, req, res, next) => {
    if (res.headersSent) {
      next(err);
      return;
    }
    if (err instanceof ApiError) {
      sendApiError(req, res, err.status, err.code, {
        params: err.params,
        details: err.details,
        retryAfter: err.retryAfterSeconds,
      });
      return;
    }
    const known = bodyParserError(err) ?? clientError(err);
    if (known) {
      sendApiError(req, res, known.status, known.code);
      return;
    }
    logger.error({ err: err instanceof Error ? err : new Error(String(err)) }, 'unhandled error');
    sendApiError(req, res, 500, 'server.internal');
  };
}
