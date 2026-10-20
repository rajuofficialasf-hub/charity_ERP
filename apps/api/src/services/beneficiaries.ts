import { type BeneficiaryFilter, parseBenNo } from '@css/shared/beneficiaries';
import { APPROVED_STATES } from '@css/shared/volunteers';
import type { AccessService } from '../access/service';
import { beneficiaryRowsProjectWhere, beneficiaryWhere, type Scope } from '../access/scope';
import type { Principal } from '../auth/principal';
import type { Env } from '../config/env';
import { boundedRead } from '../core/bounded-read';
import { isNumberTerm, literalContains, mobileOf } from '../core/search';
import type { Clock } from '../core/clock';
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
import type { BeneficiaryIdentityService } from './beneficiary-identity';

/** Newest first by id (UUID v7 follows the time of creation and pages without gaps). */
const SORT = parseSort(undefined, ['id'], [{ field: 'id', direction: 'desc' }]);
/** The most rows a section of the 360° profile carries. */
const SECTION_ROWS = 20;
/** The field classes of the limited beneficiary view (docs/security/permissions.yaml). */
const CONTACT = 'beneficiary.contact';
const ADDRESS = 'beneficiary.address_detail';
const CARE = 'beneficiary.care';
const DETAIL = 'beneficiary.profile_detail';

/** The calendar year in Bangladesh (UTC+6). */
const dhakaYear = (now: Date) => new Date(now.getTime() + 6 * 3_600_000).getUTCFullYear();

export interface BeneficiaryViewer {
  principal: Principal;
  /** The route's scope (`beneficiary.view_all` for the entity `beneficiary`). */
  scope: Scope;
  fieldClasses: ReadonlySet<string>;
}

/**
 * The nationwide beneficiary tab and the 360° profile shell (docs/MASTER_SPEC.md, "Beneficiary
 * 360° profile and beneficiary tab"; DECISION_LOG O-67, D-094). Everyone the caller's scope reaches,
 * filtered, searched and counted with one shared filter; a filter or a search on a field the
 * caller may not see is refused or never matches. Inside a profile a project-scoped caller (the
 * Procurement Team) sees only the rows of its own projects.
 */
export class BeneficiariesService {
  constructor(
    private readonly env: Env,
    private readonly prisma: PrismaService,
    private readonly clock: Clock,
    private readonly access: AccessService,
    private readonly identity: BeneficiaryIdentityService,
  ) {}

  private refuse(viewer: BeneficiaryViewer, cls: string): never {
    this.access.denied(viewer.principal.userId, cls, 'beneficiary');
    throw new ApiError('permission.denied', 403);
  }

  /** The filter of the list and of its counts, inside the caller's scope. */
  async where(
    filter: BeneficiaryFilter,
    viewer: BeneficiaryViewer,
  ): Promise<Prisma.BeneficiaryWhereInput> {
    const sees = (cls: string) => viewer.fieldClasses.has(cls);
    if (filter.unionId && !sees(ADDRESS)) this.refuse(viewer, ADDRESS);
    if (filter.blocked && !sees(CARE)) this.refuse(viewer, CARE);
    if (filter.type && !sees(DETAIL)) this.refuse(viewer, DETAIL);
    const and: Prisma.BeneficiaryWhereInput[] = [
      beneficiaryWhere(viewer.scope),
      { mergedIntoId: null },
    ];
    for (const column of ['divisionId', 'districtId', 'upazilaId', 'unionId'] as const) {
      // eslint-disable-next-line security/detect-object-injection -- a fixed list of column names
      const value = filter[column];
      if (value) and.push({ [column]: value });
    }
    if (filter.type) and.push({ classCode: filter.type });
    if (filter.blocked) and.push({ isBlocked: filter.blocked === 'true' });
    if (filter.projectId || filter.year) {
      // a project-scoped caller filters only among its own projects, so the filter never tells it
      // who applied to another project
      const own = beneficiaryRowsProjectWhere(viewer.scope);
      and.push({
        applicationsBeneficiary: {
          some: {
            ...(filter.projectId ? { projectId: filter.projectId } : {}),
            project: { AND: [filter.year ? { year: filter.year } : {}, own ?? {}] },
          },
        },
      });
    }
    if (filter.q) and.push(await this.searchWhere(filter.q, viewer));
    return { AND: and };
  }

