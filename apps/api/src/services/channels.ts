import { type SmsProviderSetting, smsProviderSettingSchema } from '@css/shared/settings';
import type { Principal } from '../auth/principal';
import type { Env } from '../config/env';
import type { SettingsService } from './settings';

export interface ChannelsView {
  /** Read from the server's environment; the password never leaves the server. */
  smtp: { host: string; port: number; secure: boolean; from: string; loginSet: boolean };
  sms: {
    mode: Env['SMS_MODE'];
    /** Whether the provider's key is set in the server's environment; never the key. */
    keyPresent: boolean;
    config: SmsProviderSetting;
    updatedAt: string | null;
  };
  /** The fixed development code is on: real SMS and email must replace it before production. */
  otpDummy: boolean;
}

/**
 * The notification channels page (docs/DECISION_LOG.md, the admin and settings decision of
 * 2026-10-17): SMTP as the environment sets it, read-only; the provider-agnostic SMS adapter
 * configuration, kept as a setting; the state of the dummy OTP. No secret is ever answered.
 */
export class ChannelsService {
  constructor(
    private readonly env: Env,
    private readonly settings: SettingsService,
  ) {}

  async view(): Promise<ChannelsView> {
    const sms = await this.settings.entry('sms.provider');
    return {
      smtp: {
        host: this.env.SMTP_HOST,
        port: this.env.SMTP_PORT,
        secure: this.env.SMTP_SECURE,
        from: this.env.SMTP_FROM,
        loginSet: Boolean(this.env.SMTP_USER && this.env.SMTP_PASSWORD),
      },
      sms: {
        mode: this.env.SMS_MODE,
        keyPresent: Boolean(this.env.SMS_API_KEY),
        config: smsProviderSettingSchema.parse(sms.value),
        updatedAt: sms.updatedAt,
      },
      otpDummy: this.env.OTP_DUMMY_ENABLED,
    };
  }

  async setSms(actor: Principal, value: unknown): Promise<ChannelsView> {
    await this.settings.write(actor, 'sms.provider', value);
    return this.view();
  }
}
