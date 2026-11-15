import { z } from 'zod';

export * from './guardian-relation.js';
export * from './identity.js';
export * from './match-key.js';
export * from './mobile-owner.js';
export * from './name-variants.js';
export * from './requests.js';

/**
 * The nationwide beneficiary tab: the filters shared by the list and its
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
  /**
   * Only the people helped more than once in one year (the kept counter `max_helps_in_year`);
   * refused for a caller without the application history class.
   */
  helpedMoreThanOnceInYear: z.enum(['true']).optional(),
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
  /** With the contact class; null for a person reached through their volunteer. */
  mobile?: string | null;
  /** With the identity class: whether an identity document is on file, never its number. */
  hasDocument?: boolean;
  isBlocked?: boolean;
  /** The uploaded photo, with the personal-details class; null shows the initial. */
  photoFileId?: string | null;
  /** The times the person was helped, with the application history class. */
  helpCount?: number;
}

/** The orders of the beneficiary tab besides the newest first: by the times helped. */
export const BENEFICIARY_SORTS = ['-helpCount', 'helpCount'] as const;
export type BeneficiarySort = (typeof BENEFICIARY_SORTS)[number];

/** The counts above the beneficiary tab for the filters in use. */
export interface BeneficiaryStatistics {
  total: number;
  assistedThisYear: number;
  blocked?: number;
  /** The men and the women; only for callers who see the gender. */
  male?: number;
  female?: number;
}
