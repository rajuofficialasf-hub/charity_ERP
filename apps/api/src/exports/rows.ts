import { beneficiaryFilterSchema } from '@css/shared/beneficiaries';
import { columnsOf, type ExportList } from '@css/shared/exports';
import { volunteerFilterSchema } from '@css/shared/volunteers';
import { z, type ZodType } from 'zod';
import { maskData, sensitive } from '../access/field-mask.js';
import {
  applicationWhere,
  beneficiaryWhere,
  holdsPermission,
  type Scope,
  volunteerWhere,
} from '../access/scope.js';
import type { AccessService, RequestAccess } from '../access/service.js';
import type { ApplicationsService } from '../applications/service.js';
import { applicationFilterSchema } from '../applications/view.js';
import type { Principal } from '../auth/principal.js';
import type { Clock } from '../core/clock.js';
import type { PrismaService } from '../core/prisma.service.js';
import type { Prisma } from '../generated/prisma/client.js';
import { ApiError } from '../i18n/api-error.js';
import type { BeneficiariesService } from '../services/beneficiaries.js';
import type { VolunteerListService } from '../services/volunteer-list.js';
import { exportClasses } from './access.js';
import { personCells } from './file.js';
import { placeNames } from './places.js';

/** Where the label of a coded value comes from: a message family or a reference list. */
export type CodedSource =
  | 'user.state'
  | 'volunteer.type'
  | 'beneficiary.status'
  | 'reference.beneficiary_class'
  | 'reference.gender'
  | 'reference.mobile_owner'
  | 'application.status';

/** A value of the code lists a writer turns into the label of the file's language. */
export interface CodedCell {
  code: string;
  source: CodedSource;
}

/** One value of an exported row. */
export type Cell = string | number | boolean | Date | null | CodedCell | string[];

export interface ExportRow {
  id: string;
  /** The row's values by column id, the protected ones only where the export may carry them. */
  cells: Record<string, Cell>;
  /** The protected classes this row may carry, for the form answers read beside it. */
  classes: string[];
}

/**
 * The query of a list as the person could read it when they asked: the list's own filter, inside
 * their scope of that moment, stored on the job so the job replays exactly those rows and never
 * reads the person's access again (the export service decision in docs/DECISION_LOG.md).
 */
export interface FrozenList {
  kind: ExportList;
  /** The list's filters as its own schema read them (unknown keys dropped), as JSON. */
  filters: Record<string, unknown>;
  /** The list's Prisma filter, as JSON. */
  where: unknown;
  /** The office's score order of the application list, else the newest first. */
  byScore: boolean;
  /** The protected field classes the file may carry. */
  classes: string[];
  /**
   * The rows on which some of those classes may show, as the screens show them: an identity
   * number or a bank detail only on a record the person's sensitive scope reaches, and only where
   * their export permission's scope reaches it too. A row outside loses those fields.
   */
  reach: { classes: string[]; where: unknown }[];
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

/**
 * The classes a row carries only inside a scope, by list: the permission that shows them on
 * screen, and the export permission that lets them leave in a file.
 */
const REACHED: Readonly<
  Record<ExportList, { classes: string[]; view: string | null; exported: string }[]>
> = {
  volunteers: [
    {
      classes: ['volunteer.identity', 'volunteer.bank'],
      view: 'volunteer.view_sensitive',
      exported: 'export.volunteers',
    },
  ],
  beneficiaries: [
    {
      classes: ['beneficiary.nid'],
      view: 'beneficiary.view_nid',
      exported: 'export.beneficiaries',
    },
  ],
  // the official section shows on every row the list reaches; leaving in a file needs the scope
  // of the forms' export
  applications: [
    { classes: ['application.official_section'], view: null, exported: 'export.forms' },
    // the identity answer of the form leaves only with the beneficiaries' export
    { classes: ['beneficiary.nid'], view: null, exported: 'export.beneficiaries' },
  ],
};

const ENTITY: Readonly<Record<ExportList, 'volunteer' | 'beneficiary' | 'application'>> = {
  volunteers: 'volunteer',
  beneficiaries: 'beneficiary',
  applications: 'application',
};

/** The records of a list a scope reaches, as a filter of that list. */
function whereOf(list: ExportList, scope: Scope): unknown {
  if (list === 'volunteers') return volunteerWhere(scope);
  if (list === 'beneficiaries') return beneficiaryWhere(scope);
  return applicationWhere(scope);
}

const coded = (code: string | null, source: CodedSource): CodedCell | null =>
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

  /**
   * The list's query as this person reads it now; refuses a list they may not read. An export
   * needs its own permission beside the list's: `export.list`, or the one a record's PDF names.
   */
  async freeze(
    principal: Principal,
    input: FreezeInput,
    locale: 'bn' | 'en',
    exportPermission = 'export.list',
  ): Promise<FrozenList> {
    const access = await this.access.load(principal.userId);
    const permission = READ_PERMISSION[input.kind];
    for (const needed of [exportPermission, permission])
      if (!holdsPermission(needed, access.grants)) {
        this.access.denied(principal.userId, needed, input.kind);
        throw new ApiError('permission.denied', 403);
      }
    const fieldClasses = access.fieldClasses;
    let where: unknown;
    let filters: object;
    let byScore = false;
    if (input.kind === 'volunteers') {
      filters = parsed(volunteerFilterSchema, input.filters);
      where = await this.volunteers.where(filters, { principal, fieldClasses });
    } else if (input.kind === 'beneficiaries') {
      const scope = await this.access.scopeFor(principal, access, permission, 'beneficiary');
      filters = parsed(beneficiaryFilterSchema, input.filters);
      where = await this.beneficiaries.where(filters, { principal, scope, fieldClasses });
    } else {
      if (!input.projectId) throw new ApiError('validation.failed', 422);
      const scope = await this.access.scopeFor(principal, access, permission, 'application');
      const filter = parsed(applicationExportFilter, input.filters);
      filters = filter;
      const query = await this.applications.listQuery(
        { principal, scope, fieldClasses },
        input.projectId,
        filter,
        access,
      );
      where = query.where;
      byScore = query.byScore;
    }
    const classes = exportClasses(access);
    return {
      kind: input.kind,
      filters: asJson(filters) as Record<string, unknown>,
      // through JSON once, as the job will read it back from its row
      where: asJson(where),
      byScore,
      classes: [...classes].sort(),
      reach: await this.reachOf(principal, access, input.kind, classes),
      locale,
    };
  }

