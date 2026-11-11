import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  account,
  type AuthHarness,
  authHarness,
  bearer,
  login,
  type Session,
} from './support/auth-app.js';

// Templates for the global roles (docs/architecture/NOTIFICATIONS.md, templates): the list, the
// preview in both languages and the edit that makes a new version, audited.
let h: AuthHarness;
let head: Session;
let pm: Session;
const api = () => request(h.server());
const URL = '/api/v1/admin/notification-templates';

beforeAll(async () => {
  h = await authHarness();
  head = await login(h, await account(h.db, { role: 'department_head' }));
  pm = await login(h, await account(h.db, { role: 'program_manager' }));
});
afterAll(async () => h.close());

const handover = {
  bn: { subject: 'কাজ হস্তান্তর', body: '{{from_name}}-এর {{count}}টি কাজ আপনাকে দেওয়া হয়েছে।' },
  en: { subject: 'Work handed over', body: '{{count}} items of {{from_name}} are now yours.' },
};

describe('the notification templates', () => {
  it('lists the catalogue keys with both languages and leaves the direct OTP texts out', async () => {
    const res = await api().get(URL).set(bearer(head));
    expect(res.status).toBe(200);
    const keys = (res.body.data as { key: string }[]).map((t) => t.key);
    expect(keys).toContain('registration_pending');
    expect(keys).not.toContain('otp_password_reset');
    const item = (res.body.data as Record<string, unknown>[]).find(
      (t) => t.key === 'handover_items_assigned',
    );
    expect(item).toMatchObject({
      category: 'work',
      variables: ['from_name', 'count'],
      channels: {
        in_app: { version: 1, en: { title: 'Handed-over work' } },
        email: { version: 1, en: { subject: expect.any(String) } },
      },
    });
  });

  it('previews a draft in bn and en with sample values, saving nothing', async () => {
    const res = await api()
      .post(`${URL}/handover_items_assigned/email/preview`)
      .set(bearer(head))
      .send(handover);
    expect(res.status).toBe(200);
    expect(res.body.data.en.subject).toBe('Work handed over');
    expect(res.body.data.en.body).not.toContain('{{');
    expect(res.body.data.bn.body).not.toContain('{{');
    const { rows } = await h.db.query(
      `SELECT count(*)::int AS n FROM notification_templates WHERE key = 'handover_items_assigned' AND channel = 'email'`,
    );
    expect(rows[0].n).toBe(2);
  });

  it('refuses a preview of an unknown key or channel, and of an undeclared placeholder', async () => {
    const preview = (path: string, body: object) =>
      api().post(`${URL}/${path}/preview`).set(bearer(head)).send(body);
    expect((await preview('no_such_key/email', handover)).status).toBe(404);
    expect((await preview('registration_pending/email', handover)).status).toBe(404);
    const unknown = await preview('handover_items_assigned/email', {
      bn: handover.bn,
      en: { subject: 'S', body: 'Hello {{nid}}' },
    });
    expect(unknown.status).toBe(422);
    expect(unknown.body.error.details).toContainEqual(
      expect.objectContaining({ path: 'en.body', code: 'notification.placeholder_unknown' }),
    );
  });

  it('saves a new version, audited, and keeps the old one for what it rendered', async () => {
    const res = await api()
      .put(`${URL}/handover_items_assigned/email`)
      .set(bearer(head))
      .send(handover);
    expect(res.status).toBe(200);
    expect(res.body.data.channels.email).toMatchObject({
      version: 2,
      en: { subject: 'Work handed over' },
    });
    const { rows } = await h.db.query<{ version: number; active: boolean }>(
      `SELECT version, active FROM notification_templates
        WHERE key = 'handover_items_assigned' AND channel = 'email' AND locale = 'en' ORDER BY version`,
    );
    expect(rows).toEqual([
      { version: 1, active: false },
      { version: 2, active: true },
    ]);
    const audit = await h.db.query(
      `SELECT old, new FROM audit_log WHERE action = 'notification.template.change'`,
    );
    expect(audit.rows).toHaveLength(1);
    expect(audit.rows[0].new).toMatchObject({ key: 'handover_items_assigned', version: 2 });
  });

  it('refuses an undeclared placeholder, a person in an in-app text, markup and a link', async () => {
    const bad = async (channel: string, en: Record<string, string>) =>
      api()
        .put(`${URL}/handover_items_assigned/${channel}`)
        .set(bearer(head))
        .send({ bn: handover.bn, en });
    const unknown = await bad('email', { subject: 'S', body: 'Hello {{nid}}' });
    expect(unknown.status).toBe(422);
    expect(unknown.body.error.details).toContainEqual(
      expect.objectContaining({
        path: 'en.body',
        code: 'notification.placeholder_unknown',
      }),
    );
    const person = await api()
      .put(`${URL}/handover_items_assigned/in_app`)
      .set(bearer(head))
      .send({
        bn: { title: 'কাজ', body: '{{count}}টি কাজ' },
        en: { title: 'Work', body: 'From {{from_name}}' },
      });
    expect(person.status).toBe(422);
    expect(person.body.error.details).toContainEqual(
      expect.objectContaining({
        path: 'en.body',
        code: 'notification.person_in_app',
      }),
    );
    for (const body of ['<b>bold</b>', 'See https://example.org'])
      expect((await bad('email', { subject: 'S', body })).status).toBe(422);
    // an email needs its subject
    expect((await bad('email', { body: 'No subject' })).status).toBe(422);
  });

  it('answers 404 for an unknown key, a direct text and a channel the key does not send', async () => {
    for (const path of [
      'no_such_key/email',
      'otp_password_reset/email',
      'registration_pending/email',
    ])
      expect((await api().put(`${URL}/${path}`).set(bearer(head)).send(handover)).status).toBe(404);
  });

  it('is for the global roles only: 403 for a PM, 401 without a session', async () => {
    await api().get(URL).set(bearer(pm)).expect(403);
    await api()
      .put(`${URL}/handover_items_assigned/email`)
      .set(bearer(pm))
      .send(handover)
      .expect(403);
    await api().get(URL).expect(401);
  });
});
