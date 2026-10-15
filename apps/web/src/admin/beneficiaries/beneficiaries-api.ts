import type {
  BeneficiaryFilter,
  BeneficiaryRow,
  BeneficiaryStatistics,
} from '@css/shared/beneficiaries';
import { api } from '../../lib/api';
import { listQuery } from '../list-query';

/** The filters the beneficiary tab keeps in the page URL (the search stays out). */
export const FILTER_KEYS = [
  'divisionId',
  'districtId',
  'upazilaId',
  'unionId',
  'type',
  'projectId',
  'year',
  'blocked',
] as const satisfies readonly (keyof BeneficiaryFilter)[];

export type FilterValues = Partial<Record<(typeof FILTER_KEYS)[number], string>>;

/** The default beneficiary types (BD-14); a project may rename them, the codes stay. */
export const BENEFICIARY_TYPES = [
  'elderly',
  'widow',
  'orphan',
  'disabled',
  'ill',
  'labourer',
  'extreme_poor',
  'other',
] as const;

interface PageMeta {
  nextCursor: string | null;
  prevCursor: string | null;
  total?: number | '10000+';
}

export function beneficiaryPage(filters: FilterValues, q: string, cursor: string | null) {
  return api<{ data: BeneficiaryRow[]; meta: PageMeta }>(
    `/beneficiaries${listQuery({ ...filters, q: q || undefined, cursor: cursor ?? undefined, include: 'total' })}`,
    { envelope: true },
  );
}

export function beneficiaryStatistics(filters: FilterValues, q: string) {
  return api<BeneficiaryStatistics>(
    `/beneficiaries/statistics${listQuery({ ...filters, q: q || undefined })}`,
  );
}

interface Dated {
  id: string;
  at: string;
}

/** GET /beneficiaries/{id}: the 360° shell; a section the caller may not see is absent. */
export interface BeneficiaryProfile {
  id: string;
  name: string;
  fatherOrHusbandName?: string;
  motherName?: string | null;
  genderCode?: string;
  ageYears?: number | null;
  classCode?: string | null;
  classOtherText?: string | null;
  occupationCode?: string | null;
  status: string;
  photoFileId?: string | null;
  divisionId: string;
  districtId: string;
  upazilaId: string;
  unionId?: string;
  village?: string;
  postOffice?: string | null;
  postCode?: string | null;
  landmark?: string | null;
  mobile?: string;
  familyMembers?: {
    id: string;
    name: string;
    relationshipCode: string | null;
    ageYears: number | null;
  }[];
  nid?: string | null;
  birthReg?: string | null;
  isBlocked?: boolean;
  projectsByYear: {
    year: number;
    projects: { id: string; code: string; nameBn: string; nameEn: string; status: string }[];
  }[];
  applications?: {
    id: string;
    appNo: string | null;
    projectId: string;
    status: string;
    submittedAt: string | null;
    approvedAt: string | null;
  }[];
  distributions: { id: string; projectId: string; status: string; doneAt: string }[];
  dawah?: {
    attendance: (Dated & { present: boolean })[];
    progress: (Dated & { status: string })[];
    exams: (Dated & { passed: boolean; score: number | null })[];
  };
  followUps?: {
    calls: (Dated & { projectId: string | null })[];
    evaluations: (Dated & { projectId: string | null; result: string | null })[];
  };
  activities?: {
    id: string;
    projectId: string;
    type: string;
    stage: string | null;
    status: string;
    doneAt: string;
  }[];
}

export const beneficiaryProfile = (id: string) => api<BeneficiaryProfile>(`/beneficiaries/${id}`);

export const BENEFICIARIES_KEY = ['admin', 'beneficiaries'] as const;
