import type { MessageParams } from '@css/shared/i18n';

/**
 * An API error with a catalogue code (API_STANDARDS 8). The message is rendered from
 * `errors.<code>` in the request language by ApiExceptionFilter; services never build sentences.
 */
export class ApiError extends Error {
  constructor(
    readonly code: string,
    readonly status: number,
    readonly params?: MessageParams,
  ) {
    super(code);
    this.name = 'ApiError';
  }

  get messageKey(): string {
    return `errors.${this.code}`;
  }
}
