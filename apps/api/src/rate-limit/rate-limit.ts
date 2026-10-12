import type { Request } from 'express';
import { ipKeyGenerator } from 'express-rate-limit';
import { normalizeLoginId } from '../auth/login-id';
import { currentContext } from '../core/request-context';

/** The rate-limit classes of API_STANDARDS 10, the same values as OpenAPI `x-rate-limit`. */
export type RateLimitClass =
  | 'login'
  | 'otp-request'
  | 'otp-verify'
  | 'password-reset'
  | 'refresh'
  | 'public-form'
  | 'reference-read'
  | 'default'
  | 'sync';

interface Window {
  limit: number;
  ttlMs: number;
  /** The key this window counts by. */
  key: (req: Request) => string;
  /** Counts by the client address (runs before the per-id windows, NE-SEC-04). */
  byIp?: boolean;
}

/** Body fields used as keys are capped, so a flood of long made-up ids cannot grow the stores. */
const KEY_MAX_LENGTH = 128;

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;

const field = (req: Request, ...names: string[]) => {
  const body = (req.body ?? {}) as Record<string, unknown>;
  for (const name of names) {
    // eslint-disable-next-line security/detect-object-injection -- names are fixed field names of this file
    const value = Object.hasOwn(body, name) ? body[name] : undefined;
    if (typeof value === 'string') return value.trim().toLowerCase().slice(0, KEY_MAX_LENGTH);
  }
  return 'none';
};
/** The client address through `trust proxy`, IPv6 grouped by /56 so a /64 is one client. */
const ip = (req: Request) => (req.ip ? ipKeyGenerator(req.ip) : 'unknown');
/**
 * A login id is counted in its normalized form (AUTH.md 1: spaces, dashes and the country prefix
 * removed, English digits), so spellings of one id share one window.
 */
const loginId = (req: Request) => {
  const raw = field(req, 'loginId', 'login', 'mobile', 'email');
  if (raw === 'none') return raw;
  const id = normalizeLoginId(raw);
  return `${id.kind}:${id.value}`;
};
const address = (req: Request) => field(req, 'address', 'mobile', 'email');
const session = (req: Request) => currentContext()?.deviceSessionId ?? `ip:${ip(req)}`;
/** The refresh token starts with its session id (D-070), so refreshes count per session. */
const refreshSession = (req: Request) => {
  const match = /(?:^|;\s*)css_refresh=([0-9a-f-]{36})\./.exec(req.headers.cookie ?? '');
  return match?.[1] ? `sid:${match[1]}` : `ip:${ip(req)}`;
};
const caller = (req: Request) => currentContext()?.userId ?? `ip:${ip(req)}`;

/** Limits and keys per class (API_STANDARDS 10, O-08, O-25; default and sync are proposals tuned in T3.4). */
export const RATE_LIMITS: Record<RateLimitClass, Window[]> = {
  login: [
    { limit: 10, ttlMs: MINUTE, key: (r) => `id:${loginId(r)}` },
    { limit: 100, ttlMs: HOUR, key: (r) => `id:${loginId(r)}` },
    { limit: 10, ttlMs: MINUTE, key: (r) => `ip:${ip(r)}`, byIp: true },
    { limit: 100, ttlMs: HOUR, key: (r) => `ip:${ip(r)}`, byIp: true },
  ],
  'otp-request': [
    { limit: 5, ttlMs: HOUR, key: address },
    { limit: 20, ttlMs: HOUR, key: ip, byIp: true },
  ],
  'otp-verify': [
    {
      limit: 5,
      ttlMs: HOUR,
      key: (r) => field(r, 'registrationId', 'loginId', 'otpId', 'requestId'),
    },
    { limit: 20, ttlMs: HOUR, key: ip, byIp: true },
  ],
  'password-reset': [
    { limit: 5, ttlMs: HOUR, key: loginId },
    { limit: 20, ttlMs: HOUR, key: ip, byIp: true },
  ],
  refresh: [{ limit: 60, ttlMs: HOUR, key: refreshSession }],
  'public-form': [{ limit: 20, ttlMs: HOUR, key: ip, byIp: true }],
  // Public reference data for the registration form (DECISION_LOG D-083).
  'reference-read': [{ limit: 300, ttlMs: HOUR, key: ip, byIp: true }],
  default: [{ limit: 600, ttlMs: MINUTE, key: caller }],
  sync: [{ limit: 60, ttlMs: MINUTE, key: session }],
};
