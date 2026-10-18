import { randomUUID } from 'node:crypto';
import { NOTIFICATION_TEMPLATES } from '@css/shared';
import { renderNotification } from '@css/shared/i18n';
import pino from 'pino';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  type Delivered,
  DeliveryError,
  type EmailAdapter,
  type EmailMessage,
  StubSmsAdapter,
} from '../../src/notifications/adapters';
import { NotificationDelivery } from '../../src/notifications/delivery';
import { account, type AuthHarness, authHarness } from './support/auth-app';

// The `notify` consumer: sends each queued message once, retries transient failures on its
// schedule, stops on permanent ones and alerts the Monitoring Team when a message fails for good
// (docs/architecture/NOTIFICATIONS.md, delivery and outbox). Email reaches Mailpit through SMTP.
const mailpit = {
  host: process.env.MAILPIT_TEST_HOST ?? '127.0.0.1',
  apiPort: Number(process.env.MAILPIT_TEST_API_PORT ?? 8025),
};
const quiet = pino({ level: 'silent' });

let h: AuthHarness;
let monitoring: string;

beforeAll(async () => {
  h = await authHarness();
  monitoring = (await account(h.db, { role: 'monitoring_team' })).id;
});
afterAll(async () => h.close());

/** An official in a language, with an email address. */
async function official(language: 'bn' | 'en') {
  const person = await account(h.db, { role: 'regional_program_manager' });
  await h.db.query('UPDATE users SET language = $2 WHERE id = $1', [person.id, language]);
  return person;
}

/** Queues one handover email to a person and returns its outbox id. */
async function queueEmail(userId: string, fromName = 'নমুনা অফিসিয়াল'): Promise<string> {
  await h.container.prisma.$transaction((tx) =>
    h.container.notifications.publish(tx, {
      key: 'handover_items_assigned',
      recipients: [{ user: userId }],
      params: { from_name: fromName, count: 2 },
      about: randomUUID(),
    }),
  );
  const { rows } = await h.db.query<{ id: string }>(
    `SELECT id FROM outbound_messages WHERE recipient_user_id = $1 ORDER BY created_at DESC LIMIT 1`,
    [userId],
  );
  return rows[0]!.id;
}

const messageRow = async (id: string) =>
  (
    await h.db.query<{
      status: string;
      attempts: number;
      next_attempt_at: Date | null;
      last_error: string | null;
      sent_at: Date | null;
    }>(
      'SELECT status, attempts, next_attempt_at, last_error, sent_at FROM outbound_messages WHERE id = $1',
      [id],
    )
  ).rows[0]!;

/** A delivery with its own adapters and send rate, on the harness clock. */
function deliveryWith(email: EmailAdapter, perMinute = 600, logger = quiet) {
  const c = h.container;
  return new NotificationDelivery(
    c.prisma,
    email,
    new StubSmsAdapter('logging', logger),
    c.jobs,
    c.notifications,
    c.clock,
    logger,
    perMinute,
  );
}

const failing = (kind: 'transient' | 'permanent', message: string): EmailAdapter => ({
  send: async () => {
    throw new DeliveryError(kind, message);
  },
});

async function mailTo(address: string) {
  const res = await fetch(
    `http://${mailpit.host}:${mailpit.apiPort}/api/v1/search?query=${encodeURIComponent(`to:"${address}"`)}`,
  );
  const found = (await res.json()) as { messages: { ID: string; Subject: string }[] };
  return found.messages;
}

