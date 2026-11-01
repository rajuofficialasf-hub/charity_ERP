import { type AnswerValue, answerValueSchema } from '@css/shared';
import { questionColumnId } from '@css/shared/exports';
import type { FieldType, FormDefinition } from '@css/shared/forms';
import type { Bilingual } from '@css/shared/i18n';
import { IDENTITY_COLUMN } from '../applications/answers';
import type { PrismaService } from '../core/prisma.service';
import { readDefinition } from '../services/forms';
import { placeNames } from './places';
import type { Cell } from './rows';

/** The protected class of an official-only section's answers. */
export const OFFICIAL_SECTION = 'application.official_section';
/** The protected class of the identity number answer. */
export const IDENTITY_NUMBER = 'beneficiary.nid';

/** One form question as an export column, keyed by its field key across the project's versions. */
export interface QuestionColumn {
  fieldKey: string;
  /** The column id (`q:` and the field key). */
  id: string;
  /** The newest version's words. */
  label: Bilingual;
  sectionKey: string;
  sectionTitle: Bilingual;
  /** The protected class of the question in the newest version that has it, for the dialog. */
  cls: string | null;
  /** The repeat group the question belongs to, or null for a question asked once. */
  group: string | null;
  type: FieldType;
  /** The words of each option code. */
  options: Record<string, Bilingual>;
}

/** One row of a repeat group in one application, for the second sheet of a workbook. */
export interface RepeatRow {
  group: string;
  index: number;
  cells: Record<string, Cell>;
}

export interface QuestionValues {
  /** The value of each question; a repeated question's rows joined in one cell. */
  cells: Record<string, Cell>;
  repeats: RepeatRow[];
}

/** Whether an application's row may carry a protected class (the export's frozen reach). */
export type RowAllows = (applicationId: string, cls: string) => boolean;

/** Questions that hold no value of their own, or only files, which an export never carries. */
const NO_VALUE = new Set<FieldType>(['repeat_group', 'note', 'photo', 'file', 'signature']);

/** The protected class of a question, from its section and its standard column. */
function classOf(
  sectionVisibility: string,
  standardColumn: string | null | undefined,
): string | null {
  if (sectionVisibility === 'official_only') return OFFICIAL_SECTION;
  if (standardColumn === IDENTITY_COLUMN) return IDENTITY_NUMBER;
  return null;
}

/**
 * The form questions of a project's application list as export columns (the export service
 * decision in docs/DECISION_LOG.md): every question once across the versions of the project's
 * application forms, under the newest version's words and in its order, the questions only older
 * versions had after them. Whether a protected answer may leave is decided per answer, from the
 * section and column the question had in that application's own version.
 */
export class ExportQuestions {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * The question columns of a project. A question that is protected in any version and whose
   * class the export does not carry is left out of every version.
   */
  async catalogue(projectId: string, classes: ReadonlySet<string>): Promise<QuestionColumn[]> {
    const versions = await this.prisma.formVersion.findMany({
      where: {
        status: { in: ['published', 'retired'] },
        form: { projectId, kind: 'beneficiary_application' },
      },
      orderBy: [{ publishedAt: 'desc' }, { versionNo: 'desc' }],
      select: { id: true },
    });
    const definitions: FormDefinition[] = [];
    for (const version of versions)
      definitions.push(await readDefinition(this.prisma, version.id, 'official'));
    const withheld = new Set<string>();
    for (const definition of definitions)
      for (const section of definition.sections)
        for (const field of section.fields) {
          const cls = classOf(section.visibility, field.standardColumn);
          if (cls && !classes.has(cls)) withheld.add(field.fieldKey);
        }
    const columns = new Map<string, QuestionColumn>();
    for (const definition of definitions)
      for (const section of definition.sections)
        for (const field of section.fields) {
          const key = field.fieldKey;
          if (NO_VALUE.has(field.type) || withheld.has(key) || columns.has(key)) continue;
          columns.set(key, {
            fieldKey: key,
            id: questionColumnId(key),
            label: field.label,
            sectionKey: section.key,
            sectionTitle: section.title,
            cls: classOf(section.visibility, field.standardColumn),
            group: field.settings?.repeat?.group ?? null,
            type: field.type,
            options: Object.fromEntries((field.options ?? []).map((o) => [o.code, o.label])),
          });
        }
    return [...columns.values()];
  }

