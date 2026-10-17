import { SETTING_DEFAULTS, SETTING_KEYS } from '@css/shared/settings';
import { json, type SeedContext } from '../../context';

/**
 * The system settings with their decided defaults (O-04 thresholds; DECISION_LOG D-098). Written
 * once: a later seed run keeps what the admin changed on the settings page.
 */
export async function seedSettings(ctx: SeedContext): Promise<void> {
  for (const key of SETTING_KEYS) {
    await ctx.upsert(
      'settings',
      // eslint-disable-next-line security/detect-object-injection -- key comes from SETTING_KEYS
      { key, value: json(SETTING_DEFAULTS[key]), updated_by: ctx.actorId },
      { key: ['key'], insertOnly: ['value', 'updated_by'] },
    );
  }
}
