import type { PublishedWork } from '../../features/media/media-api';
import type {
  BeneficiaryFilter,
  BeneficiaryRow,
  BeneficiaryStatistics,
} from '@css/shared/beneficiaries';
import { api } from '../../lib/api';
import { listQuery } from '../list-query';
import { PAGE_SIZE, pageParams } from '../list-paging';

/** The filters the beneficiary tab keeps in the page URL (the search stays out). */
export const FILTER_KEYS = [
  'divisionId',
  'districtId',
  'upazilaId',
  'unionId',
  'type',
  'gender',
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

export function beneficiaryPage(
  filters: FilterValues,
  q: string,
  page: number,
  cursor: string | null,
) {
  return api<{ data: BeneficiaryRow[]; meta: PageMeta }>(
    `/beneficiaries${listQuery({
      ...filters,
      q: q || undefined,
      ...pageParams(page, cursor),
      limit: String(PAGE_SIZE),
      include: 'total',
    })}`,
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

/** What the caller may do on a profile; the server decides each flag from the person's state. */
export interface ProfileActions {
  block: boolean;
  unblock: boolean;
  editContact: boolean;
  requestCorrection: boolean;
  decideCorrection: boolean;
  proposeMerge: boolean;
  merge: boolean;
  revertMerge: boolean;
}

export type LockedField = 'name' | 'father_or_husband_name' | 'nid' | 'birth_reg';

export interface CorrectionRequest {
  id: string;
  beneficiaryId: string;
  field: LockedField;
  oldValue: string | null;
  newValue: string | null;
  reason: string;
  status: 'submitted' | 'approved' | 'rejected';
  requestedBy: string;
  requestedAt: string;
  decidedBy: string | null;
  decidedAt: string | null;
}

/** GET /beneficiaries/{id}: the 360° shell; a section the caller may not see is absent. */
export interface BeneficiaryProfile {
  id: string;
  benNo: number;
  /** The kept profile when this one was merged into it. */
  mergedInto: { id: string; benNo: number } | null;
  actions: ProfileActions;
  contactLog?: {
    field: string;
    oldValue: string | null;
    newValue: string | null;
    by: string | null;
    at: string;
  }[];
  corrections: CorrectionRequest[];
  blocks?: {
    id: string;
    reason: string;
    active: boolean;
    blockedAt: string;
    releasedAt: string | null;
    releaseReason: string | null;
  }[];
  merges: {
    id: string;
    role: 'kept' | 'merged';
    otherId: string | null;
    otherBenNo: number;
    status: 'merged' | 'reverted';
    mergedAt: string | null;
    revertedAt: string | null;
    leftBehind: number;
  }[];
  files?: { fileId: string; slot: string; kind: string }[];
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
    /** Left on a merged profile and shown here through the merge. */
    throughMerge?: boolean;
  }[];
  distributions: { id: string; projectId: string; status: string; doneAt: string }[];
  /** The published and done media works about the person. */
  media?: PublishedWork[];
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

/** The profile with its version, which the contact edit sends back in If-Match. */
export const beneficiaryProfile = (id: string) =>
  api<{ data: BeneficiaryProfile; meta: { etag: string } }>(`/beneficiaries/${id}`, {
    envelope: true,
  });

export const BENEFICIARIES_KEY = ['admin', 'beneficiaries'] as const;

/** The auto-fill of a found profile; the locked fields change only through a correction. */
export interface LookupAutofill {
  beneficiaryId: string;
  benNo: number;
  name: string;
  fatherOrHusbandName: string;
  motherName: string | null;
  mobile: string;
  genderCode: string;
  dob: string | null;
  ageYears: number | null;
  divisionId: string;
  districtId: string;
  upazilaId: string;
  unionId: string;
  village: string;
  postOffice: string | null;
  postCode: string | null;
  landmark: string | null;
  members14Plus: number | null;
  childrenUnder14: number | null;
  lockedFields: LockedField[];
}

/** POST /beneficiaries/lookup: never the other identity number and never a block reason. */
export interface LookupResult {
  found: boolean;
  blocked?: boolean;
  alreadyAppliedInProject?: boolean;
  mobileIsCallerOwn?: boolean;
  mergedInto?: { benNo: number };
  autofill?: LookupAutofill;
}

export const lookupBeneficiary = (
  body: { nid: string; projectId: string } | { birthReg: string; projectId: string },
) => api<LookupResult>('/beneficiaries/lookup', { method: 'POST', body });

export interface ContactChange {
  mobile?: string;
  divisionId?: string;
  districtId?: string;
  upazilaId?: string;
  unionId?: string;
  village?: string;
  postOffice?: string;
  postCode?: string;
  landmark?: string;
}

export interface ContactSaved {
  id: string;
  mobile: string;
  warnings: { code: 'beneficiary.mobile_shared'; count: number; benNos: string[] }[];
}

/** PATCH the mobile and the address with the version read when the dialog opened. */
export const updateContact = (id: string, etag: string, body: ContactChange) =>
  api<ContactSaved>(`/beneficiaries/${id}/contact`, {
    method: 'PATCH',
    body,
    headers: { 'If-Match': etag },
  });

export const requestCorrection = (
  id: string,
  body: { field: LockedField; newValue: string; reason: string },
) => api<CorrectionRequest>(`/beneficiaries/${id}/correction-requests`, { method: 'POST', body });

export const decideCorrection = (
  requestId: string,
  body: { decision: 'approve' } | { decision: 'reject'; reason: string },
) =>
  api<CorrectionRequest>(`/beneficiary-corrections/${requestId}/decision`, {
    method: 'POST',
    body,
  });

export const blockBeneficiary = (id: string, reason: string) =>
  api<unknown>(`/beneficiaries/${id}/block`, { method: 'POST', body: { reason } });
export const unblockBeneficiary = (id: string, reason: string) =>
  api<unknown>(`/beneficiaries/${id}/unblock`, { method: 'POST', body: { reason } });
