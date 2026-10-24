import { localized, type Locale } from '@css/shared/i18n';
import { Alert, Button, Modal, RadioGroup, Text } from '@css/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useLocale, useTranslations } from 'use-intl';
import { ApiFailure } from '../../lib/api';
import { FORMS_KEY, placeForm, READY_KEY, readyForms } from './forms-api';

/**
 * Places a published ready form on the project: the project gets a published copy that names its
 * source, which nobody changes here; a newer version of the ready form is taken later on demand.
 * The first form of a project is its default application form.
 */
export function PlaceFormDialog({
  projectId,
  firstForm,
  isOpen,
  onClose,
  onPlaced,
}: {
  projectId: string;
  firstForm: boolean;
  isOpen: boolean;
  onClose: () => void;
  onPlaced: (formId: string) => void;
}) {
  const t = useTranslations('forms.builder');
  const tp = useTranslations('forms.place');
  const locale = useLocale() as Locale;
  const queries = useQueryClient();
  const [chosen, setChosen] = useState<string | null>(null);
  const list = useQuery({ queryKey: READY_KEY, queryFn: readyForms, enabled: isOpen });
  const published = (list.data ?? []).filter((f) => f.publishedVersionNo !== null);
  const place = useMutation({
    mutationFn: () =>
      placeForm(projectId, {
        readyFormId: chosen!,
        ...(firstForm ? { key: 'default' } : {}),
      }),
    onSuccess: async (made) => {
      await queries.invalidateQueries({ queryKey: [...FORMS_KEY, projectId] });
      onPlaced(made.id);
    },
  });
  return (
    <Modal
      title={tp('title')}
      isOpen={isOpen}
      onClose={onClose}
      dismissible={!place.isPending}
      secondaryAction={
        <Button variant="secondary" onPress={onClose} disabled={place.isPending}>
          {t('cancel')}
        </Button>
      }
      primaryAction={
        <Button onPress={() => place.mutate()} disabled={!chosen} loading={place.isPending}>
          {tp('place')}
        </Button>
      }
    >
      {place.error instanceof ApiFailure ? (
        <Alert tone="danger" live="alert">
          {place.error.details[0]?.message ?? place.error.message}
        </Alert>
      ) : null}
      <Text tone="muted">{tp('note')}</Text>
      {list.isSuccess && published.length === 0 ? (
        <Alert tone="info">{tp('none')}</Alert>
      ) : (
        <RadioGroup
          label={tp('choose')}
          value={chosen ?? ''}
          onChange={setChosen}
          options={published.map((f) => ({
            id: f.id,
            label: tp('option', {
              title: localized(f.title, locale),
              kind: t(`kind.${f.kind}`),
              n: String(f.publishedVersionNo),
            }),
          }))}
        />
      )}
    </Modal>
  );
}
