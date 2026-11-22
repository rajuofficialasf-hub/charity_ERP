import { z } from 'zod';
import { toEnglishDigits } from '../digits.js';
import type { ExtraAreaRow } from '../access/index.js';
import type { ProjectStatus } from '../projects/lifecycle.js';
import { PASSWORD_MAX_LENGTH } from './password.js';

/**
 * Officials created by the admin (docs/architecture/AUTH.md, "Officials created by the admin"): the
 * job ID, where an official belongs, the create and profile requests and the set-password link. The
 * API validates with these schemas and the PWA builds its forms on them.
 */

/**
 * Where an official belongs: the department's own staff, another department of the Foundation,
 * or an outside partner. Only department staff appear in the organogram.
 */
export const AFFILIATIONS = ['department', 'foundation', 'external'] as const;
export type Affiliation = (typeof AFFILIATIONS)[number];

export const JOB_ID_MAX_LENGTH = 32;

/** A typed job ID as stored: English digits, no surrounding spaces, capitals (case-insensitive). */
export function normalizeJobId(raw: string): string {
  return toEnglishDigits(raw.trim()).toUpperCase();
}

/**
 * True when the text reads as a Bangladeshi mobile number once spaces and dashes are gone (with or
 * without the 88 country code); such a job ID would make the login id ambiguous.
 */
export function looksLikeMobile(raw: string): boolean {
  return /^\+?(88)?01[0-9]{9}$/.test(toEnglishDigits(raw.trim()).replace(/[\s-]/g, ''));
}

/** Letters, digits and . _ / -, starting with a letter or a digit, 2 to 32 characters. */
const JOB_ID_PATTERN = /^[A-Z0-9][A-Z0-9._/-]{1,31}$/;

export const jobIdSchema = z
  .string()
  .max(64)
  .transform(normalizeJobId)
  .refine((v) => JOB_ID_PATTERN.test(v), { message: 'validation.job_id_format' })
  .refine((v) => !looksLikeMobile(v), { message: 'validation.job_id_mobile' });

const text = (max: number) => z.string().trim().min(1, { message: 'validation.required' }).max(max);
const email = z
  .email()
  .max(254)
  .transform((v) => v.toLowerCase());
const mobile = z.string().regex(/^01[3-9][0-9]{8}$/, { message: 'validation.mobile_format' });

/** The fields an admin keeps on an official's profile (create and edit alike). */
const profileShape = {
  jobId: jobIdSchema,
  displayName: text(200),
  designation: text(200),
  affiliation: z.enum(AFFILIATIONS),
  /** The other department or the partner organisation; only when not department staff. */
  affiliationUnit: text(200).nullable(),
  homeProgramId: z.uuid().nullable(),
  /** The official this one reports to (the organogram). */
  supervisorUserId: z.uuid().nullable(),
};

type UnitFields = { affiliation: Affiliation; affiliationUnit: string | null };
const unitMatches = (v: UnitFields) =>
  v.affiliation === 'department' ? v.affiliationUnit === null : v.affiliationUnit !== null;
const unitRule = {
  path: ['affiliationUnit'],
  message: 'validation.affiliation_unit',
};

/** Where an official works: the affiliation and, outside the department, its unit. */
export const staffWorkplaceSchema = z
  .strictObject({
    affiliation: profileShape.affiliation,
    affiliationUnit: profileShape.affiliationUnit,
  })
  .refine(unitMatches, unitRule);
export type StaffWorkplace = z.infer<typeof staffWorkplaceSchema>;

/** POST /users: a new official with one role; the set-password link goes to the email. */
export const staffCreateRequestSchema = z
  .strictObject({
    ...profileShape,
    email,
    mobile: mobile.nullable(),
    roleKey: z.string().min(1).max(64),
    /** The account's language; the system default language when left out. */
    language: z.enum(['bn', 'en']).optional(),
  })
  .refine(unitMatches, unitRule);
