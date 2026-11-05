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
import { type ReactNode, useId, useState } from 'react';
import { useLocale, useTranslations } from 'use-intl';
import { FieldInput } from '../../features/forms/FieldInput';
import { moveField, moveFieldTo, moveSection, removeSection } from './draft';
import { dropTarget, SECTION_DROP, typeFromDragId } from './drop-target';
import type { BuilderMode, Selection } from './selection';
import { TYPE_META } from './type-meta';

const groupOf = (field: FormField) => field.settings?.repeat?.group;

/**
 * The drag context around the panes: a question moves by its handle inside or across sections,
 * and a type from the left pane drops at a place, where the dialog then asks for its texts. The
 * keyboard moves a question with the buttons of its bar instead.
 */
export function CanvasDnd({
  definition,
  onChange,
  onDropType,
  children,
}: {
  definition: FormDefinition;
  onChange: (definition: FormDefinition) => void;
  /** A type dropped on a section at a block index. */
  onDropType: (type: FieldType, sectionKey: string, index: number) => void;
  children: ReactNode;
}) {
  const tt = useTranslations('forms.types');
  const [activeType, setActiveType] = useState<FieldType | null>(null);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  const started = (event: DragStartEvent) =>
    setActiveType(typeFromDragId(String(event.active.id)) ?? null);
  const dropped = (event: DragEndEvent) => {
    setActiveType(null);
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
      onDragCancel={() => setActiveType(null)}
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
 * the chosen one shows its type with the move, copy and remove buttons, a handle drags a
 * question to another place or section (the keyboard moves it with the buttons), and each
 * section ends with the way to add a question to it.
 */
export function FormCanvas({
  definition,
  mode,
  errors,
  selected,
  onSelect,
  onChange,
  onRemoveField,
  onCopyField,
  onAddTo,
  onAddRow,
  onAddSection,
}: {
  definition: FormDefinition;
  mode: BuilderMode;
  errors: Record<string, string>;
  selected: Selection | null;
  onSelect: (selection: Selection) => void;
  onChange: (definition: FormDefinition) => void;
  onRemoveField: (fieldKey: string) => void;
  onCopyField: (fieldKey: string) => void;
  /** The person wants a question in this section: the left pane takes over. */
  onAddTo: (sectionKey: string) => void;
  /** The person wants a question in this group's rows: the group is chosen for the left pane. */
  onAddRow: (groupKey: string) => void;
  /** The person wants a new empty section at the end of the form. */
  onAddSection: () => void;
}) {
  const t = useTranslations('forms.builder');
  const body = definition.sections.map((s, i) => (
    <SectionCard
      key={s.key}
      section={s}
      index={i}
      count={definition.sections.length}
      mode={mode}
      errors={errors}
      selected={selected}
      onSelect={onSelect}
      onMoveSection={(dir) => onChange(moveSection(definition, s.key, dir))}
      onRemoveSection={() => onChange(removeSection(definition, s.key))}
      onMoveField={(key, dir) => onChange(moveField(definition, s.key, key, dir))}
      onRemoveField={onRemoveField}
      onCopyField={onCopyField}
      onAddTo={() => onAddTo(s.key)}
      onAddRow={onAddRow}
    />
  ));
  return (
    <section aria-label={t('outline')}>
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
  errors: Record<string, string>;
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
  const title = section.title[locale];
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
      error={errors[f.fieldKey]}
      memberErrors={errors}
      selected={selected?.field ?? null}
      onSelect={(key) => onSelect({ section: section.key, field: key })}
      onMove={(dir) => onMoveField(f.fieldKey, dir)}
      onMoveMember={(key, dir) => onMoveField(key, dir)}
      onRemove={() => onRemoveField(f.fieldKey)}
      onAddRow={() => onAddRow(f.fieldKey)}
      onCopy={() => onCopyField(f.fieldKey)}
    />
  ));
  return (
    <section
      ref={setNodeRef}
      className={`fb-sec${isOver ? ' is-over' : ''}${selected?.section === section.key && !selected.field ? ' is-selected' : ''}`}
      aria-label={title}
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
              {
                id: 'remove',
                label: t('remove', { label: title }),
                icon: 'delete' as const,
                onSelect: onRemoveSection,
              },
            ]}
          />
        ) : null}
      </div>
      {errors[section.key] ? <Alert tone="error">{errors[section.key]}</Alert> : null}
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
  error,
  memberErrors,
  selected,
  onSelect,
  onMove,
  onMoveMember,
  onRemove,
  onCopy,
  onAddRow,
}: {
  field: FormField;
  members: FormField[];
  first: boolean;
  last: boolean;
  mode: BuilderMode;
  error?: string;
  memberErrors: Record<string, string>;
  selected: string | null;
  onSelect: (fieldKey: string) => void;
  onMove: (direction: -1 | 1) => void;
  onMoveMember: (fieldKey: string, direction: -1 | 1) => void;
  onRemove: () => void;
  onCopy: () => void;
  onAddRow: () => void;
}) {
  const t = useTranslations('forms.builder');
  const tt = useTranslations('forms.types');
  const locale = useLocale();
  const full = mode === 'full';
  const label = field.label[locale];
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
        <QuestionTags field={field} />
        {error ? <Alert tone="error">{error}</Alert> : null}
        {members.length ? (
          <ul aria-label={t('members_of', { label })} className="fb-q-members">
            {members.map((m, i) => (
              <MemberRow
                key={m.fieldKey}
                field={m}
                first={i === 0}
                last={i === members.length - 1}
                mode={mode}
                error={memberErrors[m.fieldKey]}
                selected={selected === m.fieldKey}
                onSelect={() => onSelect(m.fieldKey)}
                onMove={(dir) => onMoveMember(m.fieldKey, dir)}
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
  error,
  selected,
  onSelect,
  onMove,
}: {
  field: FormField;
  first: boolean;
  last: boolean;
  mode: BuilderMode;
  error?: string;
  selected: boolean;
  onSelect: () => void;
  onMove: (direction: -1 | 1) => void;
}) {
  const t = useTranslations('forms.builder');
  const locale = useLocale();
  const label = field.label[locale];
  return (
    <li className={`fb-q fb-q-member${selected ? ' is-selected' : ''}`}>
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
        <QuestionTags field={field} />
        {error ? <Alert tone="error">{error}</Alert> : null}
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
        </div>
      ) : null}
    </li>
  );
}

/** The question as the renderer draws it, taking nothing: the address and a group are sketched. */
function QuestionPreview({ field }: { field: FormField }) {
  const t = useTranslations('forms.builder');
  const locale = useLocale();
  const label = field.label[locale];
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

function QuestionTags({ field }: { field: FormField }) {
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
  if (!shown.length) return null;
  return (
    <div className="fb-q-tags">
      {shown.map((tag) => (
        <span key={tag.text} className={`fb-tag fb-tag-${tag.tone}`}>
          <Icon name={tag.icon} size={16} />
          {tag.text}
        </span>
      ))}
    </div>
  );
}
