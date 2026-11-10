// The people the contract cases make for themselves through the API, so no case depends on what
// another left: a new volunteer through the registration, an approved one, a new official.
import { expect } from 'vitest';
import {
  invitationIssuedSchema,
  invitationViewSchema,
  meSchema,
  registrationStartSchema,
  registrationVerifyResultSchema,
  storedFileSchema,
  volunteerRowSchema,
} from '../../../src/api/schemas';
import { z } from 'zod';
import { expectContract, expectStatus } from './expect';
import { at, call, DEMO_PASSWORD, DUMMY_OTP, signIn } from './session';
import { digits, HEAD, must, PNG, savar, unread } from './world';

/**
 * A new volunteer registered as the registration page does it: the two codes, the photo and the
 * form, each answer read with the app's schema. Answers the pending person.
 */
export async function register(): Promise<{ userId: string; mobile: string }> {
  const mobile = `019${digits(8)}`;
  const { registrationId } = expectContract(
    await call(null, 'POST', '/auth/register/start', { kind: 'volunteer' }),
    201,
    registrationStartSchema,
  );
  for (const [channel, address] of [
    ['sms', mobile],
    ['email', `contract.${digits(8)}@example.org`],
  ] as const)
    expectStatus(
      await call(null, 'POST', '/auth/register/otp/send', { registrationId, channel, address }),
      204,
    );
  const first = expectContract(
    await call(null, 'POST', '/auth/register/otp/verify', {
      registrationId,
      channel: 'sms',
      code: DUMMY_OTP,
    }),
    200,
    registrationVerifyResultSchema,
  );
  expect(first.verified).toEqual(['sms']);
  const both = expectContract(
    await call(null, 'POST', '/auth/register/otp/verify', {
      registrationId,
      channel: 'email',
      code: DUMMY_OTP,
    }),
    200,
    registrationVerifyResultSchema,
  );
  expect(both.registrationToken).toBeDefined();
  const token = { 'X-Registration-Token': both.registrationToken ?? '' };
  expectContract(
    await call(
      null,
      'POST',
      at`/auth/register/photos/${'photo'}?registrationId=${registrationId}&source=gallery`,
      PNG,
      { ...token, 'Content-Type': 'image/png' },
    ),
    201,
    storedFileSchema,
  );
  const places = await savar(null);
  const me = expectContract(
    await call(
      null,
      'POST',
      '/auth/register/submit',
      {
        kind: 'volunteer',
        registrationId,
        password: DEMO_PASSWORD,
        name: 'চুক্তি নিবন্ধন (নমুনা)',
        fatherName: 'পিতা (নমুনা)',
        motherName: 'মাতা (নমুনা)',
        nid: `5${digits(9)}`,
        divisionId: places.division,
        districtId: places.district,
        upazilaId: places.upazila,
        unionId: places.union,
        profession: 'student',
      },
      token,
    ),
    201,
    meSchema,
  );
  return { userId: me.id, mobile };
}

/**
 * A new official of the department with one role, made by the Department Head; the set-password
 * link is checked and used as the invitation page does it. Answers the account and the job id
 * they sign in with.
 */
export async function newOfficial(
  roleKey = 'project_executive',
): Promise<{ userId: string; jobId: string }> {
  const head = await signIn(HEAD);
  const jobId = `CT-${digits(6)}`;
  const { userId, link } = must(
    await call(head, 'POST', '/users', {
      jobId,
      displayName: 'চুক্তি কর্মকর্তা (নমুনা)',
      designation: 'চুক্তি পরীক্ষা',
      affiliation: 'department',
      affiliationUnit: null,
      homeProgramId: null,
      homeDivisionId: null,
      supervisorUserId: null,
      email: `official.${digits(8)}@example.org`,
      mobile: null,
      roleKey,
    }),
    201,
    'official',
    invitationIssuedSchema,
  ).data;
  const token = /[A-Za-z0-9_-]{43}$/.exec(link)?.[0] ?? '';
  const view = expectContract(
    await call(null, 'POST', '/auth/invitations/check', { token }),
    200,
    invitationViewSchema,
  );
  expect(view.jobId).toBe(jobId);
  expectStatus(
    await call(null, 'POST', '/auth/invitations/accept', { token, password: DEMO_PASSWORD }),
    204,
  );
  return { userId, jobId };
}

/**
 * A new volunteer registered and approved by the Department Head. Answers the account, the
 * volunteer and the mobile they sign in with.
 */
export async function approvedVolunteer(): Promise<{
  userId: string;
  volunteerId: string;
  mobile: string;
}> {
  const person = await register();
  const head = await signIn(HEAD);
  must(await call(head, 'POST', `/registrations/${person.userId}/approve`), 200, 'approve', unread);
  const [row] = must(
    await call(head, 'GET', `/volunteers?q=${person.mobile}`),
    200,
    'volunteer',
    z.array(volunteerRowSchema),
  ).data;
  return { ...person, volunteerId: row!.id };
}
