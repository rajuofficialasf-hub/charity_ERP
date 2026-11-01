import { createHash } from 'node:crypto';
import { Transform, type TransformCallback } from 'node:stream';
import { uuidv7 } from '@css/shared';
import { columnsOf, EXPORT_LIMITS, type ExportList } from '@css/shared/exports';
import { formatDate } from '@css/shared/format';
import { type MessageKey, translate } from '@css/shared/i18n';
import type { Logger } from 'pino';
import type { Clock } from '../core/clock';
import type { PrismaService } from '../core/prisma.service';
import { CsvFile } from '../exports/csv';
import { type FileColumn, fileWords, headersOf, textsOf } from '../exports/file';
import { placeNames } from '../exports/places';
import { listTableHtml } from '../exports/pdf/list-table';
import type { PdfRenderer } from '../exports/pdf/renderer';
import type { ExportQuestions, QuestionColumn, QuestionValues } from '../exports/questions';
import type { BatchCursor, Cell, ExportRow, ExportRows } from '../exports/rows';
import { type FrozenExport, questionKind } from '../exports/service';
import { XlsxFile } from '../exports/xlsx';
import { ApiError } from '../i18n/api-error';
import type { StorageDriver } from '../storage/types';
import { QUEUES } from './queues';

/** The queue export jobs wait on; the data names the job row. */
export const EXPORT_QUEUE = 'exports' as const;

export interface ExportJobData {
  jobId: string;
}

/** The codes a failed job may keep; any other failure is stored as a plain failure. */
const KEPT_CODES = new Set(['export.pdf_unavailable', 'export.pdf_failed']);

