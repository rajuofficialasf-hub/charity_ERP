import { NOTIFICATION_TEMPLATES, uuidv7 } from '@css/shared';
import { prismaClientFor } from '../core/prisma.service.js';

/** What a sync did: the rows it inserted and the shipped texts it replaced by a new version. */
export interface TemplateSyncResult {
  inserted: number;
  upgraded: number;
}

/**
 * Inserts every notification template of packages/shared whose key, channel and language has no
 * row yet, as version 1 (docs/architecture/NOTIFICATIONS.md, templates), and brings a shipped text
 * that changed since up to date: while the active row of a key and channel is still one the system
 * wrote (no person created it), a text that differs from the shipped one gets a new version, and
 * the old one stays inactive for the entries it rendered. A template an administrator edited is
 * never touched. Part of `pnpm db:migrate`, so production gets new keys and texts without the
 * development seed. Idempotent.
 */
export async function syncNotificationTemplates(
  connectionString: string,
): Promise<TemplateSyncResult> {
  const prisma = prismaClientFor(connectionString);
  const result: TemplateSyncResult = { inserted: 0, upgraded: 0 };
  try {
    for (const t of NOTIFICATION_TEMPLATES)
      for (const [channel, texts] of Object.entries(t.channels)) {
        for (const locale of ['bn', 'en'] as const) {
          // eslint-disable-next-line security/detect-object-injection -- a typed locale
          const text = texts[locale];
          result.inserted += await prisma.$executeRaw`
            INSERT INTO notification_templates (id, key, channel, locale, subject, title, body, variables, version, active)
            SELECT ${uuidv7()}::uuid, ${t.key}, ${channel}, ${locale}, ${text.subject ?? null},
                   ${text.title ?? null}, ${text.body}, ${t.variables}::text[], 1, true
            WHERE NOT EXISTS (
              SELECT 1 FROM notification_templates
              WHERE key = ${t.key} AND channel = ${channel} AND locale = ${locale}
            )`;
        }
        result.upgraded += await prisma.$transaction(async (tx) => {
          // one writer of a key's versions at a time, as an administrator's edit takes it
          await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`template:${t.key}:${channel}`}, 0))`;
          const stale = [];
          for (const locale of ['bn', 'en'] as const) {
            // eslint-disable-next-line security/detect-object-injection -- a typed locale
            const text = texts[locale];
            const rows = await tx.$queryRaw<{ id: string }[]>`
              SELECT n.id FROM notification_templates n
               WHERE n.key = ${t.key} AND n.channel = ${channel} AND n.locale = ${locale} AND n.active
                 AND (n.created_by IS NULL
                      OR EXISTS (SELECT 1 FROM users u WHERE u.id = n.created_by AND u.kind = 'system'))
                 AND (n.subject IS DISTINCT FROM ${text.subject ?? null}
                      OR n.title IS DISTINCT FROM ${text.title ?? null}
                      OR n.body IS DISTINCT FROM ${text.body}
                      OR n.variables IS DISTINCT FROM ${t.variables}::text[])`;
            if (rows[0]) stale.push({ id: rows[0].id, locale, text });
          }
          if (!stale.length) return 0;
          const [latest] = await tx.$queryRaw<{ version: number | null }[]>`
            SELECT max(version)::int AS version FROM notification_templates
             WHERE key = ${t.key} AND channel = ${channel}`;
          const version = (latest?.version ?? 0) + 1;
          for (const row of stale) {
            await tx.$executeRaw`UPDATE notification_templates SET active = false WHERE id = ${row.id}::uuid`;
            await tx.$executeRaw`
              INSERT INTO notification_templates (id, key, channel, locale, subject, title, body, variables, version, active)
              VALUES (${uuidv7()}::uuid, ${t.key}, ${channel}, ${row.locale}, ${row.text.subject ?? null},
                      ${row.text.title ?? null}, ${row.text.body}, ${t.variables}::text[], ${version}, true)`;
          }
          return stale.length;
        });
      }
  } finally {
    await prisma.$disconnect();
  }
  return result;
}
