import type { VolunteerFilter, VolunteerRow, VolunteerStatistics } from '@css/shared/volunteers';
import { api } from '../../lib/api';

/** The keys of the filters the volunteer tab keeps in the page URL (the search stays out). */
export const FILTER_KEYS = [
  'divisionId',
  'districtId',
  'upazilaId',
  'unionId',
  'type',
  'state',
  'projectId',
  'category',
  'blocked',
] as const satisfies readonly (keyof VolunteerFilter)[];

export type FilterValues = Partial<Record<(typeof FILTER_KEYS)[number], string>>;

interface PageMeta {
  nextCursor: string | null;
  prevCursor: string | null;
  total?: number | '10000+';
}

const query = (values: Record<string, string | undefined>) => {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(values)) if (value) params.set(key, value);
  const text = params.toString();
  return text ? `?${text}` : '';
};

/** GET /volunteers: one page of the tab for the filters, the search and a cursor. */
export function volunteerPage(filters: FilterValues, q: string, cursor: string | null) {
  return api<{ data: VolunteerRow[]; meta: PageMeta }>(
    `/volunteers${query({ ...filters, q: q || undefined, cursor: cursor ?? undefined, include: 'total' })}`,
    { envelope: true },
  );
}

/** GET /volunteers/statistics for the same filters and search. */
export function volunteerStatistics(filters: FilterValues, q: string) {
  return api<VolunteerStatistics>(
    `/volunteers/statistics${query({ ...filters, q: q || undefined })}`,
  );
}

export const VOLUNTEERS_KEY = ['admin', 'volunteers'] as const;