/** The media type of each format's file. */
const MIME = new Map<string, string>([
  ['csv', 'text/csv; charset=utf-8'],
  ['xlsx', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'],
  ['pdf', 'application/pdf'],
]);
const mimeOf = (format: string): string => MIME.get(format) ?? 'application/octet-stream';

/** The heading of a list printed as a PDF. */
const PDF_TITLES = {
  volunteers: 'exports.pdf.title.volunteers',
  beneficiaries: 'exports.pdf.title.beneficiaries',
  applications: 'exports.pdf.title.applications',
} as const satisfies Record<ExportList, MessageKey>;

/** Counts the bytes and the SHA-256 of what passes through, on the way to storage. */
class Measure extends Transform {
  readonly hash = createHash('sha256');
  size = 0;

  override _transform(chunk: Buffer, _encoding: BufferEncoding, done: TransformCallback): void {
    this.hash.update(chunk);
    this.size += chunk.length;
    done(null, chunk);
  }
}

/** Writes the rows of one export, whatever the format. */
interface RowSink {
  start(): Promise<void>;
  write(row: ExportRow, answers: QuestionValues | undefined): Promise<void>;
  end(): Promise<void>;
}

export interface ExportRunnerLimits {
  maxRows: number;
  maxPdfRows: number;
  batchRows: number;
}

/**
 * Runs one export job (docs/api/API_STANDARDS.md, "Export job pattern"): replays the list query
 * the request froze in batches, writes the chosen columns in the job's language as CSV, Excel or
 * a PDF table, streams the file into the `exports` bucket and only then writes its `files` row
 * and the job's end. Safe to run again: a finished or failed job is left alone, and an attempt
 * first removes what an earlier one left. Only the last attempt marks the job failed.
 */
export class ExportRunner {
  private readonly limits: ExportRunnerLimits;

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageDriver,
    private readonly clock: Clock,
    private readonly rows: ExportRows,
    private readonly questions: ExportQuestions,
    private readonly pdf: Pick<PdfRenderer, 'render'>,
    private readonly logger?: Pick<Logger, 'error' | 'warn'>,
    limits: Partial<ExportRunnerLimits> = {},
  ) {
    this.limits = {
      maxRows: limits.maxRows ?? EXPORT_LIMITS.maxRows,
      maxPdfRows: limits.maxPdfRows ?? EXPORT_LIMITS.maxPdfRows,
      batchRows: limits.batchRows ?? EXPORT_LIMITS.batchRows,
    };
  }

  /** Runs the job; `attempt` is how many times pg-boss has retried it already. */
  async run(jobId: string, attempt: number): Promise<void> {
    const job = await this.prisma.exportJob.findUnique({ where: { id: jobId } });
    if (!job || job.status === 'done' || job.status === 'failed') return;
    const frozen = job.access as unknown as FrozenExport;
    const locale = job.locale === 'en' ? 'en' : 'bn';
    const key = objectKey(job.id, job.kind, job.format, job.createdAt);
    await this.prisma.exportJob.update({
      where: { id: job.id },
      data: { status: 'running', rowsDone: 0, updatedAt: this.clock.now() },
    });
    try {
      // whatever an earlier attempt of this job left in storage goes first
      await this.storage.remove('exports', key);
      const measure = new Measure();
      const stored = this.storage
        .put('exports', key, measure, {
          contentType: mimeOf(job.format),
        })
        .catch((error: unknown) => {
          // the writer stops at its next row instead of filling a stream nobody reads
          measure.destroy();
          throw error;
        });
      const filters = (job.filters ?? {}) as Record<string, unknown>;
      const written = this.write(
        job.id,
        job.format,
        job.columns,
        frozen,
        filters,
        locale,
        measure,
      ).catch((error: unknown) => {
        measure.destroy(error as Error);
        throw error;
      });
      const [put, rows] = await Promise.allSettled([stored, written]);
      if (rows.status === 'rejected') throw rows.reason;
      if (put.status === 'rejected') throw put.reason;
      await this.finish(job.id, job.requestedBy, job.format, key, measure, rows.value);
    } catch (error) {
      await this.storage.remove('exports', key).catch(() => undefined);
      const last = attempt >= QUEUES.exports.retryLimit;
      this.logger?.error({ err: error, jobId, attempt, last }, 'export job failed');
      if (!last) throw error;
      const code =
        error instanceof ApiError && KEPT_CODES.has(error.code) ? error.code : 'export.failed';
      await this.prisma.exportJob.update({
        where: { id: job.id },
        data: {
          status: 'failed',
          errorCode: code,
          finishedAt: this.clock.now(),
          updatedAt: this.clock.now(),
        },
      });
    }
  }

  /** The file row, then the job's end, in one transaction once the object is stored. */
  private async finish(
    jobId: string,
    requestedBy: string,
    format: string,
    key: string,
    measure: Measure,
    rowCount: number,
  ): Promise<void> {
    const fileId = uuidv7();
    const now = this.clock.now();
    await this.prisma.$transaction(async (tx) => {
      // the server made the file from its own data, so there is nothing to scan
      await tx.file.create({
        data: {
          id: fileId,
          bucket: 'exports',
          objectKey: key,
          kind: 'export',
          mime: mimeOf(format),
          sizeBytes: BigInt(measure.size),
          sha256: measure.hash.digest('hex'),
          uploadedBy: requestedBy,
          source: 'system',
          virusScan: 'clean',
          createdBy: requestedBy,
          updatedBy: requestedBy,
        },
      });
      await tx.exportJob.update({
        where: { id: jobId },
        data: {
          status: 'done',
          fileId,
          rowCount,
          rowsDone: rowCount,
          finishedAt: now,
          updatedAt: now,
        },
      });
    });
  }

  /** Writes every row into the stream and answers how many were written. */
  private async write(
    jobId: string,
    format: string,
    columnIds: readonly string[],
    frozen: FrozenExport,
    filters: Record<string, unknown>,
    locale: 'bn' | 'en',
    out: Measure,
  ): Promise<number> {
    const list = frozen.list.kind;
    const questions = frozen.questions;
    const columns = fileColumns(list, columnIds, questions, locale);
    const limit = format === 'pdf' ? this.limits.maxPdfRows : this.limits.maxRows;
    const sink =
      format === 'csv'
        ? csvSink(out, columns, locale)
        : format === 'xlsx'
          ? xlsxSink(out, columns, questions, locale)
          : this.pdfSink(out, columns, frozen, filters, locale);
    await sink.start();
    // in the score order a row scored again during the job may come round twice
    const written = new Set<string>();
    let cursor: BatchCursor | null = null;
    for (;;) {
      // each batch asks for no more than the rows still allowed, even when rows were added
      const size = Math.min(this.limits.batchRows, limit - written.size);
      if (size <= 0) break;
      const batch = await this.rows.batch(frozen.list, cursor, size);
      const fresh = batch.rows.filter((r) => !written.has(r.id));
      const answers =
        questions.length > 0 && fresh.length > 0
          ? await this.answersOf(fresh, questions, locale)
          : new Map<string, QuestionValues>();
      for (const row of fresh) {
        await sink.write(row, answers.get(row.id));
        written.add(row.id);
      }
      await this.prisma.exportJob.update({
        where: { id: jobId },
        data: { rowsDone: written.size, updatedAt: this.clock.now() },
      });
      if (!batch.next) break;
      cursor = batch.next;
    }
    await sink.end();
    return written.size;
  }

  /** The form answers of a batch, each protected answer only where its row may carry it. */
  private answersOf(
    rows: readonly ExportRow[],
    questions: readonly QuestionColumn[],
    locale: 'bn' | 'en',
  ): Promise<Map<string, QuestionValues>> {
    const classes = new Map(rows.map((r) => [r.id, new Set(r.classes)]));
    return this.questions.values(
      rows.map((r) => r.id),
      questions,
      locale,
      (id, cls) => classes.get(id)?.has(cls) ?? false,
    );
  }

  /** A list printed as a table: the rows are gathered (at most the PDF limit), then printed. */
  private pdfSink(
    out: Measure,
    columns: readonly FileColumn[],
    frozen: FrozenExport,
    filters: Record<string, unknown>,
    locale: 'bn' | 'en',
  ): RowSink {
    const words = fileWords(locale);
    const lines: string[][] = [];
    return {
      start: () => Promise.resolve(),
      write: (row, answers) => {
        const cells = merged(row, answers);
        lines.push(columns.flatMap((c) => textsOf(cells[c.id], c, locale, words)));
        return Promise.resolve();
      },
      end: async () => {
        const page = listTableHtml({
          locale,
          title: translate(locale, PDF_TITLES[frozen.list.kind]),
          filters: await this.filterText(frozen, filters, locale),
          date: formatDate(this.clock.now()),
          rowCount: lines.length,
          headers: headersOf(columns, words),
          rows: lines,
        });
        const pdf = await this.pdf.render(page);
        await new Promise<void>((resolve, reject) => {
          out.once('error', reject);
          out.end(pdf, () => resolve());
        });
      },
    };
  }

  /** The places and the project the list was filtered by, as their names. */
  private async filterText(
    frozen: FrozenExport,
    values: Record<string, unknown>,
    locale: 'bn' | 'en',
  ): Promise<string> {
    const placeIds = ['divisionId', 'districtId', 'upazilaId', 'unionId']
      // eslint-disable-next-line security/detect-object-injection -- fixed filter names of this list
      .map((k) => (Object.hasOwn(values, k) ? values[k] : undefined))
      .filter((v): v is string => typeof v === 'string');
    const names = await placeNames(this.prisma, placeIds, locale);
    const projectId =
      frozen.projectId ?? (typeof values.projectId === 'string' ? values.projectId : null);
    const project = projectId
      ? await this.prisma.project.findUnique({
          where: { id: projectId },
          select: { nameBn: true, nameEn: true },
        })
      : null;
    return [
      project ? (locale === 'en' ? project.nameEn : project.nameBn) : null,
      ...placeIds.map((id) => names.get(id) ?? null),
    ]
      .filter(Boolean)
      .join(', ');
  }
}

