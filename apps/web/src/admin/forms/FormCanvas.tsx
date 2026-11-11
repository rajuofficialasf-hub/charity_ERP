import {
  closestCenter,
  DndContext,
  type DragEndEvent,
  DragOverlay,
  type DragStartEvent,
  KeyboardSensor,
  PointerSensor,
  useDroppable,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
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
  SelectField,
  Stack,
  Text,
  type ExtendedIconName,
} from '@/ui';
import { type ReactNode, useEffect, useEffectEvent, useId, useRef, useState } from 'react';
import { useLocale, useTranslations } from 'use-intl';
import { FieldInput } from '../../features/forms/FieldInput';
import { moveField, moveFieldTo, moveSection } from './draft';
import { dropTarget, SECTION_DROP, typeFromDragId } from './drop-target';
import type { PlaceProblems } from './publish-entries';
import type { BuilderMode, Selection } from './selection';
import { TYPE_META } from './type-meta';

const groupOf = (field: FormField) => field.settings?.repeat?.group;

/** The messages of the server about questions and parts, by the key each names. */
type Messages = Record<string, string[]>;
const NO_PROBLEMS: PlaceProblems = { fields: new Map(), sections: new Map() };

/**
 * The drag context around the panes: a question moves by its handle inside or across sections,
 * and a type from the left pane drops at a place, where the dialog then asks for its texts. The
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
  const tt = useTranslations('forms.types');
  const [activeType, setActiveType] = useState<FieldType | null>(null);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  const started = (event: DragStartEvent) => {
    onDragging?.(true);
    setActiveType(typeFromDragId(String(event.active.id)) ?? null);
  };
  const ended = () => {
    onDragging?.(false);
    setActiveType(null);
  };
  const dropped = (event: DragEndEvent) => {
    ended();
    const id = String(event.active.id);
    const over = event.over ? String(event.over.id) : null;
    if (!over || over === id) return;
    const target = dropTarget(definition, over);
    if (!target) return;
    const type = typeFromDragId(id);
    if (type) onDropType(type, target.sectionKey, target.index);
    else onChange(moveFieldTo(definition, id, target.sectionKey, target.index));
  };
  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragStart={started}
      onDragEnd={dropped}
      onDragCancel={ended}
    >
      {children}
      <DragOverlay dropAnimation={null}>
        {activeType ? <span className="fb-type-chip">{tt(activeType)}</span> : null}
      </DragOverlay>
    </DndContext>
  );
}

/**
 * The form as it will be filled, drawn section by section: a click on a question chooses it,
 * the chosen one shows its type with the move, copy and remove buttons (a row question of a list
 * too, inside its list), a handle drags a question to another place or section (the keyboard
 * moves it with the buttons), and each section ends with the way to add a question to it.
 * Removing is the page's: it asks first when something else reads what goes. A question or a part
 * with something to fix before publishing carries a mark, and says what once it is chosen; the
 * page has one brought into view and given the focus through `reveal`.
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
  onAddTo,
  onAddRow,
  onAddSection,
}: {
  definition: FormDefinition;
  mode: BuilderMode;
  errors: Messages;
  /** What is to fix before publishing, by question and by part; none where nothing is published. */
  problems?: PlaceProblems;
  /** The question or the part to bring into view and give the focus, once. */
  reveal?: Selection | null;
  /** The place asked for is in view: the page forgets the request. */
  onRevealed?: () => void;
  selected: Selection | null;
  onSelect: (selection: Selection) => void;
  onChange: (definition: FormDefinition) => void;
  onRemoveField: (fieldKey: string) => void;
  onRemoveSection: (sectionKey: string) => void;
  onCopyField: (fieldKey: string) => void;
  /** The person wants a question in this section: the left pane takes over. */
  onAddTo: (sectionKey: string) => void;
  /** The person wants a question in this group's rows: the group is chosen for the left pane. */
  onAddRow: (groupKey: string) => void;
  /** The person wants a new empty section at the end of the form. */
  onAddSection: () => void;
}) {
  const t = useTranslations('forms.builder');
  const root = useRef<HTMLElement>(null);
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
    place.querySelector<HTMLElement>(button)?.focus({ preventScroll: true });
  }, [reveal]);
  const body = definition.sections.map((s, i) => (
    <SectionCard
      key={s.key}
      section={s}
      index={i}
      count={definition.sections.length}
      mode={mode}
      errors={errors}
      problems={problems}
      selected={selected}
      onSelect={onSelect}
      onMoveSection={(dir) => onChange(moveSection(definition, s.key, dir))}
      onRemoveSection={() => onRemoveSection(s.key)}
      onMoveField={(key, dir) => onChange(moveField(definition, s.key, key, dir))}
      onRemoveField={onRemoveField}
      onCopyField={onCopyField}
      onAddTo={() => onAddTo(s.key)}
      onAddRow={onAddRow}
    />
  ));
  return (
    <section ref={root} aria-label={t('outline')}>
      <Stack gap={4}>
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

function SectionCard({
  section,
  index,
  count,
  mode,
  errors,
  problems,
  selected,
  onSelect,
  onMoveSection,
  onRemoveSection,
  onMoveField,
  onRemoveField,
  onCopyField,
  onAddTo,
  onAddRow,
}: {
  section: FormSection;
  index: number;
  count: number;
  mode: BuilderMode;
  errors: Messages;
  problems: PlaceProblems;
  selected: Selection | null;
  onSelect: (selection: Selection) => void;
  onMoveSection: (direction: -1 | 1) => void;
  onRemoveSection: () => void;
  onMoveField: (fieldKey: string, direction: -1 | 1) => void;
  onRemoveField: (fieldKey: string) => void;
  onCopyField: (fieldKey: string) => void;
  onAddTo: () => void;
  onAddRow: (groupKey: string) => void;
}) {
  const t = useTranslations('forms.builder');
  const locale = useLocale();
  const hintId = useId();
  const full = mode === 'full';
  const title = localized(section.title, locale);
  const heads = section.fields.filter((f) => groupOf(f) === undefined);
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
      onSelect={(key) => onSelect({ section: section.key, field: key })}
      onMove={(dir) => onMoveField(f.fieldKey, dir)}
      onMoveMember={(key, dir) => onMoveField(key, dir)}
      onRemove={() => onRemoveField(f.fieldKey)}
      onRemoveMember={onRemoveField}
      onAddRow={() => onAddRow(f.fieldKey)}
      onCopy={() => onCopyField(f.fieldKey)}
      onCopyMember={onCopyField}
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
              onClick={() => onSelect({ section: section.key })}
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
                      onSelect: () => onMoveSection(-1),
                    },
                  ]
                : []),
              ...(index < count - 1
                ? [
                    {
                      id: 'down',
                      label: t('move_down', { label: title }),
                      icon: 'arrow-down' as const,
                      onSelect: () => onMoveSection(1),
                    },
                  ]
                : []),
              // a form keeps at least one part, so the only one stays, and the menu says why
              count > 1
                ? {
                    id: 'remove',
                    label: t('remove', { label: title }),
                    icon: 'delete' as const,
                    onSelect: onRemoveSection,
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
      <Refusals messages={errors[section.key]} />
      {full ? (
        <SortableContext
          items={heads.map((f) => f.fieldKey)}
          strategy={verticalListSortingStrategy}
        >
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
        <Button variant="text" size="small" startIcon="add" onClick={onAddTo}>
          {t('add_here')}
        </Button>
      ) : null}
    </section>
  );
}

