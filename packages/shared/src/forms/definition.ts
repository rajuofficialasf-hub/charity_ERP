import { z } from 'zod';
import { code64, snakeKey } from '../jsonb/common.js';
import {
  calculationSchema,
  conditionSchema,
  validationSchema,
  type Condition,
  type Expr,
} from '../jsonb/form-logic.js';
import { CORE_FIELDS } from './core.js';
import {
  FIELD_TYPES,
  isChoiceType,
  SECTION_VISIBILITIES,
  type FieldType,
  type SectionVisibility,
} from './library.js';
import { PATTERN_KEYS, TEXT_MAX_LENGTH } from './patterns.js';

/**
 * A form version definition in the shape the API answers and the draft update sends: sections,
 * each with fields, each with options. The engine, the builder and the phone all run on this one
 * shape. Parsing refuses what the schema cannot express; `checkDefinition` refuses what it can
 * (a missing core field, a dangling reference, a cycle), each with a stable code.
 */

/** A user-facing text of a form: both languages, neither empty. */
const label = (max: number) =>
  z.strictObject({
    bn: z.string({ error: 'form.label_language' }).trim().min(1, 'form.label_language').max(max),
    en: z.string({ error: 'form.label_language' }).trim().min(1, 'form.label_language').max(max),
  });

export const fieldOptionSchema = z.strictObject({
  code: code64,
  label: label(200),
  /** Shown only while the field named by `logic.options_depend_on` holds this option. */
  dependsOnOptionCode: code64.nullable().optional(),
  allowsOtherText: z.boolean().optional(),
});
export type FieldOption = z.infer<typeof fieldOptionSchema>;

/** The validation of a field: a named pattern only, and a cap no larger than the global one. */
export const fieldValidationSchema = validationSchema.extend({
  max_length: z.int().min(1).max(TEXT_MAX_LENGTH).optional(),
  pattern: z.enum(PATTERN_KEYS, { error: 'form.pattern_unknown' }).optional(),
});
export type FieldValidation = z.infer<typeof fieldValidationSchema>;

export const repeatSettingsSchema = z.strictObject({
  min_rows: z.int().min(0).optional(),
  max_rows: z.int().min(1).optional(),
  /** Set on a field inside a repeat group: the key of its group, in the same section. */
  group: snakeKey.optional(),
});

export const fieldSettingsSchema = z.strictObject({
  placeholder: label(200).optional(),
  help: label(500).optional(),
  default: z.unknown().optional(),
  validation: fieldValidationSchema.optional(),
  repeat: repeatSettingsSchema.optional(),
});
export type FieldSettings = z.infer<typeof fieldSettingsSchema>;

export const fieldLogicSchema = z.strictObject({
  show_if: conditionSchema.optional(),
  required_if: conditionSchema.optional(),
  options_depend_on: snakeKey.optional(),
  validation: fieldValidationSchema.optional(),
});
export type FieldLogic = z.infer<typeof fieldLogicSchema>;

export type Calculation = z.infer<typeof calculationSchema>;

export const formFieldSchema = z.strictObject({
  fieldKey: snakeKey.max(64),
  libraryFieldKey: z.string().nullable().optional(),
  type: z.enum(FIELD_TYPES),
  label: label(500),
  required: z.boolean(),
  standardColumn: z.string().nullable().optional(),
  settings: fieldSettingsSchema.optional(),
  logic: fieldLogicSchema.optional(),
  calculation: calculationSchema.optional(),
  options: z.array(fieldOptionSchema).optional(),
});
export type FormField = z.infer<typeof formFieldSchema>;

export const formSectionSchema = z.strictObject({
  key: snakeKey.max(64),
  librarySectionKey: z.string().nullable().optional(),
  title: label(200),
  visibility: z.enum(SECTION_VISIBILITIES),
  condition: conditionSchema.nullable().optional(),
  fields: z.array(formFieldSchema),
});
export type FormSection = z.infer<typeof formSectionSchema>;

export interface FormDefinition {
  sections: FormSection[];
}

