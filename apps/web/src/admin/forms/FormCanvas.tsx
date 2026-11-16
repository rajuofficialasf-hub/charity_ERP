import {
  type Announcements,
  closestCenter,
  type CollisionDetection,
  DndContext,
  type DragEndEvent,
  type DragMoveEvent,
  DragOverlay,
  type DragStartEvent,
  KeyboardSensor,
  type Modifier,
  PointerSensor,
  useDroppable,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import {
  SortableContext,
  sortableKeyboardCoordinates,
  type SortingStrategy,
  useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import {
  type FieldType,
  type FormDefinition,
  type FormField,
  type FormSection,
  identityRoleOf,
} from '@css/shared/forms';
import { localized } from '@css/shared/i18n';
import {
  Alert,
  Button,
  Chip,
  Icon,
  IconButton,
  Menu,
  type MenuItemSpec,
  SelectField,
  Stack,
  Text,
  type ExtendedIconName,
} from '@/ui';
import {
  createContext,
  memo,
  type ReactNode,
  useContext,
  useEffect,
  useEffectEvent,
  useId,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useLocale, useTranslations } from 'use-intl';
import { FieldInput } from '../../features/forms/FieldInput';
import { moveField, moveFieldTo, moveSection } from './draft';
import {
  dropTarget,
  type Half,
  halfByOrder,
  type Landing,
  pointed,
  SECTION_DROP,
  typeFromDragId,
} from './drop-target';
import type { PlaceProblems } from './publish-entries';
import type { BuilderMode, Selection } from './selection';
import { sitsInRows, TYPE_GROUPS, TYPE_META, typesOfGroup } from './type-meta';

const groupOf = (field: FormField) => field.settings?.repeat?.group;

/** A place of the canvas to bring into view; `quiet` leaves the focus where the page puts it. */
export type Reveal = Selection & { quiet?: boolean };

/**
 * The question types as the choices of a menu, in the order of the left pane's groups, each
 * with its icon and name; `rows` leaves out the types a list's rows do not take.
 */
function useTypeItems() {
  const tt = useTranslations('forms.types');
  return (add: (type: FieldType) => void, rows = false): MenuItemSpec[] =>
    TYPE_GROUPS.flatMap(typesOfGroup)
      .filter((type) => !rows || sitsInRows(type))
      .map((type) => ({
        id: type,
        label: tt(type),
        // eslint-disable-next-line security/detect-object-injection -- a type of the fixed list
        icon: TYPE_META[type].icon,
        onSelect: () => add(type),
      }));
}

/** The name a question goes by on the canvas: its text, or that it has none yet. */
function useQuestionName() {
  const t = useTranslations('forms.builder');
  const locale = useLocale();
  return (field: FormField) => {
    const label = localized(field.label, locale);
    return { name: label || t('publish_list.unnamed_question'), unnamed: label === '' };
  };
}

/** The messages of the server about questions and parts, by the key each names. */
type Messages = Record<string, string[]>;
const NO_PROBLEMS: PlaceProblems = { fields: new Map(), sections: new Map() };

/**
 * Where the dragged question would land now, for the canvas to draw its line; nothing while no
 * question is over a place it can go to.
 */
const LandingContext = createContext<Landing | null>(null);

const sameLanding = (a: Landing | null, b: Landing | null) =>
  a === b ||
  (a !== null &&
    b !== null &&
    a.sectionKey === b.sectionKey &&
    a.index === b.index &&
    a.at?.fieldKey === b.at?.fieldKey &&
    a.at?.half === b.at?.half);

/** Whether two lists hold the same things in the same order. */
const sameList = <T,>(a: readonly T[] | undefined, b: readonly T[] | undefined) =>
  a === b ||
  (a !== undefined &&
    b !== undefined &&
    a.length === b.length &&
    a.every((item, i) => item === b.at(i)));

/** What the server said about one question or one part. */
const saidOf = (messages: Messages, key: string) =>
  Object.getOwnPropertyDescriptor(messages, key)?.value as string[] | undefined;

/** A part as a question of another part sees it: a place it may be sent to. */
interface PartRef {
  key: string;
  title: string;
  /** Whether it takes an identity question: a part everyone sees, always. */
  open: boolean;
}

const sameParts = (a: readonly PartRef[], b: readonly PartRef[]) =>
  a.length === b.length &&
  a.every((part, i) => {
    const other = b.at(i);
    return part.key === other?.key && part.title === other.title && part.open === other.open;
  });

/**
 * What the canvas does, by the keys of what it is done to. These functions are the same ones for
 * as long as the canvas lives, so a part or a question that has not changed is not drawn again
 * because the page was.
 */
interface CanvasActions {
  select: (selection: Selection) => void;
  moveSection: (sectionKey: string, direction: -1 | 1) => void;
  removeSection: (sectionKey: string) => void;
  moveField: (sectionKey: string, fieldKey: string, direction: -1 | 1) => void;
  removeField: (fieldKey: string) => void;
  copyField: (fieldKey: string) => void;
  moveFieldTo: (fieldKey: string, sectionKey: string) => void;
  addTo: (sectionKey: string, type: FieldType) => void;
  addRow: (groupKey: string, type: FieldType) => void;
}

/**
 * What a dragged question is over. Under a pointer the place it points at decides, with the half
 * of the question it is in; the keyboard has no pointer and goes by the closest centre.
 */
const underPointer: CollisionDetection = (args) => {
  if (!args.pointerCoordinates) return closestCenter(args);
  const boxes = new Map([...args.droppableRects].map(([id, rect]) => [String(id), rect]));
  const hit = pointed(args.pointerCoordinates, boxes);
  const droppableContainer = hit && args.droppableContainers.find((c) => c.id === hit.id);
  return hit && droppableContainer
    ? [{ id: hit.id, data: { droppableContainer, value: 0, half: hit.half } }]
    : [];
};

/** The questions stay where they are while one is dragged: the line shows where it will land. */
const stay: SortingStrategy = () => null;

/** How far the dragged thing's name stands from the pointer, so it covers neither it nor the line. */
const GHOST_OFFSET = 12;
/**
 * Keeps the name of what is dragged beside the pointer, wherever its handle was taken. A question
 * moved by the keyboard has no pointer, and its name stands on the place it is over.
 */
const besidePointer: Modifier = ({ activatorEvent, draggingNodeRect, transform }) => {
  if (!draggingNodeRect || !(activatorEvent instanceof MouseEvent)) return transform;
  return {
    ...transform,
    x: transform.x + activatorEvent.clientX - draggingNodeRect.left + GHOST_OFFSET,
    y: transform.y + activatorEvent.clientY - draggingNodeRect.top + GHOST_OFFSET,
  };
};

/**
 * The drag context around the panes: a question moves by its handle inside or across sections,
 * and a type from the left pane drops at a place, where the page adds an empty question of it.
 * The dragged question stays in its place, dimmed, while its name follows the pointer; a line on
 * the canvas marks where it will land (before the question whose upper half the pointer is in,
 * after the one whose lower half, at a section's end under its last question), and the same place
 * is said aloud in the person's language, with the questions' and the section's names. The
 * keyboard moves a question with the buttons of its bar instead.
 */
export function CanvasDnd({
  definition,
  onChange,
  onDropType,
  onDragging,
  children,
}: {
  definition: FormDefinition;
  onChange: (definition: FormDefinition) => void;
  /** A type dropped on a section at a block index. */
  onDropType: (type: FieldType, sectionKey: string, index: number) => void;
  /** Whether a question or a type is being dragged, by the pointer or by the keyboard. */
  onDragging?: (dragging: boolean) => void;
  children: ReactNode;
}) {
  const t = useTranslations('forms.builder');
  const tt = useTranslations('forms.types');
  const locale = useLocale();
  const questionName = useQuestionName();
  // the name of what is being dragged: a question's, or the type a new question will have
  const [ghost, setGhost] = useState<string | null>(null);
  const [landing, setLanding] = useState<Landing | null>(null);
  // the landing of this moment, for the words said aloud, which are asked for outside a draw
  const landingNow = useRef<Landing | null>(null);
  // whether the dragged question has been over a place it can go to since it was picked up
  const wandered = useRef(false);
  // whether a question is on its way: the drag's last move may be told after its end, and must
  // then neither draw a line nor take the place of what the end said
  const underWay = useRef(false);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  /**
   * Where the dragged question would land if it were dropped now. A place that would leave the
   * form as it is (its own, or a section an identity question may not go to) is no landing.
   */
  const landingOf = (event: DragMoveEvent | DragEndEvent): Landing | null => {
    if (!event.over) return null;
    const id = String(event.active.id);
    const overId = String(event.over.id);
    const pointedHalf = event.collisions?.[0]?.data?.half as Half | undefined;
    const dragged = typeFromDragId(id) ? undefined : id;
    const target = dropTarget(
      definition,
      overId,
      pointedHalf ?? halfByOrder(definition, id, overId),
      dragged,
    );
    if (!target) return null;
    const stays =
      dragged !== undefined &&
      moveFieldTo(definition, dragged, target.sectionKey, target.index) === definition;
    return stays ? null : target;
  };
  const show = (next: Landing | null) => {
    landingNow.current = next;
    if (next) wandered.current = true;
    setLanding((shown) => (sameLanding(shown, next) ? shown : next));
  };
  const started = (event: DragStartEvent) => {
    onDragging?.(true);
    underWay.current = true;
    wandered.current = false;
    show(null);
    const id = String(event.active.id);
    const type = typeFromDragId(id);
    setGhost(type ? tt(type) : nameOf(id));
  };
  const moved = (event: DragMoveEvent) => {
    if (underWay.current) show(landingOf(event));
  };
  const ended = () => {
    underWay.current = false;
    onDragging?.(false);
    setGhost(null);
    setLanding(null);
  };
  const dropped = (event: DragEndEvent) => {
    const target = landingOf(event);
    // the words said after the drop name the place it went to
    landingNow.current = target;
    ended();
    if (!target) return;
    const id = String(event.active.id);
    const type = typeFromDragId(id);
    if (type) onDropType(type, target.sectionKey, target.index);
    else onChange(moveFieldTo(definition, id, target.sectionKey, target.index));
  };
  const cancelled = () => {
    landingNow.current = null;
    ended();
  };

  /** The dragged thing by its name: a question's text, or a new question of the dragged type. */
  const nameOf = (id: string) => {
    const type = typeFromDragId(id);
    if (type) return t('dnd.new_question', { type: tt(type) });
    const field = definition.sections.flatMap((s) => s.fields).find((f) => f.fieldKey === id);
    return field ? questionName(field).name : '';
  };
  /** A landing in words: the section by its name and the place in it as an ordinal. */
  const placeOf = (at: Landing) => {
    const section = definition.sections.find((s) => s.key === at.sectionKey);
    const n = String(at.index + 1);
    return {
      part: (section && localized(section.title, locale)) || t('publish_list.unnamed_section'),
      place: t('dnd.place', { order: n, n }),
    };
  };
  const whileDragged = (id: string) => {
    if (!underWay.current) return undefined;
    const at = landingNow.current;
    if (at) return t('dnd.will_land', { label: nameOf(id), ...placeOf(at) });
    // just picked up, the question is over its own place: the pick-up was said already
    if (!wandered.current) return undefined;
    return typeFromDragId(id) ? t('dnd.will_not_add') : t('dnd.will_stay', { label: nameOf(id) });
  };
  const announcements: Announcements = {
    onDragStart: ({ active }) => t('dnd.picked', { label: nameOf(String(active.id)) }),
    // the half of a question changes without the question under the pointer changing
    onDragMove: ({ active }) => whileDragged(String(active.id)),
    onDragOver: ({ active }) => whileDragged(String(active.id)),
    onDragEnd: ({ active }) => {
      const id = String(active.id);
      const at = landingNow.current;
      if (at) return t('dnd.landed', { label: nameOf(id), ...placeOf(at) });
      return typeFromDragId(id) ? t('dnd.not_added') : t('dnd.stayed', { label: nameOf(id) });
    },
    onDragCancel: ({ active }) => {
      const id = String(active.id);
      return typeFromDragId(id) ? t('dnd.not_added') : t('dnd.cancelled', { label: nameOf(id) });
    },
  };
  return (
    <DndContext
      sensors={sensors}
      collisionDetection={underPointer}
      accessibility={{
        announcements,
        screenReaderInstructions: { draggable: t('dnd.instructions') },
      }}
      onDragStart={started}
      onDragMove={moved}
      onDragOver={moved}
      onDragEnd={dropped}
      onDragCancel={cancelled}
    >
      <LandingContext value={landing}>{children}</LandingContext>
      <DragOverlay dropAnimation={null} modifiers={[besidePointer]}>
        {/* as large as the dragged question, so the keyboard's steps go by the question's place */}
        {ghost === null ? null : (
          <div className="fb-drag-ghost" data-testid="drag-name">
            <span className="fb-type-chip">{ghost}</span>
          </div>
        )}
      </DragOverlay>
    </DndContext>
  );
}

/**
 * The form as it will be filled, drawn section by section: a click on a question chooses it,
 * the chosen one shows its type with the move, copy and remove buttons (a row question of a list
 * too, inside its list) and a menu of the other parts it can go to, a handle drags a question to
 * another place or section (the keyboard moves it with the buttons), and each section ends with
 * a menu of the question types that adds one there, as a list does for its rows. A question with
 * no text yet says so in place of its text. Removing is the page's: it asks first when something
 * else reads what goes. A question or a part with something to fix before publishing carries a
 * mark, and says what once it is chosen; the page has one brought into view through `reveal`,
 * and given the focus unless the page keeps it. A beneficiary application form with no question
 * yet opens with a card that adds its identity questions in one press. A part and a question are
 * drawn again only when something of their own changes (their content, what is said about them,
 * whether they are chosen, the line of a drag), so a keystroke in one question of a long form
 * draws that question alone.
 */
export function FormCanvas({
  definition,
  mode,
  errors,
  problems = NO_PROBLEMS,
  reveal = null,
  onRevealed,
  selected,
  onSelect,
  onChange,
  onRemoveField,
  onRemoveSection,
  onCopyField,
  onMoveFieldTo,
  onAddTo,
  onAddRow,
  onAddSection,
  onAddIdentity,
}: {
  definition: FormDefinition;
  mode: BuilderMode;
  errors: Messages;
  /** What is to fix before publishing, by question and by part; none where nothing is published. */
  problems?: PlaceProblems;
  /** The question or the part to bring into view and, unless quiet, give the focus, once. */
  reveal?: Reveal | null;
  /** The place asked for is in view: the page forgets the request. */
  onRevealed?: () => void;
  selected: Selection | null;
  onSelect: (selection: Selection) => void;
  onChange: (definition: FormDefinition) => void;
  onRemoveField: (fieldKey: string) => void;
  onRemoveSection: (sectionKey: string) => void;
  onCopyField: (fieldKey: string) => void;
  /** The person sends a question to the end of another section. */
  onMoveFieldTo: (fieldKey: string, sectionKey: string) => void;
  /** The person wants a question of this type at the end of this section. */
  onAddTo: (sectionKey: string, type: FieldType) => void;
  /** The person wants a question of this type at the end of this group's rows. */
  onAddRow: (groupKey: string, type: FieldType) => void;
  /** The person wants a new empty section at the end of the form. */
  onAddSection: () => void;
  /**
   * The person wants the identity questions the form still lacks, all at once; given only while
   * a beneficiary application form lacks some.
   */
  onAddIdentity?: () => void;
}) {
  const t = useTranslations('forms.builder');
  const locale = useLocale();
  const root = useRef<HTMLElement>(null);
  // a form with no question yet starts with its identity questions, where it needs them
  const starting =
    mode === 'full' &&
    onAddIdentity !== undefined &&
    definition.sections.every((s) => s.fields.length === 0);
  const revealed = useEffectEvent(() => onRevealed?.());
  useEffect(() => {
    if (!reveal) return;
    revealed();
    const [mark, key, button] = reveal.field
      ? (['data-question', reveal.field, '.fb-q-select'] as const)
      : (['data-part', reveal.section, '.fb-sec-select'] as const);
    const place = [...(root.current?.querySelectorAll<HTMLElement>(`[${mark}]`) ?? [])].find(
      (el) => el.getAttribute(mark) === key,
    );
    if (!place) return;
    // jsdom has no scrolling
    place.scrollIntoView?.({ block: 'center' });
    if (!reveal.quiet) place.querySelector<HTMLElement>(button)?.focus({ preventScroll: true });
  }, [reveal]);
  // the page's handlers as they are now, read at the moment of a press
  const latest = useRef({
    definition,
    onSelect,
    onChange,
    onRemoveField,
    onRemoveSection,
    onCopyField,
    onMoveFieldTo,
    onAddTo,
    onAddRow,
  });
  useEffect(() => {
    latest.current = {
      definition,
      onSelect,
      onChange,
      onRemoveField,
      onRemoveSection,
      onCopyField,
      onMoveFieldTo,
      onAddTo,
      onAddRow,
    };
  });
  const actions = useMemo<CanvasActions>(
    () => ({
      select: (selection) => latest.current.onSelect(selection),
      moveSection: (sectionKey, direction) => {
        const now = latest.current;
        now.onChange(moveSection(now.definition, sectionKey, direction));
      },
      removeSection: (sectionKey) => latest.current.onRemoveSection(sectionKey),
      moveField: (sectionKey, fieldKey, direction) => {
        const now = latest.current;
        now.onChange(moveField(now.definition, sectionKey, fieldKey, direction));
      },
      removeField: (fieldKey) => latest.current.onRemoveField(fieldKey),
      copyField: (fieldKey) => latest.current.onCopyField(fieldKey),
      moveFieldTo: (fieldKey, sectionKey) => latest.current.onMoveFieldTo(fieldKey, sectionKey),
      addTo: (sectionKey, type) => latest.current.onAddTo(sectionKey, type),
      addRow: (groupKey, type) => latest.current.onAddRow(groupKey, type),
    }),
    [],
  );
  const unnamedPart = t('publish_list.unnamed_section');
  // where a question can be sent: every part, by its name
  const parts = definition.sections.map((part) => ({
    key: part.key,
    title: localized(part.title, locale) || unnamedPart,
    // an identity question stays where everyone sees it, always
    open: part.visibility !== 'official_only' && !part.condition,
  }));
  const body = definition.sections.map((section, i) => (
    <SectionCard
      key={section.key}
      section={section}
      index={i}
      parts={parts}
      mode={mode}
      errors={errors}
      problems={problems}
      selected={selected}
      actions={actions}
    />
  ));
  return (
    <section ref={root} aria-label={t('outline')}>
      <Stack gap={4}>
        {starting ? (
          <div className="fb-start">
            <span className="fb-start-icon">
              <Icon name="id-card" />
            </span>
            <Text>
              <strong>{t('identity.start_title')}</strong>
            </Text>
            <Text tone="muted">{t('identity.start_hint')}</Text>
            <div>
              <Button startIcon="add" onClick={onAddIdentity}>
                {t('identity.add_all')}
              </Button>
            </div>
          </div>
        ) : null}
        {body}
        {mode === 'full' ? (
          <div>
            <Button variant="secondary" startIcon="add" onClick={onAddSection}>
              {t('new_section')}
            </Button>
          </div>
        ) : null}
      </Stack>
    </section>
  );
}

interface SectionProps {
  section: FormSection;
  index: number;
  /** Every part of the form, this one among them. */
  parts: readonly PartRef[];
  mode: BuilderMode;
  errors: Messages;
  problems: PlaceProblems;
  selected: Selection | null;
  actions: CanvasActions;
}

/**
 * Whether a part would be drawn as it is: the same part in the same place among the same parts,
 * the same things said about it and its questions, and the same question of it chosen. What is
 * said about other parts, and a question chosen elsewhere, does not count.
 */
function sameSection(a: SectionProps, b: SectionProps): boolean {
  if (a.section !== b.section || a.index !== b.index || a.mode !== b.mode) return false;
  if (a.actions !== b.actions || !sameParts(a.parts, b.parts)) return false;
  const key = a.section.key;
  if (!sameList(saidOf(a.errors, key), saidOf(b.errors, key))) return false;
  if (!sameList(a.problems.sections.get(key), b.problems.sections.get(key))) return false;
  const saidTheSame = a.section.fields.every(
    (f) =>
      sameList(saidOf(a.errors, f.fieldKey), saidOf(b.errors, f.fieldKey)) &&
      sameList(a.problems.fields.get(f.fieldKey), b.problems.fields.get(f.fieldKey)),
  );
  if (!saidTheSame) return false;
  const chosenHere = (selection: Selection | null) =>
    selection?.section === key ? (selection.field ?? '') : null;
  return chosenHere(a.selected) === chosenHere(b.selected);
}

const SectionCard = memo(function SectionCard({
  section,
  index,
  parts,
  mode,
  errors,
  problems,
  selected,
  actions,
}: SectionProps) {
  const t = useTranslations('forms.builder');
  const locale = useLocale();
  const hintId = useId();
  const typeItems = useTypeItems();
  const count = parts.length;
  const full = mode === 'full';
  const title = localized(section.title, locale);
  const others = parts.filter((part) => part.key !== section.key);
  const heads = section.fields.filter((f) => groupOf(f) === undefined);
  // the line of a dragged question: under this section's last question, or at one of its questions
  const landing = useContext(LandingContext);
  const landsAtEnd = landing?.sectionKey === section.key && !landing.at;
  const at = landing?.at;
  const { setNodeRef, isOver } = useDroppable({
    id: `${SECTION_DROP}${section.key}`,
    disabled: !full,
  });
  const rows = heads.map((f, i) => (
    <QuestionRow
      key={f.fieldKey}
      field={f}
      members={section.fields.filter((m) => groupOf(m) === f.fieldKey)}
      first={i === 0}
      last={i === heads.length - 1}
      mode={mode}
      errors={errors}
      problems={problems.fields}
      selected={selected?.field ?? null}
      lands={at?.fieldKey === f.fieldKey ? at.half : null}
      others={others}
      sectionKey={section.key}
      actions={actions}
    />
  ));
  const chosen = selected?.section === section.key && !selected.field;
  const fix = problems.sections.get(section.key);
  return (
    <section
      ref={setNodeRef}
      className={`fb-sec${isOver ? ' is-over' : ''}${chosen ? ' is-selected' : ''}`}
      aria-label={title}
      data-part={section.key}
      data-testid={`part-${section.key}`}
      // where a dragged question will land, for the line and for whoever looks for it
      data-landing={landsAtEnd ? 'end' : undefined}
    >
      <div className="fb-sec-head">
        <h2 className="fb-sec-title">
          {mode === 'read' ? (
            <span>{title}</span>
          ) : (
            <button
              type="button"
              className="fb-sec-select"
              aria-describedby={hintId}
              onClick={() => actions.select({ section: section.key })}
            >
              {title}
              <Icon name="edit" size={16} />
            </button>
          )}
          <Text tone="muted">{t('questions_count', { n: String(section.fields.length) })}</Text>
          {section.visibility === 'official_only' ? <Chip>{t('official_only')}</Chip> : null}
          <FixMark fix={fix} />
        </h2>
        {mode === 'read' ? null : (
          <span id={hintId} hidden>
            {t('section_select_hint')}
          </span>
        )}
        {full ? (
          <Menu
            label={t('section_menu', { title })}
            items={[
              ...(index > 0
                ? [
                    {
                      id: 'up',
                      label: t('move_up', { label: title }),
                      icon: 'arrow-up' as const,
                      onSelect: () => actions.moveSection(section.key, -1),
                    },
                  ]
                : []),
              ...(index < count - 1
                ? [
                    {
                      id: 'down',
                      label: t('move_down', { label: title }),
                      icon: 'arrow-down' as const,
                      onSelect: () => actions.moveSection(section.key, 1),
                    },
                  ]
                : []),
              // a form keeps at least one part, so the only one stays, and the menu says why
              count > 1
                ? {
                    id: 'remove',
                    label: t('remove', { label: title }),
                    icon: 'delete' as const,
                    onSelect: () => actions.removeSection(section.key),
                  }
                : {
                    id: 'remove',
                    label: t('remove_only_section'),
                    icon: 'delete' as const,
                    disabled: true,
                  },
            ]}
          />
        ) : null}
      </div>
      {chosen && fix?.length ? (
        <div className="fb-q-tags">
          <FixLines fix={fix} />
        </div>
      ) : null}
      <Refusals messages={saidOf(errors, section.key)} />
      {full ? (
        <SortableContext items={heads.map((f) => f.fieldKey)} strategy={stay}>
          <ul aria-label={title} className="fb-q-list">
            {rows}
          </ul>
        </SortableContext>
      ) : (
        <ul aria-label={title} className="fb-q-list">
          {rows}
        </ul>
      )}
      {section.fields.length === 0 ? (
        <p className="admin-muted fb-sec-empty">{t('section_empty')}</p>
      ) : null}
      {full ? (
        <Menu label={t('add_here')} items={typeItems((type) => actions.addTo(section.key, type))}>
          <span className="fb-menu-label">
            <Icon name="add" size={16} />
            {t('add_here')}
          </span>
        </Menu>
      ) : null}
    </section>
  );
}, sameSection);

interface RowProps {
  field: FormField;
  /** The row questions of a list, in their order; none for any other question. */
  members: readonly FormField[];
  first: boolean;
  last: boolean;
  mode: BuilderMode;
  errors: Messages;
  problems: PlaceProblems['fields'];
  /** The chosen question of the form, this one or another. */
  selected: string | null;
  /** The other parts of the form, and whether each takes an identity question. */
  others: readonly PartRef[];
  sectionKey: string;
  actions: CanvasActions;
}

/**
 * Whether a question would be drawn as it is: the same question with the same row questions in
 * the same place, the same things said about them, the same other parts to go to, and chosen or
 * not as before. What is said about other questions, and which other question is chosen, does not
 * count.
 */
function sameRow(a: RowProps, b: RowProps): boolean {
  if (a.field !== b.field || a.first !== b.first || a.last !== b.last || a.mode !== b.mode)
    return false;
  if (a.sectionKey !== b.sectionKey || a.actions !== b.actions) return false;
  if (!sameList(a.members, b.members) || !sameParts(a.others, b.others)) return false;
  const keys = [a.field.fieldKey, ...a.members.map((m) => m.fieldKey)];
  const saidTheSame = keys.every(
    (key) =>
      sameList(saidOf(a.errors, key), saidOf(b.errors, key)) &&
      sameList(a.problems.get(key), b.problems.get(key)),
  );
  if (!saidTheSame) return false;
  const chosenHere = (key: string | null) => (key !== null && keys.includes(key) ? key : null);
  return chosenHere(a.selected) === chosenHere(b.selected);
}

/**
 * A question on the canvas with its handle: the place a dragged question is dropped on, and the
 * line where one will land. The drag's own state calls this again for every question while a
 * question is on its way, so what a question shows is drawn by `QuestionBody`, which is not.
 */
const QuestionRow = memo(
  function QuestionRow({ lands, ...row }: RowProps & { lands: Half | null }) {
    const t = useTranslations('forms.builder');
    const { field, mode, selected } = row;
    const full = mode === 'full';
    const { name: label, unnamed } = useQuestionName()(field);
    const isSelected = selected === field.fieldKey;
    const {
      attributes,
      listeners,
      setNodeRef,
      setActivatorNodeRef,
      transform,
      transition,
      isDragging,
    } = useSortable({ id: field.fieldKey, disabled: !full });
    return (
      <li
        ref={setNodeRef}
        style={{ transform: CSS.Translate.toString(transform), transition }}
        className={`fb-q${isSelected ? ' is-selected' : ''}${isDragging ? ' is-dragging' : ''}${unnamed ? ' is-unnamed' : ''}`}
        data-question={field.fieldKey}
        data-testid={`question-${field.fieldKey}`}
        // where a dragged question will land, for the line and for whoever looks for it
        data-landing={lands ?? undefined}
      >
        {full ? (
          <button
            ref={setActivatorNodeRef}
            type="button"
            className="fb-q-grip"
            {...attributes}
            {...listeners}
          >
            <Icon name="drag" size={16} label={t('drag', { label })} />
          </button>
        ) : null}
        <QuestionBody {...row} />
      </li>
    );
  },
  (a, b) => a.lands === b.lands && sameRow(a, b),
);

/** What a question shows: itself as it will be filled, its tags, its row questions and its bar. */
const QuestionBody = memo(function QuestionBody({
  field,
  members,
  first,
  last,
  mode,
  errors,
  problems,
  selected,
  others,
  sectionKey,
  actions,
}: RowProps) {
  const t = useTranslations('forms.builder');
  const tt = useTranslations('forms.types');
  const typeItems = useTypeItems();
  const full = mode === 'full';
  const { name: label } = useQuestionName()(field);
  const identity = identityRoleOf(field) !== null;
  const isSelected = selected === field.fieldKey;
  const meta = TYPE_META[field.type];
  const select = (fieldKey: string) => actions.select({ section: sectionKey, field: fieldKey });
  return (
    <>
      <div className="fb-q-main">
        {mode === 'read' ? null : (
          <button
            type="button"
            className="fb-q-select"
            aria-label={t('edit', { label })}
            aria-pressed={isSelected}
            onClick={() => select(field.fieldKey)}
          />
        )}
        <div className="fb-q-preview" inert>
          <QuestionPreview field={field} />
        </div>
        <QuestionTags field={field} fix={problems.get(field.fieldKey)} chosen={isSelected} />
        <Refusals messages={saidOf(errors, field.fieldKey)} />
        {members.length ? (
          <ul aria-label={t('members_of', { label })} className="fb-q-members">
            {members.map((m, i) => (
              <MemberRow
                key={m.fieldKey}
                field={m}
                first={i === 0}
                last={i === members.length - 1}
                mode={mode}
                messages={saidOf(errors, m.fieldKey)}
                fix={problems.get(m.fieldKey)}
                selected={selected === m.fieldKey}
                onSelect={() => select(m.fieldKey)}
                onMove={(dir) => actions.moveField(sectionKey, m.fieldKey, dir)}
                onCopy={() => actions.copyField(m.fieldKey)}
                onRemove={() => actions.removeField(m.fieldKey)}
              />
            ))}
          </ul>
        ) : null}
        {full && field.type === 'repeat_group' ? (
          <div className="fb-q-add-row">
            <Menu
              label={t('add_row_question')}
              items={typeItems((type) => actions.addRow(field.fieldKey, type), true)}
            >
              <span className="fb-menu-label">
                <Icon name="add" size={16} />
                {t('add_row_question')}
              </span>
            </Menu>
          </div>
        ) : null}
      </div>
      {isSelected && full ? (
        <div className="fb-q-bar" role="group" aria-label={t('question_actions', { label })}>
          <Icon name={meta.icon} size={16} />
          {/* a name cut short in a narrow question is whole in its tip */}
          <span className="fb-q-bar-type" title={tt(field.type)}>
            {tt(field.type)}
          </span>
          <IconButton
            label={t('move_up', { label })}
            icon="arrow-up"
            size="small"
            disabled={first}
            onClick={() => actions.moveField(sectionKey, field.fieldKey, -1)}
          />
          <IconButton
            label={t('move_down', { label })}
            icon="arrow-down"
            size="small"
            disabled={last}
            onClick={() => actions.moveField(sectionKey, field.fieldKey, 1)}
          />
          {field.type === 'repeat_group' ? null : (
            <IconButton
              label={t('copy', { label })}
              icon="copy"
              size="small"
              onClick={() => actions.copyField(field.fieldKey)}
            />
          )}
          <IconButton
            label={t('remove', { label })}
            icon="delete"
            size="small"
            onClick={() => actions.removeField(field.fieldKey)}
          />
          {/* a form of one part has nowhere else to send a question */}
          {others.length ? (
            <Menu
              label={t('move_to_part', { label })}
              items={others.map((part) => ({
                id: part.key,
                label: part.title,
                disabled: identity && !part.open,
                onSelect: () => actions.moveFieldTo(field.fieldKey, part.key),
              }))}
            />
          ) : null}
        </div>
      ) : null}
    </>
  );
}, sameRow);

function MemberRow({
  field,
  first,
  last,
  mode,
  messages,
  fix,
  selected,
  onSelect,
  onMove,
  onCopy,
  onRemove,
}: {
  field: FormField;
  first: boolean;
  last: boolean;
  mode: BuilderMode;
  messages?: string[];
  fix?: readonly string[];
  selected: boolean;
  onSelect: () => void;
  onMove: (direction: -1 | 1) => void;
  onCopy: () => void;
  onRemove: () => void;
}) {
  const t = useTranslations('forms.builder');
  const { name: label, unnamed } = useQuestionName()(field);
  return (
    <li
      className={`fb-q fb-q-member${selected ? ' is-selected' : ''}${unnamed ? ' is-unnamed' : ''}`}
      data-question={field.fieldKey}
      data-testid={`question-${field.fieldKey}`}
    >
      <div className="fb-q-main">
        {mode === 'read' ? null : (
          <button
            type="button"
            className="fb-q-select"
            aria-label={t('edit', { label })}
            aria-pressed={selected}
            onClick={onSelect}
          />
        )}
        <div className="fb-q-preview" inert>
          <QuestionPreview field={field} />
        </div>
        <QuestionTags field={field} fix={fix} chosen={selected} />
        <Refusals messages={messages} />
      </div>
      {selected && mode === 'full' ? (
        <div className="fb-q-bar" role="group" aria-label={t('question_actions', { label })}>
          <IconButton
            label={t('move_up', { label })}
            icon="arrow-up"
            size="small"
            disabled={first}
            onClick={() => onMove(-1)}
          />
          <IconButton
            label={t('move_down', { label })}
            icon="arrow-down"
            size="small"
            disabled={last}
            onClick={() => onMove(1)}
          />
          <IconButton label={t('copy', { label })} icon="copy" size="small" onClick={onCopy} />
          <IconButton
            label={t('remove', { label })}
            icon="delete"
            size="small"
            onClick={onRemove}
          />
        </div>
      ) : null}
    </li>
  );
}

/**
 * The question as the renderer draws it, taking nothing: the address and a group are sketched,
 * and a question with no text yet is drawn under the name that says so.
 */
function QuestionPreview({ field: given }: { field: FormField }) {
  const t = useTranslations('forms.builder');
  const { name: label, unnamed } = useQuestionName()(given);
  const field = unnamed ? { ...given, label: { bn: label, en: label } } : given;
  if (field.type === 'bd_address')
    return (
      <Stack gap={1}>
        <SelectField
          label={label}
          required={field.required}
          options={[]}
          value=""
          onChange={() => undefined}
          placeholder={t('address_sketch')}
        />
      </Stack>
    );
  if (field.type === 'repeat_group')
    return (
      <Text>
        <strong>
          {label}
          {field.required ? ` ${t('required_mark')}` : ''}
        </strong>
      </Text>
    );
  return (
    <FieldInput
      field={field}
      id={`canvas-${field.fieldKey}`}
      state={{ visible: true, required: field.required, options: field.options ?? [] }}
      value={undefined}
      computed={undefined}
      onChange={() => undefined}
      nisabKnown={false}
    />
  );
}

/** What the server said about a question or a part, each message in a note of its own. */
function Refusals({ messages }: { messages?: string[] }) {
  return messages?.map((message) => (
    <Alert key={message} tone="error">
      {message}
    </Alert>
  ));
}

/**
 * The mark of a question or a part with something to fix before publishing: an icon with a name,
 * so it is not told by colour alone.
 */
function FixMark({ fix }: { fix?: readonly string[] }) {
  const t = useTranslations('forms.builder');
  if (!fix) return null;
  return (
    <span className="fb-tag fb-tag-warn">
      <Icon name="warning" size={16} label={t('needs_fixing')} />
    </span>
  );
}

/** What is to fix at a question or a part, shown once it is chosen. */
function FixLines({ fix }: { fix: readonly string[] }) {
  return fix.map((line) => (
    <span key={line} className="fb-tag fb-tag-warn">
      {line}
    </span>
  ));
}

function QuestionTags({
  field,
  fix,
  chosen,
}: {
  field: FormField;
  fix?: readonly string[];
  chosen: boolean;
}) {
  const t = useTranslations('forms.builder');
  const role = identityRoleOf(field);
  type Tag = { icon: ExtendedIconName; text: string; tone: string };
  const tags: (Tag | null)[] = [
    role
      ? {
          icon: 'lock' as const,
          text: t('identity.tag', { role: t(`identity.roles.${role}`) }),
          tone: 'lock',
        }
      : null,
    field.logic?.show_if || field.logic?.required_if
      ? { icon: 'branch' as const, text: t('has_condition'), tone: 'logic' }
      : null,
    field.type === 'calculation'
      ? {
          icon: 'calculator' as const,
          text: t(field.calculation ? 'has_calc' : 'calc_missing'),
          tone: field.calculation ? 'calc' : 'warn',
        }
      : null,
  ];
  const shown = tags.filter((x): x is Tag => x !== null);
  if (!shown.length && !fix) return null;
  return (
    <div className="fb-q-tags">
      <FixMark fix={fix} />
      {chosen && fix ? <FixLines fix={fix} /> : null}
      {shown.map((tag) => (
        <span key={tag.text} className={`fb-tag fb-tag-${tag.tone}`}>
          <Icon name={tag.icon} size={16} />
          {tag.text}
        </span>
      ))}
    </div>
  );
}