function QuestionRow({
  field,
  members,
  first,
  last,
  mode,
  errors,
  problems,
  selected,
  onSelect,
  onMove,
  onMoveMember,
  onRemove,
  onRemoveMember,
  onCopy,
  onCopyMember,
  onAddRow,
}: {
  field: FormField;
  members: FormField[];
  first: boolean;
  last: boolean;
  mode: BuilderMode;
  errors: Messages;
  problems: PlaceProblems['fields'];
  selected: string | null;
  onSelect: (fieldKey: string) => void;
  onMove: (direction: -1 | 1) => void;
  onMoveMember: (fieldKey: string, direction: -1 | 1) => void;
  onRemove: () => void;
  onRemoveMember: (fieldKey: string) => void;
  onCopy: () => void;
  onCopyMember: (fieldKey: string) => void;
  onAddRow: () => void;
}) {
  const t = useTranslations('forms.builder');
  const tt = useTranslations('forms.types');
  const locale = useLocale();
  const full = mode === 'full';
  const label = localized(field.label, locale);
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
  const meta = TYPE_META[field.type];
  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      className={`fb-q${isSelected ? ' is-selected' : ''}${isDragging ? ' is-dragging' : ''}`}
      data-question={field.fieldKey}
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
      <div className="fb-q-main">
        {mode === 'read' ? null : (
          <button
            type="button"
            className="fb-q-select"
            aria-label={t('edit', { label })}
            aria-pressed={isSelected}
            onClick={() => onSelect(field.fieldKey)}
          />
        )}
        <div className="fb-q-preview" inert>
          <QuestionPreview field={field} />
        </div>
        <QuestionTags field={field} fix={problems.get(field.fieldKey)} chosen={isSelected} />
        <Refusals messages={errors[field.fieldKey]} />
        {members.length ? (
          <ul aria-label={t('members_of', { label })} className="fb-q-members">
            {members.map((m, i) => (
              <MemberRow
                key={m.fieldKey}
                field={m}
                first={i === 0}
                last={i === members.length - 1}
                mode={mode}
                messages={errors[m.fieldKey]}
                fix={problems.get(m.fieldKey)}
                selected={selected === m.fieldKey}
                onSelect={() => onSelect(m.fieldKey)}
                onMove={(dir) => onMoveMember(m.fieldKey, dir)}
                onCopy={() => onCopyMember(m.fieldKey)}
                onRemove={() => onRemoveMember(m.fieldKey)}
              />
            ))}
          </ul>
        ) : null}
        {full && field.type === 'repeat_group' ? (
          <div className="fb-q-add-row">
            <Button size="small" variant="text" startIcon="add" onClick={onAddRow}>
              {t('add_row_question')}
            </Button>
          </div>
        ) : null}
      </div>
      {isSelected && full ? (
        <div className="fb-q-bar" role="group" aria-label={t('question_actions', { label })}>
          <Icon name={meta.icon} size={16} />
          <span className="fb-q-bar-type">{tt(field.type)}</span>
          <IconButton
            label={t('move_up', { label })}
            icon="arrow-up"

            disabled={first}
            onClick={() => onMove(-1)}
          />
          <IconButton
            label={t('move_down', { label })}
            icon="arrow-down"

            disabled={last}
            onClick={() => onMove(1)}
          />
          {field.type === 'repeat_group' ? null : (
            <IconButton label={t('copy', { label })} icon="copy" onClick={onCopy} />
          )}
          <IconButton label={t('remove', { label })} icon="delete" onClick={onRemove} />
        </div>
      ) : null}
    </li>
  );
}

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
  const locale = useLocale();
  const label = localized(field.label, locale);
  return (
    <li
      className={`fb-q fb-q-member${selected ? ' is-selected' : ''}`}
      data-question={field.fieldKey}
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

            disabled={first}
            onClick={() => onMove(-1)}
          />
          <IconButton
            label={t('move_down', { label })}
            icon="arrow-down"

            disabled={last}
            onClick={() => onMove(1)}
          />
          <IconButton label={t('copy', { label })} icon="copy" onClick={onCopy} />
          <IconButton label={t('remove', { label })} icon="delete" onClick={onRemove} />
        </div>
      ) : null}
    </li>
  );
}

/** The question as the renderer draws it, taking nothing: the address and a group are sketched. */
function QuestionPreview({ field }: { field: FormField }) {
  const t = useTranslations('forms.builder');
  const locale = useLocale();
  const label = localized(field.label, locale);
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
