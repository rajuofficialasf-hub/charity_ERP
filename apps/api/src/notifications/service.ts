import { inAppParams, uuidv7 } from '@css/shared';
import type { NotificationParam } from '@css/shared/i18n';
import type { Clock } from '../core/clock';
import type { Tx } from '../core/prisma.service';
import type { Prisma } from '../generated/prisma/client';
import type { JobRunner } from '../jobs/job-runner';
import { EMAIL_PRIORITY, NOTIFICATION_CATALOGUE } from './catalogue';
import type { RecipientResolver, RecipientRule } from './recipients';

/** One event to tell people about. */
export interface NotificationInput {
  /** The template key of the matrix. */
  key: string;
  recipients: readonly RecipientRule[];
  /** Template values and the record ids the in-app link needs (`userId`, `projectId`). */
  params: Record<string, NotificationParam>;
  /** What the event is about; identical events on it within 15 minutes collapse into one entry. */
  about?: string;
  /** The person who acted; they never get a copy. */
  actorId?: string | null;
}

/** Identical events within this window collapse into one entry and one email. */
export const COALESCE_MS = 15 * 60_000;

/** The job of one outbound message: the worker reads the row by its id. */
export interface DeliveryJob {
  messageId: string;
}

const locale = (language: string) => (language === 'en' ? 'en' : 'bn');

/**
 * Publishes an event inside the business transaction (docs/architecture/NOTIFICATIONS.md, delivery
 * and outbox): one in-app row per recipient (counted up when the same event repeats within 15
 * minutes; never another person's name), and for an event with email one outbox row per official
 * with an address, its delivery enqueued in the same transaction. Nothing is sent here: a rolled-back
 * event leaves no message, and SMTP runs only in the worker.
 */
export class NotificationService {
  constructor(
    private readonly recipients: RecipientResolver,
    private readonly jobs: JobRunner,
    private readonly clock: Clock,
  ) {}

  async publish(tx: Tx, input: NotificationInput): Promise<{ inApp: number; emails: number }> {
    const entry = Object.hasOwn(NOTIFICATION_CATALOGUE, input.key)
      ? NOTIFICATION_CATALOGUE[input.key]
      : undefined;
    if (!entry) throw new Error(`no notification catalogue entry for ${input.key}`);
    const people = await this.recipients.resolve(tx, input.recipients, input.actorId);
    if (!people.length) return { inApp: 0, emails: 0 };
    const now = this.clock.now();
    const since = new Date(now.getTime() - COALESCE_MS);
    const coalesceKey = `${input.key}:${input.about ?? ''}`;
    const versions = await this.activeVersions(tx, input.key);
    const eventId = uuidv7();
    let inApp = 0;
    let emails = 0;

    for (const person of people) {
      if (entry.inApp) {
        const params = inAppParams(input.params) as Prisma.InputJsonValue;
        const recent = await tx.notification.findFirst({
          where: { userId: person.id, coalesceKey, readAt: null, createdAt: { gte: since } },
          orderBy: { createdAt: 'desc' },
          select: { id: true },
        });
        if (recent)
          await tx.notification.update({
            where: { id: recent.id },
            data: { count: { increment: 1 }, params },
          });
        else
          await tx.notification.create({
            data: {
              id: uuidv7(),
              userId: person.id,
              templateKey: input.key,
              templateVersion: versions.get(`in_app:${locale(person.language)}`) ?? 1,
              params,
              coalesceKey,
              createdBy: input.actorId ?? null,
            },
          });
        inApp += 1;
      }
      if (entry.email && person.kind === 'staff' && person.email) {
        // the same email to the same person within 15 minutes is sent once
        const queued = await tx.outboundMessage.count({
          where: {
            recipientUserId: person.id,
            templateKey: input.key,
            channel: 'email',
            createdAt: { gte: since },
          },
        });
        if (queued) continue;
        const id = uuidv7();
        await tx.outboundMessage.create({
          data: {
            id,
            eventId,
            recipientUserId: person.id,
            address: person.email,
            channel: 'email',
            templateKey: input.key,
            templateVersion: versions.get(`email:${locale(person.language)}`) ?? 1,
            params: input.params as Prisma.InputJsonValue,
            idempotencyKey: `${eventId}:${person.id}:email`,
            createdBy: input.actorId ?? null,
          },
        });
        await this.jobs.enqueue<DeliveryJob>(
          'notify',
          { messageId: id },
          { tx, singletonKey: id, priority: EMAIL_PRIORITY[entry.category] },
        );
        emails += 1;
      }
    }
    return { inApp, emails };
  }

  /** The active version of a key per channel and language, e.g. `email:bn` → 2. */
  private async activeVersions(tx: Tx, key: string): Promise<Map<string, number>> {
    const rows = await tx.notificationTemplate.findMany({
      where: { key, active: true },
      select: { channel: true, locale: true, version: true },
    });
    return new Map(rows.map((r) => [`${r.channel}:${r.locale}`, r.version]));
  }
}
