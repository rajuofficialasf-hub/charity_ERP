import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { mergeWorkflowTemplates, type WorkflowDefinition } from '@css/shared';
import yaml from 'js-yaml';

/** docs/architecture/workflow-templates from `src/workflow` and from `dist/workflow` alike. */
export const DEFAULT_TEMPLATES_DIR = join(
  import.meta.dirname,
  '../../../../docs/architecture/workflow-templates',
);

/** A template file as written; the merge reads the rest of its keys as the definition's parts. */
export type WorkflowTemplateFile = {
  template: string;
  version: number;
  extends?: string;
} & Record<string, unknown>;

/** The template files as written, in name order; `_common` among them. */
export function readWorkflowTemplates(dir = DEFAULT_TEMPLATES_DIR): WorkflowTemplateFile[] {
  return readdirSync(dir)
    .filter((f) => f.endsWith('.yaml'))
    .sort()
    .map((f) => yaml.load(readFileSync(join(dir, f), 'utf8')) as WorkflowTemplateFile);
}

/** Every template merged with what it extends and validated, `_common` included. */
export function mergedWorkflowDefinitions(dir = DEFAULT_TEMPLATES_DIR): WorkflowDefinition[] {
  const templates = readWorkflowTemplates(dir);
  return templates.map((t) => mergeWorkflowTemplates(t.template, templates));
}
