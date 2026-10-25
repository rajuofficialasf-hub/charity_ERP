import type { Clock } from '../core/clock';
import type { Tx } from '../core/prisma.service';
import { NOTIFICATION_CATALOGUE } from './catalogue';
import type { RecipientRule } from './recipients';
import type { NotificationService } from './service';

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

  async publish(
    tx: Tx,
    key: string,
    target: ApplicationEventTarget,
    actorId: string,
    now: Date = this.clock.now(),
  ): Promise<void> {
    if (!this.knows(key)) return;
    const [project, owner] = await Promise.all([
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
    ]);
    const recipients: RecipientRule[] = OWNER_KEYS.includes(key)
      ? [
          ...(owner ? [{ user: owner.userId }] : []),
          ...(target.createdByUserId && target.createdByUserId !== owner?.userId
            ? [{ user: target.createdByUserId }]
            : []),
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
        ...(OWNER_KEYS.includes(key) ? { applicationId: target.id } : {}),
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
