import { type EmailMode, notificationLink, type PreferencesUpdate } from '@css/shared';
import {
  type Locale,
  type NotificationParam,
  renderTemplateText,
  translate,
} from '@css/shared/i18n';
import type { Logger } from 'pino';
import type { Principal } from '../auth/principal';
import type { Env } from '../config/env';
import type { Clock } from '../core/clock';
import { buildPage, decodeCursor, keysetWhere, orderBy, type SortField } from '../core/pagination';
import type { PrismaService } from '../core/prisma.service';
import { ApiError } from '../i18n/api-error';
import { NOTIFICATION_CATALOGUE } from '../notifications/catalogue';

export interface InboxQuery {
  limit: number;
  cursor?: string;
  unread?: boolean;
}

export interface InboxEntry {
  id: string;
  templateKey: string;
  title: string;
  body: string;
  link: string | null;
  count: number;
  readAt: string | null;
  createdAt: string;
}

export interface Preferences {
  email_mode?: EmailMode;
  digest_time?: string;
}

/** uuidv7 ids follow the creation time: newest first is the id descending. */
const SORT: SortField[] = [{ field: 'id', direction: 'desc' }];

/**
 * The own in-app inbox and preferences (docs/architecture/NOTIFICATIONS.md, inbox and preferences).
 * An entry is rendered when read, in the reader's language, from the template version stored on
 * it, so an edited template never changes old entries; one entry that cannot be rendered shows a
 * plain fallback and never breaks the page. Only the caller's own rows are ever read or changed.
 */
export class InboxService {
  constructor(
    private readonly env: Env,
    private readonly prisma: PrismaService,
    private readonly clock: Clock,
    private readonly logger: Logger,
  ) {}

  async list(principal: Principal, query: InboxQuery, locale: Locale) {
    const binding = `notifications.inbox|${principal.userId}|${query.unread ? 'unread' : 'all'}`;
    const cursor = query.cursor
      ? decodeCursor(this.env.CURSOR_SECRET, binding, query.cursor)
      : undefined;
    const direction = cursor?.d ?? 'next';
    const mine = { userId: principal.userId, ...(query.unread ? { readAt: null } : {}) };
    const [fetched, unreadCount] = await Promise.all([
      this.prisma.notification.findMany({
        where: cursor ? { AND: [mine, keysetWhere(SORT, cursor)] } : mine,
        orderBy: orderBy(SORT, direction),
        take: query.limit + 1,
        select: {
          id: true,
          templateKey: true,
          templateVersion: true,
          params: true,
          count: true,
          readAt: true,
          createdAt: true,
        },
      }),
      this.unreadCount(principal),
    ]);
    const { rows, meta } = buildPage(fetched, {
      limit: query.limit,
      sort: SORT,
      direction,
      hadCursor: Boolean(cursor),
      secret: this.env.CURSOR_SECRET,
      binding,
    });
    const texts = await this.texts(rows, locale);
    const audience = principal.kind === 'staff' ? 'staff' : 'volunteer';
    return {
      rows: rows.map((r): InboxEntry => {
        const params = (r.params ?? {}) as Record<string, NotificationParam>;
        return {
          id: r.id,
          templateKey: r.templateKey,
          ...this.render(r, params, texts, locale),
          link: notificationLink(r.templateKey, params, audience),
          count: r.count,
          readAt: r.readAt?.toISOString() ?? null,
          createdAt: r.createdAt.toISOString(),
        };
      }),
      meta: { ...meta, unreadCount },
    };
  }

  unreadCount(principal: Principal): Promise<number> {
    return this.prisma.notification.count({
      where: { userId: principal.userId, readAt: null },
    });
  }

