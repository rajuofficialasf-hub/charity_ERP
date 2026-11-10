import type { Response } from 'express';
import { currentContext } from '../core/request-context.js';

/**
 * Pagination fields of `meta` for lists (docs/api/API_STANDARDS.md, "Pagination: keyset cursors").
 */
export interface PageMeta {
  nextCursor: string | null;
  prevCursor: string | null;
  limit: number;
  total?: number | '10000+';
}

const ENVELOPE = Symbol('envelope');

interface Enveloped {
  [ENVELOPE]: true;
  data: unknown;
  meta: Record<string, unknown>;
}

/**
 * A single result: `{ data, meta: { requestId } }` (docs/api/API_STANDARDS.md, "Request and
 * response envelope").
 */
export function ok<T>(data: T, meta: Record<string, unknown> = {}): Enveloped {
  return { [ENVELOPE]: true, data, meta };
}

/** A list page: `{ data: rows, meta: { requestId, nextCursor, prevCursor, limit, total? } }`. */
export function page<T>(rows: T[], meta: PageMeta): Enveloped {
  return ok(rows, { ...meta });
}

/** Applies `fn` to the data of a handler result, keeping the envelope meta of `ok()`/`page()`. */
export function mapData(value: unknown, fn: (data: unknown) => unknown): unknown {
  return isEnveloped(value) ? ok(fn(value.data), value.meta) : fn(value);
}

function isEnveloped(value: unknown): value is Enveloped {
  return typeof value === 'object' && value !== null && ENVELOPE in value;
}

/**
 * Sends a handler result in the envelope with the request id
 * (docs/architecture/SYSTEM_ARCHITECTURE.md, "Request lifecycle (exact order of checks)", step 13):
 * `ok()`/`page()` keep their meta, any other value becomes `data`, and a route declared with
 * status 204 sends no body.
 */
export function send(res: Response, value: unknown, status = 200): void {
  if (res.headersSent) return;
  if (status === 204) {
    res.status(204).end();
    return;
  }
  const requestId = currentContext()?.requestId;
  if (isEnveloped(value)) {
    res.status(status).json({ data: value.data, meta: { requestId, ...value.meta } });
    return;
  }
  res.status(status).json({ data: value ?? null, meta: { requestId } });
}
