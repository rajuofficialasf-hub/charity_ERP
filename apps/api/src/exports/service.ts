import { uuidv7 } from '@css/shared';
import { z } from 'zod';
import {
  type ColumnKind,
  columnsOf,
  EXPORT_LIMITS,
  EXPORT_LISTS,
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
import type { AuditWriter } from '../audit/audit-writer';
import type { Principal } from '../auth/principal';
import type { Clock } from '../core/clock';
import type { PrismaService } from '../core/prisma.service';
import type { Prisma } from '../generated/prisma/client';
import { ApiError } from '../i18n/api-error';
import type { JobRunner } from '../jobs/job-runner';
import {
  IDENTITY_NUMBER,
  OFFICIAL_SECTION,
  type ExportQuestions,
  type QuestionColumn,
} from './questions';
import type { ExportRows, FrozenList } from './rows';

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
} as const;

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
            protected: q.cls !== null,
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
    const sensitive = isSensitive(input.kind, ordered, questions, classes);
    const access: FrozenExport = {
      list: frozen,
      questions,
      projectId: input.projectId ?? null,
    };
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
          limit: formatCount(this.limits.maxRunning, locale),
        });
      await tx.exportJob.create({
        data: {
          id,
          requestedBy: principal.userId,
          kind: input.kind,
          locale,
          filters: frozen.filters as Prisma.InputJsonObject,
          sensitive,
          status: 'queued',
          format: input.format,
          columns: ordered,
          access: access as unknown as object,
          rowsTotal: total,
          createdBy: principal.userId,
          updatedBy: principal.userId,
        },
      });
      await this.audit.record(tx, {
        action: 'export.requested',
        entityType: 'export_job',
        entityId: id,
        new: {
          kind: input.kind,
          format: input.format,
          columns: ordered,
          filters: frozen.filters as Prisma.InputJsonObject,
          ...(input.projectId ? { projectId: input.projectId } : {}),
          sensitive,
          rowCount: total,
        },
      });
      await this.jobs.enqueue('exports', { jobId: id }, { tx });
    });
    return this.get(principal, id);
  }

  /** The person's own exports of the files' keep time, the newest first. */
  async list(principal: Principal): Promise<ExportJobView[]> {
    const since = new Date(this.clock.now().getTime() - EXPORT_LIMITS.keepDays * DAY_MS);
    return this.prisma.exportJob.findMany({
      where: { requestedBy: principal.userId, createdAt: { gte: since } },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: 100,
      select: JOB_SELECT,
    });
  }

  /** One of the person's own exports; anyone else's answers as missing. */
  async get(principal: Principal, id: string): Promise<ExportJobView> {
    const job = await this.prisma.exportJob.findFirst({
      where: { id, requestedBy: principal.userId },
      select: JOB_SELECT,
    });
    if (!job) throw new ApiError('permission.not_found', 404);
    return job;
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
      this.questions.catalogue(input.projectId, new Set([OFFICIAL_SECTION, IDENTITY_NUMBER])),
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
 * Whether an export holds a protected class: a chosen column of one, or form answers while the
 * export carries the official section or the identity number (a question's class can differ
 * between the versions the applications were made with, so the answers are counted as possibly
 * protected).
 */
function isSensitive(
  list: ExportList,
  ordered: readonly string[],
  questions: readonly QuestionColumn[],
  classes: ReadonlySet<string>,
): boolean {
  const catalogue = new Map(columnsOf(list).map((c) => [c.id, c.cls]));
  if (ordered.some((id) => SENSITIVE.has(catalogue.get(id) ?? ''))) return true;
  return (
    questions.length > 0 && [OFFICIAL_SECTION, IDENTITY_NUMBER].some((cls) => classes.has(cls))
  );
}
