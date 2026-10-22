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