  /**
   * A BEN number matches its profile; letters match the name; digits match the exact mobile for
   * callers who see it, and the exact NID or birth-registration number only inside the caller's
   * `beneficiary.view_nid` scope. A retired profile's numbers lead to the kept profile, which the
   * list's own scope then filters like any other.
   */
  private async searchWhere(
    q: string,
    viewer: BeneficiaryViewer,
  ): Promise<Prisma.BeneficiaryWhereInput> {
    const term = q.trim();
    if (parseBenNo(term) !== null)
      return { id: { in: (await this.identity.idsByIdentity(term, null)) ?? [] } };
    if (!isNumberTerm(term))
      // LIKE wildcards in the term are letters, not patterns
      return { name: { contains: literalContains(term), mode: 'insensitive' } };
    const digits = term.replace(/\D/g, '');
    const or: Prisma.BeneficiaryWhereInput[] = [];
    const mobile = mobileOf(digits);
    if (mobile && viewer.fieldClasses.has(CONTACT)) or.push({ mobile });
    if ([10, 13, 17].includes(digits.length)) {
      const scope = await this.nidScope(viewer);
      const ids = scope ? await this.identity.idsByIdentity(digits, scope) : null;
      if (ids?.length) or.push({ id: { in: ids } });
    }
    return or.length ? { OR: or } : { id: { in: [] } };
  }

  private async nidScope(viewer: BeneficiaryViewer): Promise<Scope | null> {
    if (!viewer.fieldClasses.has('beneficiary.nid')) return null;
    const access = await this.access.load(viewer.principal.userId);
    return this.access.sensitiveScope(
      viewer.principal,
      access,
      'beneficiary.view_nid',
      'beneficiary',
    );
  }

  async list(query: BeneficiaryFilter & PageQuery & PageNumberQuery, viewer: BeneficiaryViewer) {
    const binding = `beneficiaries.list|${viewer.principal.userId}`;
    const cursor = query.cursor
      ? decodeCursor(this.env.CURSOR_SECRET, binding, query.cursor)
      : undefined;
    const direction = cursor?.d ?? 'next';
    const offset = pageOffset(query);
    const filter = await this.where(query, viewer);
    const { fetched, total } = await boundedRead(this.prisma, async (tx) => ({
      fetched: await tx.beneficiary.findMany({
        where: cursor ? { AND: [filter, keysetWhere(SORT, cursor)] } : filter,
        orderBy: orderBy(SORT, direction),
        skip: offset,
        take: query.limit + 1,
        select: {
          id: true,
          benNo: true,
          name: true,
          fatherOrHusbandName: true,
          classCode: true,
          status: true,
          divisionId: true,
          districtId: true,
          upazilaId: true,
          unionId: true,
          village: true,
          mobile: true,
          isBlocked: true,
        },
      }),
      total: query.include === 'total' ? await tx.beneficiary.count({ where: filter }) : undefined,
    }));
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
    return { rows, meta };
  }

  /**
   * The counts for the filters in use: everyone, those assisted this year, the blocked; one read,
   * so the three counts share a snapshot and a connection.
   */
  async statistics(filter: BeneficiaryFilter, viewer: BeneficiaryViewer) {
    const where = await this.where(filter, viewer);
    const year = dhakaYear(this.clock.now());
    const rowsProjects = beneficiaryRowsProjectWhere(viewer.scope);
    return boundedRead(this.prisma, async (tx) => ({
      total: await tx.beneficiary.count({ where }),
      assistedThisYear: await tx.beneficiary.count({
        where: {
          AND: [
            where,
            {
              applicationsBeneficiary: {
                some: {
                  status: { in: [...APPROVED_STATES] },
                  project: { AND: [{ year }, rowsProjects ?? {}] },
                },
              },
            },
          ],
        },
      }),
      blocked: await tx.beneficiary.count({ where: { AND: [where, { isBlocked: true }] } }),
    }));
  }

