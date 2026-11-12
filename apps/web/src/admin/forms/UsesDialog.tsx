import type { FormDefinition } from '@css/shared/forms';
import { localized } from '@css/shared/i18n';
import { Button, Dialog, Stack, Text } from '@/ui';
import { useId } from 'react';
import { useLocale, useTranslations } from 'use-intl';
import type { FieldUse } from './draft';

/**
 * Asked before a question or a part is removed while other places of the form read it: the
 * places are named, each by its question (or its part, for a part's condition) and the kind of
 * use, and confirming removes them together. A part's dialog also says which of its questions
 * each place reads. The names are the draft's own, in the reader's language.
 */
export function UsesDialog({
  definition,
  target,
  label,
  uses,
  onCancel,
  onConfirm,
}: {
  definition: FormDefinition;
  /** What is being removed: one question (a list with its row questions), or a whole part. */
  target: 'question' | 'section';
  /** Its name, as the canvas shows it. */
  label: string;
  uses: FieldUse[];
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const t = useTranslations('forms.builder');
  const locale = useLocale();
  const listId = useId();
  const fields = new Map(
    definition.sections.flatMap((s) => s.fields).map((f) => [f.fieldKey, f.label]),
  );
  const sections = new Map(definition.sections.map((s) => [s.key, s.title]));
  const nameOf = (text: { bn: string; en: string } | undefined) =>
    text ? localized(text, locale) : '';
  const line = (use: FieldUse) => {
    const name = nameOf(
      use.field === undefined ? sections.get(use.section) : fields.get(use.field),
    );
    const where = t(`uses.${use.kind}`, { name });
    if (target === 'question') return where;
    return t('uses.of', {
      used: use.used.map((key) => nameOf(fields.get(key))).join(', '),
      where,
    });
  };
  return (
    <Dialog
      title={t(`uses.title_${target}`)}
      size="small"
      open
      onClose={onCancel}
      actions={
        <>
          <Button variant="secondary" onClick={onCancel}>
            {t('cancel')}
          </Button>
          <Button variant="danger" onClick={onConfirm}>
            {t(`uses.confirm_${target}`)}
          </Button>
        </>
      }
    >
      <Stack gap={2}>
        <Text>{t('uses.intro', { label })}</Text>
        <Text>
          <strong id={listId}>{t('uses.list')}</strong>
        </Text>
        <ul aria-labelledby={listId} className="form-settings-list">
          {uses.map((use) => (
            <li key={`${use.section}:${use.field ?? ''}:${use.kind}`}>{line(use)}</li>
          ))}
        </ul>
        {uses.some((use) => use.kind === 'calculation') ? (
          <Text tone="muted">{t('uses.calculation_note')}</Text>
        ) : null}
      </Stack>
    </Dialog>
  );
}
