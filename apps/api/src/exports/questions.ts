import { questionColumnId } from '@css/shared/exports';
import type { FieldType, FormDefinition } from '@css/shared/forms';
import type { Bilingual } from '@css/shared/i18n';
import { type AnswerValue, answerValueSchema } from '@css/shared';
import type { PrismaService } from '../core/prisma.service';
import { readDefinition } from '../services/forms';
import type { Cell } from './rows';

/** One form question as an export column, keyed by its field key across the project's versions. */
export interface QuestionColumn {
  fieldKey: string;
  /** The column id (`q:` and the field key). */
  id: string;
  /** The newest version's words. */
  label: Bilingual;
  sectionKey: string;
  sectionTitle: Bilingual;
  /** In an official-only section: carried only by an export that carries the official section. */
  official: boolean;
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

/** Questions that hold no value of their own, or only files, which an export never carries. */
const NO_VALUE = new Set<FieldType>(['repeat_group', 'note', 'photo', 'file', 'signature']);

/**
 * The form questions of a project's application list as export columns (the export service
 * decision in docs/DECISION_LOG.md): every question once across the versions of the project's
 * application forms, under the newest version's words and in its order, the questions only older
 * versions had after them; each application is filled from its own version's answers.
 */
export class ExportQuestions {
  constructor(private readonly prisma: PrismaService) {}

  /** The question columns of a project; the official ones only when the export carries them. */
  async catalogue(projectId: string, includeOfficial: boolean): Promise<QuestionColumn[]> {
    const versions = await this.prisma.formVersion.findMany({
      where: {
        status: { in: ['published', 'retired'] },
        form: { projectId, kind: 'beneficiary_application' },
      },
      orderBy: [{ publishedAt: 'desc' }, { versionNo: 'desc' }],
      select: { id: true },
    });
    const columns = new Map<string, QuestionColumn>();
    for (const version of versions) {
      const definition: FormDefinition = await readDefinition(this.prisma, version.id, 'official');
      for (const section of definition.sections) {
        const official = section.visibility === 'official_only';
        if (official && !includeOfficial) continue;
        for (const field of section.fields) {
          if (NO_VALUE.has(field.type) || columns.has(field.fieldKey)) continue;
          columns.set(field.fieldKey, {
            fieldKey: field.fieldKey,
            id: questionColumnId(field.fieldKey),
            label: field.label,
            sectionKey: section.key,
            sectionTitle: section.title,
            official,
            group: field.settings?.repeat?.group ?? null,
            type: field.type,
            options: Object.fromEntries((field.options ?? []).map((o) => [o.code, o.label])),
          });
        }
      }
    }
    return [...columns.values()];
  }

  /**
   * The answers of the applications as cells of the given columns, in the file's language. An
   * official question's answer is left out of an application outside `officialFor`, the
   * applications the export's reach of the official section covers.
   */
  async values(
    applicationIds: readonly string[],
    columns: readonly QuestionColumn[],
    locale: 'bn' | 'en',
    officialFor: ReadonlySet<string>,
  ): Promise<Map<string, QuestionValues>> {
    const byKey = new Map(columns.map((c) => [c.fieldKey, c]));
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
        field: { select: { fieldKey: true } },
      },
    });
    const parsed = answers.flatMap((a) => {
      const value = answerValueSchema.safeParse(a.value);
      return value.success ? [{ ...a, value: value.data }] : [];
    });
    const places = await this.placeNames(
      parsed.map((a) => a.value),
      locale,
    );
    const result = new Map<string, QuestionValues>(
      applicationIds.map((id) => [id, { cells: {}, repeats: [] }]),
    );
    const repeated = new Map<string, Map<string, Map<number, Cell>>>();
    for (const answer of parsed) {
      const column = byKey.get(answer.field.fieldKey);
      const into = result.get(answer.applicationId);
      if (!column || !into) continue;
      if (column.official && !officialFor.has(answer.applicationId)) continue;
      const cell = cellOf(answer.value, column, locale, places);
      if (column.group === null) {
        into.cells[column.id] = cell;
        continue;
      }
      const ofApp = repeated.get(answer.applicationId) ?? new Map<string, Map<number, Cell>>();
      const ofColumn = ofApp.get(column.id) ?? new Map<number, Cell>();
      ofColumn.set(answer.repeatIndex, cell);
      ofApp.set(column.id, ofColumn);
      repeated.set(answer.applicationId, ofApp);
    }
    for (const [applicationId, ofApp] of repeated) {
      const into = result.get(applicationId)!;
      const rows = new Map<string, RepeatRow>();
      for (const [columnId, ofColumn] of ofApp) {
        const group = columns.find((c) => c.id === columnId)!.group!;
        const indices = [...ofColumn.keys()].sort((a, b) => a - b);
        // column ids are the definitions' own snake-case field keys, never input
        // eslint-disable-next-line security/detect-object-injection
        into.cells[columnId] = indices.map((i) => textOf(ofColumn.get(i) ?? null)).join('; ');
        for (const index of indices) {
          const key = `${group}#${index}`;
          const row = rows.get(key) ?? { group, index, cells: {} };
          // eslint-disable-next-line security/detect-object-injection -- a definition's own field key
          row.cells[columnId] = ofColumn.get(index) ?? null;
          rows.set(key, row);
        }
      }
      into.repeats = [...rows.values()].sort((a, b) =>
        a.group === b.group ? a.index - b.index : a.group.localeCompare(b.group),
      );
    }
    return result;
  }

  /** The names of the places the address answers name, in the file's language. */
  private async placeNames(values: AnswerValue[], locale: 'bn' | 'en') {
    const ids = values.flatMap((v) =>
      v.t === 'bd_address' ? [v.union_id, v.upazila_id, v.district_id] : [],
    );
    if (ids.length === 0) return new Map<string, string>();
    const rows = await this.prisma.location.findMany({
      where: { id: { in: [...new Set(ids)] } },
      select: { id: true, nameBn: true, nameEn: true },
    });
    return new Map(rows.map((l) => [l.id, locale === 'en' ? l.nameEn : l.nameBn]));
  }
}

/** An answer as the value of its cell: numbers stay numbers, dates dates, a choice its words. */
function cellOf(
  value: AnswerValue,
  column: QuestionColumn,
  locale: 'bn' | 'en',
  places: ReadonlyMap<string, string>,
): Cell {
  const options = new Map(Object.entries(column.options));
  const words = (code: string) => options.get(code)?.[locale === 'en' ? 'en' : 'bn'] ?? code;
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
function textOf(cell: Cell): string {
  if (cell === null) return '';
  if (cell instanceof Date) return cell.toISOString().slice(0, 10);
  if (Array.isArray(cell)) return cell.join(', ');
  if (typeof cell === 'object') return cell.code;
  return String(cell);
}
