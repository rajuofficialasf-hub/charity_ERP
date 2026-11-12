import { DEFINITION_LIMITS, type FieldOption, type FormField } from '@css/shared/forms';
import { localized } from '@css/shared/i18n';
import { Button, Checkbox, IconButton, SelectField, Stack, Text, TextField } from '@/ui';
import { type ClipboardEvent, type KeyboardEvent, useEffect, useId, useRef, useState } from 'react';
import { useLocale, useTranslations } from 'use-intl';
import {
  emptyOption,
  insertOptionAfter,
  type MakeKey,
  pastedLines,
  pasteOptions,
  yesNoOptions,
} from './draft';
import { RowButtons } from './RowButtons';
import { TYPED, type Typed } from './use-draft-history';

/** The id the "always" choice of a branching option takes in its list. */
const ALWAYS = '*';
const LANGUAGES = ['bn', 'en'] as const;
type Language = (typeof LANGUAGES)[number];

/**
 * The options of a choice question, one row each: the text in both languages side by side and,
 * on a computer, the icon buttons that move the option up or down and remove it, and one that
 * opens the option's further settings under the row (the text box an "other" option opens, and
 * the earlier answer an option follows when the question branches; open by themselves where they
 * are in use). Enter in a text adds an option right after it with the cursor in its Bengali text;
 * Backspace in the Bengali text of an option with no text removes it; several lines pasted into a
 * Bengali text become one option each, and into an English text the English of that option and
 * the ones after it; an empty list offers "yes" and "no" in one press. A new option's code is
 * random, never made from its text. On a phone only the texts change.
 */
