import {
  type EmergencyContact,
  parseProfessionDetails,
  type SkillsValue,
} from '@css/shared/registration';
import { z } from 'zod';
import type { Prisma } from '../generated/prisma/client';
import { ApiError } from '../i18n/api-error';

/**
 * The personal, profession and skills data of a volunteer in one place (DECISION_LOG O-65, D-092;
 * BR-246): the columns to select, the view an API answer carries, the columns of a registration and
 * the update an approved request makes. The values are validated by `@css/shared/registration`
 * before they get here; the profession details are parsed once more against their own profession,
 * so nothing but that profession's fields is ever stored.
 */
export const DETAILS_SELECT = {
  bloodGroup: true,
  dateOfBirth: true,
  tshirtSize: true,
  volunteeringArea: true,
  profession: true,
  professionDetails: true,
  interestAreas: true,
  vehicle: true,
  canSwim: true,
  availability: true,
  emergencyContactName: true,
  emergencyContactMobile: true,
} as const;

type DetailsRow = Prisma.VolunteerGetPayload<{ select: typeof DETAILS_SELECT }>;

/** The data as an answer carries it (a date as YYYY-MM-DD, the contact as one object). */
export function detailsView(v: DetailsRow) {
  return {
    bloodGroup: v.bloodGroup,
    dateOfBirth: v.dateOfBirth?.toISOString().slice(0, 10) ?? null,
    tshirtSize: v.tshirtSize,
    volunteeringArea: v.volunteeringArea,
    profession: v.profession,
    // JSON columns, parsed at the boundary (the database checks their type)
    professionDetails: z.record(z.string(), z.unknown()).parse(v.professionDetails),
    interestAreas: z.array(z.string()).catch([]).parse(v.interestAreas),
    vehicle: v.vehicle,
    canSwim: v.canSwim,
    availability: v.availability,
    emergencyContact: { name: v.emergencyContactName, mobile: v.emergencyContactMobile },
  };
}

const asDate = (value: string | undefined | null) =>
  value ? new Date(`${value}T00:00:00.000Z`) : null;

/** The details of a profession as the JSON column takes them. */
function detailsOf(profession: string, details: unknown): Prisma.InputJsonObject {
  const parsed = parseProfessionDetails(profession, details);
  if (!parsed.success)
    throw new ApiError('validation.failed', 422, undefined, [
      {
        path: ['professionDetails', ...parsed.issues.flatMap((i) => i.path)].join('.'),
        code: 'validation.option_unknown',
      },
    ]);
  return parsed.data as Prisma.InputJsonObject;
}

export interface RegistrationDetails {
  dateOfBirth?: string | undefined;
  bloodGroup?: string | undefined;
  tshirtSize?: string | undefined;
  volunteeringArea?: string | undefined;
  profession: string;
  professionDetails?: unknown;
  interestAreas?: string[] | undefined;
  vehicle?: string | undefined;
  canSwim?: boolean | undefined;
  availability?: string | undefined;
  emergencyContact?: { name?: string | undefined; mobile?: string | undefined } | undefined;
}

/** The columns a registration sets; whatever the form left out is cleared (a reused account too). */
export function registrationDetailsColumns(body: RegistrationDetails) {
  return {
    dateOfBirth: asDate(body.dateOfBirth),
    bloodGroup: body.bloodGroup ?? null,
    tshirtSize: body.tshirtSize ?? null,
    volunteeringArea: body.volunteeringArea ?? null,
    profession: body.profession,
    professionDetails: detailsOf(body.profession, body.professionDetails),
    interestAreas: body.interestAreas ?? [],
    vehicle: body.vehicle ?? null,
    canSwim: body.canSwim ?? null,
    availability: body.availability ?? null,
    emergencyContactName: body.emergencyContact?.name ?? null,
    emergencyContactMobile: body.emergencyContact?.mobile ?? null,
  };
}

/** The update an approved or answered request makes for one of the new fields, or null for others. */
export function detailsUpdate(field: string, value: unknown): Prisma.VolunteerUpdateInput | null {
  switch (field) {
    case 'bloodGroup':
    case 'tshirtSize':
    case 'volunteeringArea':
      return { [field]: value as string };
    case 'dateOfBirth':
      return { dateOfBirth: asDate(value as string) };
    case 'profession': {
      const v = value as { profession: string; details?: unknown };
      return { profession: v.profession, professionDetails: detailsOf(v.profession, v.details) };
    }
    case 'skills': {
      const v = value as SkillsValue;
      return {
        interestAreas: v.interestAreas ?? [],
        vehicle: v.vehicle ?? null,
        canSwim: v.canSwim ?? null,
        availability: v.availability ?? null,
      };
    }
    case 'emergencyContact': {
      const v = value as EmergencyContact;
      return { emergencyContactName: v.name ?? null, emergencyContactMobile: v.mobile ?? null };
    }
    default:
      return null;
  }
}
