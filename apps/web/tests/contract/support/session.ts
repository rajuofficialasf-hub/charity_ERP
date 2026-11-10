// The contract test's way into a running API: the address from CONTRACT_API_URL, accepted only on
// this machine, and a signed-in session of a demo account (docs/testing/DEMO_ACCOUNTS.md).
import { record } from './expect';

/** The demo accounts' password and the dummy code of the seeded test API (test values only). */
export const DEMO_PASSWORD = 'CssDemo2026';
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
  body: unknown;
}

/** One request to the API as the app sends it, recorded for the coverage check. */
export async function call(
  caller: Caller | null,
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE',
  path: string,
  body?: unknown,
  headers: Record<string, string> = {},
): Promise<Sent> {
  const base = contractBase();
  if (!base) throw new Error('CONTRACT_API_URL is not set');
  const res = await fetch(`${base}${path}`, {
    method,
    headers: {
      Origin: APP_ORIGIN,
      'Accept-Language': 'bn',
      ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
      ...(caller?.token ? { Authorization: `Bearer ${caller.token}` } : {}),
      ...(caller?.cookies.length ? { Cookie: caller.cookies.join('; ') } : {}),
      ...headers,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (caller) {
    const set = res.headers.getSetCookie().map((c) => c.split(';')[0]!);
    for (const cookie of set) {
      const name = cookie.split('=')[0];
      caller.cookies = [...caller.cookies.filter((c) => !c.startsWith(`${name}=`)), cookie];
    }
  }
  const text = await res.text();
  const parsed: unknown = text ? JSON.parse(text) : null;
  record(method, path, res.status);
  return { status: res.status, body: parsed };
}

/** A signed-in session of a demo account by its login id (job id, email or mobile). */
export async function signIn(loginId: string): Promise<Caller & { me: unknown; pair: unknown }> {
  const caller: Caller = { token: null, cookies: [] };
  const res = await call(caller, 'POST', '/auth/login', {
    loginId,
    password: DEMO_PASSWORD,
    device: { name: 'contract test', platform: 'other' },
  });
  if (res.status !== 200) throw new Error(`sign-in of ${loginId}: ${JSON.stringify(res.body)}`);
  const pair = (res.body as { data: { accessToken: string; me: unknown } }).data;
  caller.token = pair.accessToken;
  return { ...caller, me: pair.me, pair };
}
