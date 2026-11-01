import { beneficiaryFilterSchema } from '@css/shared/beneficiaries';
import { columnsOf, type ExportList } from '@css/shared/exports';
import { volunteerFilterSchema } from '@css/shared/volunteers';
import { z, type ZodType } from 'zod';
import { maskData, sensitive } from '../access/field-mask';
import { holdsPermission } from '../access/scope';
import type { AccessService } from '../access/service';
import type { ApplicationsService } from '../applications/service';
import { applicationFilterSchema } from '../applications/view';
import type { Principal } from '../auth/principal';
import type { Clock } from '../core/clock';
import type { PrismaService } from '../core/prisma.service';
import type { Prisma } from '../generated/prisma/client';
import { ApiError } from '../i18n/api-error';
import type { BeneficiariesService } from '../services/beneficiaries';
import type { VolunteerListService } from '../services/volunteer-list';
import { exportClasses } from './access';

/** A value of the code lists a writer turns into the label of the file's language. */
export interface CodedCell {
  code: string;
  /** Where the label comes from: a message family or a reference list. */
  source: string;
}

/** One value of an exported row. */
export type Cell = string | number | boolean | Date | null | CodedCell | string[];

export interface ExportRow {
  id: string;
  /** The row's values by column id, the protected ones only where the export may carry them. */
  cells: Record<string, Cell>;
}

/**
 * The query of a list as the person could read it when they asked: the list's own filter, inside
 * their scope of that moment, stored on the job so the job replays exactly those rows and never
 * reads the person's access again (the export service decision in docs/DECISION_LOG.md).
 */
export interface FrozenList {
  kind: ExportList;
  /** The list's Prisma filter, as JSON. */
  where: unknown;
  /** The office's score order of the application list, else the newest first. */
  byScore: boolean;
  /** The protected field classes the file may carry. */
  classes: string[];
  locale: 'bn' | 'en';
}

/** Where a batch ends: the last row's id, and its score in the score order. */
export interface BatchCursor {
  id: string;
  score?: number | null;
}

export interface FreezeInput {
  kind: ExportList;
  filters: Record<string, unknown>;
  projectId?: string;
}

/** The read permission of each list: an export reaches only the rows its list shows. */
const READ_PERMISSION: Readonly<Record<ExportList, string>> = {
  volunteers: 'volunteer.view_all',
  beneficiaries: 'beneficiary.view_all',
  applications: 'application.view',
};

const applicationExportFilter = applicationFilterSchema.extend({
  sort: z.enum(['-score']).optional(),
});

/**
 * The mask of a list's rows, made from its column catalogue: each protected column is marked with
 * its class, so `maskData` removes it exactly as it does from an API response.
 */
const MASKS = new Map<ExportList, ZodType>(
  (['volunteers', 'beneficiaries', 'applications'] as const).map((list) => [
    list,
    z.object(
      Object.fromEntries(
        columnsOf(list).map((c) => [c.id, c.cls ? sensitive(z.unknown(), c.cls) : z.unknown()]),
      ),
    ),
  ]),
);

const DAY_MS = 24 * 60 * 60 * 1000;

const coded = (code: string | null, source: string): CodedCell | null =>
  code === null ? null : { code, source };

/**
 * The rows of an export: the request freezes the list's query with the person's access of that
 * moment, and the job reads it back in batches with the protected fields the export may carry.
 * Reads here are not bounded like a screen's: a job reads up to the export's row limit.
 */
export class ExportRows {
  constructor(
    private readonly prisma: PrismaService,
    private readonly clock: Clock,
    private readonly access: AccessService,
    private readonly volunteers: VolunteerListService,
    private readonly beneficiaries: BeneficiariesService,
    private readonly applications: ApplicationsService,
  ) {}

  /** The list's query as this person reads it now; refuses a list they may not read. */
  async freeze(principal: Principal, input: FreezeInput, locale: 'bn' | 'en'): Promise<FrozenList> {
    const access = await this.access.load(principal.userId);
    const permission = READ_PERMISSION[input.kind];
    if (!holdsPermission(permission, access.grants)) {
      this.access.denied(principal.userId, permission, input.kind);
      throw new ApiError('permission.denied', 403);
    }
    const fieldClasses = access.fieldClasses;
    let where: unknown;
    let byScore = false;
    if (input.kind === 'volunteers') {
      where = await this.volunteers.where(parsed(volunteerFilterSchema, input.filters), {
        principal,
        fieldClasses,
      });
    } else if (input.kind === 'beneficiaries') {
      const scope = await this.access.scopeFor(principal, access, permission, 'beneficiary');
      where = await this.beneficiaries.where(parsed(beneficiaryFilterSchema, input.filters), {
        principal,
        scope,
        fieldClasses,
      });
    } else {
      if (!input.projectId) throw new ApiError('validation.failed', 422);
      const scope = await this.access.scopeFor(principal, access, permission, 'application');
      const query = await this.applications.listQuery(
        { principal, scope, fieldClasses },
        input.projectId,
        parsed(applicationExportFilter, input.filters),
      );
      where = query.where;
      byScore = query.byScore;
    }
    return {
      kind: input.kind,
      // through JSON once, as the job will read it back from its row
      where: JSON.parse(JSON.stringify(where)) as unknown,
      byScore,
      classes: [...exportClasses(access)].sort(),
      locale,
    };
  }

