import { VOLUNTEER_TYPES } from '@css/shared/registration';
import { USER_STATES } from '@css/shared/auth';
import { Router } from 'express';
import { z } from 'zod';
import { principalOf } from '../auth/principal';
import type { Container } from '../container';
import { defineRoute, type RouteDeps } from '../openapi/define-route';

const text = z.string().nullable();
/** The own profile as the contract's OwnVolunteerProfile; only these fields leave. */
const ownProfile = z.object({
  userId: z.uuid(),
  volunteerId: z.uuid().nullable(),
  state: z.enum(USER_STATES),
  displayName: z.string(),
  mobile: text,
  email: text,
  inAnyProject: z.boolean(),
  fatherName: z.string(),
  motherName: z.string(),
  nid: z.string(),
  type: z.enum(VOLUNTEER_TYPES),
  whatsapp: text,
  divisionId: z.uuid(),
  districtId: z.uuid(),
  upazilaId: z.uuid(),
  unionId: z.uuid(),
  addressLine: text,
  education: text,
  experience: text,
  workDescription: text,
  previousProjects: text,
  facebookId: text,
  bank: z.object({
    bankName: z.string().optional(),
    accountName: z.string().optional(),
    accountNumber: z.string().optional(),
    routingNumber: z.string().optional(),
  }),
  referenceNid: text,
  photoFileId: z.uuid().nullable(),
  nidPhotoFileId: z.uuid().nullable(),
});

/** Volunteer profiles (openapi tag volunteers); the volunteer tab follows in T1.10. */
export function volunteersRouter(deps: RouteDeps, c: Pick<Container, 'volunteers'>): Router {
  const router = Router();

  defineRoute(router, deps, {
    tag: 'volunteers',
    method: 'get',
    path: '/volunteers/me',
    operationId: 'volunteers.self.get',
    summary:
      'Own volunteer profile with the own NID and bank details (D-081); never the own rating or category; also for a pending registrant',
    permission: 'authenticated',
    scope: 'self',
    allowPending: true,
    audit: 'none',
    idempotency: 'none',
    rateLimit: 'default',
    responses: { 200: ownProfile, 401: null, 404: null },
    handler: ({ req }) => c.volunteers.own(principalOf(req)),
  });

  return router;
}
