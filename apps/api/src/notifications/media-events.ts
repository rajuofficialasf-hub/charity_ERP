import type { Bilingual, MessageKey } from '@css/shared/i18n';
import type { ReferralDecision } from '@css/shared/media';
import type { Tx } from '../core/prisma.service.js';
import { bilingualText } from './account-events.js';
import type { NotificationService } from './service.js';

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

  /** The title, the project and the referral of a work, for its entries. */
  private async workParams(tx: Tx, workId: string) {
    const work = await tx.mediaWork.findUniqueOrThrow({
      where: { id: workId },
      select: {
        title: true,
        referral: {
          select: {
            id: true,
            referredBy: true,
            project: { select: { nameBn: true, nameEn: true } },
          },
        },
      },
    });
    return {
      referredBy: work.referral.referredBy,
      params: {
        work_title: work.title,
        project_name: { bn: work.referral.project.nameBn, en: work.referral.project.nameEn },
        referralId: work.referral.id,
      },
    };
  }

  /** Members added to a work hear it, each one. */
  async membersAdded(
    tx: Tx,
    workId: string,
    userIds: readonly string[],
    actorId: string,
  ): Promise<void> {
    const { params } = await this.workParams(tx, workId);
    await this.notifications.publish(tx, {
      key: 'media_member_added',
      recipients: userIds.map((user) => ({ user })),
      params,
      about: workId,
      actorId,
    });
  }

  /** A work ready to publish waits for the Media Director's final review. */
  async reviewWaiting(tx: Tx, workId: string, actorId: string): Promise<void> {
    const { params } = await this.workParams(tx, workId);
    await this.notifications.publish(tx, {
      key: 'media_review_waiting',
      recipients: [{ roles: ['media_director'] }],
      params,
      about: workId,
      actorId,
    });
  }

  /** The referrer hears that the work of their referral is published. */
  async published(tx: Tx, workId: string, actorId: string): Promise<void> {
    const { params, referredBy } = await this.workParams(tx, workId);
    await this.notifications.publish(tx, {
      key: 'media_published',
      recipients: [{ user: referredBy }],
      params,
      about: workId,
      actorId,
    });
  }
}
