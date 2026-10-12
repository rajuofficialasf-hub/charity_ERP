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

/** A registration draft with both codes verified: its id, contacts and draft token. */
export async function verifiedDraft(h: AuthHarness, kind: 'volunteer' | 'staff' = 'volunteer') {
  const contacts = newContacts();
  const started = await request(h.server())
    .post('/api/v1/auth/register/start')
    .send({ ...contacts, kind });
  if (started.status !== 201) throw new Error(`start failed: ${started.status}`);
  const registrationId = started.body.data.registrationId as string;
  const verified = await request(h.server())
    .post('/api/v1/auth/register/otp/verify')
    .send({ registrationId, mobileCode: DUMMY_CODE, emailCode: DUMMY_CODE });
  if (verified.status !== 200) throw new Error(`verify failed: ${verified.status}`);
  return { ...contacts, registrationId, token: verified.body.data.registrationToken as string };
}
