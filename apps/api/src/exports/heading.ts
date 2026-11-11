import type { ExportList } from '@css/shared/exports';
import { formatDate } from '@css/shared/format';
import { type MessageKey, translate } from '@css/shared/i18n';
import type { PrismaService } from '../core/prisma.service.js';
import { fileWords, labelOf } from './file.js';
import { placeNames } from './places.js';
import type { CodedSource } from './rows.js';

/** The words before a filter's value in a PDF heading. */
const LABELS = {
  q: 'exports.pdf.filter.q',
  year: 'exports.pdf.filter.year',
  type: 'exports.pdf.filter.type',
  gender: 'exports.pdf.filter.gender',
  state: 'exports.pdf.filter.state',
  category: 'exports.pdf.filter.category',
  blocked: 'exports.pdf.filter.blocked',
  status: 'exports.pdf.filter.status',
  stage: 'exports.pdf.filter.stage',
  flag: 'exports.pdf.filter.flag',
  submittedFrom: 'exports.pdf.filter.submitted_from',
  submittedTo: 'exports.pdf.filter.submitted_to',
  ownerVolunteerId: 'exports.pdf.filter.volunteer',
  projectId: 'exports.pdf.filter.project',
} as const satisfies Record<string, MessageKey>;

const PLACES = ['divisionId', 'districtId', 'upazilaId', 'unionId'] as const;

/** The code list of a coded filter, which differs between the lists. */
function codedSource(list: ExportList, key: string): CodedSource | null {
  if (key === 'state') return 'user.state';
  if (key === 'status') return 'application.status';
  if (key === 'type')
    return list === 'volunteers' ? 'volunteer.type' : 'reference.beneficiary_class';
  if (key === 'gender') return 'reference.gender';
  return null;
}

const text = (value: unknown): string | null =>
  typeof value === 'string' || typeof value === 'number' ? String(value) : null;

/**
 * Every filter a list was exported with, as the PDF heading prints it: the places by their
 * names, each other filter with its words. A project or a volunteer named by id is printed by
 * name only when it reached rows of the export (the application list's own project always),
 * so a heading never names a record the person could not see.
 */
export async function filterHeading(
  prisma: PrismaService,
  input: {
    list: ExportList;
    filters: Readonly<Record<string, unknown>>;
    projectId: string | null;
    rowCount: number;
    locale: 'bn' | 'en';
  },
): Promise<string> {
  const { list, filters, locale } = input;
  const words = fileWords(locale);
  // an own key of the stored filters, checked in the same expression
  // eslint-disable-next-line security/detect-object-injection
  const value = (key: string): unknown => (Object.hasOwn(filters, key) ? filters[key] : undefined);
  const placeIds = PLACES.map((k) => text(value(k))).filter((v): v is string => v !== null);
  const projectId = input.projectId ?? (input.rowCount > 0 ? text(value('projectId')) : null);
  const volunteerId = input.rowCount > 0 ? text(value('ownerVolunteerId')) : null;
  const [places, project, volunteer] = await Promise.all([
    placeNames(prisma, placeIds, locale),
    projectId
      ? prisma.project.findUnique({
          where: { id: projectId },
          select: { nameBn: true, nameEn: true },
        })
      : null,
    volunteerId
      ? prisma.volunteer.findUnique({
          where: { id: volunteerId },
          select: { user: { select: { displayName: true } } },
        })
      : null,
  ]);
  const labelled = (key: keyof typeof LABELS, shown: string | null): string | null =>
    // eslint-disable-next-line security/detect-object-injection -- a key of the constant table above
    shown === null ? null : `${translate(locale, LABELS[key])}: ${shown}`;
  const parts: (string | null)[] = [
    labelled('projectId', project ? (locale === 'en' ? project.nameEn : project.nameBn) : null),
    ...placeIds.map((id) => places.get(id) ?? null),
  ];
  for (const key of Object.keys(LABELS) as (keyof typeof LABELS)[]) {
    if (key === 'projectId') continue;
    const raw = value(key);
    if (raw === undefined || raw === null || raw === '') continue;
    if (key === 'ownerVolunteerId') {
      parts.push(labelled(key, volunteer?.user.displayName ?? null));
      continue;
    }
    if (key === 'blocked') {
      parts.push(labelled(key, raw === 'true' || raw === true ? words.yes : words.no));
      continue;
    }
    if (key === 'submittedFrom' || key === 'submittedTo') {
      const at = text(raw);
      parts.push(labelled(key, at ? formatDate(new Date(at)) : null));
      continue;
    }
    const source = codedSource(list, key);
    const shown = text(raw);
    if (shown === null) continue;
    parts.push(labelled(key, source ? labelOf({ code: shown, source }, locale) : shown));
  }
  return parts.filter((p): p is string => p !== null).join('; ');
}
