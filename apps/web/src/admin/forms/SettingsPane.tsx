import type { FormDefinition, FormField, FormSection } from '@css/shared/forms';
import { Stack, Text, TextField } from '@css/ui';
import { useTranslations } from 'use-intl';
import type { Selection } from './OutlinePane';

/**
 * The settings of the chosen section or question. The texts (labels and option texts in both
 * languages) are what every screen width may change; the other settings come with the settings
 * editor.
 */
export function SettingsPane({
  definition,
  selected,
  onSection,
  onField,
}: {
  definition: FormDefinition;
  selected: Selection | null;
  onSection: (key: string, patch: Partial<FormSection>) => void;
  onField: (key: string, patch: Partial<FormField>) => void;
}) {
  const t = useTranslations('forms.builder');
  const section = definition.sections.find((s) => s.key === selected?.section);
  const field = section?.fields.find((f) => f.fieldKey === selected?.field);
  if (!section) return <Text tone="muted">{t('pick_hint')}</Text>;
  if (!field)
    return (
      <Stack gap={2}>
        <Texts value={section.title} onChange={(title) => onSection(section.key, { title })} />
      </Stack>
    );
  return (
    <Stack gap={2}>
      <Texts value={field.label} onChange={(label) => onField(field.fieldKey, { label })} />
      {(field.options ?? []).map((option, i) => (
        <Stack key={option.code} gap={1}>
          <TextField
            label={t('option_bn', { n: String(i + 1) })}
            value={option.label.bn}
            onChange={(bn) =>
              onField(field.fieldKey, {
                options: field.options!.map((o) =>
                  o.code === option.code ? { ...o, label: { ...o.label, bn } } : o,
                ),
              })
            }
          />
          <TextField
            label={t('option_en', { n: String(i + 1) })}
            lang="en"
            value={option.label.en}
            onChange={(en) =>
              onField(field.fieldKey, {
                options: field.options!.map((o) =>
                  o.code === option.code ? { ...o, label: { ...o.label, en } } : o,
                ),
              })
            }
          />
        </Stack>
      ))}
    </Stack>
  );
}

/** A text in both languages, each required. */
function Texts({
  value,
  onChange,
}: {
  value: { bn: string; en: string };
  onChange: (value: { bn: string; en: string }) => void;
}) {
  const t = useTranslations('forms.builder');
  return (
    <>
      <TextField
        label={t('label_bn')}
        required
        value={value.bn}
        onChange={(bn) => onChange({ ...value, bn })}
      />
      <TextField
        label={t('label_en')}
        required
        lang="en"
        value={value.en}
        onChange={(en) => onChange({ ...value, en })}
      />
    </>
  );
}
