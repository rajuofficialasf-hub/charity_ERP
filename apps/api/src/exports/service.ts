import { uuidv7 } from '@css/shared';
import { z } from 'zod';
import {
  type ColumnKind,
  columnsOf,
  EXPORT_LIMITS,
  EXPORT_LISTS,
  type ExportRecord,
  EXPORT_PERMISSION_OF_CLASS,
  type ExportList,
  type ExportRequest,
  orderColumns,
  questionKeyOf,
  unknownColumns,
} from '@css/shared/exports';
import { formatCount } from '@css/shared/format';
import { FIELD_TYPES } from '@css/shared/forms';
import type { Bilingual, MessageKey } from '@css/shared/i18n';
import { translate } from '@css/shared/i18n';
import type { AuditWriter } from '../audit/audit-writer.js';
import type { Principal } from '../auth/principal.js';
import type { Clock } from '../core/clock.js';
import type { PrismaService } from '../core/prisma.service.js';
import type { Prisma } from '../generated/prisma/client.js';
import { ApiError } from '../i18n/api-error.js';
import type { JobRunner } from '../jobs/job-runner.js';
import { type ExportQuestions, QUESTION_CLASSES, type QuestionColumn } from './questions.js';
import type { ExportRecords } from './records.js';
import type { ExportRows, FrozenList } from './rows.js';

/** The limits a request is checked against; the tests pass smaller ones. */
export interface ExportLimits {
  maxRows: number;
  maxPdfRows: number;
  maxRunning: number;
}

/** What the job reads back from its row: the frozen list and the question columns chosen. */
export interface FrozenExport {
  list: FrozenList;
  questions: QuestionColumn[];
  projectId: string | null;
}

const bilingualSchema = z.object({ bn: z.string(), en: z.string() });

/**
 * The stored shape of a job's frozen export, checked when the worker reads it back; the list's
 * Prisma filters stay as stored, since only the request that froze them wrote them.
 */
const frozenExportSchema = z.object({
  list: z.object({
    kind: z.enum(EXPORT_LISTS),
    filters: z.record(z.string(), z.unknown()),
    where: z.unknown(),
    byScore: z.boolean(),
    classes: z.array(z.string()),
    reach: z.array(z.object({ classes: z.array(z.string()), where: z.unknown() })),
    locale: z.enum(['bn', 'en']),
  }),
  questions: z.array(
    z.object({
      fieldKey: z.string(),
      id: z.string(),
      label: bilingualSchema,
      sectionKey: z.string(),
      sectionTitle: bilingualSchema,
      cls: z.string().nullable(),
      group: z.string().nullable(),
      type: z.enum(FIELD_TYPES),
      options: z.record(z.string(), bilingualSchema),
    }),
  ),
  projectId: z.string().nullable(),
});

/** A job's frozen export as stored, or null when the row does not hold one. */
export function readFrozenExport(stored: unknown): FrozenExport | null {
  const parsed = frozenExportSchema.safeParse(stored);
  return parsed.success ? (parsed.data as FrozenExport) : null;
}

/** One column the export dialog offers, with its words in both languages. */
export interface ColumnView {
  id: string;
  label: Bilingual;
  group: 'list' | 'detail' | 'question';
  protected: boolean;
  onScreen: boolean;
  kind: string;
  section: { key: string; title: Bilingual } | null;
}

/** An export job as its requester follows it. */
export interface ExportJobView {
  id: string;
  kind: string;
  format: string;
  status: string;
  columns: string[];
  rowsDone: number;
  rowsTotal: number | null;
  rowCount: number | null;
  fileId: string | null;
  sensitive: boolean;
  errorCode: string | null;
  createdAt: Date;
  finishedAt: Date | null;
  /** The file was deleted after its keep time; the job stays. */
  expired: boolean;
}

