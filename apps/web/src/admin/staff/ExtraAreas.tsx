import { formatDate } from '@css/shared/format';
import { localized, type Locale } from '@css/shared/i18n';
import {
  Alert,
  Button,
  Checkbox,
  ConfirmDialog,
  Dialog,
  Form,
  FormTextField,
  ProfileSection,
  Skeleton,
  Stack,
} from '@/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Controller, useForm, useWatch } from 'react-hook-form';
import { useLocale, useTranslations } from 'use-intl';
import { z } from 'zod';
import { ApiFailure } from '../../api/client';
import { LoadError } from '../../components/LoadError';
import {
  type Address,
  AddressFields,
  EMPTY_ADDRESS,
} from '../../features/registration/AddressFields';
import { showFailure, useSchemaResolver } from '../../lib/form-schema';
import {
  endExtraArea,
  type ExtraArea,
  extraAreas,
  extraAreasKey,
  giveExtraArea,
} from './staff-api';

/** A new extra area: the whole country, or a division with or without one of its districts. */
const GIVE_SCHEMA = z
  .object({
    wholeCountry: z.boolean(),
    place: z.custom<Address>(),
    reason: z.string().trim().min(3).max(1000),
  })
  .superRefine((v, ctx) => {
    if (!v.wholeCountry && !v.place.divisionId)
      ctx.addIssue({ code: 'custom', path: ['place'], message: 'validation.required' });
  });
type GiveFields = z.infer<typeof GIVE_SCHEMA>;

/**
 * The extra areas of an official on the profile (docs/security/RBAC.md, "Data scopes and their
 * resolution"; docs/BUSINESS_RULES.md, "An official may be given an extra area"): each with who
 * gave it, when and why, ended with a reason, and a new one given by the person above. The server
 * decides who reaches the official and which area may be given; a caller it answers "not found"
 * or "forbidden" sees no section.
 */
export function ExtraAreas({
  userId,
  name,
  manage,
  wholeCountry,
}: {
  userId: string;
  name: string;
  /** The viewer may give and end areas here: never on the own profile. */
  manage: boolean;
  /** The viewer may give the whole country. */
  wholeCountry: boolean;
}) {
  const t = useTranslations('admin.staff.extra_areas');
  const locale = useLocale() as Locale;
  const queryClient = useQueryClient();
  const key = extraAreasKey(userId);
  const [adding, setAdding] = useState(false);
  const [target, setTarget] = useState<ExtraArea | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const areas = useQuery({ queryKey: key, queryFn: () => extraAreas(userId), retry: false });
  const end = useMutation({
    mutationFn: (reason: string) => endExtraArea(userId, target!.id, reason.trim()),
    onSuccess: (rows) => {
      setTarget(null);
      end.reset();
      setNotice(t('ended'));
      queryClient.setQueryData(key, rows);
    },
  });
  if (areas.error instanceof ApiFailure && [403, 404].includes(areas.error.status)) return null;

  const placeName = (a: ExtraArea) =>
    a.location ? localized(a.location.name, locale) : t('whole_country');
  const live = (areas.data ?? []).filter((a) => a.endedAt === null);
  const past = (areas.data ?? []).filter((a) => a.endedAt !== null);
  const failure = end.error instanceof ApiFailure ? end.error : null;

  return (
    <ProfileSection title={t('title')} icon="map-pin">
      <Stack gap={2}>
        <p className="admin-muted">{t('hint')}</p>
        {notice && (
          <Alert tone="success" onDismiss={() => setNotice(null)}>
            {notice}
          </Alert>
        )}
        {areas.isPending ? (
          <Skeleton count={2} />
        ) : areas.error ? (
          <LoadError error={areas.error} onRetry={() => void areas.refetch()} />
        ) : live.length === 0 ? (
          <p className="admin-muted">{t('none')}</p>
        ) : (
          <ul className="admin-plain-list">
            {live.map((a) => (
              <li key={a.id}>
                <Stack direction="row" wrap align="center" gap={2}>
                  <strong>{placeName(a)}</strong>
                  <span className="admin-muted">
                    {t('given_by', {
                      name: a.grantedBy.displayName,
                      date: formatDate(a.grantedAt),
                    })}
                  </span>
                  <span className="admin-muted">{t('reason', { reason: a.reason })}</span>
                  {manage && (
                    <Button size="small" variant="secondary" onClick={() => setTarget(a)}>
                      {t('end')}
                    </Button>
                  )}
                </Stack>
              </li>
            ))}
          </ul>
        )}
        {manage && (
          <div>
            <Button
              size="small"
              variant="secondary"
              startIcon="add"
              onClick={() => setAdding(true)}
            >
              {t('add')}
            </Button>
          </div>
        )}
        {past.length > 0 && (
          <>
            <h3 className="admin-setup-subtitle">{t('past')}</h3>
            <ul className="admin-plain-list">
              {past.map((a) => (
                <li key={a.id}>
                  <Stack direction="row" wrap align="center" gap={2}>
                    <span>{placeName(a)}</span>
                    <span className="admin-muted">
                      {t('given_by', {
                        name: a.grantedBy.displayName,
                        date: formatDate(a.grantedAt),
                      })}
                    </span>
                    {a.endedBy && a.endedAt && (
                      <span className="admin-muted">
                        {t('ended_by', {
                          name: a.endedBy.displayName,
                          date: formatDate(a.endedAt),
                        })}
                      </span>
                    )}
                    {a.endReason && (
                      <span className="admin-muted">{t('reason', { reason: a.endReason })}</span>
                    )}
                  </Stack>
                </li>
              ))}
            </ul>
          </>
        )}
      </Stack>
      {adding && (
        <GiveDialog
          userId={userId}
          name={name}
          wholeCountry={wholeCountry}
          onClose={() => setAdding(false)}
          onGiven={(rows) => {
            setAdding(false);
            setNotice(t('given'));
            queryClient.setQueryData(key, rows);
          }}
        />
      )}
      <ConfirmDialog
        open={target !== null}
        title={target ? t('end_area', { area: placeName(target) }) : ''}
        message={
          <>
            <p>{t('end_message')}</p>
            {failure && (
              <p className="admin-error">{failure.details[0]?.message ?? failure.message}</p>
            )}
          </>
        }
        tone="danger"
        reasonRequired
        reasonLabel={t('reason_label')}
        confirmLabel={t('end')}
        pending={end.isPending}
        onConfirm={(reason) => end.mutate(reason)}
        onCancel={() => {
          end.reset();
          setTarget(null);
        }}
      />
    </ProfileSection>
  );
}

