import type { BeneficiaryFilter } from '@css/shared/beneficiaries';
import { APPROVED_STATES } from '@css/shared/volunteers';
import type { AccessService } from '../access/service';
import { beneficiaryRowsProjectWhere, beneficiaryWhere, type Scope } from '../access/scope';
import type { Principal } from '../auth/principal';
import type { Env } from '../config/env';
import { boundedRead } from '../core/bounded-read';
import type { Clock } from '../core/clock';
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

/** Newest first by id (UUID v7 follows the time of creation and pages without gaps). */
const SORT = parseSort(undefined, ['id'], [{ field: 'id', direction: 'desc' }]);
/** The most rows a section of the 360° profile carries. */
const SECTION_ROWS = 20;
/** The field classes of the limited beneficiary view (docs/security/permissions.yaml). */
const CONTACT = 'beneficiary.contact';
const ADDRESS = 'beneficiary.address_detail';
const CARE = 'beneficiary.care';

/** The calendar year in Bangladesh (UTC+6). */
const dhakaYear = (now: Date) => new Date(now.getTime() + 6 * 3_600_000).getUTCFullYear();

/** A mobile number in digits (with or without +88) as the stored 01XXXXXXXXX. */
function mobileOf(digits: string): string | null {
  const local = digits.startsWith('880') ? digits.slice(2) : digits;
  return /^01[3-9][0-9]{8}$/.test(local) ? local : null;
}

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
    if (filter.projectId || filter.year)
      and.push({
        applicationsBeneficiary: {
          some: {
            ...(filter.projectId ? { projectId: filter.projectId } : {}),
            ...(filter.year ? { project: { year: filter.year } } : {}),
          },
        },
      });
    if (filter.q) and.push(await this.searchWhere(filter.q, viewer));
    return { AND: and };
  }

  /**
   * Letters match the name; digits match the exact mobile for callers who see it, and the exact NID
   * or birth-registration number only inside the caller's `beneficiary.view_nid` scope.
   */
  private async searchWhere(
    q: string,
    viewer: BeneficiaryViewer,
  ): Promise<Prisma.BeneficiaryWhereInput> {
    const term = q.trim();
    if (!/^[+0-9\s-]+$/.test(term))
      // LIKE wildcards in the term are letters, not patterns
      return { name: { contains: term.replace(/[\\%_]/g, '\\$&'), mode: 'insensitive' } };
    const digits = term.replace(/\D/g, '');
    const or: Prisma.BeneficiaryWhereInput[] = [];
    const mobile = mobileOf(digits);
    if (mobile && viewer.fieldClasses.has(CONTACT)) or.push({ mobile });
    if ([10, 13, 17].includes(digits.length)) {
      const scope = await this.nidScope(viewer);
      if (scope)
        or.push({
          AND: [{ OR: [{ nid: digits }, { birthReg: digits }] }, beneficiaryWhere(scope)],
        });
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

  async list(query: BeneficiaryFilter & PageQuery, viewer: BeneficiaryViewer) {
    const binding = `beneficiaries.list|${viewer.principal.userId}`;
    const cursor = query.cursor
      ? decodeCursor(this.env.CURSOR_SECRET, binding, query.cursor)
      : undefined;
    const direction = cursor?.d ?? 'next';
    const filter = await this.where(query, viewer);
    const { fetched, total } = await boundedRead(this.prisma, async (tx) => ({
      fetched: await tx.beneficiary.findMany({
        where: cursor ? { AND: [filter, keysetWhere(SORT, cursor)] } : filter,
        orderBy: orderBy(SORT, direction),
        take: query.limit + 1,
        select: {
          id: true,
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
      hadCursor: Boolean(cursor),
      secret: this.env.CURSOR_SECRET,
      binding,
      total,
    });
    return { rows, meta };
  }

  /** The counts for the filters in use: everyone, those assisted this year, the blocked. */
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
      boundedRead(this.prisma, (tx) => this.read(tx, viewer.scope, beneficiaryId, inProjects)),
    ]);
    if (!found) {
      this.access.denied(viewer.principal.userId, viewer.scope.permission, 'beneficiary');
      throw new ApiError('permission.not_found', 404);
    }
    const { b, applications, activities } = found;
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
      ...(seesNid ? { nid: b.nid, birthReg: b.birthReg } : {}),
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
      distributions: activities
        .filter((a) => a.distributionsActivity !== null)
        .map((a) => ({
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
    scope: Scope,
    beneficiaryId: string,
    inProjects: { project?: Prisma.ProjectWhereInput },
  ) {
    const latest = { orderBy: { createdAt: 'desc' as const }, take: SECTION_ROWS };
    const projectRows = inProjects.project ? { OR: [{ projectId: null }, inProjects] } : {};
    const b = await tx.beneficiary.findFirst({
      where: { AND: [{ id: beneficiaryId }, beneficiaryWhere(scope)] },
      select: {
        id: true,
        nid: true,
        birthReg: true,
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
          select: { id: true, name: true, relationshipCode: true, ageYears: true },
        },
        classAttendanceBeneficiary: {
          ...latest,
          select: { id: true, present: true, createdAt: true },
        },
        learningProgressBeneficiary: {
          ...latest,
          select: { id: true, status: true, createdAt: true },
        },
        examResultsBeneficiary: {
          ...latest,
          select: { id: true, passed: true, score: true, createdAt: true },
        },
        callLogsBeneficiary: {
          where: projectRows,
          orderBy: { calledAt: 'desc' },
          take: SECTION_ROWS,
          select: { id: true, projectId: true, calledAt: true },
        },
        followupEvaluationsBeneficiary: {
          where: projectRows,
          orderBy: { evaluatedAt: 'desc' },
          take: SECTION_ROWS,
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
    const activities = await tx.activity.findMany({
      where: { application: { beneficiaryId: b.id }, ...inProjects },
      orderBy: { doneAt: 'desc' },
      take: SECTION_ROWS,
      select: {
        id: true,
        applicationId: true,
        projectId: true,
        type: true,
        stage: true,
        status: true,
        doneAt: true,
        distributionsActivity: { select: { activityId: true } },
      },
    });
    return { b, applications, activities };
  }
}

interface ProjectOfYear {
  id: string;
  code: string;
  nameBn: string;
  nameEn: string;
  status: string;
}
