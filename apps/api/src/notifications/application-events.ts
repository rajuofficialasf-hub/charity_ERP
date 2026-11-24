import type { Clock } from '../core/clock.js';
import type { Tx } from '../core/prisma.service.js';
import { NOTIFICATION_CATALOGUE } from './catalogue.js';
import type { RecipientRule } from './recipients.js';
import type { NotificationService } from './service.js';

/** The application an event is about, as the engine holds it after the move. */
export interface ApplicationEventTarget {
  id: string;
  projectId: string;
  ownerVolunteerId: string | null;
  createdByUserId: string | null;
  action: string;
  reason: string | null;
  message: string | null;
}

/** The keys whose readers are the people who brought the application, not the office. */
const OWNER_KEYS = [
  'application_approved',
  'application_rejected',
  'application_reopened',
  'application_waitlisted',
];

/**
 * The application events of the notification matrix (docs/architecture/NOTIFICATIONS.md,
 * applications), published inside the transition's transaction. The office hears of a submission
 * and a review (the holders of the permission that acts next, reaching the owner volunteer's
 * area); the owner volunteer and the team member who created the application hear of a decision,
 * with the message written for them and never the office's reason. A key the catalogue does not
 * hold yet is not published; the engine records it as pending in the audit entry, so a template
 * never names a message that silently goes nowhere. An office message reaches the holders of the
 * permission that acts next whose scope reaches the application itself (its region), whoever
 * brought it.
 */
export class ApplicationEvents {
  constructor(
    private readonly notifications: NotificationService,
    private readonly clock: Clock,
  ) {}

  /** Whether the catalogue knows the key, so the engine can tell a sent message from a pending one. */
  knows(key: string): boolean {
    return Object.hasOwn(NOTIFICATION_CATALOGUE, key);
  }

  /**
   * A step of a field unlock, to one person: the owner volunteer hears that a question opened for
   * a new answer (never the office's reason), the official who opened it hears that the new value
   * came, and the person who gave a value the office sent back hears so, with the message written
   * for them. The entry names the application's number and the question and leads to the
   * application.
   */
  async publishUnlock(
    tx: Tx,
    key: 'field_unlocked' | 'field_updated' | 'field_refused',
    input: {
      application: { id: string; projectId: string };
      question: { bn: string; en?: string };
      to: string;
      actorId: string;
      /** The message for the person a value was sent back to. */
      message?: string | null;
    },
  ): Promise<void> {
    const [project, application] = await Promise.all([
      tx.project.findUniqueOrThrow({
        where: { id: input.application.projectId },
        select: { nameBn: true, nameEn: true },
      }),
      tx.application.findUniqueOrThrow({
        where: { id: input.application.id },
        select: { appNo: true },
      }),
    ]);
    await this.notifications.publish(tx, {
      key,
      recipients: [{ user: input.to }],
      params: {
        project_name: { bn: project.nameBn, en: project.nameEn },
        app_no: application.appNo ?? '',
        field_name: { bn: input.question.bn, en: input.question.en ?? input.question.bn },
        projectId: input.application.projectId,
        applicationId: input.application.id,
        ...(input.message ? { message: input.message } : {}),
      },
      about: input.application.id,
      actorId: input.actorId,
    });
  }

  /**
   * A transfer, to its two volunteers: the new one hears how many applications came to them, the
   * old one only how many went (never which).
   */
  async publishTransfer(
    tx: Tx,
    input: {
      projectId: string;
      count: number;
      toUserId: string;
      fromUserId: string;
      batchId: string;
      actorId: string;
    },
  ): Promise<void> {
    const project = await tx.project.findUniqueOrThrow({
      where: { id: input.projectId },
      select: { nameBn: true, nameEn: true },
    });
    const params = {
      project_name: { bn: project.nameBn, en: project.nameEn },
      count: input.count,
      projectId: input.projectId,
    };
    await this.notifications.publish(tx, {
      key: 'application_transferred',
      recipients: [{ user: input.toUserId }],
      params,
      about: input.batchId,
      actorId: input.actorId,
    });
    await this.notifications.publish(tx, {
      key: 'application_transferred_away',
      recipients: [{ user: input.fromUserId }],
      params,
      about: input.batchId,
      actorId: input.actorId,
    });
  }

  async publish(
    tx: Tx,
    key: string,
    target: ApplicationEventTarget,
    actorId: string,
    now: Date = this.clock.now(),
  ): Promise<void> {
    if (!this.knows(key)) return;
    const [project, owner, application] = await Promise.all([
      tx.project.findUniqueOrThrow({
        where: { id: target.projectId },
        select: { nameBn: true, nameEn: true },
      }),
      target.ownerVolunteerId
        ? tx.volunteer.findUnique({
            where: { id: target.ownerVolunteerId },
            select: { userId: true },
          })
        : null,
      OWNER_KEYS.includes(key)
        ? tx.application.findUnique({ where: { id: target.id }, select: { appNo: true } })
        : null,
    ]);
    // the team member who created it hears too, while the owner is still their lead there
    const creatorOnTeam =
      target.createdByUserId &&
      target.createdByUserId !== owner?.userId &&
      (!target.ownerVolunteerId ||
        (await tx.volunteerTeam.count({
          where: {
            projectId: target.projectId,
            leadVolunteerId: target.ownerVolunteerId,
            removedAt: null,
            memberVolunteer: { userId: target.createdByUserId },
          },
        })) > 0);
    const recipients: RecipientRule[] = OWNER_KEYS.includes(key)
      ? [
          ...(owner ? [{ user: owner.userId }] : []),
          ...(creatorOnTeam && target.createdByUserId ? [{ user: target.createdByUserId }] : []),
        ]
      : [
          {
            holders: {
              permission:
                key === 'application_reviewed' ? 'application.approve' : 'application.review',
              entity: 'application',
              target: { applicationId: target.id },
              withoutGlobalRoles: true,
            },
          },
        ];
    if (!recipients.length) return;
    await this.notifications.publish(tx, {
      key,
      recipients,
      params: {
        project_name: { bn: project.nameBn, en: project.nameEn },
        projectId: target.projectId,
        // the office's entry collapses several submissions, so it links to the project's list;
        // the owner's entry is about one application
        ...(OWNER_KEYS.includes(key)
          ? { applicationId: target.id, app_no: application?.appNo ?? '' }
          : {}),
        ...(target.message ? { message: target.message } : {}),
      },
      // one entry per volunteer per hour for the office keys; one per application for the rest
      about: OWNER_KEYS.includes(key)
        ? target.id
        : `${target.ownerVolunteerId ?? target.id}:${now.toISOString().slice(0, 13)}`,
      actorId,
    });
  }
}
