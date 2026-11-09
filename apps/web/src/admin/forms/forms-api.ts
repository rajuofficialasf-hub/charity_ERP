import type {
  FieldType,
  FormCreate,
  FormDefinition,
  FormField,
  FormPlace,
  ReadyFormCreate,
} from '@css/shared/forms';
import { api } from '../../lib/api';
import type { LibrarySectionView } from './draft';

/** A form version as the API answers it: its state and its definition. */
export interface FormVersion extends FormDefinition {
  id: string;
  formId: string;
  versionNo: number;
  status: 'draft' | 'published' | 'retired';
  publishedAt: string | null;
}

/** The question library the builder picks from, each question ready to place in a form. */
export interface FormLibrary {
  /** The library form the Monitoring Team and the Department Head edit in the builder. */
  libraryFormId: string;
  sections: LibrarySectionView[];
  fields: {
    key: string;
    type: FieldType;
    label: { bn: string; en: string };
    standardColumn: string | null;
    formFields: FormField[];
  }[];
  templates: { key: string; name: { bn: string; en: string }; projectType: string }[];
}

/** What a form is for: the identity marks and the public link apply to an application form. */
export type FormKind = 'beneficiary_application' | 'other';

/** A form of a project (GET /projects/{id}/forms). */
export interface ProjectFormView {
  id: string;
  projectId: string;
  key: string;
  title: { bn: string; en: string };
  kind: FormKind;
  publishedVersionId: string | null;
  draftVersionId: string | null;
  /** The ready form this form was placed from, and the version of it the project holds. */
  sourceFormId: string | null;
  sourceVersionNo: number | null;
  /** The ready form's newer published version, which the PM may take. */
  newerVersionNo: number | null;
}

/** A ready form outside the projects (GET /ready-forms). */
export interface ReadyFormView {
  id: string;
  key: string;
  kind: FormKind;
  title: { bn: string; en: string };
  publishedVersionId: string | null;
  publishedVersionNo: number | null;
  draftVersionId: string | null;
}

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
  api<{ data: FormVersion; meta: { etag: string } }>(`/form-versions/${versionId}`, {
    envelope: true,
  });

/** Saves the whole draft; `scoring: null` clears the form-level points the draft no longer holds. */
export const saveDraft = (versionId: string, etag: string, definition: FormDefinition) =>
  api<{ data: FormVersion; meta: { etag: string } }>(`/form-versions/${versionId}`, {
    method: 'PATCH',
    body: { sections: definition.sections, scoring: definition.scoring ?? null },
    headers: { 'If-Match': etag },
    envelope: true,
  });

export const createForm = (projectId: string, body: FormCreate) =>
  api<ProjectFormView>(`/projects/${projectId}/forms`, { method: 'POST', body });

/** A version as the version list gives it: also who published it and who changed it last. */
export interface FormVersionListItem extends FormVersion {
  publishedBy: { id: string; name: string } | null;
  updatedBy: { id: string; name: string } | null;
  updatedAt: string;
}

/** Every version of a form, each with its definition as the caller may see it. */
export const formVersions = (formId: string) =>
  api<FormVersionListItem[]>(`/forms/${formId}/versions`);

/** Publishes a draft at the version it was read or saved at; the published one before retires. */
export const publishVersion = (versionId: string, etag: string) =>
  api<{ data: FormVersion; meta: { etag: string } }>(`/form-versions/${versionId}/publish`, {
    method: 'POST',
    headers: { 'If-Match': etag },
    envelope: true,
  });

/** Starts the next draft as a copy of the latest version. */
export const newVersion = (formId: string) =>
  api<FormVersion>(`/forms/${formId}/versions`, { method: 'POST' });

/** The nisab in force today, for the preview's zakat comparison. */
export const nisabInForce = () => api<{ value: string }>('/nisab-versions/in-force');

/** Switches the project's public link on with one form, or off; each switch-on makes a new URL. */
export const configurePublicLink = (
  projectId: string,
  body: { enabled: boolean; formId?: string },
) =>
  api<{ enabled: boolean; formId: string | null; url: string | null }>(
    `/projects/${projectId}/public-link`,
    { method: 'PATCH', body },
  );
