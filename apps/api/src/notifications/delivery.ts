import {
  type Locale,
  type NotificationParam,
  recipientLocale,
  renderTemplateText,
  type TemplateText,
} from '@css/shared/i18n';
import type { Logger } from 'pino';
import type { Clock } from '../core/clock';
import type { PrismaService, Tx } from '../core/prisma.service';
import type { JobRunner } from '../jobs/job-runner';
import {
  type Delivered,
  DeliveryError,
  type EmailAdapter,
  type EmailMessage,
  type SmsAdapter,
} from './adapters';
import { EMAIL_PRIORITY, NOTIFICATION_CATALOGUE } from './catalogue';
import { MONITORING } from './recipients';
import type { DeliveryJob, NotificationService } from './service';

/** The waits after the first, second, third and fourth failed attempt; hourly after that. */
export const RETRY_DELAYS_MS: readonly number[] = [30_000, 2 * 60_000, 10 * 60_000, 60 * 60_000];
const HOURLY_MS = 60 * 60_000;
/** A message still failing this long after it was queued fails for good. */
export const GIVE_UP_MS = 24 * 60 * 60_000;
/** A job may start this much before its row's next attempt (clocks of two machines). */
const EARLY_MS = 5_000;

/** The wait before the next attempt after `attempts` failed ones. */
export function retryDelay(attempts: number): number {
  return RETRY_DELAYS_MS[attempts - 1] ?? HOURLY_MS;
}

const ADDRESS = /[^\s<>"'(),;:@]+@[^\s<>"'(),;:@]+/g;
const NUMBER = /\+?\d[\d\s-]{6,}\d/g;

/** An error as stored on the row: no address, no phone number, one line, bounded. */
export function safeError(message: string): string {
  return message
    .replace(ADDRESS, '[address]')
    .replace(NUMBER, '[number]')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 300);
}

const HTML_ENTITIES: ReadonlyMap<string, string> = new Map([
  ['&', '&amp;'],
  ['<', '&lt;'],
  ['>', '&gt;'],
  ['"', '&quot;'],
  ["'", '&#39;'],
]);

export function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (c) => HTML_ENTITIES.get(c) ?? c);
}

/** A header value on one line: a newline in a value never starts another header. */
const oneLine = (text: string) => text.replace(/[\r\n\v\f\u0085\p{Zl}\p{Zp}]+/gu, ' ').trim();

/** Keeps at least `gapMs` between two sends of this process. */
export class Throttle {
  private next = 0;

  constructor(
    private readonly gapMs: number,
    private readonly sleep: (ms: number) => Promise<void> = (ms) =>
      new Promise((resolve) => setTimeout(resolve, ms)),
  ) {}

  async wait(): Promise<void> {
    const now = Date.now();
    const at = Math.max(now, this.next);
    this.next = at + this.gapMs;
    if (at > now) await this.sleep(at - now);
  }
}

/**
 * One message from a template version: the subject on one line, the text as rendered, and an HTML
 * part in which everything, the values above all, is escaped.
 */
export function composeEmail(
  key: string,
  template: TemplateText & { variables: readonly string[] },
  locale: Locale,
  params: Record<string, NotificationParam>,
  to: string,
): EmailMessage {
  const text = renderTemplateText(key, template, template.variables, locale, params);
  const body = escapeHtml(text.body).replace(/\n/g, '<br>');
  return {
    to,
    subject: oneLine(text.subject ?? text.title ?? key),
    text: text.body,
    html: `<!doctype html><html lang="${locale}"><body><p>${body}</p></body></html>`,
  };
}

export type DeliveryOutcome = 'sent' | 'dry_run' | 'retry' | 'failed' | 'skipped';

interface QueuedRow {
  id: string;
  channel: string;
  address: string;
  templateKey: string;
  templateVersion: number;
  params: unknown;
  attempts: number;
  createdAt: Date;
  recipientUser: { language: string | null } | null;
}

/**
 * The `notify` consumer (docs/architecture/NOTIFICATIONS.md, delivery and outbox): sends one
 * queued email or SMS, rendered from the template version stored on the row in the recipient's
 * language. The row stays locked while it is sent, so a redelivered job never sends a `sent` row
 * again. A transient failure schedules the next attempt itself (30 s, 2 min, 10 min, 1 h, then
 * hourly, up to 24 hours); a permanent one stops at once; a message that fails for good raises an
 * in-app operations alert to the Monitoring Team. Emails leave one at a time, at most
 * `EMAIL_PER_MINUTE` a minute.
 */
export class NotificationDelivery {
  private readonly throttle: Throttle;

  constructor(
    private readonly prisma: PrismaService,
    private readonly email: EmailAdapter,
    private readonly sms: SmsAdapter,
    private readonly jobs: JobRunner,
    private readonly notifications: NotificationService,
    private readonly clock: Clock,
    private readonly logger: Logger,
    emailsPerMinute: number,
  ) {
    this.throttle = new Throttle(Math.ceil(60_000 / emailsPerMinute));
  }

