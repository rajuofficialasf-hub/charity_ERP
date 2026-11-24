import { z } from 'zod';
import { USER_STATES } from '../auth/schemas.js';
import { VOLUNTEER_TYPES } from '../registration/index.js';

/**
 * The nationwide volunteer tab: the filters shared by the list and its
 * statistics, the row and the counts. The category filter takes the four categories and the
 * inactive flag of the volunteer record (both in the class `volunteer.rating`); the server refuses
 * it to a caller who may not see categories.
 */
export const VOLUNTEER_CATEGORY_FILTERS = ['A', 'B', 'C', 'D', 'inactive'] as const;
export type VolunteerCategoryFilter = (typeof VOLUNTEER_CATEGORY_FILTERS)[number];

/**
 * The states the volunteer tab tells: the account's, with a registration the office rejected told
 * apart from an account closed after its approval (both are closed accounts).
 */
export const VOLUNTEER_STATES = [...USER_STATES, 'rejected'] as const;
export type VolunteerState = (typeof VOLUNTEER_STATES)[number];

export const volunteerFilterSchema = z.strictObject({
  /** A name, or an exact mobile number (or NID inside the caller's sensitive scope) in digits. */
  q: z.string().trim().min(2).max(100).optional(),
  divisionId: z.uuid().optional(),
  districtId: z.uuid().optional(),
  upazilaId: z.uuid().optional(),
  unionId: z.uuid().optional(),
  type: z.enum(VOLUNTEER_TYPES).optional(),
  state: z.enum(VOLUNTEER_STATES).optional(),
  projectId: z.uuid().optional(),
  category: z.enum(VOLUNTEER_CATEGORY_FILTERS).optional(),
  blocked: z.enum(['true', 'false']).optional(),
});
export type VolunteerFilter = z.infer<typeof volunteerFilterSchema>;

/** One row of the volunteer tab; `category` and `inactiveFlag` only reach callers who see them. */
export interface VolunteerRow {
  id: string;
  userId: string;
  displayName: string;
  type: (typeof VOLUNTEER_TYPES)[number];
  state: VolunteerState;
  divisionId: string;
  districtId: string;
  upazilaId: string;
  photoFileId: string | null;
  blocked: boolean;
  projects: { id: string; code: string; nameBn: string; nameEn: string }[];
  category?: 'A' | 'B' | 'C' | 'D' | null;
  inactiveFlag?: boolean;
}

/** The counts above the volunteer tab, for the filters in use; `inactive` only with categories. */
export interface VolunteerStatistics {
  volunteers: {
    total: number;
    active: number;
    pending: number;
    blocked: number;
    deactivated: number;
    /** Registrations the office rejected, apart from the accounts closed after approval. */
    rejected: number;
    inactive?: number;
  };
  applications: { total: number; approved: number; underReview: number };
}

/** Application states counted as approved and as under review (workflow-templates _common). */
export const APPROVED_STATES = ['approved', 'implementation', 'completed'] as const;
export const UNDER_REVIEW_STATES = [
  'needs_verification',
  'submitted',
  'under_review',
  'reviewed',
  'waitlisted',
] as const;
/** Application states that are not counted at all: not yet sent, or removed by the owner. */
export const UNCOUNTED_STATES = ['draft', 'deleted'] as const;