  /**
   * For each class a list shows only inside a scope, the records both the sensitive scope and the
   * export permission's scope reach; a class the export does not carry needs no reach.
   */
  private async reachOf(
    principal: Principal,
    access: RequestAccess,
    list: ExportList,
    classes: ReadonlySet<string>,
  ): Promise<FrozenList['reach']> {
    const reach: FrozenList['reach'] = [];
    // eslint-disable-next-line security/detect-object-injection -- typed union key into a constant table
    for (const rule of REACHED[list]) {
      const carried = rule.classes.filter((c) => classes.has(c));
      if (carried.length === 0) continue;
      // eslint-disable-next-line security/detect-object-injection -- typed union key into a constant table
      const entity = ENTITY[list];
      const wheres: unknown[] = [];
      for (const permission of [rule.view, rule.exported]) {
        if (permission === null) continue;
        // without the permission no record is reached
        wheres.push(
          holdsPermission(permission, access.grants)
            ? whereOf(list, await this.access.scopeFor(principal, access, permission, entity))
            : { id: { in: [] } },
        );
      }
      reach.push({ classes: carried, where: asJson({ AND: wheres }) });
    }
    return reach;
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
    const outside = await this.outsideReach(
      frozen,
      read.rows.map((r) => r.id),
    );
    const rows = read.rows.map((r) => {
      const visible = new Set(frozen.classes);
      for (const cls of outside.get(r.id) ?? []) visible.delete(cls);
      return {
        id: r.id,
        cells: maskData(mask, r.cells, visible) as Record<string, Cell>,
        classes: [...visible].sort(),
      };
    });
    return { rows, next: read.rows.length === size ? read.last : null };
  }

  /** The protected classes one record of the frozen list may carry, as a batch would mask it. */
  async classesOf(frozen: FrozenList, id: string): Promise<string[]> {
    const outside = new Set((await this.outsideReach(frozen, [id])).get(id) ?? []);
    return frozen.classes.filter((cls) => !outside.has(cls));
  }

  /** The classes each row of a batch may not carry, being outside the frozen reach of those classes. */
  private async outsideReach(frozen: FrozenList, ids: string[]): Promise<Map<string, string[]>> {
    const outside = new Map<string, string[]>();
    for (const rule of frozen.reach) {
      const inside = new Set(await this.idsWithin(frozen.kind, ids, rule.where));
      for (const id of ids)
        if (!inside.has(id)) outside.set(id, [...(outside.get(id) ?? []), ...rule.classes]);
    }
    return outside;
  }

  private async idsWithin(list: ExportList, ids: string[], where: unknown): Promise<string[]> {
    const select = { id: true } as const;
    const rows =
      list === 'volunteers'
        ? await this.prisma.volunteer.findMany({
            where: { AND: [{ id: { in: ids } }, where as Prisma.VolunteerWhereInput] },
            select,
          })
        : list === 'beneficiaries'
          ? await this.prisma.beneficiary.findMany({
              where: { AND: [{ id: { in: ids } }, where as Prisma.BeneficiaryWhereInput] },
              select,
            })
          : await this.prisma.application.findMany({
              where: { AND: [{ id: { in: ids } }, where as Prisma.ApplicationWhereInput] },
              select,
            });
    return rows.map((r) => r.id);
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
    const [names, blockedRows] = await Promise.all([
      placeNames(
        this.prisma,
        found.flatMap((v) => [v.upazilaId, v.districtId]),
        frozen.locale,
      ),
      this.prisma.blocklist.findMany({
        where: {
          subjectType: 'volunteer',
          active: true,
          subjectId: { in: found.map((v) => v.id) },
        },
        select: { subjectId: true },
      }),
    ]);
    const blocked = new Set(blockedRows.map((b) => b.subjectId));
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
        mobileOwnerCode: true,
        mobileOwnerName: true,
        upazilaId: true,
        districtId: true,
        unionId: true,
        village: true,
        isBlocked: true,
        helpCount: true,
        maxHelpsInYear: true,
        nid: true,
        birthReg: true,
      },
    });
    const names = await placeNames(
      this.prisma,
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
        union: names.get(b.unionId) ?? null,
        village: b.village,
        blocked: b.isBlocked,
        // the kept counters, masked with the application history class
        help_count: b.helpCount,
        max_helps_in_year: b.maxHelpsInYear,
        // whose number the mobile is, masked with the contact class like the number
        mobile_owner: coded(b.mobileOwnerCode, 'reference.mobile_owner'),
        mobile_owner_name: b.mobileOwnerName,
        // a missing mobile or document prints its words; each cell is masked with its class
        ...personCells(b, frozen.locale),
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
    const names = await placeNames(
      this.prisma,
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

/**
 * A server-built Prisma filter as it is stored on the job and read back: through JSON once (dates
 * become ISO text, which Prisma reads back as dates), so the replay reads exactly what was stored.
 */
function asJson(where: unknown): unknown {
  return JSON.parse(JSON.stringify(where)) as unknown;
}