  /** The 360° profile of one beneficiary in the caller's scope, or 404. */
  async profile(viewer: BeneficiaryViewer, beneficiaryId: string) {
    const rows = beneficiaryRowsProjectWhere(viewer.scope);
    const inProjects = rows ? { project: rows } : {};
    const [access, found] = await Promise.all([
      this.access.load(viewer.principal.userId),
      boundedRead(this.prisma, (tx) => this.read(tx, viewer, beneficiaryId, inProjects)),
    ]);
    if (!found) {
      this.access.denied(viewer.principal.userId, viewer.scope.permission, 'beneficiary');
      throw new ApiError('permission.not_found', 404);
    }
    const { b, applications, activities, distributions } = found;
    const nidScope = viewer.fieldClasses.has('beneficiary.nid')
      ? await this.access.sensitiveScope(
          viewer.principal,
          access,
          'beneficiary.view_nid',
          'beneficiary',
        )
      : null;
    const seesNid = !!nidScope && (await this.access.reaches(nidScope, { beneficiaryId: b.id }));
    const years = new Map<number, { year: number; projects: Map<string, ProjectOfYear> }>();
    for (const a of applications) {
      const year = years.get(a.project.year) ?? { year: a.project.year, projects: new Map() };
      year.projects.set(a.project.id, {
        id: a.project.id,
        code: a.project.code,
        nameBn: a.project.nameBn,
        nameEn: a.project.nameEn,
        status: a.status,
      });
      years.set(a.project.year, year);
    }
    return {
      id: b.id,
      benNo: b.benNo,
      name: b.name,
      fatherOrHusbandName: b.fatherOrHusbandName,
      motherName: b.motherName,
      genderCode: b.genderCode,
      ageYears: b.ageYears,
      classCode: b.classCode,
      classOtherText: b.classOtherText,
      occupationCode: b.occupationCode,
      status: b.status,
      photoFileId: b.photoFileId,
      divisionId: b.divisionId,
      districtId: b.districtId,
      upazilaId: b.upazilaId,
      unionId: b.unionId,
      village: b.village,
      postOffice: b.postOffice,
      postCode: b.postCode,
      landmark: b.landmark,
      mobile: b.mobile,
      familyMembers: b.beneficiaryFamilyMembersBeneficiary.map((m) => ({
        id: m.id,
        name: m.name,
        relationshipCode: m.relationshipCode,
        ageYears: m.ageYears,
      })),
      ...(seesNid ? { nid: b.nid ?? null, birthReg: b.birthReg ?? null } : {}),
      isBlocked: b.isBlocked,
      projectsByYear: [...years.values()]
        .sort((x, y) => y.year - x.year)
        .map((y) => ({ year: y.year, projects: [...y.projects.values()] })),
      applications: applications.map((a) => ({
        id: a.id,
        appNo: a.appNo,
        projectId: a.project.id,
        status: a.status,
        submittedAt: a.submittedAt?.toISOString() ?? null,
        reviewedAt: a.reviewedAt?.toISOString() ?? null,
        approvedAt: a.approvedAt?.toISOString() ?? null,
      })),
      distributions: distributions.map((a) => ({
        id: a.id,
        applicationId: a.applicationId,
        projectId: a.projectId,
        status: a.status,
        doneAt: a.doneAt.toISOString(),
      })),
      dawah: {
        attendance: b.classAttendanceBeneficiary.map((r) => ({
          id: r.id,
          present: r.present,
          at: r.createdAt.toISOString(),
        })),
        progress: b.learningProgressBeneficiary.map((r) => ({
          id: r.id,
          status: r.status,
          at: r.createdAt.toISOString(),
        })),
        exams: b.examResultsBeneficiary.map((r) => ({
          id: r.id,
          passed: r.passed,
          score: r.score === null ? null : Number(r.score),
          at: r.createdAt.toISOString(),
        })),
      },
      followUps: {
        calls: b.callLogsBeneficiary.map((r) => ({
          id: r.id,
          projectId: r.projectId,
          at: r.calledAt.toISOString(),
        })),
        evaluations: b.followupEvaluationsBeneficiary.map((r) => ({
          id: r.id,
          projectId: r.projectId,
          result: r.result,
          at: r.evaluatedAt.toISOString(),
        })),
      },
      activities: activities.map((a) => ({
        id: a.id,
        applicationId: a.applicationId,
        projectId: a.projectId,
        type: a.type,
        stage: a.stage,
        status: a.status,
        doneAt: a.doneAt.toISOString(),
      })),
    };
  }

