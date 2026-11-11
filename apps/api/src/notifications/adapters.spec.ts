import { createTransport } from 'nodemailer';
import pino from 'pino';
import { describe, expect, it, vi } from 'vitest';
import {
  classifySmtpError,
  DeliveryError,
  maskMobile,
  SmtpEmailAdapter,
  StubSmsAdapter,
} from './adapters.js';

const smtp = { host: 'unused', port: 25, secure: false, from: 'CSS ERP <no-reply@example.org>' };

describe('notification adapters', () => {
  it('sends email through the transport and returns the message id', async () => {
    const adapter = new SmtpEmailAdapter(smtp, createTransport({ jsonTransport: true }));
    const result = await adapter.send({
      to: 'official@example.org',
      subject: 'Subject',
      text: 'Body',
    });
    expect(result.providerMessageId).toMatch(/@/);
  });

  it('classifies SMTP failures as transient or permanent', async () => {
    expect(classifySmtpError({ responseCode: 421 })).toMatchObject({ kind: 'transient' });
    expect(classifySmtpError({ responseCode: 550 })).toMatchObject({ kind: 'permanent' });
    expect(classifySmtpError({ code: 'ECONNREFUSED' })).toMatchObject({ kind: 'transient' });
    expect(classifySmtpError(new Error('bad address'))).toMatchObject({ kind: 'permanent' });
    const failing = { sendMail: vi.fn().mockRejectedValue({ responseCode: 451 }) };
    const adapter = new SmtpEmailAdapter(smtp, failing as never);
    await expect(
      adapter.send({ to: 'x@example.org', subject: 's', text: 't' }),
    ).rejects.toBeInstanceOf(DeliveryError);
  });

  it('masks mobile numbers and never logs the SMS text (it may hold an OTP)', async () => {
    expect(maskMobile('01700000001')).toBe('017******01');
    const lines: string[] = [];
    const logger = pino({ level: 'info' }, { write: (line: string) => void lines.push(line) });
    const logging = new StubSmsAdapter('logging', logger);
    const result = await logging.send({ to: '01700000001', body: 'Your code is 482913' });
    expect(result.providerMessageId).toMatch(/^logging:/);
    // the stub sends nothing: the outbox marks the message as a dry run
    expect(result.dryRun).toBe(true);
    const line = lines.join('\n');
    expect(line).toContain('017******01');
    expect(line).not.toContain('482913');
    expect(line).not.toContain('01700000001');
    expect(
      (await new StubSmsAdapter('dry_run', logger).send({ to: '01700000001', body: 'x' }))
        .providerMessageId,
    ).toMatch(/^dry_run:/);
    expect(lines).toHaveLength(1);
  });
});
