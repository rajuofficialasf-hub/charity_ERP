import type { FormDefinition, FormField, FormSection } from '@css/shared/forms';

/**
 * The change summary of a form version: what differs from the version before it, as a list the
 * version list turns into sentences in the reader's language. Sections and questions are matched
 * by their keys, which stay the same across versions; a question that went to another section or
 * another place counts as moved.
 */

type Text = { bn: string; en: string };

export type FieldAspect =
  'label' | 'type' | 'required' | 'condition' | 'calculation' | 'settings' | 'options';
export type SectionAspect = 'title' | 'visibility' | 'condition';

export type Change =
  | { kind: 'section_added' | 'section_removed' | 'section_moved'; section: string; title: Text }
  | { kind: 'section_changed'; section: string; title: Text; what: SectionAspect[] }
  | {
      kind: 'field_added' | 'field_removed' | 'field_moved';
      section: string;
      field: string;
      label: Text;
    }
  | { kind: 'field_changed'; section: string; field: string; label: Text; what: FieldAspect[] }
  | {
      kind: 'option_added' | 'option_removed';
      section: string;
      field: string;
      label: Text;
      option: string;
      optionLabel: Text;
    };

const same = (a: unknown, b: unknown) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

/** The keys in `next` whose order relative to the other common keys changed. */
function moved(before: string[], after: string[]): Set<string> {
  const common = new Set(before.filter((k) => after.includes(k)));
  const a = before.filter((k) => common.has(k));
  const b = after.filter((k) => common.has(k));
  // a key moved when it is not on the longest run kept in order
  const kept = longestKeptRun(a, b);
  return new Set(b.filter((k) => !kept.has(k)));
}

/** The longest subsequence of `b` in the order of `a` (both hold the same keys). */
function longestKeptRun(a: string[], b: string[]): Set<string> {
  const rank = new Map(a.map((k, i) => [k, i]));
  const seq = b.map((k) => rank.get(k)!);
  const lengths = seq.map(() => 1);
  const prev = seq.map(() => -1);
  for (let i = 0; i < seq.length; i += 1)
    for (let j = 0; j < i; j += 1)
      if (seq[j]! < seq[i]! && lengths[j]! + 1 > lengths[i]!) {
        lengths[i] = lengths[j]! + 1;
        prev[i] = j;
      }
  let end = lengths.indexOf(Math.max(0, ...lengths));
  const kept = new Set<string>();
  while (end >= 0) {
    kept.add(b[end]!);
    end = prev[end]!;
  }
  return kept;
}

function fieldAspects(a: FormField, b: FormField): FieldAspect[] {
  const what: FieldAspect[] = [];
  if (!same(a.label, b.label)) what.push('label');
  if (a.type !== b.type) what.push('type');
  if (a.required !== b.required) what.push('required');
  if (
    !same(a.logic?.show_if, b.logic?.show_if) ||
    !same(a.logic?.required_if, b.logic?.required_if)
  )
    what.push('condition');
  if (!same(a.calculation, b.calculation)) what.push('calculation');
  const { show_if: _a1, required_if: _a2, ...restA } = a.logic ?? {};
  const { show_if: _b1, required_if: _b2, ...restB } = b.logic ?? {};
  if (!same(a.settings, b.settings) || !same(restA, restB)) what.push('settings');
  return what;
}

function sectionAspects(a: FormSection, b: FormSection): SectionAspect[] {
  const what: SectionAspect[] = [];
  if (!same(a.title, b.title)) what.push('title');
  if (a.visibility !== b.visibility) what.push('visibility');
  if (!same(a.condition, b.condition)) what.push('condition');
  return what;
}

const fieldsWithSection = (def: FormDefinition) =>
  def.sections.flatMap((s) => s.fields.map((field) => ({ section: s.key, field })));

export function diffDefinitions(before: FormDefinition, after: FormDefinition): Change[] {
  const changes: Change[] = [];
  const beforeSections = new Map(before.sections.map((s) => [s.key, s]));
  const afterSections = new Map(after.sections.map((s) => [s.key, s]));
  const movedSections = moved(
    before.sections.map((s) => s.key),
    after.sections.map((s) => s.key),
  );
  for (const s of after.sections) {
    const old = beforeSections.get(s.key);
    if (!old) changes.push({ kind: 'section_added', section: s.key, title: s.title });
    else {
      if (movedSections.has(s.key))
        changes.push({ kind: 'section_moved', section: s.key, title: s.title });
      const what = sectionAspects(old, s);
      if (what.length)
        changes.push({ kind: 'section_changed', section: s.key, title: s.title, what });
    }
  }
  for (const s of before.sections)
    if (!afterSections.has(s.key))
      changes.push({ kind: 'section_removed', section: s.key, title: s.title });

  // the questions of the sections both versions hold; those of an added or removed section are in it
  const beforeFields = fieldsWithSection(before).filter((x) => afterSections.has(x.section));
  const afterFields = fieldsWithSection(after).filter((x) => beforeSections.has(x.section));
  const beforeByKey = new Map(beforeFields.map((x) => [x.field.fieldKey, x]));
  const afterByKey = new Map(afterFields.map((x) => [x.field.fieldKey, x]));
  const movedFields = moved(
    beforeFields.map((x) => x.field.fieldKey),
    afterFields.map((x) => x.field.fieldKey),
  );
  for (const { section, field } of afterFields) {
    const old = beforeByKey.get(field.fieldKey);
    const label = field.label;
    if (!old) {
      changes.push({ kind: 'field_added', section, field: field.fieldKey, label });
      continue;
    }
    if (old.section !== section || movedFields.has(field.fieldKey))
      changes.push({ kind: 'field_moved', section, field: field.fieldKey, label });
    const what = fieldAspects(old.field, field);
    if (what.length)
      changes.push({ kind: 'field_changed', section, field: field.fieldKey, label, what });
    const oldOptions = new Map((old.field.options ?? []).map((o) => [o.code, o]));
    const newOptions = new Map((field.options ?? []).map((o) => [o.code, o]));
    for (const o of field.options ?? [])
      if (!oldOptions.has(o.code))
        changes.push({
          kind: 'option_added',
          section,
          field: field.fieldKey,
          label,
          option: o.code,
          optionLabel: o.label,
        });
    for (const o of old.field.options ?? [])
      if (!newOptions.has(o.code))
        changes.push({
          kind: 'option_removed',
          section,
          field: field.fieldKey,
          label,
          option: o.code,
          optionLabel: o.label,
        });
  }
  for (const { section, field } of beforeFields)
    if (!afterByKey.has(field.fieldKey))
      changes.push({ kind: 'field_removed', section, field: field.fieldKey, label: field.label });
  return changes;
}
