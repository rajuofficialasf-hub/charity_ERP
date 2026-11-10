import { localized, type Locale } from '@css/shared/i18n';
import { Alert, Button, Dialog, Form, RadioGroup, Text } from '@/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Controller, useForm, useWatch } from 'react-hook-form';
import { useLocale, useTranslations } from 'use-intl';
import { z } from 'zod';
import { showFailure, useSchemaResolver } from '../../lib/form-schema';
import { FORMS_KEY, placeForm, READY_KEY, readyForms } from './forms-api';

/** The published ready form to place. */
const PLACE_SCHEMA = z.object({
  readyFormId: z.string().min(1, { message: 'validation.required' }),
});
type PlaceFields = z.infer<typeof PLACE_SCHEMA>;

/**
 * Places a published ready form on the project: the project gets a published copy that names its
 * source, which nobody changes here; a newer version of the ready form is taken later on demand.
 * The first form of a project is its default application form.
 */
export function PlaceFormDialog({
  projectId,
  firstForm,
  open,
  onClose,
  onPlaced,
}: {
  projectId: string;
  firstForm: boolean;
  open: boolean;
  onClose: () => void;
  onPlaced: (formId: string) => void;
}) {
  const t = useTranslations('forms.builder');
  const tp = useTranslations('forms.place');
  const ts = useTranslations('common.state.error');
  const locale = useLocale() as Locale;
  const queries = useQueryClient();
  const form = useForm<PlaceFields>({
    resolver: useSchemaResolver(PLACE_SCHEMA),
    defaultValues: { readyFormId: '' },
    reValidateMode: 'onSubmit',
  });
  const chosen = useWatch({ control: form.control, name: 'readyFormId' });
  const list = useQuery({ queryKey: READY_KEY, queryFn: readyForms, enabled: open });
  const published = (list.data ?? []).filter((f) => f.publishedVersionNo !== null);
  // a choice that left the list (unpublished, or another list read) counts as none
  const choice = published.some((f) => f.id === chosen) ? chosen : null;
  const close = () => {
    form.reset();
    onClose();
  };
  const place = useMutation({
    mutationFn: (readyFormId: string) =>
      placeForm(projectId, { readyFormId, ...(firstForm ? { key: 'default' } : {}) }),
    onSuccess: async (made) => {
      await queries.invalidateQueries({ queryKey: [...FORMS_KEY, projectId] });
      onPlaced(made.id);
    },
    onError: (failure) => showFailure(form, failure, ts('text'), { firstDetail: true }),
  });
  // nothing the button would refuse, and nothing twice
  const send = () => {
    if (choice && !place.isPending) place.mutate(choice);
  };
  return (
    <Dialog
      title={tp('title')}
      open={open}
      onClose={close}
      dismissible={!place.isPending}
      actions={
        <>
          <Button variant="secondary" onClick={close} disabled={place.isPending}>
            {t('cancel')}
          </Button>
          <Button
            onClick={() => void form.handleSubmit(send)()}
            disabled={!choice}
            loading={place.isPending}
          >
            {tp('place')}
          </Button>
        </>
      }
    >
      <Form
        form={form}
        onSubmit={send}
        label={tp('title')}
        error={form.formState.errors.root?.server?.message}
      >
        <Text tone="muted">{tp('note')}</Text>
        {list.isSuccess && published.length === 0 ? (
          <Alert tone="info">{tp('none')}</Alert>
        ) : (
          <Controller
            control={form.control}
            name="readyFormId"
            render={({ field }) => (
              <RadioGroup
                label={tp('choose')}
                value={choice ?? ''}
                onChange={field.onChange}
                options={published.map((f) => ({
                  value: f.id,
                  label: tp('option', {
                    title: localized(f.title, locale),
                    kind: t(`kind.${f.kind}`),
                    n: String(f.publishedVersionNo),
                  }),
                }))}
              />
            )}
          />
        )}
      </Form>
    </Dialog>
  );
}
