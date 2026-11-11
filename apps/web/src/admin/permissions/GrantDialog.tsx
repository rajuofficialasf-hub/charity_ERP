import { SCOPE_TYPES, type ScopeTypeName } from '@css/shared/access';
import {
  Alert,
  Button,
  Combobox,
  Dialog,
  Form,
  FormDateField,
  FormTextField,
  RadioGroup,
  SelectField,
} from '@/ui';
import { useQuery } from '@tanstack/react-query';
import { Controller, useForm, useWatch } from 'react-hook-form';
import { useTranslations } from 'use-intl';
import { z } from 'zod';
import { api } from '../../api/client';
import { showFailure, useSchemaResolver } from '../../lib/form-schema';
import type { PanelUser } from '../UserSearch';
import { permissionCatalogue } from './EffectivePermissions';

type Effect = 'grant' | 'revoke';
/**
 * Scopes without a reference (docs/security/RBAC.md, "Data scopes and their resolution"); every
 * other scope names a program, project or location.
 */
const UNBOUND: readonly ScopeTypeName[] = ['GLOBAL', 'SELF', 'ASSIGNED'];

/**
 * A permission, a reason of three letters at least and, for a scope that names something, its
 * id; the server checks the rest. `expiresAt` holds the last day, sent as its end in Dhaka.
 */
const GRANT_SCHEMA = z
  .object({
    effect: z.enum(['grant', 'revoke']),
    permission: z.string().nullable(),
    scopeType: z.enum(SCOPE_TYPES),
    scopeRef: z.string(),
    reason: z.string(),
    expiresAt: z.string(),
  })
  .superRefine((v, ctx) => {
    if (v.permission === null)
      ctx.addIssue({ code: 'custom', path: ['permission'], message: 'validation.required' });
    if (!UNBOUND.includes(v.scopeType) && !v.scopeRef.trim())
      ctx.addIssue({ code: 'custom', path: ['scopeRef'], message: 'validation.required' });
    if (v.reason.trim().length < 3)
      ctx.addIssue({ code: 'custom', path: ['reason'], message: 'validation.too_short' });
  });
type GrantFields = z.infer<typeof GRANT_SCHEMA>;
const EMPTY: GrantFields = {
  effect: 'grant',
  permission: null,
  scopeType: 'GLOBAL',
  scopeRef: '',
  reason: '',
  expiresAt: '',
};

/**
 * Grant or remove a permission for one user at a scope, with a reason and an optional expiry
 * (POST /permission-grants). A refused change shows the server's message.
 */
export function GrantDialog({
  user,
  open,
  onClose,
  onDone,
}: {
  user: PanelUser;
  open: boolean;
  onClose: () => void;
  onDone: (effect: Effect) => void;
}) {
  const t = useTranslations('admin.permissions');
  const tc = useTranslations('common.action');
  const ts = useTranslations('common.state.error');
  const form = useForm<GrantFields>({
    resolver: useSchemaResolver(GRANT_SCHEMA),
    defaultValues: EMPTY,
    reValidateMode: 'onSubmit',
  });
  const values = useWatch({ control: form.control });
  const ready = GRANT_SCHEMA.safeParse(values).success;
  const pending = form.formState.isSubmitting;
  const error = form.formState.errors.root?.server?.message;

  const permissions = useQuery({
    queryKey: ['admin', 'permissions'],
    queryFn: permissionCatalogue,
    enabled: open,
  });

  const save = async (v: GrantFields) => {
    try {
      await api<unknown>('/permission-grants', {
        method: 'POST',
        body: {
          userId: user.id,
          permission: v.permission,
          effect: v.effect,
          scopeType: v.scopeType,
          ...(UNBOUND.includes(v.scopeType) ? {} : { scopeRef: v.scopeRef.trim() }),
          reason: v.reason.trim(),
          ...(v.expiresAt ? { expiresAt: `${v.expiresAt}T23:59:59+06:00` } : {}),
        },
      });
    } catch (failure) {
      // a detail no field shows is said above the form, beside the ones at their fields
      showFailure(form, failure, ts('text'), { everyDetail: true });
      return;
    }
    form.reset(EMPTY);
    onDone(v.effect);
  };
  const close = () => {
    form.reset(EMPTY);
    onClose();
  };

  return (
    <Dialog
      title={t('grant')}
      open={open}
      onClose={close}
      dismissible={!pending}
      actions={
        <>
          <Button variant="secondary" onClick={close} disabled={pending}>
            {tc('cancel')}
          </Button>
          <Button
            onClick={() => void form.handleSubmit(save)()}
            disabled={!ready}
            loading={pending}
          >
            {values.effect === 'revoke' ? t('dialog.submit_revoke') : t('dialog.submit_grant')}
          </Button>
        </>
      }
    >
      <Form form={form} onSubmit={save} label={t('grant')}>
        {error && <Alert tone="error">{error}</Alert>}
        <Controller
          control={form.control}
          name="effect"
          render={({ field, fieldState }) => (
            <RadioGroup
              label={t('dialog.effect')}
              orientation="horizontal"
              value={field.value}
              onChange={(id) => field.onChange(id as Effect)}
              error={fieldState.error?.message}
              options={[
                { value: 'grant', label: t('dialog.effect_grant') },
                { value: 'revoke', label: t('dialog.effect_revoke') },
              ]}
            />
          )}
        />
        <Controller
          control={form.control}
          name="permission"
          render={({ field, fieldState }) => (
            <Combobox
              label={t('dialog.permission')}
              required
              options={(permissions.data ?? []).map((p) => ({ value: p.name, label: p.name }))}
              value={field.value}
              onChange={field.onChange}
              onBlur={field.onBlur}
              error={fieldState.error?.message}
            />
          )}
        />
        <Controller
          control={form.control}
          name="scopeType"
          render={({ field, fieldState }) => (
            <SelectField
              label={t('dialog.scope')}
              required
              value={field.value}
              onChange={(id) => id && field.onChange(id as ScopeTypeName)}
              options={SCOPE_TYPES.map((s) => ({ value: s, label: t(`scope.${s}`) }))}
              searchable={false}
              error={fieldState.error?.message}
            />
          )}
        />
        {values.scopeType && !UNBOUND.includes(values.scopeType) && (
          <FormTextField
            name="scopeRef"
            label={t('dialog.scope_ref')}
            hint={t('dialog.scope_ref_hint')}
            required
          />
        )}
        <FormTextField
          name="reason"
          rows={4}
          label={t('dialog.reason')}
          hint={t('dialog.reason_hint')}
          required
          maxLength={1000}
        />
        <FormDateField
          name="expiresAt"
          label={t('dialog.expires')}
          hint={t('dialog.expires_hint')}
        />
      </Form>
    </Dialog>
  );
}
