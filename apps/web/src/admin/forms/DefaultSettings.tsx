import { type FieldDefault, type FormField, validationOf } from '@css/shared/forms';
import { Select, Stack, Switch, TextField } from '@css/ui';
import { useTranslations } from 'use-intl';
import { NumberText } from './NumberText';

type DefaultKind = 'none' | 'today' | 'text' | 'number';

/** The defaults a question of each type may start with. */
function kindsOf(field: FormField): DefaultKind[] {
  if (field.type === 'date') return ['none', 'today'];
  if (field.type === 'short_text' || field.type === 'long_text') return ['none', 'text'];
  if (field.type === 'number' || field.type === 'decimal' || field.type === 'money')
    return ['none', 'number'];
  return ['none'];
}

/** Whether a question can start with a default at all. */
export const takesDefault = (field: FormField) => kindsOf(field).length > 1;

/**
 * The value a question starts with (today's date, a fixed text, a number), and whether the person
 * may change it: a read-only question shows its default and nobody types it.
 */
export function DefaultSettings({
  field,
  onChange,
}: {
  field: FormField;
  onChange: (next: { default?: FieldDefault; read_only?: boolean }) => void;
}) {
  const t = useTranslations('forms.builder');
  const start = field.settings?.default;
  const kind: DefaultKind =
    start === undefined ? 'none' : 'today' in start ? 'today' : 'text' in start ? 'text' : 'number';
  const readOnly = field.settings?.read_only === true;
  // a number starts within the question's own limits
  const { min, max } = validationOf(field);
  const firstNumber = Math.min(Math.max(0, min ?? 0), max ?? Number.POSITIVE_INFINITY);
  const set = (next: FieldDefault | undefined) =>
    // without a default nothing can be read-only
    onChange(
      next
        ? { default: next, read_only: readOnly || undefined }
        : { default: undefined, read_only: undefined },
    );
  return (
    <Stack gap={3}>
      <Select
        label={t('default')}
        value={kind}
        onChange={(id) => {
          if (id === 'today') set({ today: true });
          else if (id === 'text') set({ text: '' });
          else if (id === 'number') set({ number: firstNumber });
          else set(undefined);
        }}
        options={kindsOf(field).map((k) => ({ id: k, label: t(`defaults.${k}`) }))}
      />
      {start !== undefined && 'text' in start ? (
        <TextField
          label={t('default_text')}
          value={start.text}
          onChange={(text) => set({ text })}
        />
      ) : null}
      {start !== undefined && 'number' in start ? (
        <NumberText
          label={t('default_number')}
          integer={field.type === 'number'}
          value={start.number}
          // an emptied box keeps the number until another is typed; "নেই" removes the default
          onChange={(n) => (n === undefined ? undefined : set({ number: n }))}
        />
      ) : null}
      <Switch
        isSelected={readOnly}
        isDisabled={start === undefined}
        onChange={(on) => onChange({ default: start, read_only: on || undefined })}
      >
        {t('read_only_answer')}
      </Switch>
    </Stack>
  );
}
