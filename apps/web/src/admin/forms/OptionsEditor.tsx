import type { FieldOption, FormField } from '@css/shared/forms';
import { Button, Checkbox, Select, Stack, Text, TextField } from '@css/ui';
import { ArrowDown, ArrowUp, Plus, Trash2 } from 'lucide-react';
import { useLocale, useTranslations } from 'use-intl';

/** The id the "always" choice of a branching option takes in its list. */
const ALWAYS = '*';

/** A code no option of the list has yet; the code is never shown and never changes. */
function freshCode(options: readonly FieldOption[]): string {
  const taken = new Set(options.map((o) => o.code));
  for (let n = options.length + 1; ; n += 1) if (!taken.has(`opt_${n}`)) return `opt_${n}`;
}

/**
 * The options of a choice question: the text of each in both languages and, on a computer, the
 * option that opens a text box ("other"), the earlier answer an option follows when the question
 * branches, the order, and adding or removing options. On a phone only the texts change.
 */
export function OptionsEditor({
  options,
  onChange,
  mode,
  parent,
}: {
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
    <Stack as="section" gap={2} aria-label={t('options')}>
      <Text weight="bold">{t('options')}</Text>
      {options.map((option, i) => {
        const n = String(i + 1);
        return (
          <Stack key={option.code} gap={1} className="form-settings-row">
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
                  isSelected={option.allowsOtherText === true}
                  onChange={(on) => change(i, { allowsOtherText: on })}
                >
                  {t('option_other', { n })}
                </Checkbox>
                {parent ? (
                  <Select
                    label={t('option_depends', { n, question: parent.label[locale] })}
                    value={option.dependsOnOptionCode ?? ALWAYS}
                    onChange={(id) =>
                      change(i, { dependsOnOptionCode: !id || id === ALWAYS ? null : id })
                    }
                    options={[
                      { id: ALWAYS, label: t('option_always') },
                      ...(parent.options ?? []).map((p) => ({
                        id: p.code,
                        label: p.label[locale],
                      })),
                    ]}
                  />
                ) : null}
                <Stack direction="row" gap={1}>
                  <Button
                    size="sm"
                    variant="ghost"
                    icon={ArrowUp}
                    iconOnly
                    disabled={i === 0}
                    onPress={() => move(i, -1)}
                  >
                    {t('option_move_up', { n })}
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    icon={ArrowDown}
                    iconOnly
                    disabled={i === options.length - 1}
                    onPress={() => move(i, 1)}
                  >
                    {t('option_move_down', { n })}
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    icon={Trash2}
                    iconOnly
                    onPress={() => onChange(options.filter((_, j) => j !== i))}
                  >
                    {t('option_remove', { n })}
                  </Button>
                </Stack>
              </>
            ) : null}
          </Stack>
        );
      })}
      {full ? (
        <Button
          size="sm"
          variant="secondary"
          icon={Plus}
          onPress={() =>
            onChange([
              ...options,
              {
                code: freshCode(options),
                label: { bn: '', en: '' },
                dependsOnOptionCode: null,
                allowsOtherText: false,
              },
            ])
          }
        >
          {t('option_add')}
        </Button>
      ) : null}
    </Stack>
  );
}
