import {
  FIELD_TYPES,
  type FieldType,
  type FormDefinition,
  type FormField,
} from '@css/shared/forms';

/** The drag id of a question type from the left pane, followed by the type. */
export const TYPE_DRAG = 'type:';
/** The droppable id of a section's card, followed by the section key. */
export const SECTION_DROP = 'section:';

const groupOf = (field: FormField) => field.settings?.repeat?.group;

/** The type a drag id names, or nothing for a question's drag. */
export const typeFromDragId = (id: string): FieldType | undefined =>
  id.startsWith(TYPE_DRAG) ? FIELD_TYPES.find((t) => t === id.slice(TYPE_DRAG.length)) : undefined;

/**
 * Where a drop lands: the section and the block index inside it. A drop on a section's card
 * means its end; a drop on a question means that question's place (the block before it moves
 * on). Nothing for an id the form does not know.
 */
export function dropTarget(
  definition: FormDefinition,
  overId: string,
): { sectionKey: string; index: number } | null {
  if (overId.startsWith(SECTION_DROP)) {
    const section = definition.sections.find((s) => s.key === overId.slice(SECTION_DROP.length));
    return section ? { sectionKey: section.key, index: section.fields.length } : null;
  }
  const section = definition.sections.find((s) => s.fields.some((f) => f.fieldKey === overId));
  if (!section) return null;
  const heads = section.fields.filter((f) => groupOf(f) === undefined).map((f) => f.fieldKey);
  return { sectionKey: section.key, index: Math.max(heads.indexOf(overId), 0) };
}
