import { randomUUID } from 'node:crypto';
import pino from 'pino';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  type Delivered,
  DeliveryError,
  type EmailAdapter,
  type EmailMessage,
  StubSmsAdapter,
} from '../../src/notifications/adapters';
import { NotificationDelivery, Throttle } from '../../src/notifications/delivery';
import { syncNotificationTemplates } from '../../src/notifications/template-sync';
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
function deliveryWith(email: EmailAdapter, perMinute = 600, logger = quiet, throttle?: Throttle) {
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
    throttle,
  );
}

const alertsTo = async (userId: string) =>
  (
    await h.db.query<{ count: number }>(
      `SELECT count FROM notifications WHERE template_key = 'ops_alert' AND user_id = $1`,
      [userId],
    )
  ).rows;

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
    const subjects = {
      bn: 'আপনাকে কাজ হস্তান্তর করা হয়েছে',
      en: 'Work has been handed over to you',
    } as const;
    for (const language of ['bn', 'en'] as const) {
      const person = await official(language);
      const id = await queueEmail(person.id, 'Rahim <script>alert(1)</script>');
      expect(await h.container.delivery.deliver({ messageId: id })).toBe('sent');
      // a redelivered job finds the row sent and sends nothing
      expect(await h.container.delivery.deliver({ messageId: id })).toBe('skipped');
      expect(await messageRow(id)).toMatchObject({ status: 'sent', attempts: 1 });
      const mails = await mailTo(person.email!);
      expect(mails).toHaveLength(1);
      expect(mails[0]!.Subject).toBe(subjects[language]);
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
    const jobsOf = async () =>
      (
        await h.db.query<{ singleton_key: string | null; wait: number }>(
          `SELECT singleton_key, extract(epoch FROM start_after - created_on)::int AS wait
             FROM pgboss.job WHERE name = 'notify' AND data->>'messageId' = $1`,
          [id],
        )
      ).rows;
    const retry = (await jobsOf()).find((j) => j.singleton_key === `${id}:1`);
    expect(retry?.wait).toBeGreaterThanOrEqual(29);

    // a job ahead of the next attempt sends nothing and leaves a job at the attempt's time
    const before = (await jobsOf()).length;
    expect(await delivery.deliver({ messageId: id })).toBe('skipped');
    expect(await jobsOf()).toHaveLength(before + 1);

    h.clock.advance(30_000);
    expect(await delivery.deliver({ messageId: id })).toBe('retry');
    row = await messageRow(id);
    expect(row.attempts).toBe(2);
    expect(row.next_attempt_at!.getTime() - h.clock.now().getTime()).toBe(120_000);

    // the next attempt would come after 24 hours from the queueing: this one is the last
    h.clock.advance(23 * 3_600_000 + 55 * 60_000);
    expect(await delivery.deliver({ messageId: id })).toBe('failed');
    expect(await messageRow(id)).toMatchObject({ status: 'failed', attempts: 3 });
    expect(await alertsTo(monitoring)).toHaveLength(1);
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
    // the alert of the test before is a day older on this clock: a second entry
    expect(await alertsTo(monitoring)).toHaveLength(2);
  });

  it('fails at once when the template of a message is missing', async () => {
    const person = await official('bn');
    const id = randomUUID();
    await h.container.prisma.outboundMessage.create({
      data: {
        id,
        eventId: randomUUID(),
        recipientUserId: person.id,
        address: person.email!,
        channel: 'email',
        templateKey: 'no_such_template',
        templateVersion: 1,
        params: {},
        idempotencyKey: `${id}:email`,
      },
    });
    const sent: EmailMessage[] = [];
    const delivery = deliveryWith({
      send: async (m) => {
        sent.push(m);
        return { providerMessageId: 'x' };
      },
    });
    expect(await delivery.deliver({ messageId: id })).toBe('failed');
    expect(sent).toEqual([]);
    expect((await messageRow(id)).last_error).toContain('no template');
  });

  it('keeps 60 s / EMAIL_PER_MINUTE between two emails', async () => {
    let t = 0;
    const sentAt: number[] = [];
    const recording: EmailAdapter = {
      send: async (_: EmailMessage): Promise<Delivered> => {
        sentAt.push(t);
        return { providerMessageId: randomUUID() };
      },
    };
    const throttle = new Throttle(
      60_000 / 300,
      () => t,
      async (ms) => {
        t += ms;
      },
    );
    const delivery = deliveryWith(recording, 300, quiet, throttle);
    const person = await official('bn');
    const first = await queueEmail(person.id);
    const second = await queueEmail(person.id);
    await delivery.deliver({ messageId: first });
    await delivery.deliver({ messageId: second });
    expect(sentAt).toHaveLength(2);
    expect(sentAt[1]! - sentAt[0]!).toBe(200);
  });
});

describe('the template sync of the deploy', () => {
  it('inserts nothing the second time and never overwrites an edited template', async () => {
    const url = h.container.env.DATABASE_URL;
    expect(await syncNotificationTemplates(url)).toBe(0);
    await h.db.query(
      `UPDATE notification_templates SET body = 'Edited by the admin'
        WHERE key = 'registration_approved' AND channel = 'in_app' AND locale = 'en'`,
    );
    await h.db.query(
      `DELETE FROM notification_templates WHERE key = 'registration_rejected' AND locale = 'bn'`,
    );
    expect(await syncNotificationTemplates(url)).toBe(1);
    const { rows } = await h.db.query<{ body: string }>(
      `SELECT body FROM notification_templates
        WHERE key = 'registration_approved' AND channel = 'in_app' AND locale = 'en'`,
    );
    expect(rows.map((r) => r.body)).toEqual(['Edited by the admin']);
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
