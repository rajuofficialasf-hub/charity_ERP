import { api } from '../../../api/client';
import type { MergeCandidate, MergeCandidatePage, MergeView } from '../../../api/schemas';
import { PAGE_SIZE } from '../../list-paging';
import { listQuery } from '../../list-query';
import { BENEFICIARIES_KEY } from '../beneficiaries-api';

/** Why two profiles look like one person (the rules of the suggestions, in their order). */
export const DUPLICATE_RULES = [
  'name_dob_union',
  'name_father_mobile',
  'same_mobile',
] as const satisfies readonly MergeCandidate['matchedOn'][number][];
// the list holds every rule the API may name: a rule missing from it fails the typecheck
const everyRuleListed: Exclude<
  MergeCandidate['matchedOn'][number],
  (typeof DUPLICATE_RULES)[number]
> extends never
  ? true
  : never = true;
void everyRuleListed;
export type DuplicateRule = (typeof DUPLICATE_RULES)[number];

export type { MergeCandidate, MergeView };

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
  api<MergeCandidatePage>(
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
