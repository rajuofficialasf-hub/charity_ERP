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
  | 'registration'
  | 'default'
  | 'list'
  | 'sync'
  | 'upload'
  | 'lookup'
  | 'export';

export interface RateWindow {
  limit: number;
  ttlMs: number;
  /** The key this window counts by. */
  key: (req: Request) => string;
  /** Counts by the client address (runs before the per-id windows). */
  byIp?: boolean;
  /** One budget for every route of the class, not one per route. */
  shared?: boolean;
  /** The window does not apply to this request (it names nothing to count by). */
  skip?: (req: Request) => boolean;
}

/** Body fields used as keys are capped, so a flood of long made-up ids cannot grow the stores. */
const KEY_MAX_LENGTH = 128;

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

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
/** The request a code belongs to when the body names none: the change request in the path. */
const pathRequest = (req: Request) =>
  `request:${String((req.params as Record<string, unknown> | undefined)?.requestId ?? 'none').slice(0, KEY_MAX_LENGTH)}`;
/** The code's address, the registration draft a resend names, or the change request in the path. */
const address = (req: Request) => {
  const value = field(req, 'address', 'mobile', 'email', 'registrationId');
  return value === 'none' ? pathRequest(req) : value;
};
const session = (req: Request) => currentContext()?.deviceSessionId ?? `ip:${ip(req)}`;
/** The refresh token starts with its session id, so refreshes count per session. */
const refreshSession = (req: Request) => {
  const match = /(?:^|;\s*)css_refresh=([0-9a-f-]{36})\./.exec(req.headers.cookie ?? '');
  return match?.[1] ? `sid:${match[1]}` : `ip:${ip(req)}`;
};
const caller = (req: Request) => currentContext()?.userId ?? `ip:${ip(req)}`;

/** Limits and keys per class (API_STANDARDS 10; default and sync are proposals tuned before the field pilot). */
export const RATE_LIMITS: Record<RateLimitClass, RateWindow[]> = {
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
      key: (r) => {
        const value = field(r, 'registrationId', 'loginId', 'otpId', 'requestId');
        return value === 'none' ? pathRequest(r) : value;
      },
    },
    { limit: 20, ttlMs: HOUR, key: ip, byIp: true },
  ],
  'password-reset': [
    // a reset names its login id; a change of a signed-in user names none and counts per user
    {
      limit: 5,
      ttlMs: HOUR,
      key: (r) => {
        const id = loginId(r);
        return id === 'none' ? `user:${caller(r)}` : id;
      },
    },
    { limit: 20, ttlMs: HOUR, key: ip, byIp: true },
  ],
  refresh: [{ limit: 60, ttlMs: HOUR, key: refreshSession }],
  'public-form': [{ limit: 20, ttlMs: HOUR, key: ip, byIp: true }],
  // Public reference data for the registration form.
  'reference-read': [{ limit: 300, ttlMs: HOUR, key: ip, byIp: true }],
  // Registration drafts and the team member's reference lookup. The
  // 5 lookups per draft and per NID and day are counted by the service after the draft token is
  // checked, so nobody without a draft can use up a volunteer's NID.
  // A start names nothing but its kind: it counts by the client address only; a submit
  // also counts by its draft.
  registration: [
    { limit: 10, ttlMs: DAY, key: ip, byIp: true },
    {
      limit: 5,
      ttlMs: HOUR,
      key: (r) => `draft:${field(r, 'registrationId')}`,
      skip: (r) => field(r, 'registrationId') === 'none',
    },
    { limit: 20, ttlMs: HOUR, key: ip, byIp: true },
  ],
  default: [{ limit: 600, ttlMs: MINUTE, key: caller }],
  // The nationwide volunteer and beneficiary lists, their counts and profiles are heavy reads:
  // a tighter budget per user, and one per address before it.
  list: [
    { limit: 600, ttlMs: MINUTE, key: (r) => `ip:${ip(r)}`, byIp: true, shared: true },
    { limit: 60, ttlMs: MINUTE, key: caller, shared: true },
  ],
  sync: [{ limit: 60, ttlMs: MINUTE, key: session }],
  // The parts of chunked uploads: one budget per user across every upload (FILES_AND_DOCUMENTS 4).
  upload: [{ limit: 600, ttlMs: HOUR, key: caller, shared: true }],
  // The beneficiary lookup by NID or birth registration answers with a person's details, so trying
  // numbers must not pay: per user a minute and a day, and per address before them
  // (proposals, tuned with the load tests before the field rollout).
  lookup: [
    { limit: 120, ttlMs: MINUTE, key: (r) => `ip:${ip(r)}`, byIp: true, shared: true },
    { limit: 60, ttlMs: MINUTE, key: caller, shared: true },
    { limit: 600, ttlMs: DAY, key: caller, shared: true },
  ],
  // An export reads up to 100,000 rows in the worker: a person starts at most 30 an hour.
  export: [{ limit: 30, ttlMs: HOUR, key: caller, shared: true }],
};
