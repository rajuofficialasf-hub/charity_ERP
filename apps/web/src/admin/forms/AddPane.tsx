import { useDraggable } from '@dnd-kit/core';
import { FIELD_TYPES, type FieldType, type FormDefinition } from '@css/shared/forms';
import { Button, Disclosure, Icon, Stack, Tabs, Text, TextField, VisuallyHidden } from '@css/ui';
import { Check, Plus } from 'lucide-react';
import { type PointerEventHandler, useId, useState } from 'react';
import { useLocale, useTranslations } from 'use-intl';
import type { LibraryFields, LibrarySectionView } from './draft';
import { TYPE_DRAG } from './FormCanvas';
import type { FormLibrary } from './forms-api';
import { TYPE_GROUPS, TYPE_META, typesOfGroup } from './type-meta';

/**
 * The left pane of the builder: the question types in six groups, each a button that adds a
 * question of that type to the chosen section (or a drag that places it on the canvas), and
 * the library of ready-made questions grouped by their section with a search, where a section
 * comes whole or one question at a time. What the form holds already is marked and stays so;
 * removing is done on the canvas.
 */
export function AddPane({
  library,
  fields,
  definition,
  targetSection,
  onAddSection,
  onAddField,
  onAddType,
}: {
  library: FormLibrary;
  fields: LibraryFields;
  definition: FormDefinition;
  /** The section a new question goes to; none when the form has no section yet. */
  targetSection: string | undefined;
  onAddSection: (section: LibrarySectionView) => void;
  onAddField: (key: string) => void;
  onAddType: (type: FieldType) => void;
}) {
  const t = useTranslations('forms.builder');
  const [tab, setTab] = useState<'types' | 'library'>('types');
  return (
    <Tabs
      label={t('add_pane')}
      selectedId={tab}
      onChange={(id) => setTab(id === 'library' ? 'library' : 'types')}
      items={[
        {
          id: 'types',
          label: t('add_tab'),
          content: <TypeList canAdd={targetSection !== undefined} onAdd={onAddType} />,
        },
        {
          id: 'library',
          label: t('library_tab'),
          content: (
            <LibraryList
              library={library}
              fields={fields}
              definition={definition}
              canAddField={targetSection !== undefined}
              onAddSection={onAddSection}
              onAddField={onAddField}
            />
          ),
        },
      ]}
    />
  );
}

function TypeList({ canAdd, onAdd }: { canAdd: boolean; onAdd: (type: FieldType) => void }) {
  const t = useTranslations('forms.builder');
  return (
    <Stack gap={3}>
      <Text tone="muted">{canAdd ? t('types_hint') : t('types_need_section')}</Text>
      {TYPE_GROUPS.map((group) => (
        <div key={group} className="fb-type-group">
          <Text as="span" weight="bold" className="fb-group-title">
            {t(`type_groups.${group}`)}
          </Text>
          {typesOfGroup(group).map((type) => (
            <TypeItem key={type} type={type} disabled={!canAdd} onAdd={() => onAdd(type)} />
          ))}
        </div>
      ))}
    </Stack>
  );
}

/** One type: a press adds it to the chosen section, a pointer drag places it on the canvas. */
function TypeItem({
  type,
  disabled,
  onAdd,
}: {
  type: FieldType;
  disabled: boolean;
  onAdd: () => void;
}) {
  const t = useTranslations('forms.builder');
  const tt = useTranslations('forms.types');
  const { setNodeRef, listeners, isDragging } = useDraggable({
    id: `${TYPE_DRAG}${type}`,
    data: { type },
    disabled,
  });
  const meta = TYPE_META[type];
  const exampleId = useId();
  return (
    <button
      ref={setNodeRef}
      type="button"
      className={`fb-type${isDragging ? ' is-dragging' : ''}`}
      disabled={disabled}
      // the name is the type with "add"; the example is its description
      aria-describedby={exampleId}
      onClick={onAdd}
      // only the pointer starts a drag; the keyboard adds with the press and moves the question
      // with its buttons on the canvas
      onPointerDown={listeners?.onPointerDown as PointerEventHandler<HTMLButtonElement>}
    >
      <span className="fb-type-ic">
        <Icon icon={meta.icon} size="sm" />
      </span>
      <span className="fb-type-text">
        <span className="fb-type-name">{tt(type)}</span>
        <span id={exampleId} className="fb-type-ex" aria-hidden="true">
          {t(`type_examples.${type}`)}
        </span>
      </span>
      <span className="fb-type-plus">
        <Icon icon={Plus} size="sm" />
      </span>
      {/* the space is a text node of its own: the name joins the parts without one otherwise */}{' '}
      <VisuallyHidden>{t('add_type_suffix')}</VisuallyHidden>
    </button>
  );
}

