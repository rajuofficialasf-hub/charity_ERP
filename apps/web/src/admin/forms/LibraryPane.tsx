import type { FormDefinition } from '@css/shared/forms';
import { Checkbox, Stack, Text, TextField } from '@css/ui';
import { useState } from 'react';
import { useLocale, useTranslations } from 'use-intl';
import type { LibraryFields, LibrarySectionView } from './draft';
import type { FormLibrary } from './forms-api';

/**
 * The section and field libraries with a search: a tick adds a section with its fields, or one
 * field at the end of the chosen section. What the form holds already shows ticked and stays so;
 * removing is done in the outline.
 */
export function LibraryPane({
  library,
  fields,
  definition,
  editable,
  fieldsEditable,
  onAddSection,
  onAddField,
}: {
  library: FormLibrary;
  fields: LibraryFields;
  definition: FormDefinition;
  editable: boolean;
  /** Whether a field can be placed: the form has a section to place it in. */
  fieldsEditable: boolean;
  onAddSection: (section: LibrarySectionView) => void;
  onAddField: (key: string) => void;
}) {
  const t = useTranslations('forms.builder');
  const locale = useLocale();
  const [term, setTerm] = useState('');
  const has = new Set(definition.sections.map((s) => s.key));
  const keys = new Set(definition.sections.flatMap((s) => s.fields.map((f) => f.fieldKey)));
  const match = (text: { bn: string; en: string }) =>
    !term.trim() ||
    text.bn.includes(term.trim()) ||
    text.en.toLowerCase().includes(term.trim().toLowerCase());
  const sections = library.sections.filter((s) => match(s.title));
  const libraryFields = library.fields.filter((f) => match(f.label) && fields.has(f.key));
  return (
    <Stack as="section" gap={3} aria-label={t('library')}>
      <TextField label={t('search')} value={term} onChange={setTerm} />
      <Stack gap={2}>
        <Text weight="bold">{t('library')}</Text>
        <Text tone="muted">{t('library_hint')}</Text>
        {sections.map((s) => (
          <Checkbox
            key={s.key}
            isSelected={has.has(s.key)}
            isDisabled={!editable || has.has(s.key)}
            onChange={(on) => on && onAddSection(s)}
          >
            {s.title[locale]}
          </Checkbox>
        ))}
      </Stack>
      <Stack gap={2}>
        <Text weight="bold">{t('library_fields')}</Text>
        <Text tone="muted">{t('library_fields_hint')}</Text>
        {libraryFields.map((f) => (
          <Checkbox
            key={f.key}
            isSelected={keys.has(f.key)}
            isDisabled={!editable || !fieldsEditable || keys.has(f.key)}
            onChange={(on) => on && onAddField(f.key)}
          >
            {f.label[locale]}
          </Checkbox>
        ))}
      </Stack>
    </Stack>
  );
}
