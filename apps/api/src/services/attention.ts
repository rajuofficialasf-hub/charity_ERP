import {
  ATTENTION_ROUTES,
  type AttentionItem,
  type AttentionKind,
  EDIT_ANSWERED_DAYS,
} from '@css/shared';
import type { ProjectFilter } from '@css/shared/projects';
import { holdsPermission, projectWhere } from '../access/scope';
import type { AccessService } from '../access/service';
import type { Principal } from '../auth/principal';
import type { UnlocksService } from '../applications/unlocks';
import type { Clock } from '../core/clock';
import type { PrismaService } from '../core/prisma.service';
import type { ChangeRequestsService } from './change-requests';
import type { InboxService } from './inbox';
import type { MyProjectsService } from './my-projects';
import type { ProjectsService } from './projects';
import { CORRECTION } from './registrations';
import type { RegistrationsService } from './registrations';

const DAY = 86_400_000;

/**
 * "Needs your attention" of the My Work home (docs/ui/SCREENS.md, My Work): one call with the
 * counted items for the caller's own work and for the records their roles reach. An item for
 * officials' work is counted only when the caller holds its permission, in its scope, with the
 * filter of the list it opens (and, for projects, inside the scope of that list too); items with
 * nothing waiting are left out.
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
    private readonly projects: ProjectsService,
    private readonly unlocks: UnlocksService,
  ) {}

  async items(principal: Principal): Promise<AttentionItem[]> {
    const access = await this.access.load(principal.userId);
    // the caller's scope for a permission, or null when they do not hold it
    const scopeOf = async (permission: string, entity: 'volunteer' | 'project' | 'user') =>
      holdsPermission(permission, access.grants)
        ? this.access.scopeFor(principal, access, permission, entity)
        : null;
    // projects of the list the item opens, among those the caller may act on
    const projectCount = async (permission: string, filter: ProjectFilter) => {
      const [view, act] = await Promise.all([
        scopeOf('project.view', 'project'),
        scopeOf(permission, 'project'),
      ]);
      if (!view || !act) return 0;
      return this.prisma.project.count({
        where: {
          AND: [this.projects.listWhere(filter, { principal, scope: view }), projectWhere(act)],
        },
      });
    };
    const now = this.clock.now();
    // the entered values to verify: the item opens the application that has waited longest
    const toDecide = this.unlocks.waitingToDecide(principal);
    const hrefs: Partial<Record<AttentionKind, string>> = {};
    const counts: [AttentionKind, Promise<number>][] = [
      // the inbox opens once the registration is approved
      [
        'unread_notifications',
        principal.state === 'active' ? this.inbox.unreadCount(principal) : Promise.resolve(0),
      ],
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
          scope ? this.registrations.waitingCount(principal, scope, 'volunteer') : 0,
        ),
      ],
      [
        'staff_registrations_pending',
        scopeOf('registration.approve', 'volunteer').then((scope) =>
          scope ? this.registrations.waitingCount(principal, scope, 'staff') : 0,
        ),
      ],
      [
        'edit_requests_pending',
        scopeOf('edit_request.approve', 'volunteer').then((scope) =>
          scope ? this.changeRequests.waitingCount(scope) : 0,
        ),
      ],
      ['projects_draft', projectCount('project.activate', { status: 'draft' })],
      [
        'deadlines_soon',
        projectCount('project.deadline.extend', { status: 'active', endingSoon: 'true' }),
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
      ['unlocks_to_fill', this.unlocks.waitingToFill(principal)],
      [
        'unlocks_to_verify',
        toDecide.then(({ count, first }) => {
          if (first) hrefs.unlocks_to_verify = `/admin/applications/${first}`;
          return count;
        }),
      ],
    ];
    const settled = await Promise.all(counts.map(async ([kind, n]) => [kind, await n] as const));
    return (
      settled
        .filter(([, count]) => count > 0)
        // eslint-disable-next-line security/detect-object-injection -- a typed kind
        .map(([kind, count]) => ({ kind, count, href: hrefs[kind] ?? ATTENTION_ROUTES[kind] }))
    );
  }

  /** Projects the volunteer was assigned to whose rules wait for their answer. */
  private async consentPending(principal: Principal): Promise<number> {
    if (principal.kind !== 'volunteer') return 0;
    const projects = await this.myProjects.list(principal);
    return projects.filter((p) => p.consentStatus === 'pending').length;
  }
}
