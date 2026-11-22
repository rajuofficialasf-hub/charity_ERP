import { localized, type Locale } from '@css/shared/i18n';
import { Alert, Button, Dialog, Form, FormTextField, SelectField, Skeleton, Stack } from '@/ui';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Controller, useForm, useWatch } from 'react-hook-form';
import { Link } from 'react-router';
import { useLocale, useTranslations } from 'use-intl';
import { z } from 'zod';
import { ApiFailure } from '../../api/client';
import { useAuth } from '../../lib/auth';
import { showFailure, useSchemaResolver } from '../../lib/form-schema';
import { roles } from '../registrations/registrations-api';
import { mayGiveRole } from '../roles';
import { changeRole, type StaffDetail, staffWithEtag } from './staff-api';

/** The new role and the reason of three letters at least, as the server requires. */
const ROLE_SCHEMA = z.object({
  roleKey: z.string().min(1, 'validation.required'),
  reason: z.string().trim().min(3, 'validation.too_short').max(1000),
});
type RoleFields = z.infer<typeof ROLE_SCHEMA>;

/**
 * Another role for an official in place of the present one, with a reason (docs/security/RBAC.md,
 * "Roles"; docs/BUSINESS_RULES.md, "An official's role is changed"). The choices are the official
 * roles the caller may give, the present one left out; the change is sent with the version read
 * when the dialog opened. Work only the old role may hold is handed over first: that refusal
 * leads to the handover page. The server decides every rule again.
 */
export function RoleChangeDialog({
  official,
  onClose,
  onChanged,
}: {
  official: StaffDetail;
  onClose: () => void;
  onChanged: () => void;
}) {
  const t = useTranslations('admin.staff.role_change');
  const tc = useTranslations('common.action');
  const locale = useLocale() as Locale;
  const { me } = useAuth();
  const queryClient = useQueryClient();
  const [handover, setHandover] = useState(false);
  const [stale, setStale] = useState(false);
  const roleList = useQuery({ queryKey: ['admin', 'roles'], queryFn: roles });
  // the change starts from the record as stored now, with its version
  const version = useQuery({
    queryKey: ['admin', 'staff', 'role-version', official.id],
    queryFn: () => staffWithEtag(official.id),
    staleTime: 0,
  });
  const form = useForm<RoleFields>({
    resolver: useSchemaResolver(ROLE_SCHEMA),
    defaultValues: { roleKey: '', reason: '' },
    reValidateMode: 'onSubmit',
  });
  const roleKey = useWatch({ control: form.control, name: 'roleKey' });
  const pending = form.formState.isSubmitting;
  const title = t('title', { name: official.displayName });

  const named = (key: string) => {
    const role = roleList.data?.find((r) => r.key === key);
    return role ? localized(role.name, locale) : key;
  };
  const choices = (roleList.data ?? []).filter(
    (r) =>
      r.kind === 'official' &&
      me !== null &&
      mayGiveRole(me, r.key) &&
      // the present role, when it is the only one, is no change
      !(official.roles.length === 1 && official.roles[0] === r.key),
  );
  const chosen = roleList.data?.find((r) => r.key === roleKey);

  const send = async (v: RoleFields) => {
    if (!version.data?.meta.etag) return;
    setHandover(false);
    setStale(false);
    try {
      await changeRole(official.id, version.data.meta.etag, {
        roleKey: v.roleKey,
        reason: v.reason.trim(),
      });
    } catch (failure) {
      if (failure instanceof ApiFailure && failure.code === 'handover.items_outstanding') {
        setHandover(true);
        return;
      }
      if (failure instanceof ApiFailure && failure.status === 412) {
        setStale(true);
        await queryClient.invalidateQueries({ queryKey: ['admin', 'staff', 'role-version'] });
        return;
      }
      showFailure(form, failure, t('offline'));
      return;
    }
    onChanged();
  };

  const loading = roleList.isPending || version.isPending;
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
          <Button
            onClick={() => void form.handleSubmit(send)()}
            loading={pending}
            disabled={loading || !version.data}
          >
            {t('confirm')}
          </Button>
        </>
      }
    >
      {loading ? (
        <Skeleton count={3} />
      ) : (
        <Form
          form={form}
          onSubmit={send}
          label={title}
          error={form.formState.errors.root?.server?.message}
        >
          <Stack gap={2}>
            <p className="admin-muted">
              {t('current', { roles: official.roles.map(named).join(', ') })}
            </p>
            {handover && (
              <Alert tone="warning">
                {t('handover')} <Link to="/admin/handover">{t('handover_link')}</Link>
              </Alert>
            )}
            {stale && <Alert tone="warning">{t('stale')}</Alert>}
            <Controller
              control={form.control}
              name="roleKey"
              render={({ field, fieldState }) => (
                <SelectField
                  label={t('new_role')}
                  required
                  value={field.value}
                  onChange={(key) => field.onChange(key ?? '')}
                  searchable={false}
                  options={choices.map((r) => ({
                    value: r.key,
                    label: localized(r.name, locale),
                  }))}
                  hint={chosen?.globalScope ? t('global_hint') : undefined}
                  error={fieldState.error?.message}
                />
              )}
            />
            <FormTextField name="reason" rows={3} label={t('reason')} required maxLength={1000} />
          </Stack>
        </Form>
      )}
    </Dialog>
  );
}
