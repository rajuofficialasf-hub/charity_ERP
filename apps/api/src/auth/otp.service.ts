import { createHmac, randomInt, timingSafeEqual } from 'node:crypto';
import type { Logger } from 'pino';
import { uuidv7 } from '@css/shared';
import { type Locale } from '@css/shared/i18n';
import { NOTIFICATION_TEMPLATES } from '@css/shared';
import { renderNotification } from '@css/shared/i18n';
import type { Env } from '../config/env';
import type { Clock } from '../core/clock';
import { type PrismaService } from '../core/prisma.service';
import { ApiError } from '../i18n/api-error';
import type { EmailAdapter, SmsAdapter } from '../notifications/adapters';

/** OTP parameters (AUTH.md 2). */
export const OTP_RULES = {
  validMs: 5 * 60_000,
  maxAttempts: 5,
  maxRequestsPerHour: 5,
} as const;

export type OtpPurpose = 'registration' | 'password_reset' | 'contact_change';
export type OtpChannel = 'sms' | 'email';

export interface OtpTarget {
  purpose: OtpPurpose;
  channel: OtpChannel;
  /** Mobile number or lower-case email the code goes to. */
  address: string;
}

/** HMAC of an identifier under OTP_SECRET: OTP addresses and the login id in audit entries. */
export function identifierHash(env: Env, value: string): string {
  return createHmac('sha256', env.OTP_SECRET).update(`id:${value}`).digest('base64url');
}

/** The start-up line: a loud warning whenever the dummy OTP is on (server.ts). */
export function otpStartupMessage(dummy: boolean): { level: 'warn' | 'info'; text: string } {
  if (!dummy) return { level: 'info', text: 'OTP mode: real (SMS and email adapters)' };
  const line = '*'.repeat(72);
  return {
    level: 'warn',
    text: [
      line,
      '* OTP MODE: DUMMY. Every OTP is the fixed code from OTP_DUMMY_CODE.',
      '* Development and test only. Never use this configuration with real users.',
      line,
    ].join('\n'),
  };
}

/**
 * Delivery of an OTP (NOTIFICATIONS 9, AUTH.md 2.1): the dummy path sends nothing and accepts the
 * configured fixed code (development and test only, refused in production by the configuration);
 * the real path renders the bilingual template and sends through the SMS or email adapter.
 */
export class OtpDeliveryService {
  constructor(
    private readonly env: Env,
    private readonly sms: SmsAdapter,
    private readonly email: EmailAdapter,
    private readonly logger: Logger,
  ) {}

  get dummy(): boolean {
    return this.env.OTP_DUMMY_ENABLED;
  }

  /** The code to issue: the fixed dummy code, or six random digits. */
  newCode(): string {
    if (this.dummy && this.env.OTP_DUMMY_CODE) return this.env.OTP_DUMMY_CODE;
    return randomInt(0, 1_000_000).toString().padStart(6, '0');
  }

  async deliver(
    target: OtpTarget,
    code: string,
    locale: Locale,
    templateKey: string,
  ): Promise<void> {
    if (this.dummy) {
      this.logger.info(
        { purpose: target.purpose, channel: target.channel },
        'dummy OTP issued; nothing sent',
      );
      return;
    }
    const template = NOTIFICATION_TEMPLATES.find((t) => t.key === templateKey);
    if (!template) throw new Error(`notification template ${templateKey} missing`);
    const text = renderNotification(template, target.channel, locale, {
      code,
      minutes: String(OTP_RULES.validMs / 60_000),
    });
    if (target.channel === 'sms') await this.sms.send({ to: target.address, body: text.body });
    else
      await this.email.send({ to: target.address, subject: text.subject ?? '', text: text.body });
  }
}

/**
 * One-time codes (AUTH.md 2): 6 digits, valid 5 minutes, at most 5 verification attempts
 * per code and 5 requests per address and hour; codes and addresses are stored only as HMACs and
 * a code is used once. A failed attempt is committed even though the request then fails.
 */
export class OtpService {
  constructor(
    private readonly env: Env,
    private readonly prisma: PrismaService,
    private readonly clock: Clock,
    private readonly delivery: OtpDeliveryService,
  ) {}

  private codeHash(id: string, code: string): string {
    return createHmac('sha256', this.env.OTP_SECRET)
      .update(`otp:${id}:${code}`)
      .digest('base64url');
  }

  /** Issues and delivers a code; more than 5 requests per address and hour are refused (429). */
  async issue(
    target: OtpTarget,
    options: { locale: Locale; templateKey: string; createdBy?: string | null },
  ): Promise<void> {
    const now = this.clock.now();
    const addressHash = identifierHash(this.env, target.address);
    const recent = await this.prisma.otpCode.count({
      where: {
        addressHash,
        purpose: target.purpose,
        createdAt: { gt: new Date(now.getTime() - 3_600_000) },
      },
    });
    if (recent >= OTP_RULES.maxRequestsPerHour) throw new ApiError('rate_limit.exceeded', 429);
    const id = uuidv7();
    const code = this.delivery.newCode();
    await this.prisma.otpCode.create({
      data: {
        id,
        purpose: target.purpose,
        channel: target.channel,
        addressHash,
        codeHash: this.codeHash(id, code),
        expiresAt: new Date(now.getTime() + OTP_RULES.validMs),
        createdAt: now,
        createdBy: options.createdBy ?? null,
      },
    });
    await this.delivery.deliver(target, code, options.locale, options.templateKey);
  }

  /**
   * Checks a code against the newest unused code of the address. Wrong code: the attempt is
   * counted and `otp.invalid` (or `otp.attempts_exceeded` at the fifth) is thrown; expired:
   * `otp.expired`. A correct code is returned as an id for `consume` inside the caller's
   * transaction, so a later validation failure does not use it up.
   */
  async check(target: Omit<OtpTarget, 'channel'>, code: string): Promise<string> {
    const now = this.clock.now();
    const row = await this.prisma.otpCode.findFirst({
      where: {
        addressHash: identifierHash(this.env, target.address),
        purpose: target.purpose,
        consumedAt: null,
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    });
    if (!row) throw new ApiError('otp.invalid', 422);
    if (row.expiresAt <= now) throw new ApiError('otp.expired', 422);
    // The attempt is reserved before the comparison, in one conditional UPDATE, so parallel
    // guesses cannot all pass the cap on the same stale count.
    const reserved = await this.prisma.otpCode.updateMany({
      where: { id: row.id, attempts: { lt: OTP_RULES.maxAttempts }, consumedAt: null },
      data: { attempts: { increment: 1 } },
    });
    if (reserved.count === 0) throw new ApiError('otp.attempts_exceeded', 429);
    const expected = Buffer.from(row.codeHash);
    const given = Buffer.from(this.codeHash(row.id, code));
    if (expected.length === given.length && timingSafeEqual(expected, given)) return row.id;
    const after = await this.prisma.otpCode.findUnique({
      where: { id: row.id },
      select: { attempts: true },
    });
    if ((after?.attempts ?? OTP_RULES.maxAttempts) >= OTP_RULES.maxAttempts)
      throw new ApiError('otp.attempts_exceeded', 429);
    throw new ApiError('otp.invalid', 422);
  }

  /** Marks a checked code as used inside the caller's transaction; false when already used. */
  async consume(tx: Pick<PrismaService, 'otpCode'>, id: string): Promise<boolean> {
    const result = await tx.otpCode.updateMany({
      where: { id, consumedAt: null },
      data: { consumedAt: this.clock.now() },
    });
    return result.count === 1;
  }
}
