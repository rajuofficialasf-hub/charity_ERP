import {
  ATTENTION_ROUTES,
  type AttentionItem,
  type AttentionKind,
  EDIT_ANSWERED_DAYS,
} from '@css/shared';
import type { ProjectFilter } from '@css/shared/projects';
import {
  applicationWhere,
  holdsPermission,
  mediaReferralWhere,
  projectWhere,
} from '../access/scope.js';
import type { AccessService } from '../access/service.js';
import type { Principal } from '../auth/principal.js';
import type { UnlocksService } from '../applications/unlocks.js';
import type { Clock } from '../core/clock.js';
import type { PrismaService } from '../core/prisma.service.js';
import type { Prisma } from '../generated/prisma/client.js';
import type { ChangeRequestsService } from './change-requests.js';
import type { InboxService } from './inbox.js';
import type { MyProjectsService } from './my-projects.js';
import type { ProjectsService } from './projects.js';
import { CORRECTION } from './registrations.js';
import type { RegistrationsService } from './registrations.js';

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
          // asked and not yet sent again: an answered row waits for the person's resubmit too
          where: {
            volunteer: { userId: principal.userId },
            kind: CORRECTION,
            status: { in: ['open', 'submitted'] },
          },
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
        'verifications_pending',
        this.verificationsPending(principal).then(({ count, first }) => {
          if (first) hrefs.verifications_pending = `/admin/applications/${first}`;
          return count;
        }),
      ],
      [
        'applications_waiting',
        this.applicationsWaiting(principal).then(({ count, first }) => {
          if (first) hrefs.applications_waiting = `/admin/applications/${first}`;
          return count;
        }),
      ],
      ...this.mediaCounts(principal),
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

  /**
   * The public and offline entries waiting for verification inside the caller's verification
   * scope, and the oldest one, which the item opens.
   */
  private async verificationsPending(
    principal: Principal,
  ): Promise<{ count: number; first: string | null }> {
    const permission = 'application.verify_needs_verification';
    const access = await this.access.load(principal.userId);
    if (!holdsPermission(permission, access.grants)) return { count: 0, first: null };
    const scope = await this.access.scopeFor(principal, access, permission, 'application');
    const where = {
      AND: [
        { status: 'needs_verification', project: { status: 'active' } },
        applicationWhere(scope),
      ],
    };
    const [count, first] = await Promise.all([
      this.prisma.application.count({ where }),
      this.prisma.application.findFirst({
        where,
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
        select: { id: true },
      }),
    ]);
    return { count, first: first?.id ?? null };
  }

  /**
   * The applications of active projects waiting for what the caller may do next: the submitted
   * and the ones under review for a holder of the review, the reviewed ones for a holder of the
   * approval (the transitions of docs/architecture/workflow-templates/_common.yaml), each inside
   * the scope of its own permission; and the one that has waited longest, which the item opens.
   */
  private async applicationsWaiting(
    principal: Principal,
  ): Promise<{ count: number; first: string | null }> {
    if (principal.kind === 'volunteer') return { count: 0, first: null };
    const access = await this.access.load(principal.userId);
    const parts: Prisma.ApplicationWhereInput[] = [];
    const waits: [string, Prisma.StringFilter<'Application'> | string][] = [
      ['application.review', { in: ['submitted', 'under_review'] }],
      ['application.approve', 'reviewed'],
    ];
    for (const [permission, status] of waits) {
      if (!holdsPermission(permission, access.grants)) continue;
      const scope = await this.access.scopeFor(principal, access, permission, 'application');
      parts.push({ AND: [{ status }, applicationWhere(scope)] });
    }
    if (parts.length === 0) return { count: 0, first: null };
    const where = { AND: [{ project: { status: 'active' } }, { OR: parts }] };
    const [count, first] = await Promise.all([
      this.prisma.application.count({ where }),
      this.prisma.application.findFirst({
        where,
        orderBy: [{ updatedAt: 'asc' }, { id: 'asc' }],
        select: { id: true },
      }),
    ]);
    return { count, first: first?.id ?? null };
  }

  /**
   * The Media Team's waiting work, each counted inside the scope of the permission that acts on
   * it: the referrals to decide, the works waiting for the final review, the works sent back to
   * the team, and the caller's own works on hold.
   */
  private mediaCounts(principal: Principal): [AttentionKind, Promise<number>][] {
    if (principal.kind === 'volunteer') return [];
    const access = this.access.load(principal.userId);
    const reached = async (permission: string, where: Prisma.MediaReferralWhereInput) => {
      const effective = await access;
      if (!holdsPermission(permission, effective.grants)) return 0;
      const scope = await this.access.scopeFor(principal, effective, permission, 'application');
      return this.prisma.mediaReferral.count({
        where: { AND: [mediaReferralWhere(scope), where] },
      });
    };
    return [
      ['media_referrals_new', reached('media.referral.decide', { state: 'pending' })],
      [
        'media_review_waiting',
        reached('media.publication.review', {
          work: { stageCode: 'ready_to_publish', reviewApprovedBy: null },
        }),
      ],
      ['media_sent_back', reached('media.work.manage', { work: { stageCode: 'in_review' } })],
      [
        'media_on_hold',
        this.prisma.mediaWork.count({
          where: { stageCode: 'on_hold', members: { some: { userId: principal.userId } } },
        }),
      ],
    ];
  }

  /** Projects the volunteer was assigned to whose rules wait for their answer. */
  private async consentPending(principal: Principal): Promise<number> {
    if (principal.kind !== 'volunteer') return 0;
    const projects = await this.myProjects.list(principal);
    return projects.filter((p) => p.consentStatus === 'pending').length;
  }
}
