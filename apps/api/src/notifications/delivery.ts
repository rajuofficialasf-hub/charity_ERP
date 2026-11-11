import {
  type Locale,
  type NotificationParam,
  recipientLocale,
  renderTemplateText,
  type TemplateText,
} from '@css/shared/i18n';
import type { Logger } from 'pino';
import type { Clock } from '../core/clock.js';
import type { PrismaService, Tx } from '../core/prisma.service.js';
import type { JobRunner } from '../jobs/job-runner.js';
import {
  type Delivered,
  DeliveryError,
  type EmailAdapter,
  type EmailMessage,
  type SmsAdapter,
} from './adapters.js';
import { EMAIL_PRIORITY, NOTIFICATION_CATALOGUE } from './catalogue.js';
import { MONITORING } from './recipients.js';
import type { DeliveryJob, NotificationService } from './service.js';

/** The waits after the first, second, third and fourth failed attempt; hourly after that. */
const RETRY_DELAYS_MS: readonly number[] = [30_000, 2 * 60_000, 10 * 60_000, 60 * 60_000];
const HOURLY_MS = 60 * 60_000;
/** A message still failing this long after it was queued fails for good. */
export const GIVE_UP_MS = 24 * 60 * 60_000;
/** A job may start this much before its row's next attempt. */
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
    private readonly now: () => number = Date.now,
    private readonly sleep: (ms: number) => Promise<void> = (ms) =>
      new Promise((resolve) => setTimeout(resolve, ms)),
  ) {}

  async wait(): Promise<void> {
    const now = this.now();
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
    throttle?: Throttle,
  ) {
    this.throttle = throttle ?? new Throttle(Math.ceil(60_000 / emailsPerMinute));
  }

  async deliver(job: DeliveryJob): Promise<DeliveryOutcome> {
    const peek = await this.prisma.outboundMessage.findUnique({
      where: { id: job.messageId },
      select: { channel: true, status: true },
    });
    if (peek?.status !== 'queued') return 'skipped';
    // the provider call runs inside the lock; its own timeouts end well within this one
    const outcome = await this.prisma.$transaction((tx) => this.attempt(tx, job.messageId), {
      maxWait: 10_000,
      timeout: 90_000,
    });
    // after the commit and on its own: an alert that cannot be written never undoes the status
    if (outcome === 'failed') await this.alertMonitoring();
    return outcome;
  }

  private async alertMonitoring(): Promise<void> {
    try {
      await this.prisma.$transaction((tx) =>
        this.notifications.publish(tx, {
          key: 'ops_alert',
          recipients: [{ roles: MONITORING }],
          params: { count: 1 },
          about: 'delivery-failed',
        }),
      );
    } catch (error) {
      this.logger.error({ err: error }, 'operations alert not written');
    }
  }

  private async attempt(tx: Tx, messageId: string): Promise<DeliveryOutcome> {
    const locked = await tx.$queryRaw<{ status: string; next_attempt_at: Date | null }[]>`
      SELECT status, next_attempt_at FROM outbound_messages
      WHERE id = ${messageId}::uuid FOR UPDATE SKIP LOCKED`;
    const now = this.clock.now();
    const head = locked[0];
    if (head?.status !== 'queued') return 'skipped';
    // a job ahead of the row's next attempt: the attempt keeps a job at its time
    if (head.next_attempt_at && head.next_attempt_at.getTime() > now.getTime() + EARLY_MS) {
      await this.schedule(tx, messageId, null, head.next_attempt_at.getTime() - now.getTime());
      return 'skipped';
    }
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
    // only a message that is really sent takes a slot of the email rate
    if (row.channel === 'email') await this.throttle.wait();
    let delivered: Delivered;
    try {
      delivered = await this.send(row, await this.render(tx, row));
    } catch (error) {
      if (error instanceof DeliveryError) return this.failed(tx, row, now, error);
      this.logger.warn({ err: error, messageId: row.id }, 'delivery error');
      return this.failed(tx, row, now, new DeliveryError('transient', 'delivery error'));
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
    const params = row.params;
    // the stored values are checked again by the renderer, one by one
    if (params === null || typeof params !== 'object' || Array.isArray(params))
      throw new DeliveryError('permanent', 'params are not an object');
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
        params as Record<string, NotificationParam>,
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
    const delay = retryDelay(attempts);
    // the next attempt would come after the 24 hours: this one was the last
    const giveUp =
      failure.kind === 'permanent' || now.getTime() + delay - row.createdAt.getTime() > GIVE_UP_MS;
    if (giveUp) {
      await tx.outboundMessage.update({
        where: { id: row.id },
        data: { status: 'failed', attempts, lastError, nextAttemptAt: null },
      });
      this.logger.warn(
        { messageId: row.id, template: row.templateKey, channel: row.channel, attempts },
        'message failed for good',
      );
      return 'failed';
    }
    await tx.outboundMessage.update({
      where: { id: row.id },
      data: { attempts, lastError, nextAttemptAt: new Date(now.getTime() + delay) },
    });
    await this.schedule(tx, row.id, row.templateKey, delay, attempts);
    return 'retry';
  }

  /**
   * The job of the next attempt, in the same transaction. The wait is relative, so the database
   * clock that starts the job never runs it early against this process's clock.
   */
  private async schedule(
    tx: Tx,
    messageId: string,
    templateKey: string | null,
    delayMs: number,
    attempts?: number,
  ): Promise<void> {
    const category =
      templateKey && Object.hasOwn(NOTIFICATION_CATALOGUE, templateKey)
        ? // eslint-disable-next-line security/detect-object-injection -- checked with Object.hasOwn
          NOTIFICATION_CATALOGUE[templateKey]?.category
        : undefined;
    await this.jobs.enqueue<DeliveryJob>(
      'notify',
      { messageId },
      {
        tx,
        singletonKey: attempts === undefined ? undefined : `${messageId}:${attempts}`,
        startAfter: Math.ceil(delayMs / 1000),
        // eslint-disable-next-line security/detect-object-injection -- a typed category
        priority: category ? EMAIL_PRIORITY[category] : undefined,
      },
    );
  }
}
