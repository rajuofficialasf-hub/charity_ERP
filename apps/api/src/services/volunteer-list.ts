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
import {
  buildPage,
  decodeCursor,
  keysetWhere,
  orderBy,
  type PageQuery,
  parseSort,
} from '../core/pagination';
import type { PrismaService, Tx } from '../core/prisma.service';
import type { Prisma } from '../generated/prisma/client';
import { ApiError } from '../i18n/api-error';

/** The newest volunteers first; the id breaks ties (API_STANDARDS 4). */
const SORT = parseSort(undefined, ['createdAt', 'id'], [{ field: 'createdAt', direction: 'desc' }]);

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
  createdAt: true,
  user: { select: { displayName: true, state: true } },
  projectVolunteersVolunteer: {
    where: { endedAt: null },
    select: { project: { select: { id: true, code: true, nameBn: true, nameEn: true } } },
    orderBy: { createdAt: 'desc' },
  },
} satisfies Prisma.VolunteerSelect;

/** A mobile number written in digits (with or without +88) as the stored 01XXXXXXXXX. */
function mobileOf(digits: string): string | null {
  const local = digits.startsWith('880') ? digits.slice(2) : digits;
  return /^01[3-9][0-9]{8}$/.test(local) ? local : null;
}

/** The caller's view of the list: whether categories are visible, and the NID search scope. */
export interface ListViewer {
  principal: Principal;
  /** The protected field classes of the caller (RBAC.md 6). */
  fieldClasses: ReadonlySet<string>;
}

/**
 * The nationwide volunteer tab (MASTER_SPEC A5; DECISION_LOG O-67, D-094): every volunteer for a
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
  async where(filter: VolunteerFilter, viewer: ListViewer): Promise<Prisma.VolunteerWhereInput> {
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
      const blocked = await this.blockedIds();
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
    if (!/^[+0-9\s-]+$/.test(term))
      return { user: { displayName: { contains: term, mode: 'insensitive' } } };
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

  async list(query: VolunteerFilter & PageQuery, viewer: ListViewer) {
    const binding = `volunteers.list|${viewer.principal.userId}`;
    const cursor = query.cursor
      ? decodeCursor(this.env.CURSOR_SECRET, binding, query.cursor)
      : undefined;
    const direction = cursor?.d ?? 'next';
    const filter = await this.where(query, viewer);
    const { fetched, total, blocked } = await boundedRead(this.prisma, async (tx) => {
      const fetched = await tx.volunteer.findMany({
        where: cursor ? { AND: [filter, keysetWhere(SORT, cursor)] } : filter,
        orderBy: orderBy(SORT, direction),
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
      hadCursor: Boolean(cursor),
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

  /** The counts for the filters in use: people by state, and their applications by stage. */
  async statistics(filter: VolunteerFilter, viewer: ListViewer) {
    const where = await this.where(filter, viewer);
    const seesCategories = viewer.fieldClasses.has('volunteer.rating');
    return boundedRead(this.prisma, async (tx) => {
      const count = (extra: Prisma.VolunteerWhereInput) =>
        tx.volunteer.count({ where: { AND: [where, extra] } });
      const applications = (status: Prisma.StringFilter) =>
        tx.application.count({ where: { status, ownerVolunteer: { is: where } } });
      const volunteers = {
        total: await tx.volunteer.count({ where }),
        active: await count({ user: { state: 'active' } }),
        pending: await count({ user: { state: 'pending' } }),
        blocked: await count({ user: { state: 'blocked' } }),
        deactivated: await count({ user: { state: 'deactivated' } }),
        ...(seesCategories ? { inactive: await count({ inactiveFlag: true }) } : {}),
      };
      return {
        volunteers,
        applications: {
          total: await applications({ notIn: [...UNCOUNTED_STATES] }),
          approved: await applications({ in: [...APPROVED_STATES] }),
          underReview: await applications({ in: [...UNDER_REVIEW_STATES] }),
        },
      };
    });
  }
}
