import type { FormCreate, FormDefinition, FormField } from '@css/shared/forms';
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

/** The libraries the builder picks from, each field ready to place in a form. */
export interface FormLibrary {
  sections: LibrarySectionView[];
  fields: {
    key: string;
    type: string;
    label: { bn: string; en: string };
    standardColumn: string | null;
    formFields: FormField[];
  }[];
  templates: { key: string; name: { bn: string; en: string }; projectType: string }[];
}

/** A form of a project (GET /projects/{id}/forms). */
export interface ProjectFormView {
  id: string;
  projectId: string;
  key: string;
  title: { bn: string; en: string };
  publishedVersionId: string | null;
  draftVersionId: string | null;
}

export const FORMS_KEY = ['admin', 'forms'] as const;

export const library = () => api<FormLibrary>('/form-library');

export const projectForms = (projectId: string) =>
  api<ProjectFormView[]>(`/projects/${projectId}/forms`);

/** A version with its version tag, for the If-Match of the next save. */
export const versionWithEtag = (versionId: string) =>
  api<{ data: FormVersion; meta: { etag: string } }>(`/form-versions/${versionId}`, {
    envelope: true,
  });

export const saveDraft = (versionId: string, etag: string, sections: FormDefinition['sections']) =>
  api<{ data: FormVersion; meta: { etag: string } }>(`/form-versions/${versionId}`, {
    method: 'PATCH',
    body: { sections },
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
