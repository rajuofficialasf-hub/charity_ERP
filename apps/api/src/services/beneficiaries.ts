import {
  type BeneficiaryFilter,
  type BeneficiarySort,
  parseBenNo,
} from '@css/shared/beneficiaries';
import type { AccessService } from '../access/service.js';
import { beneficiaryRowsProjectWhere, beneficiaryWhere, type Scope } from '../access/scope.js';
import type { Principal } from '../auth/principal.js';
import type { Env } from '../config/env.js';
import { boundedRead } from '../core/bounded-read.js';
import { isNumberTerm, literalContains, mobileOf } from '../core/search.js';
import type { Clock } from '../core/clock.js';
import {
  buildPage,
  decodeCursor,
  keysetWhere,
  orderBy,
  type PageQuery,
  type PageNumberQuery,
  pageOffset,
  parseSort,
} from '../core/pagination.js';
import type { PrismaService, Tx } from '../core/prisma.service.js';
import type { Prisma } from '../generated/prisma/client.js';
import { ApiError } from '../i18n/api-error.js';
import { familySection } from './family-profile.js';
import { publishedWorksOf } from './media-home.js';
import type { BeneficiaryIdentityService } from './beneficiary-identity.js';
import {
  HELPED_WHERE,
  helpView,
  personApplications,
  personApplicationsWhere,
  visibleProjects,
} from './help-history.js';

/** Newest first by id (UUID v7 follows the time of creation and pages without gaps). */
const NEWEST = [{ field: 'id', direction: 'desc' }] as const;
const SORT = parseSort(undefined, ['id'], [...NEWEST]);
/** The most rows a section of the 360° profile carries. */
const SECTION_ROWS = 20;
/** The field classes of the limited beneficiary view (docs/security/permissions.yaml). */
const CONTACT = 'beneficiary.contact';
/** The contact changes that are of the contact class; every other one is the address. */
const CONTACT_LOG_FIELDS = ['mobile', 'mobile_owner_code', 'mobile_owner_name'];
const ADDRESS = 'beneficiary.address_detail';
const CARE = 'beneficiary.care';
const DETAIL = 'beneficiary.profile_detail';
const HISTORY = 'beneficiary.application_history';

/** The calendar year in Bangladesh (UTC+6). */
const dhakaYear = (now: Date) => new Date(now.getTime() + 6 * 3_600_000).getUTCFullYear();

export interface BeneficiaryViewer {
  principal: Principal;
  /** The route's scope (`beneficiary.view_all` for the entity `beneficiary`). */
  scope: Scope;
  fieldClasses: ReadonlySet<string>;
}

