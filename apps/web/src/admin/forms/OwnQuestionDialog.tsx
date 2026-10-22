import {
  type FieldOption,
  type FieldType,
  type FormDefinition,
  isChoiceType,
} from '@css/shared/forms';
import { Alert, Button, Modal, Select, TextField } from '@css/ui';
import { useState } from 'react';
import { useLocale, useTranslations } from 'use-intl';
import { parentCandidates } from './candidates';
import type { OwnQuestion } from './draft';
import { emptyOption, OptionsEditor } from './OptionsEditor';

const NONE = '-';
const filled = (text: { bn: string; en: string }) => text.bn.trim() !== '' && text.en.trim() !== '';

/**
 * A question of this project's own, of the type chosen in the left pane: its label in both
 * languages, the section it goes to (fixed when it was dropped at a place), and for a choice its
 * options, the option that opens a text box, and the earlier answer the options may follow.
 * Inside a section with a repeat group it may join the group as a row question. The parent opens
 * it afresh each time (a new key), so it always starts empty.
 */
export function OwnQuestionDialog({
  isOpen,
  definition,
  type,
  sectionKey: initialSection,
  placed = false,
  onClose,
  onAdd,
}: {
  isOpen: boolean;
  definition: FormDefinition;
  type: FieldType;
  sectionKey: string;
  /** The question was dropped at a place, so its section cannot change. */
  placed?: boolean;
  onClose: () => void;
  onAdd: (question: OwnQuestion, sectionKey: string) => void;
}) {
  const t = useTranslations('forms.builder');
  const tt = useTranslations('forms.types');
  const locale = useLocale();
  const choice = isChoiceType(type);
  const [sectionKey, setSectionKey] = useState(initialSection);
  const [label, setLabel] = useState({ bn: '', en: '' });
  // a choice starts with one empty option to fill in
  const [options, setOptions] = useState<FieldOption[]>(choice ? [emptyOption([])] : []);
  const [dependsOn, setDependsOn] = useState<string | null>(null);
  const [group, setGroup] = useState<string | null>(null);
  const [tried, setTried] = useState(false);
  const section = definition.sections.find((s) => s.key === sectionKey);
  const groups = (section?.fields ?? []).filter((f) => f.type === 'repeat_group');
  const parents = parentCandidates(definition, sectionKey);
  const parent = choice ? parents.find((p) => p.fieldKey === dependsOn) : undefined;
  const labelsOk = filled(label);
  const optionsOk = !choice || (options.length > 0 && options.every((o) => filled(o.label)));

  const add = () => {
    setTried(true);
    if (!labelsOk || !optionsOk) return;
    onAdd(
      {
        type,
        label: { bn: label.bn.trim(), en: label.en.trim() },
        ...(choice
          ? {
              options: options.map((o) => ({
                ...o,
                label: { bn: o.label.bn.trim(), en: o.label.en.trim() },
                dependsOnOptionCode: parent ? (o.dependsOnOptionCode ?? null) : null,
              })),
            }
          : {}),
        ...(parent ? { dependsOn: parent.fieldKey } : {}),
        ...(group && type !== 'repeat_group' ? { group } : {}),
      },
      sectionKey,
    );
  };

  return (
    <Modal
      title={t('own_title')}
      isOpen={isOpen}
      onClose={onClose}
      size="lg"
      fullOnPhone
      secondaryAction={
        <Button variant="secondary" onPress={onClose}>
          {t('cancel')}
        </Button>
      }
      primaryAction={<Button onPress={add}>{t('own_add_confirm')}</Button>}
    >
      {tried && (!labelsOk || !optionsOk) ? (
        <Alert tone="danger" live="alert">
          {!labelsOk ? t('own_need_labels') : t('own_need_option')}
        </Alert>
      ) : null}
      <TextField label={t('own_type')} value={tt(type)} readOnly />
      <TextField
        label={t('label_bn')}
        required
        maxLength={500}
        value={label.bn}
        error={tried && label.bn.trim() === '' ? t('own_need_labels') : undefined}
        onChange={(bn) => setLabel({ ...label, bn })}
      />
      <TextField
        label={t('label_en')}
        required
        lang="en"
        maxLength={500}
        value={label.en}
        error={tried && label.en.trim() === '' ? t('own_need_labels') : undefined}
        onChange={(en) => setLabel({ ...label, en })}
      />
      {placed ? null : (
        <Select
          label={t('own_section')}
          required
          value={sectionKey}
          onChange={(id) => {
            if (!id || !definition.sections.some((s) => s.key === id)) return;
            setSectionKey(id);
            // the group and the earlier answer belong to the section
            setGroup(null);
            setDependsOn(null);
          }}
          options={definition.sections.map((s) => ({ id: s.key, label: s.title[locale] }))}
        />
      )}
      {groups.length > 0 && type !== 'repeat_group' ? (
        <Select
          label={t('own_group')}
          helper={t('own_group_hint')}
          value={group ?? NONE}
          onChange={(id) => setGroup(!id || id === NONE ? null : id)}
          options={[
            { id: NONE, label: t('own_group_none') },
            ...groups.map((g) => ({ id: g.fieldKey, label: g.label[locale] })),
          ]}
        />
      ) : null}
      {choice && parents.length > 0 ? (
        <Select
          label={t('depends_on')}
          helper={t('depends_on_hint')}
          value={dependsOn ?? NONE}
          onChange={(id) => setDependsOn(!id || id === NONE ? null : id)}
          options={[
            { id: NONE, label: t('depends_none') },
            ...parents.map((p) => ({ id: p.fieldKey, label: p.label[locale] })),
          ]}
        />
      ) : null}
      {choice ? (
        <OptionsEditor options={options} onChange={setOptions} mode="full" parent={parent} />
      ) : null}
    </Modal>
  );
}
