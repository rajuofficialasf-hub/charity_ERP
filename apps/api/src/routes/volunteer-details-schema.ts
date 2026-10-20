import {
  AVAILABILITIES,
  BLOOD_GROUPS,
  INTEREST_AREAS,
  PROFESSIONS,
  TSHIRT_SIZES,
  VEHICLES,
  VOLUNTEERING_AREAS,
} from '@css/shared/registration';
import { z, type ZodType } from 'zod';
import { sensitive } from '../access/field-mask';

/**
 * The response fields of the personal, profession and skills data (DECISION_LOG O-65, D-092;
 * BR-246, BR-248). The blood group and the date of birth belong to the class
 * `volunteer.identity`; `protect` marks them for a view an approver opens. The own profile passes
 * `false`: it answers only for the signed-in volunteer, who may see their own values (as for the NID).
 */
export function volunteerDetailsShape(protect: boolean) {
  const mark = <T extends ZodType>(schema: T): T =>
    protect ? sensitive(schema, 'volunteer.identity') : schema;
  return {
    bloodGroup: mark(z.enum(BLOOD_GROUPS).nullable()),
    dateOfBirth: mark(z.string().nullable()),
    tshirtSize: z.enum(TSHIRT_SIZES).nullable(),
    volunteeringArea: z.enum(VOLUNTEERING_AREAS).nullable(),
    profession: z.enum(PROFESSIONS).nullable(),
    professionDetails: z.record(z.string(), z.unknown()),
    interestAreas: z.array(z.enum(INTEREST_AREAS)),
    vehicle: z.enum(VEHICLES).nullable(),
    canSwim: z.boolean().nullable(),
    availability: z.enum(AVAILABILITIES).nullable(),
    emergencyFullTime: z.boolean().nullable(),
    educationDetails: z.record(z.string(), z.unknown()),
    permanentAddress: z.record(z.string(), z.unknown()).nullable(),
  };
}