/**
 * The nationwide beneficiary tab and the 360° profile shell (docs/MASTER_SPEC.md, "Beneficiary 360°
 * profile and beneficiary tab"). Everyone the caller's scope reaches, filtered, searched and
 * counted with one shared filter; a filter or a search on a field the caller may not see is refused
 * or never matches. Inside a profile a project-scoped caller (the Procurement Team) sees only the
 * rows of its own projects.
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
    // the gender is a profile detail too, so its filter would tell what the caller may not see
    if (filter.gender && !sees(DETAIL)) this.refuse(viewer, DETAIL);
    // the times helped are the application history's: neither the filter nor the order may tell
    // them to a caller without it
    if (filter.helpedMoreThanOnceInYear && !sees(HISTORY)) this.refuse(viewer, HISTORY);
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
    if (filter.gender) and.push({ genderCode: filter.gender });
    if (filter.blocked) and.push({ isBlocked: filter.blocked === 'true' });
    // the kept counter (docs/database/DATABASE_SCHEMA.md, "beneficiaries")
    if (filter.helpedMoreThanOnceInYear) and.push({ maxHelpsInYear: { gt: 1 } });
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

  async list(
    query: BeneficiaryFilter &
      Omit<PageQuery, 'sort'> &
      PageNumberQuery & { sort?: BeneficiarySort },
    viewer: BeneficiaryViewer,
  ) {
    if (query.sort && !viewer.fieldClasses.has(HISTORY)) this.refuse(viewer, HISTORY);
    // by the times helped, the newest first among equals; else the newest first
    const sort = query.sort ? parseSort(query.sort, ['helpCount'], [...NEWEST]) : SORT;
    // a cursor belongs to the order it was made in, so one order never reads another's cursor
    const binding = query.sort
      ? `beneficiaries.list|${viewer.principal.userId}|${query.sort}`
      : `beneficiaries.list|${viewer.principal.userId}`;
    const cursor = query.cursor
      ? decodeCursor(this.env.CURSOR_SECRET, binding, query.cursor)
      : undefined;
    const direction = cursor?.d ?? 'next';
    const offset = pageOffset(query);
    const filter = await this.where(query, viewer);
    const { fetched, total } = await boundedRead(this.prisma, async (tx) => ({
      fetched: await tx.beneficiary.findMany({
        where: cursor ? { AND: [filter, keysetWhere(sort, cursor)] } : filter,
        orderBy: orderBy(sort, direction),
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
          photoFileId: true,
          // the kept count, with the application history class (the response mask)
          helpCount: true,
          // read only to say whether a document is on file; the numbers never leave the list
          nid: true,
          birthReg: true,
        },
      }),
      total: query.include === 'total' ? await tx.beneficiary.count({ where: filter }) : undefined,
    }));
    const listed = fetched.map(({ nid, birthReg, ...row }) => ({
      ...row,
      hasDocument: nid !== null || birthReg !== null,
    }));
    const { rows, meta } = buildPage(listed, {
      limit: query.limit,
      sort,
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
   * The counts for the filters in use: everyone, those assisted this year, the blocked, the men
   * and the women; one read, so the counts share a snapshot and a connection. The response mask
   * leaves out the counts of a class the caller does not see.
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
                  AND: [HELPED_WHERE, { project: { AND: [{ year }, rowsProjects ?? {}] } }],
                },
              },
            },
          ],
        },
      }),
      blocked: await tx.beneficiary.count({ where: { AND: [where, { isBlocked: true }] } }),
      male: await tx.beneficiary.count({ where: { AND: [where, { genderCode: 'male' }] } }),
      female: await tx.beneficiary.count({ where: { AND: [where, { genderCode: 'female' }] } }),
    }));
  }

  /** The 360° profile of one beneficiary in the caller's scope, or 404. */
  async profile(viewer: BeneficiaryViewer, beneficiaryId: string) {
    const rows = beneficiaryRowsProjectWhere(viewer.scope);
    const inProjects = rows ? { project: rows } : {};
    const access = await this.access.load(viewer.principal.userId);
    const nidScope = viewer.fieldClasses.has('beneficiary.nid')
      ? await this.access.sensitiveScope(
          viewer.principal,
          access,
          'beneficiary.view_nid',
          'beneficiary',
        )
      : null;
    // the profile and its history share one snapshot and one time limit
    const found = await boundedRead(this.prisma, async (tx) => {
      const read = await this.read(tx, viewer, beneficiaryId, inProjects);
      if (!read) return null;
      const seesNid =
        !!nidScope && (await this.access.reaches(nidScope, { beneficiaryId: read.b.id }, tx));
      return {
        ...read,
        seesNid,
        history: await this.history(tx, viewer, access, read.b.id, seesNid),
        media: await publishedWorksOf(tx, read.b.id, rows ?? undefined),
        // the household, its links and what it received: with the contact class, which holds
        // the members, and the help only with the application history class too
        family: viewer.fieldClasses.has(CONTACT)
          ? await familySection(tx, {
              headId: read.b.id,
              members: read.b.beneficiaryFamilyMembersBeneficiary,
              scope: viewer.scope,
              seesHelp: viewer.fieldClasses.has(HISTORY),
              own: read.all,
              rows,
              thisYear: dhakaYear(this.clock.now()),
            })
          : null,
      };
    });
    if (!found) {
      this.access.denied(viewer.principal.userId, viewer.scope.permission, 'beneficiary');
      throw new ApiError('permission.not_found', 404);
    }
    const {
      b,
      applications,
      activities,
      distributions,
      seesNid,
      history,
      media,
      all,
      visible,
      family,
    } = found;
    // the projects the caller sees in the profile, each with the state of the person's latest
    // application there (the list is newest first)
    const years = new Map<number, { year: number; projects: Map<string, ProjectOfYear> }>();
    for (const a of all) {
      if (!visible.has(a.project.id)) continue;
      const year = years.get(a.project.year) ?? { year: a.project.year, projects: new Map() };
      if (!year.projects.has(a.project.id))
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
      createdAt: b.createdAt.toISOString(),
      /** The version of the profile for the ETag; not part of the answer's data. */
      updatedAt: b.updatedAt,
      mergedInto: b.mergedInto,
      ...history,
      name: b.name,
      fatherOrHusbandName: b.fatherOrHusbandName,
      // whether that name is the father's or the husband's, with the same class as the name
      guardianRelationCode: b.guardianRelationCode,
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
      // whose number it is, with the contact class like the number
      mobileOwnerCode: b.mobileOwnerCode,
      mobileOwnerName: b.mobileOwnerName,
      // told with the identity class, wherever the profile lives: it says a document is on
      // file, never its number
      hasDocument: b.nid !== null || b.birthReg !== null,
      // the members of the household now: the list of the latest application that carried one,
      // each with the profile it probably is where the viewer reaches that profile
      familyMembers: b.beneficiaryFamilyMembersBeneficiary
        .filter((m) => family?.memberIds.has(m.id))
        .map((m) => ({
          id: m.id,
          name: m.name,
          relationshipCode: m.relationshipCode,
          relationship: m.relationship
            ? { bn: m.relationship.labelBn, en: m.relationship.labelEn }
            : null,
          ageYears: m.ageYears,
          occupationCode: m.occupationCode,
          monthlyIncome: m.monthlyIncome === null ? null : m.monthlyIncome.toNumber(),
          profile: family?.links.get(m.id) ?? null,
        })),
      // the families that probably hold the person as a member, each head the viewer reaches
      memberOf: family?.memberOf ?? [],
      // what the family received: the person and the members' profiles the viewer reaches, the
      // others a number of people
      familyHelp: family?.help ?? null,
      ...(seesNid ? { nid: b.nid ?? null, birthReg: b.birthReg ?? null } : {}),
      isBlocked: b.isBlocked,
      projectsByYear: [...years.values()]
        .sort((x, y) => y.year - x.year)
        .map((y) => ({ year: y.year, projects: [...y.projects.values()] })),
      // how often the person was helped, with the application history class: every counted
      // application, a project the caller does not see counted but not named
      ...(viewer.fieldClasses.has(HISTORY)
        ? { help: helpView(all, visible, dhakaYear(this.clock.now())) }
        : {}),
      applications: applications.map((a) => ({
        id: a.id,
        appNo: a.appNo,
        projectId: a.project.id,
        status: a.status,
        submittedAt: a.submittedAt?.toISOString() ?? null,
        reviewedAt: a.reviewedAt?.toISOString() ?? null,
        approvedAt: a.approvedAt?.toISOString() ?? null,
        throughMerge: a.beneficiaryId !== b.id,
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
      // the published works about the person, for everyone who reads the profile
      media,
    };
  }

  /**
   * The history sections of the 360° profile and what the caller may do:
   * - the contact changes: a mobile and whose it is with the contact class, an address with the
   *   address class;
   * - the correction requests, to every caller who holds either correction permission on the
   *   person; identity values only inside the NID scope;
   * - the block history (the route masks it to officials);
   * - the merges, naming the other profile's id only where the caller's scope reaches it;
   * - the files, an NID photo only inside the NID scope;
   * - the actions, each true only where its permission and scope reach the person and the
   *   person's state allows it (a live profile, blocked or not, a merge to revert, a profile
   *   without a document for a caller who sees identity numbers).
   */
  private async history(
    tx: Tx,
    viewer: BeneficiaryViewer,
    access: Awaited<ReturnType<AccessService['load']>>,
    id: string,
    seesNid: boolean,
  ) {
    const sees = (cls: string) => viewer.fieldClasses.has(cls);
    const entity = 'beneficiary' as const;
    const allowed = await this.access.allowedOn(
      viewer.principal,
      access,
      {
        block: { permission: 'beneficiary.block', entity },
        unblock: { permission: 'beneficiary.unblock', entity },
        editContact: { permission: 'beneficiary.contact.edit', entity },
        requestCorrection: { permission: 'beneficiary.correction.request', entity },
        decideCorrection: { permission: 'beneficiary.correction.approve', entity },
        proposeMerge: { permission: 'beneficiary.merge.propose', entity },
        merge: { permission: 'beneficiary.merge', entity },
        revertMerge: { permission: 'beneficiary.merge.revert', entity },
      },
      { beneficiaryId: id },
    );
    const latest = { take: SECTION_ROWS };
    const identity = (field: string) => field === 'nid' || field === 'birth_reg';
    const text = (value: unknown) => (value === null || value === undefined ? null : String(value));
    const state = await tx.beneficiary.findUniqueOrThrow({
      where: { id },
      select: { isBlocked: true, mergedIntoId: true, nid: true, birthReg: true },
    });
    const contactLog =
      sees(CONTACT) || sees(ADDRESS)
        ? await tx.fieldChange.findMany({
            where: {
              entityType: 'beneficiary',
              entityId: id,
              kind: 'contact_update',
              // a mobile and whose it is are contact data, every other change is the address
              ...(sees(CONTACT) && sees(ADDRESS)
                ? {}
                : sees(CONTACT)
                  ? { field: { in: CONTACT_LOG_FIELDS } }
                  : { field: { notIn: CONTACT_LOG_FIELDS } }),
            },
            orderBy: { createdAt: 'desc' },
            ...latest,
            select: {
              field: true,
              oldValue: true,
              newValue: true,
              createdBy: true,
              createdAt: true,
            },
          })
        : [];
    const corrections =
      allowed.requestCorrection || allowed.decideCorrection
        ? await tx.profileCorrectionRequest.findMany({
            where: { beneficiaryId: id },
            orderBy: { createdAt: 'desc' },
            ...latest,
            select: {
              id: true,
              beneficiaryId: true,
              field: true,
              oldValue: true,
              newValue: true,
              reason: true,
              status: true,
              requestedBy: true,
              createdAt: true,
              decidedBy: true,
              decidedAt: true,
            },
          })
        : [];
    const blocks = sees('blocklist.reason')
      ? await tx.blocklist.findMany({
          where: { subjectType: 'beneficiary', subjectId: id },
          orderBy: { blockedAt: 'desc' },
          ...latest,
          select: {
            id: true,
            reason: true,
            active: true,
            blockedAt: true,
            releasedAt: true,
            releaseReason: true,
          },
        })
      : [];
    const merges = await tx.profileMerge.findMany({
      where: { OR: [{ keptId: id }, { mergedId: id }], status: { not: 'proposed' } },
      orderBy: { proposedAt: 'desc' },
      ...latest,
      select: {
        id: true,
        keptId: true,
        mergedId: true,
        status: true,
        mergedAt: true,
        revertedAt: true,
        snapshot: true,
        kept: { select: { benNo: true } },
        merged: { select: { benNo: true } },
      },
    });
    const others = merges.map((m) => (m.keptId === id ? m.mergedId : m.keptId));
    const reachable = new Set(
      (
        await tx.beneficiary.findMany({
          where: { AND: [{ id: { in: others } }, beneficiaryWhere(viewer.scope)] },
          select: { id: true },
        })
      ).map((r) => r.id),
    );
    const files = sees(DETAIL)
      ? await tx.fileLink.findMany({
          where: { entityType: 'beneficiary', entityId: id },
          orderBy: { createdAt: 'desc' },
          ...latest,
          select: { fileId: true, slot: true, file: { select: { kind: true } } },
        })
      : [];
    const live = !state.mergedIntoId;
    const revertible = merges.some((m) => m.status === 'merged');
    return {
      actions: {
        block: allowed.block && live && !state.isBlocked,
        unblock: allowed.unblock && live && state.isBlocked,
        editContact: allowed.editContact && live,
        requestCorrection: allowed.requestCorrection && live,
        decideCorrection:
          allowed.decideCorrection && live && corrections.some((c) => c.status === 'submitted'),
        // the one who may approve a correction adds the document a profile lacks, seeing numbers
        addIdentity:
          allowed.decideCorrection &&
          live &&
          seesNid &&
          state.nid === null &&
          state.birthReg === null,
        proposeMerge: allowed.proposeMerge && live,
        merge: allowed.merge && live,
        revertMerge: allowed.revertMerge && revertible,
      },
      contactLog: contactLog.map((c) => ({
        field: c.field,
        oldValue: text(c.oldValue),
        newValue: text(c.newValue),
        by: c.createdBy,
        at: c.createdAt.toISOString(),
      })),
      corrections: corrections.map((c) => ({
        id: c.id,
        beneficiaryId: c.beneficiaryId,
        field: c.field,
        oldValue: identity(c.field) && !seesNid ? null : c.oldValue,
        newValue: identity(c.field) && !seesNid ? null : c.newValue,
        reason: c.reason,
        status: c.status,
        requestedBy: c.requestedBy,
        requestedAt: c.createdAt.toISOString(),
        decidedBy: c.decidedBy,
        decidedAt: c.decidedAt ? c.decidedAt.toISOString() : null,
      })),
      blocks: blocks.map((b) => ({
        id: b.id,
        reason: b.reason,
        active: b.active,
        blockedAt: b.blockedAt.toISOString(),
        releasedAt: b.releasedAt ? b.releasedAt.toISOString() : null,
        releaseReason: b.releaseReason,
      })),
      merges: merges.map((m) => {
        const kept = m.keptId === id;
        const otherId = kept ? m.mergedId : m.keptId;
        const snapshot = m.snapshot as { leftBehind?: unknown[] } | null;
        return {
          id: m.id,
          role: kept ? ('kept' as const) : ('merged' as const),
          otherId: reachable.has(otherId) ? otherId : null,
          otherBenNo: kept ? m.merged.benNo : m.kept.benNo,
          status: m.status,
          mergedAt: m.mergedAt ? m.mergedAt.toISOString() : null,
          revertedAt: m.revertedAt ? m.revertedAt.toISOString() : null,
          leftBehind: Array.isArray(snapshot?.leftBehind) ? snapshot.leftBehind.length : 0,
        };
      }),
      files: files
        .filter((f) => seesNid || f.file.kind !== 'nid_photo')
        .map((f) => ({ fileId: f.fileId, slot: f.slot, kind: f.file.kind })),
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
      // a retired profile answers too, with the kept profile it leads to
      where: { AND: [{ id: beneficiaryId }, beneficiaryWhere(viewer.scope)] },
      select: {
        id: true,
        benNo: true,
        createdAt: true,
        updatedAt: true,
        mergedInto: { select: { id: true, benNo: true } },
        // the numbers themselves leave only inside the caller's identity scope
        nid: true,
        birthReg: true,
        name: true,
        fatherOrHusbandName: true,
        guardianRelationCode: true,
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
        mobileOwnerCode: true,
        mobileOwnerName: true,
        isBlocked: true,
        // the household's members, with the contact class (their income among them): every
        // active member, never a cut list; the active rows are one application's family group,
        // whose rows the form engine caps
        beneficiaryFamilyMembersBeneficiary: {
          where: { active: true },
          orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
          ...(sees(CONTACT) ? {} : none),
          select: {
            id: true,
            sourceApplicationId: true,
            createdAt: true,
            name: true,
            relationshipCode: true,
            relationship: { select: { labelBn: true, labelEn: true } },
            ageYears: true,
            occupationCode: true,
            monthlyIncome: true,
          },
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
    // every application of the person, never cut to a page: their own and the ones a merge left
    // on a profile retired into them, for the projects by year and the help
    const all = await personApplications(tx, await personApplicationsWhere(tx, b.id));
    const visible = await visibleProjects(tx, all, inProjects.project ?? null);
    // the page of the newest the caller sees, from the same read in the same order
    const applications = all.filter((a) => visible.has(a.project.id)).slice(0, SECTION_ROWS);
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
    return { b, applications, activities, distributions, all, visible };
  }
}

interface ProjectOfYear {
  id: string;
  code: string;
  nameBn: string;
  nameEn: string;
  status: string;
}
