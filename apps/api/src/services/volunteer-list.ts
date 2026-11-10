import {
  APPROVED_STATES,
  UNCOUNTED_STATES,
  UNDER_REVIEW_STATES,
  type VolunteerFilter,
} from '@css/shared/volunteers';
import type { AccessService } from '../access/service';
import { type Scope, volunteerWhere } from '../access/scope';
import type { Principal } from '../auth/principal';
import type { Env } from '../config/env';
import { boundedRead } from '../core/bounded-read';
import { isNumberTerm, literalContains, mobileOf } from '../core/search';
import {
  buildPage,
  decodeCursor,
  keysetWhere,
  orderBy,
  type PageQuery,
  type PageNumberQuery,
  pageOffset,
  parseSort,
} from '../core/pagination';
import type { PrismaService, Tx } from '../core/prisma.service';
import type { Prisma } from '../generated/prisma/client';
import { ApiError } from '../i18n/api-error';

/**
 * The newest volunteers first, by id: the ids are UUID v7, so they follow the time of creation, and
 * unlike `created_at` (microseconds, cut to milliseconds in a cursor) they page without gaps.
 */
const SORT = parseSort(undefined, ['id'], [{ field: 'id', direction: 'desc' }]);

const ROW_SELECT = {
  id: true,
  userId: true,
  type: true,
  divisionId: true,
  districtId: true,
  upazilaId: true,
  photoFileId: true,
  category: true,
  inactiveFlag: true,
  user: { select: { displayName: true, state: true } },
  projectVolunteersVolunteer: {
    where: { endedAt: null },
    select: { project: { select: { id: true, code: true, nameBn: true, nameEn: true } } },
    orderBy: { createdAt: 'desc' },
  },
} satisfies Prisma.VolunteerSelect;

/** The caller's view of the list: whether categories are visible, and the NID search scope. */
export interface ListViewer {
  principal: Principal;
  /** The protected field classes of the caller (docs/security/RBAC.md, "Field-level protection"). */
  fieldClasses: ReadonlySet<string>;
}

/**
 * The nationwide volunteer tab (docs/MASTER_SPEC.md, "Volunteer tab"): every volunteer for a
 * holder of `volunteer.view_all`, filtered, searched and counted with one shared filter. A filter
 * or a search on something the caller may not see is refused or never matches, so the answer
 * cannot reveal what the field mask hides.
 */
export class VolunteerListService {
  constructor(
    private readonly env: Env,
    private readonly prisma: PrismaService,
    private readonly access: AccessService,
  ) {}

  /** The filter of the list and of its counts; refuses a category filter the caller may not use. */
  async where(
    filter: VolunteerFilter,
    viewer: ListViewer,
    db: Tx = this.prisma,
  ): Promise<Prisma.VolunteerWhereInput> {
    const seesCategories = viewer.fieldClasses.has('volunteer.rating');
    if (filter.category && !seesCategories) {
      this.access.denied(viewer.principal.userId, 'volunteer.rating.view', 'volunteer');
      throw new ApiError('permission.denied', 403);
    }
    const and: Prisma.VolunteerWhereInput[] = [];
    for (const column of ['divisionId', 'districtId', 'upazilaId', 'unionId'] as const) {
      // eslint-disable-next-line security/detect-object-injection -- a fixed list of column names
      const value = filter[column];
      if (value) and.push({ [column]: value });
    }
    if (filter.type) and.push({ type: filter.type });
    if (filter.state) and.push({ user: { state: filter.state } });
    if (filter.projectId)
      and.push({
        projectVolunteersVolunteer: { some: { projectId: filter.projectId, endedAt: null } },
      });
    if (filter.category)
      and.push(
        filter.category === 'inactive' ? { inactiveFlag: true } : { category: filter.category },
      );
    if (filter.blocked) {
      const blocked = await this.blockedIds(db);
      and.push(filter.blocked === 'true' ? { id: { in: blocked } } : { id: { notIn: blocked } });
    }
    if (filter.q) and.push(await this.searchWhere(filter.q, viewer));
    return and.length ? { AND: and } : {};
  }

  /**
   * A name matches by its letters; digits match the exact mobile number, and the exact NID only
   * inside the caller's `volunteer.view_sensitive` scope (an NID outside it never matches).
   */
  private async searchWhere(q: string, viewer: ListViewer): Promise<Prisma.VolunteerWhereInput> {
    const term = q.trim();
    if (!isNumberTerm(term))
      // LIKE wildcards in the term are letters, not patterns
      return {
        user: { displayName: { contains: literalContains(term), mode: 'insensitive' } },
      };
    const digits = term.replace(/\D/g, '');
    const or: Prisma.VolunteerWhereInput[] = [];
    const mobile = mobileOf(digits);
    if (mobile) or.push({ user: { mobile } });
    if ([10, 13, 17].includes(digits.length)) {
      const scope = await this.sensitiveScope(viewer);
      if (scope) or.push({ AND: [{ nid: digits }, volunteerWhere(scope)] });
    }
    return or.length ? { OR: or } : { id: { in: [] } };
  }

