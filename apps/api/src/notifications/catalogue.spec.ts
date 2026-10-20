import { NOTIFICATION_TEMPLATES } from '@css/shared';
import { describe, expect, it } from 'vitest';
import { NOTIFICATION_CATALOGUE } from './catalogue';

// The catalogue of Phase 1 events against the seeded templates and the channel rules
// (docs/architecture/NOTIFICATIONS.md).
describe('the notification catalogue', () => {
  it('has a seeded template in bn and en for every channel it uses', () => {
    for (const [key, entry] of Object.entries(NOTIFICATION_CATALOGUE)) {
      const template = NOTIFICATION_TEMPLATES.find((t) => t.key === key);
      expect(template, key).toBeDefined();
      for (const locale of ['bn', 'en'] as const) {
        if (entry.inApp)
          expect(template!.channels.in_app?.[locale], `${key} in-app ${locale}`).toBeDefined();
        if (entry.email)
          expect(template!.channels.email?.[locale], `${key} email ${locale}`).toBeDefined();
      }
    }
  });

  it('never sends SMS through the catalogue: SMS is for OTP alone', () => {
    for (const key of Object.keys(NOTIFICATION_CATALOGUE))
      expect(NOTIFICATION_TEMPLATES.find((t) => t.key === key)?.channels.sms, key).toBeUndefined();
  });
});
