import type { Logger } from 'pino';
import { describe, expect, it, vi } from 'vitest';
import type { Env } from '../config/env.js';
import type { EmailAdapter, SmsAdapter } from '../notifications/adapters.js';
import type { DirectDelivery, DirectDeliveries } from '../notifications/direct-deliveries.js';
import { OtpDeliveryService } from './otp.service.js';

const env = { OTP_DUMMY_ENABLED: false } as Env;
const logger = { info: vi.fn() } as unknown as Logger;

/** The deliveries page's record, kept in memory. */
function recorder() {
  const records: DirectDelivery[] = [];
  const deliveries = {
    record: vi.fn(async (d: DirectDelivery) => {
      records.push(d);
    }),
  } as unknown as DirectDeliveries;
  return { records, deliveries };
}

class ProviderRefused extends Error {
  override name = 'ProviderRefused';
}

// Each real one-time code is listed on the deliveries page as sent or failed, never with the code.
describe('the record of a one-time code', () => {
  it('lists a code the provider took as sent, without the code', async () => {
    const { records, deliveries } = recorder();
    const sms = { send: vi.fn(async () => ({})) } as unknown as SmsAdapter;
    const email = { send: vi.fn() } as unknown as EmailAdapter;
    await new OtpDeliveryService(env, sms, email, logger, deliveries).deliver(
      { purpose: 'password_reset', channel: 'sms', address: '01700000001' },
      '482913',
      'bn',
      'otp_password_reset',
    );
    expect(sms.send).toHaveBeenCalledOnce();
    expect(records).toEqual([
      {
        templateKey: 'otp_password_reset',
        channel: 'sms',
        address: '01700000001',
        status: 'sent',
      },
    ]);
    expect(JSON.stringify(records)).not.toContain('482913');
  });

  it('lists a code the provider refused as failed with the error class, and still fails the send', async () => {
    const { records, deliveries } = recorder();
    const sms = { send: vi.fn() } as unknown as SmsAdapter;
    const email = {
      send: vi.fn(async () => {
        throw new ProviderRefused('550 mailbox unavailable');
      }),
    } as unknown as EmailAdapter;
    await expect(
      new OtpDeliveryService(env, sms, email, logger, deliveries).deliver(
        { purpose: 'registration', channel: 'email', address: 'someone@example.org' },
        '482913',
        'en',
        'otp_registration_email',
      ),
    ).rejects.toThrow(ProviderRefused);
    expect(records).toEqual([
      {
        templateKey: 'otp_registration_email',
        channel: 'email',
        address: 'someone@example.org',
        status: 'failed',
        error: 'ProviderRefused',
      },
    ]);
  });
});
