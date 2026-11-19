import { type Locale, localized } from '@css/shared/i18n';
import { Alert, ConfirmDialog, LinkButton, SelectField, Stack, Text } from '@/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useLocale, useTranslations } from 'use-intl';
import { ApiFailure } from '../../../api/client';
import { FORMS_KEY, placeForm, READY_KEY, readyForms } from '../../forms/forms-api';
import type { ProjectForm } from './setup-api';
import { useSetup } from './setup-context';

/** The value of the current form when the project built it itself, not from a ready form. */
const OWN = 'own';

/**
 * The application form of the project, chosen in the setup from the published ready application
 * forms (docs/DECISION_LOG.md, D-186): the first choice places it; while the project is a draft
 * another choice replaces it after a confirmation, the old copy retired by the server; once the
 * project runs the choice only shows. The project's forms page stays a small link for its own
 * forms and a newer version of a placed one.
 */
export function ApplicationFormPicker({
  forms,
  can,
  formHref,
}: {
  /** The project's forms, as the setup read them. */
  forms: readonly ProjectForm[] | undefined;
  /** Whether the caller may change the components now. */
  can: boolean;
  formHref: string;
}) {
  const { project, refresh } = useSetup();
  const t = useTranslations('admin.projects.setup');
  const tp = useTranslations('admin.projects.setup.form_picker');
  const locale = useLocale() as Locale;
  const queries = useQueryClient();
  const [asking, setAsking] = useState<string | null>(null);
  const draft = project.status === 'draft';
  const current = forms?.find((f) => f.kind === 'beneficiary_application' && f.publishedVersionId);
  const choosing = can && (!current || draft);
  const ready = useQuery({ queryKey: READY_KEY, queryFn: readyForms, enabled: choosing });
  const offered = (ready.data ?? []).filter(
    (f) => f.kind === 'beneficiary_application' && f.publishedVersionNo !== null,
  );
  const place = useMutation({
    mutationFn: (readyFormId: string) =>
      placeForm(
        project.id,
        current ? { readyFormId, replace: true } : { readyFormId, key: 'default' },
      ),
    onSuccess: async () => {
      setAsking(null);
      await Promise.all([refresh(), queries.invalidateQueries({ queryKey: FORMS_KEY })]);
    },
  });
  const value = current ? (current.sourceFormId ?? OWN) : '';
  const options = [
    // a form built for the project itself stands as the current choice by its own title
    ...(current && !current.sourceFormId
      ? [{ value: OWN, label: localized(current.title, locale) }]
      : []),
    ...offered.map((f) => ({
      value: f.id,
      label: tp('option', { title: localized(f.title, locale), n: String(f.publishedVersionNo) }),
    })),
  ];
  const choose = (id: string) => {
    if (!id || id === value || id === OWN || place.isPending) return;
    if (current) setAsking(id);
    else place.mutate(id);
  };

  return (
    <Stack gap={1}>
      {choosing ? (
        <SelectField
          label={tp('label')}
          value={value}
          onChange={choose}
          options={options}
          disabled={place.isPending}
          hint={ready.isSuccess && offered.length === 0 ? tp('none') : undefined}
        />
      ) : (
        <Text>
          {current ? tp('current', { title: localized(current.title, locale) }) : tp('unset')}
        </Text>
      )}
      {place.error instanceof ApiFailure && <Alert tone="error">{place.error.message}</Alert>}
      <LinkButton variant="text" startIcon="file" to={formHref}>
        {t('open_forms')}
      </LinkButton>
      <ConfirmDialog
        open={asking !== null}
        title={tp('confirm_title')}
        message={tp('confirm_text')}
        confirmLabel={tp('confirm')}
        onConfirm={() => asking && place.mutate(asking)}
        onCancel={() => setAsking(null)}
      />
    </Stack>
  );
}