describe('delivering a queued email', () => {
  it('reaches Mailpit in the recipient language with the right subject, and only once', async () => {
    const template = NOTIFICATION_TEMPLATES.find((t) => t.key === 'handover_items_assigned')!;
    for (const language of ['bn', 'en'] as const) {
      const person = await official(language);
      const id = await queueEmail(person.id, 'Rahim <script>alert(1)</script>');
      expect(await h.container.delivery.deliver({ messageId: id })).toBe('sent');
      // a redelivered job finds the row sent and sends nothing
      expect(await h.container.delivery.deliver({ messageId: id })).toBe('skipped');
      expect(await messageRow(id)).toMatchObject({ status: 'sent', attempts: 1 });
      const expected = renderNotification(template, 'email', language, {
        from_name: 'x',
        count: 2,
      }).subject;
      const mails = await mailTo(person.email!);
      expect(mails).toHaveLength(1);
      expect(mails[0]!.Subject).toBe(expected);
      const res = await fetch(
        `http://${mailpit.host}:${mailpit.apiPort}/api/v1/message/${mails[0]!.ID}`,
      );
      const message = (await res.json()) as { HTML: string; Text: string };
      expect(message.HTML).toContain('&lt;script&gt;');
      expect(message.HTML).not.toContain('<script>');
    }
  });

  it('retries a transient failure after 30 s, then 2 min, and fails for good after 24 hours', async () => {
    const person = await official('bn');
    const id = await queueEmail(person.id);
    const delivery = deliveryWith(failing('transient', `451 mailbox busy for ${person.email}`));
    const start = h.clock.now().getTime();

    expect(await delivery.deliver({ messageId: id })).toBe('retry');
    let row = await messageRow(id);
    expect(row).toMatchObject({ status: 'queued', attempts: 1 });
    expect(row.next_attempt_at!.getTime() - start).toBe(30_000);
    expect(row.last_error).not.toContain(person.email!);
    const { rows: jobs } = await h.db.query(
      `SELECT start_after FROM pgboss.job WHERE name = 'notify' AND singleton_key = $1`,
      [`${id}:1`],
    );
    expect(jobs).toHaveLength(1);

    // an older job of the same message, before the next attempt is due, does nothing
    expect(await delivery.deliver({ messageId: id })).toBe('skipped');

    h.clock.advance(30_000);
    expect(await delivery.deliver({ messageId: id })).toBe('retry');
    row = await messageRow(id);
    expect(row.attempts).toBe(2);
    expect(row.next_attempt_at!.getTime() - h.clock.now().getTime()).toBe(120_000);

    h.clock.advance(24 * 3_600_000);
    expect(await delivery.deliver({ messageId: id })).toBe('failed');
    expect(await messageRow(id)).toMatchObject({ status: 'failed', attempts: 3 });
    const { rows: alerts } = await h.db.query(
      `SELECT user_id FROM notifications WHERE template_key = 'ops_alert'`,
    );
    expect(alerts.map((a) => a.user_id)).toContain(monitoring);
  });

  it('stops at once on a permanent failure and stores the error without the address', async () => {
    const person = await official('en');
    const id = await queueEmail(person.id);
    const delivery = deliveryWith(failing('permanent', `550 5.1.1 <${person.email}> unknown`));
    expect(await delivery.deliver({ messageId: id })).toBe('failed');
    const row = await messageRow(id);
    expect(row).toMatchObject({ status: 'failed', attempts: 1, next_attempt_at: null });
    expect(row.last_error).toContain('[address]');
    expect(row.last_error).not.toContain(person.email!);
  });

  it('keeps 60 s / EMAIL_PER_MINUTE between two emails', async () => {
    const sentAt: number[] = [];
    const recording: EmailAdapter = {
      send: async (_: EmailMessage): Promise<Delivered> => {
        sentAt.push(Date.now());
        return { providerMessageId: randomUUID() };
      },
    };
    const delivery = deliveryWith(recording, 300);
    const person = await official('bn');
    const first = await queueEmail(person.id);
    const second = await queueEmail(person.id);
    await delivery.deliver({ messageId: first });
    await delivery.deliver({ messageId: second });
    expect(sentAt).toHaveLength(2);
    // 60 s / 300 = 200 ms (a timer may fire a few ms early)
    expect(sentAt[1]! - sentAt[0]!).toBeGreaterThanOrEqual(195);
  });
});

describe('delivering a queued SMS', () => {
  it('ends as a dry run through the stub, its text never logged', async () => {
    const lines: string[] = [];
    const logger = pino({ level: 'info' }, { write: (line: string) => void lines.push(line) });
    const person = await account(h.db, { kind: 'volunteer' });
    const id = randomUUID();
    await h.container.prisma.outboundMessage.create({
      data: {
        id,
        eventId: randomUUID(),
        recipientUserId: person.id,
        address: person.mobile,
        channel: 'sms',
        templateKey: 'otp_registration_sms',
        templateVersion: 1,
        params: { code: '975310', minutes: '5' },
        idempotencyKey: `${id}:sms`,
      },
    });
    const delivery = deliveryWith(failing('permanent', 'unused'), 600, logger);
    expect(await delivery.deliver({ messageId: id })).toBe('dry_run');
    expect(await messageRow(id)).toMatchObject({ status: 'dry_run', attempts: 1 });
    expect(lines.join('\n')).not.toContain('975310');
    expect(lines.join('\n')).not.toContain(person.mobile);
  });
});
