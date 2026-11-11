import { randomUUID } from 'node:crypto';
import type { Client } from 'pg';
import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest';
import { PrismaService } from '../../src/core/prisma.service.js';
import { InAppAdapter, SmtpEmailAdapter } from '../../src/notifications/adapters.js';
import { testEnv } from '../support/env.js';
import { cloneTemplate } from './support/db.js';
import { user } from './support/fixtures.js';

// In-app notifications are rows with template key and parameters
// (docs/architecture/NOTIFICATIONS.md, "Delivery, outbox, retries and status"); email reaches
// Mailpit through SMTP (docker compose locally, a service container in CI).
const mailpit = {
  host: process.env.MAILPIT_TEST_HOST ?? '127.0.0.1',
  smtpPort: Number(process.env.MAILPIT_TEST_SMTP_PORT ?? 1025),
  apiPort: Number(process.env.MAILPIT_TEST_API_PORT ?? 8025),
};
let db: Client;
let drop: () => Promise<void>;
let prisma: PrismaService;

beforeAll(async () => {
  const clone = await cloneTemplate(inject('templateDb'));
  db = clone.client;
  drop = clone.drop;
  prisma = new PrismaService(testEnv({ DATABASE_URL: clone.url }));
});

afterAll(async () => {
  await prisma.$disconnect();
  await drop();
});

describe('InAppAdapter', () => {
  it('writes a notification row with the template key and parameters, not rendered text', async () => {
    const recipient = await user(db);
    const result = await prisma.$transaction((tx) =>
      new InAppAdapter().deliver(tx, {
        userId: recipient,
        templateKey: 'registration_approved',
        params: { project: 'WNT' },
      }),
    );
    const row = await db.query(
      'select user_id, template_key, params, read_at from notifications where id = $1',
      [result.providerMessageId],
    );
    expect(row.rows[0]).toEqual({
      user_id: recipient,
      template_key: 'registration_approved',
      params: { project: 'WNT' },
      read_at: null,
    });
  });
});

describe('SmtpEmailAdapter with Mailpit', () => {
  it('delivers the message to the SMTP server', async () => {
    const subject = `smtp check ${randomUUID()}`;
    const adapter = new SmtpEmailAdapter({
      host: mailpit.host,
      port: mailpit.smtpPort,
      secure: false,
      from: 'CSS ERP <no-reply@example.org>',
    });
    const sent = await adapter.send({
      to: 'official@example.org',
      subject,
      text: 'Plain text body',
    });
    expect(sent.providerMessageId).toBeTruthy();
    const search = await fetch(
      `http://${mailpit.host}:${mailpit.apiPort}/api/v1/search?query=${encodeURIComponent(`subject:"${subject}"`)}`,
    );
    const found = (await search.json()) as {
      messages: { Subject: string; To: { Address: string }[] }[];
    };
    expect(found.messages).toHaveLength(1);
    expect(found.messages[0]).toMatchObject({
      Subject: subject,
      To: [{ Address: 'official@example.org' }],
    });
  });
});