/** Where a job's file lives: by its month, then its job, one name per job. */
function objectKey(jobId: string, kind: string, format: string, createdAt: Date): string {
  const yyyy = String(createdAt.getUTCFullYear());
  const mm = String(createdAt.getUTCMonth() + 1).padStart(2, '0');
  return `${yyyy}/${mm}/${jobId}/${kind}.${format}`;
}

/** The file's columns: the list's chosen ones in the job's language, then the questions. */
function fileColumns(
  list: ExportList,
  ids: readonly string[],
  questions: readonly QuestionColumn[],
  locale: 'bn' | 'en',
): FileColumn[] {
  const catalogue = new Map(columnsOf(list).map((c) => [c.id, c]));
  const byId = new Map(questions.map((q) => [q.id, q]));
  return ids.flatMap((id): FileColumn[] => {
    const fixed = catalogue.get(id);
    if (fixed)
      return [{ id, header: translate(locale, fixed.header as MessageKey), kind: fixed.kind }];
    const q = byId.get(id);
    if (!q) return [];
    return [
      {
        id,
        // eslint-disable-next-line security/detect-object-injection -- the locale is one of two literals
        header: q.label[locale],
        // a repeated question's rows are joined into one text cell on the list
        kind: q.group === null ? questionKind(q) : 'text',
      },
    ];
  });
}

/** The cells of a row with its answers beside them. */
function merged(row: ExportRow, answers: QuestionValues | undefined): Record<string, Cell> {
  return answers ? { ...row.cells, ...answers.cells } : row.cells;
}

function csvSink(out: Measure, columns: readonly FileColumn[], locale: 'bn' | 'en'): RowSink {
  const file = new CsvFile(out, columns, locale);
  return {
    start: () => file.start(),
    write: (row, answers) => file.row(merged(row, answers)),
    end: () => file.end(),
  };
}

function xlsxSink(
  out: Measure,
  columns: readonly FileColumn[],
  questions: readonly QuestionColumn[],
  locale: 'bn' | 'en',
): RowSink {
  const chosen = new Set(columns.map((c) => c.id));
  const repeatColumns: FileColumn[] = questions
    .filter((q) => q.group !== null && chosen.has(q.id))
    .map((q) => ({
      id: q.id,
      // eslint-disable-next-line security/detect-object-injection -- the locale is one of two literals
      header: q.label[locale],
      kind: questionKind(q),
    }));
  const file = new XlsxFile(out, columns, locale, repeatColumns);
  return {
    start: () => Promise.resolve(),
    write: (row, answers) =>
      file.row(
        merged(row, answers),
        answers && answers.repeats.length > 0
          ? { appNo: String(row.cells.app_no ?? ''), rows: answers.repeats }
          : undefined,
      ),
    end: () => file.end(),
  };
}
