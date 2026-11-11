import { uuidv7 } from '@css/shared';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { NotificationInput } from '../../src/notifications/service.js';
import {
  type Account,
  account,
  type AuthHarness,
  authHarness,
  bearer,
  login,
  type Session,
} from './support/auth-app.js';

// The own inbox and preferences (docs/architecture/NOTIFICATIONS.md, inbox and preferences): only
// the caller's entries, rendered in the caller's language from the stored template version.
let h: AuthHarness;
let reader: Account;
let other: Account;
let volunteer: Account;
let readerSession: Session;
let otherSession: Session;
const api = () => request(h.server());

const publish = (input: NotificationInput) =>
  h.container.prisma.$transaction((tx) => h.container.notifications.publish(tx, input));

beforeAll(async () => {
  h = await authHarness();
  reader = await account(h.db, { role: 'regional_program_manager' });
  other = await account(h.db, { role: 'regional_program_manager' });
  volunteer = await account(h.db, { kind: 'volunteer' });
  for (const [person, n] of [
    [reader, 3],
    [other, 1],
  ] as const)
    for (let i = 0; i < n; i++)
      await publish({
        key: 'registration_rejected',
        recipients: [{ user: person.id }],
        params: { reason: `কারণ ${i}` },
        about: `${person.id}:${i}`,
      });
  readerSession = await login(h, reader);
  otherSession = await login(h, other);
});
afterAll(async () => h.close());

const inbox = (s: Session, query: Record<string, string> = {}, language = 'en') =>
  api().get('/api/v1/notifications').query(query).set(bearer(s)).set('Accept-Language', language);

describe('the inbox', () => {
  it('lists only the caller’s entries, newest first, in the caller’s language, by pages', async () => {
    const first = await inbox(readerSession, { limit: '2' });
    expect(first.status).toBe(200);
    expect(first.body.data).toHaveLength(2);
    expect(first.body.meta.unreadCount).toBe(3);
    expect(first.body.data[0]).toMatchObject({
      templateKey: 'registration_rejected',
      title: 'Registration not accepted',
      body: 'Your registration was not accepted. Reason: কারণ 2',
      link: null,
      count: 1,
      readAt: null,
    });
    const next = await inbox(readerSession, { limit: '2', cursor: first.body.meta.nextCursor });
    expect(next.body.data).toHaveLength(1);
    expect(next.body.data[0].body).toContain('কারণ 0');
    const bn = await inbox(readerSession, { limit: '1' }, 'bn');
    expect(bn.body.data[0].title).toBe('নিবন্ধন গৃহীত হয়নি');
  });

  it('keeps an entry on the version it was written with after the template changes', async () => {
    const head = await login(h, await account(h.db, { role: 'department_head' }));
    const edited = await api()
      .put('/api/v1/admin/notification-templates/registration_rejected/in_app')
      .set(bearer(head))
      .send({
        bn: { title: 'নিবন্ধন গ্রহণ হয়নি', body: 'কারণ: {{reason}}' },
        en: { title: 'Not accepted', body: 'Reason: {{reason}}' },
      });
    expect(edited.status).toBe(200);
    const old = await inbox(readerSession, { limit: '1' });
    expect(old.body.data[0].title).toBe('Registration not accepted');
    await publish({
      key: 'registration_rejected',
      recipients: [{ user: reader.id }],
      params: { reason: 'নতুন' },
      about: `${reader.id}:new`,
    });
    const fresh = await inbox(readerSession, { limit: '1' });
    expect(fresh.body.data[0]).toMatchObject({ title: 'Not accepted', body: 'Reason: নতুন' });
  });

  it('shows a plain fallback for one entry that cannot be rendered, and the rest as usual', async () => {
    await h.db.query(
      `INSERT INTO notifications (id, user_id, template_key, template_version, params)
       VALUES ($2, $1, 'registration_rejected', 1, '{}')`,
      // a time-ordered id like every entry, so it is the newest
      [other.id, uuidv7()],
    );
    const res = await inbox(otherSession);
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(2);
    expect(res.body.data[0].title).toBe('Notification');
    expect(res.body.data[1].title).toBe('Registration not accepted');
  });

  it('marks one and all read; another user’s entry is not found and stays unread', async () => {
    const others = await inbox(otherSession);
    const foreign = others.body.data[0].id as string;
    const mine = (await inbox(readerSession)).body.data[0].id as string;
    const refused = await api()
      .post('/api/v1/notifications/read')
      .set(bearer(readerSession))
      .send({ ids: [mine, foreign] });
    expect(refused.status).toBe(404);
    expect((await inbox(readerSession)).body.meta.unreadCount).toBe(4);

    await api()
      .post('/api/v1/notifications/read')
      .set(bearer(readerSession))
      .send({ ids: [mine] })
      .expect(204);
    const count = await api().get('/api/v1/notifications/unread-count').set(bearer(readerSession));
    expect(count.body.data).toEqual({ count: 3 });
    expect((await inbox(readerSession, { unread: 'true' })).body.data).toHaveLength(3);

    await api()
      .post('/api/v1/notifications/read')
      .set(bearer(readerSession))
      .send({ all: true })
      .expect(204);
    expect((await inbox(readerSession)).body.meta.unreadCount).toBe(0);
    // the other reader's entries are untouched
    expect((await inbox(otherSession)).body.meta.unreadCount).toBe(2);
  });

  it('refuses a body with both ids and all, or neither', async () => {
    for (const body of [{}, { all: true, ids: [reader.id] }])
      expect(
        (await api().post('/api/v1/notifications/read').set(bearer(readerSession)).send(body))
          .status,
      ).toBe(422);
  });

  it('answers 401 without a session', async () => {
    await api().get('/api/v1/notifications').expect(401);
    await api().get('/api/v1/notifications/unread-count').expect(401);
    await api().post('/api/v1/notifications/read').send({ all: true }).expect(401);
    await api().get('/api/v1/me/preferences').expect(401);
  });
});

describe('the preferences', () => {
  it('stores the email mode of an official and keeps digest as the default', async () => {
    const before = await api().get('/api/v1/me/preferences').set(bearer(readerSession));
    expect(before.body.data).toEqual({ email_mode: 'digest', digest_time: '08:00' });
    const saved = await api()
      .patch('/api/v1/me/preferences')
      .set(bearer(readerSession))
      .send({ email_mode: 'immediate' });
    expect(saved.status).toBe(200);
    expect(saved.body.data).toEqual({ email_mode: 'immediate', digest_time: '08:00' });
  });

  it('refuses an email setting for a volunteer', async () => {
    const s = await login(h, volunteer);
    expect((await api().get('/api/v1/me/preferences').set(bearer(s))).body.data).toEqual({});
    const res = await api()
      .patch('/api/v1/me/preferences')
      .set(bearer(s))
      .send({ email_mode: 'immediate' });
    expect(res.status).toBe(422);
    expect(res.body.error.details[0].code).toBe('notification.no_email_for_volunteers');
  });
});