export type StaffCreateRequest = z.infer<typeof staffCreateRequestSchema>;

/** PUT /users/{userId}/profile: the whole profile, replacing the stored one. */
export const staffProfileRequestSchema = z.strictObject(profileShape).refine(unitMatches, unitRule);
export type StaffProfileRequest = z.infer<typeof staffProfileRequestSchema>;

/** POST /users/{userId}/invitation: a new link, to a corrected email while no password is set. */
export const invitationRenewRequestSchema = z.strictObject({ email: email.optional() });
export type InvitationRenewRequest = z.infer<typeof invitationRenewRequestSchema>;

/** The link's token: 32 random bytes in base64url. */
export const invitationTokenSchema = z
  .string()
  .regex(/^[A-Za-z0-9_-]{43}$/, { message: 'auth.invitation_invalid' });

/** POST /auth/invitations/accept: the token from the link and the chosen password. */
export const invitationAcceptRequestSchema = z.strictObject({
  token: invitationTokenSchema,
  password: z.string().min(1).max(PASSWORD_MAX_LENGTH),
});
export type InvitationAcceptRequest = z.infer<typeof invitationAcceptRequestSchema>;

/** What the set-password page shows before the password is chosen. */
export interface InvitationView {
  displayName: string;
  jobId: string;
  /** The password needs 12 characters (a role of global scope) instead of 8. */
  minPasswordLength: number;
  expiresAt: string;
}

/** The answer of a create or a new link: the link, shown once so the admin can copy it. */
export interface InvitationIssued {
  userId: string;
  link: string;
  expiresAt: string;
  emailed: boolean;
}

/** A name in both languages (a program). */
interface Named {
  id: string;
  name: { bn: string; en: string };
}

/** A role by its key, with its name as the roles table keeps it. */
export interface NamedRole {
  key: string;
  name: { bn: string; en: string };
}

/** An official's own profile (`GET /me/profile`): who they are, where they work, how to reach them. */
export interface OwnStaffProfile {
  id: string;
  displayName: string;
  jobId: string | null;
  designation: string | null;
  roles: NamedRole[];
  affiliation: Affiliation | null;
  affiliationUnit: string | null;
  program: Named | null;
  supervisor: { id: string; name: string } | null;
  mobile: string | null;
  email: string | null;
  state: 'pending' | 'active' | 'blocked' | 'deactivated';
  lastLoginAt: string | null;
  photoFileId: string | null;
  /** The extra areas the person holds now for volunteers, the newest first. */
  extraAreas: ExtraAreaRow[];
}

/** The figures of an official's work on one project (docs/BUSINESS_RULES.md, the work figures). */
export interface ProjectWorkFigures {
  /** In the official's area: the whole project for its PM or an access without an area. */
  area: {
    received: number;
    waiting: number;
    approved: number;
    rejected: number;
    waitlisted: number;
    volunteers: number;
  };
  /** By the official, anywhere on the project. */
  mine: {
    reviewed: number;
    approved: number;
    rejected: number;
    waitlisted: number;
    /** The median days from submission to their first decision on an application; null without one. */
    medianDays: number | null;
  };
}

/** A project an official works on, with their roles and areas there and their figures. */
export interface ProjectWork {
  id: string;
  code: string;
  name: { bn: string; en: string };
  year: number;
  status: ProjectStatus;
  program: Named;
  applyFrom: string | null;
  applyTo: string | null;
  /** program_manager through the program, regional_program_manager through an area, or the access row's role. */
  roles: NamedRole[];
  /** The official's areas there; empty with `wholeProject`. */
  areas: Named[];
  wholeProject: boolean;
  figures: ProjectWorkFigures;
}

/**
 * An official's projects by year, newest first (`GET /me/projects-work`,
 * `GET /users/{userId}/projects-work`). A person whom every project is open to gets no list.
 */
export interface ProjectsWork {
  everyProject: boolean;
  years: { year: number; projects: ProjectWork[] }[];
}
