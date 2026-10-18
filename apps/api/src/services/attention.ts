import {
  ATTENTION_ROUTES,
  type AttentionItem,
  type AttentionKind,
  DEADLINE_SOON_DAYS,
  EDIT_ANSWERED_DAYS,
} from '@css/shared';
import { isoDateInDhaka } from '@css/shared/format';
import { holdsPermission, projectWhere } from '../access/scope';
import type { AccessService } from '../access/service';
import type { Principal } from '../auth/principal';
import type { Clock } from '../core/clock';
import type { PrismaService } from '../core/prisma.service';
import type { ChangeRequestsService } from './change-requests';
import type { InboxService } from './inbox';
import type { MyProjectsService } from './my-projects';
import { CORRECTION } from './registrations';
import type { RegistrationsService } from './registrations';

const DAY = 86_400_000;

/**
 * "Needs your attention" of the My Work home (docs/ui/SCREENS.md, My Work): one call with the
 * counted items for the caller's own work and for the records their roles reach. An item for
 * officials' work is counted only when the caller holds its permission, in its scope, with the
 * filter of the list it opens; items with nothing waiting are left out.
 */
export class AttentionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: AccessService,
    private readonly clock: Clock,
    private readonly inbox: InboxService,
    private readonly myProjects: MyProjectsService,
    private readonly registrations: RegistrationsService,
    private readonly changeRequests: ChangeRequestsService,
  ) {}

  async items(principal: Principal): Promise<AttentionItem[]> {
    const access = await this.access.load(principal.userId);
    // the caller's scope for a permission, or null when they do not hold it
    const scopeOf = async (permission: string, entity: 'volunteer' | 'project' | 'user') =>
      holdsPermission(permission, access.grants)
        ? this.access.scopeFor(principal, access, permission, entity)
        : null;
    const now = this.clock.now();
    const counts: [AttentionKind, Promise<number>][] = [
      ['unread_notifications', this.inbox.unreadCount(principal)],
      ['consent_pending', this.consentPending(principal)],
      [
        'corrections',
        this.prisma.volunteerChangeRequest.count({
          where: { volunteer: { userId: principal.userId }, kind: CORRECTION, status: 'open' },
        }),
      ],
      [
        'edit_answered',
        this.prisma.volunteerChangeRequest.count({
          where: {
            volunteer: { userId: principal.userId },
            kind: { not: CORRECTION },
            status: { in: ['approved', 'rejected'] },
            decidedAt: { gte: new Date(now.getTime() - EDIT_ANSWERED_DAYS * DAY) },
          },
        }),
      ],
      [
        'registrations_pending',
        scopeOf('registration.approve', 'volunteer').then((scope) =>
          scope ? this.registrations.waitingCount(principal, scope) : 0,
        ),
      ],
      [
        'edit_requests_pending',
        scopeOf('edit_request.approve', 'volunteer').then((scope) =>
          scope ? this.changeRequests.waitingCount(scope) : 0,
        ),
      ],
      [
        'projects_draft',
        scopeOf('project.activate', 'project').then((scope) =>
          scope
            ? this.prisma.project.count({
                where: { AND: [projectWhere(scope), { status: 'draft' }] },
              })
            : 0,
        ),
      ],
      [
        'deadlines_soon',
        scopeOf('project.deadline.extend', 'project').then((scope) => {
          if (!scope) return 0;
          const today = isoDateInDhaka(now);
          const last = isoDateInDhaka(new Date(now.getTime() + DEADLINE_SOON_DAYS * DAY));
          return this.prisma.project.count({
            where: {
              AND: [
                projectWhere(scope),
                {
                  status: 'active',
                  applyTo: {
                    gte: new Date(`${today}T00:00:00Z`),
                    lte: new Date(`${last}T00:00:00Z`),
                  },
                },
              ],
            },
          });
        }),
      ],
      [
        'handovers_open',
        scopeOf('user.handover', 'user').then((scope) =>
          scope
            ? this.prisma.handover.count({
                where: { completedAt: null, fromUser: this.access.userFilter(scope) },
              })
            : 0,
        ),
      ],
    ];
    const settled = await Promise.all(counts.map(async ([kind, n]) => [kind, await n] as const));
    return settled
      .filter(([, count]) => count > 0)
      // eslint-disable-next-line security/detect-object-injection -- a typed kind
      .map(([kind, count]) => ({ kind, count, href: ATTENTION_ROUTES[kind] }));
  }

  /** Projects the volunteer was assigned to whose rules wait for their answer. */
  private async consentPending(principal: Principal): Promise<number> {
    if (principal.kind !== 'volunteer') return 0;
    const projects = await this.myProjects.list(principal);
    return projects.filter((p) => p.consentStatus === 'pending').length;
  }
}
