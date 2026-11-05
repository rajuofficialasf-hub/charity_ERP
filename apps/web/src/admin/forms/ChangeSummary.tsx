import type { FormDefinition } from '@css/shared/forms';
import { Text } from '@/ui';
import { useLocale, useTranslations } from 'use-intl';
import { type Change, diffDefinitions, type FieldAspect, type SectionAspect } from './diff';

/**
 * The change summary of a version as sentences in the reader's language: what was added,
 * removed, moved or changed since the version before it. The first version has no summary.
 */
export function useChangeSentences() {
  const t = useTranslations('forms.builder.summary');
  const locale = useLocale();
  const aspects = (what: readonly (FieldAspect | SectionAspect)[]) =>
    what.map((w) => t(`aspects.${w}`)).join(', ');
  const sentence = (c: Change): string => {
    switch (c.kind) {
      case 'scoring_changed':
        return t('scoring_changed');
      case 'section_added':
      case 'section_removed':
      case 'section_moved':
        return t(c.kind, { title: c.title[locale] });
      case 'section_changed':
        return t(c.kind, { title: c.title[locale], what: aspects(c.what) });
      case 'field_added':
      case 'field_removed':
      case 'field_moved':
        return t(c.kind, { label: c.label[locale] });
      case 'field_changed':
        return t(c.kind, { label: c.label[locale], what: aspects(c.what) });
      case 'option_added':
      case 'option_removed':
        return t(c.kind, { label: c.label[locale], option: c.optionLabel[locale] });
    }
  };
  return (before: FormDefinition | null, after: FormDefinition): string[] =>
    before ? diffDefinitions(before, after).map(sentence) : [];
}

export function ChangeSummary({
  before,
  after,
}: {
  before: FormDefinition | null;
  after: FormDefinition;
}) {
  const t = useTranslations('forms.builder.summary');
  const sentences = useChangeSentences()(before, after);
  if (!before) return <Text tone="muted">{t('first')}</Text>;
  if (!sentences.length) return <Text tone="muted">{t('none')}</Text>;
  return (
    <ul className="form-settings-list" aria-label={t('title')}>
      {sentences.map((s, i) => (
        <li key={i}>{s}</li>
      ))}
    </ul>
  );
}
