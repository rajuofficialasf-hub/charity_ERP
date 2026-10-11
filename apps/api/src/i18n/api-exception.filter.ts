import {
  type ArgumentsHost,
  Catch,
  type ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { type MessageKey, translate } from '@css/shared/i18n';
import type { Request, Response } from 'express';
import { ApiError } from './api-error';
import { requestLocale } from './request-locale';

/** Catalogue codes for Nest's own HTTP exceptions (API_STANDARDS 8). */
const CODE_BY_STATUS: Partial<Record<number, string>> = {
  [HttpStatus.BAD_REQUEST]: 'validation.malformed',
  [HttpStatus.UNAUTHORIZED]: 'auth.token_missing',
  [HttpStatus.FORBIDDEN]: 'permission.denied',
  [HttpStatus.NOT_FOUND]: 'permission.not_found',
  [HttpStatus.METHOD_NOT_ALLOWED]: 'permission.not_found',
  [HttpStatus.PAYLOAD_TOO_LARGE]: 'validation.malformed',
  [HttpStatus.UNSUPPORTED_MEDIA_TYPE]: 'validation.malformed',
  [HttpStatus.TOO_MANY_REQUESTS]: 'rate_limit.exceeded',
  [HttpStatus.SERVICE_UNAVAILABLE]: 'server.unavailable',
};

/**
 * Renders every error as the error block of API_STANDARDS 3 with the message in the request
 * language (I18N 5): `{ error: { code, messageKey, message } }`. Unknown failures become
 * `server.internal` without stack traces or SQL (BR-210). T1.6 adds requestId and details.
 */
@Catch()
export class ApiExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger('ApiExceptionFilter');

  catch(exception: unknown, host: ArgumentsHost): void {
    const http = host.switchToHttp();
    const req = http.getRequest<Request>();
    const res = http.getResponse<Response>();
    const locale = requestLocale(req);

    let status: number;
    let code: string;
    let params: ApiError['params'];
    if (exception instanceof ApiError) {
      ({ status, code, params } = exception);
    } else if (exception instanceof HttpException) {
      status = exception.getStatus();
      // eslint-disable-next-line security/detect-object-injection -- numeric HTTP status into a constant table
      code = CODE_BY_STATUS[status] ?? (status < 500 ? 'validation.malformed' : 'server.internal');
    } else {
      status = HttpStatus.INTERNAL_SERVER_ERROR;
      code = 'server.internal';
      this.logger.error(exception instanceof Error ? exception.message : 'non-error exception');
    }
    const messageKey = `errors.${code}`;
    res
      .status(status)
      .setHeader('Content-Language', locale)
      .json({
        error: { code, messageKey, message: translate(locale, messageKey as MessageKey, params) },
      });
  }
}
