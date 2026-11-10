// The contract test's way into a running API: the address from CONTRACT_API_URL, accepted only on
// this machine, and a signed-in session of a demo account (docs/testing/DEMO_ACCOUNTS.md).
import type { Me, TokenPair } from '@css/shared/auth';
import { tokenPairSchema } from '../../../src/api/schemas';
import { record } from './expect';

/** The demo accounts' password and the dummy code of the seeded test API (test values only). */
export const DEMO_PASSWORD = 'CssDemo2026';
/** The password a password case changes a demo account to, before it puts the demo one back. */
export const CHANGED_PASSWORD = 'CssContract2026';
export const DUMMY_OTP = process.env.CONTRACT_OTP_CODE ?? '123456';

const LOOPBACK = new Set(['127.0.0.1', '::1', '[::1]', 'localhost']);

/**
 * The API's base address, or null when CONTRACT_API_URL is unset (the suites skip). Any host but
 * this machine is refused before a request goes out, because the cases write (approvals, grants, a
 * published form) and must never reach a shared server.
 */
export function contractBase(value = process.env.CONTRACT_API_URL): string | null {
  if (!value) return null;
  const url = new URL(value);
  if (!LOOPBACK.has(url.hostname))
    throw new Error(`CONTRACT_API_URL must point at this machine, not ${url.hostname}`);
  return `${url.origin}/api/v1`;
}

/** The origin the API accepts writes from: the app's own (the E2E server's default). */
const APP_ORIGIN = process.env.CONTRACT_APP_ORIGIN ?? 'http://127.0.0.1:3100';

export interface Caller {
  token: string | null;
  cookies: string[];
}

export interface Sent {
  status: number;
  /** The parsed JSON answer; null for an empty or a non-JSON answer (a streamed file). */
  body: unknown;
  /** The Content-Type the API answered with. */
  contentType: string | null;
}

/** A request path with its variable parts marked, as the app's source writes the call. */
export interface MarkedPath {
  url: string;
  marked: string;
}

/**
 * `` at`/reference-lists/${list}` ``: the path to send, recorded with each interpolated part
 * marked, for a part that is a word rather than an id (a list's name, an action, a photo slot, a
 * link's token), which the record could not otherwise tell from a fixed segment.
 */
export function at(strings: TemplateStringsArray, ...parts: unknown[]): MarkedPath {
  const join = (fill: (part: unknown) => string) =>
    String.raw({ raw: strings }, ...parts.map(fill));
  return { url: join(String), marked: join(() => '${}') };
}

/**
 * One request to the API as the app sends it, recorded for the coverage check. A byte body (a
 * photo, an upload part) goes as it is, with the type the caller names in `headers`.
 */
export async function call(
  caller: Caller | null,
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE',
  path: string | MarkedPath,
  body?: unknown,
  headers: Record<string, string> = {},
): Promise<Sent> {
  const base = contractBase();
  if (!base) throw new Error('CONTRACT_API_URL is not set');
  const url = typeof path === 'string' ? path : path.url;
  const raw = body instanceof Uint8Array;
  const res = await fetch(`${base}${url}`, {
    method,
    headers: {
      Origin: APP_ORIGIN,
      'Accept-Language': 'bn',
      ...(body === undefined || raw ? {} : { 'Content-Type': 'application/json' }),
      ...(caller?.token ? { Authorization: `Bearer ${caller.token}` } : {}),
      ...(caller?.cookies.length ? { Cookie: caller.cookies.join('; ') } : {}),
      ...headers,
    },
    body: raw ? new Uint8Array(body) : body === undefined ? undefined : JSON.stringify(body),
  });
  if (caller) {
    const set = res.headers.getSetCookie().map((c) => c.split(';')[0]!);
    for (const cookie of set) {
      const name = cookie.split('=')[0];
      caller.cookies = [...caller.cookies.filter((c) => !c.startsWith(`${name}=`)), cookie];
    }
  }
  const contentType = res.headers.get('content-type');
  const json = contentType?.includes('json') ?? false;
  const text = json ? await res.text() : (await res.arrayBuffer(), '');
  const parsed: unknown = text ? JSON.parse(text) : null;
  record(method, typeof path === 'string' ? path : path.marked, res.status);
  return { status: res.status, body: parsed, contentType };
}

/**
 * A signed-in session of a demo account by its login id (job id, email or mobile), with the
 * sign-in's answer read with the app's own schema.
 */
export async function signIn(loginId: string): Promise<Caller & { me: Me; pair: TokenPair }> {
  const caller: Caller = { token: null, cookies: [] };
  const res = await call(caller, 'POST', '/auth/login', {
    loginId,
    password: DEMO_PASSWORD,
    device: { name: 'contract test', platform: 'other' },
  });
  if (res.status !== 200) throw new Error(`sign-in of ${loginId}: ${JSON.stringify(res.body)}`);
  const pair = tokenPairSchema.parse((res.body as { data?: unknown } | null)?.data);
  caller.token = pair.accessToken;
  return { ...caller, me: pair.me, pair };
}
