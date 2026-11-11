import { formatCount } from '@css/shared/format';
import { localized, type Locale } from '@css/shared/i18n';
import { Alert, Button, Form, IconButton, Text } from '@/ui';
import { useMutation } from '@tanstack/react-query';
import { useState } from 'react';
import { Controller, useForm, useWatch } from 'react-hook-form';
import { useLocale, useTranslations } from 'use-intl';
import { z } from 'zod';
import {
  type Address,
  AddressFields,
  EMPTY_ADDRESS,
} from '../../../features/registration/AddressFields';
import { useLocationName } from '../../../components/AddressNames';
import { useSchemaResolver } from '../../../lib/form-schema';
import { NumberText } from '../../forms/NumberText';
import { type Quota, saveQuotas } from './setup-api';
import { SaveRow, SetupSection, useSetup, useStepSave } from './setup-context';

type Draft = {
  level: 'district' | 'union';
  locationId: string;
  target: number | undefined;
  /** The place above a place added in this visit, to read its name from the locations. */
  parentId?: string;
};

/**
 * The list saved as a whole, each quota with a target of one at least, and the place and target
 * of the quota being added.
 */
const QUOTAS_SCHEMA = z.object({
  quotas: z.array(z.custom<Draft>((q) => ((q as Draft).target ?? 0) >= 1)),
  place: z.custom<Address>(),
  target: z.number().optional(),
});
type QuotaFields = z.infer<typeof QUOTAS_SCHEMA>;

const sameList = (a: readonly Draft[], b: readonly Quota[]) =>
  a.length === b.length &&
  a.every((q, i) => q.locationId === b[i]?.locationId && q.target === b[i]?.target);

/**
 * The district and union quotas of the project, set by the PM of the
 * program: each place with its target and, once applications arrive, what came and what was
 * approved. A full quota only warns at the review; the list is saved as a whole.
 */
