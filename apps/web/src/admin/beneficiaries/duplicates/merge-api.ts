import { api } from '../../../lib/api';
import { PAGE_SIZE } from '../../list-paging';
import { listQuery } from '../../list-query';
import { BENEFICIARIES_KEY } from '../beneficiaries-api';

/** Why two profiles look like one person (the rules of the suggestions, in their order). */
export const DUPLICATE_RULES = ['name_dob_union', 'name_father_mobile', 'same_mobile'] as const;
export type DuplicateRule = (typeof DUPLICATE_RULES)[number];

/** A suggested pair: who and by which rules; never an identity number or a mobile. */
export interface MergeCandidate {
  beneficiaryId: string;
  otherBeneficiaryId: string;
  benNo: string;
  otherBenNo: string;
  name: string;
  otherName: string;
  matchedOn: DuplicateRule[];
}

/** A merge or a proposal of one: the pair, its state and the reason. */
export interface MergeView {
  id: string;
  keptId: string;
  mergedId: string;
  keptBenNo: string;
  mergedBenNo: string;
  keptName: string;
  mergedName: string;
  status: 'proposed' | 'merged' | 'reverted';
  reason: string;
  proposedBy: string;
  proposedAt: string;
  mergedAt: string | null;
  revertedAt: string | null;
  leftBehind: number;
}

export const DUPLICATES_PATH = '/admin/beneficiaries/duplicates';

/** The address of the comparison of two profiles, and of the proposal it carries out. */
export const comparePath = (a: string, b: string, proposalId?: string) =>
  `${DUPLICATES_PATH}/compare?${new URLSearchParams({
    a,
    b,
    ...(proposalId ? { proposal: proposalId } : {}),
  }).toString()}`;

/** Every answer of the duplicates and merges; the profiles go stale with them. */
export const DUPLICATES_KEY = [...BENEFICIARIES_KEY, 'duplicates'] as const;

export const candidatePage = (cursor: string | null) =>
  api<{ data: MergeCandidate[]; meta: { nextCursor: string | null } }>(
    `/beneficiaries/merge-candidates${listQuery({
      cursor: cursor ?? undefined,
      limit: String(PAGE_SIZE),
    })}`,
    { envelope: true },
  );

export const dismissPair = (body: {
  beneficiaryId: string;
  otherBeneficiaryId: string;
  reason: string;
}) => api<unknown>('/beneficiaries/merge-dismissals', { method: 'POST', body });

export const mergeProposals = () => api<MergeView[]>('/beneficiary-merges?status=proposed');

interface MergeRequest {
  keptId: string;
  mergedId: string;
  reason: string;
}

export const proposeMerge = (body: MergeRequest) =>
  api<MergeView>('/beneficiary-merges', { method: 'POST', body });

export const mergeDirect = (body: MergeRequest) =>
  api<MergeView>('/beneficiary-merges/direct', { method: 'POST', body });

/** Carries out a proposal; the merging official may keep the other profile of the pair. */
export const executeMerge = (mergeId: string, keptId: string) =>
  api<MergeView>(`/beneficiary-merges/${mergeId}/execute`, { method: 'POST', body: { keptId } });

export const revertMerge = (mergeId: string, reason: string) =>
  api<MergeView>(`/beneficiary-merges/${mergeId}/revert`, { method: 'POST', body: { reason } });
