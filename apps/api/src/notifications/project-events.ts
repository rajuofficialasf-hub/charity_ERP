import { formatDate } from '@css/shared/format';
import type { Bilingual } from '@css/shared/i18n';
import type { Tx } from '../core/prisma.service.js';
import { bilingualText } from './account-events.js';
import type { NotificationService } from './service.js';

type LifecycleKey = 'project_activated' | 'project_closing' | 'project_closed' | 'project_reopened';

/**
 * The project, assignment and consent events of the notification matrix
 * (docs/architecture/NOTIFICATIONS.md, projects, assignment and consent), published inside the
 * transaction of the business write. Entries name the project and link to it, never a person.
 */
export class ProjectEvents {
  constructor(private readonly notifications: NotificationService) {}

  private async projectName(tx: Tx, projectId: string): Promise<Bilingual> {
    const p = await tx.project.findUniqueOrThrow({
      where: { id: projectId },
      select: { nameBn: true, nameEn: true },
    });
    return { bn: p.nameBn, en: p.nameEn };
  }

  /** The later steps reach the people working on a project; the activation has its own. */
  async lifecycle(
    tx: Tx,
    key: Exclude<LifecycleKey, 'project_activated'>,
    projectId: string,
    actorId: string,
  ): Promise<void> {
    await this.publishLifecycle(tx, key, projectId, actorId, { volunteers: true });
  }

  /**
   * An activated project reaches the RPMs of every area and its staff. Its volunteers were
   * assigned while it was a draft they could not see, so none has answered its rules yet: each is
   * now asked for the consent instead.
   */
  async activated(tx: Tx, projectId: string, actorId: string): Promise<void> {
    await this.publishLifecycle(tx, 'project_activated', projectId, actorId, {
      rpms: true,
      volunteers: false,
    });
    const waiting = await tx.projectVolunteer.findMany({
      where: { projectId, endedAt: null, consentStatus: 'pending' },
      select: { volunteerId: true },
    });
    await this.assigned(
      tx,
      projectId,
      waiting.map((w) => w.volunteerId),
      actorId,
    );
  }

  private async publishLifecycle(
    tx: Tx,
    key: LifecycleKey,
    projectId: string,
    actorId: string,
    reach: { rpms?: boolean; volunteers: boolean },
  ): Promise<void> {
    await this.notifications.publish(tx, {
      key,
      recipients: [
        {
          project: {
            projectId,
            rpms: reach.rpms ?? false,
            staff: true,
            volunteers: reach.volunteers,
          },
        },
      ],
      // the reason of a reopening stays on the project page: this entry reaches everyone on it
      params: { project_name: await this.projectName(tx, projectId), projectId },
      about: projectId,
      actorId,
    });
  }

  /** `newDate` as yyyy-mm-dd; shown as dd-mm-yyyy. */
  async deadlineExtended(
    tx: Tx,
    projectId: string,
    newDate: string,
    actorId: string,
  ): Promise<void> {
    await this.notifications.publish(tx, {
      key: 'deadline_extended',
      recipients: [{ project: { projectId, rpms: true, volunteers: true } }],
      params: {
        project_name: await this.projectName(tx, projectId),
        new_date: formatDate(`${newDate}T00:00:00Z`),
        projectId,
      },
      about: projectId,
      actorId,
    });
  }

  /** Volunteers assigned to a project, waiting for their consent: in the app only. */
  async assigned(
    tx: Tx,
    projectId: string,
    volunteerIds: readonly string[],
    actorId: string,
  ): Promise<void> {
    await this.toVolunteers(tx, 'project_assignment', projectId, volunteerIds, actorId);
  }

  /** Members a main volunteer added to their team on a project. */
  async teamMembersAdded(
    tx: Tx,
    projectId: string,
    volunteerIds: readonly string[],
    actorId: string,
  ): Promise<void> {
    await this.toVolunteers(tx, 'team_member_added', projectId, volunteerIds, actorId);
  }

  private async toVolunteers(
    tx: Tx,
    key: 'project_assignment' | 'team_member_added',
    projectId: string,
    volunteerIds: readonly string[],
    actorId: string,
  ): Promise<void> {
    const volunteers = await tx.volunteer.findMany({
      where: { id: { in: [...volunteerIds] } },
      select: { userId: true },
    });
    if (!volunteers.length) return;
    await this.notifications.publish(tx, {
      key,
      recipients: volunteers.map((v) => ({ user: v.userId })),
      params: { project_name: await this.projectName(tx, projectId), projectId },
      about: projectId,
      actorId,
    });
  }

  /** A volunteer answered the project's rules: the RPMs of the volunteer's area. */
  async consentResult(
    tx: Tx,
    projectId: string,
    regionLocationId: string | null,
    accepted: boolean,
    actorId: string,
  ): Promise<void> {
    // an answer without a known area tells nobody rather than every RPM of the project
    if (!regionLocationId) return;
    await this.notifications.publish(tx, {
      key: 'project_consent_result',
      recipients: [{ project: { projectId, rpms: true, regionLocationId } }],
      params: {
        project_name: await this.projectName(tx, projectId),
        result: bilingualText(
          accepted
            ? 'common.notification.consent_accepted'
            : 'common.notification.consent_declined',
        ),
        projectId,
      },
      // the answers of one kind within 15 minutes are counted on one entry
      about: `${projectId}:${accepted ? 'accepted' : 'declined'}`,
      actorId,
    });
  }

  /** The extra permissions of a person on one project were set. */
  async grantsChanged(
    tx: Tx,
    projectId: string,
    userId: string,
    count: number,
    actorId: string,
  ): Promise<void> {
    await this.notifications.publish(tx, {
      key: 'project_grant_changed',
      recipients: [{ user: userId }],
      params: {
        project_name: await this.projectName(tx, projectId),
        summary: bilingualText('common.notification.project_permissions', { count }),
        projectId,
      },
      about: `${projectId}:${userId}`,
      actorId,
    });
  }
}
