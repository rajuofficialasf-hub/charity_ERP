import type { z } from 'zod';
import { answerValueSchema } from './answer-value.js';
import { mediaScriptSchema, referenceListAttributesSchema } from './media.js';
import {
  calculationSchema,
  conditionSchema,
  fieldLogicSchema,
  fieldSettingsSchema,
} from './form-logic.js';
import {
  distributionItemsSchema,
  followupAnswersSchema,
  handoverScopeSchema,
  ratingScoresSchema,
  scoreCriteriaSchema,
  userPreferencesSchema,
} from './small.js';
import { workflowDefinitionSchema } from './workflow-definition.js';

export * from './answer-value.js';
export * from './component-settings.js';
export * from './form-logic.js';
export * from './media.js';
export * from './small.js';
export * from './workflow-definition.js';

/**
 * Zod schema per JSONB column (DATABASE_SCHEMA section 20). Services validate every JSONB write
 * with these. project_components.settings depends on component_key: use
 * componentSettingsSchema(componentKey). The JSON Schemas in docs/database/json-schemas/ stay the
 * contract; a conformance test keeps both in step.
 */
export const jsonbSchemas = {
  'application_answers.value': answerValueSchema,
  'application_scores.criteria': scoreCriteriaSchema,
  'distributions.items': distributionItemsSchema,
  'followup_evaluations.answers': followupAnswersSchema,
  'handovers.scope': handoverScopeSchema,
  'volunteer_ratings.proposed_scores': ratingScoresSchema,
  'volunteer_ratings.final_scores': ratingScoresSchema,
  'users.preferences': userPreferencesSchema,
  'form_fields.logic': fieldLogicSchema,
  'form_fields.calculation': calculationSchema,
  'form_fields.settings': fieldSettingsSchema,
  'form_sections.condition': conditionSchema,
  'workflow_definitions.definition': workflowDefinitionSchema,
  'projects.workflow_snapshot': workflowDefinitionSchema,
  'media_works.script': mediaScriptSchema,
  'reference_lists.attributes': referenceListAttributesSchema,
} as const satisfies Record<string, z.ZodType>;

export type JsonbColumn = keyof typeof jsonbSchemas;
