import type { RequestHandler } from 'express';
import { ApiError } from '../i18n/api-error.js';

/**
 * The version gate of the offline routes (docs/api/API_STANDARDS.md, "Breaking changes"): a
 * phone may run an old build for days, so the server keeps accepting it until
 * the minimum supported version is raised; a request from a build below that minimum is answered
 * 426 so the app syncs what it can and updates. A missing or unreadable version passes: the gate
 * refuses only what it knows to be too old.
 */

const VERSION = /^v?(\d+)\.(\d+)\.(\d+)/;

export function parseVersion(value: string | undefined): [number, number, number] | null {
  const m = value?.trim().match(VERSION);
  return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null;
}

export function belowMinimum(version: string | undefined, minimum: string): boolean {
  const given = parseVersion(version);
  const least = parseVersion(minimum);
  if (!given || !least) return false;
  for (let i = 0; i < 3; i += 1) {
    if (given[i]! < least[i]!) return true;
    if (given[i]! > least[i]!) return false;
  }
  return false;
}

export function clientVersionGate(minimum: string): RequestHandler {
  return (req, _res, next) => {
    if (belowMinimum(req.get('x-client-version'), minimum))
      next(new ApiError('client.upgrade_required', 426));
    else next();
  };
}
