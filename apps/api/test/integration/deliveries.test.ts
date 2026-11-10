import { randomUUID } from 'node:crypto';
import { uuidv7 } from '@css/shared';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { maskAddress } from '../../src/services/deliveries.js';
import {
  type Account,
  account,
  type AuthHarness,
  authHarness,
  bearer,
  login,
  type Session,
} from './support/auth-app.js';

// The delivery page of the global roles (docs/architecture/NOTIFICATIONS.md, delivery and
// status): status, attempts and the cleaned error, addresses partly hidden, never a text.
let h: AuthHarness;
let monitoring: Session;
let pm: Session;
let official: Account;
const api = () => request(h.server());

async function outbox(status: string, channel = 'email', lastError: string | null = null) {
  const id = uuidv7();
  await h.container.prisma.outboundMessage.create({
    data: {
      id,
      eventId: randomUUID(),
      recipientUserId: official.id,
      address: channel === 'email' ? official.email! : official.mobile,
      channel,
      templateKey: 'handover_items_assigned',
      templateVersion: 1,
      params: { from_name: 'Hidden Sender', count: 1 },
      idempotencyKey: `${id}:${channel}`,
      status,
      lastError,
    },
  });
  return id;
}

beforeAll(async () => {
  h = await authHarness();
  monitoring = await login(h, await account(h.db, { role: 'monitoring_team' }));
  pm = await login(h, await account(h.db, { role: 'program_manager' }));
  official = await account(h.db, { role: 'regional_program_manager' });
  await outbox('sent');
  await outbox('failed', 'email', 'permanent: 550 [address] unknown');
  await outbox('dry_run', 'sms');
});
afterAll(async () => h.close());

describe('the delivery page', () => {
  it('lists newest first with the address partly hidden and never the text or the values', async () => {
    const res = await api().get('/api/v1/admin/deliveries').set(bearer(monitoring));
    expect(res.status).toBe(200);
    const ids = res.body.data.map((d: { id: string }) => d.id);
    expect(ids).toEqual([...ids].sort().reverse());
    expect(res.body.data.map((d: { status: string }) => d.status).sort()).toEqual([
      'dry_run',
      'failed',
      'sent',
    ]);
    const failed = res.body.data.find((d: { status: string }) => d.status === 'failed');
    expect(failed).toMatchObject({
      channel: 'email',
      templateKey: 'handover_items_assigned',
      recipient: { id: official.id, name: expect.any(String) },
      address: maskAddress(official.email!, 'email'),
      attempts: 0,
      lastError: 'permanent: 550 [address] unknown',
    });
    const text = JSON.stringify(res.body);
    expect(text).not.toContain(official.email);
    expect(text).not.toContain(official.mobile);
    expect(text).not.toContain('Hidden Sender');
  });

  it('filters by status and channel, and pages', async () => {
    const failed = await api()
      .get('/api/v1/admin/deliveries')
      .query({ status: 'failed' })
      .set(bearer(monitoring));
    expect(failed.body.data).toHaveLength(1);
    const sms = await api()
      .get('/api/v1/admin/deliveries')
      .query({ channel: 'sms' })
      .set(bearer(monitoring));
    expect(sms.body.data.map((d: { status: string }) => d.status)).toEqual(['dry_run']);
    const first = await api()
      .get('/api/v1/admin/deliveries')
      .query({ limit: 2 })
      .set(bearer(monitoring));
    const next = await api()
      .get('/api/v1/admin/deliveries')
      .query({ limit: 2, cursor: first.body.meta.nextCursor })
      .set(bearer(monitoring));
    expect(next.body.data).toHaveLength(1);
    const seen = first.body.data.map((d: { id: string }) => d.id);
    expect(seen).not.toContain(next.body.data[0].id);
    expect(
      (
        await api()
          .get('/api/v1/admin/deliveries')
          .query({ status: 'lost' })
          .set(bearer(monitoring))
      ).status,
    ).toBe(422);
  });

  it('hides most of an address', () => {
    expect(maskAddress('rahim.uddin@example.org', 'email')).toBe('r***@example.org');
    expect(maskAddress('01712345678', 'sms')).toBe('017******78');
  });

  it('is for the global roles: 403 for a PM, 401 without a session', async () => {
    await api().get('/api/v1/admin/deliveries').set(bearer(pm)).expect(403);
    await api().get('/api/v1/admin/deliveries').expect(401);
  });
});