  /** How many rows the frozen query selects now. */
  async count(frozen: FrozenList): Promise<number> {
    if (frozen.kind === 'volunteers')
      return this.prisma.volunteer.count({ where: frozen.where as Prisma.VolunteerWhereInput });
    if (frozen.kind === 'beneficiaries')
      return this.prisma.beneficiary.count({
        where: frozen.where as Prisma.BeneficiaryWhereInput,
      });
    return this.prisma.application.count({ where: frozen.where as Prisma.ApplicationWhereInput });
  }

  /** The next rows after a cursor (the first ones without), masked, and where the next batch starts. */
  async batch(
    frozen: FrozenList,
    after: BatchCursor | null,
    size: number,
  ): Promise<{ rows: ExportRow[]; next: BatchCursor | null }> {
    const read =
      frozen.kind === 'volunteers'
        ? await this.volunteerRows(frozen, after, size)
        : frozen.kind === 'beneficiaries'
          ? await this.beneficiaryRows(frozen, after, size)
          : await this.applicationRows(frozen, after, size);
    const mask = MASKS.get(frozen.kind)!;
    const visible = new Set(frozen.classes);
    const rows = read.rows.map((r) => ({
      id: r.id,
      cells: maskData(mask, r.cells, visible) as Record<string, Cell>,
    }));
    return { rows, next: read.rows.length === size ? read.last : null };
  }

  private async volunteerRows(frozen: FrozenList, after: BatchCursor | null, size: number) {
    const where = frozen.where as Prisma.VolunteerWhereInput;
    const found = await this.prisma.volunteer.findMany({
      where: after ? { AND: [where, { id: { lt: after.id } }] } : where,
      orderBy: { id: 'desc' },
      take: size,
      select: {
        id: true,
        type: true,
        nid: true,
        dateOfBirth: true,
        bloodGroup: true,
        bankName: true,
        bankAccountName: true,
        bankAccountNumber: true,
        bankBranchName: true,
        bankRoutingNumber: true,
        divisionId: true,
        districtId: true,
        upazilaId: true,
        category: true,
        inactiveFlag: true,
        user: { select: { displayName: true, state: true, mobile: true, email: true } },
        projectVolunteersVolunteer: {
          where: { endedAt: null },
          select: { project: { select: { nameBn: true, nameEn: true } } },
          orderBy: { createdAt: 'desc' },
        },
      },
    });
    const names = await this.areaNames(
      found.flatMap((v) => [v.upazilaId, v.districtId]),
      frozen.locale,
    );
    const blocked = new Set(
      (
        await this.prisma.blocklist.findMany({
          where: {
            subjectType: 'volunteer',
            active: true,
            subjectId: { in: found.map((v) => v.id) },
          },
          select: { subjectId: true },
        })
      ).map((b) => b.subjectId),
    );
    const en = frozen.locale === 'en';
    const rows = found.map((v) => ({
      id: v.id,
      cells: {
        name: v.user.displayName,
        area: area(names, v.upazilaId, v.districtId),
        projects: v.projectVolunteersVolunteer.map((a) =>
          en ? a.project.nameEn : a.project.nameBn,
        ),
        state: coded(v.user.state, 'user.state'),
        category: v.category,
        inactive: v.inactiveFlag,
        type: coded(v.type, 'volunteer.type'),
        mobile: v.user.mobile,
        email: v.user.email,
        blocked: blocked.has(v.id),
        nid: v.nid,
        date_of_birth: v.dateOfBirth,
        blood_group: v.bloodGroup,
        bank_name: v.bankName,
        bank_account_name: v.bankAccountName,
        bank_account_number: v.bankAccountNumber,
        bank_branch_name: v.bankBranchName,
        bank_routing_number: v.bankRoutingNumber,
      } satisfies Record<string, Cell>,
    }));
    const last = found.at(-1);
    return { rows, last: last ? { id: last.id } : null };
  }

