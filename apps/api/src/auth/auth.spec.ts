import pino from 'pino';
import { describe, expect, it, vi } from 'vitest';
import { loadEnv } from '../config/env.js';
import { ApiError } from '../i18n/api-error.js';
import { type EmailAdapter, type SmsAdapter, StubSmsAdapter } from '../notifications/adapters.js';
import { RATE_LIMITS } from '../rate-limit/rate-limit.js';
import { afterFailure, LOCKOUT_RULES, minutesLeft, UnknownIdLockout } from './lockout.js';
import { normalizeLoginId } from './login-id.js';
import { identifierHash, OtpDeliveryService } from './otp.service.js';
import { PasswordHasher } from './password-hasher.js';
import { ACCESS_TOKEN_SECONDS, hashRefreshToken, TokenService } from './token.service.js';

const base = {
  DATABASE_URL: 'postgresql://u:p@localhost:5432/css_erp_dev',
  CURSOR_SECRET: 'x'.repeat(32),
  STORAGE_DRIVER: 'nas',
  STORAGE_ROOT: '/tmp',
  JWT_SECRET: 'j'.repeat(32),
  AUTH_CSRF_SECRET: 'c'.repeat(32),
  OTP_SECRET: 'o'.repeat(32),
  LOCAL_KEY_SECRET: 'l'.repeat(32),
};
const env = (over: Record<string, string> = {}) => loadEnv({ ...base, ...over });
const clockAt = (t: number) => ({ now: () => new Date(t) });

describe('TokenService', () => {
  const claims = { sub: 'user-1', sid: 'session-1', roles: ['program_manager'], pv: 3 };

  it('signs a 15-minute token with a key id and only the allowed claims', async () => {
    const t0 = Date.UTC(2026, 9, 11, 6, 0, 0);
    const tokens = new TokenService(env(), clockAt(t0));
    const { token, expiresAt } = await tokens.signAccess(claims);
    expect(expiresAt.getTime()).toBe(t0 + ACCESS_TOKEN_SECONDS * 1000);
    const [header, payload] = token
      .split('.')
      .slice(0, 2)
      .map((p) => JSON.parse(Buffer.from(p!, 'base64url').toString()));
    expect(header).toMatchObject({ alg: 'HS256', typ: 'JWT', kid: expect.any(String) });
    expect(Object.keys(payload).sort()).toEqual(['exp', 'iat', 'pv', 'roles', 'sid', 'sub']);
    expect(await tokens.verifyAccess(token)).toEqual(claims);
  });

  it('refuses an expired, tampered or foreign-key token', async () => {
    const t0 = Date.UTC(2026, 9, 11);
    const signer = new TokenService(env(), clockAt(t0));
    const { token } = await signer.signAccess(claims);
    const later = new TokenService(env(), clockAt(t0 + ACCESS_TOKEN_SECONDS * 1000 + 1000));
    await expect(later.verifyAccess(token)).rejects.toMatchObject({ code: 'auth.token_expired' });
    const [h, p, s] = token.split('.');
    const forged = Buffer.from(JSON.stringify({ ...claims, pv: 99, exp: 9e9 })).toString(
      'base64url',
    );
    await expect(signer.verifyAccess(`${h}.${forged}.${s}`)).rejects.toMatchObject({
      code: 'auth.token_missing',
    });
    const other = new TokenService(env({ JWT_SECRET: 'k'.repeat(32) }), clockAt(t0));
    await expect(other.verifyAccess(token)).rejects.toMatchObject({ code: 'auth.token_missing' });
    expect(p).toBeTruthy();
  });

  it('accepts tokens of the previous key during a rotation', async () => {
    const t0 = Date.UTC(2026, 9, 11);
    const old = new TokenService(env({ JWT_SECRET: 'a'.repeat(32) }), clockAt(t0));
    const { token } = await old.signAccess(claims);
    const rotated = new TokenService(
      env({ JWT_SECRET: 'b'.repeat(32), JWT_PREVIOUS_SECRET: 'a'.repeat(32) }),
      clockAt(t0),
    );
    expect(await rotated.verifyAccess(token)).toEqual(claims);
  });

  it('makes refresh tokens that start with the session id and CSRF tokens bound to it', () => {
    const tokens = new TokenService(env(), clockAt(0));
    const refresh = tokens.newRefreshToken('0190a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a5b');
    expect(refresh).toMatch(/^0190a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a5b\.[\w-]{43}$/);
    expect(hashRefreshToken(refresh)).not.toContain(refresh.split('.')[1]);
    const csrf = tokens.csrfToken('s1');
    expect(tokens.csrfValid('s1', csrf)).toBe(true);
    expect(tokens.csrfValid('s2', csrf)).toBe(false);
    expect(tokens.csrfValid('s1', `${csrf}x`)).toBe(false);
    expect(tokens.csrfValid('s1', 'nonsense')).toBe(false);
  });
});

