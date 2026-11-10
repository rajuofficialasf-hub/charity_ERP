import type { FormCreate, FormDefinition, FormPlace, ReadyFormCreate } from '@css/shared/forms';
import { api } from '../../api/client';
import type {
  FormKind,
  FormLibrary,
  FormVersion,
  FormVersionListItem,
  FormVersionRecord,
  NisabInForce,
  ProjectFormView,
  PublicLink,
  ReadyFormView,
} from '../../api/schemas';

export type {
  FormKind,
  FormLibrary,
  FormVersion,
  FormVersionListItem,
  ProjectFormView,
  ReadyFormView,
};

export const FORMS_KEY = ['admin', 'forms'] as const;
export const READY_KEY = [...FORMS_KEY, 'ready'] as const;
export const LIBRARY_KEY = [...FORMS_KEY, 'library'] as const;

/** The ready forms: every one for the builders, the published ones for a PM. */
export const readyForms = () => api<ReadyFormView[]>('/ready-forms');

export const createReadyForm = (body: ReadyFormCreate) =>
  api<ReadyFormView>('/ready-forms', { method: 'POST', body });

/** A ready form's published version, read before it is placed. */
export const readyPublished = (formId: string) =>
  api<FormVersion>(`/ready-forms/${formId}/published`);

/** Places a ready form's published version on a project as a published copy. */
export const placeForm = (projectId: string, body: FormPlace) =>
  api<ProjectFormView>(`/projects/${projectId}/forms/place`, { method: 'POST', body });

/** Takes the ready form's newer version as the placed form's next version. */
export const takeVersion = (formId: string) =>
  api<ProjectFormView>(`/forms/${formId}/take-version`, { method: 'POST' });

export const library = () => api<FormLibrary>('/form-library');

export const projectForms = (projectId: string) =>
  api<ProjectFormView[]>(`/projects/${projectId}/forms`);

/** A version with its version tag, for the If-Match of the next save. */
export const versionWithEtag = (versionId: string) =>
  api<FormVersionRecord>(`/form-versions/${versionId}`, {
    envelope: true,
  });

/** Saves the whole draft; `scoring: null` clears the form-level points the draft no longer holds. */
export const saveDraft = (versionId: string, etag: string, definition: FormDefinition) =>
  api<FormVersionRecord>(`/form-versions/${versionId}`, {
    method: 'PATCH',
    body: { sections: definition.sections, scoring: definition.scoring ?? null },
    headers: { 'If-Match': etag },
    envelope: true,
  });

export const createForm = (projectId: string, body: FormCreate) =>
  api<ProjectFormView>(`/projects/${projectId}/forms`, { method: 'POST', body });

/** Every version of a form, each with its definition as the caller may see it. */
export const formVersions = (formId: string) =>
  api<FormVersionListItem[]>(`/forms/${formId}/versions`);

/** Publishes a draft at the version it was read or saved at; the published one before retires. */
export const publishVersion = (versionId: string, etag: string) =>
  api<FormVersionRecord>(`/form-versions/${versionId}/publish`, {
    method: 'POST',
    headers: { 'If-Match': etag },
    envelope: true,
  });

/** Starts the next draft as a copy of the latest version. */
export const newVersion = (formId: string) =>
  api<FormVersion>(`/forms/${formId}/versions`, { method: 'POST' });

/** The nisab in force today, for the preview's zakat comparison. */
export const nisabInForce = () => api<NisabInForce>('/nisab-versions/in-force');

/** Switches the project's public link on with one form, or off; each switch-on makes a new URL. */
export const configurePublicLink = (
  projectId: string,
  body: { enabled: boolean; formId?: string },
) => api<PublicLink>(`/projects/${projectId}/public-link`, { method: 'PATCH', body });
