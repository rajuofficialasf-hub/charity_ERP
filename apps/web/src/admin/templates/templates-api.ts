import type { TemplateSave, TemplateUpdate } from '@css/shared/projects';
import { api } from '../../api/client';
import type { Template } from '../../api/schemas';
import { listQuery } from '../list-query';

export type { Template };

export const TEMPLATES_KEY = ['admin', 'templates'] as const;

/** GET /templates: the active templates, or every template with `inactive`. */
export const templates = (inactive = false) =>
  api<Template[]>(`/templates${listQuery({ include: inactive ? 'inactive' : undefined })}`);

export const updateTemplate = (templateId: string, body: TemplateUpdate) =>
  api<Template>(`/templates/${templateId}`, { method: 'PATCH', body });

/** POST /projects/{id}/save-as-template: a new template, or the contents of an existing one. */
export const saveAsTemplate = (projectId: string, body: TemplateSave) =>
  api<Template>(`/projects/${projectId}/save-as-template`, { method: 'POST', body });