  private async sensitiveScope(viewer: ListViewer): Promise<Scope | null> {
    const access = await this.access.load(viewer.principal.userId);
    return this.access.sensitiveScope(
      viewer.principal,
      access,
      'volunteer.view_sensitive',
      'volunteer',
    );
  }

  /** The volunteers on the blocklist now. */
  private async blockedIds(db: Tx = this.prisma): Promise<string[]> {
    const rows = await db.blocklist.findMany({
      where: { subjectType: 'volunteer', active: true },
      select: { subjectId: true },
    });
    return rows.map((r) => r.subjectId);
  }

  async list(query: VolunteerFilter & PageQuery & PageNumberQuery, viewer: ListViewer) {
    const binding = `volunteers.list|${viewer.principal.userId}`;
    const cursor = query.cursor
      ? decodeCursor(this.env.CURSOR_SECRET, binding, query.cursor)
      : undefined;
    const direction = cursor?.d ?? 'next';
    const offset = pageOffset(query);
    const { fetched, total, blocked } = await boundedRead(this.prisma, async (tx) => {
      const filter = await this.where(query, viewer, tx);
      const fetched = await tx.volunteer.findMany({
        where: cursor ? { AND: [filter, keysetWhere(SORT, cursor)] } : filter,
        orderBy: orderBy(SORT, direction),
        skip: offset,
        take: query.limit + 1,
        select: ROW_SELECT,
      });
      const total =
        query.include === 'total' ? await tx.volunteer.count({ where: filter }) : undefined;
      const blocked = await tx.blocklist.findMany({
        where: {
          subjectType: 'volunteer',
          active: true,
          subjectId: { in: fetched.map((v) => v.id) },
        },
        select: { subjectId: true },
      });
      return { fetched, total, blocked: new Set(blocked.map((b) => b.subjectId)) };
    });
    const { rows, meta } = buildPage(fetched, {
      limit: query.limit,
      sort: SORT,
      direction,
      // a page past the first has a page before it, as a cursor does
      hadCursor: Boolean(cursor) || Boolean(offset),
      secret: this.env.CURSOR_SECRET,
      binding,
      total,
    });
    return {
      rows: rows.map((v) => ({
        id: v.id,
        userId: v.userId,
        displayName: v.user.displayName,
        type: v.type,
        state: v.user.state,
        divisionId: v.divisionId,
        districtId: v.districtId,
        upazilaId: v.upazilaId,
        photoFileId: v.photoFileId,
        blocked: blocked.has(v.id),
        projects: v.projectVolunteersVolunteer.map((a) => a.project),
        category: v.category,
        inactiveFlag: v.inactiveFlag,
      })),
      meta,
    };
  }

  /**
   * The counts for the filters in use: people by state, and their applications by stage. One
   * grouped query each (docs/testing/PERFORMANCE.md, section "What the measurement changed"): the people by account state, the inactive
   * flag, and the applications by status; without a filter the applications are counted by their
   * owner column alone, without joining the volunteers.
   */
  async statistics(filter: VolunteerFilter, viewer: ListViewer) {
    const seesCategories = viewer.fieldClasses.has('volunteer.rating');
    return boundedRead(this.prisma, async (tx) => {
      const where = await this.where(filter, viewer, tx);
      const filtered = Object.keys(where).length > 0;
      const people = await tx.user.groupBy({
        by: ['state'],
        where: { volunteersUser: { is: where } },
        _count: { _all: true },
      });
      const byState = new Map(people.map((g) => [g.state, g._count._all]));
      const stages = await tx.application.groupBy({
        by: ['status'],
        where: {
          status: { notIn: [...UNCOUNTED_STATES] },
          ...(filtered ? { ownerVolunteer: { is: where } } : { ownerVolunteerId: { not: null } }),
        },
        _count: { _all: true },
      });
      const sum = (states: readonly string[]) =>
        stages.filter((g) => states.includes(g.status)).reduce((n, g) => n + g._count._all, 0);
      const volunteers = {
        total: people.reduce((n, g) => n + g._count._all, 0),
        active: byState.get('active') ?? 0,
        pending: byState.get('pending') ?? 0,
        blocked: byState.get('blocked') ?? 0,
        deactivated: byState.get('deactivated') ?? 0,
        ...(seesCategories
          ? {
              inactive: await tx.volunteer.count({
                where: { AND: [where, { inactiveFlag: true }] },
              }),
            }
          : {}),
      };
      return {
        volunteers,
        applications: {
          total: stages.reduce((n, g) => n + g._count._all, 0),
          approved: sum(APPROVED_STATES),
          underReview: sum(UNDER_REVIEW_STATES),
        },
      };
    });
  }
}