describe('lockout', () => {
  const now = new Date(Date.UTC(2026, 9, 11, 6));

  it('locks at the fifth consecutive failure for 15 minutes and resets the counter', () => {
    expect(afterFailure(0, now)).toEqual({ failedCount: 1, lockedUntil: null });
    expect(afterFailure(3, now)).toEqual({ failedCount: 4, lockedUntil: null });
    expect(afterFailure(4, now)).toEqual({
      failedCount: 0,
      lockedUntil: new Date(now.getTime() + LOCKOUT_RULES.lockMs),
    });
    expect(minutesLeft(new Date(now.getTime() + 61_000), now)).toBe(2);
    expect(minutesLeft(new Date(now.getTime() + 1_000), now)).toBe(1);
  });

  it('treats unknown ids the same way and forgets expired locks', () => {
    const lock = new UnknownIdLockout(2);
    for (let i = 0; i < 4; i++) expect(lock.fail('a', now)).toBeNull();
    expect(lock.fail('a', now)).toEqual(new Date(now.getTime() + LOCKOUT_RULES.lockMs));
    expect(lock.lockedUntil('a', now)).not.toBeNull();
    expect(lock.lockedUntil('a', new Date(now.getTime() + LOCKOUT_RULES.lockMs + 1))).toBeNull();
    lock.fail('b', now);
    lock.fail('c', now);
    lock.fail('d', now);
    expect(lock.lockedUntil('a', now)).toBeNull();
  });
});

describe('login id normalization', () => {
  it('lower-cases emails and cleans mobile numbers', () => {
    expect(normalizeLoginId('  Head@Example.ORG ')).toEqual({
      kind: 'email',
      value: 'head@example.org',
    });
    expect(normalizeLoginId('+8801700000001')).toEqual({ kind: 'mobile', value: '01700000001' });
    expect(normalizeLoginId('01700-000 001')).toEqual({ kind: 'mobile', value: '01700000001' });
    expect(normalizeLoginId('০১৭০০০০০০০১')).toEqual({ kind: 'mobile', value: '01700000001' });
  });

  it('reads anything else as a job ID in capitals, so an official logs in with it in any case', () => {
    expect(normalizeLoginId(' css-১০১ ')).toEqual({ kind: 'job_id', value: 'CSS-101' });
    expect(normalizeLoginId('1023')).toEqual({ kind: 'job_id', value: '1023' });
    // eleven digits that are not a mobile number are a job ID too
    expect(normalizeLoginId('12345678901')).toEqual({ kind: 'job_id', value: '12345678901' });
  });

  it('hashes identifiers with the OTP secret, never in clear', () => {
    const value = identifierHash(env(), 'mobile:01700000001');
    expect(value).not.toContain('01700000001');
    expect(identifierHash(env({ OTP_SECRET: 'p'.repeat(32) }), 'mobile:01700000001')).not.toBe(
      value,
    );
  });
});

