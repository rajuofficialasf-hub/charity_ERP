import { NOTIFICATION_TEMPLATES, uuidv7 } from '@css/shared';
import { prismaClientFor } from '../core/prisma.service';

/**
 * Inserts every notification template of packages/shared whose key, channel and language has no
 * row yet, as version 1 (docs/architecture/NOTIFICATIONS.md, templates). Part of
 * `pnpm db:migrate`, so production gets new keys without the development seed; a template an
 * administrator edited is never touched. Idempotent; returns the number of rows inserted.
 */
export async function syncNotificationTemplates(connectionString: string): Promise<number> {
  const prisma = prismaClientFor(connectionString);
  let inserted = 0;
  try {
    for (const t of NOTIFICATION_TEMPLATES)
      for (const [channel, texts] of Object.entries(t.channels))
        for (const locale of ['bn', 'en'] as const) {
          // eslint-disable-next-line security/detect-object-injection -- a typed locale
          const text = texts[locale];
          inserted += await prisma.$executeRaw`
            INSERT INTO notification_templates (id, key, channel, locale, subject, title, body, variables, version, active)
            SELECT ${uuidv7()}::uuid, ${t.key}, ${channel}, ${locale}, ${text.subject ?? null},
                   ${text.title ?? null}, ${text.body}, ${t.variables}::text[], 1, true
            WHERE NOT EXISTS (
              SELECT 1 FROM notification_templates
              WHERE key = ${t.key} AND channel = ${channel} AND locale = ${locale}
            )`;
        }
  } finally {
    await prisma.$disconnect();
  }
  return inserted;
}