const JOB_SELECT = {
  id: true,
  kind: true,
  format: true,
  status: true,
  columns: true,
  rowsDone: true,
  rowsTotal: true,
  rowCount: true,
  fileId: true,
  sensitive: true,
  errorCode: true,
  createdAt: true,
  finishedAt: true,
  file: { select: { deletedAt: true } },
} as const;

/** A job row as its requester sees it. */
function viewOf(
  row: {
    file: { deletedAt: Date | null } | null;
  } & Omit<ExportJobView, 'expired'>,
): ExportJobView {
  const { file, ...job } = row;
  return { ...job, expired: (file?.deletedAt ?? null) !== null };
}

const MINUTE_MS = 60 * 1000;
const DAY_MS = 24 * 60 * MINUTE_MS;

/**
 * The classes whose columns make an export sensitive: the request's audit entry says so, and the
 * download of such a file needs these classes' export permissions again.
 */
const SENSITIVE = new Set(Object.keys(EXPORT_PERMISSION_OF_CLASS));

const both = (key: string): Bilingual => ({
  bn: translate('bn', key as MessageKey),
  en: translate('en', key as MessageKey),
});

/**
 * The export requests (docs/api/API_STANDARDS.md, "Export job pattern"): the columns a person
 * may export, the request that freezes the list as they read it and queues the job, and the
 * person's own jobs. Every refusal comes before a job exists.
 */
