import { useDraggable } from '@dnd-kit/core';
import type { FieldType, FormDefinition } from '@css/shared/forms';
import { localized } from '@css/shared/i18n';
import { Button, Disclosure, Icon, IconButton, Stack, Tabs, Text, TextField } from '@/ui';
import { type PointerEventHandler, useId, useState } from 'react';
import { useLocale, useTranslations } from 'use-intl';
import type { LibraryFields, LibrarySectionView } from './draft';
import { TYPE_DRAG } from './drop-target';
import type { FormLibrary } from './forms-api';
import { TYPE_GROUPS, TYPE_META, typesOfGroup } from './type-meta';

/**
 * The left pane of the builder: the question types in six groups, each a button that adds an
 * empty question of that type after the chosen question or at the end of the chosen section (or
 * a drag that places it on the canvas), and the library of ready-made questions grouped by their
 * section with a search, where a section comes whole or one question at a time. What the form
 * holds already is marked and stays so; removing is done on the canvas.
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
      value={tab}
      onChange={(id) => setTab(id === 'library' ? 'library' : 'types')}
      items={[
        {
          value: 'types',
          label: t('add_tab'),
          content: <TypeList canAdd={targetSection !== undefined} onAdd={onAddType} />,
        },
        {
          value: 'library',
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
          <strong className="fb-group-title">{t(`type_groups.${group}`)}</strong>
          {typesOfGroup(group).map((type) => (
            <TypeItem key={type} type={type} disabled={!canAdd} onAdd={() => onAdd(type)} />
          ))}
        </div>
      ))}
    </Stack>
  );
}

/** One type: a press adds it where the person works, a pointer drag places it on the canvas. */
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
        <Icon name={meta.icon} size={16} />
      </span>
      <span className="fb-type-text">
        <span className="fb-type-name">{tt(type)}</span>
        <span id={exampleId} className="fb-type-ex" aria-hidden="true">
          {t(`type_examples.${type}`)}
        </span>
      </span>
      <span className="fb-type-plus">
        <Icon name="add" size={16} />
      </span>
      {/* the space is a text node of its own: the name joins the parts without one otherwise */}{' '}
      <span className="app-sr-only">{t('add_type_suffix')}</span>
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
  // a search finds a section by its title with all its questions, or the questions by theirs
  const groups = library.sections
    .map((s) => ({
      section: s,
      questions: s.fieldKeys
        .map((key) => byKey.get(key))
        .filter((f): f is NonNullable<typeof f> => f !== undefined)
        .filter((f) => fields.has(f.key) && (match(s.title) || match(f.label))),
    }))
    .filter((g) => !needle || g.questions.length > 0);
  // nothing to search in is said as that, not as a search without a find
  const empty = !needle && groups.every((g) => g.questions.length === 0);
  return (
    <Stack gap={3}>
      <TextField label={t('search')} value={term} onChange={setTerm} />
      <Text tone="muted">{t('library_hint')}</Text>
      {empty ? <Text tone="muted">{t('library_empty')}</Text> : null}
      {needle && groups.length === 0 ? <Text tone="muted">{t('search_none')}</Text> : null}
      {groups.map(({ section, questions }) => {
        const title = localized(section.title, locale);
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
                  const label = localized(f.label, locale);
                  const meta = TYPE_META[f.type];
                  return (
                    <li key={f.key} className="fb-lib-q">
                      <Icon name={meta.icon} size={16} />
                      <span className="fb-lib-label">{label}</span>
                      {keys.has(f.key) ? (
                        <span className="fb-lib-in">
                          <Icon name="check" size={16} />
                          {t('in_form')}
                        </span>
                      ) : (
                        <IconButton
                          label={t('add_field', { label })}
                          icon="add"

                          disabled={!canAddField}
                          onClick={() => onAddField(f.key)}
                        />
                      )}
                    </li>
                  );
                })}
              </ul>
              {inForm ? (
                <Text tone="muted">{t('section_in_form')}</Text>
              ) : (
                <Button
                  size="small"
                  variant="secondary"
                  startIcon="add"
                  fullWidth
                  onClick={() => onAddSection(section)}
                >
                  <span className="app-sr-only">{title}:</span> {t('add_section')}
                </Button>
              )}
            </Stack>
          </Disclosure>
        );
      })}
    </Stack>
  );
}
