import { AsyncLocalStorage } from 'node:async_hooks';
import type { Locale } from '@css/shared/i18n';

/**
 * Per-request facts shared by the logger, the audit writer and the error filter
 * (docs/architecture/SYSTEM_ARCHITECTURE.md, "Request lifecycle (exact order of checks)", step 2).
 * Jobs and sync processing run with their own context.
 */
export interface RequestContext {
  requestId: string;
  locale: Locale;
  ip?: string;
  /** Set by the auth guard. */
  userId?: string;
  deviceSessionId?: string;
  actorRole?: string;
  /** Audit entries written during this request, for the check that an audited route wrote one. */
  auditCount: number;
}

const storage = new AsyncLocalStorage<RequestContext>();

export function runWithContext<T>(context: RequestContext, fn: () => T): T {
  return storage.run(context, fn);
}

/** The current request's context, or undefined outside a request (jobs set their own). */
export function currentContext(): RequestContext | undefined {
  return storage.getStore();
}