  /** Marks own entries read; an id that is not the caller's answers 404 and nothing changes. */
  async markRead(principal: Principal, body: { ids?: string[]; all?: true }): Promise<void> {
    const now = this.clock.now();
    if (body.all) {
      await this.prisma.notification.updateMany({
        where: { userId: principal.userId, readAt: null },
        data: { readAt: now },
      });
      return;
    }
    const ids = [...new Set(body.ids ?? [])];
    await this.prisma.$transaction(async (tx) => {
      const own = await tx.notification.count({
        where: { id: { in: ids }, userId: principal.userId },
      });
      if (own !== ids.length) throw new ApiError('permission.not_found', 404);
      await tx.notification.updateMany({
        where: { id: { in: ids }, userId: principal.userId, readAt: null },
        data: { readAt: now },
      });
    });
  }

  async preferences(principal: Principal): Promise<Preferences> {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: principal.userId },
      select: { kind: true, preferences: true },
    });
    return this.view(user.kind, user.preferences);
  }

  /** Officials choose how digest-eligible emails reach them; volunteers get no email at all. */
  async setPreferences(principal: Principal, body: PreferencesUpdate): Promise<Preferences> {
    return this.prisma.$transaction(async (tx) => {
      const [user] = await tx.$queryRaw<{ kind: string; preferences: unknown }[]>`
        SELECT kind, preferences FROM users WHERE id = ${principal.userId}::uuid FOR UPDATE`;
      if (!user) throw new ApiError('permission.not_found', 404);
      if (user.kind !== 'staff')
        throw new ApiError('validation.failed', 422, undefined, [
          { path: 'email_mode', code: 'notification.no_email_for_volunteers' },
        ]);
      const stored = (user.preferences ?? {}) as Record<string, unknown>;
      const next = { ...stored, ...body };
      await tx.user.update({ where: { id: principal.userId }, data: { preferences: next } });
      return this.view(user.kind, next);
    });
  }

  private view(kind: string, stored: unknown): Preferences {
    if (kind !== 'staff') return {};
    const p = (stored ?? {}) as Record<string, unknown>;
    return {
      email_mode: p.email_mode === 'immediate' ? 'immediate' : 'digest',
      digest_time: typeof p.digest_time === 'string' ? p.digest_time : '08:00',
    };
  }

  /** The in-app texts of the page's template versions in one query, keyed `key:version`. */
  private async texts(
    rows: { templateKey: string; templateVersion: number | null }[],
    locale: Locale,
  ) {
    const keys = [...new Set(rows.map((r) => r.templateKey))];
    if (!keys.length) return new Map<string, TemplateRow>();
    const found = await this.prisma.notificationTemplate.findMany({
      where: { key: { in: keys }, channel: 'in_app', locale },
      select: { key: true, version: true, active: true, title: true, body: true, variables: true },
    });
    const map = new Map<string, TemplateRow>();
    for (const t of found) {
      map.set(`${t.key}:${t.version}`, t);
      if (t.active) map.set(`${t.key}:active`, t);
    }
    return map;
  }

  private render(
    row: { id: string; templateKey: string; templateVersion: number | null; count: number },
    params: Record<string, NotificationParam>,
    texts: Map<string, TemplateRow>,
    locale: Locale,
  ): { title: string; body: string } {
    const template =
      texts.get(`${row.templateKey}:${row.templateVersion ?? 1}`) ??
      texts.get(`${row.templateKey}:active`);
    try {
      if (!template) throw new Error('no template');
      // an entry that counts events shows how many were collapsed into it
      const values =
        Object.hasOwn(NOTIFICATION_CATALOGUE, row.templateKey) &&
        NOTIFICATION_CATALOGUE[row.templateKey]?.countsEvents
          ? { ...params, count: row.count }
          : params;
      const text = renderTemplateText(
        row.templateKey,
        template,
        template.variables,
        locale,
        values,
      );
      return { title: text.title ?? '', body: text.body };
    } catch (error) {
      this.logger.warn({ err: error, notificationId: row.id }, 'inbox entry not rendered');
      return {
        title: translate(locale, 'common.notification.fallback_title'),
        body: translate(locale, 'common.notification.fallback_body'),
      };
    }
  }
}

interface TemplateRow {
  key: string;
  version: number;
  active: boolean;
  title: string | null;
  body: string;
  variables: string[];
}