/** The same shapes under the names the API service reads them by. */
export type FormFieldDefinition = FormField;
export type FormSectionDefinition = FormSection;

export const DEFINITION_ISSUE_CODES = [
  'form.duplicate_key',
  'form.label_language',
  'form.pattern_unknown',
  'form.unknown_reference',
  'form.repeat_reference',
  'form.repeat_group_invalid',
  'form.calculation_cycle',
  'form.condition_cycle',
  'form.calculation_misplaced',
  'form.options_misplaced',
  'form.option_dependency',
  'form.core_field_missing',
  'form.core_field_optional',
  'form.core_field_hidden',
  'form.core_field_shape',
] as const;
export type DefinitionIssueCode = (typeof DEFINITION_ISSUE_CODES)[number];

export interface DefinitionIssue {
  code: DefinitionIssueCode;
  /** Where in the definition, as a zod path (`sections`, index, `fields`, index, ...). */
  path: (string | number)[];
  params?: Record<string, string>;
}

/** The field keys a condition reads. */
export function conditionFields(condition: Condition): string[] {
  if ('all' in condition) return condition.all.flatMap(conditionFields);
  if ('any' in condition) return condition.any.flatMap(conditionFields);
  if ('not' in condition) return conditionFields(condition.not);
  return [condition.field];
}

/** The field keys an expression reads, and the repeat groups it sums over. */
export function exprReferences(expr: Expr): {
  fields: string[];
  sums: { group: string; field: string }[];
} {
  if (typeof expr === 'number') return { fields: [], sums: [] };
  if ('field' in expr) return { fields: [expr.field], sums: [] };
  if ('sum_repeat' in expr) return { fields: [], sums: [expr.sum_repeat] };
  if ('setting' in expr) return { fields: [], sums: [] };
  const parts = expr.args.map(exprReferences);
  return { fields: parts.flatMap((p) => p.fields), sums: parts.flatMap((p) => p.sums) };
}

/** A field with its place in the definition. */
export interface LocatedField {
  field: FormField;
  section: FormSection;
  sectionIndex: number;
  fieldIndex: number;
  /** The repeat group this field belongs to, or null for a plain field. */
  group: string | null;
}

/** Every field of a definition by key; a duplicate key keeps its first field. */
export function indexFields(definition: FormDefinition): Map<string, LocatedField> {
  const fields = new Map<string, LocatedField>();
  definition.sections.forEach((section, sectionIndex) => {
    section.fields.forEach((field, fieldIndex) => {
      if (fields.has(field.fieldKey)) return;
      fields.set(field.fieldKey, {
        field,
        section,
        sectionIndex,
        fieldIndex,
        group: field.settings?.repeat?.group ?? null,
      });
    });
  });
  return fields;
}

/** The validation of a field: the settings win over the logic where both name a rule. */
export function validationOf(field: FormField): FieldValidation {
  return { ...field.logic?.validation, ...field.settings?.validation };
}

const fieldPath = (f: LocatedField, ...rest: (string | number)[]) => [
  'sections',
  f.sectionIndex,
  'fields',
  f.fieldIndex,
  ...rest,
];

/**
 * The checks the schema cannot express. Each issue carries a stable code; the API turns them into
 * validation details and the builder shows them beside the field.
 */
