import { type Locale, localized } from '@css/shared/i18n';
import { Alert, Button, Checkbox, CheckboxGroup, Stack, Text, TextField } from '@/ui';
import { useLocale, useTranslations } from 'use-intl';
import { useMemo, useState } from 'react';
import { formatCount } from '@css/shared/format';
import type { ExportColumnView } from './exports-api';

interface ColumnPickerProps {
  columns: readonly ExportColumnView[];
  value: readonly string[];
  onChange: (ids: string[]) => void;
}

/** The chosen ids in the catalogue's order, which is the file's. */
const inOrder = (columns: readonly ExportColumnView[], picked: ReadonlySet<string>) =>
  columns.filter((c) => picked.has(c.id)).map((c) => c.id);

/**
 * The columns of an export, in groups: the list's own, the record's further details, and on an
 * application list the form questions by section, each section with "select the whole section"
 * and a search over the question texts. A protected column carries its badge.
 */
export function ColumnPicker({ columns, value, onChange }: ColumnPickerProps) {
  const t = useTranslations('exports.dialog');
  const locale = useLocale() as Locale;
  const [search, setSearch] = useState('');
  const picked = useMemo(() => new Set(value), [value]);
  const set = (next: Set<string>) => onChange(inOrder(columns, next));
  const labelOf = (c: ExportColumnView) =>
    c.protected ? `${localized(c.label, locale)} (${t('protected')})` : localized(c.label, locale);

  const group = (kind: 'list' | 'detail') => columns.filter((c) => c.group === kind);
  const sections = useMemo(() => {
    const found = new Map<string, { title: string; columns: ExportColumnView[] }>();
    for (const c of columns.filter((col) => col.group === 'question')) {
      const key = c.section?.key ?? '';
      const entry = found.get(key) ?? {
        title: c.section ? localized(c.section.title, locale) : t('group_questions'),
        columns: [],
      };
      entry.columns.push(c);
      found.set(key, entry);
    }
    return [...found.entries()];
  }, [columns, locale, t]);
  const term = search.trim().toLowerCase();
  const matches = (c: ExportColumnView) =>
    !term || localized(c.label, locale).toLowerCase().includes(term);

  /** One group's checkboxes; the other groups' choices stay as they are. */
  const groupBox = (label: string, members: readonly ExportColumnView[]) =>
    members.length === 0 ? null : (
      <CheckboxGroup
        label={label}
        options={members.map((c) => ({ value: c.id, label: labelOf(c) }))}
        value={members.filter((c) => picked.has(c.id)).map((c) => c.id)}
        onChange={(ids) => {
          const next = new Set(picked);
          for (const c of members) next.delete(c.id);
          for (const id of ids) next.add(id);
          set(next);
        }}
        columns={2}
      />
    );

  return (
    <Stack gap={3}>
      <Stack direction="row" wrap gap={2} align="center" justify="between">
        <Text tone="muted">{t('chosen', { count: formatCount(value.length, locale) })}</Text>
        <Stack direction="row" gap={2}>
          <Button
            variant="secondary"
            size="small"
            onClick={() => set(new Set(columns.map((c) => c.id)))}
          >
            {t('select_all')}
          </Button>
          <Button variant="secondary" size="small" onClick={() => set(new Set())}>
            {t('select_none')}
          </Button>
        </Stack>
      </Stack>
      {groupBox(t('group_list'), group('list'))}
      {groupBox(t('group_detail'), group('detail'))}
      {sections.length > 0 && (
        <Stack gap={3}>
          <Text>
            <strong>{t('group_questions')}</strong>
          </Text>
          <TextField label={t('search_questions')} value={search} onChange={setSearch} />
          {sections.map(([key, section]) => {
            const shown = section.columns.filter(matches);
            if (shown.length === 0) return null;
            const all = section.columns.every((c) => picked.has(c.id));
            const some = section.columns.some((c) => picked.has(c.id));
            return (
              <Stack key={key} gap={2}>
                <Checkbox
                  label={t('whole_section', { section: section.title })}
                  checked={all}
                  indeterminate={some && !all}
                  onChange={(on) => {
                    const next = new Set(picked);
                    for (const c of section.columns) {
                      if (on) next.add(c.id);
                      else next.delete(c.id);
                    }
                    set(next);
                  }}
                />
                {groupBox(section.title, shown)}
              </Stack>
            );
          })}
          {term && sections.every(([, s]) => !s.columns.some(matches)) && (
            <Text tone="muted">{t('no_question_found')}</Text>
          )}
        </Stack>
      )}
      {value.length > 0 && columns.some((c) => c.protected && picked.has(c.id)) && (
        <Alert tone="info">{t('sensitive_note')}</Alert>
      )}
    </Stack>
  );
}
