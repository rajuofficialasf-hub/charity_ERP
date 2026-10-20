import { z } from 'zod';
import { reasonRequestSchema } from '../auth/schemas.js';
import { mobileSchema, nidSchema } from '../registration/index.js';
import { BIRTH_REG_PATTERN, LOCKED_FIELDS, NID_PATTERN } from './identity.js';

/** Every reason and note of the beneficiary master: 3 to 1,000 characters after trimming. */
const reason = reasonRequestSchema.shape.reason;
const birthRegSchema = z
  .string()
  .regex(BIRTH_REG_PATTERN, { message: 'validation.birth_reg_format' });

/**
 * The lookup of the application form: exactly one identity number, inside a project the caller
 * works on. The app turns Bengali digits into English ones before it sends.
 */
export const lookupRequestSchema = z
  .strictObject({
    nid: nidSchema.optional(),
    birthReg: birthRegSchema.optional(),
    projectId: z.uuid(),
  })
  .superRefine((v, ctx) => {
    if (v.nid === undefined && v.birthReg === undefined)
      ctx.addIssue({ code: 'custom', path: ['nid'], message: 'beneficiary.identity_missing' });
    if (v.nid !== undefined && v.birthReg !== undefined)
      ctx.addIssue({ code: 'custom', path: ['birthReg'], message: 'validation.malformed' });
  });
export type LookupRequest = z.infer<typeof lookupRequestSchema>;

/** A request to correct a locked field: the new value in that field's format and a reason. */
export const correctionRequestSchema = z
  .strictObject({
    field: z.enum(LOCKED_FIELDS),
    newValue: z.string().trim().min(1, { message: 'validation.required' }).max(200),
    reason,
  })
  .superRefine((v, ctx) => {
    if (v.field === 'nid' && !NID_PATTERN.test(v.newValue))
      ctx.addIssue({ code: 'custom', path: ['newValue'], message: 'validation.nid_format' });
    if (v.field === 'birth_reg' && !BIRTH_REG_PATTERN.test(v.newValue))
      ctx.addIssue({ code: 'custom', path: ['newValue'], message: 'validation.birth_reg_format' });
  });
export type CorrectionRequestCreate = z.infer<typeof correctionRequestSchema>;

/** A field that only a correction request changes; named so the answer says why, not "unknown". */
const locked = z.never({ message: 'beneficiary.locked_field' }).optional();
const optionalText = (max: number) => z.string().trim().min(1).max(max).optional();

/**
 * The contact data an official edits outside an application: the mobile and the address. The
 * four places of the address change together, so they always form one chain.
 */
export const contactUpdateSchema = z
  .strictObject({
    mobile: mobileSchema.optional(),
    divisionId: z.uuid().optional(),
    districtId: z.uuid().optional(),
    upazilaId: z.uuid().optional(),
    unionId: z.uuid().optional(),
    village: optionalText(200),
    postOffice: optionalText(100),
    postCode: z
      .string()
      .regex(/^[0-9]{4}$/, { message: 'validation.failed' })
      .optional(),
    landmark: optionalText(200),
    name: locked,
    fatherOrHusbandName: locked,
    nid: locked,
    birthReg: locked,
  })
  .superRefine((v, ctx) => {
    const places = [v.divisionId, v.districtId, v.upazilaId, v.unionId];
    if (places.some((p) => p !== undefined) && places.some((p) => p === undefined))
      ctx.addIssue({ code: 'custom', path: ['unionId'], message: 'validation.required' });
    if (Object.values(v).every((value) => value === undefined))
      ctx.addIssue({ code: 'custom', path: [], message: 'validation.required' });
  });
export type ContactUpdate = z.infer<typeof contactUpdateSchema>;

const differentPair =
  <T extends Record<string, unknown>>(a: keyof T & string, b: keyof T & string) =>
  (v: T, ctx: z.RefinementCtx) => {
    if (v[a] === v[b]) ctx.addIssue({ code: 'custom', path: [b], message: 'validation.failed' });
  };

/** A merge proposal or a direct merge: the profile to keep, the one to retire, and why. */
export const mergeRequestSchema = z
  .strictObject({ keptId: z.uuid(), mergedId: z.uuid(), reason })
  .superRefine(differentPair('keptId', 'mergedId'));
export type MergeRequest = z.infer<typeof mergeRequestSchema>;

/** The merge of a proposal; the merging official may keep the other profile of the pair. */
export const mergeExecuteSchema = z.strictObject({ keptId: z.uuid().optional() });
export type MergeExecute = z.infer<typeof mergeExecuteSchema>;

/** A suggested pair marked as two different people, with the reason. */
export const dismissalRequestSchema = z
  .strictObject({ beneficiaryId: z.uuid(), otherBeneficiaryId: z.uuid(), reason })
  .superRefine(differentPair('beneficiaryId', 'otherBeneficiaryId'));
export type DismissalRequest = z.infer<typeof dismissalRequestSchema>;