export function QuotasSection({ quotas, manage }: { quotas: Quota[]; manage: boolean }) {
  const { project, editable, refresh } = useSetup();
  const t = useTranslations('admin.projects.setup');
  const can = manage && editable('quotas');
  const form = useForm<QuotaFields>({
    resolver: useSchemaResolver(QUOTAS_SCHEMA),
    defaultValues: { quotas: quotas.map(draftOf), place: EMPTY_ADDRESS, target: undefined },
    reValidateMode: 'onSubmit',
  });
  const { quotas: list, place, target } = useWatch({ control: form.control }) as QuotaFields;
  const setList = (next: Draft[]) => form.setValue('quotas', next);
  // a read that only brings new counts keeps the targets being typed; new targets replace them
  const targetsOf = (list: readonly Quota[]) =>
    JSON.stringify(list.map((q) => [q.locationId, q.target]));
  const [seen, setSeen] = useState(() => targetsOf(quotas));
  if (targetsOf(quotas) !== seen) {
    setSeen(targetsOf(quotas));
    setList(quotas.map(draftOf));
  }
  const save = useMutation({
    mutationFn: (drafts: Draft[]) =>
      saveQuotas(project.id, {
        quotas: drafts.flatMap((q) =>
          q.target === undefined
            ? []
            : [{ level: q.level, locationId: q.locationId, target: q.target }],
        ),
      }),
    onSuccess: refresh,
  });
  const changed = can && !sameList(list, quotas);
  const incomplete = list.some((q) => q.target === undefined || q.target < 1);
  const problem = useStepSave({
    changed,
    invalid: incomplete ? t('quota_incomplete') : undefined,
    save: () => save.mutateAsync(form.getValues('quotas')),
  });
  const chosen = place.unionId ?? place.districtId;
  const add = () => {
    if (!chosen || target === undefined || target < 1 || list.some((q) => q.locationId === chosen))
      return;
    const union = Boolean(place.unionId);
    setList([
      ...list,
      {
        level: union ? 'union' : 'district',
        locationId: chosen,
        target,
        parentId: (union ? place.upazilaId : place.divisionId) ?? undefined,
      },
    ]);
    form.setValue('place', EMPTY_ADDRESS);
    form.setValue('target', undefined);
  };
  const submit = (v: QuotaFields) => save.mutate(v.quotas);
  const progress = new Map(quotas.map((q) => [q.locationId, q]));

  return (
    <SetupSection id="quotas" title={t('section.quotas')}>
      <Text tone="muted">{t('quotas_hint')}</Text>
      {list.length === 0 ? (
        <p className="admin-muted">{t('no_quotas')}</p>
      ) : (
        <ul className="admin-setup-list">
          {list.map((q) => (
            <QuotaRow
              key={q.locationId}
              quota={q}
              stored={progress.get(q.locationId)}
              can={can}
              onTarget={(value) =>
                setList(
                  list.map((x) => (x.locationId === q.locationId ? { ...x, target: value } : x)),
                )
              }
              onRemove={() => setList(list.filter((x) => x.locationId !== q.locationId))}
            />
          ))}
        </ul>
      )}
      {can && (
        <>
          <h3 className="admin-setup-subtitle">{t('add_quota')}</h3>
          <div className="admin-setup-grid">
            <Controller
              control={form.control}
              name="place"
              render={({ field }) => (
                <AddressFields optional levels={4} value={field.value} onChange={field.onChange} />
              )}
            />
            <Controller
              control={form.control}
              name="target"
              render={({ field }) => (
                <NumberText
                  label={t('quota_target')}
                  integer
                  value={field.value}
                  onChange={field.onChange}
                />
              )}
            />
          </div>
          <div>
            <Button
              variant="secondary"
              size="small"
              startIcon="add"
              disabled={!place.districtId || target === undefined || target < 1}
              onClick={add}
            >
              {t('add_quota')}
            </Button>
          </div>
          {/* the quota being added stays outside the form element: Enter there saves nothing */}
          <Form form={form} onSubmit={submit} label={t('save_quotas')}>
            {problem && <Alert tone="warning">{problem}</Alert>}
            <SaveRow
              mutation={save}
              onSave={() => void form.handleSubmit(submit)()}
              disabled={!changed || incomplete}
              label={t('save_quotas')}
            />
          </Form>
        </>
      )}
    </SetupSection>
  );
}

const draftOf = (q: Quota): Draft => ({
  level: q.level,
  locationId: q.locationId,
  target: q.target,
});

/** One quota: the place, its target (editable by the PM), and what came and was approved. */
function QuotaRow({
  quota,
  stored,
  can,
  onTarget,
  onRemove,
}: {
  quota: Draft;
  stored: Quota | undefined;
  can: boolean;
  onTarget: (value: number | undefined) => void;
  onRemove: () => void;
}) {
  const t = useTranslations('admin.projects.setup');
  const locale = useLocale() as Locale;
  // a place added in this visit has no stored name yet; its name is read from the locations
  const looked = useLocationName(
    stored ? null : (quota.parentId ?? null),
    stored ? null : quota.locationId,
  );
  const name = stored ? localized(stored.locationName, locale) : (looked?.[locale] ?? '');
  return (
    <li>
      <span>
        <strong>{name}</strong> · {t(`level.${quota.level}`)}
        {stored ? (
          <>
            {' · '}
            <span className="admin-muted">
              {t('quota_progress', {
                target: formatCount(stored.target, locale),
                received: formatCount(stored.received, locale),
                approved: formatCount(stored.approved, locale),
              })}
            </span>
          </>
        ) : null}
      </span>
      {can ? (
        <span className="admin-setup-quota-edit">
          <NumberText
            label={t('quota_target_of', { name })}
            integer
            value={quota.target}
            onChange={onTarget}
          />
          <IconButton label={t('remove_quota', { name })} icon="delete" onClick={onRemove} />
        </span>
      ) : null}
    </li>
  );
}
