import type { Logger } from 'pino';
import { describe, expect, it, vi } from 'vitest';
import type { PrismaService } from '../core/prisma.service.js';
import { DirectDeliveries } from './direct-deliveries.js';

const NOW = new Date('2026-11-24T06:00:00Z');
const clock = { now: () => NOW };

/** A database whose message table records what it is given, or refuses it. */
function fakeDb(refuse = false) {
  const created: Record<string, unknown>[] = [];
  const db = {
    outboundMessage: {
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
        if (refuse) throw new Error('database down');
        created.push(data);
        return data;
      }),
    },
  } as unknown as PrismaService;
  return { db, created };
}

// The record of a message sent at once (a one-time code, a set-password link), kept for the
// deliveries page without the code, the link or the text.
describe('the record of a message sent at once', () => {
  it('keeps who and where, sent now, with no values of the message', async () => {
    const { db, created } = fakeDb();
    await new DirectDeliveries(db, clock).record({
      templateKey: 'staff_invitation',
      channel: 'email',
      address: 'new.official@example.org',
      recipientUserId: '01900000-0000-7000-8000-000000000001',
      status: 'sent',
    });
    expect(created).toHaveLength(1);
    expect(created[0]).toMatchObject({
      templateKey: 'staff_invitation',
      channel: 'email',
      status: 'sent',
      params: {},
      attempts: 1,
      sentAt: NOW,
      lastError: null,
    });
    expect(String(created[0]!.idempotencyKey)).toMatch(/^direct:/);
  });

  it('marks the dummy code as not sent, with no attempt and no send time', async () => {
    const { db, created } = fakeDb();
    await new DirectDeliveries(db, clock).record({
      templateKey: 'otp_registration_email',
      channel: 'email',
      address: 'someone@example.org',
      status: 'dry_run',
    });
    expect(created[0]).toMatchObject({ status: 'dry_run', attempts: 0, sentAt: null });
  });

  it('never stops the message when the record cannot be written, and logs no address', async () => {
    const { db } = fakeDb(true);
    const warn = vi.fn();
    const logger = { warn } as unknown as Logger;
    await expect(
      new DirectDeliveries(db, clock, logger).record({
        templateKey: 'otp_password_reset',
        channel: 'sms',
        address: '01700000001',
        status: 'failed',
        error: 'provider_error',
      }),
    ).resolves.toBeUndefined();
    expect(warn).toHaveBeenCalledOnce();
    expect(JSON.stringify(warn.mock.calls)).not.toContain('01700000001');
  });
});