function LibraryList({
  library,
  fields,
  definition,
  canAddField,
  onAddSection,
  onAddField,
}: {
  library: FormLibrary;
  fields: LibraryFields;
  definition: FormDefinition;
  canAddField: boolean;
  onAddSection: (section: LibrarySectionView) => void;
  onAddField: (key: string) => void;
}) {
  const t = useTranslations('forms.builder');
  const locale = useLocale();
  const [term, setTerm] = useState('');
  const [opened, setOpened] = useState<ReadonlySet<string>>(
    () => new Set(library.sections[0] ? [library.sections[0].key] : []),
  );
  const needle = term.trim();
  const has = new Set(definition.sections.map((s) => s.key));
  const keys = new Set(definition.sections.flatMap((s) => s.fields.map((f) => f.fieldKey)));
  const byKey = new Map(library.fields.map((f) => [f.key, f]));
  const match = (text: { bn: string; en: string }) =>
    !needle || text.bn.includes(needle) || text.en.toLowerCase().includes(needle.toLowerCase());
  const groups = library.sections
    .map((s) => ({
      section: s,
      questions: s.fieldKeys
        .map((key) => byKey.get(key))
        .filter((f): f is NonNullable<typeof f> => f !== undefined)
        .filter((f) => fields.has(f.key) && match(f.label)),
    }))
    .filter((g) => !needle || g.questions.length > 0);
  return (
    <Stack gap={3}>
      <TextField label={t('search')} value={term} onChange={setTerm} />
      <Text tone="muted">{t('library_hint')}</Text>
      {groups.length === 0 ? <Text tone="muted">{t('search_none')}</Text> : null}
      {groups.map(({ section, questions }) => {
        const title = section.title[locale];
        const inForm = has.has(section.key);
        return (
          <Disclosure
            key={section.key}
            title={title}
            hint={t('questions_count', { n: String(section.fieldKeys.length) })}
            headingLevel={2}
            open={needle ? true : opened.has(section.key)}
            onToggle={(open) =>
              setOpened((prev) => {
                const next = new Set(prev);
                if (open) next.add(section.key);
                else next.delete(section.key);
                return next;
              })
            }
          >
            <Stack gap={2}>
              <ul className="fb-lib-list" aria-label={t('library_list', { title })}>
                {questions.map((f) => {
                  const label = f.label[locale];
                  const meta = TYPE_META[FIELD_TYPES.find((x) => x === f.type) ?? 'short_text'];
                  return (
                    <li key={f.key} className="fb-lib-q">
                      <Icon icon={meta.icon} size="sm" />
                      <span className="fb-lib-label">{label}</span>
                      {keys.has(f.key) ? (
                        <span className="fb-lib-in">
                          <Icon icon={Check} size="sm" />
                          {t('in_form')}
                        </span>
                      ) : (
                        <Button
                          size="sm"
                          variant="ghost"
                          icon={Plus}
                          iconOnly
                          disabled={!canAddField}
                          onPress={() => onAddField(f.key)}
                        >
                          {t('add_field', { label })}
                        </Button>
                      )}
                    </li>
                  );
                })}
              </ul>
              {inForm ? (
                <Text tone="muted">{t('section_in_form')}</Text>
              ) : (
                <Button
                  size="sm"
                  variant="secondary"
                  icon={Plus}
                  fullWidth
                  onPress={() => onAddSection(section)}
                >
                  <VisuallyHidden>{title}:</VisuallyHidden> {t('add_section')}
                </Button>
              )}
            </Stack>
          </Disclosure>
        );
      })}
    </Stack>
  );
}
