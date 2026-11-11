import type { FieldOption, FormField } from '@css/shared/forms';
import { localized } from '@css/shared/i18n';
import { Button, Checkbox, SelectField, Stack, Text, TextField } from '@/ui';
import { useLocale, useTranslations } from 'use-intl';
import { RowButtons } from './RowButtons';

/** The id the "always" choice of a branching option takes in its list. */
const ALWAYS = '*';

/**
 * A code for a new option, never shown and never changed. It is random rather than counted, so
 * an option removed and another added never share a code, and an answer stored under the old one
 * in an earlier version never reads as the new option.
 */
function freshCode(options: readonly FieldOption[]): string {
  const taken = new Set(options.map((o) => o.code));
  for (;;) {
    const code = `opt_${crypto.randomUUID().replace(/-/g, '').slice(0, 12)}`;
    if (!taken.has(code)) return code;
  }
}

/** A new option to fill in, after the ones a question has. */
export const emptyOption = (options: readonly FieldOption[]): FieldOption => ({
  code: freshCode(options),
  label: { bn: '', en: '' },
  dependsOnOptionCode: null,
  allowsOtherText: false,
});

/**
 * The options of a choice question: the text of each in both languages and, on a computer, the
 * option that opens a text box ("other"), the earlier answer an option follows when the question
 * branches, the order, and adding or removing options. On a phone only the texts change.
 */
export function OptionsEditor({
  heading = true,
  options,
  onChange,
  mode,
  parent,
}: {
  /** false inside a group that already shows the title. */
  heading?: boolean;
  options: readonly FieldOption[];
  onChange: (options: FieldOption[]) => void;
  mode: 'full' | 'texts';
  /** The earlier question whose answer decides which options show, when the question branches. */
  parent?: FormField | null;
}) {
  const t = useTranslations('forms.builder');
  const locale = useLocale();
  const full = mode === 'full';
  const change = (index: number, patch: Partial<FieldOption>) =>
    onChange(options.map((o, i) => (i === index ? { ...o, ...patch } : o)));
  const move = (index: number, direction: -1 | 1) => {
    const next = [...options];
    [next[index], next[index + direction]] = [next[index + direction]!, next[index]!];
    onChange(next);
  };
  return (
    <div>
      <Stack gap={2}>
        {heading ? (
          <Text>
            <strong>{t('options')}</strong>
          </Text>
        ) : null}
        {options.map((option, i) => {
          const n = String(i + 1);
          return (
            <div key={option.code} className="form-settings-row">
              <Stack gap={1}>
                <TextField
                  label={t('option_bn', { n })}
                  required
                  value={option.label.bn}
                  onChange={(bn) => change(i, { label: { ...option.label, bn } })}
                />
                <TextField
                  label={t('option_en', { n })}
                  required
                  lang="en"
                  value={option.label.en}
                  onChange={(en) => change(i, { label: { ...option.label, en } })}
                />
                {full ? (
                  <>
                    <Checkbox
                      label={t('option_other', { n })}
                      checked={option.allowsOtherText === true}
                      onChange={(on) => change(i, { allowsOtherText: on })}
                    />
                    {parent ? (
                      <SelectField
                        label={t('option_depends', {
                          n,
                          question: localized(parent.label, locale),
                        })}
                        value={option.dependsOnOptionCode ?? ALWAYS}
                        onChange={(id) =>
                          change(i, { dependsOnOptionCode: !id || id === ALWAYS ? null : id })
                        }
                        options={[
                          { value: ALWAYS, label: t('option_always') },
                          ...(parent.options ?? []).map((p) => ({
                            value: p.code,
                            label: localized(p.label, locale),
                          })),
                        ]}
                      />
                    ) : null}
                    <RowButtons
                      up={{
                        label: t('option_move_up', { n }),
                        disabled: i === 0,
                        onPress: () => move(i, -1),
                      }}
                      down={{
                        label: t('option_move_down', { n }),
                        disabled: i === options.length - 1,
                        onPress: () => move(i, 1),
                      }}
                      remove={{
                        label: t('option_remove', { n }),
                        onPress: () => onChange(options.filter((_, j) => j !== i)),
                      }}
                    />
                  </>
                ) : null}
              </Stack>
            </div>
          );
        })}
        {full ? (
          <Button
            size="small"
            variant="secondary"
            startIcon="add"
            onClick={() => onChange([...options, emptyOption(options)])}
          >
            {t('option_add')}
          </Button>
        ) : null}
      </Stack>
    </div>
  );
}