  private async beneficiaryRows(frozen: FrozenList, after: BatchCursor | null, size: number) {
    const where = frozen.where as Prisma.BeneficiaryWhereInput;
    const found = await this.prisma.beneficiary.findMany({
      where: after ? { AND: [where, { id: { lt: after.id } }] } : where,
      orderBy: { id: 'desc' },
      take: size,
      select: {
        id: true,
        benNo: true,
        name: true,
        fatherOrHusbandName: true,
        motherName: true,
        status: true,
        classCode: true,
        genderCode: true,
        ageYears: true,
        mobile: true,
        upazilaId: true,
        districtId: true,
        unionId: true,
        village: true,
        isBlocked: true,
        nid: true,
        birthReg: true,
      },
    });
    const names = await this.areaNames(
      found.flatMap((b) => [b.upazilaId, b.districtId, b.unionId]),
      frozen.locale,
    );
    const rows = found.map((b) => ({
      id: b.id,
      cells: {
        name: b.name,
        ben_no: b.benNo,
        father: b.fatherOrHusbandName,
        area: area(names, b.upazilaId, b.districtId),
        status: coded(b.status, 'beneficiary.status'),
        class: coded(b.classCode, 'reference.beneficiary_class'),
        gender: coded(b.genderCode, 'reference.gender'),
        age: b.ageYears,
        mother: b.motherName,
        mobile: b.mobile,
        union: names.get(b.unionId) ?? null,
        village: b.village,
        blocked: b.isBlocked,
        nid: b.nid,
        birth_reg: b.birthReg,
      } satisfies Record<string, Cell>,
    }));
    const last = found.at(-1);
    return { rows, last: last ? { id: last.id } : null };
  }

  private async applicationRows(frozen: FrozenList, after: BatchCursor | null, size: number) {
    const where = frozen.where as Prisma.ApplicationWhereInput;
    const found = await this.prisma.application.findMany({
      where: after ? { AND: [where, this.applicationKeyset(frozen.byScore, after)] } : where,
      orderBy: frozen.byScore
        ? [{ totalScore: { sort: 'desc', nulls: 'last' } }, { id: 'desc' }]
        : { id: 'desc' },
      take: size,
      select: {
        id: true,
        appNo: true,
        applicantName: true,
        beneficiary: { select: { name: true } },
        totalScore: true,
        status: true,
        stage: true,
        outcome: true,
        flags: true,
        districtId: true,
        unionId: true,
        submittedAt: true,
        updatedAt: true,
        ownerVolunteer: { select: { user: { select: { displayName: true } } } },
      },
    });
    const names = await this.areaNames(
      found.flatMap((a) => [a.unionId, a.districtId]),
      frozen.locale,
    );
    const now = this.clock.now().getTime();
    const rows = found.map((a) => ({
      id: a.id,
      cells: {
        app_no: a.appNo,
        person: a.beneficiary?.name ?? a.applicantName ?? null,
        score: a.totalScore === null ? null : Number(a.totalScore),
        area: area(names, a.unionId, a.districtId),
        status: coded(a.status, 'application.status'),
        submitted: a.submittedAt,
        waiting: Math.max(0, Math.floor((now - a.updatedAt.getTime()) / DAY_MS)),
        stage: a.stage,
        outcome: a.outcome,
        flags: a.flags,
        volunteer: a.ownerVolunteer?.user.displayName ?? null,
        union: names.get(a.unionId) ?? null,
      } satisfies Record<string, Cell>,
    }));
    const last = found.at(-1);
    return {
      rows,
      last: last
        ? { id: last.id, score: last.totalScore === null ? null : Number(last.totalScore) }
        : null,
    };
  }

  /** The rows after a cursor in the list's order; in the score order an unscored row comes last. */
  private applicationKeyset(byScore: boolean, after: BatchCursor): Prisma.ApplicationWhereInput {
    if (!byScore) return { id: { lt: after.id } };
    if (after.score === null || after.score === undefined)
      return { totalScore: null, id: { lt: after.id } };
    return {
      OR: [
        { totalScore: { lt: after.score } },
        { totalScore: after.score, id: { lt: after.id } },
        { totalScore: null },
      ],
    };
  }

  /** The names of the locations of a batch in the file's language. */
  private async areaNames(ids: string[], locale: 'bn' | 'en'): Promise<Map<string, string>> {
    const rows = await this.prisma.location.findMany({
      where: { id: { in: [...new Set(ids)] } },
      select: { id: true, nameBn: true, nameEn: true },
    });
    return new Map(rows.map((l) => [l.id, locale === 'en' ? l.nameEn : l.nameBn]));
  }
}

/** The area as the lists show it: the smaller place, then the larger. */
function area(names: ReadonlyMap<string, string>, inner: string, outer: string): string {
  return [names.get(inner), names.get(outer)].filter(Boolean).join(', ');
}

/** The list's filters by its own schema; anything else is the request's fault (422). */
function parsed<T>(schema: z.ZodType<T>, filters: Record<string, unknown>): T {
  const result = schema.safeParse(filters);
  if (!result.success)
    throw new ApiError(
      'validation.failed',
      422,
      undefined,
      result.error.issues.map((i) => ({
        path: ['filters', ...i.path].join('.'),
        code: 'validation.failed',
      })),
    );
  return result.data;
}
