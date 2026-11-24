import { uuidv7 } from '@css/shared';
import type { Logger } from 'pino';
import type { Clock } from '../core/clock.js';
import type { PrismaService } from '../core/prisma.service.js';

/** A message sent at once, outside the `notify` queue: a one-time code or a set-password link. */
export interface DirectDelivery {
  templateKey: string;
  channel: 'email' | 'sms';
  /** The address it went to; the deliveries page shows it masked. */
  address: string;
  recipientUserId?: string | null;
  /** Sent, refused by the provider, or not sent at all because the dummy code stands in. */
  status: 'sent' | 'failed' | 'dry_run';
  /** The adapter's error class (never the address or the text). */
  error?: string | null;
  createdBy?: string | null;
}

/**
 * Keeps a record of each message sent at once, so the deliveries page lists the codes and the
 * set-password links beside the queued messages (docs/architecture/NOTIFICATIONS.md, deliveries).
 * The record holds what was sent and to whom, never the code, the link or the text: its params
 * are empty. A record that cannot be written never stops the message, which has already gone.
 */
export class DirectDeliveries {
  constructor(
    private readonly prisma: PrismaService,
    private readonly clock: Clock,
    private readonly logger?: Logger,
  ) {}

  async record(delivery: DirectDelivery): Promise<void> {
    const now = this.clock.now();
    try {
      await this.prisma.outboundMessage.create({
        data: {
          id: uuidv7(),
          eventId: uuidv7(),
          recipientUserId: delivery.recipientUserId ?? null,
          address: delivery.address,
          channel: delivery.channel,
          templateKey: delivery.templateKey,
          templateVersion: 1,
          params: {},
          idempotencyKey: `direct:${uuidv7()}`,
          status: delivery.status,
          attempts: delivery.status === 'dry_run' ? 0 : 1,
          sentAt: delivery.status === 'sent' ? now : null,
          lastError: delivery.error ?? null,
          createdBy: delivery.createdBy ?? null,
        },
      });
    } catch (error) {
      this.logger?.warn(
        { templateKey: delivery.templateKey, err: error instanceof Error ? error.name : 'error' },
        'direct delivery not recorded',
      );
    }
  }
}
