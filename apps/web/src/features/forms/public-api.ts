import type { Answer, FormDefinition } from '@css/shared/forms';
import { api } from '../../lib/api';

/** The form behind a public link, as the API answers it to anyone: the volunteer-visible part. */
export interface PublicForm {
  project: { name: { bn: string; en: string }; applyTo: string | null };
  form: FormDefinition & { id: string; versionNo: number };
}

const base = (token: string) => `/public/forms/${encodeURIComponent(token)}`;

/** No login: the token in the path is the whole access, so no refresh is tried on a refusal. */
export const publicForm = (token: string) => api<PublicForm>(base(token), {}, false);

export const submitPublic = (
  token: string,
  body: { clientUuid: string; clientCreatedAt: string; answers: Answer[] },
) =>
  api<{ id: string; status: string }>(
    `${base(token)}/applications`,
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
  api<{ fileId: string }>(
    `${base(token)}/photos?clientUuid=${encodeURIComponent(clientUuid)}&fieldKey=${encodeURIComponent(fieldKey)}`,
    {
      method: 'POST',
      rawBody: await photo.arrayBuffer(),
      headers: { 'Content-Type': photo.type },
    },
    false,
  );
