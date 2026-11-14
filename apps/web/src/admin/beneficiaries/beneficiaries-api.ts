import type { BeneficiaryFilter, BeneficiaryStatistics } from '@css/shared/beneficiaries';
import { api } from '../../api/client';
import type {
  BeneficiaryPage,
  BeneficiaryProfile,
  BeneficiaryRecord,
  ContactSaved,
  CorrectionRequest,
  LockedField,
  LookupAutofill,
  LookupResult,
  ProfileActions,
} from '../../api/schemas';
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

/** Whose number a mobile is: the codes of the reference list `mobile_owner`. */
export const MOBILE_OWNERS = ['own', 'family', 'neighbour', 'other'] as const;

/** The default beneficiary types; a project may rename them, the codes stay. */
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

export function beneficiaryPage(
  filters: FilterValues,
  q: string,
  page: number,
  cursor: string | null,
) {
  return api<BeneficiaryPage>(
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

export type {
  BeneficiaryProfile,
  ContactSaved,
  CorrectionRequest,
  LockedField,
  LookupAutofill,
  LookupResult,
  ProfileActions,
};

/** The profile with its version, which the contact edit sends back in If-Match. */
export const beneficiaryProfile = (id: string) =>
  api<BeneficiaryRecord>(`/beneficiaries/${id}`, {
    envelope: true,
  });

export const BENEFICIARIES_KEY = ['admin', 'beneficiaries'] as const;

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
