import type { Principal } from '../auth/principal';
import type { Env } from '../config/env';
import {
  buildPage,
  decodeCursor,
  keysetWhere,
  orderBy,
  parseRange,
  type SortField,
} from '../core/pagination';
import type { PrismaService } from '../core/prisma.service';
import type { Prisma } from '../generated/prisma/client';
import { maskMobile } from '../notifications/adapters';

export const DELIVERY_STATUSES = [
  'queued',
  'sending',
  'sent',
  'failed',
  'dry_run',
  'suppressed',
] as const;
export const DELIVERY_CHANNELS = ['email', 'sms', 'push'] as const;

export interface DeliveryQuery {
  limit: number;
  cursor?: string;
  status?: (typeof DELIVERY_STATUSES)[number];
  channel?: (typeof DELIVERY_CHANNELS)[number];
  from?: string;
  to?: string;
}

export interface DeliveryView {
  id: string;
  createdAt: string;
  channel: (typeof DELIVERY_CHANNELS)[number];
  templateKey: string;
  status: (typeof DELIVERY_STATUSES)[number];
  recipient: { id: string; name: string } | null;
  address: string;
  attempts: number;
  lastError: string | null;
  nextAttemptAt: string | null;
  sentAt: string | null;
}

/** An address with most of it hidden: the first letter and the domain of an email. */
export function maskAddress(address: string, channel: string): string {
  if (channel !== 'email') return maskMobile(address);
  const at = address.lastIndexOf('@');
  return at > 0 ? `${address[0]}***${address.slice(at)}` : '***';
}

/** uuidv7 ids follow the queueing time: newest first is the id descending. */
const SORT: SortField[] = [{ field: 'id', direction: 'desc' }];

/**
 * The delivery page of the Department Head and the Monitoring Team
 * (docs/architecture/NOTIFICATIONS.md, delivery, outbox and status): every queued email and SMS
 * with its status, attempts and the cleaned last error, newest first, by status, channel and
 * dates. The address is partly hidden and the message text is never shown (the outbox keeps the
 * values, not the text, and OTP codes never enter it).
 */
export class DeliveriesService {
  constructor(
    private readonly env: Env,
    private readonly prisma: PrismaService,
  ) {}

  async list(actor: Principal, query: DeliveryQuery) {
    const binding = `deliveries.list|${actor.userId}|${query.status ?? ''}|${query.channel ?? ''}|${query.from ?? ''}|${query.to ?? ''}`;
    const cursor = query.cursor
      ? decodeCursor(this.env.CURSOR_SECRET, binding, query.cursor)
      : undefined;
    const direction = cursor?.d ?? 'next';
    const range = parseRange(query.from, query.to);
    const where: Prisma.OutboundMessageWhereInput = {
      ...(query.status ? { status: query.status } : {}),
      ...(query.channel ? { channel: query.channel } : {}),
      ...(range ? { createdAt: range } : {}),
    };
    const fetched = await this.prisma.outboundMessage.findMany({
      where: cursor ? { AND: [where, keysetWhere(SORT, cursor)] } : where,
      orderBy: orderBy(SORT, direction),
      take: query.limit + 1,
      select: {
        id: true,
        createdAt: true,
        channel: true,
        templateKey: true,
        status: true,
        address: true,
        attempts: true,
        lastError: true,
        nextAttemptAt: true,
        sentAt: true,
        recipientUser: { select: { id: true, displayName: true } },
      },
    });
    const { rows, meta } = buildPage(fetched, {
      limit: query.limit,
      sort: SORT,
      direction,
      hadCursor: Boolean(cursor),
      secret: this.env.CURSOR_SECRET,
      binding,
    });
    return {
      rows: rows.map((r): DeliveryView => ({
        id: r.id,
        createdAt: r.createdAt.toISOString(),
        // the columns hold only these values (check constraints)
        channel: r.channel as DeliveryView['channel'],
        templateKey: r.templateKey,
        status: r.status as DeliveryView['status'],
        recipient: r.recipientUser
          ? { id: r.recipientUser.id, name: r.recipientUser.displayName }
          : null,
        address: maskAddress(r.address, r.channel),
        attempts: r.attempts,
        lastError: r.lastError,
        nextAttemptAt: r.nextAttemptAt?.toISOString() ?? null,
        sentAt: r.sentAt?.toISOString() ?? null,
      })),
      meta,
    };
  }
}
