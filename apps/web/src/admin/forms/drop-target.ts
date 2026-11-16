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

/** The side of a question a dragged one lands on. */
export type Half = 'before' | 'after';

/** The edges of a place on the screen. */
export interface Box {
  top: number;
  bottom: number;
  left: number;
  right: number;
}

/**
 * Where a dragged question lands: the section and the block index inside it, counted without the
 * dragged question itself, and the question the landing line is drawn at with its side (none at a
 * section's end).
 */
export interface Landing {
  sectionKey: string;
  index: number;
  at?: { fieldKey: string; half: Half };
}

const inside = (point: { x: number; y: number }, box: Box) =>
  point.x >= box.left && point.x <= box.right && point.y >= box.top && point.y <= box.bottom;

/**
 * What the pointer is over, from the places of the sections' cards and of the questions: a
 * question with the half the pointer is in (the upper half lands before it, the lower half after
 * it), or a section's card for its empty end. Between two questions and above the first one the
 * next question down counts, so the line does not jump away in the gaps. Nothing outside every
 * section.
 */
export function pointed(
  point: { x: number; y: number },
  boxes: ReadonlyMap<string, Box>,
): { id: string; half?: Half } | null {
  const all = [...boxes];
  const section = all.find(([id, box]) => id.startsWith(SECTION_DROP) && inside(point, box));
  if (!section) return null;
  const [sectionId, card] = section;
  const next = all
    .filter(
      ([id, box]) =>
        !id.startsWith(SECTION_DROP) && box.top >= card.top && box.bottom <= card.bottom,
    )
    .sort(([, a], [, b]) => a.top - b.top)
    .find(([, box]) => point.y <= box.bottom);
  if (!next) return { id: sectionId };
  const [id, box] = next;
  return { id, half: point.y < (box.top + box.bottom) / 2 ? 'before' : 'after' };
}

/**
 * The side a question moved by the keyboard lands on, where no pointer says: after a question
 * further down its own section, as a step down, and before any other.
 */
export function halfByOrder(definition: FormDefinition, draggedId: string, overId: string): Half {
  const section = definition.sections.find((s) => s.fields.some((f) => f.fieldKey === overId));
  const keys = section?.fields.map((f) => f.fieldKey) ?? [];
  const from = keys.indexOf(draggedId);
  return from >= 0 && keys.indexOf(overId) > from ? 'after' : 'before';
}

/**
 * Where a drop lands. A drop on a section's card means its end; a drop on a question means
 * before or after that question, by the half. Nothing for an id the form does not know, and
 * nothing for a question dropped on itself, which stays.
 */
export function dropTarget(
  definition: FormDefinition,
  overId: string,
  half: Half = 'before',
  draggedId?: string,
): Landing | null {
  if (overId === draggedId) return null;
  const headsOf = (fields: readonly FormField[]) =>
    fields
      .filter((f) => groupOf(f) === undefined && f.fieldKey !== draggedId)
      .map((f) => f.fieldKey);
  if (overId.startsWith(SECTION_DROP)) {
    const section = definition.sections.find((s) => s.key === overId.slice(SECTION_DROP.length));
    return section ? { sectionKey: section.key, index: headsOf(section.fields).length } : null;
  }
  const section = definition.sections.find((s) => s.fields.some((f) => f.fieldKey === overId));
  const index = section ? headsOf(section.fields).indexOf(overId) : -1;
  if (!section || index < 0) return null;
  return {
    sectionKey: section.key,
    index: half === 'after' ? index + 1 : index,
    at: { fieldKey: overId, half },
  };
}
