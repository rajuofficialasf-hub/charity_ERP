import { z } from 'zod';

export * from './identity.js';
export * from './requests.js';

/**
 * The nationwide beneficiary tab (DECISION_LOG O-67, D-094): the filters shared by the list and its
 * counts. A filter on something a caller may not see (the union, the blocklist status) is refused
 * by the server; a search in digits matches the mobile number only for callers who see it, and an
 * NID or birth-registration number only inside the caller's `beneficiary.view_nid` scope.
 */
export const beneficiaryFilterSchema = z.strictObject({
  q: z.string().trim().min(2).max(100).optional(),
  divisionId: z.uuid().optional(),
  districtId: z.uuid().optional(),
  upazilaId: z.uuid().optional(),
  unionId: z.uuid().optional(),
  /** The beneficiary type (class code of the reference list, e.g. widow, elderly). */
  type: z
    .string()
    .regex(/^[a-z][a-z0-9_]{0,49}$/)
    .optional(),
  /** The gender: the two the list counts, so a filter never hides behind no card. */
  gender: z.enum(['male', 'female']).optional(),
  projectId: z.uuid().optional(),
  year: z.coerce.number().int().min(2000).max(2100).optional(),
  blocked: z.enum(['true', 'false']).optional(),
});
export type BeneficiaryFilter = z.infer<typeof beneficiaryFilterSchema>;

/** One row of the beneficiary tab; the protected parts only for callers who see them. */
export interface BeneficiaryRow {
  id: string;
  /** The BEN number; shown through `formatBenNo`. */
  benNo: number;
  name: string;
  /** With the personal-details class only (the Media and Procurement Teams do not get it). */
  fatherOrHusbandName?: string;
  classCode?: string | null;
  status: string;
  divisionId: string;
  districtId: string;
  upazilaId: string;
  unionId?: string;
  village?: string;
  mobile?: string;
  isBlocked?: boolean;
}

/** The counts above the beneficiary tab for the filters in use. */
export interface BeneficiaryStatistics {
  total: number;
  assistedThisYear: number;
  blocked?: number;
  /** The men and the women; only for callers who see the gender. */
  male?: number;
  female?: number;
}
