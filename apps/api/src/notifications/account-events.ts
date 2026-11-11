import { formatDate, isoDateInDhaka } from '@css/shared/format';
import type { Bilingual, MessageKey, MessageParams } from '@css/shared/i18n';
import { translate } from '@css/shared/i18n';
import { REQUEST_FIELD_LABEL } from '@css/shared/registration';
import type { Logger } from 'pino';
import type { Tx } from '../core/prisma.service.js';
import { MONITORING } from './recipients.js';
import type { NotificationService } from './service.js';

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

/** A catalogue text in both languages. */
export function bilingualText(key: MessageKey, params?: MessageParams): Bilingual {
  return { bn: translate('bn', key, params), en: translate('en', key, params) };
}

const PERMISSION_CHANGE = {
  granted: 'common.notification.permission_granted',
  denied: 'common.notification.permission_denied',
  ended: 'common.notification.permission_ended',
} as const satisfies Record<string, MessageKey>;

/** Lockouts in one Dhaka day that send the Monitoring Team an email. */
export const LOCKOUT_ALERT_PER_DAY = 10;

/**
 * The registration, account and handover events of the notification matrix
 * (docs/architecture/NOTIFICATIONS.md, registration, accounts and security), published inside the
 * transaction of the business write, so a rolled-back write tells nobody.
 */
export class AccountEvents {
  constructor(
    private readonly notifications: NotificationService,
    private readonly logger: Logger,
  ) {}

  /**
   * Notices of a security write (a lockout, a revoked stolen session) in a savepoint: a notice
   * that cannot be written is logged and never undoes the write it reports.
   */
  private async apart(tx: Tx, key: string, write: () => Promise<void>): Promise<void> {
    await tx.$executeRaw`SAVEPOINT security_notice`;
    try {
      await write();
      await tx.$executeRaw`RELEASE SAVEPOINT security_notice`;
    } catch (error) {
      await tx.$executeRaw`ROLLBACK TO SAVEPOINT security_notice`;
      this.logger.error({ err: error, key }, 'security notice not written');
    }
  }

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
      select: { field: true, volunteerId: true, userId: true },
    });
    if (!request) return;
    // a volunteer's request reaches its approvers in scope; an official's, those who decide it
    const holders = request.volunteerId
      ? {
          permission: 'edit_request.approve',
          entity: 'volunteer' as const,
          target: { volunteerId: request.volunteerId },
        }
      : {
          permission: 'staff_edit_request.approve',
          entity: 'user' as const,
          target: { userId: request.userId },
        };
    await this.notifications.publish(tx, {
      key: 'edit_request_submitted',
      recipients: [{ holders }],
      params: { field_name: fieldName([request.field]) },
      about: requestId,
      actorId: request.userId,
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

  /** A panel override of the person's permissions was set or ended. */
  async permissionChanged(
    tx: Tx,
    userId: string,
    change: keyof typeof PERMISSION_CHANGE,
    permission: string,
    actorId: string,
  ): Promise<void> {
    await this.notifications.publish(tx, {
      key: 'permission_changed',
      recipients: [{ user: userId }],
      // eslint-disable-next-line security/detect-object-injection -- a typed key
      params: { summary: bilingualText(PERMISSION_CHANGE[change], { permission }) },
      about: userId,
      actorId,
    });
  }

  /** An official ended one of the person's device sessions. */
  async sessionRevoked(
    tx: Tx,
    userId: string,
    sessionId: string,
    deviceName: string | null,
    actorId: string,
  ): Promise<void> {
    await this.notifications.publish(tx, {
      key: 'session_revoked',
      recipients: [{ user: userId }],
      params: {
        device_name: deviceName ?? bilingualText('common.notification.unknown_device'),
      },
      about: sessionId,
      actorId,
    });
  }

  /**
   * The account was locked after wrong passwords; the tenth lockout of a Dhaka day also emails the
   * Monitoring Team. Counted from the audit entries, the one of this lockout included.
   */
  async accountLocked(tx: Tx, userId: string, minutes: number, now: Date): Promise<void> {
    await this.apart(tx, 'account_locked', async () => {
      await this.notifications.publish(tx, {
        key: 'account_locked',
        recipients: [{ user: userId }],
        params: { minutes },
        about: userId,
      });
      await this.lockoutAlert(tx, now);
    });
  }

  private async lockoutAlert(tx: Tx, now: Date): Promise<void> {
    const day = isoDateInDhaka(now);
    // lockouts of one day are counted one after another, so exactly one of them sees the tenth
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`lockout-alert:${day}`}, 0))`;
    const [row] = await tx.$queryRaw<{ count: number }[]>`
      SELECT count(*)::int AS count FROM audit_log
       WHERE action = 'auth.locked' AND created_at >= ${new Date(`${day}T00:00:00+06:00`)}`;
    const count = row?.count ?? 0;
    if (count !== LOCKOUT_ALERT_PER_DAY) return;
    await this.notifications.publish(tx, {
      key: 'security_lockout_alert',
      recipients: [{ roles: MONITORING }],
      params: { count, date: formatDate(now) },
      about: day,
    });
  }

  /**
   * A rotated refresh token was used again and its session ended: the person in the app, the
   * Monitoring Team by email (the texts speak to each).
   */
  async refreshReused(tx: Tx, userId: string, sessionId: string): Promise<void> {
    await this.apart(tx, 'security_refresh_reuse', () => this.reuseNotices(tx, userId, sessionId));
  }

  private async reuseNotices(tx: Tx, userId: string, sessionId: string): Promise<void> {
    await this.notifications.publish(tx, {
      key: 'security_refresh_reuse',
      recipients: [{ user: userId }],
      params: {},
      about: sessionId,
      only: 'in_app',
    });
    const user = await tx.user.findUniqueOrThrow({
      where: { id: userId },
      select: { displayName: true },
    });
    await this.notifications.publish(tx, {
      key: 'security_refresh_reuse',
      recipients: [{ roles: MONITORING }],
      params: { user_name: user.displayName },
      // one email per person within 15 minutes, however many sessions are replayed
      about: userId,
      actorId: userId,
      only: 'email',
    });
  }
}
