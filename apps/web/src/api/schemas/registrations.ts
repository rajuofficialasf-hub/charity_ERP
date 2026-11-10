import { roleSchema } from '@css/shared/access';
import { z } from 'zod';
import { changeRequestSchema } from './account';
import { bilingual, dateTime } from './common';

/** A row of `GET /registrations` (pending volunteers in scope, staff for staff approvers). */
export const pendingRegistrationSchema = z.object({
  userId: z.uuid(),
  kind: z.enum(['volunteer', 'staff']),
  displayName: z.string(),
  status: z.enum(['awaiting_review', 'in_correction']),
  submittedAt: dateTime,
  volunteerType: z.string().nullable(),
  divisionId: z.uuid().nullable(),
  districtId: z.uuid().nullable(),
  designation: z.string().nullable(),
});
export type PendingRegistration = z.infer<typeof pendingRegistrationSchema>;

const bankField = z.string().nullable();

/**
 * `GET /registrations/{userId}`. The NID, the NID photo and the bank details are absent (not
 * empty) when the approver's role may not see them.
 */
export const registrationDetailSchema = pendingRegistrationSchema.extend({
  mobile: z.string().nullable(),
  email: z.string().nullable(),
  photoFileId: z.uuid().nullable(),
  homeProgramId: z.uuid().nullable(),
  homeDivisionId: z.uuid().nullable(),
  volunteer: z
    .object({
      id: z.uuid(),
      type: z.string(),
      fatherName: z.string(),
      motherName: z.string(),
      whatsapp: z.string().nullable(),
      divisionId: z.uuid(),
      districtId: z.uuid(),
      upazilaId: z.uuid(),
      unionId: z.uuid(),
      addressLine: z.string().nullable(),
      education: z.string().nullable(),
      experience: z.string().nullable(),
      workDescription: z.string().nullable(),
      previousProjects: z.string().nullable(),
      facebookId: z.string().nullable(),
      // the blood group and the date of birth only with the identity class
      bloodGroup: z.string().nullable().optional(),
      dateOfBirth: z.string().nullable().optional(),
      emergencyFullTime: z.boolean().nullable(),
      educationDetails: z.record(z.string(), z.unknown()),
      permanentAddress: z.record(z.string(), z.unknown()).nullable(),
      tshirtSize: z.string().nullable(),
      volunteeringArea: z.string().nullable(),
      profession: z.string().nullable(),
      professionDetails: z.record(z.string(), z.unknown()),
      interestAreas: z.array(z.string()),
      vehicle: z.string().nullable(),
      canSwim: z.boolean().nullable(),
      availability: z.string().nullable(),
      nid: z.string().optional(),
      nidPhotoFileId: z.uuid().nullable().optional(),
      nidPhotoBackFileId: z.uuid().nullable().optional(),
      bank: z
        .object({
          bankName: bankField,
          accountName: bankField,
          accountNumber: bankField,
          branchName: bankField,
          routingNumber: bankField,
        })
        .optional(),
      photoFileId: z.uuid().nullable(),
      referenceVolunteerId: z.uuid().nullable(),
    })
    .nullable(),
  blocklisted: z.boolean(),
  corrections: z.array(changeRequestSchema),
});
export type RegistrationDetailView = z.infer<typeof registrationDetailSchema>;

/** An edit request as the approvers' list returns it, with the volunteer's name. */
export const editRequestRowSchema = changeRequestSchema.extend({
  volunteerName: z.string().optional(),
});
export type EditRequestRow = z.infer<typeof editRequestRowSchema>;

/** A role of the catalogue (`GET /roles`). */
export const roleInfoSchema = roleSchema;
export type RoleInfo = z.infer<typeof roleInfoSchema>;

/** An official's waiting request as its deciders see it: the person and their current value. */
export const staffEditRequestRowSchema = changeRequestSchema.extend({
  userId: z.uuid(),
  personName: z.string(),
  personJobId: z.string().nullable(),
  currentValue: z.unknown().optional(),
  /** The names of the program or division the two values name, by id. */
  names: z.record(z.string(), bilingual),
});
export type StaffEditRequestRow = z.infer<typeof staffEditRequestRowSchema>;
