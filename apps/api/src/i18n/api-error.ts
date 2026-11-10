import type { MessageParams } from '@css/shared/i18n';

/**
 * One field-level problem (docs/api/API_STANDARDS.md, "Request and response envelope"): path in
 * camelCase, catalogue code, parameters.
 */
export interface ApiErrorDetail {
  path: string;
  code: string;
  params?: MessageParams;
}

/**
 * An API error with a catalogue code (docs/api/API_STANDARDS.md, "Error-code catalogue"). The
 * message is rendered from
 * `errors.<code>` in the request language by ApiExceptionFilter; services never build sentences.
 */
export class ApiError extends Error {
  constructor(
    readonly code: string,
    readonly status: number,
    readonly params?: MessageParams,
    readonly details?: ApiErrorDetail[],
    /** Sent as `Retry-After` (lockout 423, rate limits 429). */
    readonly retryAfterSeconds?: number,
  ) {
    super(code);
    this.name = 'ApiError';
  }

  get messageKey(): string {
    return `errors.${this.code}`;
  }
}
