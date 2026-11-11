import { uuidv7 } from '@css/shared';
import type { IncomingMessage } from 'node:http';

/** A forwarded request id is reused only when it looks like one (no log injection). */
const VALID = /^[A-Za-z0-9_-]{8,64}$/;

/**
 * Request id from Caddy's X-Request-Id, else a new `req_<uuidv7>`
 * (docs/architecture/SYSTEM_ARCHITECTURE.md, "Request lifecycle (exact order of checks)").
 */
export function requestIdOf(req: IncomingMessage): string {
  const header = req.headers['x-request-id'];
  const value = Array.isArray(header) ? header[0] : header;
  return value && VALID.test(value) ? value : `req_${uuidv7().replace(/-/g, '')}`;
}
