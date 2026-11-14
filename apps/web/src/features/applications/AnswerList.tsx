import type { AnswerValue } from '@css/shared';
import { formatDate } from '@css/shared/format';
import type { Locale } from '@css/shared/i18n';
import { type Answer, type FormDefinition, type FormField, resultLabelOf } from '@css/shared/forms';
import { DescriptionList, Stack, Text } from '@/ui';
import type { ReactNode } from 'react';
import { useLocale, useTranslations } from 'use-intl';
import { AddressNames } from '../../components/AddressNames';
import { FileImage } from '../../components/FileImage';
import { ThroughVolunteerChip } from '../../components/PersonMarks';
import { QuestionTitle } from '../forms/QuestionTitle';

/** The answer of a question as text, in the reader's language; null for photos and files. */
export function answerText(
  field: FormField,
  value: AnswerValue,
  locale: Locale,
  yes: string,
  no: string,
): ReactNode {
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
    case 'calculation': {
      if (typeof value.v === 'boolean') return value.v ? yes : no;
      const result = typeof value.v === 'string' ? resultLabelOf(field, value.v) : null;
      return result ? result[locale] : String(value.v);
    }
    case 'number_table': {
      // one line per row: the row, then each column's number
      const cells = new Map(Object.entries(value.v));
      return (field.settings?.table?.rows ?? [])
        .flatMap((row) => {
          const line = new Map(Object.entries(cells.get(row.key) ?? {}));
          const parts = (field.settings?.table?.cols ?? []).flatMap((col) => {
            const n = line.get(col.key);
            return n === undefined ? [] : [`${col.label[locale]} ${n}`];
          });
          return parts.length ? [`${row.label[locale]}: ${parts.join(', ')}`] : [];
        })
        .join('; ');
    }
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
 * audience) that has an answer, by section, with photos drawn from the file service; `action`
 * draws a control beside an answer (the office's "সংশোধনের জন্য খুলুন"). With `throughVolunteer`
 * the person has no mobile of their own, and the mobile question without an answer says so in the
 * place of the number. With `guardianRelation` (`father` or `husband`) the question of the father's
 * or husband's name is labelled the father's or the husband's name.
 */
export function AnswerList({
  form,
  answers,
  action,
  throughVolunteer = false,
  guardianRelation = null,
}: {
  form: FormDefinition;
  answers: Answer[];
  action?: (field: FormField) => ReactNode;
  throughVolunteer?: boolean;
  guardianRelation?: string | null;
}) {
  const t = useTranslations('applications.detail');
  const tr = useTranslations('forms.renderer');
  const locale = useLocale() as Locale;
  const byKey = new Map(answers.map((a) => [`${a.fieldKey}#${a.repeatIndex ?? 0}`, a.value]));
  type Item =
    | { kind: 'text'; label: string; text: ReactNode; field: FormField }
    | { kind: 'photos'; key: string; label: string; ids: string[] };
  const sections = form.sections
    .map((section) => ({
      section,
      items: section.fields.flatMap((field): Item[] => {
        const value = byKey.get(`${field.fieldKey}#0`);
        const label =
          field.standardColumn === 'father_or_husband_name' && guardianRelation === 'father'
            ? t('father_name')
            : field.standardColumn === 'father_or_husband_name' && guardianRelation === 'husband'
              ? t('husband_name')
              : field.label[locale];
        if (!value && throughVolunteer && field.standardColumn === 'mobile')
          return [{ kind: 'text', label, text: <ThroughVolunteerChip />, field }];
        if (!value || field.type === 'note' || field.type === 'repeat_group') return [];
        if (
          'v' in value &&
          Array.isArray(value.v) &&
          (value.t === 'photo' || value.t === 'file' || value.t === 'signature')
        )
          return [{ kind: 'photos', key: field.fieldKey, label, ids: value.v }];
        const text = answerText(field, value, locale, tr('yes'), tr('no'));
        return text === null ? [] : [{ kind: 'text', label, text, field }];
      }),
    }))
    .filter((s) => s.items.length);
  if (!sections.length) return <Text tone="muted">{t('no_answers')}</Text>;
  return (
    <Stack gap={3}>
      {sections.map(({ section, items }) => (
        <section key={section.key} aria-labelledby={`answers-${section.key}`}>
          <Stack gap={2}>
            <strong id={`answers-${section.key}`}>{section.title[locale]}</strong>
            <DescriptionList
              items={items.flatMap((i) => {
                if (i.kind !== 'text') return [];
                const extra = action?.(i.field);
                return [
                  {
                    label: i.label,
                    value: extra ? (
                      <span className="answer-with-action">
                        <span>{i.text}</span>
                        {extra}
                      </span>
                    ) : (
                      i.text
                    ),
                  },
                ];
              })}
            />
            {items
              .flatMap((i) => (i.kind === 'photos' ? [i] : []))
              .map((i) => (
                <Stack key={i.key} gap={1}>
                  <QuestionTitle>{i.label}</QuestionTitle>
                  <div className="my-application-photos">
                    {i.ids.map((fileId) => (
                      <FileImage key={fileId} fileId={fileId} alt={t('photo_alt')} />
                    ))}
                  </div>
                </Stack>
              ))}
          </Stack>
        </section>
      ))}
    </Stack>
  );
}
