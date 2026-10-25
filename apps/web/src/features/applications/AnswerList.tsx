import type { AnswerValue } from '@css/shared';
import { formatDate } from '@css/shared/format';
import type { Locale } from '@css/shared/i18n';
import type { Answer, FormDefinition, FormField } from '@css/shared/forms';
import { DescriptionList, Stack, Text } from '@css/ui';
import type { ReactNode } from 'react';
import { useLocale, useTranslations } from 'use-intl';
import { AddressNames } from '../../components/AddressNames';
import { FileImage } from '../../components/FileImage';

/** The answer of a question as text, in the reader's language. */
function shown(field: FormField, value: AnswerValue, locale: Locale, yes: string, no: string) {
  switch (value.t) {
    case 'single_select':
    case 'radio': {
      const option = field.options?.find((o) => o.code === value.v);
      const label = option ? option.label[locale] : value.v;
      return value.other ? `${label}: ${value.other}` : label;
    }
    case 'multi_select':
    case 'checkbox':
      return value.v
        .map((code) => field.options?.find((o) => o.code === code)?.label[locale] ?? code)
        .join(', ');
    case 'date':
      return formatDate(value.v);
    case 'number':
    case 'decimal':
      return String(value.v);
    case 'calculation':
      return typeof value.v === 'boolean' ? (value.v ? yes : no) : String(value.v);
    case 'gps':
      return `${value.lat}, ${value.lng}`;
    case 'bd_address':
      return (
        <AddressNames
          address={{
            divisionId: value.division_id,
            districtId: value.district_id,
            upazilaId: value.upazila_id,
            unionId: value.union_id,
          }}
        />
      );
    case 'photo':
    case 'file':
    case 'signature':
      return null;
    default:
      return 'v' in value ? String(value.v) : null;
  }
}

/**
 * The answers of an application as a reader sees them: every question of the form (the caller's
 * audience) that has an answer, by section, with photos drawn from the file service.
 */
export function AnswerList({ form, answers }: { form: FormDefinition; answers: Answer[] }) {
  const t = useTranslations('applications.detail');
  const tr = useTranslations('forms.renderer');
  const locale = useLocale() as Locale;
  const byKey = new Map(answers.map((a) => [`${a.fieldKey}#${a.repeatIndex ?? 0}`, a.value]));
  type Item =
    | { kind: 'text'; label: string; text: ReactNode }
    | { kind: 'photos'; key: string; label: string; ids: string[] };
  const sections = form.sections
    .map((section) => ({
      section,
      items: section.fields.flatMap((field): Item[] => {
        const value = byKey.get(`${field.fieldKey}#0`);
        if (!value || field.type === 'note' || field.type === 'repeat_group') return [];
        const label = field.label[locale];
        if (
          'v' in value &&
          Array.isArray(value.v) &&
          (value.t === 'photo' || value.t === 'file' || value.t === 'signature')
        )
          return [{ kind: 'photos', key: field.fieldKey, label, ids: value.v }];
        const text = shown(field, value, locale, tr('yes'), tr('no'));
        return text === null ? [] : [{ kind: 'text', label, text }];
      }),
    }))
    .filter((s) => s.items.length);
  if (!sections.length) return <Text tone="muted">{t('no_answers')}</Text>;
  return (
    <Stack gap={3}>
      {sections.map(({ section, items }) => (
        <Stack key={section.key} gap={2} as="section" aria-labelledby={`answers-${section.key}`}>
          <Text as="strong" id={`answers-${section.key}`} weight="bold">
            {section.title[locale]}
          </Text>
          <DescriptionList
            labelWidth="md"
            items={items.flatMap((i) =>
              i.kind === 'text' ? [{ label: i.label, value: i.text }] : [],
            )}
          />
          {items
            .flatMap((i) => (i.kind === 'photos' ? [i] : []))
            .map((i) => (
              <Stack key={i.key} gap={1}>
                <Text weight="bold">{i.label}</Text>
                <div className="my-application-photos">
                  {i.ids.map((fileId) => (
                    <FileImage key={fileId} fileId={fileId} alt={t('photo_alt')} />
                  ))}
                </div>
              </Stack>
            ))}
        </Stack>
      ))}
    </Stack>
  );
}