export function checkDefinition(definition: FormDefinition): DefinitionIssue[] {
  const issues: DefinitionIssue[] = [];
  const fields = indexFields(definition);

  // keys are unique across the version: section keys among sections, field keys among every field
  const sectionKeys = new Set<string>();
  const fieldKeys = new Set<string>();
  definition.sections.forEach((section, si) => {
    if (sectionKeys.has(section.key))
      issues.push({
        code: 'form.duplicate_key',
        path: ['sections', si, 'key'],
        params: { key: section.key },
      });
    sectionKeys.add(section.key);
    section.fields.forEach((field, fi) => {
      if (fieldKeys.has(field.fieldKey))
        issues.push({
          code: 'form.duplicate_key',
          path: ['sections', si, 'fields', fi, 'fieldKey'],
          params: { key: field.fieldKey },
        });
      fieldKeys.add(field.fieldKey);
      const codes = new Set<string>();
      (field.options ?? []).forEach((option, oi) => {
        if (codes.has(option.code))
          issues.push({
            code: 'form.duplicate_key',
            path: ['sections', si, 'fields', fi, 'options', oi, 'code'],
            params: { key: option.code },
          });
        codes.add(option.code);
      });
    });
  });

  // a reference from `from` to the field `key`: it must exist, and a field inside a repeat group
  // is only reachable from inside the same group
  const checkReference = (
    from: { group: string | null },
    key: string,
    path: (string | number)[],
  ): LocatedField | null => {
    const target = fields.get(key);
    if (!target) {
      issues.push({ code: 'form.unknown_reference', path, params: { reference: key } });
      return null;
    }
    if (target.group !== null && target.group !== from.group) {
      issues.push({ code: 'form.repeat_reference', path, params: { reference: key } });
      return null;
    }
    return target;
  };

  // the edges along which one field's value or visibility needs another's: a show-if, the
  // section's condition, and a calculation's inputs
  const edges = new Map<string, Set<string>>();
  const edge = (from: string, to: string) => {
    let set = edges.get(from);
    if (!set) edges.set(from, (set = new Set()));
    set.add(to);
  };

  definition.sections.forEach((section, si) => {
    if (section.condition) {
      const path = ['sections', si, 'condition'];
      for (const key of conditionFields(section.condition)) {
        if (checkReference({ group: null }, key, path))
          for (const field of section.fields) edge(field.fieldKey, key);
      }
    }
  });

  for (const located of fields.values()) {
    const { field } = located;
    if (located.group !== null) {
      const group = fields.get(located.group);
      const valid =
        group !== undefined &&
        group.field.type === 'repeat_group' &&
        group.sectionIndex === located.sectionIndex &&
        field.type !== 'repeat_group';
      if (!valid)
        issues.push({
          code: 'form.repeat_group_invalid',
          path: fieldPath(located, 'settings', 'repeat', 'group'),
          params: { fieldKey: field.fieldKey },
        });
    }
    if ((field.type === 'calculation') !== (field.calculation !== undefined))
      issues.push({
        code: 'form.calculation_misplaced',
        path: fieldPath(located, 'calculation'),
        params: { fieldKey: field.fieldKey },
      });
    if (field.options !== undefined && field.options.length > 0 && !isChoiceType(field.type))
      issues.push({
        code: 'form.options_misplaced',
        path: fieldPath(located, 'options'),
        params: { fieldKey: field.fieldKey },
      });

    if (field.logic?.show_if)
      for (const key of conditionFields(field.logic.show_if))
        if (checkReference(located, key, fieldPath(located, 'logic', 'show_if')))
          edge(field.fieldKey, key);
    if (field.logic?.required_if)
      for (const key of conditionFields(field.logic.required_if))
        checkReference(located, key, fieldPath(located, 'logic', 'required_if'));

    const dependsOn = field.logic?.options_depend_on;
    if (dependsOn !== undefined) {
      const parent = checkReference(
        located,
        dependsOn,
        fieldPath(located, 'logic', 'options_depend_on'),
      );
      if (parent) {
        const parentIsSelect =
          parent.field.type === 'single_select' || parent.field.type === 'radio';
        const parentCodes = new Set((parent.field.options ?? []).map((o) => o.code));
        if (!parentIsSelect || parent.sectionIndex > located.sectionIndex)
          issues.push({
            code: 'form.option_dependency',
            path: fieldPath(located, 'logic', 'options_depend_on'),
            params: { fieldKey: field.fieldKey, reference: dependsOn },
          });
        else
          (field.options ?? []).forEach((option, oi) => {
            if (
              typeof option.dependsOnOptionCode === 'string' &&
              !parentCodes.has(option.dependsOnOptionCode)
            )
              issues.push({
                code: 'form.option_dependency',
                path: fieldPath(located, 'options', oi, 'dependsOnOptionCode'),
                params: { fieldKey: field.fieldKey, reference: option.dependsOnOptionCode },
              });
          });
      }
    } else
      (field.options ?? []).forEach((option, oi) => {
        if (typeof option.dependsOnOptionCode === 'string')
          issues.push({
            code: 'form.option_dependency',
            path: fieldPath(located, 'options', oi, 'dependsOnOptionCode'),
            params: { fieldKey: field.fieldKey, reference: option.dependsOnOptionCode },
          });
      });

    if (field.calculation) {
      const path = fieldPath(located, 'calculation', 'expr');
      const refs = exprReferences(field.calculation.expr);
      for (const key of refs.fields)
        if (checkReference(located, key, path)) edge(field.fieldKey, key);
      for (const sum of refs.sums) {
        const group = fields.get(sum.group);
        if (!group || group.field.type !== 'repeat_group') {
          issues.push({ code: 'form.unknown_reference', path, params: { reference: sum.group } });
          continue;
        }
        const member = fields.get(sum.field);
        if (!member) {
          issues.push({ code: 'form.unknown_reference', path, params: { reference: sum.field } });
          continue;
        }
        if (member.group !== sum.group) {
          issues.push({ code: 'form.repeat_reference', path, params: { reference: sum.field } });
          continue;
        }
        edge(field.fieldKey, sum.field);
        edge(field.fieldKey, sum.group);
      }
    }
  }

  // a cycle: a value or a visibility that needs itself through any chain
  const state = new Map<string, 'open' | 'done'>();
  const reported = new Set<string>();
  const walk = (key: string, trail: string[]) => {
    const seen = state.get(key);
    if (seen === 'done') return;
    if (seen === 'open') {
      const cycle = trail.slice(trail.indexOf(key));
      const anchor = cycle.find((k) => !reported.has(k));
      if (anchor === undefined) return;
      for (const k of cycle) reported.add(k);
      const through = cycle.some((k) => fields.get(k)?.field.type === 'calculation');
      const located = fields.get(anchor)!;
      issues.push({
        code: through ? 'form.calculation_cycle' : 'form.condition_cycle',
        path: fieldPath(located, through && located.field.calculation ? 'calculation' : 'logic'),
        params: { fieldKey: anchor, cycle: cycle.join(' > ') },
      });
      return;
    }
    state.set(key, 'open');
    for (const next of edges.get(key) ?? []) walk(next, [...trail, key]);
    state.set(key, 'done');
  };
  for (const key of fields.keys()) walk(key, []);

  // the mandatory core: present, required, visible to volunteers, mapped to its column
  for (const core of CORE_FIELDS) {
    const located = fields.get(core.key);
    if (!located) {
      issues.push({
        code: 'form.core_field_missing',
        path: ['sections'],
        params: { fieldKey: core.key },
      });
      continue;
    }
    const { field, section } = located;
    if (field.type !== core.type || field.standardColumn !== core.standardColumn)
      issues.push({
        code: 'form.core_field_shape',
        path: fieldPath(located, 'type'),
        params: { fieldKey: core.key },
      });
    if (!field.required)
      issues.push({
        code: 'form.core_field_optional',
        path: fieldPath(located, 'required'),
        params: { fieldKey: core.key },
      });
    const hidden =
      section.visibility === 'official_only' ||
      (section.condition !== null && section.condition !== undefined) ||
      field.logic?.show_if !== undefined ||
      located.group !== null;
    if (hidden)
      issues.push({
        code: 'form.core_field_hidden',
        path: fieldPath(located),
        params: { fieldKey: core.key },
      });
  }

  return issues;
}

/** The full definition schema: the shape, then every check of `checkDefinition`. */
export const formDefinitionSchema: z.ZodType<FormDefinition> = z
  .strictObject({ sections: z.array(formSectionSchema).min(1) })
  .superRefine((definition, ctx) => {
    for (const issue of checkDefinition(definition))
      ctx.addIssue({
        code: 'custom',
        message: issue.code,
        path: issue.path,
        params: { code: issue.code, ...issue.params },
      });
  });

export type { Condition, Expr, FieldType, SectionVisibility };
