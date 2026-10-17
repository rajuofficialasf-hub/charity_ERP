import type { TemplateSave, TemplateUpdate, WorkflowKey } from '@css/shared/projects';
import { api } from '../../lib/api';
import { listQuery } from '../list-query';

/** A master project template as GET /templates returns it. */
export interface Template {
  id: string;
  name: { bn: string; en: string };
  description: string | null;
  workflowKey: WorkflowKey;
  active: boolean;
  version: number;
  sourceProjectId: string | null;
  updatedAt: string;
  updatedByName: string | null;
}

export const TEMPLATES_KEY = ['admin', 'templates'] as const;

/** GET /templates: the active templates, or every template with `inactive`. */
export const templates = (inactive = false) =>
  api<Template[]>(`/templates${listQuery({ include: inactive ? 'inactive' : undefined })}`);

export const updateTemplate = (templateId: string, body: TemplateUpdate) =>
  api<Template>(`/templates/${templateId}`, { method: 'PATCH', body });

/** POST /projects/{id}/save-as-template: a new template, or the contents of an existing one. */
export const saveAsTemplate = (projectId: string, body: TemplateSave) =>
  api<Template>(`/projects/${projectId}/save-as-template`, { method: 'POST', body });
