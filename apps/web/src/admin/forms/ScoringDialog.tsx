import { type FormDefinition, MAX_SCORE, maxScoreOf } from '@css/shared/forms';
import { Alert, Button, Modal, Stack, Text } from '@css/ui';
import { useTranslations } from 'use-intl';
import { setFormScoring } from './draft';
import { NumberText } from './NumberText';

/**
 * The form-level side of the priority score: the points of "not previously assisted" and the
 * highest total the form's points can reach. Read-only when the builder cannot change the form.
 */
export function ScoringDialog({
  definition,
  readOnly,
  onChange,
  onClose,
}: {
  definition: FormDefinition;
  readOnly: boolean;
  onChange: (definition: FormDefinition) => void;
  onClose: () => void;
}) {
  const t = useTranslations('forms.builder');
  const max = maxScoreOf(definition);
  return (
    <Modal
      title={t('scoring_title')}
      size="sm"
      isOpen
      onClose={onClose}
      primaryAction={<Button onPress={onClose}>{t('scoring_done')}</Button>}
    >
      <Stack gap={3}>
        <Text tone="muted">{t('scoring_intro')}</Text>
        {readOnly ? (
          <Text>
            {t('scoring_not_assisted')}: {definition.scoring?.not_previously_assisted ?? 0}
          </Text>
        ) : (
          <div>
            <NumberText
              label={t('scoring_not_assisted')}
              integer
              value={definition.scoring?.not_previously_assisted}
              onChange={(points) => onChange(setFormScoring(definition, points))}
            />
            <Text tone="muted">{t('scoring_not_assisted_hint')}</Text>
          </div>
        )}
        <Text weight="bold">{t('scoring_max', { max })}</Text>
        {max > MAX_SCORE ? <Alert tone="warning">{t('scoring_over')}</Alert> : null}
      </Stack>
    </Modal>
  );
}
