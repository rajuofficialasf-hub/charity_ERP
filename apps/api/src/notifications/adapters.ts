import { uuidv7 } from '@css/shared';
import { createTransport, type Transporter } from 'nodemailer';
import type { Logger } from 'pino';
import type { Tx } from '../core/prisma.service';
import type { Prisma } from '../generated/prisma/client';

/**
 * Delivery adapters of the notifications module (ADR-007, NOTIFICATIONS): narrow interfaces, no
 * templates (T1.14 renders texts and runs the outbox). Every adapter returns a provider message id
 * or throws a DeliveryError that tells the outbox worker whether a retry can help.
 */
export class DeliveryError extends Error {
  constructor(
    readonly kind: 'transient' | 'permanent',
    message: string,
  ) {
    super(message);
    this.name = 'DeliveryError';
  }
}

export interface EmailMessage {
  to: string;
  subject: string;
  text: string;
  html?: string;
}

export interface SmsMessage {
  to: string;
  body: string;
}

export interface Delivered {
  providerMessageId: string;
}

export interface EmailAdapter {
  send(message: EmailMessage): Promise<Delivered>;
}

export interface SmsAdapter {
  send(message: SmsMessage): Promise<Delivered>;
}

/** SMTP status classes and network errors that a later attempt can overcome. */
export function classifySmtpError(error: unknown): DeliveryError {
  const e = error as { responseCode?: number; code?: string; message?: string };
  const transientCodes = [
    'ECONNREFUSED',
    'ECONNRESET',
    'ETIMEDOUT',
    'ESOCKET',
    'ECONNECTION',
    'EDNS',
  ];
  if (e.responseCode !== undefined)
    return new DeliveryError(
      e.responseCode >= 500 ? 'permanent' : 'transient',
      `smtp ${e.responseCode}`,
    );
  if (e.code && transientCodes.includes(e.code))
    return new DeliveryError('transient', `smtp ${e.code}`);
  return new DeliveryError('permanent', 'smtp error');
}

export interface SmtpOptions {
  host: string;
  port: number;
  secure: boolean;
  user?: string;
  password?: string;
  from: string;
}

/** Email over the organization's SMTP with Nodemailer (Mailpit in development). */
export class SmtpEmailAdapter implements EmailAdapter {
  private readonly transport: Transporter;

  constructor(
    private readonly options: SmtpOptions,
    transport?: Transporter,
  ) {
    this.transport =
      transport ??
      createTransport({
        host: options.host,
        port: options.port,
        secure: options.secure,
        // an unreachable server fails within seconds, not after the library's two minutes
        connectionTimeout: 10_000,
        greetingTimeout: 10_000,
        socketTimeout: 30_000,
        ...(options.user ? { auth: { user: options.user, pass: options.password } } : {}),
      });
  }

  async send(message: EmailMessage): Promise<Delivered> {
    try {
      const info = await this.transport.sendMail({ from: this.options.from, ...message });
      return { providerMessageId: String(info.messageId) };
    } catch (error) {
      throw classifySmtpError(error);
    }
  }
}

/** A mobile number with only its first three and last two digits visible. */
export function maskMobile(mobile: string): string {
  return mobile.length <= 5
    ? '*'.repeat(mobile.length)
    : `${mobile.slice(0, 3)}${'*'.repeat(mobile.length - 5)}${mobile.slice(-2)}`;
}

/**
 * The SMS adapter until a provider is chosen (O-33): `logging` writes a masked line in development
 * and tests, `dry_run` accepts silently on staging. Neither logs the text (it may hold an OTP).
 */
export class StubSmsAdapter implements SmsAdapter {
  constructor(
    private readonly mode: 'logging' | 'dry_run',
    private readonly logger: Logger,
  ) {}

  async send(message: SmsMessage): Promise<Delivered> {
    const id = `${this.mode}:${uuidv7()}`;
    if (this.mode === 'logging')
      this.logger.info(
        { to: maskMobile(message.to), characters: message.body.length, id },
        'sms (stub)',
      );
    return { providerMessageId: id };
  }
}

export interface InAppMessage {
  userId: string;
  templateKey: string;
  params: Prisma.InputJsonValue;
  coalesceKey?: string;
  createdBy?: string;
}

/**
 * In-app notifications (NOTIFICATIONS 7): a `notifications` row with the template key and its
 * parameters, never rendered text, so the inbox follows the reader's language (I18N 5). Written
 * inside the business transaction.
 */
export class InAppAdapter {
  async deliver(tx: Tx, message: InAppMessage): Promise<Delivered> {
    const id = uuidv7();
    await tx.notification.create({
      data: {
        id,
        userId: message.userId,
        templateKey: message.templateKey,
        params: message.params,
        coalesceKey: message.coalesceKey ?? null,
        createdBy: message.createdBy ?? null,
      },
    });
    return { providerMessageId: id };
  }
}
