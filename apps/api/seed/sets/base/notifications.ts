import { NOTIFICATION_TEMPLATES } from '@css/shared';
import { type SeedContext, seedId } from '../../context';

/** Notification templates of packages/shared (NOTIFICATIONS.md §6), version 1, bn and en. */
export async function seedNotificationTemplates(ctx: SeedContext): Promise<void> {
  for (const t of NOTIFICATION_TEMPLATES) {
    for (const [channel, texts] of Object.entries(t.channels)) {
      for (const locale of ['bn', 'en'] as const) {
        const text = texts![locale];
        await ctx.upsert('notification_templates', {
          id: seedId(`notification-template:${t.key}:${channel}:${locale}:1`),
          key: t.key,
          channel,
          locale,
          subject: text.subject ?? null,
          title: text.title ?? null,
          body: text.body,
          variables: t.variables,
          version: 1,
          active: true,
          ...ctx.audit(),
        });
      }
    }
  }
}