export function OptionsEditor({
  heading = true,
  options,
  onChange,
  mode,
  parent,
  makeCode,
}: {
  /** false inside a group that already shows the title. */
  heading?: boolean;
  options: readonly FieldOption[];
  /** `how` says a text was typed, so the history joins it to the typing just before it. */
  onChange: (options: FieldOption[], how?: Typed) => void;
  mode: 'full' | 'texts';
  /** The earlier question whose answer decides which options show, when the question branches. */
  parent?: FormField | null;
  /** Makes the code of a new option; random unless a test hands in its own. */
  makeCode?: MakeKey;
}) {
  const t = useTranslations('forms.builder');
  const locale = useLocale();
  const base = useId();
  const addId = `${base}-add`;
  const full = mode === 'full';
  // the further settings the person opened or closed by hand, by the option's code
  const [more, setMore] = useState<ReadonlyMap<string, boolean>>(new Map());
  // the text that takes the cursor once the list is drawn again
  const focusNext = useRef<string | null>(null);
  useEffect(() => {
    const id = focusNext.current;
    if (id === null) return;
    focusNext.current = null;
    const target = document.getElementById(id);
    // the add button stands inside its own wrap, which carries the id
    (target?.matches('input') ? target : target?.querySelector('button'))?.focus();
  });
  const textId = (code: string, language: Language) => `${base}-${code}-${language}`;
  /** The option and the language of the text an event came from. */
  const placeOf = (target: EventTarget) => {
    const id = target instanceof HTMLElement ? target.id : '';
    for (const [index, option] of options.entries())
      for (const language of LANGUAGES)
        if (id === textId(option.code, language)) return { index, language };
    return null;
  };
  const change = (index: number, patch: Partial<FieldOption>, how?: Typed) =>
    onChange(
      options.map((o, i) => (i === index ? { ...o, ...patch } : o)),
      how,
    );
  const move = (index: number, direction: -1 | 1) => {
    const next = [...options];
    [next[index], next[index + direction]] = [next[index + direction]!, next[index]!];
    onChange(next);
  };
  const full100 = options.length >= DEFINITION_LIMITS.optionsPerField;
  const typed = (event: KeyboardEvent<HTMLDivElement>) => {
    // a letter still being composed (a Bengali keyboard) takes its own Enter and Backspace
    if (!full || event.nativeEvent.isComposing) return;
    const at = placeOf(event.target);
    if (!at) return;
    const plain = !event.shiftKey && !event.ctrlKey && !event.metaKey && !event.altKey;
    if (event.key === 'Enter' && plain) {
      event.preventDefault();
      if (full100) return;
      const next = insertOptionAfter(options, at.index, makeCode);
      focusNext.current = textId(next.added.code, 'bn');
      onChange(next.options);
      return;
    }
    // a held key that has emptied a text stops there: it removes nothing
    if (event.key !== 'Backspace' || !plain || event.repeat || at.language !== 'bn') return;
    const option = options[at.index];
    if (!option || option.label.bn !== '' || option.label.en !== '') return;
    event.preventDefault();
    const neighbour = options[at.index - 1] ?? options[at.index + 1];
    focusNext.current = neighbour ? textId(neighbour.code, 'bn') : addId;
    onChange(options.filter((_, i) => i !== at.index));
  };
  const pasted = (event: ClipboardEvent<HTMLDivElement>) => {
    if (!full) return;
    const at = placeOf(event.target);
    if (!at) return;
    // one line is pasted into the text as the browser does it
    const lines = pastedLines(event.clipboardData.getData('text'));
    if (lines.length < 2) return;
    event.preventDefault();
    const next = pasteOptions(options, at.index, at.language, lines, makeCode);
    if (next !== options) onChange([...next]);
  };
  return (
    <div onKeyDown={typed} onPaste={pasted}>
      <Stack gap={2}>
        {heading ? (
          <Text>
            <strong>{t('options')}</strong>
          </Text>
        ) : null}
        {options.length ? (
          // the columns named once: a narrow text shows only the start of its own label
          <div className="fb-opt-head" aria-hidden="true">
            <span>{t('preview_pane.bn')}</span>
            <span>{t('preview_pane.en')}</span>
            {full ? <span className="fb-opt-head-space" /> : null}
          </div>
        ) : null}
        {options.length ? (
          <ul className="fb-opt-list" aria-label={t('options')}>
            {options.map((option, i) => {
              const n = String(i + 1);
              const inUse =
                Boolean(parent) ||
                option.allowsOtherText === true ||
                (option.dependsOnOptionCode ?? null) !== null;
              const open = more.get(option.code) ?? inUse;
              return (
                <li key={option.code} className="fb-opt">
                  <div className="fb-opt-row">
                    <div className="fb-opt-texts">
                      <TextField
                        id={textId(option.code, 'bn')}
                        label={t('option_bn', { n })}
                        required
                        value={option.label.bn}
                        onChange={(bn) => change(i, { label: { ...option.label, bn } }, TYPED)}
                      />
                      <TextField
                        id={textId(option.code, 'en')}
                        label={t('option_en', { n })}
                        required
                        lang="en"
                        value={option.label.en}
                        onChange={(en) => change(i, { label: { ...option.label, en } }, TYPED)}
                      />
                    </div>
                    {full ? (
                      <div className="fb-opt-actions">
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
                        <IconButton
                          size="small"
                          icon="settings"
                          label={t(open ? 'option_more_hide' : 'option_more_show', { n })}
                          onClick={() => setMore((was) => new Map(was).set(option.code, !open))}
                        />
                      </div>
                    ) : null}
                  </div>
                  {full && open ? (
                    <div className="fb-opt-more">
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
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ul>
        ) : null}
        {full ? (
          <>
            <div id={addId} className="fb-opt-add">
              <Button
                size="small"
                variant="secondary"
                startIcon="add"
                disabled={full100}
                onClick={() => {
                  const added = emptyOption(options, makeCode);
                  focusNext.current = textId(added.code, 'bn');
                  onChange([...options, added]);
                }}
              >
                {t('option_add')}
              </Button>
              {options.length === 0 ? (
                <Button
                  size="small"
                  variant="text"
                  onClick={() =>
                    onChange(
                      yesNoOptions(
                        {
                          yes: { bn: t('option_yes_bn'), en: t('option_yes_en') },
                          no: { bn: t('option_no_bn'), en: t('option_no_en') },
                        },
                        makeCode,
                      ),
                    )
                  }
                >
                  {t('option_yes_no')}
                </Button>
              ) : null}
            </div>
            <Text tone="muted" size="small">
              {t('options_hint')}
            </Text>
          </>
        ) : null}
      </Stack>
    </div>
  );
}