describe('OTP delivery', () => {
  const adapters = () => {
    const sms: SmsAdapter = { send: vi.fn(async () => ({ providerMessageId: 's' })) };
    const email: EmailAdapter = { send: vi.fn(async () => ({ providerMessageId: 'e' })) };
    return { sms, email };
  };

  it('uses the configured fixed code and sends nothing in dummy mode', async () => {
    const { sms, email } = adapters();
    const delivery = new OtpDeliveryService(
      env({ OTP_DUMMY_ENABLED: 'true', OTP_DUMMY_CODE: '135790' }),
      sms,
      email,
      pino({ level: 'silent' }),
    );
    expect(delivery.newCode()).toBe('135790');
    await delivery.deliver(
      { purpose: 'password_reset', channel: 'sms', address: '01700000001' },
      '135790',
      'bn',
      'otp_password_reset',
    );
    expect(sms.send).not.toHaveBeenCalled();
  });

  it('sends a random code through the real adapters with the bilingual template', async () => {
    const { sms, email } = adapters();
    const delivery = new OtpDeliveryService(env(), sms, email, pino({ level: 'silent' }));
    const code = delivery.newCode();
    expect(code).toMatch(/^\d{6}$/);
    await delivery.deliver(
      { purpose: 'password_reset', channel: 'sms', address: '01700000001' },
      '123456',
      'en',
      'otp_password_reset',
    );
    expect(sms.send).toHaveBeenCalledWith({
      to: '01700000001',
      body: expect.stringContaining('123456'),
    });
    await delivery.deliver(
      { purpose: 'password_reset', channel: 'email', address: 'a@example.org' },
      '654321',
      'bn',
      'otp_password_reset',
    );
    expect(email.send).toHaveBeenCalledWith(
      expect.objectContaining({ to: 'a@example.org', text: expect.stringContaining('654321') }),
    );
  });
});

describe('PasswordHasher', () => {
  it('verifies Argon2id hashes, fails without a stored hash and asks for rehash of old parameters', async () => {
    const hasher = new PasswordHasher();
    const stored = await hasher.hash('Nadi kul 2026');
    expect(stored).toMatch(/^\$argon2id\$v=19\$m=19456,t=2,p=1\$/);
    expect(await hasher.verify(stored, 'Nadi kul 2026')).toBe(true);
    expect(await hasher.verify(stored, 'nadi kul 2026')).toBe(false);
    expect(await hasher.verify(null, 'Nadi kul 2026')).toBe(false);
    expect(await hasher.verify('garbage', 'x')).toBe(false);
    expect(hasher.needsRehash(stored)).toBe(false);
    expect(hasher.needsRehash('$argon2id$v=19$m=4096,t=3,p=1$abc$def')).toBe(true);
  });
});

describe('auth rate-limit keys', () => {
  const req = (body: unknown, cookie?: string) =>
    ({ body, ip: '10.0.0.1', headers: cookie ? { cookie } : {} }) as never;

  it('counts logins by login id and by IP separately', () => {
    const keys = RATE_LIMITS.login.map((w) => w.key(req({ loginId: ' A@Example.org ' })));
    expect(keys).toEqual([
      'id:email:a@example.org',
      'id:email:a@example.org',
      'ip:10.0.0.1',
      'ip:10.0.0.1',
    ]);
    // spellings of one mobile number share the window (docs/architecture/AUTH.md, "Identities and
    // accounts")
    for (const spelling of ['01700000001', ' 0170-0000001 ', '+8801700000001', '০১৭০০০০০০০১'])
      expect(RATE_LIMITS.login[0]!.key(req({ loginId: spelling }))).toBe('id:mobile:01700000001');
  });

  it('counts refreshes per session from the refresh cookie and OTP checks per login id', () => {
    const sid = '0190a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a5b';
    expect(RATE_LIMITS.refresh[0]!.key(req({}, `css_csrf=x; css_refresh=${sid}.abc`))).toBe(
      `sid:${sid}`,
    );
    expect(RATE_LIMITS.refresh[0]!.key(req({}))).toBe('ip:10.0.0.1');
    expect(RATE_LIMITS['otp-verify'][0]!.key(req({ loginId: '01700000001', code: '1' }))).toBe(
      '01700000001',
    );
    expect(RATE_LIMITS['password-reset'][0]!.key(req({ loginId: 'X@example.org' }))).toBe(
      'email:x@example.org',
    );
    // the reset and verify classes also count per address
    expect(RATE_LIMITS['password-reset'][1]!.key(req({}))).toBe('10.0.0.1');
    expect(RATE_LIMITS['otp-verify'][1]!.key(req({}))).toBe('10.0.0.1');
  });

  it('builds API errors with Retry-After for locks', () => {
    const error = new ApiError('auth.account_locked', 423, undefined, undefined, 900);
    expect(error.retryAfterSeconds).toBe(900);
  });
});

