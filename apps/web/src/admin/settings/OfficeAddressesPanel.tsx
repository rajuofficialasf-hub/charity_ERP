import { officeAddressesSchema } from '@css/shared/settings';
import { Button, Card, Form, FormTextField, Skeleton, Stack, Text } from '@/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useForm, useWatch } from 'react-hook-form';
import { useTranslations } from 'use-intl';
import { z } from 'zod';
import { LoadError } from '../../components/LoadError';
import { showFailure, useSchemaResolver } from '../../lib/form-schema';
import {
  OFFICE_ADDRESSES_KEY,
  type OfficeAddressesView,
  officeAddresses,
  setOfficeAddresses,
} from './settings-api';

/** The addresses as typed, one a line; empty lines are left out. */
const linesOf = (text: string) =>
  text
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);

type Fields = { addresses: string };

/** The setting's own rules on the typed lines, told on the one field. */
const FIELDS_SCHEMA = z.object({
  addresses: z.string().superRefine((text, ctx) => {
    const parsed = officeAddressesSchema.safeParse({ addresses: linesOf(text) });
    if (!parsed.success) ctx.addIssue({ code: 'custom', message: parsed.error.issues[0]!.message });
  }),
});

function OfficeForm({ data, onSaved }: { data: OfficeAddressesView; onSaved: () => void }) {
  const t = useTranslations('admin.settings.office');
  const ts = useTranslations('admin.settings');
  const te = useTranslations('common.state.error');
  const form = useForm<Fields>({
    resolver: useSchemaResolver(FIELDS_SCHEMA),
    defaultValues: { addresses: data.addresses.join('\n') },
    reValidateMode: 'onSubmit',
  });
  const typed = useWatch({ control: form.control, name: 'addresses' });
  const queryClient = useQueryClient();
  const save = useMutation({
    mutationFn: (v: Fields) => setOfficeAddresses({ addresses: linesOf(v.addresses) }),
    onSuccess: (next) => {
      queryClient.setQueryData(OFFICE_ADDRESSES_KEY, next);
      form.reset({ addresses: next.addresses.join('\n') });
      onSaved();
    },
    onError: (failure) => showFailure(form, failure, te('text')),
  });
  const yours = data.yourAddress;
  const listed = yours !== null && linesOf(typed).includes(yours.toLowerCase());
  const addYours = () => {
    if (!yours) return;
    const lines = linesOf(form.getValues('addresses'));
    form.setValue('addresses', [...lines, yours].join('\n'), { shouldDirty: true });
  };
  return (
    <Form
      form={form}
      onSubmit={(v: Fields) => {
        if (!save.isPending) save.mutate(v);
      }}
      label={t('title')}
      error={form.formState.errors.root?.server?.message}
    >
      <Stack direction="row" gap={2} align="center" wrap>
        <Text tone="muted">{yours ? t('yours', { address: yours }) : t('yours_unknown')}</Text>
        {yours && !listed ? (
          <Button variant="text" size="small" onClick={addYours}>
            {t('add_yours')}
          </Button>
        ) : null}
      </Stack>
      <FormTextField
        name="addresses"
        label={t('field')}
        hint={t('field_hint')}
        rows={6}
        lang="en"
      />
      <div className="admin-form-actions">
        <Button type="submit" loading={save.isPending}>
          {ts('save')}
        </Button>
      </div>
    </Form>
  );
}

/**
 * The office addresses an Admin keeps: requests from them skip the rate limits counted by the
 * address (a training day from one Wi-Fi), while the limits of an account or a draft stay. The
 * page shows the address the server sees for this computer, to add the office it is opened from.
 */
export function OfficeAddressesPanel({ onSaved }: { onSaved: () => void }) {
  const t = useTranslations('admin.settings.office');
  const query = useQuery({ queryKey: OFFICE_ADDRESSES_KEY, queryFn: officeAddresses });
  if (query.isPending) return <Skeleton count={3} />;
  if (query.error) return <LoadError error={query.error} onRetry={() => void query.refetch()} />;
  return (
    <Card title={t('title')} headingLevel={2}>
      <p className="admin-muted">{t('hint')}</p>
      <OfficeForm data={query.data} onSaved={onSaved} />
    </Card>
  );
}
