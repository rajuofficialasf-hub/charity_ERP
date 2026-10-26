import type { Bilingual, MessageKey } from '@css/shared/i18n';
import type { ReferralDecision } from '@css/shared/media';
import type { Tx } from '../core/prisma.service';
import { bilingualText } from './account-events';
import type { NotificationService } from './service';

/** The two roles that decide on referrals and run the works. */
const MEDIA_DIRECTORS = ['media_director', 'media_assistant_director'] as const;

const DECISION_TEXT = new Map<ReferralDecision, MessageKey>([
  ['accept', 'common.notification.media_accepted'],
  ['send_back', 'common.notification.media_sent_back'],
  ['reject', 'common.notification.media_rejected'],
]);

/**
 * The Media Team's events of the notification matrix (docs/architecture/NOTIFICATIONS.md, media),
 * published inside the transaction of the business write. Entries name the project and the work,
 * never the beneficiary, and link to the referral's work page.
 */
export class MediaEvents {
  constructor(private readonly notifications: NotificationService) {}

  private async projectName(tx: Tx, projectId: string): Promise<Bilingual> {
    const p = await tx.project.findUniqueOrThrow({
      where: { id: projectId },
      select: { nameBn: true, nameEn: true },
    });
    return { bn: p.nameBn, en: p.nameEn };
  }

  /** A new or resent referral waits for the Media Director or the Assistant Director. */
  async referred(
    tx: Tx,
    referral: { id: string; projectId: string },
    actorId: string,
  ): Promise<void> {
    await this.notifications.publish(tx, {
      key: 'media_referral_new',
      recipients: [{ roles: MEDIA_DIRECTORS }],
      params: {
        project_name: await this.projectName(tx, referral.projectId),
        referralId: referral.id,
      },
      about: referral.id,
      actorId,
    });
  }

  /** The referrer hears the decision on their referral. */
  async decided(
    tx: Tx,
    referral: { id: string; projectId: string; referredBy: string },
    decision: ReferralDecision,
    actorId: string,
  ): Promise<void> {
    await this.notifications.publish(tx, {
      key: 'media_referral_decided',
      recipients: [{ user: referral.referredBy }],
      params: {
        project_name: await this.projectName(tx, referral.projectId),
        result: bilingualText(DECISION_TEXT.get(decision)!),
        referralId: referral.id,
      },
      about: referral.id,
      actorId,
    });
  }
}
