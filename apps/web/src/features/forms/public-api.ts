import type { Answer } from '@css/shared/forms';
import { api } from '../../api/client';
import type { PublicForm, PublicSubmission, StoredFile } from '../../api/schemas';

export type { PublicForm };

/** No login: the token in the path is the whole access, so no refresh is tried on a refusal. */
export const publicForm = (token: string) =>
  api<PublicForm>(`/public/forms/${encodeURIComponent(token)}`, {}, false);

export const submitPublic = (
  token: string,
  body: { clientUuid: string; clientCreatedAt: string; answers: Answer[] },
) =>
  api<PublicSubmission>(
    `/public/forms/${encodeURIComponent(token)}/applications`,
    { method: 'POST', body },
    false,
  );

/** One photo of an application before it is sent, as the raw image body. */
export const uploadPublicPhoto = async (
  token: string,
  clientUuid: string,
  fieldKey: string,
  photo: Blob,
) =>
  api<StoredFile>(
    `/public/forms/${encodeURIComponent(token)}/photos?clientUuid=${encodeURIComponent(clientUuid)}&fieldKey=${encodeURIComponent(fieldKey)}`,
    {
      method: 'POST',
      rawBody: await photo.arrayBuffer(),
      headers: { 'Content-Type': photo.type },
    },
    false,
  );
