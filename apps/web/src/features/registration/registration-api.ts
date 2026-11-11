import type { Me } from '@css/shared/auth';
import {
  type PhotoSlot,
  REGISTRATION_TOKEN_HEADER,
  type RegistrationKind,
  type RegistrationStart,
  type RegistrationSubmitRequest,
  type RegistrationChannel,
  type RegistrationVerifyResult,
} from '@css/shared/registration';
import { api, ApiFailure } from '../../api/client';
import type { Location, StoredFile } from '../../api/schemas';
import { orCached } from '../../lib/or-cached';

/**
 * The calls of the registration before login (docs/architecture/AUTH.md, "Registration with two
 * OTPs"). The draft token lives only in memory and travels in the X-Registration-Token header,
 * never in a URL.
 */
export interface Draft {
  registrationId: string;
  kind: RegistrationKind;
  token?: string;
}

export type { Location };

/** A new draft of the kind; nothing is sent yet. */
export const startDraft = (kind: RegistrationKind) =>
  api<RegistrationStart>('/auth/register/start', { method: 'POST', body: { kind } }, false);

/** Sends a code to one contact of the draft. */
export const sendCode = (registrationId: string, channel: RegistrationChannel, address: string) =>
  api<void>(
    '/auth/register/otp/send',
    { method: 'POST', body: { registrationId, channel, address } },
    false,
  );

/** Verifies the code of one channel; the second one answers the draft token. */
export const verifyCode = (registrationId: string, channel: RegistrationChannel, code: string) =>
  api<RegistrationVerifyResult>(
    '/auth/register/otp/verify',
    { method: 'POST', body: { registrationId, channel, code } },
    false,
  );

const tokenHeader = (draft: Draft) => ({ [REGISTRATION_TOKEN_HEADER]: draft.token ?? '' });

export const uploadDraftPhoto = async (
  draft: Draft,
  slot: PhotoSlot,
  photo: Blob,
  source: string,
) =>
  api<StoredFile>(
    `/auth/register/photos/${slot}?registrationId=${draft.registrationId}&source=${source}`,
    {
      method: 'POST',
      rawBody: await photo.arrayBuffer(),
      headers: { ...tokenHeader(draft), 'Content-Type': photo.type },
    },
    false,
  );

export const submitRegistration = (draft: Draft, body: RegistrationSubmitRequest) =>
  api<Me>('/auth/register/submit', { method: 'POST', body, headers: tokenHeader(draft) }, false);

/**
 * The children of a location (the divisions without a parent): from the server, or from the
 * phone's locations master when the network is away, so the address cascade of an application
 * taken offline still offers its lists.
 */
export const locations = (parentId?: string) =>
  orCached(
    () =>
      parentId
        ? api<Location[]>(`/locations?parentId=${parentId}`, {}, false)
        : api<Location[]>('/locations', {}, false),
    async () => (await import('../../offline/snapshot')).cachedChildren(parentId ?? null),
  );

/** Field errors of a 422 answer by field name, and the first message for everything else. */
export function failureOf(error: unknown, offline: string) {
  if (!(error instanceof ApiFailure)) return { fields: {}, message: offline, code: 'offline' };
  const fields = Object.fromEntries(
    error.details
      .map((d) => [d.path ?? '', d.message] as const)
      .filter((e): e is readonly [string, string] => typeof e[1] === 'string'),
  );
  return {
    fields,
    message: Object.keys(fields).length ? null : error.message,
    code: error.code,
  };
}