  /**
   * The answers of the applications as cells of the given columns, in the file's language. A
   * protected answer is left out unless the application's row may carry its class, judged by the
   * question as that application's own version had it. The ids must be rows the export's frozen
   * list query read, and `allows` must come from its frozen reach.
   */
  async values(
    applicationIds: readonly string[],
    columns: readonly QuestionColumn[],
    locale: 'bn' | 'en',
    allows: RowAllows,
  ): Promise<Map<string, QuestionValues>> {
    const byKey = new Map(columns.map((c) => [c.fieldKey, c]));
    const words = new Map(columns.map((c) => [c.fieldKey, new Map(Object.entries(c.options))]));
    const answers = await this.prisma.applicationAnswer.findMany({
      where: {
        applicationId: { in: [...applicationIds] },
        field: { fieldKey: { in: [...byKey.keys()] } },
      },
      orderBy: [{ applicationId: 'asc' }, { repeatIndex: 'asc' }],
      select: {
        applicationId: true,
        repeatIndex: true,
        value: true,
        field: {
          select: {
            fieldKey: true,
            standardColumn: true,
            formSection: { select: { visibility: true } },
          },
        },
      },
    });
    const kept = answers.flatMap((a) => {
      const cls = classOf(a.field.formSection.visibility, a.field.standardColumn);
      if (cls && !allows(a.applicationId, cls)) return [];
      // an answer that no longer reads as an answer leaves its cell empty
      const value = answerValueSchema.safeParse(a.value);
      return value.success ? [{ ...a, value: value.data }] : [];
    });
    const places = await placeNames(
      this.prisma,
      kept.flatMap((a) =>
        a.value.t === 'bd_address'
          ? [a.value.union_id, a.value.upazila_id, a.value.district_id]
          : [],
      ),
      locale,
    );
    const result = new Map<string, QuestionValues>(
      applicationIds.map((id) => [id, { cells: {}, repeats: [] }]),
    );
    /** The repeated answers of each application, by column, then by row. */
    const repeated = new Map<string, Map<QuestionColumn, Map<number, Cell>>>();
    for (const answer of kept) {
      const column = byKey.get(answer.field.fieldKey);
      const into = result.get(answer.applicationId);
      if (!column || !into) continue;
      const cell = cellOf(answer.value, words.get(column.fieldKey)!, locale, places);
      if (column.group === null) {
        into.cells[column.id] = cell;
        continue;
      }
      const ofApp =
        repeated.get(answer.applicationId) ?? new Map<QuestionColumn, Map<number, Cell>>();
      const ofColumn = ofApp.get(column) ?? new Map<number, Cell>();
      ofColumn.set(answer.repeatIndex, cell);
      ofApp.set(column, ofColumn);
      repeated.set(answer.applicationId, ofApp);
    }
    for (const [applicationId, ofApp] of repeated) {
      const into = result.get(applicationId)!;
      const rows = new Map<string, RepeatRow>();
      for (const [column, ofColumn] of ofApp) {
        const indices = [...ofColumn.keys()].sort((a, b) => a - b);
        into.cells[column.id] = indices
          .map((i) => textOf(ofColumn.get(i) ?? null, column.type))
          .join('; ');
        for (const index of indices) {
          const key = `${column.group}#${index}`;
          const row = rows.get(key) ?? { group: column.group!, index, cells: {} };
          row.cells[column.id] = ofColumn.get(index) ?? null;
          rows.set(key, row);
        }
      }
      into.repeats = [...rows.values()].sort((a, b) =>
        a.group === b.group ? a.index - b.index : a.group.localeCompare(b.group),
      );
    }
    return result;
  }
}

/** An answer as the value of its cell: numbers stay numbers, dates dates, a choice its words. */
function cellOf(
  value: AnswerValue,
  options: ReadonlyMap<string, Bilingual>,
  locale: 'bn' | 'en',
  places: ReadonlyMap<string, string>,
): Cell {
  // eslint-disable-next-line security/detect-object-injection -- the locale is one of two literals
  const words = (code: string) => options.get(code)?.[locale] ?? code;
  switch (value.t) {
    case 'number':
    case 'decimal':
      return value.v;
    case 'money':
      return Number(value.v);
    case 'date':
      return new Date(`${value.v}T00:00:00.000Z`);
    case 'datetime':
      return new Date(value.v);
    case 'single_select':
    case 'radio':
      return value.other ? `${words(value.v)} (${value.other})` : words(value.v);
    case 'multi_select':
    case 'checkbox':
      return [...value.v.map(words), ...(value.other ? [value.other] : [])].join(', ');
    case 'gps':
      return `${value.lat}, ${value.lng}`;
    case 'bd_address':
      return [
        value.village,
        places.get(value.union_id),
        places.get(value.upazila_id),
        places.get(value.district_id),
      ]
        .filter(Boolean)
        .join(', ');
    case 'calculation':
      return typeof value.v === 'boolean' ? String(value.v) : value.v;
    case 'number_table':
      return Object.entries(value.v)
        .map(
          ([row, cells]) =>
            `${row}: ${Object.entries(cells)
              .map(([c, n]) => `${c}=${n}`)
              .join(', ')}`,
        )
        .join('; ');
    case 'photo':
    case 'file':
    case 'signature':
      return null;
    default:
      return value.v;
  }
}

/** A cell as text, for the one cell that joins a repeated question's rows. */
function textOf(cell: Cell, type: FieldType): string {
  if (cell === null) return '';
  if (cell instanceof Date)
    return type === 'datetime' ? cell.toISOString() : cell.toISOString().slice(0, 10);
  return String(cell);
}