export class ExportsService {
  private readonly limits: ExportLimits;

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditWriter,
    private readonly jobs: JobRunner,
    private readonly clock: Clock,
    private readonly rows: ExportRows,
    private readonly questions: ExportQuestions,
    private readonly records: ExportRecords,
    limits: Partial<ExportLimits> = {},
  ) {
    this.limits = { ...EXPORT_LIMITS, ...limits };
  }

  /**
   * The columns of a list this person may export, in the file's order; on a project's
   * application list also its form questions, grouped by their section.
   */
  async columns(
    principal: Principal,
    list: ExportList,
    projectId: string | undefined,
    locale: 'bn' | 'en',
  ): Promise<{ columns: ColumnView[] }> {
    const frozen = await this.rows.freeze(
      principal,
      { kind: list, filters: {}, ...(projectId ? { projectId } : {}) },
      locale,
    );
    const classes = new Set(frozen.classes);
    const fixed: ColumnView[] = columnsOf(list)
      .filter((c) => c.cls === null || classes.has(c.cls))
      .map((c) => ({
        id: c.id,
        label: both(c.header),
        group: c.group,
        protected: c.cls !== null && SENSITIVE.has(c.cls),
        onScreen: c.onScreen,
        kind: c.kind,
        section: null,
      }));
    const questions =
      list === 'applications' && projectId
        ? (await this.questions.catalogue(projectId, classes)).map((q): ColumnView => ({
            id: q.id,
            label: q.label,
            group: 'question',
            protected: q.cls !== null && SENSITIVE.has(q.cls),
            onScreen: false,
            kind: q.group === null ? questionKind(q) : 'text',
            section: { key: q.sectionKey, title: q.sectionTitle },
          }))
        : [];
    return { columns: [...fixed, ...questions] };
  }

  /**
   * Freezes the list as the person reads it now, checks the columns, the row limits and their
   * running exports, then writes the job, its audit entry and its queue entry in one transaction.
   */
  async request(
    principal: Principal,
    input: ExportRequest,
    locale: 'bn' | 'en',
  ): Promise<ExportJobView> {
    const frozen = await this.rows.freeze(
      principal,
      {
        kind: input.kind,
        filters: input.filters,
        ...(input.projectId ? { projectId: input.projectId } : {}),
      },
      locale,
    );
    const classes = new Set(frozen.classes);
    const { allowed, every } = await this.questionsOf(input, classes);
    const unknown = unknownColumns(
      input.kind,
      input.columns,
      every.map((q) => q.fieldKey),
    );
    if (unknown.length > 0)
      throw new ApiError(
        'validation.failed',
        422,
        undefined,
        unknown.map((id) => ({
          path: `columns.${input.columns.indexOf(id)}`,
          code: 'validation.failed',
        })),
      );
    // a column of a class the person may not export is refused, never quietly dropped
    const allowedKeys = new Set(allowed.map((q) => q.fieldKey));
    const catalogue = new Map(columnsOf(input.kind).map((c) => [c.id, c]));
    for (const id of input.columns) {
      const key = questionKeyOf(id);
      const cls = key === null ? (catalogue.get(id)?.cls ?? null) : null;
      if ((key !== null && !allowedKeys.has(key)) || (cls !== null && !classes.has(cls))) {
        throw new ApiError('permission.denied', 403);
      }
    }
    const ordered = orderColumns(
      input.kind,
      input.columns,
      allowed.map((q) => q.fieldKey),
    );
    const chosen = new Set(ordered);
    const questions = allowed.filter((q) => chosen.has(q.id));
    const total = await this.rows.count(frozen);
    if (total > this.limits.maxRows)
      throw new ApiError('export.too_many_rows', 422, {
        limit: formatCount(this.limits.maxRows, locale),
      });
    if (input.format === 'pdf' && total > this.limits.maxPdfRows)
      throw new ApiError('export.pdf_too_many_rows', 422, {
        limit: formatCount(this.limits.maxPdfRows, locale),
      });
    const sensitive = sensitiveClasses(input.kind, ordered, questions, classes).length > 0;
    const access: FrozenExport = {
      list: frozen,
      questions,
      projectId: input.projectId ?? null,
    };
    const id = await this.queue(
      principal,
      {
        kind: input.kind,
        locale,
        filters: frozen.filters as Prisma.InputJsonObject,
        sensitive,
        format: input.format,
        columns: ordered,
        // a PDF shows the words only
        withCodes: input.format !== 'pdf' && input.withCodes === true,
        access: access as unknown as Prisma.InputJsonObject,
        rowsTotal: total,
      },
      {
        kind: input.kind,
        format: input.format,
        columns: ordered,
        filters: frozen.filters as Prisma.InputJsonObject,
        ...(input.projectId ? { projectId: input.projectId } : {}),
        sensitive,
        rowCount: total,
      },
    );
    return this.get(principal, id);
  }

  /**
   * A record printed whole as a PDF: the record is read and masked now, as the person may read
   * and export it, and the job prints exactly that.
   */
  async requestRecord(
    principal: Principal,
    kind: ExportRecord,
    recordId: string,
    locale: 'bn' | 'en',
  ): Promise<ExportJobView> {
    const record = await this.records.snapshot(principal, kind, recordId, locale);
    const sensitive = record.classes.length > 0;
    const id = await this.queue(
      principal,
      {
        kind,
        locale,
        filters: { recordId },
        sensitive,
        format: 'pdf',
        columns: [],
        access: { record } as unknown as Prisma.InputJsonObject,
        rowsTotal: 1,
      },
      { kind, format: 'pdf', recordId, sensitive, classes: record.classes, rowCount: 1 },
    );
    return this.get(principal, id);
  }

  /**
   * Writes the job, its audit entry and its queue entry in one transaction, once the person's
   * running exports leave room for it.
   */
  private async queue(
    principal: Principal,
    job: {
      kind: string;
      locale: 'bn' | 'en';
      filters: Prisma.InputJsonObject;
      sensitive: boolean;
      format: string;
      columns: string[];
      withCodes?: boolean;
      access: Prisma.InputJsonObject;
      rowsTotal: number;
    },
    audited: Prisma.InputJsonObject,
  ): Promise<string> {
    const id = uuidv7();
    const now = this.clock.now();
    await this.prisma.$transaction(async (tx) => {
      // one request of a person at a time, so two at once cannot both pass the running limit
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`export:${principal.userId}`}))`;
      const running = await tx.exportJob.count({
        where: {
          requestedBy: principal.userId,
          status: { in: ['queued', 'running'] },
          // a job stuck past the queue's time limit no longer counts
          createdAt: { gt: new Date(now.getTime() - EXPORT_LIMITS.stuckMinutes * MINUTE_MS) },
        },
      });
      if (running >= this.limits.maxRunning)
        throw new ApiError('export.running_limit', 409, {
          limit: formatCount(this.limits.maxRunning, job.locale),
        });
      await tx.exportJob.create({
        data: {
          id,
          requestedBy: principal.userId,
          ...job,
          status: 'queued',
          createdBy: principal.userId,
          updatedBy: principal.userId,
        },
      });
      await this.audit.record(tx, {
        action: 'export.requested',
        entityType: 'export_job',
        entityId: id,
        new: audited,
      });
      await this.jobs.enqueue('exports', { jobId: id }, { tx });
    });
    return id;
  }

  /** The person's own exports of the files' keep time, the newest first. */
  async list(principal: Principal): Promise<ExportJobView[]> {
    const since = new Date(this.clock.now().getTime() - EXPORT_LIMITS.keepDays * DAY_MS);
    const rows = await this.prisma.exportJob.findMany({
      where: { requestedBy: principal.userId, createdAt: { gte: since } },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: 100,
      select: JOB_SELECT,
    });
    return rows.map(viewOf);
  }

  /** One of the person's own exports; anyone else's answers as missing. */
  async get(principal: Principal, id: string): Promise<ExportJobView> {
    const job = await this.prisma.exportJob.findFirst({
      where: { id, requestedBy: principal.userId },
      select: JOB_SELECT,
    });
    if (!job) throw new ApiError('permission.not_found', 404);
    return viewOf(job);
  }

  /**
   * The questions of the request's project: those the person may export, and every question of
   * the project's forms, so a question withheld from them is refused rather than unknown.
   */
  private async questionsOf(
    input: ExportRequest,
    classes: ReadonlySet<string>,
  ): Promise<{ allowed: QuestionColumn[]; every: QuestionColumn[] }> {
    if (input.kind !== 'applications' || !input.projectId) return { allowed: [], every: [] };
    const [allowed, every] = await Promise.all([
      this.questions.catalogue(input.projectId, classes),
      this.questions.catalogue(input.projectId, new Set(QUESTION_CLASSES)),
    ]);
    return { allowed, every };
  }
}

/** How a question asked once is written: numbers, amounts and dates as such, the rest as text. */
export function questionKind(q: Pick<QuestionColumn, 'type'>): ColumnKind {
  switch (q.type) {
    case 'number':
    case 'decimal':
      return 'number';
    case 'money':
      return 'money';
    case 'date':
      return 'date';
    case 'datetime':
      return 'datetime';
    default:
      return 'text';
  }
}

/**
 * The protected classes an export holds: those of its chosen columns, and for form answers the
 * official section and the identity number whenever the export carries them (a question's class
 * can differ between the versions the applications were made with, so the answers are counted as
 * possibly protected). The request marks the job sensitive by them, and its download needs their
 * export permissions again. Contact data makes no export sensitive, in a question's answer as in
 * the mobile column of the beneficiary list: it is withheld by its class and needs no export
 * permission of its own.
 */
export function sensitiveClasses(
  list: ExportList,
  ordered: readonly string[],
  questions: readonly Pick<QuestionColumn, 'id'>[],
  classes: ReadonlySet<string>,
): string[] {
  const catalogue = new Map(columnsOf(list).map((c) => [c.id, c.cls]));
  const held = new Set<string>();
  for (const id of ordered) {
    const cls = catalogue.get(id);
    if (cls && SENSITIVE.has(cls)) held.add(cls);
  }
  if (questions.length > 0)
    for (const cls of QUESTION_CLASSES) if (SENSITIVE.has(cls) && classes.has(cls)) held.add(cls);
  return [...held].sort();
}