function GiveDialog({
  userId,
  name,
  wholeCountry,
  onClose,
  onGiven,
}: {
  userId: string;
  name: string;
  wholeCountry: boolean;
  onClose: () => void;
  onGiven: (rows: ExtraArea[]) => void;
}) {
  const t = useTranslations('admin.staff.extra_areas');
  const tc = useTranslations('common.action');
  const form = useForm<GiveFields>({
    resolver: useSchemaResolver(GIVE_SCHEMA),
    defaultValues: { wholeCountry: false, place: EMPTY_ADDRESS, reason: '' },
    reValidateMode: 'onSubmit',
  });
  const everywhere = useWatch({ control: form.control, name: 'wholeCountry' });
  const pending = form.formState.isSubmitting;
  const title = t('add_title', { name });

  const give = async (v: GiveFields) => {
    try {
      onGiven(
        await giveExtraArea(userId, {
          ...(v.wholeCountry
            ? { wholeCountry: true }
            : { wholeCountry: false, locationId: (v.place.districtId ?? v.place.divisionId)! }),
          reason: v.reason.trim(),
        }),
      );
    } catch (failure) {
      showFailure(form, failure, t('offline'));
    }
  };

  return (
    <Dialog
      title={title}
      size="small"
      open
      onClose={onClose}
      dismissible={!pending}
      actions={
        <>
          <Button variant="secondary" onClick={onClose} disabled={pending}>
            {tc('cancel')}
          </Button>
          <Button onClick={() => void form.handleSubmit(give)()} loading={pending}>
            {t('give')}
          </Button>
        </>
      }
    >
      <Form
        form={form}
        onSubmit={give}
        label={title}
        error={form.formState.errors.root?.server?.message}
      >
        <Stack gap={2}>
          {wholeCountry && (
            <Controller
              control={form.control}
              name="wholeCountry"
              render={({ field }) => (
                <Checkbox
                  label={t('whole_country')}
                  hint={t('whole_country_hint')}
                  checked={field.value}
                  onChange={field.onChange}
                />
              )}
            />
          )}
          {!everywhere && (
            <>
              <Controller
                control={form.control}
                name="place"
                render={({ field, fieldState }) => (
                  <AddressFields
                    optional
                    levels={2}
                    value={field.value}
                    onChange={field.onChange}
                    errors={fieldState.error ? { divisionId: t('place_required') } : {}}
                  />
                )}
              />
              <p className="admin-muted">{t('district_hint')}</p>
            </>
          )}
          <FormTextField
            name="reason"
            rows={3}
            label={t('reason_label')}
            required
            maxLength={1000}
          />
        </Stack>
      </Form>
    </Dialog>
  );
}