  async deliver(job: DeliveryJob): Promise<DeliveryOutcome> {
    const peek = await this.prisma.outboundMessage.findUnique({
      where: { id: job.messageId },
      select: { channel: true, status: true },
    });
    if (peek?.status !== 'queued') return 'skipped';
    if (peek.channel === 'email') await this.throttle.wait();
    // the provider call runs inside the lock; its own timeouts end well within this one
    return this.prisma.$transaction((tx) => this.attempt(tx, job.messageId), {
      maxWait: 10_000,
      timeout: 90_000,
    });
  }

  private async attempt(tx: Tx, messageId: string): Promise<DeliveryOutcome> {
    const locked = await tx.$queryRaw<{ status: string; next_attempt_at: Date | null }[]>`
      SELECT status, next_attempt_at FROM outbound_messages
      WHERE id = ${messageId}::uuid FOR UPDATE SKIP LOCKED`;
    const now = this.clock.now();
    const head = locked[0];
    if (head?.status !== 'queued') return 'skipped';
    // an older job of a message that already waits for its next attempt
    if (head.next_attempt_at && head.next_attempt_at.getTime() > now.getTime() + EARLY_MS)
      return 'skipped';
    const row = await tx.outboundMessage.findUniqueOrThrow({
      where: { id: messageId },
      select: {
        id: true,
        channel: true,
        address: true,
        templateKey: true,
        templateVersion: true,
        params: true,
        attempts: true,
        createdAt: true,
        recipientUser: { select: { language: true } },
      },
    });
    let delivered: Delivered;
    try {
      delivered = await this.send(row, await this.render(tx, row));
    } catch (error) {
      const failure =
        error instanceof DeliveryError ? error : new DeliveryError('transient', 'delivery error');
      return this.failed(tx, row, now, failure);
    }
    const status = delivered.dryRun ? 'dry_run' : 'sent';
    await tx.outboundMessage.update({
      where: { id: row.id },
      data: {
        status,
        providerMessageId: delivered.providerMessageId,
        attempts: row.attempts + 1,
        sentAt: now,
        nextAttemptAt: null,
        lastError: null,
      },
    });
    return status;
  }

  /** The texts of the stored template version; a template that cannot render is permanent. */
  private async render(tx: Tx, row: QueuedRow): Promise<EmailMessage> {
    const locale = recipientLocale(row.recipientUser);
    const where = { key: row.templateKey, channel: row.channel, locale };
    const template =
      (await tx.notificationTemplate.findFirst({
        where: { ...where, version: row.templateVersion },
      })) ?? (await tx.notificationTemplate.findFirst({ where: { ...where, active: true } }));
    if (!template) throw new DeliveryError('permanent', `no template ${row.templateKey}`);
    try {
      return composeEmail(
        row.templateKey,
        template,
        locale,
        row.params as Record<string, NotificationParam>,
        row.address,
      );
    } catch (error) {
      throw new DeliveryError('permanent', (error as Error).message);
    }
  }

  private send(row: QueuedRow, message: EmailMessage): Promise<Delivered> {
    if (row.channel === 'email') return this.email.send(message);
    if (row.channel === 'sms') return this.sms.send({ to: message.to, body: message.text });
    throw new DeliveryError('permanent', `channel ${row.channel}`);
  }

  private async failed(
    tx: Tx,
    row: QueuedRow,
    now: Date,
    failure: DeliveryError,
  ): Promise<DeliveryOutcome> {
    const attempts = row.attempts + 1;
    const lastError = safeError(`${failure.kind}: ${failure.message}`);
    const giveUp =
      failure.kind === 'permanent' || now.getTime() - row.createdAt.getTime() >= GIVE_UP_MS;
    if (giveUp) {
      await tx.outboundMessage.update({
        where: { id: row.id },
        data: { status: 'failed', attempts, lastError, nextAttemptAt: null },
      });
      await this.notifications.publish(tx, {
        key: 'ops_alert',
        recipients: [{ roles: MONITORING }],
        params: { count: 1 },
        about: 'delivery-failed',
      });
      this.logger.warn(
        { messageId: row.id, template: row.templateKey, channel: row.channel, attempts },
        'message failed for good',
      );
      return 'failed';
    }
    const nextAttemptAt = new Date(now.getTime() + retryDelay(attempts));
    await tx.outboundMessage.update({
      where: { id: row.id },
      data: { attempts, lastError, nextAttemptAt },
    });
    const category = Object.hasOwn(NOTIFICATION_CATALOGUE, row.templateKey)
      ? NOTIFICATION_CATALOGUE[row.templateKey]?.category
      : undefined;
    await this.jobs.enqueue<DeliveryJob>(
      'notify',
      { messageId: row.id },
      {
        tx,
        singletonKey: `${row.id}:${attempts}`,
        startAfter: nextAttemptAt,
        // eslint-disable-next-line security/detect-object-injection -- a typed category
        priority: category ? EMAIL_PRIORITY[category] : undefined,
      },
    );
    return 'retry';
  }
}
