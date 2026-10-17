import { SETTING_DEFAULTS, SETTING_KEYS } from '@css/shared/settings';
import { json, type SeedContext } from '../../context';

/**
 * The system settings with their decided defaults (the decided alert thresholds; docs/DECISION_LOG.md, the admin and settings decision). Written
 * once: a later seed run keeps what the admin changed on the settings page.
 */
export async function seedSettings(ctx: SeedContext): Promise<void> {
  for (const key of SETTING_KEYS) {
    await ctx.upsert(
      'settings',
       
      { key, value: json(SETTING_DEFAULTS[key]), updated_by: ctx.actorId },
      { key: ['key'], insertOnly: ['value', 'updated_by'] },
    );
  }
}