describe('registration rate-limit windows', () => {
  const req = (body: unknown) => ({ body, ip: '10.0.0.1', headers: {} }) as never;

  it('caps new drafts at 10 per address and day, and counts a submit by its draft', () => {
    expect(RATE_LIMITS.registration.map((w) => [w.limit, w.ttlMs, w.byIp ?? false])).toEqual([
      [10, 86_400_000, true],
      [5, 3_600_000, false],
      [10, 86_400_000, false],
      [100, 86_400_000, true],
      [20, 3_600_000, true],
    ]);
  });

  it('counts a submit by its draft and a start, which names no draft, by the address', () => {
    const [byAddressDay, byDraft, byDraftDay] = RATE_LIMITS.registration;
    const submit = req({ registrationId: 'D1' });
    const start = req({ kind: 'volunteer' });
    expect(byDraft!.key(submit)).toBe('draft:d1');
    expect(byDraftDay!.key(submit)).toBe('draft:d1');
    for (const window of [byDraft!, byDraftDay!]) {
      expect(window.skip!(submit)).toBe(false);
      expect(window.skip!(start)).toBe(true);
    }
    // a new draft spends the address's day of starts; a submit spends the address's day of
    // submits, so made-up draft ids cannot send more than that
    const submitsByAddress = RATE_LIMITS.registration[3]!;
    expect(byAddressDay!.skip!(start)).toBe(false);
    expect(byAddressDay!.skip!(submit)).toBe(true);
    expect(submitsByAddress.skip!(submit)).toBe(false);
    expect(submitsByAddress.skip!(start)).toBe(true);
  });

  it('keys a contact code by the change request in the path when the body names none', () => {
    const withPath = (requestId: string) =>
      ({ body: { code: '123456' }, ip: '10.0.0.1', headers: {}, params: { requestId } }) as never;
    const [byAddress] = RATE_LIMITS['otp-request'];
    const [byId] = RATE_LIMITS['otp-verify'];
    expect(byAddress!.key(withPath('R1'))).toBe('request:R1');
    expect(byId!.key(withPath('R1'))).toBe('request:R1');
    expect(byId!.key(withPath('R2'))).not.toBe(byId!.key(withPath('R1')));
  });

  it('keys a code resend by its registration draft, not one shared bucket', () => {
    const [byAddress] = RATE_LIMITS['otp-request'];
    const a = byAddress!.key(req({ registrationId: 'A', channel: 'sms' }));
    expect(a).not.toBe('none');
    expect(byAddress!.key(req({ registrationId: 'B', channel: 'sms' }))).not.toBe(a);
  });
});

describe('the direct OTP path through the SMS stub', () => {
  it('logs no code and no full number', async () => {
    const lines: string[] = [];
    const logger = pino({ level: 'info' }, { write: (line: string) => void lines.push(line) });
    const email: EmailAdapter = { send: vi.fn(async () => ({ providerMessageId: 'e' })) };
    const delivery = new OtpDeliveryService(
      env(),
      new StubSmsAdapter('logging', logger),
      email,
      logger,
    );
    await delivery.deliver(
      { purpose: 'password_reset', channel: 'sms', address: '01700000001' },
      '864209',
      'bn',
      'otp_password_reset',
    );
    expect(lines.length).toBeGreaterThan(0);
    expect(lines.join('\n')).not.toContain('864209');
    expect(lines.join('\n')).not.toContain('01700000001');
  });
});