  /** The profile's reads, inside one time-limited transaction. */
  private async read(
    tx: Tx,
    viewer: BeneficiaryViewer,
    beneficiaryId: string,
    inProjects: { project?: Prisma.ProjectWhereInput },
  ) {
    // a section the caller may not see is not read at all (the field mask would only drop it)
    const sees = (cls: string) => viewer.fieldClasses.has(cls);
    const care = sees(CARE);
    const none = { take: 0 };
    const latest = { orderBy: { createdAt: 'desc' as const }, take: SECTION_ROWS };
    const projectRows = inProjects.project ? { OR: [{ projectId: null }, inProjects] } : {};
    const b = await tx.beneficiary.findFirst({
      // a profile merged into another one is read through the kept profile
      where: { AND: [{ id: beneficiaryId, mergedIntoId: null }, beneficiaryWhere(viewer.scope)] },
      select: {
        id: true,
        benNo: true,
        nid: sees('beneficiary.nid'),
        birthReg: sees('beneficiary.nid'),
        name: true,
        fatherOrHusbandName: true,
        motherName: true,
        genderCode: true,
        ageYears: true,
        classCode: true,
        classOtherText: true,
        occupationCode: true,
        status: true,
        photoFileId: true,
        divisionId: true,
        districtId: true,
        upazilaId: true,
        unionId: true,
        village: true,
        postOffice: true,
        postCode: true,
        landmark: true,
        mobile: true,
        isBlocked: true,
        beneficiaryFamilyMembersBeneficiary: {
          where: { active: true },
          ...latest,
          ...(sees(CONTACT) ? {} : none),
          select: { id: true, name: true, relationshipCode: true, ageYears: true },
        },
        classAttendanceBeneficiary: {
          ...latest,
          ...(care ? {} : none),
          select: { id: true, present: true, createdAt: true },
        },
        learningProgressBeneficiary: {
          ...latest,
          ...(care ? {} : none),
          select: { id: true, status: true, createdAt: true },
        },
        examResultsBeneficiary: {
          ...latest,
          ...(care ? {} : none),
          select: { id: true, passed: true, score: true, createdAt: true },
        },
        callLogsBeneficiary: {
          where: projectRows,
          orderBy: { calledAt: 'desc' },
          take: care ? SECTION_ROWS : 0,
          select: { id: true, projectId: true, calledAt: true },
        },
        followupEvaluationsBeneficiary: {
          where: projectRows,
          orderBy: { evaluatedAt: 'desc' },
          take: care ? SECTION_ROWS : 0,
          select: { id: true, projectId: true, result: true, evaluatedAt: true },
        },
      },
    });
    if (!b) return null;
    const applications = await tx.application.findMany({
      where: { beneficiaryId: b.id, ...inProjects },
      ...latest,
      select: {
        id: true,
        appNo: true,
        status: true,
        submittedAt: true,
        reviewedAt: true,
        approvedAt: true,
        project: { select: { id: true, code: true, nameBn: true, nameEn: true, year: true } },
      },
    });
    const activitySelect = {
      id: true,
      applicationId: true,
      projectId: true,
      type: true,
      stage: true,
      status: true,
      doneAt: true,
    } as const;
    const ofThisPerson = { application: { beneficiaryId: b.id }, ...inProjects };
    const activities = care
      ? await tx.activity.findMany({
          where: ofThisPerson,
          orderBy: { doneAt: 'desc' },
          take: SECTION_ROWS,
          select: activitySelect,
        })
      : [];
    // the distributions on their own, so other activities never push them off the page
    const distributions = await tx.activity.findMany({
      where: { ...ofThisPerson, distributionsActivity: { isNot: null } },
      orderBy: { doneAt: 'desc' },
      take: SECTION_ROWS,
      select: activitySelect,
    });
    return { b, applications, activities, distributions };
  }
}

interface ProjectOfYear {
  id: string;
  code: string;
  nameBn: string;
  nameEn: string;
  status: string;
}
