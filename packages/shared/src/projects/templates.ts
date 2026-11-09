import { z } from 'zod';
import { formDefinitionSchema } from '../forms/definition.js';
import { COMPONENT_KEYS } from '../components.js';
import { boundedLabel, snakeKey } from '../jsonb/common.js';
import { componentSettingsSchema } from '../jsonb/component-settings.js';
import { projectRulesSchema } from './rules.js';
import { WORKFLOW_KEYS } from './workflow-defaults.js';

/**
 * Master templates and copies of a project (BD-10, BR-064, BR-065). A new project started from a
 * template or from a previous project takes the parts below as an independent snapshot; nothing
 * links it back to its source afterwards.
 */

/**
 * BD-10's list of what a copy takes, and where each item lives in a template's definition. Stages,
 * the photo rule, rating criteria, issue types and expense categories are component settings, so
 * they travel with the components. The form (as version 1), the document checklist and the scoring
 * criteria have no storage yet and join the copy in their own tasks (DECISION_LOG D-096).
 */
export const BD10_COPIED = {
  components_and_settings: 'components',
  form_as_version_1: 'form',
  workflow_stages: 'components',
  photo_rule: 'components',
  rating_criteria: 'components',
  issue_types: 'components',
  expense_categories: 'components',
  dawah_syllabus: 'syllabus',
  document_checklist: 'later',
  scoring_criteria: 'later',
} as const;

/**
 * BD-10's list of what a copy never takes, plus the setup parts that belong to one project only
 * (fund sources, areas with their RPM, staff access).
 */
export const NOT_COPIED = [
  'applications',
  'beneficiaries',
  'budget_amounts',
  'fund_sources',
  'dates',
  'volunteer_assignments',
  'staff_access',
  'areas',
  'ratings',
  'categories',
  'logs',
  'quota_targets',
] as const;

/**
 * Settings that point at things of the source project only, removed before they are copied: the
 * forms of the application form (the form is copied with its own task) and the token of a public
 * link (a copy must never answer on its source's link). Every other settings key is copied; a test
 * lists them all, so a new key has to be sorted into one of the two groups.
 */
export const PROJECT_BOUND_SETTINGS: Partial<Record<string, readonly string[]>> = {
  application_form: ['form_ids'],
  public_link: ['token', 'form_ids'],
};

/** A component's settings as a copy takes them. */
export function copiedSettings(
  componentKey: string,
  settings: Record<string, unknown>,
): Record<string, unknown> {
  // eslint-disable-next-line security/detect-object-injection -- a lookup in a fixed table
  const drop = PROJECT_BOUND_SETTINGS[componentKey] ?? [];
  return Object.fromEntries(Object.entries(settings).filter(([key]) => !drop.includes(key)));
}

/** `project_templates.definition`: what a template or a copy hands to a new project. */
/** The published form of the source as a copy takes it: its key, its title and its definition. */
export const templateFormSchema = z.strictObject({
  key: snakeKey.max(40),
  title: boundedLabel,
  /** What the form is for; a template saved before forms had kinds holds an application form. */
  kind: z.enum(['beneficiary_application', 'other']).optional(),
  definition: formDefinitionSchema,
});
export type TemplateForm = z.infer<typeof templateFormSchema>;

export const templateDefinitionSchema = z.strictObject({
  workflowKey: z.enum(WORKFLOW_KEYS),
  // the published form becomes version 1 of the copy; a template saved before forms existed has none
  form: templateFormSchema.nullable().optional(),
  components: z
    .array(
      z
        .strictObject({
          componentKey: z.enum(COMPONENT_KEYS),
          enabled: z.boolean(),
          settings: z.record(z.string(), z.unknown()),
        })
        // valid settings of the component, or none: a choice the source left open (such as a photo
        // rule chosen per project) stays open in the copy
        .refine(
          (c) =>
            Object.keys(c.settings).length === 0 ||
            componentSettingsSchema(c.componentKey).safeParse(c.settings).success,
          { message: 'settings do not fit the component', path: ['settings'] },
        ),
    )
    .max(COMPONENT_KEYS.length)
    .refine(
      (components) => new Set(components.map((c) => c.componentKey)).size === components.length,
      'a component appears twice',
    ),
  syllabus: z.array(boundedLabel).max(100),
  rules: projectRulesSchema,
});
export type TemplateDefinition = z.infer<typeof templateDefinitionSchema>;

/** The parts of a project a definition is built from. */
export interface TemplateSource {
  workflowKey: (typeof WORKFLOW_KEYS)[number];
  components: { componentKey: string; enabled: boolean; settings: unknown }[];
  syllabus: { title: { bn: string; en: string } }[];
  rules: unknown;
  form?: TemplateForm | null;
}

const settingsObject = z.record(z.string(), z.unknown());

/** A component's settings as the copy takes them; settings that do not fit are copied as none. */
function copiedComponentSettings(componentKey: string, settings: unknown): Record<string, unknown> {
  const copied = copiedSettings(componentKey, settingsObject.safeParse(settings).data ?? {});
  return componentSettingsSchema(componentKey).safeParse(copied).success ? copied : {};
}

/**
 * The definition of a project as a template or a copy takes it: only the copied parts, with the
 * project-bound settings removed. Reads only what it copies, so nothing else can leak through.
 */
export function definitionOf(source: TemplateSource): TemplateDefinition {
  return templateDefinitionSchema.parse({
    workflowKey: source.workflowKey,
    components: source.components.map((c) => ({
      componentKey: c.componentKey,
      enabled: c.enabled,
      settings: copiedComponentSettings(c.componentKey, c.settings),
    })),
    syllabus: source.syllabus.map((t) => ({ bn: t.title.bn, en: t.title.en })),
    rules: projectRulesSchema.safeParse(source.rules).data ?? {},
    form: source.form ?? null,
  });
}

/** A template's name: written in both languages. */
const templateName = boundedLabel.refine(
  (n) => n.bn.trim() !== '' && n.en.trim() !== '',
  'a name in both languages',
);

/**
 * Saving a project's setup as a template: a new one with its name, or the replacement of an
 * existing template's contents (its name stays).
 */
export const templateSaveSchema = z.union([
  z.strictObject({
    name: templateName,
    description: z.string().trim().max(2000).optional(),
  }),
  z.strictObject({ templateId: z.uuid() }),
]);
export type TemplateSave = z.infer<typeof templateSaveSchema>;

/** Renaming, describing, deactivating or activating a template; at least one. */
export const templateUpdateSchema = z
  .strictObject({
    name: templateName.optional(),
    description: z.string().trim().max(2000).nullable().optional(),
    active: z.boolean().optional(),
  })
  .refine((b) => Object.keys(b).length > 0, 'nothing to change');
export type TemplateUpdate = z.infer<typeof templateUpdateSchema>;
