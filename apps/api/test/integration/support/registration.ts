import { randomUUID } from 'node:crypto';
import request from 'supertest';
import type { AuthHarness } from './auth-app';
import { fakeMobile } from './fixtures';

/** The dummy OTP of the test configuration (test/support/env.ts). */
export const DUMMY_CODE = '246810';
export const TOKEN_HEADER = 'X-Registration-Token';

let n = 0;
export const newContacts = () => ({
  mobile: fakeMobile(),
  email: `reg-h${++n}.${randomUUID().slice(0, 6)}@example.org`,
});

/**
 * Starts a draft and verifies the given contacts one channel at a time (D-090); returns the draft
 * id and the answer of the last verify (200 with the token, or the refusal).
 */
export async function verifyContacts(
  h: AuthHarness,
  contacts: { mobile: string; email: string },
  kind: 'volunteer' | 'staff' = 'volunteer',
) {
  const started = await request(h.server()).post('/api/v1/auth/register/start').send({ kind });
  if (started.status !== 201) throw new Error(`start failed: ${started.status}`);
  const registrationId = started.body.data.registrationId as string;
  let res!: request.Response;
  for (const [channel, address] of [
    ['sms', contacts.mobile],
    ['email', contacts.email],
  ] as const) {
    const sent = await request(h.server())
      .post('/api/v1/auth/register/otp/send')
      .send({ registrationId, channel, address });
    if (sent.status !== 204) throw new Error(`send failed: ${sent.status}`);
    res = await request(h.server())
      .post('/api/v1/auth/register/otp/verify')
      .send({ registrationId, channel, code: DUMMY_CODE });
    if (res.status !== 200) break;
  }
  return { registrationId, res, token: res.body.data?.registrationToken as string | undefined };
}

/** A registration draft with both codes verified: its id, contacts and draft token. */
export async function verifiedDraft(h: AuthHarness, kind: 'volunteer' | 'staff' = 'volunteer') {
  const contacts = newContacts();
  const { registrationId, res, token } = await verifyContacts(h, contacts, kind);
  if (res.status !== 200 || !token) throw new Error(`verify failed: ${res.status}`);
  return { ...contacts, registrationId, token };
}
