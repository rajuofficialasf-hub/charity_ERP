import type { Bilingual, MessageKey } from '@css/shared/i18n';
import { translate } from '@css/shared/i18n';
import { REQUEST_FIELD_LABEL } from '@css/shared/registration';
import type { Tx } from '../core/prisma.service';
import { MONITORING } from './recipients';
import type { NotificationService } from './service';

/** A request field in both languages, as the screens name it; an unknown key as it is. */
export function fieldName(fields: readonly string[]): Bilingual {
  const name = (locale: 'bn' | 'en') =>
    fields
      .map((f) =>
        Object.hasOwn(REQUEST_FIELD_LABEL, f)
          ? translate(
              locale,
              `registration.${REQUEST_FIELD_LABEL[f as keyof typeof REQUEST_FIELD_LABEL]}` as MessageKey,
            )
          : f,
      )
      .join(', ');
  return { bn: name('bn'), en: name('en') };
}

/**
 * The registration, account and handover events of the notification matrix
 * (docs/architecture/NOTIFICATIONS.md, registration, accounts and security), published inside the
 * transaction of the business write, so a rolled-back write tells nobody.
 */
export class AccountEvents {
  constructor(private readonly notifications: NotificationService) {}

  /** A volunteer registration waits: the officials whose scope reaches the volunteer. */
  async registrationPending(tx: Tx, userId: string): Promise<void> {
    const volunteer = await tx.volunteer.findUnique({
      where: { userId },
      select: { id: true, district: { select: { nameBn: true, nameEn: true } } },
    });
    if (!volunteer) return;
    await this.notifications.publish(tx, {
      key: 'registration_pending',
      recipients: [
        {
          holders: {
            permission: 'registration.approve',
            entity: 'volunteer',
            target: { volunteerId: volunteer.id },
          },
        },
      ],
      params: {
        region_name: { bn: volunteer.district.nameBn, en: volunteer.district.nameEn },
        userId,
      },
      about: userId,
      actorId: userId,
    });
  }

  async correctionRequested(
    tx: Tx,
    userId: string,
    fields: readonly string[],
    note: string,
    actorId: string,
  ): Promise<void> {
    await this.notifications.publish(tx, {
      key: 'registration_correction_requested',
      recipients: [{ user: userId }],
      params: { field_name: fieldName(fields), note },
      about: userId,
      actorId,
    });
  }

  async registrationDecided(
    tx: Tx,
    userId: string,
    decision: { approved: true } | { approved: false; reason: string },
    actorId: string,
  ): Promise<void> {
    await this.notifications.publish(tx, {
      key: decision.approved ? 'registration_approved' : 'registration_rejected',
      recipients: [{ user: userId }],
      params: decision.approved ? {} : { reason: decision.reason },
      about: userId,
      actorId,
    });
  }

  /** An edit request is ready to decide: the officials whose scope reaches the volunteer. */
  async editRequestSubmitted(tx: Tx, requestId: string): Promise<void> {
    const request = await tx.volunteerChangeRequest.findUnique({
      where: { id: requestId },
      select: { field: true, volunteerId: true, volunteer: { select: { userId: true } } },
    });
    if (!request) return;
    await this.notifications.publish(tx, {
      key: 'edit_request_submitted',
      recipients: [
        {
          holders: {
            permission: 'edit_request.approve',
            entity: 'volunteer',
            target: { volunteerId: request.volunteerId },
          },
        },
      ],
      params: { field_name: fieldName([request.field]) },
      about: requestId,
      actorId: request.volunteer.userId,
    });
  }

  async editRequestDecided(
    tx: Tx,
    requestId: string,
    ownerId: string,
    field: string,
    approved: boolean,
    actorId: string,
  ): Promise<void> {
    await this.notifications.publish(tx, {
      key: approved ? 'edit_request_approved' : 'edit_request_closed',
      recipients: [{ user: ownerId }],
      params: { field_name: fieldName([field]) },
      about: requestId,
      actorId,
    });
  }

  /** The person whose account was blocked or unblocked; the audit log keeps the official record. */
  async blockChanged(tx: Tx, userId: string, blocked: boolean, actorId: string): Promise<void> {
    await this.notifications.publish(tx, {
      key: blocked ? 'account_blocked' : 'account_unblocked',
      recipients: [{ user: userId }],
      params: {},
      about: userId,
      actorId,
    });
  }

  /** Items of a leaving official were handed over: the official who receives them, with email. */
  async handoverAssigned(
    tx: Tx,
    handoverId: string,
    fromUserId: string,
    toUserId: string,
    count: number,
    actorId: string,
  ): Promise<void> {
    const from = await tx.user.findUniqueOrThrow({
      where: { id: fromUserId },
      select: { displayName: true },
    });
    await this.notifications.publish(tx, {
      key: 'handover_items_assigned',
      recipients: [{ user: toUserId }],
      params: { from_name: from.displayName, count },
      about: `${handoverId}:${toUserId}`,
      actorId,
    });
  }

  async handoverCompleted(tx: Tx, userId: string, count: number, actorId: string): Promise<void> {
    await this.notifications.publish(tx, {
      key: 'handover_completed',
      recipients: [{ roles: MONITORING }],
      params: { count },
      about: userId,
      actorId,
    });
  }
}
